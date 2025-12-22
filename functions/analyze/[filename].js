// functions/analyze/[filename].js
// 使用 DashScope OpenAI 兼容模式（与本地 PowerShell 测试一致）

export async function onRequestGet({ params, env, request }) {
  const { filename } = params;

  // 验证授权
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const imageUrl = `${env.R2_PUBLIC_URL}/${encodeURIComponent(filename)}`;

    // Step 1: 检查缓存描述
    let currentDesc = await env.IMAGE_CACHE.get(`desc:${filename}`);
    if (!currentDesc) {
      // ✅ 调用 DashScope OpenAI 兼容模式（与本地一致）
      const vlRes = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "qwen3-vl-flash", // ✅ 兼容模式支持此模型名
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl // 必须是公网可访问 URL
                  }
                },
                {
                  type: "text",
                  text: "请用一句话精确描述这张图片的主要内容，包括物体、人物、场景。不要解释，只输出描述。"
                }
              ]
            }
          ],
          max_tokens: 80
        })
      });

      // 处理 HTTP 错误
      if (!vlRes.ok) {
        const errText = await vlRes.text();
        console.error('DashScope API HTTP Error:', vlRes.status, errText);
        throw new Error(`AI 服务返回错误: ${vlRes.status}`);
      }

      const data = await vlRes.json();

      // ✅ 安全解析 OpenAI 格式响应
      if (!data?.choices?.[0]?.message?.content) {
        console.error('Unexpected AI response structure:', data);
        throw new Error('AI 返回数据格式异常，请检查模型或 API Key');
      }

      currentDesc = data.choices[0].message.content.trim();

      if (!currentDesc || currentDesc.length < 3) {
        throw new Error('AI 返回描述过短或为空');
      }

      // 缓存描述
      await env.IMAGE_CACHE.put(`desc:${filename}`, currentDesc);
    }

    // Step 2: 语义查重（与其他已缓存描述比对）
    const listResult = await env.IMAGE_CACHE.list({ prefix: 'desc:' });
    const semanticSimilar = [];

    for (const key of listResult.keys) {
      const otherFilename = key.name.replace(/^desc:/, '');
      if (otherFilename === filename) continue;

      const otherDesc = await env.IMAGE_CACHE.get(key.name);
      if (!otherDesc) continue;

      const sim = textSimilarity(currentDesc, otherDesc);
      if (sim > 0.65) {
        semanticSimilar.push({
          filename: otherFilename,
          similarity: sim.toFixed(2)
        });
      }
    }

    // 成功响应
    return new Response(JSON.stringify({
      currentFile: filename,
      description: currentDesc,
      result: semanticSimilar.length > 0 ? 'semantic_similar' : 'unique',
      similarImages: semanticSimilar.map(s => ({
        filename: s.filename,
        type: 'semantic',
        similarity: s.similarity
      }))
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Analyze function error:', e.message, e.stack);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ========== 辅助函数：文本相似度（Jaccard 相似系数） ==========
function textSimilarity(a, b) {
  const wordsA = new Set((a.toLowerCase().match(/\w+/g) || []));
  const wordsB = new Set((b.toLowerCase().match(/\w+/g) || []));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  return intersection / Math.max(wordsA.size, wordsB.size);
}

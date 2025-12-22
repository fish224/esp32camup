// functions/analyze/[filename].js

export async function onRequestGet({ params, env, request }) {
  const { filename } = params;

  // 验证授权
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const imageUrl = `${env.R2_PUBLIC_URL}/${encodeURIComponent(filename)}`;

    // Step 1: 检查缓存描述
    let currentDesc = await env.IMAGE_CACHE.get(`desc:${filename}`);
    if (!currentDesc) {
      // 直接调用 Qwen-VL with URL
      const vlRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "qwen3-vl-flash", // 确保使用正确的模型名称
          input: {
            messages: [{
              role: "user",
              content: [
                { image: imageUrl }, // 使用图片URL
                { text: "请用一句话精确描述这张图片的主要内容，包括物体、人物、场景。不要解释，只输出描述。" }
              ]
            }]
          },
          parameters: { max_tokens: 80 }
        })
      });

      if (!vlRes.ok) {
        const errText = await vlRes.text();
        console.error('VL API Error:', errText);
        throw new Error(`AI 分析失败: ${vlRes.status} ${errText}`);
      }

      const data = await vlRes.json();
      currentDesc = data.output.choices[0].message.content.trim(); // 根据实际返回结构调整

      if (!currentDesc) {
        throw new Error('AI 返回描述为空');
      }

      await env.IMAGE_CACHE.put(`desc:${filename}`, currentDesc);
    }

    // Step 2: 与其他图片比对（语义查重）
    const allKeys = await env.IMAGE_CACHE.list({ prefix: 'desc:' });
    const semanticSimilar = [];

    for (const key of allKeys.keys) {
      const otherFilename = key.name.replace('desc:', '');
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

    return new Response(JSON.stringify({
      currentFile: filename,
      description: currentDesc,
      result: semanticSimilar.length ? 'semantic_similar' : 'unique',
      similarImages: semanticSimilar.map(s => ({
        filename: s.filename,
        type: 'semantic',
        similarity: s.similarity
      }))
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Analyze error:', e);
    return new Response(`服务器错误: ${e.message}`, { status: 500 });
  }
}

// ========== 辅助函数 ==========

function textSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().match(/\w+/g) || []);
  const wordsB = new Set(b.toLowerCase().match(/\w+/g) || []);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }
  return intersection / Math.max(wordsA.size, wordsB.size);
}

/**
 * 图片语义查重服务（使用 DashScope qwen3-vl-flash）
 * 
 * 要求环境变量：
 * - R2_PUBLIC_URL (Plain Text): 图片公网前缀，如 https://r2.yuxinyu.dpdns.org
 * - DASHSCOPE_API_KEY (Secret): DashScope API 密钥
 * 
 * 要求绑定：
 * - KV Namespace: IMAGE_CACHE (用于缓存 AI 描述)
 */

export async function onRequest({ params, env, request }) {
  const { filename } = params;

  // === 1. 验证授权 ===
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // === 2. 构建图片 URL（从环境变量）===
    if (!env.R2_PUBLIC_URL) {
      throw new Error('Missing R2_PUBLIC_URL environment variable');
    }
    const imageUrl = `${env.R2_PUBLIC_URL}/${encodeURIComponent(filename)}`;

    // === 3. 检查缓存描述 ===
    let currentDesc = await env.IMAGE_CACHE?.get(`desc:${filename}`);
    if (!currentDesc) {
      // === 4. 调用 DashScope AI（OpenAI 兼容模式）===
      if (!env.DASHSCOPE_API_KEY) {
        throw new Error('Missing DASHSCOPE_API_KEY secret');
      }

      const aiResponse = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen3-vl-flash',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: imageUrl }
                },
                {
                  type: 'text',
                  text: '请用一句话精确描述这张图片的主要内容，包括物体、人物、场景。不要解释，只输出描述。'
                }
              ]
            }
          ],
          max_tokens: 80
        })
      });

      // === 5. 处理 AI 响应 ===
      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('DashScope API Error:', aiResponse.status, errorText);
        throw new Error(`AI 服务返回错误: ${aiResponse.status}`);
      }

      const data = await aiResponse.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        console.error('Invalid AI response:', data);
        throw new Error('AI 返回格式异常');
      }

      currentDesc = content.trim();
      if (currentDesc.length < 5) {
        throw new Error('AI 返回描述过短');
      }

      // === 6. 缓存结果（持久化到 KV）===
      await env.IMAGE_CACHE?.put(`desc:${filename}`, currentDesc);
    }

    // === 7. 语义查重（与其他缓存项比对）===
    const listResult = await env.IMAGE_CACHE?.list({ prefix: 'desc:' }) ?? { keys: [] };
    const semanticSimilar = [];

    for (const key of listResult.keys) {
      const otherFilename = key.name.replace(/^desc:/, '');
      if (otherFilename === filename) continue;

      const otherDesc = await env.IMAGE_CACHE?.get(key.name);
      if (!otherDesc) continue;

      const similarity = textSimilarity(currentDesc, otherDesc);
      if (similarity > 0.65) {
        semanticSimilar.push({
          filename: otherFilename,
          similarity: similarity.toFixed(2)
        });
      }
    }

    // === 8. 返回成功响应 ===
    return new Response(JSON.stringify({
      currentFile: filename,
      description: currentDesc,
      result: semanticSimilar.length > 0 ? 'semantic_similar' : 'unique',
      similarImages: semanticSimilar
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Function execution error:', e.message, e.stack);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ========== 辅助函数：文本相似度（Jaccard 系数）==========
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

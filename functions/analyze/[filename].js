// functions/analyze/[filename].js

export async function onRequestGet({ params, env, request }) {
  const { filename } = params;
  
  // 验证登录（复用原有逻辑）
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }
  const token = authHeader.substring(7);
  // TODO: 验证 token（此处简化，实际应校验 JWT 或 KV 中的会话）

  try {
    // 1. 从 R2 获取图片公开 URL
    const imageUrl = `${env.R2_PUBLIC_URL}/${encodeURIComponent(filename)}`;

    // 2. 调用 Qwen-VL-Flash API
    const dashRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "qwen-vl-flash",
        input: {
          messages: [{
            role: "user",
            content: [
              { image: imageUrl },
              { text: "请用一句话精确描述这张图片的主要内容，包括物体、人物、场景。不要解释，只输出描述。" }
            ]
          }]
        },
        parameters: {
          max_tokens: 100
        }
      })
    });

    if (!dashRes.ok) {
      const err = await dashRes.text();
      console.error('DashScope error:', err);
      return new Response(`AI 分析失败: ${err}`, { status: 500 });
    }

    const dashData = await dashRes.json();
    const description = dashData.output.text.trim();

    // 3. 保存到 KV
    await env.IMAGE_HASHES.put(`desc:${filename}`, description);

    // 4. 查找相似图片（简单文本相似度）
    const allKeys = await env.IMAGE_HASHES.list({ prefix: 'desc:' });
    const similar = [];

    for (const key of allKeys.keys) {
      const otherFilename = key.name.replace('desc:', '');
      if (otherFilename === filename) continue;

      const otherDesc = await env.IMAGE_HASHES.get(key.name);
      const similarity = computeSimilarity(description, otherDesc);
      
      if (similarity > 0.7) { // 相似度阈值
        similar.push({ filename: otherFilename, similarity: similarity.toFixed(2) });
      }
    }

    return new Response(JSON.stringify({
      currentFile: filename,
      description,
      similarImages: similar
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Analyze error:', e);
    return new Response(`服务器错误: ${e.message}`, { status: 500 });
  }
}

// 简单文本相似度（基于关键词交集）
function computeSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().match(/\w+/g) || []);
  const wordsB = new Set(b.toLowerCase().match(/\w+/g) || []);
  
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }
  
  return intersection / Math.max(wordsA.size, wordsB.size);
}

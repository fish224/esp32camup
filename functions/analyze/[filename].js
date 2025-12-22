// functions/analyze/[filename].js
export async function onRequest({ params, env, request }) {
  const { filename } = params;

  // 验证 Token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });
  }
  const token = authHeader.split(' ')[1];
  const isValid = await env.AUTH_TOKENS.get(token);
  if (!isValid) {
    return new Response(JSON.stringify({ error: '无效或过期的 Token' }), { status: 401 });
  }

  // 文本相似度计算函数（新增）
  function textSimilarity(text1, text2) {
  // 简单分词（可根据需求替换为更复杂的分词逻辑）
  const getTerms = (text) => text.toLowerCase().match(/\b\w+\b/g) || [];
  
  const terms1 = getTerms(text1);
  const terms2 = getTerms(text2);
  
  // 构建词袋
  const allTerms = [...new Set([...terms1, ...terms2])];
  
  // 生成向量
  const vector1 = allTerms.map(term => terms1.includes(term) ? 1 : 0);
  const vector2 = allTerms.map(term => terms2.includes(term) ? 1 : 0);
  
  // 计算余弦相似度
  const dotProduct = vector1.reduce((sum, v1, i) => sum + v1 * vector2[i], 0);
  const magnitude1 = Math.sqrt(vector1.reduce((sum, v) => sum + v * v, 0));
  const magnitude2 = Math.sqrt(vector2.reduce((sum, v) => sum + v * v, 0));
  
  return magnitude1 && magnitude2 ? dotProduct / (magnitude1 * magnitude2) : 0;
}

  try {
    // 构建完整图片 URL
    const imageUrl = `https://r2.yuxinyu.dpdns.org/${filename}`;

    // 检查缓存
    let currentDesc = await env.IMAGE_CACHE?.get(`desc:${filename}`);
    if (!currentDesc) {
      // 调用 DashScope AI
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

      // 缓存结果（有效期1天）
      await env.IMAGE_CACHE?.put(`desc:${filename}`, currentDesc, { expirationTtl: 86400 });
    }

    // 语义查重（与其他缓存项比对）
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

    // 按相似度排序
    semanticSimilar.sort((a, b) => b.similarity - a.similarity);

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

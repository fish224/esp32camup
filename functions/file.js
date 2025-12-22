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
  function textSimilarity(str1, str2) {
    const set1 = new Set(str1.split(/\s+/).filter(word => word.length > 1));
    const set2 = new Set(str2.split(/\s+/).filter(word => word.length > 1));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  try {
    // 构建完整图片 URL 并验证
    const imageUrl = `https://r2.yuxinyu.dpdns.org/${filename}`;
    
    // 验证图片 URL 有效性（新增）
    try {
      const imageCheck = await fetch(imageUrl, { method: 'HEAD', timeout: 5000 });
      if (!imageCheck.ok) {
        throw new Error(`图片无法访问，状态码: ${imageCheck.status}`);
      }
    } catch (e) {
      throw new Error(`图片URL无效: ${e.message}`);
    }

    // 检查缓存
    let currentDesc = await env.IMAGE_CACHE?.get(`desc:${filename}`);
    if (!currentDesc) {
      // 调用 DashScope AI
      if (!env.DASHSCOPE_API_KEY) {
        throw new Error('Missing DASHSCOPE_API_KEY secret');
      }

      // 提取文件格式用于API参数（新增）
      const fileExt = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const supportedFormats = ['jpg', 'jpeg', 'png', 'webp'];
      const format = supportedFormats.includes(fileExt) ? fileExt : 'jpg';

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
                  image_url: { 
                    url: imageUrl,
                    format: format  // 明确指定图片格式（新增）
                  }
                },
                {
                  type: 'text',
                  text: '请用一句话精确描述这张图片的主要内容，包括物体、人物、场景。不要解释，只输出描述。'
                }
              ]
            }
          ],
          max_tokens: 80,
          response_format: { type: 'text' }  // 明确响应格式（新增）
        })
      });

      // 增强错误处理（新增详细错误信息）
      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('DashScope API 错误详情:', errorText);
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(`AI服务错误: ${errorJson.error?.message || `状态码 ${aiResponse.status}`}`);
        } catch {
          throw new Error(`AI服务返回错误: ${aiResponse.status}，详情: ${errorText.substring(0, 100)}`);
        }
      }

      const data = await aiResponse.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        console.error('无效的AI响应:', data);
        throw new Error('AI返回格式异常，未找到有效内容');
      }

      currentDesc = content.trim();
      if (currentDesc.length < 5) {
        throw new Error('AI返回描述过短，可能无法准确识别图片');
      }

      // 缓存结果
      await env.IMAGE_CACHE?.put(`desc:${filename}`, currentDesc);
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

    return new Response(JSON.stringify({
      currentFile: filename,
      description: currentDesc,
      result: semanticSimilar.length > 0 ? 'semantic_similar' : 'unique',
      similarImages: semanticSimilar
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('函数执行错误:', e.message, e.stack);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

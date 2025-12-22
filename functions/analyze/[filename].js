// functions/analyze/[filename].js
// 环境变量 & 常量
const R2_PUBLIC_URL = env.R2_PUBLIC_URL; // 与前端一致
const DASHSCOPE_API_KEY = env.DASHSCOPE_API_KEY; // Cloudflare 配置的环境变量

// 文本相似度计算（补充缺失的核心函数）
function textSimilarity(text1, text2) {
  // 简单且轻量的余弦相似度实现（无需依赖库）
  const getWords = (text) => text.toLowerCase().split(/\W+/).filter(w => w);
  const getVector = (text, vocab) => vocab.map(word => text.includes(word) ? 1 : 0);
  
  const words1 = getWords(text1);
  const words2 = getWords(text2);
  const vocab = [...new Set([...words1, ...words2])];
  
  const vec1 = getVector(text1, vocab);
  const vec2 = getVector(text2, vocab);
  
  const dot = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
  
  return mag1 && mag2 ? dot / (mag1 * mag2) : 0;
}

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const filename = params.filename;
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');

  // 1. 验证登录 Token（复用原有鉴权逻辑）
  if (!token || token !== localStorage.getItem('authToken')) { // 保持原有鉴权逻辑
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. 调用阿里通义千问 VL 模型（修复 500 错误核心）
  async function getImageDescription(imageUrl) {
    if (!DASHSCOPE_API_KEY) {
      throw new Error('未配置 DASHSCOPE_API_KEY 环境变量');
    }

    // 对齐本地 PowerShell 的请求体格式（OpenAI 兼容模式）
    const requestBody = {
      model: "qwen3-vl-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl } // 关键：嵌套格式与本地一致
            },
            {
              type: "text",
              text: "请用一句话描述这张图片的主要内容。"
            }
          ]
        }
      ]
    };

    try {
      // 修复：使用兼容模式端点 + Bearer 鉴权
      const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${DASHSCOPE_API_KEY}` // 关键：兼容模式必须用 Bearer
        },
        body: JSON.stringify(requestBody),
        redirect: "follow"
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`VL 模型调用失败 [${response.status}]: ${errText}`);
      }

      const result = await response.json();
      const description = result.choices?.[0]?.message?.content?.trim();
      
      if (!description) {
        throw new Error('未获取到图片描述');
      }
      return description;
    } catch (e) {
      console.error('VL 模型调用错误:', e);
      throw new Error(`图片分析失败：${e.message}`);
    }
  }

  // 3. 原有查重逻辑（完全保留）
  try {
    // 获取当前图片的完整 URL
    const currentImageUrl = `${R2_PUBLIC_URL}/${encodeURIComponent(filename)}`;
    // 调用 VL 模型获取描述
    const currentDesc = await getImageDescription(currentImageUrl);

    // 读取 R2 中所有图片（原有逻辑）
    const list = await env.ESP32_CAM_BUCKET.list();
    const files = list.objects.map(obj => obj.key).filter(key => key !== filename);

    // 语义相似度对比（原有逻辑）
    const similarImages = [];
    for (const file of files) {
      const fileUrl = `${R2_PUBLIC_URL}/${encodeURIComponent(file)}`;
      const otherDesc = await getImageDescription(fileUrl);
      const similarity = textSimilarity(currentDesc, otherDesc);
      
      if (similarity > 0.7) { // 相似度阈值
        similarImages.push({ filename: file, similarity: similarity.toFixed(2) });
      }
    }

    // 返回结果（原有显示逻辑不变）
    return new Response(JSON.stringify({
      description: currentDesc,
      result: similarImages.length > 0 ? 'semantic_similar' : 'unique',
      similarImages: similarImages
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// functions/analyze/[filename].js

export async function onRequestGet({ params, env, request }) {
  const { filename } = params;
  
  // 验证授权（简化版）
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const imageUrl = `${env.R2_PUBLIC_URL}/${encodeURIComponent(filename)}`;
    
    // === 步骤1: 获取或计算 pHash ===
    let currentPHash = await env.IMAGE_CACHE.get(`phash:${filename}`);
    if (!currentPHash) {
      currentPHash = await computePHashFromUrl(imageUrl);
      await env.IMAGE_CACHE.put(`phash:${filename}`, currentPHash);
    }

    // === 步骤2: pHash 初筛（汉明距离 ≤5 视为重复）===
    const allKeys = await env.IMAGE_CACHE.list({ prefix: 'phash:' });
    const exactDuplicates = [];
    const candidatesForAI = []; // 需要 AI 精筛的候选

    for (const key of allKeys.keys) {
      const otherFilename = key.name.replace('phash:', '');
      if (otherFilename === filename) continue;

      const otherPHash = await env.IMAGE_CACHE.get(key.name);
      const distance = hammingDistance(currentPHash, otherPHash);
      
      if (distance <= 5) {
        exactDuplicates.push(otherFilename);
      } else {
        candidatesForAI.push(otherFilename);
      }
    }

    if (exactDuplicates.length > 0) {
      return new Response(JSON.stringify({
        currentFile: filename,
        result: 'exact_duplicate',
        similarImages: exactDuplicates.map(f => ({ filename: f, type: 'exact' }))
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // === 步骤3: 获取当前图的 VL 描述（缓存 or 调用 AI）===
    let currentDesc = await env.IMAGE_CACHE.get(`desc:${filename}`);
    if (!currentDesc) {
      currentDesc = await callQwenVLFlash(imageUrl, env.DASHSCOPE_API_KEY);
      await env.IMAGE_CACHE.put(`desc:${filename}`, currentDesc);
    }

    // === 步骤4: 与候选图进行文本相似度比对 ===
    const semanticSimilar = [];
    for (const otherFilename of candidatesForAI) {
      const otherDesc = await env.IMAGE_CACHE.get(`desc:${otherFilename}`);
      if (!otherDesc) continue;

      const sim = textSimilarity(currentDesc, otherDesc);
      if (sim > 0.65) { // 阈值可调
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

// 1. 从 URL 计算 pHash（简化版，基于平均哈希）
async function computePHashFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch image');
  
  const blob = await res.blob();
  const img = await createImageBitmap(blob);
  
  // 缩放到 32x32
  const canvas = new OffscreenCanvas(32, 32);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, 32, 32);
  
  const imageData = ctx.getImageData(0, 0, 32, 32);
  const data = imageData.data;
  
  // 转灰度 + 计算平均值
  const gray = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    gray.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  
  const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
  
  // 生成 256-bit 哈希（简化为 64-char hex）
  let hash = '';
  for (let i = 0; i < gray.length; i++) {
    hash += gray[i] > avg ? '1' : '0';
  }
  
  // 转为 hex（每4位一组）
  let hex = '';
  for (let i = 0; i < hash.length; i += 4) {
    hex += parseInt(hash.slice(i, i+4), 2).toString(16);
  }
  return hex.padStart(64, '0');
}

// 2. 汉明距离
function hammingDistance(hash1, hash2) {
  if (hash1.length !== hash2.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) dist++;
  }
  return dist;
}

// 3. 调用 Qwen-VL-Flash
async function callQwenVLFlash(imageUrl, apiKey) {
  const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
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
      parameters: { max_tokens: 80 }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DashScope error: ${err}`);
  }

  const data = await res.json();
  return data.output.text.trim();
}

// 4. 文本相似度（基于关键词交集）
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

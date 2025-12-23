// functions/pHash/[filename].js
export async function onRequest({ params, env, request }) {
  try {
    // 1. 验证Token（保留权限校验）
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token || !(await env.AUTH_TOKENS.get(token))) {
      return new Response(JSON.stringify({ error: '未授权访问' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. 获取前端传递的原始图片URL（优先）或通过文件名拼接
    const urlParams = new URL(request.url).searchParams;
    const originalImgUrl = urlParams.get('imgUrl'); // 前端传递的原始URL
    const { filename } = params;
    const R2_PUBLIC_URL = 'https://r2.yuxinyu.dpdns.org';
    const imgUrl = originalImgUrl || `${R2_PUBLIC_URL}/${encodeURIComponent(filename)}`;

    // 3. 加载原始图片（Cloudflare Workers无跨域限制）
    const res = await fetch(imgUrl);
    if (!res.ok) {
      return new Response(JSON.stringify({ 
        error: `原始图片加载失败: ${res.status}`,
        imgUrl: imgUrl
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. 转换为ImageBitmap并计算pHash
    const imageBuffer = await res.arrayBuffer();
    const imageBitmap = await createImageBitmap(new Blob([imageBuffer]));
    
    const canvas = new OffscreenCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0, 8, 8);
    const pixelData = ctx.getImageData(0, 0, 8, 8).data;

    // 转灰度图
    const grayscale = [];
    for (let i = 0; i < pixelData.length; i += 4) {
      const gray = 0.299 * pixelData[i] + 0.587 * pixelData[i+1] + 0.114 * pixelData[i+2];
      grayscale.push(gray);
    }

    // 计算灰度平均值
    const avgGray = grayscale.reduce((a, b) => a + b) / grayscale.length;

    // 生成64位pHash
    let pHash = '';
    grayscale.forEach(gray => {
      pHash += gray >= avgGray ? '1' : '0';
    });

    // 5. 返回结果（包含原始URL便于调试）
    return new Response(JSON.stringify({
      filename: filename,
      imgUrl: imgUrl,
      pHash: pHash
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // 解决跨域
        'Access-Control-Allow-Headers': 'Authorization'
      }
    });

  } catch (e) {
    console.error('pHash计算失败:', e);
    return new Response(JSON.stringify({ 
      error: e.message,
      stack: e.stack // 调试用
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

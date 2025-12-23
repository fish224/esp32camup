// functions/pHash/[filename].js
export async function onRequest({ params, env, request }) {
  const { filename } = params;
  const R2_PUBLIC_URL = 'https://r2.yuxinyu.dpdns.org';
  const imgUrl = `${R2_PUBLIC_URL}/${encodeURIComponent(filename)}`;

  try {
    // 1. 从 R2 加载图片（Cloudflare Workers 内置 fetch 无跨域限制）
    const res = await fetch(imgUrl);
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `图片加载失败: ${res.status}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. 将图片转换为 ImageData（依赖 Cloudflare Workers 的 ImageBitmap 支持）
    const imageBuffer = await res.arrayBuffer();
    const imageBitmap = await createImageBitmap(new Blob([imageBuffer]));
    
    // 3. 缩小图片到 8x8
    const canvas = new OffscreenCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0, 8, 8);
    const pixelData = ctx.getImageData(0, 0, 8, 8).data;

    // 4. 转灰度图
    const grayscale = [];
    for (let i = 0; i < pixelData.length; i += 4) {
      const gray = 0.299 * pixelData[i] + 0.587 * pixelData[i+1] + 0.114 * pixelData[i+2];
      grayscale.push(gray);
    }

    // 5. 计算灰度平均值
    const avgGray = grayscale.reduce((a, b) => a + b) / grayscale.length;

    // 6. 生成 64 位 pHash 二进制字符串
    let pHash = '';
    grayscale.forEach(gray => {
      pHash += gray >= avgGray ? '1' : '0';
    });

    // 返回结果
    return new Response(JSON.stringify({
      filename: filename,
      pHash: pHash
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('pHash 计算失败:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

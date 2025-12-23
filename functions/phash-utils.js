// functions/phash-utils.js
export async function computePHash(imageBitmap) {
  // 1. 缩小到32x32
  const canvas = new OffscreenCanvas(32, 32);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0, 32, 32);
  
  // 2. 转为灰度图
  const { data } = ctx.getImageData(0, 0, 32, 32);
  const grayPixels = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    grayPixels.push(Math.floor(0.299 * r + 0.587 * g + 0.114 * b));
  }
  
  // 3. 计算DCT并提取8x8区域
  const dctResult = dct2d(grayPixels, 32, 32);
  const reduced = [];
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      reduced.push(dctResult[i * 32 + j]);
    }
  }
  
  // 4. 计算哈希值
  const avg = reduced.reduce((sum, val) => sum + val, 0) / 64;
  let hash = 0;
  for (let i = 0; i < 64; i++) {
    hash |= (reduced[i] > avg ? 1 : 0) << (63 - i);
  }
  
  return hash.toString(16).padStart(16, '0');
}

// 简化的2D DCT实现（适配现有JS环境）
function dct2d(data, width, height) {
  const result = new Array(width * height).fill(0);
  for (let u = 0; u < height; u++) {
    for (let v = 0; v < width; v++) {
      let sum = 0;
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
          const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
          const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
          sum += cu * cv * data[i * width + j]
            * Math.cos((2 * i + 1) * u * Math.PI / (2 * height))
            * Math.cos((2 * j + 1) * v * Math.PI / (2 * width));
        }
      }
      result[u * width + v] = sum * (2 / Math.sqrt(width * height));
    }
  }
  return result;
}

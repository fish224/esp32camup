// functions/pHash/[filename].js
import { computePHash } from '../phash-utils.js';

export async function onRequest({ params, env, request }) {
  const { filename } = params;

  // 复用现有认证逻辑（与analyze接口一致）
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });
  }
  const token = authHeader.split(' ')[1];
  const isValid = await env.AUTH_TOKENS.get(token);
  if (!isValid) {
    return new Response(JSON.stringify({ error: '无效或过期的Token' }), { status: 401 });
  }

  try {
    // 验证图片URL有效性（复用analyze的URL格式和校验）
    const imageUrl = `https://r2.yuxinyu.dpdns.org/${filename}`;
    const imageCheck = await fetch(imageUrl, { method: 'HEAD', timeout: 5000 });
    if (!imageCheck.ok) {
      throw new Error(`图片无法访问，状态码: ${imageCheck.status}`);
    }

    // 检查缓存（复用IMAGE_CACHE，与描述缓存统一）
    let pHash = await env.IMAGE_CACHE?.get(`phash:${filename}`);
    if (!pHash) {
      // 加载图片并计算pHash
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);
      pHash = await computePHash(imageBitmap);
      
      // 缓存结果（与描述缓存策略一致）
      await env.IMAGE_CACHE?.put(`phash:${filename}`, pHash);
    }

    return new Response(JSON.stringify({
      filename,
      pHash,
      cached: !!pHash // 标识是否来自缓存
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('pHash计算错误:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// functions/file.js
export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const name = url.pathname.replace(/^\/file\//, '');

    if (!name) {
      return new Response('文件名不能为空', { status: 400 });
    }

    const bucket = context.env.MY_R2_BUCKET;
    const object = await bucket.get(name);

    if (!object) {
      return new Response('文件不存在', { status: 404 });
    }

    // 获取 MIME 类型
    const contentType = getContentType(name) || 'application/octet-stream';

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=3600');
    headers.set('Access-Control-Allow-Origin', '*');

    // 直接返回原图（不再处理缩略图）
    return new Response(object.body, { headers, status: 200 });

  } catch (error) {
    console.error('File fetch error:', error);
    return new Response('获取文件失败', { status: 500 });
  }
}

function getContentType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeMap = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp'
  };
  return mimeMap[ext] || null;
}

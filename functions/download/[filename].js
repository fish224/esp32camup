// functions/download/[filename].js
export async function onRequestGet(context) {
  const { request, env, params } = context;
  const { filename } = params;

  // 验证 Token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }
  const token = authHeader.split(' ')[1];
  const isValid = await env.AUTH_TOKENS.get(token);
  if (!isValid) {
    return new Response('Invalid or expired token', { status: 401 });
  }

  // 安全校验
  let fileKey;
  try {
    fileKey = decodeURIComponent(filename);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  if (fileKey.includes('..') || fileKey.includes('/') || fileKey.includes('\\')) {
    return new Response('Forbidden', { status: 403 });
  }

  const bucket = env.MY_R2_BUCKET;
  const object = await bucket.get(fileKey);

  if (!object) {
    return new Response('File not found', { status: 404 });
  }

  const contentType = getContentType(fileKey) || 'application/octet-stream';
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Disposition', `attachment; filename="${fileKey}"`);
  headers.set('Cache-Control', 'private');

  return new Response(object.body, { headers });
}

function getContentType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp'
  };
  return map[ext] || null;
}

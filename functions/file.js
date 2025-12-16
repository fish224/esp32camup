export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const fileName = decodeURIComponent(url.pathname.split('/api/file/')[1](@ref);
  
  // 检查身份验证
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const validToken = await env.AUTH_TOKENS.get('admin');
    if (token !== validToken) {
      return new Response('未授权访问', { status: 401 });
    }
  }
  
  // 获取文件
  const object = await env.ESP32CAM_BUCKET.get(fileName);
  if (!object) {
    return new Response('文件不存在', { status: 404 });
  }
  
  // 设置响应头
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  
  // 根据文件类型设置缓存策略
  if (fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp|mp4|avi|mov|webm|mkv)$/i)) {
    // 媒体文件缓存更长时间
    headers.set('Cache-Control', 'public, max-age=86400'); // 24小时
  } else {
    headers.set('Cache-Control', 'public, max-age=3600'); // 1小时
  }
  
  return new Response(object.body, { headers });
}

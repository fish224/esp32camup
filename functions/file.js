// functions/file.js
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  try {
    // 从URL中提取文件名
    const filename = decodeURIComponent(url.pathname.split('/file/')[1](@ref);
    
    if (!filename) {
      return new Response(JSON.stringify({
        success: false,
        error: '文件名不能为空'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 验证认证令牌
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false,
        error: '未授权，请提供有效的认证令牌'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.split(' ')[1];
    const validToken = env.AUTH_TOKEN || '888';
    
    if (token !== validToken) {
      return new Response(JSON.stringify({
        success: false,
        error: '无效的认证令牌'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 检查是否是缩略图请求
    const isThumbnail = url.searchParams.get('thumb') === 'true';
    
    // 从R2获取文件
    const object = await env.MY_R2_BUCKET.get(filename);
    
    if (!object) {
      return new Response(JSON.stringify({
        success: false,
        error: '文件不存在'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 设置响应头
    const headers = new Headers();
    
    // 根据文件类型设置Content-Type
    const contentType = object.httpMetadata?.contentType || getContentType(filename);
    headers.set('Content-Type', contentType);
    
    // 如果是下载请求，设置Content-Disposition
    if (url.searchParams.get('download') === 'true') {
      headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    }
    
    // 设置缓存头
    headers.set('Cache-Control', 'public, max-age=3600');
    
    // 如果是缩略图请求，可能需要调整
    if (isThumbnail) {
      // 这里可以添加缩略图处理逻辑
      // 例如：调整图片大小等
    }
    
    return new Response(object.body, {
      headers: headers,
      status: 200
    });
    
  } catch (error) {
    console.error('获取文件失败:', error);
    return new Response(JSON.stringify({
      success: false,
      error: '获取文件失败',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 辅助函数：根据文件名获取Content-Type
function getContentType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

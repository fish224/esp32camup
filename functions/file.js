// functions/file.js
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  try {
    // 从URL中提取文件名
    const filename = decodeURIComponent(url.pathname.split('/file/')[1]);
    
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
    const contentType = object.httpMetadata?.contentType || getContentType(filename);
    headers.set('Content-Type', contentType);
    
    // 处理下载请求
    if (url.searchParams.get('download') === 'true') {
      headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    }
    
    // 处理缩略图请求（仅对图片文件生效）
    if (isThumbnail) {
    // 仅处理图片类型文件
    if (!contentType.startsWith('image/')) {
        return new Response(JSON.stringify({
            success: false,
            error: '仅支持图片生成缩略图'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        // 读取原始图像数据
        const imageBuffer = await object.arrayBuffer();
        const image = new Image();
        await image.decode(imageBuffer); // 解码图像

        // 计算缩略图尺寸（保持宽高比，最大边为200px）
        const maxDim = 200;
        let width = image.width;
        let height = image.height;

        if (width > height) {
            if (width > maxDim) {
                height = (height * maxDim) / width;
                width = maxDim;
            }
        } else {
            if (height > maxDim) {
                width = (width * maxDim) / height;
                height = maxDim;
            }
        }

        // 绘制缩略图到画布
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);

        // 转换为WebP格式（体积更小）
        const thumbBlob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
        const thumbArrayBuffer = await thumbBlob.arrayBuffer();

        // 更新响应头
        headers.set('Content-Type', 'image/webp');
        headers.set('Cache-Control', 'public, max-age=86400'); // 缓存1天
        headers.set('X-Thumbnail-Generated', 'true');

        return new Response(thumbArrayBuffer, { headers, status: 200 });
    } catch (e) {
        console.error('生成缩略图失败:', e);
        // 失败时返回原图
        headers.set('Cache-Control', 'public, max-age=3600');
        return new Response(object.body, { headers, status: 200 });
    }
}
    
    // 非缩略图请求直接返回原文件
    headers.set('Cache-Control', 'public, max-age=3600');
    return new Response(object.body, { headers, status: 200 });
    
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

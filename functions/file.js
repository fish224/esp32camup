// 引入Cloudflare图片处理模块
import { ImageResizer } from '@cloudflare/images';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  try {
    // 提取文件名
    const filename = decodeURIComponent(url.pathname.split('/file/')[1]);
    if (!filename) {
      return new Response(JSON.stringify({ success: false, error: '文件名不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 验证认证令牌
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: '未授权' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.split(' ')[1];
    const validToken = env.AUTH_TOKEN || '888';
    if (token !== validToken) {
      return new Response(JSON.stringify({ success: false, error: '无效令牌' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 检查是否为缩略图请求
    const isThumbnail = url.searchParams.get('thumb') === 'true';
    const object = await env.MY_R2_BUCKET.get(filename);
    if (!object) {
      return new Response(JSON.stringify({ success: false, error: '文件不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 设置响应头（包含CORS配置）
    const headers = new Headers();
    const contentType = object.httpMetadata?.contentType || getContentType(filename);
    headers.set('Content-Type', contentType);
    headers.set('Access-Control-Allow-Origin', 'https://esp32camup.pages.dev'); // 固定CORS域名
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    // 处理下载请求
    if (url.searchParams.get('download') === 'true') {
      headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    }
    
    // 缩略图处理逻辑（仅对图片生效）
    if (isThumbnail && contentType.startsWith('image/')) {
      try {
        // 读取原始图片数据
        const arrayBuffer = await object.arrayBuffer();
        const resizer = new ImageResizer(arrayBuffer);
        
        // 生成400×300缩略图（保持比例裁剪）
        const thumbnailBuffer = await resizer.resize({
          width: 400,
          height: 300,
          fit: 'cover', // 按比例裁剪至目标尺寸
          format: 'jpeg', // 统一输出为JPEG
          quality: 80 // 压缩质量
        });
        
        // 更新缩略图响应头
        headers.set('Content-Type', 'image/jpeg');
        headers.set('Cache-Control', 'public, max-age=86400'); // 缓存1天
        return new Response(thumbnailBuffer, { headers, status: 200 });
      } catch (error) {
        console.error('缩略图生成失败:', error);
        // 失败时返回原始图片
        return new Response(object.body, { headers, status: 200 });
      }
    }
    
    // 非缩略图请求直接返回原始文件
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
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://esp32camup.pages.dev'
      }
    });
  }
}

// 保持原有的getContentType函数不变
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

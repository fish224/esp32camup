export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // 检查身份验证
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未授权访问' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const token = authHeader.split(' ')[1];
  const validToken = await env.AUTH_TOKENS.get('admin');
  if (token !== validToken) {
    return new Response(JSON.stringify({ error: '无效的访问令牌' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 处理缩略图请求
  if (url.pathname.startsWith('/api/thumbnail/')) {
    return handleThumbnailRequest(context);
  }
  
  // 处理文件列表请求
  return handleFileListRequest(context);
}

async function handleThumbnailRequest({ request, env }) {
  const url = new URL(request.url);
  const fileName = decodeURIComponent(url.pathname.split('/api/thumbnail/')[1](@ref);
  const size = url.searchParams.get('size') || '300';
  
  // 尝试从缓存获取缩略图
  const cacheKey = `thumbnail:${fileName}:${size}`;
  const cached = await env.THUMBNAIL_CACHE.get(cacheKey);
  
  if (cached) {
    return new Response(cached, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400' // 缓存24小时
      }
    });
  }
  
  // 获取原始图片
  const object = await env.ESP32CAM_BUCKET.get(fileName);
  if (!object) {
    return new Response('文件不存在', { status: 404 });
  }
  
  // 检查是否为图片文件
  if (!fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
    return new Response('不支持的文件类型', { status: 400 });
  }
  
  // 使用 Cloudflare Images 或简单缩放生成缩略图
  // 这里使用简单的缩放方法（实际生产环境建议使用 Cloudflare Images 服务）
  const imageData = await object.arrayBuffer();
  const resizedImage = await resizeImage(imageData, parseInt(size));
  
  // 缓存缩略图（免费版 KV 有读写限制，注意控制）
  await env.THUMBNAIL_CACHE.put(cacheKey, resizedImage, {
    expirationTtl: 86400 // 24小时过期
  });
  
  return new Response(resizedImage, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}

async function handleFileListRequest({ request, env }) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = parseInt(url.searchParams.get('limit')) || 20;
  const fileType = url.searchParams.get('type') || 'all';
  const sortBy = url.searchParams.get('sort') || 'newest';
  const searchTerm = url.searchParams.get('search') || '';
  
  // 获取文件列表
  const list = await env.ESP32CAM_BUCKET.list({
    limit: 1000 // 最多获取1000个文件，对于分页足够
  });
  
  // 过滤文件
  let files = list.objects.filter(obj => {
    // 过滤文件类型
    if (fileType === 'image') {
      return obj.key.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i);
    } else if (fileType === 'video') {
      return obj.key.match(/\.(mp4|avi|mov|webm|mkv)$/i);
    }
    return true;
  });
  
  // 搜索过滤
  if (searchTerm) {
    files = files.filter(obj => 
      obj.key.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }
  
  // 排序
  files.sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.uploaded || b.lastModified) - new Date(a.uploaded || a.lastModified);
      case 'oldest':
        return new Date(a.uploaded || a.lastModified) - new Date(b.uploaded || b.lastModified);
      case 'name':
        return a.key.localeCompare(b.key);
      case 'size':
        return b.size - a.size;
      default:
        return 0;
    }
  });
  
  // 分页
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedFiles = files.slice(startIndex, endIndex);
  
  // 格式化文件信息
  const formattedFiles = paginatedFiles.map(obj => ({
    name: obj.key,
    size: obj.size,
    uploaded: obj.uploaded || obj.lastModified,
    type: getFileType(obj.key)
  }));
  
  return new Response(JSON.stringify({
    files: formattedFiles,
    total: files.length,
    page: page,
    totalPages: Math.ceil(files.length / limit),
    pageSize: limit
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60' // 缓存1分钟
    }
  });
}

function getFileType(filename) {
  if (filename.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) return 'image';
  if (filename.match(/\.(mp4|avi|mov|webm|mkv)$/i)) return 'video';
  return 'other';
}

// 简单的图片缩放函数（使用 Canvas API）
async function resizeImage(imageBuffer, maxSize) {
  // 这里使用简单的缩放方法
  // 实际生产环境建议使用 Cloudflare Images 服务或 sharp 库
  // 由于 Cloudflare Workers 环境限制，这里返回原始图片
  return imageBuffer;
}

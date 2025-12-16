// functions/browse.js
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  try {
    // 获取查询参数
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const fileType = url.searchParams.get('type') || 'all';
    const sortBy = url.searchParams.get('sort') || 'newest';
    const searchTerm = url.searchParams.get('search') || '';
    
    // 验证认证令牌
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: '未授权' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.split(' ')[1];
    const validToken = env.AUTH_TOKEN || '888'; // 使用环境变量或默认值
    
    if (token !== validToken) {
      return new Response(JSON.stringify({ error: '无效的认证令牌' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 从 R2 存储桶获取文件列表
    const listOptions = {
      limit: limit,
      prefix: searchTerm || undefined,
    };
    
    const listed = await env.MY_R2_BUCKET.list(listOptions);
    
    // 过滤和排序文件
    let files = listed.objects.map(obj => ({
      name: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
      etag: obj.etag,
      httpMetadata: obj.httpMetadata
    }));
    
    // 按文件类型过滤
    if (fileType !== 'all') {
      files = files.filter(file => {
        if (fileType === 'image') {
          return file.name.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i);
        } else if (fileType === 'video') {
          return file.name.match(/\.(mp4|avi|mov|webm|mkv)$/i);
        }
        return true;
      });
    }
    
    // 排序
    files.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.uploaded) - new Date(b.uploaded);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return a.size - b.size;
        case 'newest':
        default:
          return new Date(b.uploaded) - new Date(a.uploaded);
      }
    });
    
    // 分页
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedFiles = files.slice(startIndex, endIndex);
    
    return new Response(JSON.stringify({
      success: true,
      files: paginatedFiles,
      total: files.length,
      page: page,
      totalPages: Math.ceil(files.length / limit),
      pageSize: limit
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: '获取文件列表失败',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

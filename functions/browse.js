// functions/browse.js
export async function onRequestGet(context) {
  try {
    // 认证校验
    const authHeader = context.request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false,
        error: '未授权，请先登录'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const token = authHeader.split(' ')[1];
    const validToken = context.env.AUTH_TOKEN || '888';
    if (token !== validToken) {
      return new Response(JSON.stringify({
        success: false,
        error: '无效的认证令牌'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // 分页参数
    const url = new URL(context.request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;

    if (page < 1 || limit < 1 || limit > 100) {
      return new Response(JSON.stringify({
        success: false,
        error: '无效的分页参数（page ≥ 1, limit ≤ 100）'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 列出所有 R2 对象（非目录）
    const bucket = context.env.MY_R2_BUCKET;
    const files = [];
    let cursor = undefined;
    do {
      const listResult = await bucket.list({ cursor, limit: 1000 });
      for (const obj of listResult.objects) {
        if (!obj.key.endsWith('/')) {
          files.push({
            name: obj.key,
            size: obj.size,
            uploaded: obj.uploaded.toISOString()
          });
        }
      }
      cursor = listResult.truncated ? listResult.cursor : undefined;
    } while (cursor);

    // 按上传时间倒序（最新在前）
    files.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

    const total = files.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedFiles = files.slice(offset, offset + limit);

    return new Response(JSON.stringify({
      success: true,
      files: paginatedFiles,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      status: 200
    });

  } catch (error) {
    console.error('Browse error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: '服务器内部错误'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// functions/browse.js
export async function onRequestGet(context) {
  const { request, env } = context;

  // 验证 Token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });
  }
  const token = authHeader.split(' ')[1];
  const isValid = await env.AUTH_TOKENS.get(token);
  if (!isValid) {
    return new Response(JSON.stringify({ error: '无效或过期的 Token' }), { status: 401 });
  }

  // 解析分页参数
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '40');
  const offset = (page - 1) * limit;

  // 列出 R2 中所有对象（带分页）
  const bucket = env.MY_R2_BUCKET;
  const objects = [];
  let cursor;

  do {
    const listing = await bucket.list({ cursor, limit: 1000 }); // 批量获取
    for (const obj of listing.objects) {
      objects.push({
        name: obj.key,
        size: obj.size,
        uploaded: new Date(obj.uploaded).toISOString()
      });
    }
    cursor = listing.truncated ? listing.cursor : null;
  } while (cursor);

  // 分页处理
  const total = objects.length;
  const totalPages = Math.ceil(total / limit);
  const pagedFiles = objects.slice(offset, offset + limit);

  return new Response(JSON.stringify({
    files: pagedFiles,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// functions/browse.js
export async function onRequestGet(context) {
  const { request, env } = context;

  // 验证 Token（可选：如果只想登录后看图）
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未授权' }), { status: 401 });
  }
  const token = authHeader.split(' ')[1];
  const isValid = await env.AUTH_TOKENS.get(token);
  if (!isValid) {
    return new Response(JSON.stringify({ error: '无效或过期的 Token' }), { status: 401 });
  }

  // 列出 R2 中所有对象
  const bucket = env.MY_R2_BUCKET;
  const objects = [];
  let cursor;

  do {
    const listing = await bucket.list({ cursor, limit: 1000 });
    for (const obj of listing.objects) {
      objects.push({
        name: obj.key,
        size: obj.size,
        uploaded: new Date(obj.uploaded).toISOString()
      });
    }
    cursor = listing.truncated ? listing.cursor : null;
  } while (cursor);

  return new Response(JSON.stringify(objects), {
    headers: { 'Content-Type': 'application/json' }
  });
}

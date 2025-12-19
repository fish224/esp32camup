// functions/delete/[filename].js
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const { filename } = params;

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

  // 安全校验文件名
  let fileKey;
  try {
    fileKey = decodeURIComponent(filename);
  } catch {
    return new Response(JSON.stringify({ error: '文件名编码错误' }), { status: 400 });
  }

  if (fileKey.includes('..') || fileKey.includes('/') || fileKey.includes('\\')) {
    return new Response(JSON.stringify({ error: '非法文件名' }), { status: 400 });
  }

  try {
    await env.MY_R2_BUCKET.delete(fileKey);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error('Delete error:', error);
    if (error.message?.includes('404')) {
      return new Response(JSON.stringify({ error: '文件不存在' }), { status: 404 });
    }
    return new Response(JSON.stringify({ error: '删除失败' }), { status: 500 });
  }
}

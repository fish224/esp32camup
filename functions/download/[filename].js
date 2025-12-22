// functions/download/[filename].js
export async function onRequest({ params, env, request }) {
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

  try {
    if (!env.MY_R2_BUCKET) {
      throw new Error("R2桶未绑定");
    }

    const object = await env.MY_R2_BUCKET.get(filename);
    if (!object) {
      return new Response(JSON.stringify({ error: '文件不存在' }), { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('下载失败:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

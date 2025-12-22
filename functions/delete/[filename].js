// functions/delete/[filename].js
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
    // 验证 R2 桶
    if (!env.MY_R2_BUCKET) {
      throw new Error("R2桶未绑定");
    }

    // 删除 R2 中的文件
    await env.MY_R2_BUCKET.delete(filename);

    // 删除缓存
    await env.IMAGE_CACHE?.delete(`desc:${filename}`);

    return new Response(JSON.stringify({
      code: 200,
      msg: "删除成功",
      filename
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('删除失败:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

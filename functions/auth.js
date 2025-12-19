// functions/auth.js
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { username, password } = body;

    // 验证用户名（固定为 admin）和密码
    if (username !== 'admin' || password !== env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({
        success: false,
        error: '用户名或密码错误'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 生成唯一 Token（16位随机字符串）
    const token = 'tk_' + Math.random().toString(36).substring(2, 18);
    
    // 存入 KV，有效期 24 小时（86400 秒）
    await env.AUTH_TOKENS.put(token, 'active', { expirationTtl: 86400 });

    return new Response(JSON.stringify({
      success: true,
      token: token,
      message: '登录成功，Token 24 小时内有效'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: '请求格式错误'
    }), { status: 400 });
  }
}

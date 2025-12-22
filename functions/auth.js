// functions/auth.js

function generateSecureToken(length = 16) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return 'tk_' + Array.from(array, b => b.toString(16).padStart(2, '0')).join('').substring(0, length);
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { request, env } = context;

  try {
    const body = await request.json();
    const { username, password } = body;

    // 检查环境变量
    if (!env.ADMIN_PASSWORD) {
      console.error('ADMIN_PASSWORD is not set');
      return new Response(JSON.stringify({ success: false, error: '服务器配置错误' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.AUTH_TOKENS) {
      console.error('AUTH_TOKENS KV binding missing');
      return new Response(JSON.stringify({ success: false, error: '服务器配置错误' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 验证凭据
    if (username !== 'admin' || password !== env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({
        success: false,
        error: '用户名或密码错误'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 生成安全 token
    const token = generateSecureToken(16);

    // 存入 KV，24 小时过期
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
    console.error('Auth error:', e.message);
    return new Response(JSON.stringify({
      success: false,
      error: '请求格式错误或内部错误'
    }), { status: 400 });
  }
}

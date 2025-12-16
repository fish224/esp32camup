export async function onRequestPost(context) {
  const { request, env } = context;
  const { password } = await request.json();
  
  // 简单的密码验证（实际生产环境应该使用更安全的方法）
  const storedPassword = await env.AUTH_TOKENS.get('password');
  
  if (password === storedPassword) {
    // 生成简单的访问令牌
    const token = generateToken();
    
    // 存储令牌（有效期24小时）
    await env.AUTH_TOKENS.put('admin', token, {
      expirationTtl: 86400 // 24小时
    });
    
    return new Response(JSON.stringify({
      success: true,
      token: token,
      expiresIn: 86400
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({
    success: false,
    error: '密码错误'
  }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}

function generateToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

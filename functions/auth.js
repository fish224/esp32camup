export async function onRequestPost(context) {
  const { request, env } = context;
  const { password } = await request.json();
  
  const adminPassword = env.ADMIN_PASSWORD || 'yu123456';
  
  if (password === adminPassword) {
    const token = env.AUTH_TOKEN || '888';
    
    return new Response(JSON.stringify({
      success: true,
      token: token
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({
    success: false,
    error: '认证失败'
  }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}

// functions/delete/[filename].js
export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const { filename } = params;
  
  // 验证认证令牌
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const token = authHeader.split(' ')[1];
  const validToken = await env.AUTH_TOKENS.get('admin');
  
  if (token !== validToken) {
    return new Response(JSON.stringify({ error: '无效的访问令牌' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 从R2存储桶删除文件
  const fileKey = decodeURIComponent(filename);
  
  try {
    await env.ESP32CAM_BUCKET.delete(fileKey);
    
    return new Response(JSON.stringify({
      success: true,
      message: `文件 ${fileKey} 删除成功`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: '删除失败',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

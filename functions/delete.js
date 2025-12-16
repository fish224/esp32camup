export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const { filename } = params;
  
  // 验证身份（可选但推荐）
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 获取文件名
  const fileKey = decodeURIComponent(filename);
  
  try {
    // 从 R2 存储桶删除文件
    await env.YOUR_R2_BUCKET.delete(fileKey);
    
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

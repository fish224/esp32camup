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
  const validToken = env.AUTH_TOKEN || '888'; // ✅ 移除了 await

  if (token !== validToken) {
    return new Response(JSON.stringify({ error: '无效的访问令牌' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 安全校验文件名
  let fileKey;
  try {
    fileKey = decodeURIComponent(filename);
  } catch (e) {
    return new Response(JSON.stringify({ error: '无效的文件名编码' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 防路径遍历
  if (fileKey.includes('..') || fileKey.includes('/') || fileKey.includes('\\')) {
    return new Response(JSON.stringify({ error: '非法文件名' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 可选：限制文件类型
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif'];
  const ext = fileKey.substring(fileKey.lastIndexOf('.')).toLowerCase();
  if (!allowedExts.includes(ext)) {
    return new Response(JSON.stringify({ error: '不支持的文件类型' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await env.MY_R2_BUCKET.delete(fileKey);
    return new Response(JSON.stringify({
      success: true,
      message: `文件 "${fileKey}" 删除成功`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Delete failed for', fileKey, ':', error);

    if (error.message?.includes('404') || error.message?.includes('not found')) {
      return new Response(JSON.stringify({
        success: false,
        error: '文件不存在'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: false,
      error: '服务器内部错误'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

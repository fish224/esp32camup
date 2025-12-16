// functions/browse.js
export async function onRequestGet(context) {
  try {
    // 1. 认证校验（与前端 token 一致）
    const authHeader = context.request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false,
        error: '未授权，请先登录'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const token = authHeader.split(' ')[1];
    const validToken = context.env.AUTH_TOKEN || '888'; // 与前端保持一致
    if (token !== validToken) {
      return new Response(JSON.stringify({
        success: false,
        error: '无效的认证令牌'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // 2. 读取 R2 桶文件列表（关键：确保桶名称与配置一致）
    const bucket = context.env.MY_R2_BUCKET; // 必须与 Cloudflare 配置的 R2 桶绑定变量名一致
    const files = [];
    
    // 分页读取所有文件（R2 list 接口默认分页，需循环读取）
    let cursor = undefined;
    do {
      const listResult = await bucket.list({
        cursor: cursor,
        limit: 100 // 单次读取 100 个文件，可调整
      });

      // 提取文件名称（仅保留文件，过滤目录）
      for (const obj of listResult.objects) {
        if (!obj.key.endsWith('/')) { // 排除目录（如果有）
          files.push({
            name: obj.key, // 核心：返回原始文件名（未编码）
            size: obj.size,
            uploaded: obj.uploaded
          });
        }
      }

      cursor = listResult.truncated ? listResult.cursor : undefined;
    } while (cursor);

    // 3. 返回文件列表（前端直接使用原始文件名）
    return new Response(JSON.stringify(files), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // 解决跨域（必要）
      },
      status: 200
    });

  } catch (error) {
    console.error('读取 R2 文件列表失败:', error);
    return new Response(JSON.stringify({
      success: false,
      error: '读取文件列表失败',
      details: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

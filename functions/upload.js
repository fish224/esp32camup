// api/upload.js 最终版（含POST方法校验）
export async function onRequestPost(context) { // 函数名onRequestPost本身已限定POST，但额外校验更稳妥
  try {
    // 1. 强制校验请求方法（兜底）
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({
        code: 405,
        msg: "仅支持POST请求"
      }), { 
        status: 405, 
        headers: { 
          'Content-Type': 'application/json; charset=utf-8',
          'Allow': 'POST' // 明确告知允许的方法
        } 
      });
    }

    // 2. 读取二进制数据（核心：避免乱码）
    const arrayBuffer = await context.request.arrayBuffer();
    const fileData = new Uint8Array(arrayBuffer);
    console.log("📥 接收POST数据：", {
      length: fileData.length,
      method: context.request.method,
      fileName: context.request.headers.get('X-File-Name')
    });

    // 3. 基础校验
    if (fileData.length === 0) {
      return new Response(JSON.stringify({ code: 400, msg: "文件数据为空" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // 4. 解析文件名
    const rawFileName = context.request.headers.get('X-File-Name') || `esp32_${Date.now()}.jpg`;
    const fileName = decodeURIComponent(rawFileName);

    // 5. 验证R2桶绑定
    if (!context.env.MY_R2_BUCKET) {
      throw new Error("R2桶未绑定！变量名必须为MY_R2_BUCKET");
    }

    // 6. 写入R2（二进制模式）
    await context.env.MY_R2_BUCKET.put(fileName, fileData, {
      contentType: context.request.headers.get('Content-Type') || 'image/jpeg',
      contentEncoding: 'binary'
    });

    // 7. 返回成功响应
    return new Response(JSON.stringify({
      code: 200,
      msg: "上传成功",
      fileName: fileName,
      fileSize: fileData.length,
      r2Url: `https://r2.yuxinyu.dpdns.org/${encodeURIComponent(fileName)}`
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json; charset=utf-8' } 
    });

  } catch (error) {
    console.error("❌ 错误详情：", error.message, error.stack);
    return new Response(JSON.stringify({
      code: 500,
      msg: "服务器处理失败",
      error: error.message
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json; charset=utf-8' } 
    });
  }
}

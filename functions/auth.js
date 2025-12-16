// functions/auth.js
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    // 解析前端提交的密码
    const body = await request.json();
    const inputPassword = body.password?.trim();

    // 验证密码是否匹配后端的 ADMIN_PASSWORD
    if (!inputPassword || inputPassword !== env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({
        success: false,
        error: "密码错误"
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": env.CORS_ORIGIN // 匹配环境变量中的跨域配置
        }
      });
    }

    // 验证通过，返回 AUTH_TOKEN（作为后续请求的凭证）
    return new Response(JSON.stringify({
      success: true,
      token: env.AUTH_TOKEN // 使用环境变量中的 AUTH_TOKEN
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": env.CORS_ORIGIN
      }
    });
  } catch (error) {
    console.error("登录接口错误:", error);
    return new Response(JSON.stringify({
      success: false,
      error: "服务器内部错误"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

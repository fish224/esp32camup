export async function onRequestPost(context) {
  return new Response(JSON.stringify({
    code: 200,
    msg: "POST请求成功！Pages函数生效",
    method: context.request.method,
    fileName: context.request.headers.get('X-File-Name')
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Allow': 'POST'
    }
  });
}

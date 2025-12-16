// sw.js 正确代码
self.addEventListener('install', (event) => {
  self.skipWaiting(); // 安装后立即激活
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim()); // 控制所有页面
});

self.addEventListener('fetch', (event) => {
  // 只处理缩略图请求
  if (event.request.url.includes('/file/') && event.request.url.includes('?thumb=true')) {
    event.respondWith(handleThumbnailRequest(event.request));
  }
});

async function handleThumbnailRequest(request) {
  try {
    // 从 localStorage 获取 token（确保前端登录后已存储）
    const token = localStorage.getItem('esp32cam_auth_token');
    if (!token) {
      // 无 token 时直接请求（可能触发 401，但不会导致 ERR_FAILED）
      return fetch(request);
    }

    // 克隆请求并添加认证头
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${token}`); // 关键：添加认证头

    const authenticatedRequest = new Request(request, { 
      headers,
      method: request.method,
      mode: request.mode,
      credentials: request.credentials,
      cache: request.cache,
      redirect: request.redirect,
      referrer: request.referrer,
      integrity: request.integrity
    });

    // 发送带认证头的请求
    return fetch(authenticatedRequest);
  } catch (error) {
    // 捕获 Service Worker 内部错误，避免请求中断
    console.error('Service Worker 处理请求失败:', error);
    return fetch(request); // 失败时回退到原始请求
  }
}

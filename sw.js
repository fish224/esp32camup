// sw.js
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // 只处理缩略图请求
  if (event.request.url.includes('/file/') && event.request.url.includes('?thumb=true')) {
    event.respondWith(handleThumbnailRequest(event.request));
  }
});

async function handleThumbnailRequest(request) {
  // 从localStorage获取认证令牌
  const token = localStorage.getItem('esp32cam_auth_token');
  if (!token) {
    return fetch(request);
  }

  // 克隆请求并添加认证头
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${token}`);
  
  const authenticatedRequest = new Request(request, { headers });
  return fetch(authenticatedRequest);
}

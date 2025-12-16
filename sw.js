// sw.js
let authToken = null; // 存储从页面接收的 Token

// 监听页面发送的 Token 消息
self.addEventListener('message', (event) => {
  if (event.data.type === 'SET_TOKEN') {
    authToken = event.data.token; // 保存 Token
    console.log('Service Worker 已接收 Token');
  }
});

self.addEventListener('install', (event) => {
  self.skipWaiting(); // 立即激活新的 Service Worker
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
    // 使用存储的 Token（不再访问 localStorage）
    if (!authToken) {
      console.warn('Service Worker 中无 Token，可能未登录');
      return fetch(request); // 无 Token 时直接请求（可能 401）
    }

    // 克隆请求并添加认证头
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${authToken}`);

    const authenticatedRequest = new Request(request, { 
      headers,
      method: request.method,
      mode: request.mode,
      credentials: request.credentials
    });

    return fetch(authenticatedRequest);
  } catch (error) {
    console.error('Service Worker 处理请求失败:', error);
    return fetch(request);
  }
}

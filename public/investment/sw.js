// 투자 일지 PWA 서비스워커 (scope: /investment/)
// 가계부 서비스워커(scope: /)와 캐시 이름·범위를 분리해 공존합니다.
const CACHE = 'invest-v1';
const ASSETS = ['/investment/', '/investment/index.html', '/investment/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // 자기(invest-) 소유의 옛 캐시만 정리 — 가계부 캐시는 건드리지 않음
      .then(keys => Promise.all(keys.filter(k => k.startsWith('invest-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// Network First: 온라인이면 최신, 오프라인이면 캐시. /investment/ 범위의 GET만 처리.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;
  if (!url.pathname.startsWith('/investment/')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(m => m || caches.match('/investment/')))
  );
});

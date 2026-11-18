const CACHE = 'sons-en-directe-v1';
const FILES = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const SHELL = new Set(FILES.map(file => new URL(file, self.registration.scope).href));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const request = e.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return cache.match('./index.html');
    }));
    return;
  }
  if (!SHELL.has(url.href)) return;
  // Xarxa primer: així les actualitzacions de l'app apareixen sense pujar la versió del cache.
  e.respondWith(fetch(request)
    .then(response => {
      if (response.ok && response.type === 'basic') {
        caches.open(CACHE).then(cache => cache.put(request, response.clone()));
      }
      return response;
    })
    .catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(request, { ignoreSearch: true })) || Response.error();
    })
  );
});

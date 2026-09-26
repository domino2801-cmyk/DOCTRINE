const CACHE_NAME = 'bm4-shell-v2';
const APP_SHELL_URL = new URL('./INDEX%20BM4V2.HTML', self.location.href).toString();
const LANDING_PAGE_URL = new URL('./index.html', self.location.href).toString();
const SHELL_ASSETS = [
  APP_SHELL_URL,
  LANDING_PAGE_URL,
  new URL('./manifest.webmanifest', self.location.href).toString(),
  new URL('./favicon.ico', self.location.href).toString(),
  new URL('./icons/icon.svg', self.location.href).toString(),
  new URL('./icons/icon-192.png', self.location.href).toString(),
  new URL('./icons/icon-512.png', self.location.href).toString(),
  new URL('./icons/apple-touch-icon.png', self.location.href).toString()
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith('bm4-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch (error) {
        return (await caches.match(request)) || (await caches.match(APP_SHELL_URL));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  })());
});

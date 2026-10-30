const CACHE_NAME = 'bm4-shell-v50';
const APP_SHELL_URL = new URL('./index.html', self.location.href).toString();
const LEGACY_APP_URL = new URL('./INDEX%20BM4V2.HTML', self.location.href).toString();
const SHELL_ASSETS = [
  APP_SHELL_URL,
  LEGACY_APP_URL,
  new URL('./manifest.webmanifest', self.location.href).toString(),
  new URL('./favicon.ico', self.location.href).toString(),
  new URL('./icons/icon-192.png', self.location.href).toString(),
  new URL('./icons/apple-touch-icon.png', self.location.href).toString(),
  new URL('./icons/icon-512.png', self.location.href).toString(),
  new URL('./icons/icon-maskable-512.png', self.location.href).toString(),
  new URL('./splash/splash.css', self.location.href).toString(),
  new URL('./splash/splash.js', self.location.href).toString(),
  new URL('./splash/anc-splash.jpg', self.location.href).toString(),
  new URL('./splash/anc-splash-mobile.jpg', self.location.href).toString(),
  new URL('./splash/anc-splash-base.jpg', self.location.href).toString(),
  new URL('./splash/anc-splash-mobile-base.jpg', self.location.href).toString(),
  new URL('./splash/anc-splash-door.webp', self.location.href).toString(),
  new URL('./splash/anc-splash-mobile-door.webp', self.location.href).toString(),
  new URL('./auth/auth.css', self.location.href).toString(),
  new URL('./auth/auth.js', self.location.href).toString(),
  new URL('./admin/admin.css', self.location.href).toString(),
  new URL('./admin/admin.js', self.location.href).toString(),
  new URL('./viewer/viewer.css', self.location.href).toString(),
  new URL('./viewer/viewer.js', self.location.href).toString(),
  new URL('./viewer/dossier-fiches.js', self.location.href).toString()
];

function getNavigationFallback() {
  return APP_SHELL_URL;
}

self.addEventListener('install', event => {
  self.skipWaiting();
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
        return (await caches.match(request)) || (await caches.match(getNavigationFallback()));
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

const CACHE_NAME = 'bm4-shell-v7';
const APP_SHELL_URL = new URL('./INDEX%20BM4V2.HTML', self.location.href).toString();
const LANDING_PAGE_URL = new URL('./index.html', self.location.href).toString();
const APP_SHELL_PATHNAME = new URL(APP_SHELL_URL).pathname;
const LANDING_PAGE_PATHNAME = new URL(LANDING_PAGE_URL).pathname;
const SCOPE_PATHNAME = new URL('./', self.location.href).pathname;
const SHELL_ASSETS = [
  APP_SHELL_URL,
  LANDING_PAGE_URL,
  new URL('./manifest.webmanifest', self.location.href).toString(),
  new URL('./favicon.ico', self.location.href).toString(),
  new URL('./android-icon-144x144.png', self.location.href).toString(),
  new URL('./android-icon-192x192.png', self.location.href).toString(),
  new URL('./apple-icon.png', self.location.href).toString(),
  new URL('./apple-icon-152x152.png', self.location.href).toString(),
  new URL('./apple-icon-180x180.png', self.location.href).toString(),
  new URL('./ms-icon-144x144.png', self.location.href).toString(),
  new URL('./ms-icon-150x150.png', self.location.href).toString()
];

function normalizePathname(pathname) {
  return pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
}

function getNavigationFallback(requestUrl) {
  const pathname = normalizePathname(requestUrl.pathname);
  if (
    pathname === normalizePathname(LANDING_PAGE_PATHNAME) ||
    pathname === normalizePathname(SCOPE_PATHNAME)
  ) {
    return LANDING_PAGE_URL;
  }

  if (pathname === normalizePathname(APP_SHELL_PATHNAME)) {
    return APP_SHELL_URL;
  }

  // Keep the root landing page separate offline; all other in-scope navigations
  // continue to resolve to the BM4 application shell.
  return APP_SHELL_URL;
}

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
        return (await caches.match(request)) || (await caches.match(getNavigationFallback(requestUrl)));
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

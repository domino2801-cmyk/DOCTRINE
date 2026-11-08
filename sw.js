const CACHE_NAME = 'bm4-shell-v107';
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
  new URL('./icons/armoire-splash.png', self.location.href).toString(),
  new URL('./splash/armoire-ouverte.png', self.location.href).toString(),
  new URL('./splash/armoire-fermee.png', self.location.href).toString(),
  new URL('./splash/connexion-cadre.png', self.location.href).toString(),
  new URL('./splash/connexion-fond-lateraux.png', self.location.href).toString(),
  new URL('./splash/auth-closing-open.png', self.location.href).toString(),
  new URL('./splash/auth-closing-door-layer.png', self.location.href).toString(),
  new URL('./app/styles.css', self.location.href).toString(),
  new URL('./app/app.js', self.location.href).toString(),
  new URL('./app/validate-gabarit.mjs', self.location.href).toString(),
  new URL('./app/vendor/pixelmatch.mjs', self.location.href).toString(),
  new URL('./app/effets.js', self.location.href).toString(),
  new URL('./auth/auth.css', self.location.href).toString(),
  new URL('./auth/auth.js', self.location.href).toString(),
  new URL('./admin/admin.css', self.location.href).toString(),
  new URL('./admin/admin.js', self.location.href).toString(),
  new URL('./admin/fiches-admin.js', self.location.href).toString(),
  new URL('./viewer/viewer.css', self.location.href).toString(),
  new URL('./viewer/viewer.js', self.location.href).toString(),
  new URL('./viewer/dossier-fiches.js', self.location.href).toString(),
  new URL('./viewer/jury-bm4.js', self.location.href).toString(),
  new URL('./viewer/retex-signalements.js', self.location.href).toString()
];

function getNavigationFallback() {
  return APP_SHELL_URL;
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS.map(url => new Request(url, { cache: 'reload' }))))
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

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.warn('Notification de signalement invalide.', error);
  }

  const pendingCount = payload && payload.pendingCount;
  const isTest = payload && payload.type === 'doctrine-test';
  let badgeUpdate = Promise.resolve();
  if (typeof self.navigator.setAppBadge === 'function' && Number.isSafeInteger(pendingCount) && pendingCount >= 0) {
    badgeUpdate = Promise.resolve().then(() => pendingCount > 0
      ? self.navigator.setAppBadge(pendingCount)
      : typeof self.navigator.clearAppBadge === 'function' ? self.navigator.clearAppBadge() : undefined);
  }

  event.waitUntil(Promise.all([
    self.registration.showNotification('DOCTRINE — Signalements', {
      body: isTest ? 'Notification de test : les alertes de signalement sont activées.' :
        'Un nouveau signalement nécessite votre attention.',
      icon: new URL('./icons/icon-192.png', self.registration.scope).href,
      badge: new URL('./icons/icon-192.png', self.registration.scope).href,
      tag: 'doctrine-signalements',
      renotify: true,
      data: { url: self.registration.scope }
    }),
    Promise.resolve(badgeUpdate).catch(error => {
      console.warn('Mise à jour du badge de l’application impossible.', error);
    })
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const appUrl = new URL('./index.html', self.registration.scope);
    appUrl.searchParams.set('admin-section', 'signalements');
    const scopeUrl = new URL(self.registration.scope);
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appClient = clients.find(client => {
      const url = new URL(client.url);
      return url.origin === scopeUrl.origin && url.pathname.startsWith(scopeUrl.pathname);
    });
    if (appClient) {
      appClient.postMessage({ type: 'doctrine-open-signalements' });
      return appClient.focus();
    }
    return self.clients.openWindow(appUrl.href);
  })());
});

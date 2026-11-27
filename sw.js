
const CACHE_NAME = 'bm4-shell-v154';

const APP_SHELL_URL = new URL('./index.html', self.location.href).toString();
const LEGACY_APP_URL = new URL('./INDEX%20BM4V2.HTML', self.location.href).toString();
const SHELL_ASSETS = [
  APP_SHELL_URL,
  LEGACY_APP_URL,
  new URL('./manifest.webmanifest', self.location.href).toString(),
  new URL('./favicon.ico', self.location.href).toString(),
  new URL('./icons/icon-192.png', self.location.href).toString(),
  new URL('./icons/icon-512.png', self.location.href).toString(),
  new URL('./icons/icon-maskable-512.png', self.location.href).toString(),
  new URL('./auth/closing-open.png', self.location.href).toString(),
  new URL('./auth/closing-door-layer.png', self.location.href).toString(),
  new URL('./app/styles.css', self.location.href).toString(),
  new URL('./app/app.js', self.location.href).toString(),
  new URL('./app/push-notifications.js', self.location.href).toString(),
  new URL('./app/push-notifications.js?v=20261127-PUSH-ANDROID-RECHECK-4', self.location.href).toString(),
  new URL('./app/guide-dashboard.css', self.location.href).toString(),
  new URL('./app/guide-dashboard.js?v=20261127-RETEX-READ-3', self.location.href).toString(),
  new URL('./app/module2-documents.js?v=20261125-3', self.location.href).toString(),
  new URL('./app/guide-module8.html', self.location.href).toString(),
  new URL('./app/guide-module8.css', self.location.href).toString(),
  new URL('./app/guide-module8.js', self.location.href).toString(),
  new URL('./app/evaluation-report.mjs', self.location.href).toString(),
  new URL('./app/bm4-official-pdf.mjs', self.location.href).toString(),
  new URL('./app/grille-evaluation-synthese-bm4-interactive.pdf', self.location.href).toString(),
  new URL('./app/validate-gabarit.mjs', self.location.href).toString(),
  new URL('./app/vendor/pixelmatch.mjs', self.location.href).toString(),
  new URL('./app/effets.js', self.location.href).toString(),
  new URL('./auth/auth.css', self.location.href).toString(),
  new URL('./auth/auth.js', self.location.href).toString(),
  new URL('./admin/admin.css', self.location.href).toString(),
  new URL('./admin/admin.js', self.location.href).toString(),
  new URL('./admin/guide-library.css', self.location.href).toString(),
  new URL('./admin/guide-library.js', self.location.href).toString(),
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
  try { payload = event.data ? event.data.json() : {}; }
  catch (error) { console.warn('Notification push invalide.', error); }

  const legacyTest = payload.type === 'doctrine-test';
  const legacyGuide = payload.type === 'doctrine-guide-signalement';
  const title = typeof payload.title === 'string' ? payload.title :
    legacyGuide ? 'DOCTRINE — Signalement Officier Guide' : 'DOCTRINE — Signalements';
  const body = typeof payload.body === 'string' ? payload.body :
    legacyTest ? 'Notification de test : les alertes de signalement sont activées.' :
      legacyGuide ? 'Un Officier Guide a transmis un signalement à traiter.' :
        'Un candidat a transmis un signalement à traiter.';
  const targetUrl = typeof payload.url === 'string' ? payload.url : './index.html';
  const reportType = legacyGuide ? 'guide-signalements' : 'signalements';
  const notificationTag = typeof payload.type === 'string' ? payload.type : 'doctrine-notification';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: new URL('./icons/icon-192.png', self.registration.scope).href,
    badge: new URL('./icons/icon-192.png', self.registration.scope).href,
    tag: notificationTag,
    renotify: true,
    data: { url: targetUrl, reportType, eventType: payload.type || '' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data || {};
    const scopeUrl = new URL(self.registration.scope);
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appClient = clients.find(client => {
      const url = new URL(client.url);
      return url.origin === scopeUrl.origin && url.pathname.startsWith(scopeUrl.pathname);
    });
    if (data.reportType) {
      const reportType = data.reportType === 'guide-signalements' ? 'guide-signalements' : 'signalements';
      const appUrl = new URL('./index.html', self.registration.scope);
      appUrl.searchParams.set('admin-section', reportType);
      if (appClient) {
        appClient.postMessage({ type: reportType === 'guide-signalements'
          ? 'doctrine-open-guide-signalements' : 'doctrine-open-signalements' });
        return appClient.focus();
      }
      return self.clients.openWindow(appUrl.href);
    }
    const target = new URL(typeof data.url === 'string' ? data.url : './index.html', self.registration.scope);
    if (appClient) {
      await appClient.navigate(target.href);
      return appClient.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});

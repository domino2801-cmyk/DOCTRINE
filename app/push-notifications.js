(function () {
  'use strict';
  var button, status, currentSubscription = null;
  function auth() { return window.DoctrineAuth; }
  function request(method, payload) {
    return auth().jeton().then(function (token) {
      if (!token) throw new Error('Session expirée.');
      return fetch(auth().url + '/functions/v1/doctrine-event-push', {
        method: method,
        headers: { apikey: auth().key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined
      });
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Service de notification indisponible.');
        return data;
      });
    });
  }
  function setStatus(message) { if (status) status.textContent = message; }
  function render() {
    if (!auth() || !auth().jeton || !('serviceWorker' in navigator) || !('PushManager' in window) ||
        !('Notification' in window) || !window.isSecureContext) return;
    var old = document.getElementById('doctrine-push-settings');
    if (old) old.remove();
    var panel = document.createElement('aside');
    panel.id = 'doctrine-push-settings';
    panel.setAttribute('aria-label', 'Notifications DOCTRINE');
    panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:10000;max-width:min(340px,calc(100vw - 32px));padding:12px 14px;background:#172536;color:#fff;border:1px solid #49627b;border-radius:12px;box-shadow:0 4px 18px #0004;font:14px/1.4 system-ui';
    var heading = document.createElement('strong'); heading.textContent = 'Notifications DOCTRINE';
    status = document.createElement('p'); status.style.margin = '6px 0';
    button = document.createElement('button'); button.type = 'button';
    button.style.cssText = 'padding:8px 12px;border:0;border-radius:7px;background:#d7e4ee;color:#172536;font-weight:600;cursor:pointer';
    panel.append(heading, status, button); document.body.appendChild(panel);
    navigator.serviceWorker.ready.then(function (registration) {
      return registration.pushManager.getSubscription().then(function (sub) {
        currentSubscription = sub;
        button.textContent = sub ? 'Désactiver sur cet appareil' : 'Activer les notifications';
        setStatus(sub ? 'Les alertes push sont actives sur cet appareil.' : 'Recevez les alertes même lorsque DOCTRINE est fermé.');
        button.onclick = function () { button.disabled = true; enableOrDisable(registration, sub); };
      });
    }).catch(function (error) { setStatus(error.message); });
  }
  function enableOrDisable(registration, existing) {
    if (existing) {
      request('POST', { type: 'unsubscribe', endpoint: existing.endpoint })
        .then(function () { return existing.unsubscribe(); })
        .then(render).catch(function (error) { setStatus(error.message); if (button) button.disabled = false; });
      return;
    }
    Notification.requestPermission().then(function (permission) {
      if (permission !== 'granted') throw new Error('Autorisez les notifications dans les réglages du navigateur.');
      return request('GET').then(function (config) {
        var key = config.publicKey.replace(/-/g, '+').replace(/_/g, '/');
        while (key.length % 4) key += '=';
        var appKey = Uint8Array.from(atob(key), function (c) { return c.charCodeAt(0); });
        return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
      });
    }).then(function (sub) {
      currentSubscription = sub;
      return request('POST', { type: 'subscribe', subscription: sub.toJSON() });
    }).then(render).catch(function (error) { setStatus(error.message); if (button) button.disabled = false; });
  }
  function init() {
    if (!auth() || typeof auth().jeton !== 'function') return;
    auth().jeton().then(function (token) { if (token) render(); }).catch(function () {});
    document.addEventListener('doctrine:login', render);
    document.addEventListener('doctrine:logout', function () {
      var panel = document.getElementById('doctrine-push-settings'); if (panel) panel.remove();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
(function () {
  'use strict';
  var button, status;
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
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data.error || 'Service de notification indisponible.');
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }
  function setStatus(message) { if (status) status.textContent = message; }
  function saveSubscription(sub) {
    return request('POST', { type: 'subscribe', subscription: sub.toJSON() });
  }
  function createSubscription(registration) {
    return request('GET').then(function (config) {
      var key = config.publicKey.replace(/-/g, '+').replace(/_/g, '/');
      while (key.length % 4) key += '=';
      var appKey = Uint8Array.from(atob(key), function (c) { return c.charCodeAt(0); });
      return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
    }).then(saveSubscription);
  }
  function render() {
    if (!auth() || !auth().jeton || !('serviceWorker' in navigator) || !('PushManager' in window) ||
        !('Notification' in window) || !window.isSecureContext) return;
    var old = document.getElementById('doctrine-push-settings');
    if (old) old.remove();
    var panel = document.createElement('aside');
    panel.id = 'doctrine-push-settings';
    panel.setAttribute('aria-label', 'Notifications DOCTRINE');
    panel.style.cssText = 'position:fixed;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483000;width:min(340px,calc(100vw - 24px));max-width:calc(100vw - 24px);box-sizing:border-box;padding:14px;background:#172536;color:#fff;border:1px solid #49627b;border-radius:12px;box-shadow:0 4px 18px #0004;font:14px/1.4 system-ui;pointer-events:auto;';
    var heading = document.createElement('strong'); heading.textContent = 'Notifications DOCTRINE';
    status = document.createElement('p'); status.style.margin = '6px 0';
    button = document.createElement('button'); button.type = 'button';
    button.textContent = 'Chargement…';
    button.disabled = true;
    button.style.cssText = 'display:block;width:100%;min-height:48px;padding:12px 16px;border:0;border-radius:7px;background:#d7e4ee;color:#172536;font-weight:700;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
    panel.append(heading, status, button); document.body.appendChild(panel);
    navigator.serviceWorker.ready.then(function (registration) {
      return registration.pushManager.getSubscription().then(function (sub) {
        if (sub) {
          button.disabled = false;
          setStatus('Synchronisation des alertes sur cet appareil…');
          return saveSubscription(sub).then(function () {
            button.textContent = 'Désactiver sur cet appareil';
            setStatus('Les alertes push sont actives et synchronisées.');
            button.onclick = function () {
              button.disabled = true;
              request('POST', { type: 'unsubscribe', endpoint: sub.endpoint })
                .then(function () { return sub.unsubscribe(); })
                .then(render).catch(function (error) { setStatus(error.message); button.disabled = false; });
            };
          });
        }
        if (Notification.permission === 'granted') {
          button.disabled = false;
          button.hidden = true;
          setStatus('Activation automatique des alertes…');
          return createSubscription(registration).then(function () {
            setStatus('Les alertes push sont maintenant actives sur cet appareil.');
            button.hidden = false;
            button.textContent = 'Actualiser';
            button.onclick = render;
          });
        }
        if (Notification.permission === 'denied') {
          button.disabled = false;
          button.hidden = true;
          setStatus('Notifications bloquées par le navigateur. Réactivez-les dans les paramètres du site.');
          return;
        }
        button.hidden = false;
        button.disabled = false;
        button.textContent = 'Autoriser les notifications';
        setStatus('Autorisez une première fois les alertes. Elles seront ensuite activées automatiquement à chaque ouverture.');
        button.onclick = function () {
          if (button.disabled) return;
          button.disabled = true;
          Notification.requestPermission().then(function (permission) {
            if (permission !== 'granted') throw new Error('Autorisation non accordée.');
            return createSubscription(registration);
          }).then(render).catch(function (error) {
            setStatus(error.message);
            button.disabled = false;
          });
        };
      });
    }).catch(function (error) {
      var message = error && error.message ? error.message : '';
      button.hidden = false;
      button.disabled = false;
      button.textContent = 'Réessayer';
      button.onclick = function () {
        button.disabled = true;
        button.textContent = 'Vérification…';
        render();
      };
      if (error && error.status === 401) {
        setStatus('Accès refusé par Supabase : votre session doit être renouvelée. Déconnectez-vous puis reconnectez-vous à DOCTRINE, puis réessayez.');
      } else if (/Session expirée/i.test(message)) {
        setStatus('Session expirée. Déconnectez-vous puis reconnectez-vous à DOCTRINE.');
      } else if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
        setStatus('Service push inaccessible : vérifiez le déploiement de doctrine-event-push et sa configuration Supabase.');
      } else {
        setStatus(message || 'Service de notification indisponible. Vous pouvez réessayer.');
      }
    });
  }
  function init() {
    if (!auth() || typeof auth().jeton !== 'function') return;
    auth().jeton().then(function (token) { if (token) render(); }).catch(function () {});
    document.addEventListener('doctrine:login', function () {
      auth().jeton().then(function (token) { if (token) render(); }).catch(function () {});
    });
    document.addEventListener('doctrine:logout', function () {
      var panel = document.getElementById('doctrine-push-settings'); if (panel) panel.remove();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
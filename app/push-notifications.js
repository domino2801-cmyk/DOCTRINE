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
    panel.style.cssText = 'position:fixed;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483647;width:min(340px,calc(100vw - 24px));max-width:calc(100vw - 24px);box-sizing:border-box;padding:14px;background:#172536;color:#fff;border:1px solid #49627b;border-radius:12px;box-shadow:0 4px 18px #0004;font:14px/1.4 system-ui;pointer-events:auto;';
    var heading = document.createElement('strong');
    heading.textContent = 'Notifications DOCTRINE';
    status = document.createElement('p');
    status.style.margin = '6px 0';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Autoriser les notifications';
    button.disabled = false;
    button.style.cssText = 'display:block;width:100%;min-height:52px;padding:14px 16px;border:0;border-radius:7px;background:#d7e4ee;color:#172536;font-size:16px;font-weight:700;cursor:pointer;touch-action:manipulation;pointer-events:auto;-webkit-tap-highlight-color:rgba(0,0,0,.15);';
    panel.append(heading, status, button);
    document.body.appendChild(panel);

    function showError(error) {
      var message = error && error.message ? error.message : '';
      setStatus(error && error.status === 401
        ? 'Session à renouveler : déconnectez-vous puis reconnectez-vous à DOCTRINE.'
        : (/Failed to fetch|NetworkError|Load failed/i.test(message)
          ? 'Service push inaccessible. Vérifiez la connexion puis réessayez.'
          : (message || 'Activation impossible. Réessayez.')));
      button.disabled = false;
      button.textContent = 'Réessayer';
    }

    function activateFromTap() {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = 'Activation…';
      setStatus('Demande d’autorisation en cours…');

      // La demande de permission est déclenchée directement par le toucher utilisateur.
      Promise.resolve(Notification.requestPermission()).then(function (permission) {
        if (permission !== 'granted') {
          if (permission === 'denied') {
            button.hidden = true;
            setStatus('Notifications bloquées par le navigateur. Autorisez-les dans les réglages du site.');
            return null;
          }
          throw new Error('Autorisation non accordée.');
        }
        setStatus('Préparation des alertes sur cet appareil…');
        return navigator.serviceWorker.ready.then(function (registration) {
          return registration.pushManager.getSubscription().then(function (sub) {
            return (sub ? saveSubscription(sub) : createSubscription(registration));
          });
        });
      }).then(function (result) {
        if (result === null) return;
        setStatus('Les alertes push sont activées sur cet appareil.');
        button.disabled = false;
        button.textContent = 'Actualiser';
        button.onclick = render;
      }).catch(showError);
    }

    if (Notification.permission === 'denied') {
      button.hidden = true;
      setStatus('Notifications bloquées par le navigateur. Autorisez-les dans les réglages du site.');
    } else {
      button.hidden = false;
      button.disabled = false;
      button.onclick = activateFromTap;
      setStatus(Notification.permission === 'granted'
        ? 'Touchez le bouton pour finaliser l’activation des alertes sur cet appareil.'
        : 'Touchez le bouton pour autoriser les alertes DOCTRINE.');
    }

    // La vérification du Service Worker se fait en arrière-plan :
    // elle ne bloque plus l’affichage ni le toucher du bouton.
    navigator.serviceWorker.ready.then(function (registration) {
      return registration.pushManager.getSubscription().then(function (sub) {
        if (!sub) return null;
        return saveSubscription(sub).then(function () {
          if (!document.getElementById('doctrine-push-settings')) return;
          button.hidden = false;
          button.disabled = false;
          button.textContent = 'Désactiver sur cet appareil';
          setStatus('Les alertes push sont actives et synchronisées.');
          button.onclick = function () {
            button.disabled = true;
            request('POST', { type: 'unsubscribe', endpoint: sub.endpoint })
              .then(function () { return sub.unsubscribe(); })
              .then(render)
              .catch(showError);
          };
        });
      });
    }).catch(function (error) {
      // Ne pas désactiver le bouton : l’utilisateur doit pouvoir relancer l’activation.
      console.warn('Vérification push différée :', error);
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
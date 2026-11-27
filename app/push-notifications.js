(function () {
  'use strict';
  var button, status, activationStarted = false;
  function auth() { return window.DoctrineAuth; }
  function withTimeout(promise, milliseconds, message) {
    var timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise(function (_, reject) {
        timer = setTimeout(function () { reject(new Error(message)); }, milliseconds);
      })
    ]).then(function (value) { clearTimeout(timer); return value; }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }
  function request(method, payload) {
    return withTimeout(auth().jeton(), 12000, 'La session met trop de temps à répondre. Reconnectez-vous puis réessayez.').then(function (token) {
      if (!token) throw new Error('Session expirée.');
      return withTimeout(fetch(auth().url + '/functions/v1/doctrine-event-push', {
        method: method,
        headers: { apikey: auth().key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined
      }), 15000, 'Le serveur de notifications ne répond pas. Vérifiez la connexion puis réessayez.');
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
      activationStarted = false;
      button.disabled = false;
      button.textContent = 'Réessayer';
    }

    function activateFromTap(event) {
      if (event && event.preventDefault) event.preventDefault();
      if (button.disabled || activationStarted) return;
      activationStarted = true;
      button.disabled = true;
      button.textContent = 'Activation…';
      setStatus('Demande d’autorisation en cours…');

      // La demande de permission est déclenchée directement par le toucher utilisateur.
      withTimeout(Notification.requestPermission(), 20000, 'Chrome ne répond pas à la demande. Vérifiez l’autorisation du site puis réessayez.').then(function (permission) {
        if (permission !== 'granted') {
          if (permission === 'denied') {
            button.hidden = true;
            setStatus('Notifications bloquées par le navigateur. Autorisez-les dans les réglages du site.');
            return null;
          }
          throw new Error('Autorisation non accordée.');
        }
        setStatus('Préparation des alertes sur cet appareil…');
        return withTimeout(navigator.serviceWorker.ready, 12000, 'Le service de notifications du navigateur ne démarre pas. Fermez puis rouvrez le site, et réessayez.').then(function (registration) {
          return registration.pushManager.getSubscription().then(function (sub) {
            return withTimeout(sub ? saveSubscription(sub) : createSubscription(registration), 20000, 'La création de l’abonnement prend trop de temps. Vérifiez le réseau et réessayez.');
          });
        });
      }).then(function (result) {
        if (result === null) return;
        setStatus('Les alertes push sont activées sur cet appareil.');
        activationStarted = false;
        button.disabled = false;
        button.textContent = 'Actualiser';
        button.onclick = render;
      }).catch(showError);
    }

    if (Notification.permission === 'denied') {
      // Chrome a mémorisé un refus : aucune API web ne peut lever ce blocage.
      // Afficher une aide persistante et permettre de relancer immédiatement
      // l’activation après modification de l’autorisation du domaine courant.
      button.hidden = false;
      button.disabled = false;
      button.textContent = 'Débloquer les notifications';
      setStatus('Notifications bloquées pour ' + window.location.hostname +
        '. Sur Android : Chrome > ⋮ > Paramètres > Paramètres des sites > Notifications > ' +
        window.location.hostname + ' > Autoriser.');
      button.addEventListener('click', function () {
        var permission = Notification.permission;
        if (permission === 'granted') {
          render();
          return;
        }
        if (permission === 'default') {
          activateFromTap();
          return;
        }
        button.textContent = 'J’ai autorisé — vérifier';
        setStatus('Dans Chrome, ouvrez ⋮ > Paramètres > Paramètres des sites > Notifications. ' +
          'Sélectionnez ' + window.location.hostname + ' puis choisissez « Autoriser ». ' +
          'Revenez sur cette page et touchez « J’ai autorisé — vérifier ». ' +
          'Si le domaine n’apparaît pas, ouvrez les paramètres du site depuis l’icône à gauche de son adresse.');
      }, false);
    } else {
      button.hidden = false;
      button.disabled = false;
      button.addEventListener('click', activateFromTap, false);
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
          setStatus('Les alertes push sont actives et synchronisées.');
          // L’abonnement est déjà actif : masquer entièrement le panneau.
          // La carte ne doit pas rester affichée avec l’action « Désactiver ».
          panel.remove();
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
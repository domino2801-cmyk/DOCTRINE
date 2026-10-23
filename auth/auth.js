/*
 * Connexion DOCTRINE via Supabase Auth, avec les mêmes comptes que QCM-MAJOR.FR.
 * La clé « publishable » est publique par conception (déjà exposée par QCM-MAJOR.FR).
 * Sécurité : ce filtre protège l'interface, pas les fichiers d'un site statique.
 */
(function () {
    'use strict';

    var SUPABASE_URL = 'https://beodiemzrunqjkvylffn.supabase.co';
    var SUPABASE_KEY = 'sb_publishable_bymJkPCdh1kgzP1EldO5hg_XVuPrz_R';
    var SIGNUP_URL = 'https://qcm-major.fr';
    var STORAGE_KEY = 'doctrine-auth';
    var MARGE_S = 60;

    var root = document.documentElement;
    root.classList.add('auth-locked');

    function lire() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
    }
    function ecrire(s) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
    }
    function effacer() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }

    function appel(chemin, options) {
        options = options || {};
        var headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
        if (options.jeton) headers.Authorization = 'Bearer ' + options.jeton;
        return fetch(SUPABASE_URL + '/auth/v1' + chemin, {
            method: options.methode || 'POST',
            headers: headers,
            body: options.corps ? JSON.stringify(options.corps) : undefined
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (data) {
                if (!r.ok) {
                    var err = new Error(data.msg || data.error_description || 'HTTP ' + r.status);
                    err.status = r.status;
                    err.code = data.error_code || data.error || '';
                    throw err;
                }
                return data;
            });
        });
    }

    function sessionDepuis(data) {
        var user = data.user || {};
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
            email: user.email || ''
        };
    }

    function estConfirme(user) {
        return !!(user && (user.email_confirmed_at || user.confirmed_at));
    }

    function rafraichir(s) {
        return appel('/token?grant_type=refresh_token', { corps: { refresh_token: s.refresh_token } })
            .then(function (data) {
                var n = sessionDepuis(data);
                if (!n.email) n.email = s.email;
                ecrire(n);
                return n;
            });
    }

    // Retourne une session valide, ou null. Hors ligne, une session mémorisée reste acceptée.
    function verifier() {
        var s = lire();
        if (!s || !s.refresh_token) return Promise.resolve(null);
        var enCours = s.expires_at - MARGE_S > Date.now() / 1000
            ? appel('/user', { methode: 'GET', jeton: s.access_token }).then(function (u) {
                if (!estConfirme(u)) throw Object.assign(new Error('non confirmé'), { status: 401 });
                return s;
            })
            : rafraichir(s);
        return enCours.catch(function (err) {
            if (err && (err.status === 400 || err.status === 401 || err.status === 403 || err.status === 404)) {
                effacer();
                return null;
            }
            return s;
        });
    }

    function messageErreur(err) {
        if (!err || !err.status) {
            return 'Connexion impossible : vérifiez votre accès Internet puis réessayez.';
        }
        if (err.code === 'email_not_confirmed') {
            return 'Votre adresse email n’est pas encore confirmée. Ouvrez le message reçu de QCM-MAJOR.FR pour la valider.';
        }
        if (err.status === 429 || err.code === 'over_request_rate_limit') {
            return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
        }
        if (err.code === 'invalid_credentials' || err.status === 400 || err.status === 401) {
            return 'Identifiants incorrects, ou compte non créé. Si vous n’êtes pas encore inscrit, créez votre compte sur QCM-MAJOR.FR.';
        }
        return 'Service de connexion indisponible. Réessayez plus tard.';
    }

    var gate, form, message, bouton, pied;

    function construire() {
        gate = document.createElement('div');
        gate.id = 'auth-gate';
        gate.innerHTML =
            '<div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-titre">' +
            '<h1 id="auth-titre">Connexion</h1>' +
            '<p class="auth-intro">Utilisez vos identifiants <strong>Questions pour un major</strong> (ceux de QCM-MAJOR.FR).</p>' +
            '<p class="auth-etat" id="auth-etat">Vérification de votre session…</p>' +
            '<form id="auth-form" novalidate hidden>' +
            '<label for="auth-email">Adresse email</label>' +
            '<input id="auth-email" type="email" autocomplete="username" inputmode="email" required>' +
            '<label for="auth-mdp">Mot de passe</label>' +
            '<input id="auth-mdp" type="password" autocomplete="current-password" required>' +
            '<p class="auth-message" id="auth-message" role="alert" aria-live="assertive"></p>' +
            '<button type="submit" id="auth-submit">Se connecter</button>' +
            '</form>' +
            '<p class="auth-pied" id="auth-pied" hidden>Pas encore de compte ? ' +
            '<a href="' + SIGNUP_URL + '" target="_blank" rel="noopener">Créez-le sur QCM-MAJOR.FR</a>' +
            ' puis revenez ici avec les mêmes identifiants. Aucune nouvelle inscription n’est nécessaire sur DOCTRINE.</p>' +
            '</div>';
        document.body.appendChild(gate);
        form = gate.querySelector('#auth-form');
        message = gate.querySelector('#auth-message');
        bouton = gate.querySelector('#auth-submit');
        pied = gate.querySelector('#auth-pied');
        form.addEventListener('submit', soumettre);
    }

    function montrerFormulaire() {
        gate.querySelector('#auth-etat').hidden = true;
        form.hidden = false;
        pied.hidden = false;
        gate.hidden = false;
        var champ = gate.querySelector('#auth-email');
        if (champ && !champ.value) champ.focus();
    }

    function deverrouiller(s) {
        root.classList.remove('auth-locked');
        if (gate) gate.hidden = true;
        ajouterDeconnexion(s);
        document.dispatchEvent(new CustomEvent('doctrine:login'));
    }

    function verrouiller() {
        root.classList.add('auth-locked');
        var mdp = gate.querySelector('#auth-mdp');
        if (mdp) mdp.value = '';
        message.textContent = '';
        montrerFormulaire();
    }

    function soumettre(event) {
        event.preventDefault();
        var email = gate.querySelector('#auth-email').value.trim().toLowerCase();
        var mdp = gate.querySelector('#auth-mdp').value;
        if (!email || !mdp) {
            message.textContent = 'Saisissez votre adresse email et votre mot de passe.';
            return;
        }
        message.textContent = '';
        bouton.disabled = true;
        bouton.textContent = 'Connexion…';
        appel('/token?grant_type=password', { corps: { email: email, password: mdp } })
            .then(function (data) {
                if (!estConfirme(data.user)) {
                    throw Object.assign(new Error('non confirmé'), { status: 400, code: 'email_not_confirmed' });
                }
                var s = sessionDepuis(data);
                if (!s.email) s.email = email;
                ecrire(s);
                gate.querySelector('#auth-mdp').value = '';
                deverrouiller(s);
            })
            .catch(function (err) {
                message.textContent = messageErreur(err);
            })
            .then(function () {
                bouton.disabled = false;
                bouton.textContent = 'Se connecter';
            });
    }

    function deconnecter() {
        var s = lire();
        effacer();
        var pastille = document.getElementById('auth-logout');
        if (pastille) pastille.remove();
        if (s && s.access_token) appel('/logout', { jeton: s.access_token }).catch(function () {});
        verrouiller();
        document.dispatchEvent(new CustomEvent('doctrine:logout'));
    }

    function ajouterDeconnexion(s) {
        if (document.getElementById('auth-logout')) return;
        var b = document.createElement('button');
        b.id = 'auth-logout';
        b.type = 'button';
        b.textContent = 'Déconnexion';
        b.title = s && s.email ? 'Connecté : ' + s.email : 'Se déconnecter';
        b.addEventListener('click', deconnecter);
        document.body.appendChild(b);
    }

    // Rôle lu dans le JWT pour l'affichage uniquement : seule la RLS Supabase fait foi.
    function estAdmin(jeton) {
        try {
            var p = jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            var meta = JSON.parse(decodeURIComponent(escape(atob(p)))).app_metadata || {};
            return meta.role === 'admin' || meta.bm4_admin === true || meta.bm4_admin === 'true' || meta.bm4_admin === 1 || meta.bm4_admin === '1';
        } catch (e) { return false; }
    }

    window.DoctrineAuth = {
        url: SUPABASE_URL,
        key: SUPABASE_KEY,
        jeton: function () { return verifier().then(function (s) { return s ? s.access_token : null; }); },
        estAdmin: function () { var s = lire(); return !!(s && s.access_token && estAdmin(s.access_token)); },
        email: function () { var s = lire(); return s ? s.email : ''; }
    };

    function demarrer() {
        construire();
        verifier().then(function (s) {
            if (s) deverrouiller(s); else montrerFormulaire();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', demarrer);
    } else {
        demarrer();
    }
})();

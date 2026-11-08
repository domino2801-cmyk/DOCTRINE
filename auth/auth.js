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
    var ORIGINES_QCM = ['https://qcm-major.fr', 'https://www.qcm-major.fr'];
    var accesQcm = new URLSearchParams(window.location.search).get('from') === 'qcm-major' && window.opener;
    var sessionRelais = null;
    var relaisActif = false;
    var generationRelais = 0;
    var demandeRelais = null;
    var numeroDemande = 0;

    var root = document.documentElement;
    root.classList.add('auth-locked');
    if (accesQcm) root.classList.add('auth-acces-qcm');

    function lire() {
        if (relaisActif) return sessionRelais;
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
    }
    function ecrire(s) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
    }
    function effacer() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }

    function demanderSessionQcm() {
        if (!window.opener || window.opener.closed) return Promise.resolve(null);
        if (demandeRelais) return demandeRelais;
        demandeRelais = new Promise(function (resolve) {
            var id = String(++numeroDemande);
            var timer = setTimeout(function () {
                window.removeEventListener('message', recevoir);
                resolve(null);
            }, 5000);
            function recevoir(event) {
                if (event.source !== window.opener || ORIGINES_QCM.indexOf(event.origin) === -1 ||
                    !event.data || event.data.type !== 'doctrine-session-response' || event.data.id !== id) return;
                clearTimeout(timer);
                window.removeEventListener('message', recevoir);
                resolve(event.data);
            }
            window.addEventListener('message', recevoir);
            ORIGINES_QCM.forEach(function (origine) {
                window.opener.postMessage({ type: 'doctrine-session-request', id: id }, origine);
            });
        }).then(function (data) {
            if (!data || typeof data.access_token !== 'string' ||
                !Number.isFinite(data.expires_at) || data.expires_at <= Date.now() / 1000) return null;
            return appel('/user', { methode: 'GET', jeton: data.access_token }).then(function (user) {
                if (!estConfirme(user)) return null;
                return { access_token: data.access_token, expires_at: data.expires_at, email: user.email || '', user_id: user.id };
            });
        }).finally(function () { demandeRelais = null; });
        return demandeRelais;
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

    function chargerProfil(s, user, colonne) {
        var url = SUPABASE_URL + '/rest/v1/profiles?id=eq.' +
            encodeURIComponent(user.id) + '&select=' + colonne;
        return fetch(url, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: 'Bearer ' + s.access_token
            }
        }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                if (!response.ok) {
                    var err = new Error(data.message || data.error || 'Lecture du profil impossible.');
                    err.status = response.status;
                    err.code = data.code || '';
                    err.details = data.details || '';
                    throw err;
                }
                return Array.isArray(data) ? data[0] || null : null;
            });
        });
    }

    function chargerSpecialite() {
        return verifier().then(function (s) {
            if (!s) throw new Error('Aucune session candidate active.');
            return appel('/user', { methode: 'GET', jeton: s.access_token }).then(function (user) {
                if (!user || !user.id) throw new Error('Identifiant candidat indisponible.');
                return chargerProfil(s, user, 'speciality').catch(function (err) {
                    var detail = (err.message + ' ' + err.details + ' ' + err.code).toLowerCase();
                    var colonneAbsente = err.status === 400 &&
                        detail.indexOf('speciality') !== -1 &&
                        (detail.indexOf('column') !== -1 || detail.indexOf('schema cache') !== -1);
                    if (!colonneAbsente) throw err;
                    return chargerProfil(s, user, 'specialty');
                }).then(function (profile) {
                    var specialty = profile && (profile.speciality || profile.specialty);
                    return String(specialty || (user.user_metadata && user.user_metadata.specialty) || '').trim();
                });
            });
        });
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
        if (relaisActif) {
            if (!sessionRelais) return Promise.resolve(null);
            if (sessionRelais.expires_at - MARGE_S > Date.now() / 1000) {
                return Promise.resolve(sessionRelais);
            }
            var generation = generationRelais;
            return demanderSessionQcm().catch(function (err) {
                console.warn('Renouvellement de la session QCM-MAJOR impossible.', err);
                return null;
            }).then(function (s) {
                if (generation !== generationRelais) return null;
                sessionRelais = s;
                if (!s && gate) {
                    verrouiller();
                    message.textContent = 'Session QCM-MAJOR indisponible. Connectez-vous à nouveau.';
                    document.dispatchEvent(new CustomEvent('doctrine:logout'));
                }
                return s;
            });
        }
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
        gate.hidden = !!accesQcm;
        gate.innerHTML =
            '<div class="auth-stage">' +
            '<div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-titre">' +
            '<p class="auth-kicker" aria-hidden="true">ANC / ACCÈS AU CORPUS</p>' +
            '<h1 id="auth-titre">Connexion</h1>' +
            '<p class="auth-intro">Utilisez vos identifiants QCM-MAJOR.FR.</p>' +
            '<p class="auth-etat" id="auth-etat">Vérification de votre session…</p>' +
            '<form id="auth-form" novalidate hidden>' +
            '<label for="auth-email">Adresse email</label>' +
            '<input id="auth-email" type="email" autocomplete="username" inputmode="email" required>' +
            '<label for="auth-mdp">Mot de passe</label>' +
            '<div class="auth-password-field">' +
            '<input id="auth-mdp" type="password" autocomplete="current-password" required>' +
            '<button id="auth-toggle-password" class="auth-password-toggle" type="button" aria-controls="auth-mdp" aria-pressed="false">Afficher</button>' +
            '</div>' +
            '<p class="auth-message" id="auth-message" role="alert" aria-live="assertive"></p>' +
            '<button type="submit" id="auth-submit">Se connecter</button>' +
            '</form>' +
            '<p class="auth-pied" id="auth-pied" hidden>Pas encore de compte ? ' +
            '<a href="' + SIGNUP_URL + '" target="_blank" rel="noopener">Créez-le sur QCM-MAJOR.FR</a>' +
            ' puis revenez ici avec les mêmes identifiants. Aucune nouvelle inscription n’est nécessaire.</p>' +
            '</div>' +
            '<div class="auth-porte" aria-hidden="true"><img src="splash/auth-closing-door-layer.png" alt=""></div>' +
            '</div>';
        document.body.appendChild(gate);
        form = gate.querySelector('#auth-form');
        message = gate.querySelector('#auth-message');
        bouton = gate.querySelector('#auth-submit');
        pied = gate.querySelector('#auth-pied');
        form.addEventListener('submit', soumettre);
        gate.querySelector('#auth-toggle-password').addEventListener('click', function () {
            var champ = gate.querySelector('#auth-mdp');
            var afficher = champ.type === 'password';
            champ.type = afficher ? 'text' : 'password';
            this.textContent = afficher ? 'Masquer' : 'Afficher';
            this.setAttribute('aria-pressed', String(afficher));
        });
    }

    function ouvrirPorte() {
        var porte = gate.querySelector('.auth-porte');
        if (!porte) return;
        porte.classList.remove('ouverte');
        void porte.offsetWidth;
        setTimeout(function () { porte.classList.add('ouverte'); }, 450);
    }

    function montrerFormulaire() {
        gate.querySelector('#auth-etat').hidden = true;
        form.hidden = false;
        pied.hidden = false;
        gate.hidden = false;
        ouvrirPorte();
        var champ = gate.querySelector('#auth-email');
        if (champ && !champ.value) champ.focus();
    }

    function deverrouiller() {
        root.classList.remove('auth-locked');
        if (gate) gate.hidden = true;
        document.dispatchEvent(new CustomEvent('doctrine:login', { detail: { accesQcm: relaisActif } }));
    }

    function fermerArmoirePuisDeverrouiller(s) {
        var porte = gate.querySelector('.auth-porte');
        if (porte) porte.classList.remove('ouverte');

        var mouvementReduit = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(function () {
            setTimeout(function () {
                bouton.disabled = false;
                bouton.textContent = 'Se connecter';
                deverrouiller();
            }, 700);
        }, mouvementReduit ? 0 : 1800);
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
                generationRelais++;
                relaisActif = false;
                sessionRelais = null;
                ecrire(s);
                gate.querySelector('#auth-mdp').value = '';
                bouton.textContent = 'Fermeture en cours…';
                fermerArmoirePuisDeverrouiller(s);
            })
            .catch(function (err) {
                message.textContent = messageErreur(err);
                bouton.disabled = false;
                bouton.textContent = 'Se connecter';
            });
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
        email: function () { var s = lire(); return s ? s.email : ''; },
        retourQcm: function () {
            if (!relaisActif || !sessionRelais || !sessionRelais.user_id ||
                sessionRelais.expires_at <= Date.now() / 1000 || !window.opener || window.opener.closed) return false;
            var status = document.getElementById('qcm-return-status');
            var id = String(++numeroDemande);
            var timer;
            function terminer(message) {
                clearTimeout(timer);
                window.removeEventListener('message', recevoirRetour);
                if (status) status.textContent = message;
            }
            function ouvrirQcm() {
                window.location.assign(SIGNUP_URL);
            }
            function recevoirRetour(event) {
                if (event.source !== window.opener || ORIGINES_QCM.indexOf(event.origin) === -1 ||
                    !event.data || event.data.type !== 'doctrine-return-response' || event.data.id !== id) return;
                terminer('');
                if (!event.data.ok) {
                    ouvrirQcm();
                    return;
                }
                setTimeout(function () {
                    if (!window.closed) ouvrirQcm();
                }, 300);
                try {
                    window.close();
                } catch (error) {
                    console.warn('Fermeture de l’Armoire impossible, retour direct vers QCM-MAJOR.', error);
                }
            }
            try {
                if (status) status.textContent = 'Retour vers QCM-MAJOR en cours…';
                window.addEventListener('message', recevoirRetour);
                timer = setTimeout(function () {
                    terminer('');
                    ouvrirQcm();
                }, 5000);
                ORIGINES_QCM.forEach(function (origine) {
                    window.opener.postMessage({ type: 'doctrine-return-to-qcm', id: id, user_id: sessionRelais.user_id }, origine);
                });
                return true;
            } catch (err) {
                terminer('');
                console.warn('Retour vers QCM-MAJOR impossible.', err);
                return false;
            }
        },
        specialite: chargerSpecialite
    };

    function demarrer() {
        construire();
        var sessionInitiale = accesQcm ? demanderSessionQcm().then(function (s) {
            sessionRelais = s;
            relaisActif = !!s;
            return s;
        }).catch(function (err) {
            console.warn('Connexion via QCM-MAJOR impossible.', err);
            return null;
        }) : verifier();
        sessionInitiale.then(function (s) {
            if (s) deverrouiller(); else montrerFormulaire();
            if (!s && accesQcm) message.textContent = 'Connexion automatique indisponible. Utilisez vos identifiants QCM-MAJOR.';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', demarrer);
    } else {
        demarrer();
    }
})();

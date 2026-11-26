/* Espace Officier Guide indépendant — ne modifie aucun module existant. */
(function () {
    'use strict';

    var root = null;
    var trigger = null;
    var dashboardMode = 'guide';
    var dashboardTitleNode = null;
    var dashboardSubtitleNode = null;
    var statusNode = null;
    var metricsNode = null;
    var coursesNode = null;
    var exerciseLibraryNode = null;
    var exerciseLibraryItems = [];
    var correctionLibraryItems = [];
    var EXERCISE_LEVELS = [
        { value: '1', label: '★ — Initiation', name: 'Initiation' },
        { value: '2', label: '★★ — Bases', name: 'Bases' },
        { value: '3', label: '★★★ — Approfondissement', name: 'Approfondissement' },
        { value: '4', label: '★★★★ — Défi', name: 'Défi' }
    ];
    var candidates = [];
    var courses = [];
    var loading = false;
    var moduleEventsAvailable = true;
    var candidateCvs = Object.create(null);
    var cvStatusAvailable = true;
    var progressRefreshTimer = null;
    var progressRefreshInFlight = false;
    var adminSignalementRefreshTimer = null;

    function auth() { return window.DoctrineAuth; }
    function node(tag, className, text) {
        var item = document.createElement(tag);
        if (className) item.className = className;
        if (text !== undefined && text !== null) item.textContent = text;
        return item;
    }
    function decodeClaims(token) {
        try {
            var part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(decodeURIComponent(escape(atob(part))));
        } catch (_) { return null; }
    }
    // L'accès Officier Guide exige les deux conditions du compte :
    // rôle guide/officier_guide ET champ profiles.speciality exactement égal à OG.
    function currentGuideStatus() {
        if (!auth() || typeof auth().jeton !== 'function') return Promise.resolve(null);
        return auth().jeton().then(function (token) {
            var claims = token && decodeClaims(token);
            if (!claims || !claims.sub) return null;
            var meta = claims.app_metadata || {};
            // Les rôles d'accès sont exclusivement issus des métadonnées sécurisées.
            var role = String(meta.role || '').trim().toLowerCase();
            var guideRole = role === 'guide' || role === 'officier_guide';
            if (!guideRole) return false;

            return fetch(auth().url.replace(/\/$/, '') + '/rest/v1/profiles?id=eq.' +
                encodeURIComponent(claims.sub) + '&select=speciality', {
                method: 'GET',
                headers: {
                    apikey: auth().key,
                    Authorization: 'Bearer ' + token
                }
            }).then(function (response) {
                if (!response.ok) return false;
                return response.json().then(function (profiles) {
                    var profile = Array.isArray(profiles) ? profiles[0] : null;
                    return !!profile && String(profile.speciality || '').trim().toUpperCase() === 'OG';
                });
            }).catch(function () { return false; });
        }).catch(function () { return null; });
    }
    function guideAccess() {
        return currentGuideStatus();
    }
    function adminAccess() {
        if (!auth() || typeof auth().jeton !== 'function') return Promise.resolve(false);
        // Vérifier le rôle côté Supabase avec le même JWT que celui transmis
        // par QCM-MAJOR : le tableau de bord ne dépend pas d'un décodage local
        // potentiellement incomplet des claims.
        return api('rpc/doctrine_is_admin', { method: 'POST', body: {} })
            .then(function (allowed) { return allowed === true; })
            .catch(function () {
                return !!(typeof auth().estAdmin === 'function' && auth().estAdmin());
            });
    }
    function isOgCandidate(candidate) {
        var identity = candidate && candidate.candidate || {};
        return String(identity.specialty || identity.speciality || '').trim().toUpperCase() === 'OG';
    }
    function dashboardScope() {
        return dashboardMode === 'admin' ? 'tous les candidats' : 'votre cohorte';
    }

    function applyGuideModuleVisibility() {
        // État sûr pendant la vérification : afficher les modules candidat 1 à 7,
        // garder le Module 8 et l’espace OG masqués jusqu’à confirmation OG.
        setGuideModulesHidden(false);
        var progressionCard = document.querySelector('.study-dashboard');
        if (progressionCard) progressionCard.hidden = true;
        currentGuideStatus().then(function (isGuide) {
            // Une session absente ou encore en cours de restauration ne doit jamais
            // réafficher les modules : attendre doctrine:login et une identité vérifiée.
            if (isGuide === null) return;
            setGuideModulesHidden(isGuide);
            document.body.classList.toggle('og-guide-entry-only', isGuide);
            if (progressionCard) progressionCard.hidden = isGuide;
            if (isGuide) renderGuideCorpus();
        });
    }

    function setGuideModulesHidden(isGuide) {
        // L'espace Officier Guide est une entrée autonome, hors de la barre
        // de navigation : celle-ci ne présente aucun module à ce profil.
        var moduleNav = document.querySelector('.main-wrapper > nav');
        if (moduleNav) moduleNav.hidden = !!isGuide;
        // Les candidats conservent les modules 1 à 7, mais ne voient jamais
        // le Module 8 réservé au parcours Officier Guide.
        var ids = ['1', '2', '3', '4', '5', '6', '7'];
        ids.forEach(function (id) {
            var button = document.getElementById('btn-mod' + id);
            if (!button) return;
            var item = button.closest('li') || button;
            item.hidden = !!isGuide;
            if (isGuide) item.style.setProperty('display', 'none', 'important');
            else item.style.removeProperty('display');
            button.setAttribute('aria-hidden', String(!!isGuide));
            button.tabIndex = isGuide ? -1 : 0;
        });

        // Le Module 8 ne doit jamais apparaître comme une entrée séparée :
        // un Officier Guide utilise uniquement son Espace Officier Guide.
        var module8Button = document.getElementById('btn-mod8');
        var module8Item = document.getElementById('guideModule8Nav') ||
            (module8Button && (module8Button.closest('li') || module8Button));
        if (module8Item) {
            module8Item.hidden = true;
            module8Item.style.setProperty('display', 'none', 'important');
        }
        if (module8Button) {
            module8Button.setAttribute('aria-hidden', 'true');
            module8Button.tabIndex = -1;
        }

        // Empêche les navigations intermodules depuis l'espace Officier Guide ;
        // les candidats ne peuvent pas non plus accéder au Module 8.
        document.querySelectorAll('.module-nav-button[onclick]').forEach(function (button) {
            var match = button.getAttribute('onclick').match(/navigateModule\(['"]module([1-8])['"]\)/);
            if (!match) return;
            var hidden = !!isGuide || (!isGuide && match[1] === '8');
            button.hidden = hidden;
            if (hidden) button.style.setProperty('display', 'none', 'important');
            else button.style.removeProperty('display');
            button.setAttribute('aria-hidden', String(hidden));
            button.tabIndex = hidden ? -1 : 0;
        });
    }
    function renderGuideCorpus() {
        var section = document.getElementById('corpusPreface');
        var box = section && section.querySelector('.preface-box');
        if (!box) return;
        box.replaceChildren();
        var paragraphs = [
            'Encadrer un candidat au Brevet Militaire de 4e niveau (BM4) constitue un acte de commandement majeur. Au-delà du simple contrôle des connaissances, votre rôle d’officier guide est d’aider le candidat à changer de dimension : quitter sa posture de technicien expert pour adopter la hauteur de vue, l’esprit de synthèse et la capacité de conseil attendus d’un futur major ou officier issu du rang.'
        ];
        paragraphs.forEach(function (content) {
            var p = document.createElement('p');
            p.textContent = content;
            box.append(p);
        });
        var intro = document.createElement('p');
        intro.textContent = 'Pour optimiser son accompagnement, votre action s’articule autour de trois leviers décisifs :';
        box.append(intro);
        var list = document.createElement('ul');
        [
            ['Structurer la durée', 'en l’aidant à sanctuariser ses créneaux de travail et son entraînement physique malgré ses charges opérationnelles.'],
            ['Affûter la méthode', 'par la relecture exigeante de ses synthèses écrites et l’orientation vers les textes doctrinaux et réglementaires essentiels.'],
            ['Forger la posture', 'en organisant des entretiens blancs pour tester sa solidité face au jury et ancrer son positionnement de futur cadre supérieur.']
        ].forEach(function (entry) {
            var li = document.createElement('li');
            var strong = document.createElement('strong');
            strong.textContent = entry[0];
            li.append(strong, document.createTextNode(', ' + entry[1]));
            list.append(li);
        });
        box.append(list);
        var conclusion = document.createElement('p');
        conclusion.textContent = 'Votre exigence bienveillante et votre expérience du commandement sont les meilleurs catalyseurs de sa réussite. Soyez le guide qui transforme son potentiel en excellence.';
        box.append(conclusion);
        var signature = document.createElement('p');
        signature.style.textAlign = 'right';
        signature.style.marginTop = '20px';
        var author = document.createElement('strong');
        author.textContent = 'Major Dominique';
        signature.append(author, document.createElement('br'));
        var distinction = document.createElement('em');
        distinction.textContent = 'Officier guide BM2 et BM4';
        signature.append(distinction);
        box.append(signature);
    }
    function api(path, options) {
        options = options || {};
        return auth().jeton().then(function (token) {
            if (!token) throw new Error('Session expirée. Reconnectez-vous.');
            var headers = { apikey: auth().key, Authorization: 'Bearer ' + token };
            if (options.body !== undefined) headers['Content-Type'] = 'application/json';
            if (options.prefer) headers.Prefer = options.prefer;
            return fetch(auth().url.replace(/\/$/, '') + '/rest/v1/' + path, {
                method: options.method || 'GET',
                headers: headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body)
            });
        }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (payload) {
                if (!response.ok) throw new Error(payload.message || payload.details || 'Erreur HTTP ' + response.status);
                return payload;
            });
        });
    }
    function functionsApi(path, options) {
        options = options || {};
        return auth().jeton().then(function (token) {
            if (!token) throw new Error('Session expirée. Reconnectez-vous.');
            var headers = { apikey: auth().key, Authorization: 'Bearer ' + token };
            if (options.body !== undefined) headers['Content-Type'] = 'application/json';
            return fetch((auth().url.endsWith('/') ? auth().url.slice(0, -1) : auth().url) + path, {
                method: options.method || 'POST',
                headers: headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body)
            });
        }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (payload) {
                if (!response.ok) {
                    var error = new Error(payload.message || payload.msg || payload.error || 'Erreur fonction IA HTTP ' + response.status);
                    error.status = response.status;
                    throw error;
                }
                return payload;
            });
        });
    }
    function storageApi(path, options) {
        options = options || {};
        return auth().jeton().then(function (token) {
            if (!token) throw new Error('Session expirée. Reconnectez-vous.');
            var headers = { apikey: auth().key, Authorization: 'Bearer ' + token };
            if (options.body !== undefined) headers['Content-Type'] = 'application/json';
            return fetch(auth().url.replace(/\/$/, '') + '/storage/v1/' + path, {
                method: options.method || 'GET',
                headers: headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body)
            });
        }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (payload) {
                if (!response.ok) throw new Error(payload.message || payload.error || 'Erreur stockage HTTP ' + response.status);
                return payload;
            });
        });
    }
    function setStatus(message, error) {
        statusNode.textContent = message || '';
        statusNode.classList.toggle('og-dashboard-error', !!error);
    }
    function safeDriveUrl(value) {
        var url = String(value || '').trim();
        if (!/^https:\/\/(?:drive\.google\.com|docs\.google\.com)\//i.test(url)) return '';
        return url;
    }
    function openDriveInViewer(value, title) {
        var viewer = window.DoctrineViewer;
        try { if (window.top && window.top.DoctrineViewer) viewer = window.top.DoctrineViewer; } catch (_) {}
        if (!viewer || typeof viewer.openDrive !== 'function' || !viewer.openDrive(value, title, 'exercices-corrections')) {
            if (statusNode) setStatus('La visionneuse intégrée est indisponible. Actualisez DOCTRINE puis réessayez.', true);
            return false;
        }
        return true;
    }
    function driveDownload(value) {
        var url = safeDriveUrl(value);
        if (!url) return '';
        var match = url.match(/\/(?:file|document|spreadsheets|presentation|forms)\/d\/([a-zA-Z0-9_-]+)/);
        var id = match ? match[1] : new URL(url).searchParams.get('id');
        return id ? 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id) : url;
    }
    function candidateName(candidate) {
        var identity = candidate.candidate || {};
        return [identity.grade, identity.name].filter(Boolean).join(' ') || identity.email || 'Candidat';
    }
    function qcmResults(candidate) {
        return candidate.qcm && Array.isArray(candidate.qcm.results) ? candidate.qcm.results : [];
    }
    function qcmAverage(candidate) {
        var scores = qcmResults(candidate).map(function (result) { return Number(result.score); })
            .filter(function (score) { return Number.isFinite(score); });
        return scores.length ? scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length : null;
    }
    function submissions(candidate) {
        return candidate.doctrine && Array.isArray(candidate.doctrine.submissions) ? candidate.doctrine.submissions : [];
    }
    function validSubmissions(candidate) {
        return submissions(candidate).filter(function (submission) {
            return (submission.reviews || []).some(function (review) { return review.status === 'valide'; });
        }).length;
    }
    function candidateFollowUpStatus(candidate) {
        var score = qcmAverage(candidate);
        var activity = Date.parse(candidate.doctrine && candidate.doctrine.last_activity || '');
        if (score !== null && score < 10) return { label: 'EN DIFFICULTÉ', className: 'is-danger', ready: false };
        if (score === null || !Number.isFinite(activity) || Date.now() - activity > 14 * 86400000) {
            return { label: 'À SURVEILLER', className: 'is-warning', ready: false };
        }
        return { label: 'PRÊT', className: 'is-ok', ready: true };
    }
    function attention(candidate) {
        return !candidateFollowUpStatus(candidate).ready;
    }
    // Affiche systématiquement les six thèmes, même lorsqu'aucune note n'est enregistrée.
    function qcmThemeSummary(results) {
        var groups = Object.create(null);
        for (var number = 1; number <= 6; number += 1) {
            groups['theme-' + number] = { number: number, theme: 'Thème ' + number, scores: [], count: 0 };
        }
        // ALL est un thème transversal distinct des six thèmes numérotés.
        groups.all = { number: 7, theme: 'ALL', scores: [], count: 0 };
        results.forEach(function (result) {
            var score = Number(result.score);
            if (!Number.isFinite(score)) return;
            var label = String(result.theme || result.theme_name || result.category || '').trim();
            if (/^all$/i.test(label)) {
                groups.all.scores.push(score);
                groups.all.count += 1;
                return;
            }
            // Les résultats Supabase peuvent porter « Thème 1 », « Module 1 » ou « 1. ... ».
            var numberMatch = label.match(/^\s*(?:(?:th[eè]me|theme|module)\s*)?([1-6])\b/i);
            var explicitNumber = Number(result.theme_number || result.module_number || result.theme_id || result.module_id);
            var themeNumber = numberMatch ? Number(numberMatch[1]) :
                (Number.isInteger(explicitNumber) && explicitNumber >= 1 && explicitNumber <= 6 ? explicitNumber : null);
            if (!themeNumber) return;
            var key = 'theme-' + themeNumber;
            // Conserver l'intitulé réel Supabase dès qu'un résultat existe pour ce thème.
            if (groups[key].count === 0 && label) groups[key].theme = label;
            groups[key].scores.push(score);
            groups[key].count += 1;
        });
        return Object.keys(groups).map(function (key) {
            var item = groups[key];
            item.average = item.scores.length
                ? item.scores.reduce(function (sum, value) { return sum + value; }, 0) / item.scores.length
                : null;
            return item;
        }).sort(function (left, right) {
            return left.number - right.number;
        });
    }
    function renderQcmCandidateDetail(target, candidate) {
        target.replaceChildren();
        var results = qcmResults(candidate).filter(function (result) {
            return result.score !== null && result.score !== undefined && result.score !== '' && Number.isFinite(Number(result.score));
        }).slice().sort(function (left, right) { return Date.parse(right.created_at || '') - Date.parse(left.created_at || ''); });
        var average = qcmAverage(candidate);
        var themes = qcmThemeSummary(results);
        var evaluatedThemes = themes.filter(function (theme) { return theme.count > 0; }).length;
        target.append(node('h3', 'og-qcm-detail-title', (candidate.candidate || {}).name || 'Candidat'));
        var summary = node('div', 'og-qcm-detail-summary');
        [['Moyenne générale', average === null ? 'Non disponible' : average.toFixed(2) + ' / 20'],
            ['QCM enregistrés', String(results.length)], ['Thèmes évalués', String(evaluatedThemes)]]
            .forEach(function (entry) {
                var item = node('article', 'og-qcm-summary-item');
                item.append(node('span', '', entry[0]), node('strong', '', entry[1]));
                summary.append(item);
            });
        target.append(summary, node('h4', 'og-qcm-section-title', 'Histogramme des notes par thème'));
        var chart = node('div', 'og-qcm-theme-chart');
        themes.forEach(function (theme) {
            var row = node('article', 'og-qcm-theme-row');
            var heading = node('div', 'og-qcm-theme-heading');
            heading.append(node('strong', '', theme.theme),
                node('span', '', theme.average === null ? 'Aucune note' : theme.average.toFixed(2) + ' / 20'));
            var track = node('div', 'og-qcm-bar-track');
            track.setAttribute('role', 'img');
            track.setAttribute('aria-label', theme.theme + ' : ' +
                (theme.average === null ? 'aucune note enregistrée' : theme.average.toFixed(2) + ' sur 20'));
            var bar = node('span', 'og-qcm-bar');
            bar.style.width = theme.average === null ? '0%' : Math.max(0, Math.min(100, theme.average / 20 * 100)) + '%';
            track.append(bar);
            row.append(heading, track, node('small', 'og-qcm-theme-meta',
                theme.count + ' QCM enregistré(s)'));
            chart.append(row);
        });
        target.append(chart);
        var historySection = node('section', 'og-qcm-history-section');
        var historyToggle = node('button', 'og-qcm-history-toggle', 'Historique complet des résultats enregistrés');
        historyToggle.type = 'button';
        historyToggle.setAttribute('aria-expanded', 'false');
        var historyContent = node('div', 'og-qcm-history-content');
        historyContent.hidden = true;
        var history = node('div', 'og-qcm-history');
        results.forEach(function (result) {
            var row = node('article', 'og-qcm-history-row');
            var copy = node('div', 'og-qcm-history-copy');
            copy.append(node('strong', '', result.theme || 'Thème non renseigné'));
            var date = result.created_at && Number.isFinite(Date.parse(result.created_at))
                ? new Date(result.created_at).toLocaleString('fr-FR') : 'Date non renseignée';
            copy.append(node('small', '', date));
            row.append(copy, node('strong', 'og-qcm-history-score', Number(result.score).toFixed(2) + ' / 20'));
            history.append(row);
        });
        if (!results.length) history.append(node('p', 'og-qcm-empty', 'Aucun résultat enregistré dans Supabase.'));
        historyContent.append(history);
        historyToggle.addEventListener('click', function () {
            var expanded = historyToggle.getAttribute('aria-expanded') === 'true';
            historyToggle.setAttribute('aria-expanded', String(!expanded));
            historyContent.hidden = expanded;
            historyToggle.classList.toggle('is-expanded', !expanded);
        });
        historySection.append(historyToggle, historyContent);
        target.append(historySection);
    }
        function openGuideQcmTracking() {
        // Le suivi QCM-MAJOR conserve sa présentation historique. Les vérifications couvrent aussi le nouvel emplacement des comptes.
        var qcmCandidates = dashboardMode === 'admin' ? candidates.filter(function (candidate) { return !isOgCandidate(candidate); }) : candidates;
        var dialog = node('dialog', 'og-qcm-tracking-dialog');
        var panel = node('section', 'og-qcm-tracking-panel');
        var header = node('header', 'og-qcm-tracking-header');
        var heading = node('div');
        heading.append(node('p', 'og-dashboard-kicker', dashboardMode === 'admin' ? 'ESPACE ADMINISTRATEUR / SUIVI GLOBAL' : 'ESPACE OFFICIER GUIDE / COHORTE'));
        heading.append(node('h2', '', 'Suivi QCM-MAJOR'));
        heading.append(node('p', 'og-dashboard-muted', qcmCandidates.length + ' candidat(s) dans ' + dashboardScope()));
        var closeButton = node('button', 'og-dashboard-close', 'Fermer');
        closeButton.type = 'button';
        closeButton.addEventListener('click', function () { dialog.close(); dialog.remove(); });
        header.append(heading, closeButton);
        panel.append(header);
        var layout = node('div', 'og-qcm-tracking-layout');
        var list = node('nav', 'og-qcm-candidate-list');
        list.setAttribute('aria-label', dashboardMode === 'admin' ? 'Tous les candidats' : 'Candidats de ma cohorte');
        var detail = node('section', 'og-qcm-candidate-detail');
        detail.setAttribute('aria-live', 'polite');
        detail.append(node('p', 'og-qcm-empty', 'Sélectionnez le nom d’un candidat pour afficher ses notes par thème et son historique.'));
        var ogDetails = null;
        var ogList = null;
        if (dashboardMode === 'admin') {
            ogDetails = node('details', 'og-dashboard-candidate-group og-dashboard-admin-og-group');
            ogDetails.open = true;
            var ogSummary = node('summary', 'og-dashboard-candidate-group-heading', 'CANDIDATS QCM-MAJOR');
            ogDetails.append(ogSummary);
            ogList = node('div', 'og-dashboard-candidate-group-items');
            ogDetails.append(ogList);
            list.append(ogDetails);
        }
        var firstVisibleQcmButton = null;
        var adminOgCandidates = dashboardMode === 'admin' ? qcmCandidates : [];
        var adminOgIndex = 0;
        var adminOgNavigator = null;

        function selectQcmCandidate(candidate, selectedButton) {
            list.querySelectorAll('.og-qcm-candidate-button').forEach(function (item) {
                item.classList.remove('is-selected');
                item.setAttribute('aria-pressed', 'false');
            });
            if (selectedButton) {
                selectedButton.classList.add('is-selected');
                selectedButton.setAttribute('aria-pressed', 'true');
            }
            renderQcmCandidateDetail(detail, candidate);
        }

        function renderAdminOgNavigator() {
            if (!adminOgNavigator) return;
            adminOgNavigator.replaceChildren();
            if (!adminOgCandidates.length) {
                adminOgNavigator.append(node('p', 'og-qcm-empty', 'Aucun candidat QCM-MAJOR disponible.'));
                return;
            }
            var candidate = adminOgCandidates[adminOgIndex];
            var average = qcmAverage(candidate);
            var results = qcmResults(candidate);
            var controls = node('div', 'og-qcm-og-navigation');
            var previous = node('button', 'og-qcm-og-arrow', '‹');
            previous.type = 'button';
            previous.setAttribute('aria-label', 'Candidat précédent');
            previous.disabled = adminOgIndex === 0;
            previous.addEventListener('click', function () {
                if (adminOgIndex <= 0) return;
                adminOgIndex -= 1;
                renderAdminOgNavigator();
                selectQcmCandidate(adminOgCandidates[adminOgIndex]);
            });
            var identity = node('div', 'og-qcm-og-identity');
            identity.append(
                node('strong', '', candidateName(candidate)),
                node('span', '', (average === null ? 'Aucune note' : average.toFixed(2) + ' / 20') +
                    ' · ' + results.length + ' résultat(s)'),
                node('small', '', 'Candidat ' + (adminOgIndex + 1) + ' / ' + adminOgCandidates.length)
            );
            var next = node('button', 'og-qcm-og-arrow', '›');
            next.type = 'button';
            next.setAttribute('aria-label', 'Candidat suivant');
            next.disabled = adminOgIndex >= adminOgCandidates.length - 1;
            next.addEventListener('click', function () {
                if (adminOgIndex >= adminOgCandidates.length - 1) return;
                adminOgIndex += 1;
                renderAdminOgNavigator();
                selectQcmCandidate(adminOgCandidates[adminOgIndex]);
            });
            controls.append(previous, identity, next);
            adminOgNavigator.append(controls);
        }

        candidates.forEach(function (candidate) {
            if (dashboardMode === 'admin' || isOgCandidate(candidate)) return;
            var average = qcmAverage(candidate);
            var results = qcmResults(candidate);
            var button = node('button', 'og-qcm-candidate-button');
            button.type = 'button';
            button.append(node('strong', '', candidateName(candidate)));
            button.append(node('span', '', (average === null ? 'Aucune note' : average.toFixed(2) + ' / 20') + ' · ' + results.length + ' résultat(s)'));
            if (!firstVisibleQcmButton) firstVisibleQcmButton = button;
            button.setAttribute('aria-pressed', 'false');
            button.addEventListener('click', function () {
                selectQcmCandidate(candidate, button);
            });
            list.append(button);
        });

        if (dashboardMode === 'admin' && ogList) {
            adminOgNavigator = node('div', 'og-qcm-og-navigator');
            ogList.append(adminOgNavigator);
            renderAdminOgNavigator();
            if (adminOgCandidates.length) selectQcmCandidate(adminOgCandidates[0]);
        }
        if (dashboardMode !== 'admin' || !adminOgCandidates.length) {
            if (firstVisibleQcmButton) firstVisibleQcmButton.click();
        }
        if (!qcmCandidates.length) list.append(node('p', 'og-qcm-empty', 'Aucun candidat QCM-MAJOR disponible.'));
        if (dashboardMode === 'admin' && !firstVisibleQcmButton && adminOgCandidates.length) {
            selectQcmCandidate(adminOgCandidates[0]);
        }
        layout.append(list, detail);
        panel.append(layout);
        dialog.append(panel);
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) { dialog.close(); dialog.remove(); }
        });
        document.body.append(dialog);
        dialog.showModal();
    }
    // Fiche individuelle : données issues des sources DOCTRINE, sans dupliquer les statistiques QCM.
    // Les indicateurs de la fiche sont calculés à partir des événements et dépôts réellement chargés.
    function renderCandidateProfileDetail(target, candidate) {
        target.replaceChildren();
        var identity = candidate.candidate || {};
        var pseudo = String(identity.pseudo || identity.name || '').trim() || 'Pseudo non renseigné';
        var doctrine = candidate.doctrine || {};
        var dossierItems = submissions(candidate);
        var validatedSubmissions = dossierItems.filter(function (submission) {
            return (Array.isArray(submission.reviews) ? submission.reviews : []).some(function (review) {
                return review.status === 'valide';
            });
        }).length;
        var lastActivity = doctrine.last_activity;
        var profileHero = node('section', 'og-candidate-profile-hero');
        var identityCard = node('div', 'og-candidate-profile-identity');
        var identityCopy = node('div', 'og-candidate-profile-identity-copy');
        identityCopy.append(node('p', 'og-dashboard-kicker', 'FICHE CANDIDAT'));
        identityCopy.append(node('strong', 'og-candidate-profile-pseudo', pseudo));
        if (identity.specialty) identityCopy.append(node('p', '', 'Spécialité : ' + identity.specialty));
        if (identity.email) identityCopy.append(node('p', '', 'E-mail : ' + identity.email));
        identityCard.append(identityCopy);
        var summary = node('div', 'og-candidate-profile-summary-card');
        var lastActivityDate = lastActivity && Number.isFinite(Date.parse(lastActivity))
            ? new Date(lastActivity).toLocaleDateString('fr-FR') : 'Non renseignée';
        [
            ['Fiches soumises', String(dossierItems.length)],
            ['Fiches validées', String(validatedSubmissions)],
            ['Dernière activité', lastActivityDate]
        ].forEach(function (entry) {
            var metric = node('div', 'og-candidate-profile-summary-item');
            metric.append(node('span', '', entry[0]), node('strong', '', entry[1]));
            summary.append(metric);
        });
        profileHero.append(summary, identityCard);
        target.append(profileHero);

        function accordion(title, className, contentBuilder) {
            var details = node('details', 'og-candidate-profile-accordion' + (className ? ' ' + className : ''));
            details.append(node('summary', '', title));
            var content = node('div', 'og-candidate-profile-accordion-content');
            contentBuilder(content);
            details.append(content);
            target.append(details);
            return details;
        }

        var progressSection = node('section', 'og-candidate-profile-progress-card');
        progressSection.append(node('h4', '', 'Progression des modules 1 à 7'));
        var progressGrid = node('div', 'og-candidate-profile-progress-grid');
        for (var moduleNumber = 1; moduleNumber <= 7; moduleNumber += 1) {
            var moduleEvents = (Array.isArray(doctrine.progress_events) ? doctrine.progress_events : [])
                .filter(function (event) {
                    return Number(String(event.module_id || '').match(/\\d+/)?.[0]) === moduleNumber;
                });
            var status = moduleState(candidate, String(moduleNumber));
            var progressRow = node('article', 'og-candidate-profile-module-row ' + status.className);
            var copy = node('div', 'og-candidate-profile-module-copy');
            copy.append(node('strong', '', String(moduleNumber)));
            copy.append(node('span', '', status.label));
            var track = node('div', 'og-candidate-profile-module-track');
            track.setAttribute('role', 'img');
            track.setAttribute('aria-label', 'Module ' + moduleNumber + ' : ' + status.label);
            var fill = node('span', 'og-candidate-profile-module-fill');
            fill.style.width = status.className === 'is-ok' ? '100%' :
                status.className === 'is-warning' ? '50%' : '0%';
            track.append(fill);
            progressRow.append(copy, track);
            if (moduleEvents.length) {
                var meta = node('small', 'og-candidate-profile-module-meta',
                    moduleEvents.length + ' activité(s) enregistrée(s)');
                progressRow.append(meta);
            }
            progressGrid.append(progressRow);
        }
        if (!moduleEventsAvailable) {
            progressGrid.prepend(node('p', 'og-qcm-empty', 'Les données de progression sont momentanément indisponibles.'));
        }
        progressSection.append(progressGrid);
        accordion('Progression des modules 1 à 7', 'og-candidate-profile-progress', function (content) {
            content.append(progressSection);
        });

        accordion('Suivi d’admission', 'og-candidate-profile-admission', function (content) {
            content.append(renderOralTracking(candidate));
            content.append(renderCcpmTracking(candidate));
        });

        accordion('Dossier et documents demandés', 'og-candidate-profile-dossiers', function (content) {
            if (!dossierItems.length) content.append(node('p', 'og-qcm-empty', 'Aucun dossier déposé.'));
            dossierItems.forEach(function (submission) {
                var item = node('article', 'og-candidate-profile-submission');
                var title = [submission.dossier, submission.submission_type].filter(Boolean).join(' · ') || 'Dossier';
                item.append(node('strong', '', title));
                if (submission.created_at && Number.isFinite(Date.parse(submission.created_at))) {
                    item.append(node('small', '', 'Déposé le ' + new Date(submission.created_at).toLocaleString('fr-FR')));
                }
                var reviews = Array.isArray(submission.reviews) ? submission.reviews : [];
                if (!reviews.length) item.append(node('p', '', 'Aucune évaluation enregistrée.'));
                reviews.forEach(function (review) {
                    var reviewText = [];
                    if (review.grade !== null && review.grade !== undefined) reviewText.push('Note : ' + review.grade + ' / 20');
                    if (review.status) reviewText.push('Statut : ' + review.status);
                    if (review.comment) reviewText.push('Observation : ' + review.comment);
                    if (review.reviewed_at && Number.isFinite(Date.parse(review.reviewed_at))) {
                        reviewText.push('Évalué le ' + new Date(review.reviewed_at).toLocaleDateString('fr-FR'));
                    }
                    if (reviewText.length) item.append(node('p', '', reviewText.join(' · ')));
                });
                content.append(item);
            });
            var cv = candidateCvs[candidate.candidate && candidate.candidate.id];
            var documents = node('section', 'og-candidate-profile-documents');
            documents.append(node('h4', '', 'Documents transmis'));
            if (cv) {
                documents.append(node('p', 'og-candidate-profile-line',
                    (cv.original_filename || 'CV candidat') + (cv.uploaded_at && Number.isFinite(Date.parse(cv.uploaded_at))
                        ? ' · Transmis le ' + new Date(cv.uploaded_at).toLocaleDateString('fr-FR') : '')));
                var downloadCvButton = node('button', 'og-dashboard-ai-action', 'Télécharger le document');
                downloadCvButton.type = 'button';
                downloadCvButton.addEventListener('click', function () {
                    downloadCandidateCv(candidate, cv, downloadCvButton);
                });
                documents.append(downloadCvButton);
            } else {
                documents.append(node('p', 'og-qcm-empty', cvStatusAvailable
                    ? 'Aucun document transmis dans le suivi des CV.'
                    : 'État des documents momentanément indisponible.'));
            }
            content.append(documents);
        });

        // La correction IA apparaît immédiatement sous « Dossier et documents demandés ».
        // L’officier conserve la validation finale de l’évaluation. La correction reste présentée dans la fiche de suivi.
        target.append(renderAiCorrection(candidate));
    }

    function openGuideCandidates() {
        var dialog = node('dialog', 'og-qcm-tracking-dialog og-candidate-list-dialog');
        var panel = node('section', 'og-qcm-tracking-panel');
        var header = node('header', 'og-qcm-tracking-header');
        var heading = node('div');
        heading.append(node('p', 'og-dashboard-kicker', dashboardMode === 'admin' ? 'ESPACE ADMINISTRATEUR / SUIVI GLOBAL' : 'ESPACE OFFICIER GUIDE / COHORTE'));
        heading.append(node('h2', '', dashboardMode === 'admin' ? 'CANDIDATS — TOUS LES COMPTES' : 'CANDIDATS — COHORTE RATTACHÉE'));
        heading.append(node('p', 'og-dashboard-muted', 'Utilisez les flèches pour passer d’un candidat à l’autre et afficher sa fiche individuelle.'));
        var closeButton = node('button', 'og-dashboard-close', 'Fermer');
        closeButton.type = 'button';
        closeButton.addEventListener('click', function () { dialog.close(); dialog.remove(); });
        header.append(heading, closeButton);
        panel.append(header);
        var workspace = node('div', 'og-candidate-workspace og-admin-users-layout');
        var sidebar = node('div', 'og-admin-users-sidebar');
        var regularCandidates = dashboardMode === 'admin' ? candidates.filter(function (candidate) { return !isOgCandidate(candidate); }) : candidates.slice();
        var ogCandidates = dashboardMode === 'admin' ? candidates.filter(isOgCandidate) : [];
        regularCandidates.sort(function (first, second) {
            var a = first.candidate || {}; var b = second.candidate || {};
            return String(a.pseudo || a.name || a.email || '').localeCompare(String(b.pseudo || b.name || b.email || ''), 'fr', { sensitivity: 'base' });
        });
        var group = node('section', 'og-dashboard-candidate-group og-dashboard-admin-candidate-group');
        group.append(node('div', 'og-dashboard-candidate-group-heading', (dashboardMode === 'admin' ? 'CANDIDATS QCM-MAJOR — ' : 'CANDIDATS DE LA COHORTE — ') + regularCandidates.length + ' candidat(s)'));
        var detail = node('section', 'og-qcm-candidate-detail og-candidate-profile-detail');
        detail.setAttribute('aria-live', 'polite');
        var navigator = node('div', 'og-candidate-stepper');
        var previousButton = node('button', 'og-candidate-stepper-arrow', '‹');
        previousButton.type = 'button'; previousButton.setAttribute('aria-label', 'Candidat précédent');
        var current = node('div', 'og-candidate-stepper-current');
        var currentName = node('strong', 'og-candidate-stepper-name', 'Aucun candidat');
        var currentStatus = node('span', 'og-candidate-stepper-status', 'Aucun compte à afficher');
        var currentPosition = node('span', 'og-candidate-stepper-position', 'Candidat 0 / 0');
        current.append(currentName, currentStatus, currentPosition);
        var nextButton = node('button', 'og-candidate-stepper-arrow', '›');
        nextButton.type = 'button'; nextButton.setAttribute('aria-label', 'Candidat suivant');
        navigator.append(previousButton, current, nextButton); group.append(navigator); sidebar.append(group);
        var selectedIndex = 0;
        function showCandidate(index) {
            if (!regularCandidates.length) {
                currentName.textContent = 'Aucun candidat'; currentStatus.textContent = 'Aucun compte à afficher'; currentPosition.textContent = 'Candidat 0 / 0';
                previousButton.disabled = true; nextButton.disabled = true;
                detail.replaceChildren(node('p', 'og-qcm-empty', 'Aucun candidat n’est disponible.')); return;
            }
            selectedIndex = Math.max(0, Math.min(index, regularCandidates.length - 1));
            var candidate = regularCandidates[selectedIndex]; var identity = candidate.candidate || {};
            var dossierCount = submissions(candidate).length;
            var followUp = candidateFollowUpStatus(candidate);
            currentName.textContent = identity.pseudo || identity.name || identity.email || 'Pseudo non renseigné';
            currentStatus.className = 'og-candidate-stepper-status og-candidate-follow-up-status ' + followUp.className;
            currentStatus.hidden = dossierCount === 0;
            currentStatus.textContent = dossierCount ? dossierCount + ' fiche(s) soumise(s) · ' + dossierCount + ' résultat(s)' : '';
            currentPosition.textContent = 'Candidat ' + (selectedIndex + 1) + ' / ' + regularCandidates.length;
            previousButton.disabled = selectedIndex === 0; nextButton.disabled = selectedIndex === regularCandidates.length - 1;
            renderCandidateProfileDetail(detail, candidate);
        }
        previousButton.addEventListener('click', function () { showCandidate(selectedIndex - 1); });
        nextButton.addEventListener('click', function () { showCandidate(selectedIndex + 1); });
        if (dashboardMode === 'admin') {
            var ogGroup = node('details', 'og-dashboard-candidate-group og-dashboard-admin-og-group');
            ogGroup.append(node('summary', 'og-dashboard-candidate-group-heading', 'OFFICIERS GUIDES — ' + ogCandidates.length + ' compte(s)'));
            var ogGroupItems = node('div', 'og-dashboard-candidate-group-items');
            var ogCandidateList = node('nav', 'og-qcm-candidate-list'); ogCandidateList.setAttribute('aria-label', 'Officiers Guides');
            ogCandidates.forEach(function (candidate) {
                var identity = candidate.candidate || {}; var button = node('button', 'og-qcm-candidate-button'); button.type = 'button';
                button.append(node('strong', '', identity.pseudo || identity.name || identity.email || 'Pseudo non renseigné'));
                button.append(node('span', '', identity.email || identity.specialty || 'Profil à compléter'));
                button.addEventListener('click', function () { renderCandidateProfileDetail(detail, candidate); }); ogCandidateList.append(button);
            });
            if (!ogCandidates.length) ogCandidateList.append(node('p', 'og-qcm-empty', 'Aucun Officier Guide.'));
            ogGroupItems.append(ogCandidateList); ogGroup.append(ogGroupItems); sidebar.append(ogGroup);
        }
        workspace.append(sidebar, detail); panel.append(workspace); showCandidate(0);
        dialog.append(panel);
        dialog.addEventListener('click', function (event) { if (event.target === dialog) { dialog.close(); dialog.remove(); } });
        document.body.append(dialog); dialog.showModal();
    }

    function refreshAdminSignalementBadge(badge) {
        if (dashboardMode !== 'admin' || !badge) return;
        Promise.all([
            api('guide_signalements?select=id,status&limit=500'),
            api('doctrine_signalements?select=id,status&limit=500'),
            api('question_reports?select=id,status&limit=500')
        ]).then(function (sources) {
            var pending = sources.reduce(function (total, rows) {
                return total + (Array.isArray(rows) ? rows.filter(function (row) {
                    return !['resolved', 'closed'].includes(String(row.status || '').toLowerCase());
                }).length : 0);
            }, 0);
            badge.textContent = String(pending);
            badge.hidden = pending === 0;
            badge.setAttribute('aria-label', pending + ' signalement(s) en attente de traitement');
        }).catch(function () {
            // En cas d'indisponibilité temporaire, ne pas afficher un compteur trompeur.
            badge.hidden = true;
        });
    }

    function renderMetrics() {
        metricsNode.replaceChildren();
        var ready = candidates.filter(function (candidate) { return !attention(candidate); }).length;
        [
            ['COMPTES UTILISATEURS', candidates.length, dashboardMode === 'admin' ? 'candidats et Officiers Guides' : 'cohorte rattachée']
        ].forEach(function (metric) {
            var card = node('button', 'og-dashboard-metric og-dashboard-metric-action og-dashboard-candidates-tracking');
            card.type = 'button';
            card.dataset.guideAction = 'candidates-tracking';
            card.addEventListener('click', openGuideCandidates);
            card.append(node('span', 'og-dashboard-metric-label', metric[0]));
            card.append(node('strong', 'og-dashboard-metric-value', String(metric[1])));
            card.append(node('small', '', metric[2]));
            metricsNode.append(card);
        });

        if (dashboardMode === 'admin') {
            var questionBankCard = node('button', 'og-dashboard-metric og-dashboard-metric-action og-dashboard-qcm-questions');
            questionBankCard.type = 'button';
            questionBankCard.dataset.guideAction = 'qcm-major-questions';
            questionBankCard.append(node('span', 'og-dashboard-metric-label', 'GESTION DES QUESTIONS QCM-MAJOR'));
            questionBankCard.append(node('strong', 'og-dashboard-metric-value', 'Gérer'));
            questionBankCard.append(node('small', '', 'Ajouter, modifier, supprimer, classer et rechercher'));
            questionBankCard.addEventListener('click', function () {
                if (window.DoctrineQcmQuestions && typeof window.DoctrineQcmQuestions.open === 'function') {
                    window.DoctrineQcmQuestions.open();
                } else {
                    window.alert('Le gestionnaire de questions QCM-MAJOR n’est pas disponible. Actualisez la page.');
                }
            });
            metricsNode.append(questionBankCard);
        } else {
            var attentionCard = node('article', 'og-dashboard-metric');
            attentionCard.append(node('span', 'og-dashboard-metric-label', 'À ACCOMPAGNER'));
            attentionCard.append(node('strong', 'og-dashboard-metric-value', String(candidates.length - ready)));
            attentionCard.append(node('small', '', 'activité ou résultats à suivre'));
            metricsNode.append(attentionCard);
        }

        var qcmTrackingCard = node('button', 'og-dashboard-metric og-dashboard-metric-action og-dashboard-qcm-tracking');
        qcmTrackingCard.type = 'button';
        qcmTrackingCard.dataset.guideAction = 'qcm-major-tracking';
        qcmTrackingCard.append(node('span', 'og-dashboard-metric-label', 'SUIVI QCM-MAJOR'));
        qcmTrackingCard.append(node('strong', 'og-dashboard-metric-value', String(candidates.length)));
        qcmTrackingCard.append(node('small', '', 'Suivi individuel par candidat de ma cohorte'));
        qcmTrackingCard.addEventListener('click', openGuideQcmTracking);
        metricsNode.append(qcmTrackingCard);
        var assignCard = node('button', 'og-dashboard-metric og-dashboard-metric-action');
        assignCard.type = 'button';
        assignCard.append(node('span', 'og-dashboard-metric-label', 'RATTACHER UN CANDIDAT'));
        assignCard.append(node('strong', 'og-dashboard-metric-value', '+'));
        assignCard.append(node('small', '', 'Associer à ma cohorte'));
        assignCard.addEventListener('click', openAssignCandidateDialog);
        metricsNode.append(assignCard);

        [
            { kind: 'retex', title: 'RETOUR D’EXPÉRIENCE OFFICIER GUIDE', subtitle: 'Analyser une situation et partager les enseignements', symbol: '↗' },
            { kind: 'signalement', title: 'SIGNALEMENT OFFICIER GUIDE', subtitle: 'Déclarer une difficulté et demander une intervention', symbol: '!' }
        ].forEach(function (definition) {
            var card = node('button', 'og-dashboard-metric og-dashboard-metric-action');
            card.type = 'button';
            card.dataset.guideFeedback = definition.kind;
            card.append(node('span', 'og-dashboard-metric-label', definition.title));
            card.append(node('strong', 'og-dashboard-metric-value', definition.symbol));
            card.append(node('small', '', definition.subtitle));
            if (definition.kind === 'signalement' && dashboardMode === 'admin') {
                card.style.position = 'relative';
                var signalementBadge = node('span', 'og-dashboard-signalement-badge', '0');
                signalementBadge.hidden = true;
                signalementBadge.setAttribute('role', 'status');
                signalementBadge.setAttribute('aria-live', 'polite');
                signalementBadge.style.cssText = 'position:absolute;top:9px;right:10px;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:#c93636;color:#fff;font-size:13px;font-weight:800;line-height:24px;text-align:center;box-sizing:border-box;box-shadow:0 0 0 2px rgba(255,255,255,.18)';
                card.append(signalementBadge);
                refreshAdminSignalementBadge(signalementBadge);
                if (adminSignalementRefreshTimer) clearInterval(adminSignalementRefreshTimer);
                adminSignalementRefreshTimer = setInterval(function () {
                    refreshAdminSignalementBadge(signalementBadge);
                }, 30000);
            }
            card.addEventListener('click', function () {
                if (definition.kind === 'signalement' && dashboardMode === 'admin') openAdminSignalements();
                else if (definition.kind === 'retex' && dashboardMode === 'admin') openAdminRetex();
                else openGuideFeedback(definition.kind);
            });
            metricsNode.append(card);
        });
    }
    function openAdminSignalements() {
        var dialog = node('dialog', 'og-dashboard-feedback-dialog og-dashboard-admin-signalements-dialog');
        var shell = node('section', 'og-dashboard-feedback-shell og-dashboard-admin-signalements');
        var header = node('header', 'og-dashboard-feedback-header');
        var heading = node('div');
        heading.append(node('p', 'og-dashboard-kicker', 'ADMINISTRATION ANC'));
        heading.append(node('h2', '', 'Signalements — Officiers Guides, candidats et questions'));
        var close = node('button', 'og-dashboard-close', 'Fermer');
        close.type = 'button';
        close.addEventListener('click', function () { dialog.close(); });
        header.append(heading, close);
        var intro = node('p', 'og-dashboard-feedback-help', 'Vue centralisée des signalements des Officiers Guides, des candidats et des questions QCM-MAJOR. Ouvrez une fiche pour consulter son contenu, répondre et enregistrer son traitement.');
        var toolbar = node('div', 'og-dashboard-admin-signalements-toolbar');
        var origin = document.createElement('select');
        origin.setAttribute('aria-label', 'Filtrer par origine');
        [['all','Toutes les origines'],['guide','Officiers Guides'],['candidate','Candidats'],['questions','Questions QCM-MAJOR']].forEach(function (entry) {
            var option = node('option', '', entry[1]); option.value = entry[0]; origin.append(option);
        });
        var refresh = node('button', 'og-dashboard-close', 'Actualiser');
        refresh.type = 'button';
        toolbar.append(origin, refresh);
        var status = node('p', 'og-dashboard-feedback-status');
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        var list = node('div', 'og-dashboard-admin-signalements-list');
        var records = [];
        var labels = {submitted:'Nouveau',pending:'À traiter',in_review:'En cours',action_required:'Action demandée',resolved:'Résolu',closed:'Clôturé'};
        function render() {
            list.replaceChildren();
            var visible = records.filter(function (record) { return origin.value === 'all' || record.origin === origin.value; });
            if (!visible.length) {
                list.append(node('p', 'og-dashboard-muted', records.length ? 'Aucun signalement pour cette origine.' : 'Aucun signalement enregistré.'));
                return;
            }
            visible.forEach(function (record) {
                var card = node('article', 'og-dashboard-admin-signalement-card');
                var top = node('div', 'og-dashboard-admin-signalement-top');
                var title = record.origin === 'guide' ? 'Officier Guide' : (record.origin === 'candidate' ? 'Candidat' : 'Question QCM-MAJOR');
                top.append(node('strong', '', title + ' · n°' + record.id));
                top.append(node('span', 'og-dashboard-admin-signalement-date', new Date(record.created_at).toLocaleString('fr-FR')));
                card.append(top);
                var identity = record.origin === 'guide' ? (record.guide_email || 'Officier Guide non identifié') : (record.origin === 'candidate' ? (record.candidate_email || 'Candidat non identifié') : ('Signalant : ' + (record.reporter_id || 'non identifié')));
                card.append(node('p', 'og-dashboard-admin-signalement-identity', identity));
                var priorityLabels = {low:'Faible',normal:'Normale',medium:'Normale',high:'Élevée',urgent:'Urgente'};
                var priority = priorityLabels[String(record.priority || '').toLowerCase()] || record.priority || 'Normale';
                card.append(node('p', 'og-dashboard-admin-signalement-meta', 'Priorité : ' + priority + ' · Statut : ' + (labels[record.status] || record.status || 'Nouveau')));
                var detail = node('dl', 'og-dashboard-admin-signalement-details');
                var values = record.origin === 'guide' ? (record.payload || {}) : (record.origin === 'candidate' ? {
                    'incident_type':record.incident_type, 'module_id':record.module_id, 'resource':record.resource, 'details':record.details
                } : {
                    'question_id':record.question_id, 'quiz_theme':record.quiz_theme, 'question_text':record.question_text,
                    'answers':record.answers, 'correct_answer_index':record.correct_answer_index, 'details':record.details
                });
                var fieldLabels = {
                    question_id:'Identifiant de la question', quiz_theme:'Thème QCM-MAJOR', question_text:'Question signalée',
                    answers:'Réponses proposées', correct_answer_index:'Index de la bonne réponse',
                    facts:'Faits constatés', actions:'Mesures déjà prises', request:'Intervention ou décision attendue',
                    category:'Catégorie', priority:'Priorité', occurred_at:'Date ou période des faits',
                    stakeholders:'Personnes ou services concernés', lessons:'Enseignements et bonnes pratiques',
                    improvements:'Améliorations proposées', situation:'Situation ou contexte',
                    problem:'Problématique rencontrée', incident_type:'Type de signalement',
                    module_id:'Module concerné', resource:'Ressource concernée', details:'Description'
                };
                var valueLabels = {
                    organisation:'Organisation / moyens', accompagnement:'Accompagnement', comportement:'Comportement / discipline',
                    travail_bm4:'Travail BM4', informatique:'Outil informatique', administration:'Administration / dossier',
                    relationnel:'Relationnel', confidentialite:'Sécurité / confidentialité', sensible:'Situation sensible',
                    autre:'Autre', low:'Faible', normal:'Normale', medium:'Normale', high:'Élevée', urgent:'Urgente'
                };
                Object.keys(values).forEach(function (key) {
                    var value = values[key];
                    if (value === null || value === undefined || String(value).trim() === '') return;
                    var label = fieldLabels[key] || key.replace(/_/g, ' ').replace(/^./, function (letter) { return letter.toUpperCase(); });
                    var displayValue = valueLabels[String(value).toLowerCase()] || (typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
                    detail.append(node('dt', '', label), node('dd', '', displayValue));
                });
                card.append(detail);
                var controls = node('div', 'og-dashboard-admin-signalement-controls');
                var statusSelect = document.createElement('select');
                statusSelect.setAttribute('aria-label', 'Statut du signalement');
                var statusOptions = record.origin === 'questions' ? [['pending','À traiter'],['resolved','Résolu']] : [['submitted','Nouveau'],['in_review','En cours'],['action_required','Action demandée'],['resolved','Résolu'],['closed','Clôturé']];
                statusOptions.forEach(function (entry) {
                    var option = node('option', '', entry[1]); option.value = entry[0]; statusSelect.append(option);
                });
                statusSelect.value = record.origin === 'questions' ? (record.status || 'pending') : (record.status === 'pending' ? 'submitted' : (record.status || 'submitted'));
                var response = document.createElement('textarea');
                response.rows = 3; response.maxLength = 3000;
                response.placeholder = 'Réponse / décision de l’administration';
                response.value = record.admin_response || '';
                var save = node('button', 'og-dashboard-close og-dashboard-assign-primary', 'Enregistrer le traitement');
                save.type = 'button';
                save.addEventListener('click', function () {
                    save.disabled = true;
                    status.textContent = 'Enregistrement du traitement…';
                    auth().jeton().then(function (jwt) {
                        var claims = decodeClaims(jwt);
                        var table = record.origin === 'guide' ? 'guide_signalements' : (record.origin === 'candidate' ? 'doctrine_signalements' : 'question_reports');
                        var id = encodeURIComponent(record.id);
                        return api(table + '?id=eq.' + id, {
                            method:'PATCH',
                            body:{
                                status:statusSelect.value,
                                admin_response:response.value.trim() || null,
                                processed_by:claims && claims.sub || null,
                                processed_at:new Date().toISOString()
                            },
                            prefer:'return=minimal'
                        });
                    }).then(function () {
                        record.status = statusSelect.value;
                        record.admin_response = response.value.trim();
                        status.textContent = 'Traitement enregistré pour le signalement n°' + record.id + '.';
                        render();
                    }).catch(function (error) {
                        status.textContent = error.message || 'Enregistrement impossible.';
                    }).finally(function () { save.disabled = false; });
                });
                controls.append(statusSelect, response, save);
                card.append(controls);
                if (record.admin_response) card.append(node('p', 'og-dashboard-feedback-response', 'Réponse enregistrée : ' + record.admin_response));
                list.append(card);
            });
        }
        function load() {
            refresh.disabled = true;
            status.textContent = 'Chargement des signalements…';
            list.replaceChildren();
            Promise.all([
                api('guide_signalements?select=id,guide_email,payload,priority,status,admin_response,created_at&order=created_at.desc&limit=200'),
                api('doctrine_signalements?select=id,candidate_email,incident_type,module_id,resource,details,priority,status,admin_response,created_at&order=created_at.desc&limit=200'),
                api('question_reports?select=id,question_id,question_text,answers,correct_answer_index,quiz_theme,details,reporter_id,status,admin_response,created_at&order=created_at.desc&limit=200')
            ]).then(function (results) {
                records = (Array.isArray(results[0]) ? results[0].map(function (row) { row.origin = 'guide'; return row; }) : [])
                    .concat(Array.isArray(results[1]) ? results[1].map(function (row) { row.origin = 'candidate'; return row; }) : [])
                    .concat(Array.isArray(results[2]) ? results[2].map(function (row) { row.origin = 'questions'; return row; }) : [])
                    .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
                status.textContent = records.length + ' signalement(s) — ' +
                    records.filter(function (row) { return !['resolved','closed'].includes(row.status); }).length + ' à suivre.';
                render();
            }).catch(function (error) {
                status.textContent = error.message || 'Chargement impossible. Vérifiez les droits et la migration Supabase.';
                list.replaceChildren(node('p', 'og-dashboard-feedback-status', 'Les trois sources de signalements n’ont pas pu être chargées.'));
            }).finally(function () { refresh.disabled = false; });
        }
        origin.addEventListener('change', render);
        refresh.addEventListener('click', load);
        shell.append(header, intro, toolbar, status, list);
        dialog.append(shell);
        root.append(dialog);
        dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener('close', function () { dialog.remove(); });
        dialog.showModal();
        load();
    }

    // Consultation du RETEX QCM-MAJOR : exclusivement réservée aux administrateurs.
    function openAdminRetex() {
        var dialog = node('dialog', 'og-dashboard-feedback-dialog og-dashboard-admin-retex-dialog');
        var shell = node('section', 'og-dashboard-feedback-shell');
        var header = node('header', 'og-dashboard-feedback-header');
        var heading = node('div');
        heading.append(node('p', 'og-dashboard-kicker', 'CONSULTATION ADMINISTRATEUR'));
        heading.append(node('h2', '', 'Consultation des RETEX'));
        var close = node('button', 'og-dashboard-close', 'Fermer');
        close.type = 'button';
        close.addEventListener('click', function () { dialog.close(); });
        header.append(heading, close);

        var tabs = node('div', 'og-admin-retex-tabs');
        var qcmTab = node('button', 'og-admin-retex-tab is-active', 'RETEX QCM-MAJOR');
        var guideTab = node('button', 'og-admin-retex-tab', 'RETEX Officier Guide OG');
        qcmTab.type = guideTab.type = 'button';
        qcmTab.setAttribute('aria-pressed', 'true');
        guideTab.setAttribute('aria-pressed', 'false');
        tabs.append(qcmTab, guideTab);

        var status = node('p', 'og-dashboard-feedback-status', 'Vérification des droits administrateur…');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        var meta = node('p', 'og-dashboard-muted');
        var charts = node('div', 'og-admin-retex-charts');
        var responses = node('section', 'og-admin-retex-responses');
        var responsesTitle = node('h3', '', 'Tous les retours enregistrés');
        var responseList = node('div', 'og-admin-retex-response-list');
        responses.append(responsesTitle, responseList);
        var actions = node('div', 'og-dashboard-ai-actions');
        var pdf = node('button', 'og-dashboard-close og-dashboard-assign-primary', 'Exporter la synthèse en PDF');
        pdf.type = 'button';
        pdf.disabled = true;
        actions.append(pdf);
        shell.append(header, tabs, status, meta, charts, responses, actions);
        dialog.append(shell);
        root.append(dialog);
        dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener('close', function () { dialog.remove(); });
        dialog.showModal();

        var sources = {
            qcm: {
                table: 'retex_responses',
                title: 'RETEX QCM-MAJOR',
                query: 'retex_responses?select=*&order=created_at.desc,id.desc&limit=2000',
                questions: [
                    ['specialty', 'Spécialité BM4'], ['themes', 'Zones les plus ciblées'],
                    ['navigation', 'Navigation dans la console'], ['design', 'Design visuel'],
                    ['best_mode', 'Mode de combat le plus utile'], ['scoring_opinion', 'Barème d’évaluation'],
                    ['used_report_form', 'Utilisation du signalement tactique'],
                    ['recommendation', 'Recommandation de l’application']
                ]
            },
            guide: {
                table: 'guide_retex_reports',
                title: 'RETEX des Officiers Guides OG',
                query: 'guide_retex_reports?select=id,user_id,guide_email,payload,priority,status,admin_response,created_at,updated_at&order=created_at.desc&limit=2000',
                questions: [
                    ['situation', 'Situation ou contexte'], ['problem', 'Problématique rencontrée'],
                    ['facts', 'Faits constatés et conséquences'], ['actions', 'Mesures déjà prises'],
                    ['lessons', 'Enseignements et bonnes pratiques'], ['improvements', 'Améliorations proposées'],
                    ['priority', 'Priorité']
                ]
            }
        };
        var activeSource = 'qcm';
        var datasets = { qcm: null, guide: null };
        var currentRows = [];
        function answer(row, field) {
            var value = activeSource === 'guide' ? (row.payload || {})[field] : row[field];
            return Array.isArray(value) ? value.filter(Boolean).join(', ') :
                (value === null || value === undefined || value === '' ? 'Non renseigné' : String(value));
        }
        function escapeHtml(value) {
            return String(value).replace(/[&<>"']/g, function (char) {
                return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
            });
        }
        function render() {
            var source = sources[activeSource];
            var questions = source.questions;
            currentRows = datasets[activeSource] || [];
            heading.querySelector('h2').textContent = source.title;
            charts.replaceChildren();
            var chartColors = ['#4f7052', '#c9a227', '#2876a8', '#a63d3d', '#8060a8', '#3d9b8d', '#e17b22', '#777777'];
            (activeSource === 'guide' ? [['priority', 'Priorité des signalements'], ['status', 'Statut de traitement']] : questions).forEach(function (question) {
                var counts = Object.create(null);
                currentRows.forEach(function (row) {
                    var value = activeSource === 'guide' ? (row.payload || {})[question[0]] : row[question[0]];
                    (Array.isArray(value) ? value : [value]).filter(function (entry) {
                        return entry !== null && entry !== undefined && entry !== '';
                    }).forEach(function (entry) {
                        var label = String(entry);
                        counts[label] = (counts[label] || 0) + 1;
                    });
                });
                var card = node('article', 'og-admin-retex-chart');
                card.append(node('h3', '', question[1]));
                var entries = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
                if (!entries.length) {
                    card.append(node('p', 'og-dashboard-muted', 'Aucune réponse.'));
                } else {
                    var total = entries.reduce(function (sum, label) { return sum + counts[label]; }, 0);
                    var angle = 0;
                    var stops = [];
                    entries.forEach(function (label, index) {
                        var next = angle + counts[label] / total * 360;
                        stops.push(chartColors[index % chartColors.length] + ' ' + angle.toFixed(2) + 'deg ' + next.toFixed(2) + 'deg');
                        angle = next;
                    });
                    var chartBody = node('div', 'og-admin-retex-chart-body');
                    var pie = node('span', 'og-admin-retex-pie');
                    pie.style.background = 'conic-gradient(' + stops.join(',') + ')';
                    pie.setAttribute('role', 'img');
                    pie.setAttribute('aria-label', 'Répartition des réponses pour ' + question[1]);
                    var legend = node('div', 'og-admin-retex-legend');
                    entries.forEach(function (label, index) {
                        var line = node('div', 'og-admin-retex-legend-row');
                        var swatch = node('span', 'og-admin-retex-swatch');
                        swatch.style.backgroundColor = chartColors[index % chartColors.length];
                        var percentage = Math.round(counts[label] / total * 100);
                        line.append(swatch, node('span', '', label + ' : ' + counts[label] + ' (' + percentage + ' %)'));
                        legend.append(line);
                    });
                    chartBody.append(pie, legend);
                    card.append(chartBody);
                }
                charts.append(card);
            });
            responseList.replaceChildren();
            currentRows.forEach(function (row, index) {
                var identity = activeSource === 'guide' ? (row.guide_email || 'Officier Guide non identifié') :
                    (row.pseudo || 'Anonyme') + (row.specialty ? ' (' + row.specialty + ')' : '');
                var item = node('article', 'og-admin-retex-response');
                item.append(node('h4', '', 'Retour ' + (index + 1) + ' — ' + identity));
                item.append(node('p', 'og-dashboard-muted', 'Transmis le ' +
                    (row.created_at ? new Date(row.created_at).toLocaleString('fr-FR') : 'Date inconnue')));
                var details = node('dl');
                questions.filter(function (question) {
                    if (activeSource !== 'qcm') return true;
                    return !['themes', 'navigation', 'design', 'best_mode', 'scoring_opinion',
                        'used_report_form', 'recommendation'].includes(question[0]);
                }).forEach(function (question) {
                    details.append(node('dt', '', question[1]), node('dd', '', answer(row, question[0])));
                });
                if (activeSource === 'guide') {
                    details.append(node('dt', '', 'Statut de traitement'), node('dd', '', answer(row, 'status')));
                    details.append(node('dt', '', 'Réponse de l’administration'), node('dd', '', answer(row, 'admin_response')));
                } else {
                    details.append(node('dt', '', 'Commentaire libre'), node('dd', '', answer(row, 'comment')));
                }
                item.append(details);
                responseList.append(item);
            });
            var dates = currentRows.map(function (row) { return Date.parse(row.created_at); }).filter(Number.isFinite);
            meta.textContent = currentRows.length + ' RETEX enregistré(s).' +
                (currentRows.length && dates.length ? ' Période : ' + new Date(Math.min.apply(null, dates)).toLocaleDateString('fr-FR') +
                    ' au ' + new Date(Math.max.apply(null, dates)).toLocaleDateString('fr-FR') : '');
            pdf.disabled = !currentRows.length;
            responsesTitle.textContent = 'Tous les retours enregistrés (' + currentRows.length + ')';
        }
        function load(sourceKey) {
            activeSource = sourceKey;
            qcmTab.classList.toggle('is-active', sourceKey === 'qcm');
            guideTab.classList.toggle('is-active', sourceKey === 'guide');
            qcmTab.setAttribute('aria-pressed', String(sourceKey === 'qcm'));
            guideTab.setAttribute('aria-pressed', String(sourceKey === 'guide'));
            status.textContent = 'Vérification des droits administrateur…';
            responses.hidden = false;
            charts.replaceChildren();
            responseList.replaceChildren();
            pdf.disabled = true;
            if (datasets[sourceKey]) {
                render();
                status.textContent = '';
                return;
            }
            adminAccess().then(function (allowed) {
                if (!allowed || dashboardMode !== 'admin') throw new Error('Une session administrateur est requise.');
                // Chaque table est interrogée uniquement après validation explicite du rôle administrateur.
                return api(sources[sourceKey].query);
            }).then(function (data) {
                if (!Array.isArray(data)) throw new Error('Réponse RETEX invalide.');
                datasets[sourceKey] = data;
                if (activeSource === sourceKey) {
                    render();
                    status.textContent = '';
                }
            }).catch(function (error) {
                if (activeSource !== sourceKey) return;
                status.textContent = 'Consultation ' + sources[sourceKey].title + ' refusée ou indisponible : ' +
                    (error.message || 'erreur inconnue');
                charts.replaceChildren();
                responses.hidden = true;
            });
        }
        function exportPdf() {
            if (!currentRows.length) return;
            var printable = window.open('', '_blank');
            if (!printable) { status.textContent = 'Autorisez les fenêtres contextuelles pour exporter le PDF.'; return; }
            var report = printable.document;
            var chartColors = ['#4f7052', '#c9a227', '#2876a8', '#a63d3d', '#8060a8', '#3d9b8d', '#e17b22', '#777777'];
            var isQcm = activeSource === 'qcm';
            var questions = sources[activeSource].questions;
            function rawValue(row, field) {
                return activeSource === 'guide' ? (row.payload || {})[field] : row[field];
            }
            function displayValue(row, field) {
                var value = rawValue(row, field);
                return Array.isArray(value) ? value.filter(Boolean).join(', ') :
                    (value === null || value === undefined || value === '' ? 'Non renseigné' : String(value));
            }
            function makeChart(question) {
                var counts = Object.create(null);
                currentRows.forEach(function (row) {
                    var value = rawValue(row, question[0]);
                    (Array.isArray(value) ? value : [value]).filter(function (entry) {
                        return entry !== null && entry !== undefined && entry !== '';
                    }).forEach(function (entry) {
                        var label = String(entry);
                        counts[label] = (counts[label] || 0) + 1;
                    });
                });
                var entries = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
                if (!entries.length) return '<section class="chart"><h2>' + escapeHtml(question[1]) + '</h2><p>Aucune réponse renseignée.</p></section>';
                var total = entries.reduce(function (sum, label) { return sum + counts[label]; }, 0);
                var angle = 0;
                var stops = [];
                entries.forEach(function (label, index) {
                    var next = angle + counts[label] / total * 360;
                    stops.push(chartColors[index % chartColors.length] + ' ' + angle.toFixed(2) + 'deg ' + next.toFixed(2) + 'deg');
                    angle = next;
                });
                var legend = entries.map(function (label, index) {
                    return '<li><i style="background:' + chartColors[index % chartColors.length] + '"></i><span>' +
                        escapeHtml(label) + ' : ' + counts[label] + ' (' + Math.round(counts[label] / total * 100) + ' %)</span></li>';
                }).join('');
                return '<section class="chart"><h2>' + escapeHtml(question[1]) + '</h2><div class="chart-content">' +
                    '<div class="pie" style="background:conic-gradient(' + stops.join(',') + ')"></div><ul>' + legend + '</ul></div></section>';
            }
            var dates = currentRows.map(function (row) { return Date.parse(row.created_at); }).filter(Number.isFinite);
            var period = dates.length ? new Date(Math.min.apply(null, dates)).toLocaleDateString('fr-FR') +
                ' au ' + new Date(Math.max.apply(null, dates)).toLocaleDateString('fr-FR') : 'Période non renseignée';
            var edited = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
            var title = isQcm ? 'RETEX QCM-MAJOR.fr' : 'RETEX des Officiers Guides OG';
            var subtitle = isQcm ? 'Synthèse pour le commandement' : 'Synthèse des retours Officiers Guides';
            function commentsSection() {
                if (isQcm) {
                    var comments = currentRows.map(function (row) { return row.comment; })
                        .filter(function (value) { return value !== null && value !== undefined && String(value).trim(); });
                    return '<section class="comments"><h2>Commentaires libres</h2>' +
                        (comments.length ? comments.map(function (comment) { return '<p>' + escapeHtml(comment) + '</p>'; }).join('') :
                            '<p>Aucun commentaire libre.</p>') + '</section>';
                }
                return '<section class="comments"><h2>Retours détaillés des Officiers Guides</h2>' +
                    currentRows.map(function (row, index) {
                        var identity = row.guide_email || 'Officier Guide non identifié';
                        var fields = questions.filter(function (question) { return question[0] !== 'priority'; })
                            .map(function (question) {
                                return '<div class="detail"><strong>' + escapeHtml(question[1]) + '</strong><p>' +
                                    escapeHtml(displayValue(row, question[0])) + '</p></div>';
                            }).join('');
                        return '<article class="og-entry"><h3>Retour ' + (index + 1) + ' — ' + escapeHtml(identity) +
                            '</h3><p class="date">Transmis le ' + escapeHtml(row.created_at ?
                                new Date(row.created_at).toLocaleDateString('fr-FR') : 'Date inconnue') +
                            ' · Priorité : ' + escapeHtml(displayValue(row, 'priority')) +
                            ' · Statut : ' + escapeHtml(displayValue(row, 'status')) + '</p>' + fields +
                            '<div class="detail"><strong>Réponse de l’administration</strong><p>' +
                            escapeHtml(displayValue(row, 'admin_response')) + '</p></div></article>';
                    }).join('') + '</section>';
            }
            report.open();
            report.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + escapeHtml(title) +
                '</title><style>' +
                '@page{size:A4;margin:15mm 15mm 14mm}*{box-sizing:border-box}body{font:9.5pt Arial,sans-serif;color:#111;margin:0}' +
                '.page{position:relative;min-height:267mm;page-break-after:always}.page:last-child{page-break-after:auto}' +
                'header{padding:0 0 5mm}h1{font-size:20pt;margin:0 0 2mm;font-weight:700}header .subtitle{font-size:12pt;margin:0 0 3mm}' +
                'header .meta{font-size:9pt;margin:0 0 4mm;line-height:1.35}.chart{margin:0 0 4.5mm;break-inside:avoid}' +
                '.chart h2,.comments h2{font-size:11pt;margin:0 0 2mm;padding:0 0 1.5mm;border-bottom:1px solid #c9c9c9}' +
                '.chart-content{display:flex;align-items:flex-start;gap:7mm;min-height:34mm;padding:0 0 1mm}' +
                '.pie{width:32mm;height:32mm;min-width:32mm;border-radius:50%;margin:0}' +
                '.chart ul{list-style:none;margin:0;padding:1mm 0 0;flex:1}.chart li{display:flex;align-items:flex-start;gap:2mm;margin:0 0 1.1mm;font-size:9pt;line-height:1.2}' +
                '.chart li i{display:block;width:3mm;height:3mm;min-width:3mm;margin-top:.4mm}' +
                '.comments{margin-top:3mm}.comments>p{font-size:9pt;line-height:1.35;margin:0 3mm 3mm;white-space:pre-wrap}' +
                '.og-entry{margin:0 0 5mm;break-inside:avoid}.og-entry h3{font-size:10pt;margin:0 0 1mm}.date{font-size:8pt;color:#444;margin:0 0 2mm}' +
                '.detail{margin:0 0 2mm;break-inside:avoid}.detail strong{font-size:8.5pt}.detail p{font-size:9pt;line-height:1.3;margin:1mm 0 0;white-space:pre-wrap}' +
                '.page-number{position:absolute;right:0;bottom:-7mm;font-size:8pt}' +
                '</style></head><body>');
            if (isQcm) {
                report.write('<div class="page"><header><h1>' + escapeHtml(title) + '</h1><p class="subtitle">' + escapeHtml(subtitle) +
                    '</p><p class="meta">' + currentRows.length + ' retour(s) analysé(s) - édité le ' + escapeHtml(edited) +
                    ' - période du ' + escapeHtml(period) + '</p></header>' + questions.slice(0, 5).map(makeChart).join('') +
                    '<span class="page-number">Page 1 / 2</span></div><div class="page"><header><h1>' +
                    escapeHtml(title) + '</h1><p class="subtitle">' + escapeHtml(subtitle) + '</p></header>' +
                    questions.slice(5).map(makeChart).join('') + commentsSection() +
                    '<span class="page-number">Page 2 / 2</span></div>');
            } else {
                report.write('<div class="page"><header><h1>' + escapeHtml(title) + '</h1><p class="subtitle">' + escapeHtml(subtitle) +
                    '</p><p class="meta">' + currentRows.length + ' retour(s) analysé(s) - édité le ' + escapeHtml(edited) +
                    ' - période du ' + escapeHtml(period) + '</p></header>' +
                    makeChart(['priority', 'Priorité des signalements']) + makeChart(['status', 'Statut de traitement']) +
                    '<span class="page-number">Page 1 / 2</span></div><div class="page"><header><h1>' +
                    escapeHtml(title) + '</h1><p class="subtitle">' + escapeHtml(subtitle) +
                    '</p><p class="meta">' + currentRows.length + ' retour(s) analysé(s)</p></header>' + commentsSection() +
                    '<span class="page-number">Page 2 / 2</span></div>');
            }
            report.write('</body></html>');
            report.close();
            printable.focus();
            printable.print();
        }
        qcmTab.addEventListener('click', function () { load('qcm'); });
        guideTab.addEventListener('click', function () { load('guide'); });
        pdf.addEventListener('click', exportPdf);
        load('qcm');
    }

    function guideFeedbackDialog(kind) {
        var isRetex = kind === 'retex';
        var table = isRetex ? 'guide_retex_reports' : 'guide_signalements';
        var title = isRetex ? 'Fiche RETEX — Officier Guide' : 'Fiche de signalement — Officier Guide';
        var dialog = node('dialog', 'og-dashboard-feedback-dialog');
        var shell = node('section', 'og-dashboard-feedback-shell');
        var header = node('header', 'og-dashboard-feedback-header');
        var heading = node('div');
        heading.append(node('p', 'og-dashboard-kicker', 'ESPACE OFFICIER GUIDE'));
        heading.append(node('h2', '', title));
        var closeButton = node('button', 'og-dashboard-close', 'Fermer');
        closeButton.type = 'button';
        closeButton.addEventListener('click', function () { dialog.close(); dialog.remove(); });
        header.append(heading, closeButton);
        var intro = node('p', 'og-dashboard-feedback-help', isRetex
            ? 'Décrivez une situation rencontrée dans votre mission de guide, les faits observés, les enseignements tirés et les améliorations proposées.'
            : 'Décrivez factuellement une difficulté nécessitant une attention, une décision ou une intervention. En cas d’urgence, utilisez également les voies hiérarchiques adaptées.');
        var form = node('form', 'og-dashboard-feedback-form');
        function field(labelText, name, type, options) {
            var label = node('label', 'og-dashboard-feedback-field', labelText);
            var input;
            if (type === 'select') {
                input = document.createElement('select');
                (options || []).forEach(function (option) {
                    var item = node('option', '', option[1]); item.value = option[0]; input.append(item);
                });
            } else if (type === 'textarea') {
                input = document.createElement('textarea'); input.rows = 3;
            } else {
                input = document.createElement('input'); input.type = type || 'text';
            }
            input.name = name; input.required = false;
            label.append(input); form.append(label);
            return input;
        }
        if (isRetex) {
            field('Situation ou contexte', 'situation', 'textarea');
            field('Problématique rencontrée', 'problem', 'select', [
                ['', '— Choisir —'], ['accompagnement','Accompagnement du candidat'], ['echeances','Échéances et disponibilité'],
                ['bm4','Attendus et préparation BM4'], ['communication','Communication / relationnel'],
                ['outils','Outils numériques et suivi'], ['documentation','Documentation et consignes'],
                ['coordination','Coordination des intervenants'], ['autre','Autre']
            ]);
            field('Faits constatés et conséquences', 'facts', 'textarea');
            field('Mesures déjà prises', 'actions', 'textarea');
            field('Enseignements et bonnes pratiques', 'lessons', 'textarea');
            field('Améliorations proposées', 'improvements', 'textarea');
            field('Priorité', 'priority', 'select', [['low','Faible'],['normal','Normale'],['high','Élevée']]);
        } else {
            field('Catégorie du signalement', 'category', 'select', [
                ['', '— Choisir —'], ['accompagnement','Accompagnement'], ['comportement','Comportement / discipline'],
                ['travail_bm4','Travail BM4'], ['organisation','Organisation / moyens'], ['informatique','Outil informatique'],
                ['administration','Administration / dossier'], ['relationnel','Relationnel'], ['confidentialite','Sécurité / confidentialité'],
                ['sensible','Situation sensible'], ['autre','Autre']
            ]);
            field('Date ou période des faits', 'occurred_at', 'text');
            field('Description factuelle et chronologique', 'facts', 'textarea');
            field('Personnes ou services concernés (sans données sensibles inutiles)', 'stakeholders', 'textarea');
            field('Mesures déjà prises', 'actions', 'textarea');
            field('Intervention ou décision attendue', 'request', 'textarea');
            field('Priorité', 'priority', 'select', [['low','Niveau 1 — Information'],['normal','Niveau 2 — Suivi'],['high','Niveau 3 — Intervention'],['urgent','Niveau 4 — Urgent']]);
        }
        var status = node('p', 'og-dashboard-feedback-status');
        status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
        var submit = node('button', 'og-dashboard-close og-dashboard-assign-primary', 'Enregistrer et transmettre');
        submit.type = 'submit';
        form.append(status, submit);
        var history = node('section', 'og-dashboard-feedback-history');
        history.append(node('h3', '', 'Mon historique'));
        history.append(node('p', 'og-dashboard-muted', 'Chargement de votre historique…'));
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var payload = {};
            new FormData(form).forEach(function (value, key) { payload[key] = String(value).trim(); });
            var requiredKeys = isRetex ? ['situation','problem','facts'] : ['category','facts','request'];
            if (requiredKeys.some(function (key) { return !payload[key]; })) {
                status.textContent = 'Renseignez au minimum le contexte, la catégorie et les faits ; pour un signalement, précisez aussi l’intervention attendue.';
                return;
            }
            var token;
            submit.disabled = true; status.textContent = 'Transmission en cours…';
            auth().jeton().then(function (jwt) {
                token = decodeClaims(jwt);
                if (!token || !token.sub) throw new Error('Session expirée.');
                return api(table, { method: 'POST', body: { user_id: token.sub, payload: payload, priority: payload.priority || 'normal' }, prefer: 'return=minimal' });
            }).then(function () {
                status.textContent = 'Fiche transmise. Elle figure maintenant dans votre historique.';
                form.reset(); chargerHistorique();
            }).catch(function (error) {
                status.textContent = error.message || 'Transmission impossible. Réessayez.';
            }).finally(function () { submit.disabled = false; });
        });
        function chargerHistorique() {
            api(table + '?select=id,payload,priority,status,admin_response,created_at,updated_at&order=created_at.desc&limit=100')
                .then(function (rows) {
                    history.replaceChildren(node('h3', '', 'Mon historique'));
                    if (!rows.length) { history.append(node('p','og-dashboard-muted','Aucune fiche transmise pour le moment.')); return; }
                    rows.forEach(function (row) {
                        var item = node('article','og-dashboard-feedback-history-item');
                        var labels = {submitted:'Transmis',in_review:'En cours d’examen',action_required:'Action demandée',resolved:'Résolu',closed:'Clôturé'};
                        item.append(node('div','og-dashboard-feedback-history-meta',new Date(row.created_at).toLocaleString('fr-FR')+' · '+(labels[row.status]||row.status)));
                        item.append(node('p','',Object.values(row.payload||{}).filter(Boolean).slice(0,3).join(' — ')));
                        if (row.admin_response) item.append(node('p','og-dashboard-feedback-response','Réponse administration : '+row.admin_response));
                        history.append(item);
                    });
                }).catch(function () {
                    history.replaceChildren(node('p','og-dashboard-feedback-status','Historique indisponible. Vérifiez que la migration Supabase a été appliquée.'));
                });
        }
        shell.append(header,intro,form,history); dialog.append(shell); root.append(dialog);
        dialog.addEventListener('click',function(event){if(event.target===dialog){dialog.close();dialog.remove();}});
        dialog.addEventListener('close',function(){dialog.remove();});
        dialog.showModal(); chargerHistorique();
    }
    function openGuideFeedback(kind) {
        if (kind !== 'retex' && kind !== 'signalement') return;
        guideFeedbackDialog(kind);
    }
    function openAssignCandidateDialog() {
        var dialog = node('dialog', 'og-dashboard-assign-dialog');
        var form = node('form', 'og-dashboard-assign-form');
        form.method = 'dialog';
        var heading = node('div', 'og-dashboard-assign-heading');
        heading.append(node('p', 'og-dashboard-kicker', 'COHORTE BM4'));
        heading.append(node('h3', '', 'Rattacher un candidat'));
        var closeButton = node('button', 'og-dashboard-close', 'Fermer');
        closeButton.type = 'button';
        closeButton.addEventListener('click', function () { dialog.close(); });
        var label = node('label', '', 'Code candidat de 8 caractères (communiqué par le candidat)');
        var input = node('input', 'og-dashboard-assign-input');
        input.type = 'text';
        input.minLength = 8;
        input.maxLength = 8;
        input.pattern = '[A-HJ-NP-Za-hj-np-z2-9]{8}';
        input.placeholder = 'ABCD2345';
        input.autocomplete = 'off';
        input.autocapitalize = 'characters';
        input.spellcheck = false;
        input.required = true;
        label.append(input);
        var hint = node('p', 'og-dashboard-muted', 'Saisissez le code transmis par le candidat, puis confirmez le rattachement.');
        var feedback = node('p', 'og-dashboard-assign-feedback');
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');
        var actions = node('div', 'og-dashboard-assign-actions');
        var verify = node('button', 'og-dashboard-close og-dashboard-assign-primary', 'Vérifier le code');
        verify.type = 'submit';
        actions.append(verify);
        form.append(heading, closeButton, label, hint, feedback, actions);
        dialog.append(form);
        root.append(dialog);
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var code = input.value.trim().toUpperCase();
            if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
                feedback.textContent = 'Le code doit comporter 8 caractères valides.';
                feedback.classList.add('is-error');
                return;
            }
            verify.disabled = true;
            feedback.classList.remove('is-error');
            feedback.textContent = 'Vérification du code et rattachement…';
            api('rpc/assign_guide_candidate_by_code', {
                method: 'POST',
                body: { p_code: code }
            }).then(function (candidateId) {
                if (typeof candidateId !== 'string' ||
                    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId)) {
                    throw new Error('Le service de rattachement a retourné un identifiant candidat invalide.');
                }
                feedback.textContent = 'Candidat rattaché à votre cohorte.';
                dialog.close();
                load();
            }).catch(function (error) {
                feedback.textContent = error.message || 'Rattachement impossible.';
                feedback.classList.add('is-error');
                verify.disabled = false;
            });
        });
        dialog.addEventListener('close', function () { dialog.remove(); });
        dialog.showModal();
        input.focus();
    }
    function extractModuleProgressEvents(payload) {
        return (payload && Array.isArray(payload.candidates) ? payload.candidates : []).reduce(function (all, candidate) {
            var userId = candidate.candidate && candidate.candidate.id;
            var events = candidate.doctrine && Array.isArray(candidate.doctrine.progress_events)
                ? candidate.doctrine.progress_events : [];
            return all.concat(events.map(function (event) {
                return Object.assign({}, event, { user_id: userId });
            }));
        }, []);
    }
    function moduleState(candidate, moduleId) {
        if (!moduleEventsAvailable) return { label: 'Non vérifiable', className: 'is-unknown' };
        var events = candidate.doctrine && Array.isArray(candidate.doctrine.progress_events)
            ? candidate.doctrine.progress_events : [];
        if (events.some(function (event) {
            return String(event.module_id) === String(moduleId) && event.event_type === 'module_completed';
        })) return { label: 'Validé', className: 'is-ok' };
        if (events.some(function (event) {
            return String(event.module_id) === String(moduleId) && event.event_type === 'module_started';
        })) return { label: 'En cours', className: 'is-warning' };
        return { label: 'Non commencé', className: 'is-pending' };
    }
    function renderModuleProgress(candidate) {
        var section = node('details', 'og-dashboard-subaccordion og-dashboard-module-progress');
        section.dataset.candidateId = String(candidate.candidate && candidate.candidate.id || '');
        var summary = node('summary', '', 'Progression des modules 1 à 7');
        section.append(summary);
        var grid = node('div', 'og-dashboard-module-grid');
        for (var moduleId = 1; moduleId <= 7; moduleId++) {
            var status = moduleState(candidate, moduleId);
            var item = node('div', 'og-dashboard-module-item');
            item.dataset.moduleId = String(moduleId);
            item.append(node('strong', '', 'Module ' + moduleId));
            item.append(node('span', 'og-dashboard-pill ' + status.className, status.label));
            grid.append(item);
        }
        section.append(grid);
        return section;
    }
    function localDateTime(value) {
        if (!value) return '';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    function renderOralTracking(candidate) {
        var data = candidate.admission || {};
        var section = node('section', 'og-dashboard-oral-tracking');
        section.append(node('h4', '', 'Suivi des oraux blancs'));
        var fields = node('div', 'og-dashboard-oral-fields');
        var doneLabel = node('label', '', 'Oraux blancs réalisés');
        var done = node('input', 'og-dashboard-oral-input');
        done.type = 'number'; done.min = '0'; done.max = '100'; done.step = '1';
        done.value = String(data.mock_orals_done == null ? 0 : data.mock_orals_done);
        doneLabel.append(done);
        var targetLabel = node('label', '', 'Objectif d’oraux blancs');
        var target = node('input', 'og-dashboard-oral-input');
        target.type = 'number'; target.min = '1'; target.max = '100'; target.step = '1';
        target.value = String(data.mock_orals_target == null ? 4 : data.mock_orals_target);
        targetLabel.append(target);
        var dateLabel = node('label', 'og-dashboard-oral-date-label', 'Date du prochain oral');
        var date = node('input', 'og-dashboard-oral-input');
        date.type = 'datetime-local';
        date.value = localDateTime(data.next_oral_date);
        dateLabel.append(date);
        fields.append(doneLabel, targetLabel, dateLabel);
        var save = node('button', 'og-dashboard-save-oral', 'Enregistrer le suivi');
        save.type = 'button';
        var feedback = node('span', 'og-dashboard-oral-feedback');
        save.addEventListener('click', function () {
            var completed = Number(done.value);
            var objective = Number(target.value);
            if (!Number.isInteger(completed) || completed < 0 || completed > 100 ||
                !Number.isInteger(objective) || objective < 1 || objective > 100) {
                feedback.textContent = 'Saisissez des nombres valides (0 à 100 et objectif de 1 à 100).';
                feedback.classList.add('is-error');
                return;
            }
            var nextDate = null;
            if (date.value) {
                var parsed = new Date(date.value);
                if (Number.isNaN(parsed.getTime())) {
                    feedback.textContent = 'La date du prochain oral est invalide.';
                    feedback.classList.add('is-error');
                    return;
                }
                nextDate = parsed.toISOString();
            }
            save.disabled = true;
            save.textContent = 'Enregistrement…';
            feedback.textContent = '';
            feedback.classList.remove('is-error');
            api('candidate_admission_tracking?on_conflict=candidate_id', {
                method: 'POST',
                prefer: 'resolution=merge-duplicates,return=minimal',
                body: {
                    candidate_id: candidate.candidate.id,
                    mock_orals_done: completed,
                    mock_orals_target: objective,
                    next_oral_date: nextDate
                }
            }).then(function () {
                candidate.admission = Object.assign({}, candidate.admission || {}, {
                    mock_orals_done: completed,
                    mock_orals_target: objective,
                    next_oral_date: nextDate
                });
                feedback.textContent = 'Suivi enregistré.';
                feedback.classList.remove('is-error');
            }).catch(function (error) {
                feedback.textContent = 'Enregistrement impossible : ' + error.message;
                feedback.classList.add('is-error');
            }).finally(function () {
                save.disabled = false;
                save.textContent = 'Enregistrer le suivi';
            });
        });
        section.append(fields, save, feedback);
        return section;
    }
    function renderCcpmTracking(candidate) {
        var data = candidate.admission || {};
        var section = node('section', 'og-dashboard-oral-tracking og-dashboard-ccpm-tracking');
        section.append(node('h4', '', 'Suivi du CCPM'));
        var fields = node('div', 'og-dashboard-oral-fields og-dashboard-ccpm-fields');
        var scoreLabel = node('label', '', 'Note CCPM / 20');
        var score = node('input', 'og-dashboard-oral-input');
        score.type = 'number'; score.min = '0'; score.max = '20'; score.step = '0.5';
        score.value = data.ccpm_score == null ? '' : String(data.ccpm_score);
        score.placeholder = 'Ex. : 17';
        scoreLabel.append(score);
        var notesLabel = node('label', 'og-dashboard-ccpm-notes-label', 'Notes de l’Officier Guide');
        var notes = node('textarea', 'og-dashboard-oral-input');
        notes.rows = 3; notes.value = data.guide_notes == null ? '' : String(data.guide_notes);
        notes.placeholder = 'Observations et axes de progression…';
        notesLabel.append(notes);
        var validatedLabel = node('label', 'og-dashboard-ccpm-validated-label', 'CCPM validé');
        var validated = node('input');
        validated.type = 'checkbox'; validated.checked = data.ccpm_validated === true || data.ccpm_validated === 'true';
        validatedLabel.append(validated);
        fields.append(scoreLabel, notesLabel, validatedLabel);
        var save = node('button', 'og-dashboard-save-oral', 'Enregistrer le CCPM');
        save.type = 'button';
        var feedback = node('span', 'og-dashboard-oral-feedback');
        save.addEventListener('click', function () {
            var rawScore = String(score.value || '').trim();
            var numericScore = rawScore === '' ? null : Number(rawScore);
            if (numericScore !== null && (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 20)) {
                feedback.textContent = 'La note CCPM doit être comprise entre 0 et 20.';
                feedback.classList.add('is-error');
                return;
            }
            save.disabled = true;
            save.textContent = 'Enregistrement…';
            feedback.textContent = '';
            feedback.classList.remove('is-error');
            api('candidate_admission_tracking?on_conflict=candidate_id', {
                method: 'POST',
                prefer: 'resolution=merge-duplicates,return=minimal',
                body: {
                    candidate_id: candidate.candidate.id,
                    ccpm_score: numericScore,
                    guide_notes: notes.value.trim() || null,
                    ccpm_validated: validated.checked
                }
            }).then(function () {
                candidate.admission = Object.assign({}, candidate.admission || {}, {
                    ccpm_score: numericScore,
                    guide_notes: notes.value.trim() || null,
                    ccpm_validated: validated.checked
                });
                feedback.textContent = 'Suivi CCPM enregistré.';
                feedback.classList.remove('is-error');
            }).catch(function (error) {
                feedback.textContent = 'Enregistrement impossible : ' + error.message;
                feedback.classList.add('is-error');
            }).finally(function () {
                save.disabled = false;
                save.textContent = 'Enregistrer le CCPM';
            });
        });
        section.append(fields, save, feedback);
        return section;
    }
    function reviewRubric(submission) {
        if (submission.submission_type === 'support_oral') {
            return [
                { key: 'operatoire_forme', label: 'Caractère opératoire et gabarit 5 cases', max: 6, group: 'form' },
                { key: 'introduction', label: 'Introduction structurée en cinq points', max: 4, group: 'content' },
                { key: 'argumentaire', label: 'Argumentaire ID1 / ID2 / ID3 et preuves', max: 7, group: 'content' },
                { key: 'conclusion', label: 'Conclusion', max: 3, group: 'content' }
            ];
        }
        return [
            { key: 'form', label: 'Forme, Présentation & Langue', max: 6, group: 'form' },
            { key: 'introduction', label: 'Introduction', max: 3, group: 'content' },
            { key: 'problematique_donnees', label: 'Problématique et données', max: 3, group: 'content' },
            { key: 'solutions', label: 'Solutions réalisables', max: 4, group: 'content' },
            { key: 'avis_conclusion', label: 'Avis et conclusion', max: 4, group: 'content' }
        ];
    }
    function relativeStorageUrl(signedUrl) {
        if (signedUrl.indexOf('http://') === 0 || signedUrl.indexOf('https://') === 0) return signedUrl;
        if (signedUrl.startsWith('/storage/v1/')) return new URL(signedUrl, auth().url).href;
        if (signedUrl.startsWith('/object/')) return new URL('/storage/v1' + signedUrl, auth().url).href;
        if (signedUrl.startsWith('object/')) return new URL('/storage/v1/' + signedUrl, auth().url).href;
        return new URL(signedUrl, auth().url).href;
    }
    async function downloadCandidateCv(candidate, cv, button) {
        if (!cv || !cv.storage_path) {
            setStatus('Aucun fichier n’est associé à ce document.', true);
            return;
        }
        var filename = String(cv.original_filename || 'document-candidat.pdf').replace(/[\\/\\\\]/g, '_');
        var originalLabel = button.textContent;
        button.disabled = true;
        button.textContent = 'Préparation…';
        try {
            var path = cv.storage_path.split('/').map(encodeURIComponent).join('/');
            var signed = await storageApi('object/sign/candidate-cvs/' + path, {
                method: 'POST',
                body: { expiresIn: 300, download: filename }
            });
            var signedUrl = signed.signedURL || signed.signedUrl;
            if (!signedUrl) throw new Error('Lien de téléchargement sécurisé indisponible.');
            var link = node('a');
            link.href = relativeStorageUrl(signedUrl);
            link.download = filename;
            link.rel = 'noopener noreferrer';
            link.style.display = 'none';
            document.body.append(link);
            link.click();
            link.remove();
            setStatus('Téléchargement lancé : ' + filename, false);
        } catch (error) {
            setStatus('Téléchargement du document impossible : ' + (error.message || error), true);
        } finally {
            button.disabled = false;
            button.textContent = originalLabel;
        }
    }

    async function openCandidatePdf(candidate, submission, button) {
        if (!submission.storage_path) {
            setStatus('Aucun PDF n’est associé à cette fiche.', true);
            return;
        }
        var isOral = submission.submission_type === 'support_oral';
        var title = candidateName(candidate) + ' — ' +
            (isOral ? 'Fiche support oral' : 'Fiche de proposition') +
            ' — Dossier ' + submission.dossier;
        button.disabled = true;
        var originalLabel = button.textContent;
        button.textContent = 'Ouverture…';
        try {
            var path = submission.storage_path.split('/').map(encodeURIComponent).join('/');
            var signed = await storageApi('object/sign/candidate-fiches/' + path, {
                method: 'POST', body: { expiresIn: 300 }
            });
            var signedUrl = signed.signedURL || signed.signedUrl;
            if (!signedUrl) throw new Error('URL PDF signée manquante dans la réponse Storage.');
            var viewer = null;
            // La visionneuse doit être ouverte dans le document de plus haut niveau
            // pour passer devant le tableau de bord, même si celui-ci est intégré.
            try {
                if (window.top && window.top.DoctrineViewer) viewer = window.top.DoctrineViewer;
            } catch (_) {}
            if (!viewer) {
                try {
                    if (window.parent && window.parent.DoctrineViewer) viewer = window.parent.DoctrineViewer;
                } catch (_) {}
            }
            if (!viewer && window.DoctrineViewer) viewer = window.DoctrineViewer;
            if (!viewer || typeof viewer.openSignedPdf !== 'function') {
                throw new Error('La visionneuse PDF est indisponible. Rechargez la page.');
            }
            await viewer.openSignedPdf(relativeStorageUrl(signedUrl), title, '8');
            setStatus('Fiche ouverte : ' + title, false);
        } catch (error) {
            setStatus('Ouverture du PDF impossible : ' + (error.message || error), true);
        } finally {
            button.disabled = false;
            button.textContent = originalLabel;
        }
    }
    function openDashboardReview(candidate, submission, runCorrection) {
        if (submission.rubricFeedbackLoaded !== true) {
            setStatus('Évaluation non modifiable : les observations BM4 n’ont pas été relues intégralement. Actualisez le tableau avant de réessayer.', true);
            return;
        }
        var dialog = document.getElementById('ogDashboardReviewDialog');
        if (!dialog) {
            dialog = node('dialog', 'og-dashboard-review-dialog');
            dialog.id = 'ogDashboardReviewDialog';
            document.body.append(dialog);
        }
        dialog.replaceChildren();
        var isOral = submission.submission_type === 'support_oral';
        var rubric = reviewRubric(submission);
        var review = (submission.reviews || [])[0] || {};
        var heading = node('div', 'og-dashboard-review-heading');
        var headingText = node('div');
        headingText.append(node('p', 'og-dashboard-review-kicker', 'ÉVALUATION BM4 · DOSSIER ' + submission.dossier));
        headingText.append(node('h2', '', (isOral ? 'Fiche support oral — ' : 'Fiche de proposition — ') + candidateName(candidate)));
        var closeButton = node('button', 'og-dashboard-review-close', 'Fermer');
        closeButton.type = 'button';
        closeButton.addEventListener('click', function () { dialog.close(); });
        heading.append(headingText, closeButton);
        var form = node('form', 'og-dashboard-review-form');
        var intro = node('p', 'og-dashboard-review-help',
            'Renseignez chaque critère sur son barème. La correction IA, lorsqu’elle est demandée, reste une proposition à vérifier et à valider par l’Officier Guide.');
        var aiPanel = node('section', 'og-dashboard-review-ai');
        aiPanel.hidden = true;
        var criteria = node('div', 'og-dashboard-review-criteria');
        rubric.forEach(function (criterion) {
            var label = node('label', 'og-dashboard-review-criterion');
            label.append(node('span', '', criterion.label + ' — /' + criterion.max));
            var input = node('input');
            input.type = 'number'; input.min = '0'; input.max = String(criterion.max);
            input.step = '0.01'; input.required = true;
            input.dataset.rubricScore = criterion.key;
            var saved = review.rubric_scores && review.rubric_scores[criterion.key];
            if (saved !== undefined && saved !== null && saved !== '') input.value = String(saved);
            label.append(input);
            var feedback = node('div', 'og-dashboard-review-criterion-feedback');
            var observation = node('textarea');
            observation.rows = 2; observation.maxLength = 500;
            observation.placeholder = criterion.key === 'form'
                ? 'Observation du critère Forme — obligatoire'
                : 'Observation du critère';
            observation.dataset.rubricObservation = criterion.key;
            observation.setAttribute('aria-label', criterion.key === 'form'
                ? 'Observation du critère Forme — obligatoire'
                : 'Observation — ' + criterion.label);
            observation.required = criterion.key === 'form';
            observation.value = String(review.rubric_observations && review.rubric_observations[criterion.key] || '');
            var evidence = node('textarea');
            evidence.rows = 2; evidence.maxLength = 300;
            evidence.placeholder = criterion.key === 'form'
                ? 'Indice documentaire du critère Forme — obligatoire (page, passage, référence)'
                : 'Indice documentaire vérifiable';
            evidence.dataset.rubricEvidence = criterion.key;
            evidence.setAttribute('aria-label', criterion.key === 'form'
                ? 'Indice documentaire du critère Forme — obligatoire'
                : 'Indice documentaire — ' + criterion.label);
            evidence.required = criterion.key === 'form';
            evidence.value = String(review.rubric_evidence && review.rubric_evidence[criterion.key] || '');
            feedback.append(observation, evidence);
            label.append(feedback);
            criteria.append(label);
        });
        var total = node('p', 'og-dashboard-review-total', 'Note calculée : à compléter / 20');
        var decisionLabel = node('label', 'og-dashboard-review-field', 'Décision');
        var decision = node('select');
        [['valide','Validé'],['a_reprendre','À reprendre']].forEach(function (option) {
            var item = node('option', '', option[1]); item.value = option[0]; decision.append(item);
        });
        decision.value = review.status === 'a_reprendre' ? 'a_reprendre' : 'valide';
        decisionLabel.append(decision);
        var formObservationLabel = node('label', 'og-dashboard-review-field', 'Observation du critère Forme — obligatoire');
        var formObservation = node('textarea'); formObservation.rows = 3; formObservation.maxLength = 3000;
        formObservation.value = review.form_observations || '';
        formObservationLabel.append(formObservation);
        var formEvidenceLabel = node('label', 'og-dashboard-review-field', 'Indice documentaire du critère Forme');
        var formEvidence = node('textarea'); formEvidence.rows = 2; formEvidence.maxLength = 1500;
        formEvidence.value = review.form_evidence || '';
        formEvidenceLabel.append(formEvidence);
        // Les champs Forme restent visibles pour relire et corriger les propositions de Gemini.
        var commentLabel = node('label', 'og-dashboard-review-field', 'Commentaires de l’Officier Guide');
        var comment = node('textarea'); comment.rows = 6; comment.maxLength = 4000;
        comment.value = review.comment || '';
        commentLabel.append(comment);
        var status = node('p', 'og-dashboard-review-status');
        status.setAttribute('role', 'status');
        var actions = node('div', 'og-dashboard-review-actions');
        var save = node('button', 'og-dashboard-ai-action is-primary', 'Enregistrer l’évaluation');
        save.type = 'submit';
        var correction = node('button', 'og-dashboard-ai-action', 'Lancer la correction IA');
        correction.type = 'button';
        correction.addEventListener('click', runAi);
        actions.append(correction, save);
        form.append(intro, aiPanel, criteria, total, decisionLabel,
            formObservationLabel, formEvidenceLabel, commentLabel, status, actions);
        dialog.append(heading, form);
        function collectScores() {
            var scores = {};
            var formGrade = 0, contentGrade = 0, complete = true;
            rubric.forEach(function (criterion) {
                var input = criteria.querySelector('[data-rubric-score="' + criterion.key + '"]');
                var value = input.value === '' ? NaN : Number(input.value);
                if (!Number.isFinite(value) || value < 0 || value > criterion.max) complete = false;
                else {
                    scores[criterion.key] = Math.round(value * 100) / 100;
                    if (criterion.group === 'form') formGrade += value;
                    else contentGrade += value;
                }
            });
            var observations = {}, evidence = {};
            rubric.forEach(function (criterion) {
                var observation = criteria.querySelector('[data-rubric-observation="' + criterion.key + '"]');
                var proof = criteria.querySelector('[data-rubric-evidence="' + criterion.key + '"]');
                observations[criterion.key] = String(observation && observation.value || '').trim();
                evidence[criterion.key] = String(proof && proof.value || '').trim();
            });
            var formFeedbackComplete = isOral ||
                (Boolean(observations.form) && Boolean(evidence.form));
            return { scores: scores, observations: observations, evidence: evidence,
                formGrade: formGrade, contentGrade: contentGrade,
                grade: Math.round((formGrade + contentGrade) * 100) / 100,
                complete: complete && formFeedbackComplete };
        }
        function updateTotal() {
            var totals = collectScores();
            total.textContent = totals.complete
                ? 'Note calculée : ' + totals.grade.toLocaleString('fr-FR') + ' / 20'
                : 'Note calculée : à compléter / 20';
        }
        criteria.addEventListener('input', updateTotal);
        updateTotal();
        function renderAiSuggestion(suggestion) {
            aiPanel.replaceChildren();
            aiPanel.hidden = false;
            aiPanel.append(node('h3', '', isOral
                ? 'Proposition de correction IA — Fichette orale'
                : 'Proposition de correction IA — Fiche de proposition'));
            if (!suggestion.readable) {
                aiPanel.append(node('p', '', 'Aucune note n’a été reprise : le document doit être vérifié manuellement.'),
                    node('p', '', suggestion.limitations || 'Document incomplet ou illisible.'));
                return;
            }
            aiPanel.append(node('p', 'og-dashboard-review-warning',
                'Suggestion non enregistrée. Vérifiez la fiche et les notes avant de valider.'));
            aiPanel.append(node('p', '', (isOral ? 'Note du premier critère : ' : 'Note de forme : ') +
                suggestion.form_grade + ' / 6 · Autres critères : ' + suggestion.content_grade +
                ' / ' + (suggestion.content_max_grade || 14) + ' · Fiabilité estimée : ' + (suggestion.confidence || 'non précisée')));
            var displayCriteria = isOral
                ? [suggestion.oral_operatoire].concat(Array.isArray(suggestion.criteria) ? suggestion.criteria : [])
                : [{ label: 'Forme, présentation et langue', grade: suggestion.form_grade, max_grade: 6,
                    observation: suggestion.form_observations, evidence: suggestion.form_evidence }]
                    .concat(Array.isArray(suggestion.criteria) ? suggestion.criteria : []);
            displayCriteria.forEach(function (criterion) {
                var item = node('article', 'og-dashboard-review-ai-criterion');
                item.append(node('strong', '', criterion.label + ' — ' + criterion.grade + ' / ' + criterion.max_grade));
                item.append(node('p', '', criterion.observation || 'Observation non renseignée.'));
                if (criterion.evidence) item.append(node('small', '', 'Indice à vérifier : ' + criterion.evidence));
                aiPanel.append(item);
            });
            if (!isOral) {
                aiPanel.append(node('p', '', 'Forme : ' + (suggestion.form_observations || '') +
                    ' · Indice : ' + (suggestion.form_evidence || 'non repéré')));
            } else {
                aiPanel.append(node('h4', '', 'Comparaison avec la fiche écrite'),
                    node('p', '', suggestion.anti_copy_analysis || 'Comparaison non renseignée.'));
            }
            aiPanel.append(node('p', '', 'Points forts : ' + ((suggestion.strengths || []).join(' · ') || 'Non précisés')),
                node('p', '', 'Axes de progrès : ' + ((suggestion.improvements || []).join(' · ') || 'Non précisés')),
                node('p', '', suggestion.overall_comment || ''));
            var addComment = node('button', 'og-dashboard-ai-action', 'Ajouter la synthèse aux commentaires');
            addComment.type = 'button';
            addComment.addEventListener('click', function () {
                var summary = [suggestion.overall_comment || '',
                    'Points forts : ' + ((suggestion.strengths || []).join('; ') || 'non précisés'),
                    'Axes de progrès : ' + ((suggestion.improvements || []).join('; ') || 'non précisés')].filter(Boolean).join('\n');
                if ((comment.value.trim() + '\n\n' + summary).length > comment.maxLength) {
                    status.textContent = 'La synthèse dépasse la limite de commentaires.';
                    return;
                }
                comment.value = (comment.value.trim() ? comment.value.trim() + '\n\n' : '') + summary;
                status.textContent = 'Synthèse ajoutée. Relisez et modifiez le commentaire avant l’enregistrement.';
            });
            aiPanel.append(addComment);
        }
        async function runAi() {
            correction.disabled = true;
            correction.textContent = 'Analyse Gemini en cours…';
            status.textContent = 'Transmission du PDF à Google Gemini…';
            aiPanel.hidden = false;
            aiPanel.replaceChildren(node('p', '', 'Analyse du document par Google Gemini…'));
            try {
                var suggestion = await functionsApi('/functions/v1/correct-fiche-ai', {
                    method: 'POST', body: { submission_id: submission.id }
                });
                if (suggestion.readable) {
                    var formCriterion = rubric.find(function (item) { return item.group === 'form'; });
                    var formInput = formCriterion && criteria.querySelector('[data-rubric-score="' + formCriterion.key + '"]');
                    if (formInput) formInput.value = String(suggestion.form_grade);
                    rubric.filter(function (item) { return item.group === 'content'; }).forEach(function (item, index) {
                        var input = criteria.querySelector('[data-rubric-score="' + item.key + '"]');
                        var proposed = (suggestion.criteria || [])[index];
                        if (input && proposed) input.value = String(proposed.grade);
                    });
                    updateTotal();
                    var structured = isOral
                        ? [
                            { key: 'operatoire_forme', item: suggestion.oral_operatoire },
                            { key: 'introduction', item: suggestion.oral_introduction || suggestion.criteria?.[0] },
                            { key: 'argumentaire', item: suggestion.oral_argumentaire || suggestion.criteria?.[1] },
                            { key: 'conclusion', item: suggestion.oral_conclusion || suggestion.criteria?.[2] }
                        ]
                        : [
                            { key: 'form', item: { observation: suggestion.form_observations, evidence: suggestion.form_evidence } },
                            { key: 'introduction', item: suggestion.criteria?.[0] },
                            { key: 'problematique_donnees', item: suggestion.criteria?.[1] },
                            { key: 'solutions', item: suggestion.criteria?.[2] },
                            { key: 'avis_conclusion', item: suggestion.criteria?.[3] }
                        ];
                    structured.forEach(function (entry) {
                        var observation = criteria.querySelector('[data-rubric-observation="' + entry.key + '"]');
                        var proof = criteria.querySelector('[data-rubric-evidence="' + entry.key + '"]');
                        if (observation) observation.value = String(entry.item?.observation || '').trim();
                        if (proof) proof.value = String(entry.item?.evidence || '').trim();
                    });
                    if (!isOral) {
                        formObservation.value = String(suggestion.form_observations || '').trim();
                        formEvidence.value = String(suggestion.form_evidence || '').trim();
                    }
                }
                renderAiSuggestion(suggestion);
                status.textContent = suggestion.readable
                    ? 'Proposition générée. Vérifiez les critères, puis enregistrez si vous la confirmez.'
                    : 'Le PDF ne peut pas être évalué automatiquement. Vérifiez-le manuellement.';
            } catch (error) {
                status.textContent = error.status === 502 || error.status === 503
                    ? "Service IA temporairement indisponible. Votre fiche n'a pas été corrigée. Vous pouvez réessayer ultérieurement."
                    : 'Correction IA impossible : ' + error.message;
                aiPanel.hidden = true;
            } finally {
                correction.disabled = false;
                correction.textContent = 'Relancer la correction IA';
            }
        }
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (submission.rubricFeedbackLoaded !== true) {
                status.textContent = 'Enregistrement bloqué : les observations structurées BM4 n’ont pas été relues avec succès. Actualisez le tableau avant de réessayer.';
                return;
            }
            var totals = collectScores();
            if (!isOral && (!totals.observations.form || !totals.evidence.form)) {
                status.textContent = 'Pour le critère Forme, renseignez obligatoirement une observation et un indice documentaire vérifiable (page, passage ou référence).';
                var formObservationInput = criteria.querySelector('[data-rubric-observation="form"]');
                var formEvidenceInput = criteria.querySelector('[data-rubric-evidence="form"]');
                if (formObservationInput && !formObservationInput.value.trim()) formObservationInput.focus();
                else if (formEvidenceInput) formEvidenceInput.focus();
                return;
            }
            if (!totals.complete) {
                status.textContent = 'Renseignez une note valide pour chaque critère de la grille.';
                return;
            }
            save.disabled = true;
            status.textContent = 'Enregistrement de l’évaluation…';
            api('fiche_reviews?on_conflict=submission_id%2Cguide_id', {
                method: 'POST',
                prefer: 'resolution=merge-duplicates,return=representation',
                body: {
                    submission_id: submission.id,
                    form_grade: totals.formGrade,
                    content_grade: totals.contentGrade,
                    grade: totals.grade,
                    rubric_scores: totals.scores,
                    rubric_observations: totals.observations,
                    rubric_evidence: totals.evidence,
                    form_observations: isOral ? null : totals.observations.form,
                    form_evidence: isOral ? null : totals.evidence.form,
                    jury_checklist: (function () {
                        var allowed = isOral
                            ? ['oral_operatoire', 'oral_introduction', 'oral_argumentaire', 'oral_conclusion']
                            : ['p_form_pages', 'p_form_header', 'p_form_references', 'p_form_style',
                                'p_intro_context', 'p_intro_solution', 'p_intro_plan',
                                'p_problem_facts', 'p_problem_level', 'p_problem_criteria',
                                'p_solutions_three', 'p_solutions_details', 'p_solutions_risks',
                                'p_opinion', 'p_risk_mitigation', 'p_conclusion'];
                        var existing = review.jury_checklist && typeof review.jury_checklist === 'object'
                            ? review.jury_checklist : {};
                        return Object.keys(existing).reduce(function (clean, key) {
                            if (allowed.indexOf(key) !== -1 && typeof existing[key] === 'boolean') {
                                clean[key] = existing[key];
                            }
                            return clean;
                        }, {});
                    })(),
                    status: decision.value,
                    comment: comment.value.trim()
                }
            }).then(function () {
                status.textContent = 'Évaluation enregistrée.';
                dialog.close();
                load();
            }).catch(function (error) {
                status.textContent = 'Enregistrement impossible : ' + error.message;
            }).finally(function () { save.disabled = false; });
        });
        if (dialog.showModal) dialog.showModal();
        else dialog.setAttribute('open', '');
        if (runCorrection) runAi();
    }
    function reviewGradeForExport(submission, review) {
        if (!review || review.status !== 'valide') return null;
        var rubric = reviewRubric(submission);
        var scores = review.rubric_scores || {};
        var total = 0;
        var complete = true;
        rubric.forEach(function (criterion) {
            var rawValue = scores[criterion.key];
            var value = rawValue === null || rawValue === undefined || rawValue === '' ? NaN : Number(rawValue);
            if (!Number.isFinite(value) || value < 0 || value > criterion.max) complete = false;
            else total += value;
        });
        return complete ? Math.round(total * 100) / 100 : null;
    }
    function exportFeedbackSection(comment, label, stopLabels) {
        var source = String(comment || '').replace(/\\r\\n|\\n|\\r/g, '\\n');
        var match = new RegExp('(?:^|\\n)' + label + '\\s*:\\s*', 'i').exec(source);
        if (!match) return '';
        var tail = source.slice(match.index + match[0].length);
        var stop = new RegExp('\\n(?:' + stopLabels.join('|') + ')\\s*:', 'i').exec(tail);
        return (stop ? tail.slice(0, stop.index) : tail).trim();
    }
    function buildDossierBm4Report(candidate, dossierItems) {
        var evaluations = [];
        var checklistKeys = {
            proposition: ['p_form_pages', 'p_form_header', 'p_form_references', 'p_form_style',
                'p_intro_context', 'p_intro_solution', 'p_intro_plan',
                'p_problem_facts', 'p_problem_level', 'p_problem_criteria',
                'p_solutions_three', 'p_solutions_details', 'p_solutions_risks',
                'p_opinion', 'p_risk_mitigation', 'p_conclusion'],
            support_oral: ['oral_operatoire', 'oral_introduction', 'oral_argumentaire', 'oral_conclusion']
        };
        dossierItems.forEach(function (submission) {
            var review = (submission.reviews || []).find(function (item) { return item.status === 'valide'; });
            var grade = reviewGradeForExport(submission, review);
            if (grade === null) return;
            var type = submission.submission_type;
            var rubric = reviewRubric(submission);
            evaluations.push({
                type: type,
                label: type === 'support_oral' ? 'Fichette orale' : 'Fiche de proposition',
                grade: grade,
                rubricScores: review.rubric_scores || {},
                rubricObservations: review.rubric_observations || {},
                rubricEvidence: review.rubric_evidence || {},
                criteria: rubric.map(function (criterion) {
                    return { key: criterion.key, label: criterion.label, max_grade: criterion.max };
                }),
                juryChecklist: (checklistKeys[type] || []).map(function (key) {
                    return { key: key, label: key, checked: Boolean(review.jury_checklist && review.jury_checklist[key]) };
                }),
                comment: review.comment || '',
                formObservations: review.form_observations || review.rubric_observations?.form || review.rubric_observations?.operatoire_forme || '',
                formEvidence: review.form_evidence || review.rubric_evidence?.form || review.rubric_evidence?.operatoire_forme || '',
                reviewedAt: review.reviewed_at || new Date().toISOString()
            });
        });
        var proposition = evaluations.find(function (item) { return item.type === 'proposition'; });
        var oral = evaluations.find(function (item) { return item.type === 'support_oral'; });
        var weightedGrade = proposition && oral
            ? Math.round((proposition.grade * 0.7 + oral.grade * 0.3) * 100) / 100
            : null;
        var strengths = [
            proposition && exportFeedbackSection(proposition.comment, 'Points forts', ['Axes de progrès', 'Axes d’amélioration', 'Synthèse']),
            oral && exportFeedbackSection(oral.comment, 'Points forts', ['Axes de progrès', 'Axes d’amélioration', 'Synthèse'])
        ].filter(Boolean);
        var improvements = [
            proposition && exportFeedbackSection(proposition.comment, 'Axes de progrès', ['Synthèse', 'Comparaison avec la fiche écrite']),
            proposition && exportFeedbackSection(proposition.comment, 'Axes d’amélioration', ['Synthèse', 'Comparaison avec la fiche écrite']),
            oral && exportFeedbackSection(oral.comment, 'Axes de progrès', ['Synthèse', 'Comparaison avec la fiche écrite']),
            oral && exportFeedbackSection(oral.comment, 'Axes d’amélioration', ['Synthèse', 'Comparaison avec la fiche écrite'])
        ].filter(Boolean);
        var identity = candidate.candidate || {};
        var subjectItem = dossierItems.find(function (item) { return item.subject || item.title; }) || {};
        return {
            candidateName: candidateName(candidate),
            specialty: identity.specialty || '',
            dossier: String(dossierItems[0] && dossierItems[0].dossier || ''),
            subject: subjectItem.subject || subjectItem.title || 'Évaluation BM4',
            guideName: 'Officier Guide',
            evaluations: evaluations,
            weightedGrade: weightedGrade,
            strengths: strengths,
            improvements: improvements,
            exportedAt: new Date().toLocaleDateString('fr-FR')
        };
    }
    async function exportDossierBm4(candidate, dossierItems, button, finalOnly) {
        var originalLabel = button.textContent;
        button.disabled = true;
        button.textContent = 'Génération du PDF…';
        try {
            var report = buildDossierBm4Report(candidate, dossierItems);
            var hasProposition = report.evaluations.some(function (item) { return item.type === 'proposition'; });
            var hasOral = report.evaluations.some(function (item) { return item.type === 'support_oral'; });
            if (!report.evaluations.length) throw new Error('Aucune évaluation validée à exporter.');
            if (finalOnly && (!hasProposition || !hasOral || report.weightedGrade === null)) {
                throw new Error('L’évaluation finale nécessite la validation des deux fiches par l’Officier Guide.');
            }
            var pdfModule = await import('./bm4-official-pdf.mjs');
            var pdf = await pdfModule.createOfficialBm4Pdf(report);
            var url = URL.createObjectURL(pdf);
            var link = node('a');
            var filename = report.candidateName.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
                .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'candidat';
            link.href = url;
            link.download = finalOnly
                ? 'Evaluation_finale_BM4_' + filename + '_Dossier_' + report.dossier + '.pdf'
                : 'Grille_BM4_Dossier_' + filename + '_' + report.dossier +
                    (report.weightedGrade === null ? '_Partielle' : '_Complet_70_30') + '.pdf';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
            setStatus((finalOnly ? 'Évaluation finale BM4 exportée pour ' : 'Grille BM4 officielle téléchargée pour ') +
                report.candidateName + '.', false);
        } catch (error) {
            setStatus('Export PDF impossible : ' + (error.message || error), true);
        } finally {
            button.disabled = false;
            button.textContent = originalLabel;
        }
    }
    function renderAiCorrection(candidate) {
        var section = node('details', 'og-candidate-profile-accordion og-candidate-profile-ai og-dashboard-ai-correction');
        section.append(node('summary', '', 'Correction assistée par IA'));
        var content = node('div', 'og-candidate-profile-accordion-content');
        var gridCard = node('article', 'og-dashboard-ai-grid-card');
        var gridContent = node('div', 'og-dashboard-ai-grid-content');
        gridContent.append(node('p', 'og-dashboard-ai-grid-kicker', 'RÉFÉRENTIEL OFFICIEL · BM4'));
        gridContent.append(node('h4', '', 'Grille interactive d’évaluation BM4'));
        gridContent.append(node('p', '', 'Évaluez séparément la fiche de proposition (70 %) et le support oral (30 %) selon les critères de la grille. La moyenne pondérée de l’épreuve est disponible lorsque les deux fiches du dossier sont évaluées.'));
        gridContent.append(node('p', '', 'La correction assistée par IA est disponible pour les fiches de proposition et les fichette(s) orales. Elle propose une analyse, des notes, des annotations et des axes d’amélioration selon la grille officielle.'));
        gridContent.append(node('p', '', 'L’Officier Guide vérifie, ajuste et valide toujours l’évaluation finale. Le compte rendu PDF officiel est généré après son enregistrement.'));
        var gridActions = node('div', 'og-dashboard-ai-grid-actions');
        var gridOpen = node('a', 'og-dashboard-ai-grid-link is-primary', 'Ouvrir la grille (PDF)');
        gridOpen.href = 'https://domino2801-cmyk.github.io/DOCTRINE/app/grille-evaluation-synthese-bm4-interactive.pdf';
        gridOpen.target = '_blank';
        gridOpen.rel = 'noopener noreferrer';
        var gridDownload = node('a', 'og-dashboard-ai-grid-link', 'Télécharger une copie vierge');
        gridDownload.href = 'https://domino2801-cmyk.github.io/DOCTRINE/app/grille-evaluation-synthese-bm4-interactive.pdf';
        gridDownload.setAttribute('download', 'grille-evaluation-synthese-bm4-interactive.pdf');
        gridDownload.rel = 'noopener noreferrer';
        gridActions.append(gridOpen, gridDownload);
        gridCard.append(gridContent, gridActions);
        content.append(gridCard);
        var items = (candidate.doctrine && Array.isArray(candidate.doctrine.submissions)
            ? candidate.doctrine.submissions : []).filter(function (submission) {
            return submission.submission_type === 'proposition' || submission.submission_type === 'support_oral';
        });
        if (!items.length) {
            content.append(node('p', 'og-dashboard-muted', 'Aucune fiche de proposition ou fiche support oral transmise.'));
            section.append(content);
            return section;
        }
        var groups = Object.create(null);
        items.forEach(function (submission) {
            var key = String(submission.dossier || 'Non renseigné');
            (groups[key] || (groups[key] = [])).push(submission);
        });
        Object.keys(groups).sort(function (a, b) {
            return a.localeCompare(b, 'fr', { numeric: true });
        }).forEach(function (dossier) {
            var group = node('section', 'og-dashboard-ai-dossier');
            group.append(node('h4', '', 'DOSSIER ' + dossier));
            var dossierItems = groups[dossier].slice();
            var dossierReport = buildDossierBm4Report(candidate, dossierItems);
            var hasProposition = dossierReport.evaluations.some(function (item) { return item.type === 'proposition'; });
            var hasOral = dossierReport.evaluations.some(function (item) { return item.type === 'support_oral'; });
            if (dossierReport.evaluations.length) {
                var dossierExports = node('div', 'og-dashboard-ai-actions og-dashboard-dossier-exports');
                var officialGridButton = node('button', 'og-dashboard-ai-action', 'Télécharger la grille BM4 officielle');
                officialGridButton.type = 'button';
                officialGridButton.addEventListener('click', function () {
                    exportDossierBm4(candidate, dossierItems, officialGridButton, false);
                });
                dossierExports.append(officialGridButton);
                if (hasProposition && hasOral && dossierReport.weightedGrade !== null) {
                    var finalExportButton = node('button', 'og-dashboard-ai-action is-primary', 'Exporter l’évaluation finale pour le candidat');
                    finalExportButton.type = 'button';
                    finalExportButton.addEventListener('click', function () {
                        exportDossierBm4(candidate, dossierItems, finalExportButton, true);
                    });
                    dossierExports.append(finalExportButton);
                }
                group.append(dossierExports);
            }
            dossierItems.sort(function (a, b) {
                return (a.submission_type === 'proposition' ? 0 : 1) -
                    (b.submission_type === 'proposition' ? 0 : 1);
            }).forEach(function (submission) {
                var isOral = submission.submission_type === 'support_oral';
                var review = (submission.reviews || [])[0] || null;
                var card = node('article', 'og-dashboard-ai-card');
                var title = isOral ? 'FICHE SUPPORT ORAL' : 'FICHE DE PROPOSITION';
                card.append(node('strong', '', title));
                var state = !review || !review.status || review.status === 'en_attente'
                    ? 'En attente d’évaluation'
                    : review.status === 'valide' ? 'Validée par l’Officier Guide'
                    : review.status === 'a_reprendre' ? 'À reprendre' : 'Évaluation enregistrée';
                var grade = review && review.grade !== null && review.grade !== undefined
                    ? ' · ' + Number(review.grade).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' / 20' : '';
                card.append(node('p', 'og-dashboard-ai-state', state + grade));
                if (review && review.comment) {
                    var commentHeading = node('strong', 'og-dashboard-ai-comment-heading',
                        'Commentaires de l’Officier Guide');
                    var result = node('p', 'og-dashboard-ai-result');
                    // Afficher le commentaire enregistré en entier, pour les deux types de fiche.
                    // white-space: pre-wrap dans le CSS conserve les paragraphes et retours à la ligne.
                    result.textContent = String(review.comment);
                    card.append(commentHeading, result);
                }
                var actions = node('div', 'og-dashboard-ai-actions');
                var openButton = node('button', 'og-dashboard-ai-action is-primary',
                    isOral ? 'Ouvrir la fiche support oral' : 'Ouvrir la fiche de proposition');
                openButton.type = 'button';
                var evaluateButton = node('button', 'og-dashboard-ai-action', 'Évaluer avec la grille BM4');
                evaluateButton.type = 'button';
                var correctionButton = node('button', 'og-dashboard-ai-action',
                    isOral ? 'Correction IA — Fichette orale' : 'Correction IA — Proposition');
                correctionButton.type = 'button';
                [openButton, evaluateButton, correctionButton].forEach(function (button) {
                    button.disabled = !submission.storage_path;
                    button.title = submission.storage_path ? button.textContent : 'Aucun PDF archivé pour cette fiche.';
                });
                openButton.addEventListener('click', function () {
                    openCandidatePdf(candidate, submission, openButton);
                });
                evaluateButton.addEventListener('click', function () {
                    openDashboardReview(candidate, submission, false);
                });
                correctionButton.addEventListener('click', function () {
                    openDashboardReview(candidate, submission, true);
                });
                actions.append(openButton, evaluateButton, correctionButton);
                card.append(actions);
                group.append(card);
            });
            content.append(group);
        });
        section.append(content);
        return section;
    }
    var exerciseLibraryForm = null;
    var exerciseLibrarySelectedId = '';
    function exerciseLibraryAdminForm(type, item) {
        if (dashboardMode !== 'admin') return;
        if (!exerciseLibraryForm) {
            exerciseLibraryForm = node('form', 'og-dashboard-library-admin-form');
            exerciseLibraryForm.addEventListener('submit', saveExerciseLibraryItem);
        }
        exerciseLibraryForm.replaceChildren();
        var heading = node('h4', '', (item ? 'Modifier ' : 'Ajouter ') + (type === 'exercise' ? 'un dossier d’exercice' : 'une correction'));
        exerciseLibraryForm.append(heading);
        function field(labelText, name, value, tag, required) {
            var label = node('label', 'og-dashboard-library-admin-field', labelText);
            var input = node(tag || 'input');
            input.name = name;
            input.value = value || '';
            input.required = !!required;
            if (tag === 'textarea') input.rows = 3;
            label.append(input);
            exerciseLibraryForm.append(label);
            return input;
        }
        exerciseLibraryForm.dataset.type = type;
        exerciseLibraryForm.dataset.id = item ? item.id : '';
        field('Titre', 'title', item && item.title, 'input', true);
        if (type === 'exercise') field('Catégorie', 'category', item && item.category || 'Général', 'input', false);
        else {
            var label = node('label', 'og-dashboard-library-admin-field', 'Dossier associé');
            var select = node('select');
            select.name = 'exercise_id';
            exerciseLibraryItems.forEach(function (exercise) {
                var option = node('option', '', exercise.title);
                option.value = exercise.id;
                select.append(option);
            });
            select.value = item ? item.exercise_id : exerciseLibrarySelectedId || '';
            label.append(select);
            exerciseLibraryForm.append(label);
        }
        field('Description', 'description', item && item.description, 'textarea', false);
        field('Lien Google Drive', 'drive_url', item && item.drive_url, 'input', true);
        var levelLabel = node('label', 'og-dashboard-library-admin-field', 'Difficulté');
        var level = node('select');
        level.name = 'difficulty_level';
        EXERCISE_LEVELS.forEach(function (entry, index) {
            var option = node('option', '', entry.label);
            option.value = String(index + 1);
            level.append(option);
        });
        level.value = String(item && item.difficulty_level || 1);
        levelLabel.append(level);
        exerciseLibraryForm.append(levelLabel);
        var publishLabel = node('label', 'og-dashboard-library-admin-publish');
        var publish = node('input');
        publish.type = 'checkbox';
        publish.name = 'is_published';
        publish.checked = item ? !!item.is_published : true;
        publishLabel.append(publish, node('span', '', 'Publier pour les Officiers Guides'));
        exerciseLibraryForm.append(publishLabel);
        var buttons = node('div', 'og-dashboard-library-admin-actions');
        var save = node('button', 'og-dashboard-download', 'Enregistrer');
        save.type = 'submit';
        var cancel = node('button', 'og-dashboard-download', 'Annuler');
        cancel.type = 'button';
        cancel.addEventListener('click', function () { exerciseLibraryForm.hidden = true; });
        buttons.append(save, cancel);
        exerciseLibraryForm.append(buttons);
        exerciseLibraryForm.hidden = false;
        exerciseLibraryNode.prepend(exerciseLibraryForm);
        exerciseLibraryForm.querySelector('[name="title"]').focus();
    }
    function saveExerciseLibraryItem(event) {
        event.preventDefault();
        if (dashboardMode !== 'admin' || !exerciseLibraryForm) return;
        var form = exerciseLibraryForm;
        var type = form.dataset.type;
        var id = form.dataset.id;
        var payload = {
            title: form.querySelector('[name="title"]').value.trim(),
            description: form.querySelector('[name="description"]').value.trim(),
            drive_url: form.querySelector('[name="drive_url"]').value.trim(),
            difficulty_level: Number(form.querySelector('[name="difficulty_level"]').value),
            is_published: form.querySelector('[name="is_published"]').checked,
            updated_at: new Date().toISOString()
        };
        if (type === 'exercise') payload.category = form.querySelector('[name="category"]').value.trim() || 'Général';
        else payload.exercise_id = form.querySelector('[name="exercise_id"]').value;
        if (!payload.title || !safeDriveUrl(payload.drive_url) || (type === 'correction' && !payload.exercise_id)) {
            setStatus('Vérifiez le titre, le lien Google Drive et le dossier associé.', true);
            return;
        }
        var table = type === 'exercise' ? 'guide_exercise_library' : 'guide_correction_library';
        var path = table + (id ? '?id=eq.' + encodeURIComponent(id) : '');
        api(path, { method: id ? 'PATCH' : 'POST', prefer: 'return=representation', body: payload })
            .then(function () { form.hidden = true; return loadExerciseLibraries(); })
            .catch(function (error) { setStatus('Enregistrement impossible : ' + (error.message || 'erreur inconnue'), true); });
    }
    function setExerciseLibraryPublished(type, item, published) {
        if (dashboardMode !== 'admin') return;
        var table = type === 'exercise' ? 'guide_exercise_library' : 'guide_correction_library';
        api(table + '?id=eq.' + encodeURIComponent(item.id), {
            method: 'PATCH',
            prefer: 'return=representation',
            body: { is_published: !!published, updated_at: new Date().toISOString() }
        }).then(loadExerciseLibraries).catch(function (error) {
            setStatus('Modification de la publication impossible : ' + (error.message || 'erreur inconnue'), true);
        });
    }
    function deleteExerciseLibraryItem(type, item) {
        if (dashboardMode !== 'admin') return;
        var label = type === 'exercise' ? 'ce dossier et ses corrections associées' : 'cette correction';
        if (!window.confirm('Supprimer définitivement « ' + item.title + ' » (' + label + ') ?')) return;
        var table = type === 'exercise' ? 'guide_exercise_library' : 'guide_correction_library';
        api(table + '?id=eq.' + encodeURIComponent(item.id), { method: 'DELETE' })
            .then(loadExerciseLibraries)
            .catch(function (error) {
                setStatus('Suppression impossible. Pour un dossier, supprimez d’abord ses corrections. ' + (error.message || ''), true);
            });
    }
    function renderExerciseLibraries() {
        if (!exerciseLibraryNode) return;
        exerciseLibraryNode.replaceChildren();
        if (dashboardMode === 'admin') {
            var adminToolbar = node('div', 'og-dashboard-library-admin-toolbar');
            var addExerciseButton = node('button', 'og-dashboard-download', '+ Ajouter un dossier d’exercice');
            addExerciseButton.type = 'button';
            addExerciseButton.addEventListener('click', function () { exerciseLibraryAdminForm('exercise', null); });
            var addCorrectionButton = node('button', 'og-dashboard-download', '+ Ajouter une correction');
            addCorrectionButton.type = 'button';
            addCorrectionButton.disabled = !exerciseLibraryItems.length;
            addCorrectionButton.addEventListener('click', function () {
                exerciseLibrarySelectedId = exerciseLibraryItems[0] ? exerciseLibraryItems[0].id : '';
                exerciseLibraryAdminForm('correction', null);
            });
            adminToolbar.append(addExerciseButton, addCorrectionButton);
            exerciseLibraryNode.append(adminToolbar);
            exerciseLibraryForm = null;
        }
        var list = node('div', 'og-dashboard-library-levels');
        EXERCISE_LEVELS.forEach(function (level) {
            var levelRows = exerciseLibraryItems.filter(function (exercise) {
                return String(Math.max(1, Math.min(4, Number(exercise.difficulty_level) || 1))) === level.value;
            });
            var group = node('details', 'og-dashboard-library-level-group');
            var summary = node('summary', 'og-dashboard-library-level-heading');
            var levelTitle = node('span', 'og-dashboard-library-level-title', level.label);
            var levelCount = node('button', 'og-dashboard-library-level-count',
                levelRows.length + (levelRows.length > 1 ? ' exercices' : ' exercice'));
            levelCount.type = 'button';
            levelCount.setAttribute('aria-expanded', 'false');
            levelCount.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                group.open = !group.open;
                levelCount.setAttribute('aria-expanded', String(group.open));
            });
            summary.addEventListener('click', function (event) {
                event.preventDefault();
            });
            group.addEventListener('toggle', function () {
                levelCount.setAttribute('aria-expanded', String(group.open));
            });
            summary.append(levelTitle, levelCount);
            group.append(summary);
            if (!levelRows.length) {
                group.append(node('p', 'og-dashboard-empty og-dashboard-library-level-empty',
                    'Aucun exercice publié à ce niveau.'));
            } else {
                var cards = node('div', 'og-dashboard-library-grid');
                levelRows.forEach(function (exercise) {
                    var card = node('article', 'og-dashboard-library-card');
                    var difficulty = Number(exercise.difficulty_level) || 1;
                    var starsBadge = node('span', 'og-dashboard-library-stars');
                    starsBadge.append(
                        node('span', 'og-dashboard-library-stars-icons', '★'.repeat(difficulty)),
                        node('span', 'og-dashboard-library-stars-label', EXERCISE_LEVELS[difficulty - 1].name)
                    );
                    card.append(starsBadge);
                    card.append(node('h4', '', exercise.title));
                    if (dashboardMode === 'admin' && !exercise.is_published) {
                        card.append(node('span', 'og-dashboard-library-status is-disabled', 'Désactivé — non visible par les Officiers Guides'));
                    }
                    if (exercise.category) card.append(node('span', 'og-dashboard-library-category', exercise.category));
                    if (exercise.description) card.append(node('p', '', exercise.description));
                    var actions = node('div', 'og-dashboard-library-actions');
                    var open = node('button', 'og-dashboard-download', 'Télécharger');
                    open.type = 'button';
                    open.addEventListener('click', function () {
                        openDriveInViewer(exercise.drive_url, exercise.title);
                    });
                    actions.append(open);
                    if (dashboardMode === 'admin') {
                        var editExercise = node('button', 'og-dashboard-download', 'Modifier');
                        editExercise.type = 'button';
                        editExercise.addEventListener('click', function () { exerciseLibraryAdminForm('exercise', exercise); });
                        var publishExercise = node('button', 'og-dashboard-download', exercise.is_published ? 'Désactiver' : 'Réactiver');
                        publishExercise.type = 'button';
                        publishExercise.addEventListener('click', function () {
                            setExerciseLibraryPublished('exercise', exercise, !exercise.is_published);
                        });
                        var deleteExercise = node('button', 'og-dashboard-download', 'Supprimer');
                        deleteExercise.type = 'button';
                        deleteExercise.addEventListener('click', function () { deleteExerciseLibraryItem('exercise', exercise); });
                        var addRelatedCorrection = node('button', 'og-dashboard-download', '+ Ajouter une correction');
                        addRelatedCorrection.type = 'button';
                        addRelatedCorrection.addEventListener('click', function () {
                            exerciseLibrarySelectedId = exercise.id;
                            exerciseLibraryAdminForm('correction', null);
                        });
                        actions.append(editExercise, publishExercise, deleteExercise, addRelatedCorrection);
                    }
                    var related = correctionLibraryItems.filter(function (correction) {
                        return correction.exercise_id === exercise.id;
                    });
                    if (related.length) {
                        var details = node('details', 'og-dashboard-library-corrections');
                        var correctionSummary = node('summary', '', 'Corrections disponibles (' + related.length + ')');
                        details.append(correctionSummary);
                        related.forEach(function (correction) {
                            var line = node('div', 'og-dashboard-library-correction');
                            var correctionLevel = Math.max(1, Math.min(4, Number(correction.difficulty_level) || difficulty));
                            line.append(node('span', 'og-dashboard-library-correction-stars',
                                '★'.repeat(correctionLevel) + ' · ' + EXERCISE_LEVELS[correctionLevel - 1].name));
                            var title = node('strong', '', correction.title);
                            if (dashboardMode === 'admin' && !correction.is_published) {
                                title.append(node('span', 'og-dashboard-library-status is-disabled', ' · Désactivée'));
                            }
                            var correctionActions = node('div', 'og-dashboard-library-actions');
                            var link = node('button', 'og-dashboard-download', 'Télécharger');
                            link.type = 'button';
                            link.addEventListener('click', function () {
                                openDriveInViewer(correction.drive_url, correction.title);
                            });
                            correctionActions.append(link);
                            if (dashboardMode === 'admin') {
                                var editCorrection = node('button', 'og-dashboard-download', 'Modifier');
                                editCorrection.type = 'button';
                                editCorrection.addEventListener('click', function () { exerciseLibraryAdminForm('correction', correction); });
                                var publishCorrection = node('button', 'og-dashboard-download', correction.is_published ? 'Désactiver' : 'Réactiver');
                                publishCorrection.type = 'button';
                                publishCorrection.addEventListener('click', function () {
                                    setExerciseLibraryPublished('correction', correction, !correction.is_published);
                                });
                                var deleteCorrection = node('button', 'og-dashboard-download', 'Supprimer');
                                deleteCorrection.type = 'button';
                                deleteCorrection.addEventListener('click', function () { deleteExerciseLibraryItem('correction', correction); });
                                correctionActions.append(editCorrection, publishCorrection, deleteCorrection);
                            }
                            line.append(title, correctionActions);
                            if (correction.description) line.append(node('p', '', correction.description));
                            details.append(line);
                        });
                        card.append(details);
                    }
                    card.append(actions);
                    cards.append(card);
                });
                group.append(cards);
            }
            list.append(group);
        });
        exerciseLibraryNode.append(list);
    }
    function loadExerciseLibraries() {
        if (!exerciseLibraryNode) return Promise.resolve();
        return Promise.allSettled([
            api('guide_exercise_library?select=id,title,category,description,drive_url,difficulty_level,sort_order,is_published&' + (dashboardMode === 'admin' ? '' : 'is_published=eq.true&') + 'order=difficulty_level.asc,sort_order.asc,title.asc'),
            api('guide_correction_library?select=id,exercise_id,title,description,drive_url,difficulty_level,sort_order,is_published&' + (dashboardMode === 'admin' ? '' : 'is_published=eq.true&') + 'order=difficulty_level.asc,sort_order.asc,title.asc')
        ]).then(function (results) {
            exerciseLibraryItems = results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [];
            correctionLibraryItems = results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : [];
            renderExerciseLibraries();
            if (results.some(function (result) { return result.status === 'rejected'; })) {
                exerciseLibraryNode.append(node('p', 'og-dashboard-muted', 'La bibliothèque des exercices et corrections est momentanément indisponible.'));
            }
        });
    }
    var courseAdminForm = null;
    var courseProposalList = null;
    var courseProposalArea = null;
    function openCourseAdminForm(course) {
        if (dashboardMode !== 'admin') return;
        if (!courseAdminForm) {
            courseAdminForm = node('form', 'og-dashboard-course-admin-form');
            courseAdminForm.addEventListener('submit', saveCourseAdminForm);
        }
        courseAdminForm.replaceChildren();
        courseAdminForm.dataset.id = course ? course.id : '';
        courseAdminForm.append(node('h4', '', course ? 'Modifier le cours' : 'Ajouter un cours'));
        function field(labelText, name, value, tag, required, maxLength) {
            var label = node('label', 'og-dashboard-course-admin-field', labelText);
            var input = node(tag || 'input');
            input.name = name; input.value = value || ''; input.required = !!required;
            if (maxLength) input.maxLength = maxLength;
            if (tag === 'textarea') input.rows = 3;
            label.append(input); courseAdminForm.append(label);
        }
        field('Intitulé du cours', 'title', course && course.title, 'input', true, 160);
        field('Catégorie', 'category', course && course.category, 'input', true, 100);
        field('Description', 'description', course && course.description, 'textarea', false, 1200);
        field('Lien Google Drive', 'drive_url', course && course.drive_url, 'input', true, 1000);
        var actions = node('div', 'og-dashboard-course-admin-actions');
        var save = node('button', 'og-dashboard-download', 'Enregistrer'); save.type = 'submit';
        var cancel = node('button', 'og-dashboard-download', 'Annuler'); cancel.type = 'button';
        cancel.addEventListener('click', function () { courseAdminForm.hidden = true; });
        actions.append(save, cancel); courseAdminForm.append(actions);
        courseAdminForm.hidden = false; coursesNode.prepend(courseAdminForm);
        courseAdminForm.querySelector('[name="title"]').focus();
    }
    function saveCourseAdminForm(event) {
        event.preventDefault();
        if (dashboardMode !== 'admin' || !courseAdminForm) return;
        var form = courseAdminForm;
        var payload = {
            title: form.querySelector('[name="title"]').value.trim(),
            category: form.querySelector('[name="category"]').value.trim(),
            description: form.querySelector('[name="description"]').value.trim(),
            drive_url: form.querySelector('[name="drive_url"]').value.trim()
        };
        if (!payload.title || !payload.category || !safeDriveUrl(payload.drive_url)) {
            setStatus('Renseignez le titre, la catégorie et un lien Google Drive valide.', true); return;
        }
        var id = form.dataset.id;
        api('guide_course_catalog' + (id ? '?id=eq.' + encodeURIComponent(id) : ''), {
            method: id ? 'PATCH' : 'POST', prefer: 'return=representation', body: payload
        }).then(function () { form.hidden = true; return loadCourseCatalog(); })
          .catch(function (error) { setStatus('Enregistrement impossible : ' + (error.message || ''), true); });
    }
    function deleteCourseAdmin(course) {
        if (dashboardMode !== 'admin' || !window.confirm('Supprimer définitivement « ' + course.title + ' » de la bibliothèque et du Module 2.1 candidat ?')) return;
        function archiveProposal(proposalId) {
            return api('guide_document_proposals?id=eq.' + encodeURIComponent(proposalId), {
                method: 'PATCH', prefer: 'return=minimal',
                body: { status: 'rejected', admin_note: 'Cours retiré de la bibliothèque Officier Guide.' }
            });
        }
        function proposalCategory(proposal) {
            var description = String(proposal.description || '');
            var match = description.match(/^Catégorie : ([^\\n]*)/);
            return match ? match[1].trim() : 'Cours Officier Guide';
        }
        var proposalId = String(course.id || '').indexOf('proposal-') === 0
            ? String(course.id).slice('proposal-'.length) : '';
        var removeFromCatalog = proposalId
            ? Promise.resolve()
            : api('guide_course_catalog?id=eq.' + encodeURIComponent(course.id), { method: 'DELETE' });
        var removeProposal = proposalId
            ? archiveProposal(proposalId)
            : api('guide_document_proposals?select=id,title,category,description&category=in.%28%22Cours%20Officier%20Guide%22%2C%22Proposition%20Officier%20Guide%22%29&status=eq.approved')
                .then(function (proposals) {
                    var match = (Array.isArray(proposals) ? proposals : []).find(function (proposal) {
                        return String(proposal.title || '').trim().toLocaleLowerCase('fr') ===
                            String(course.title || '').trim().toLocaleLowerCase('fr') &&
                            proposalCategory(proposal).toLocaleLowerCase('fr') ===
                            String(course.category || '').trim().toLocaleLowerCase('fr');
                    });
                    return match ? archiveProposal(match.id) : null;
                });
        Promise.resolve().then(function () {
            return removeProposal.then(function () { return removeFromCatalog; });
        }).then(function () {
            setStatus('Cours supprimé de la bibliothèque et retiré des cours validés du Module 2.1.');
            document.dispatchEvent(new CustomEvent('doctrine:content-updated', { detail: { moduleId: '2' } }));
            return loadCourseCatalog();
        }).catch(function (error) {
            setStatus('Suppression impossible : ' + (error.message || ''), true);
        });
    }
    function loadCourseCatalog() {
        // Le catalogue admin/OG et les cours validés dans Module 2.1 doivent
        // alimenter la même bibliothèque. On fusionne les deux sources sans doublon.
        return Promise.allSettled([
            api('guide_course_catalog?select=id,title,category,description,drive_url&order=category.asc,title.asc'),
            api('guide_document_proposals?select=id,title,category,description,drive_url,status,created_at&category=in.%28%22Cours%20Officier%20Guide%22%2C%22Proposition%20Officier%20Guide%22%29&status=eq.approved&order=created_at.asc')
        ]).then(function (results) {
            var catalogRows = results[0].status === 'fulfilled' && Array.isArray(results[0].value)
                ? results[0].value : [];
            var approvedRows = results[1].status === 'fulfilled' && Array.isArray(results[1].value)
                ? results[1].value : [];
            var merged = catalogRows.slice();
            var seen = Object.create(null);
            merged.forEach(function (course) {
                var key = [course.title, course.category].map(function (value) {
                    return String(value || '').trim().toLocaleLowerCase('fr');
                }).join('|');
                seen[key] = true;
            });
            approvedRows.forEach(function (proposal) {
                var description = String(proposal.description || '');
                var categoryMatch = description.match(/^Catégorie : ([^\\n]*)/);
                var category = categoryMatch ? categoryMatch[1].trim() : (proposal.category || 'Cours Officier Guide');
                var courseDescription = categoryMatch
                    ? description.slice(categoryMatch[0].length).replace(/^\\s*/, '') : description;
                var key = [proposal.title, category].map(function (value) {
                    return String(value || '').trim().toLocaleLowerCase('fr');
                }).join('|');
                if (seen[key]) return;
                seen[key] = true;
                merged.push({
                    id: 'proposal-' + proposal.id,
                    title: proposal.title,
                    category: category,
                    description: courseDescription,
                    drive_url: proposal.drive_url || ''
                });
            });
            courses = merged;
            renderCourses();
            if (results[0].status === 'rejected') {
                setStatus('Catalogue des cours indisponible : ' + (results[0].reason.message || ''), true);
            } else if (results[1].status === 'rejected') {
                console.warn('Cours validés du Module 2.1 non fusionnés dans la bibliothèque.', results[1].reason);
            }
        });
    }
    function loadCourseProposals() {
        if (!courseProposalList || dashboardMode !== 'admin') return;
        api('guide_document_proposals?select=id,title,category,description,status,admin_note,created_at,uploaded_file_path,original_filename,file_size&category=in.%28%22Cours%20Officier%20Guide%22%2C%22Proposition%20Officier%20Guide%22%29&order=created_at.asc')
            .then(function (rows) {
                courseProposalList.replaceChildren(node('h3', '', 'Propositions de cours des Officiers Guides'));
                if (!rows.length) { courseProposalList.append(node('p', 'og-dashboard-muted', 'Aucune proposition de cours.')); return; }
                rows.forEach(function (proposal) {
                    var card = node('article', 'og-dashboard-course-proposal');
                    var proposedDescription = String(proposal.description || '');
                    var categoryMatch = proposedDescription.match(/^Catégorie : ([^\n]*)/);
                    var proposedCategory = categoryMatch ? categoryMatch[1].trim() : (proposal.category || 'Cours Officier Guide');
                    var courseDescription = categoryMatch ? proposedDescription.slice(categoryMatch[0].length).replace(/^\s*/, '') : proposedDescription;
                    card.append(node('strong', '', proposal.title), node('p', '', courseDescription || 'Aucune description.'));
                    if (proposal.uploaded_file_path) {
                        var attachmentButton = node('button', 'og-dashboard-download',
                            'Télécharger la pièce jointe' + (proposal.original_filename ? ' : ' + proposal.original_filename : ''));
                        attachmentButton.type = 'button';
                        attachmentButton.addEventListener('click', async function () {
                            attachmentButton.disabled = true;
                            try {
                                var safeFilename = String(proposal.original_filename || 'document-cours').replace(/[\\/]/g, '_');
                                var signed = await storageApi('object/sign/guide-document-proposals/' +
                                    proposal.uploaded_file_path.split('/').map(encodeURIComponent).join('/'), {
                                    method: 'POST', body: { expiresIn: 300, download: safeFilename }
                                });
                                var signedUrl = signed.signedURL || signed.signedUrl;
                                if (!signedUrl) throw new Error('Lien sécurisé indisponible.');
                                var downloadLink = node('a');
                                downloadLink.href = relativeStorageUrl(signedUrl);
                                downloadLink.download = safeFilename;
                                downloadLink.rel = 'noopener noreferrer';
                                downloadLink.style.display = 'none';
                                document.body.append(downloadLink);
                                downloadLink.click();
                                downloadLink.remove();
                            } catch (error) {
                                setStatus('Téléchargement de la pièce jointe impossible : ' + (error.message || error), true);
                            } finally { attachmentButton.disabled = false; }
                        });
                        card.append(attachmentButton);
                        if (proposal.file_size) card.append(node('p', 'og-dashboard-muted',
                            Math.max(1, Math.round(proposal.file_size / 1024)) + ' Ko'));
                    }
                    card.append(node('p', 'og-dashboard-muted', 'Statut : ' + (proposal.status === 'approved' ? 'Validée' : proposal.status === 'rejected' ? 'Refusée' : 'En attente')));
                    if (proposal.status === 'pending') {
                        var categoryLabel = node('label', 'og-dashboard-course-admin-field', 'Catégorie du cours');
                        var categoryInput = node('input'); categoryInput.value = proposedCategory; categoryInput.required = true; categoryLabel.append(categoryInput);
                        var urlLabel = node('label', 'og-dashboard-course-admin-field', 'Lien Google Drive à publier');
                        var url = node('input'); url.type = 'url'; url.required = true; url.placeholder = 'https://drive.google.com/...'; urlLabel.append(url);
                        var noteLabel = node('label', 'og-dashboard-course-admin-field', 'Commentaire à l’Officier Guide');
                        var note = node('textarea'); note.rows = 2; note.maxLength = 1000; noteLabel.append(note);
                        var approve = node('button', 'og-dashboard-download', 'Valider et ajouter au catalogue'); approve.type = 'button';
                        approve.addEventListener('click', function () {
                            if (!safeDriveUrl(url.value)) { setStatus('Lien Google Drive invalide.', true); return; }
                            approve.disabled = true;
                            api('guide_course_catalog', { method: 'POST', prefer: 'return=minimal', body: {
                                title: proposal.title, category: categoryInput.value.trim(), description: courseDescription, drive_url: url.value.trim()
                            }}).then(function () {
                                return api('guide_document_proposals?id=eq.' + encodeURIComponent(proposal.id), {
                                    method: 'PATCH', prefer: 'return=minimal', body: { status: 'approved', drive_url: url.value.trim(), admin_note: note.value.trim() }
                                });
                            }).then(function () { return Promise.all([loadCourseCatalog(), loadCourseProposals()]); })
                              .catch(function (error) { setStatus('Validation impossible : ' + (error.message || ''), true); approve.disabled = false; });
                        });
                        var reject = node('button', 'og-dashboard-download', 'Refuser'); reject.type = 'button';
                        reject.addEventListener('click', function () {
                            if (!window.confirm('Refuser cette proposition de cours ?')) return;
                            api('guide_document_proposals?id=eq.' + encodeURIComponent(proposal.id), {
                                method: 'PATCH', prefer: 'return=minimal', body: { status: 'rejected', admin_note: note.value.trim() }
                            }).then(loadCourseProposals).catch(function (error) { setStatus(error.message || 'Refus impossible.', true); });
                        });
                        card.append(categoryLabel, urlLabel, noteLabel, approve, reject);
                    } else if (proposal.admin_note) card.append(node('p', '', proposal.admin_note));
                    courseProposalList.append(card);
                });
            }).catch(function (error) { courseProposalList.append(node('p', 'og-dashboard-muted', error.message || 'Chargement impossible.')); });
    }
    function renderCourses() {
        coursesNode.replaceChildren();
        if (dashboardMode === 'admin') {
            var toolbar = node('div', 'og-dashboard-course-admin-tools');
            var add = node('button', 'og-dashboard-download', '+ Ajouter un cours');
            add.type = 'button'; add.addEventListener('click', function () { openCourseAdminForm(null); });
            toolbar.append(add); coursesNode.append(toolbar);
            courseProposalList = node('section', 'og-dashboard-course-proposals');
            courseProposalList.append(node('h3', '', 'Propositions de cours des Officiers Guides'));
        }
        var groups = Object.create(null);
        courses.forEach(function (course) { var category = course.category || 'Autres ressources'; (groups[category] || (groups[category] = [])).push(course); });
        var categories = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
        if (!categories.length) coursesNode.append(node('p', 'og-dashboard-empty', 'Aucun support dans le catalogue.'));
        categories.forEach(function (category) {
            var group = node('details', 'og-dashboard-course-group');
            var summary = node('summary', 'og-dashboard-accordion-title');
            summary.append(node('span', '', category), node('span', 'og-dashboard-count', groups[category].length + ' supports'));
            group.append(summary);
            groups[category].forEach(function (course) {
                var item = node('article', 'og-dashboard-course');
                var copy = node('div', 'og-dashboard-course-copy');
                copy.append(node('h4', '', course.title || 'Support sans titre'));
                if (course.description) copy.append(node('p', '', course.description));
                item.append(copy);
                if (dashboardMode === 'admin') {
                    var edit = node('button', 'og-dashboard-download', 'Modifier'); edit.type = 'button';
                    edit.addEventListener('click', function () { openCourseAdminForm(course); });
                    var remove = node('button', 'og-dashboard-download', 'Supprimer'); remove.type = 'button';
                    remove.addEventListener('click', function () { deleteCourseAdmin(course); });
                    item.append(edit, remove);
                }
                var link = node('a', 'og-dashboard-download', 'Télécharger');
                link.href = driveDownload(course.drive_url); link.target = '_blank'; link.rel = 'noopener noreferrer';
                if (!link.href || !safeDriveUrl(course.drive_url)) { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); link.textContent = 'Lien indisponible'; }
                item.append(link); group.append(item);
            });
            coursesNode.append(group);
        });
        if (dashboardMode === 'admin') {
            if (courseProposalArea) courseProposalArea.replaceChildren(courseProposalList);
            loadCourseProposals();
        }
    }
    function load() {
        if (loading) return;
        loading = true;
        setStatus('Actualisation de votre espace…');
        var candidateRequest = api('rpc/get_guide_candidate_dashboard', {
            method: 'POST', body: { p_candidate_id: null }
        });
        var courseRequest = api('guide_course_catalog?select=id,title,category,description,drive_url&order=category.asc,title.asc');
        var idsRequest = candidateRequest.then(function (payload) {
            return (payload.candidates || []).map(function (candidate) {
                return candidate.candidate && candidate.candidate.id;
            }).filter(Boolean);
        });
        var progressRequest = candidateRequest.then(function (payload) {
            return extractModuleProgressEvents(payload);
        });
        var cvRequest = idsRequest.then(function (ids) {
            if (!ids.length) return [];
            return api('doctrine_candidate_cvs?select=candidate_id,storage_path,original_filename,uploaded_at&candidate_id=in.(' + ids.join(',') + ')');
        });
        var reviewRequest = candidateRequest.then(function (payload) {
            var submissionIds = (payload.candidates || []).reduce(function (all, candidate) {
                return all.concat((candidate.doctrine && candidate.doctrine.submissions || [])
                    .map(function (submission) { return submission.id; }).filter(Boolean));
            }, []);
            if (!submissionIds.length) return [];
            return api('fiche_reviews?select=submission_id,guide_id,form_observations,form_evidence,rubric_observations,rubric_evidence&submission_id=in.(' +
                submissionIds.map(encodeURIComponent).join(',') + ')');
        });
        Promise.allSettled([candidateRequest, courseRequest, progressRequest, cvRequest, reviewRequest]).then(function (results) {
            if (results[0].status === 'fulfilled') {
                candidates = Array.isArray(results[0].value.candidates) ? results[0].value.candidates : [];
            } else {
                candidates = [];
                setStatus('Suivi candidats indisponible : ' + results[0].reason.message, true);
            }
            if (results[4].status === 'fulfilled') {
                var structuredReviews = new Map((Array.isArray(results[4].value) ? results[4].value : []).map(function (review) {
                    return [String(review.submission_id) + ':' + String(review.guide_id), review];
                }));
                candidates.forEach(function (candidate) {
                    (candidate.doctrine && candidate.doctrine.submissions || []).forEach(function (submission) {
                        var reviews = submission.reviews || [];
                        var missingStructuredReview = reviews.some(function (review) {
                            return !structuredReviews.has(String(submission.id) + ':' + String(review.guide_id));
                        });
                        submission.rubricFeedbackLoaded = !missingStructuredReview;
                        reviews.forEach(function (review) {
                            var structured = structuredReviews.get(String(submission.id) + ':' + String(review.guide_id));
                            if (structured) {
                                review.form_observations = structured.form_observations || '';
                                review.form_evidence = structured.form_evidence || '';
                                review.rubric_observations = structured.rubric_observations || {};
                                review.rubric_evidence = structured.rubric_evidence || {};
                            }
                        });
                    });
                });
                var incompleteReviews = candidates.some(function (candidate) {
                    return (candidate.doctrine && candidate.doctrine.submissions || []).some(function (submission) {
                        return submission.rubricFeedbackLoaded !== true;
                    });
                });
                if (incompleteReviews) {
                    setStatus('Certaines évaluations BM4 n’ont pas pu être relues intégralement. Leur modification est bloquée pour protéger les observations existantes.', true);
                }
            } else {
                candidates.forEach(function (candidate) {
                    (candidate.doctrine && candidate.doctrine.submissions || []).forEach(function (submission) {
                        submission.rubricFeedbackLoaded = false;
                    });
                });
                console.warn('Chargement des observations structurées BM4 indisponible.', results[4].reason);
                setStatus('Impossible de relire les observations BM4. Les évaluations sont temporairement verrouillées pour éviter tout écrasement.', true);
            }
            if (results[1].status === 'fulfilled') {
                courses = Array.isArray(results[1].value) ? results[1].value : [];
            } else {
                courses = [];
                setStatus('Supports pédagogiques indisponibles : ' + results[1].reason.message, true);
            }
            moduleEventsAvailable = results[2].status === 'fulfilled';
            var progressEvents = moduleEventsAvailable && Array.isArray(results[2].value) ? results[2].value : [];
            cvStatusAvailable = results[3].status === 'fulfilled';
            candidateCvs = Object.create(null);
            if (cvStatusAvailable) {
                (Array.isArray(results[3].value) ? results[3].value : []).forEach(function (cv) {
                    candidateCvs[cv.candidate_id] = cv;
                });
            }
            candidates.forEach(function (candidate) {
                candidate.doctrine = candidate.doctrine || {};
                candidate.doctrine.progress_events = progressEvents.filter(function (event) {
                    return event.user_id === candidate.candidate.id;
                });
            });
            renderMetrics();
            renderCourses();
            loadExerciseLibraries();
            if (results.every(function (result) { return result.status === 'fulfilled'; })) {
                setStatus('');
            } else if (results[2].status === 'rejected') {
                setStatus('Suivi des modules indisponible : ' + results[2].reason.message, true);
            }
        }).finally(function () { loading = false; });
    }
    function refreshProgressEvents() {
        if (progressRefreshInFlight || !root || root.hidden || !candidates.length || !auth()) return Promise.resolve();
        var ids = candidates.map(function (candidate) {
            return candidate.candidate && candidate.candidate.id;
        }).filter(Boolean);
        if (!ids.length) return Promise.resolve();
        progressRefreshInFlight = true;
        return api('rpc/get_guide_candidate_dashboard', {
            method: 'POST', body: { p_candidate_id: null }
        }).then(function (payload) {
            var rows = extractModuleProgressEvents(payload);
            candidates.forEach(function (candidate) {
                candidate.doctrine = candidate.doctrine || {};
                candidate.doctrine.progress_events = rows.filter(function (event) {
                    return String(event.user_id) === String(candidate.candidate && candidate.candidate.id);
                });
            });
            moduleEventsAvailable = true;
            // Mettre à jour les indicateurs déjà affichés sans reconstruire les fiches
            // (les accordéons ouverts, formulaires et évaluations restent intacts).
            if (root && !root.hidden) {
                document.querySelectorAll('.og-dashboard-module-progress').forEach(function (section) {
                    var candidate = candidates.find(function (item) {
                        return String(item.candidate && item.candidate.id) === section.dataset.candidateId;
                    });
                    if (!candidate) return;
                    section.querySelectorAll('.og-dashboard-module-item').forEach(function (item) {
                        var status = moduleState(candidate, item.dataset.moduleId);
                        var pill = item.querySelector('.og-dashboard-pill');
                        if (!pill) return;
                        pill.className = 'og-dashboard-pill ' + status.className;
                        pill.textContent = status.label;
                    });
                });
            }
        }).catch(function (error) {
            // Une panne ponctuelle ne remplace pas les données déjà affichées.
            console.warn('Actualisation automatique de la progression indisponible.', error);
        }).finally(function () {
            progressRefreshInFlight = false;
        });
    }
    function startProgressRefresh() {
        stopProgressRefresh();
        progressRefreshTimer = window.setInterval(refreshProgressEvents, 15000);
        document.addEventListener('visibilitychange', handleProgressVisibility);
    }
    function stopProgressRefresh() {
        if (progressRefreshTimer !== null) {
            window.clearInterval(progressRefreshTimer);
            progressRefreshTimer = null;
        }
        document.removeEventListener('visibilitychange', handleProgressVisibility);
    }
    function handleProgressVisibility() {
        if (document.visibilityState === 'visible' && root && !root.hidden) refreshProgressEvents();
    }
    function close() {
        stopProgressRefresh();
        if (root) root.hidden = true;
        document.body.classList.remove('og-dashboard-open');
        if (trigger && trigger.isConnected && !trigger.hidden) trigger.focus();
    }
    function build() {
        // Reconstruire le panneau si l'on passe du mode OG au mode Admin ou inversement.
        if (root && root.dataset.dashboardMode === dashboardMode) return;
        if (root) {
            root.remove();
            root = null;
        }
        root = node('section', 'og-dashboard-overlay');
        root.dataset.dashboardMode = dashboardMode;
        root.id = 'guideDashboard';
        root.hidden = true;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'guideDashboardTitle');
        var panel = node('div', 'og-dashboard-panel');
        var header = node('header', 'og-dashboard-header');
        var intro = node('div', 'og-dashboard-intro');
        intro.append(node('p', 'og-dashboard-kicker', 'DOCTRINE / ACCOMPAGNEMENT PÉDAGOGIQUE'));
        dashboardTitleNode = node('h2', '', dashboardMode === 'admin' ? 'Espace Administrateur' : 'Espace Officier Guide');
        dashboardTitleNode.id = 'guideDashboardTitle';
        dashboardSubtitleNode = node('p', 'og-dashboard-subtitle', dashboardMode === 'admin' ? 'Tous les candidats, leurs suivis et les ressources pédagogiques.' : 'Votre cohorte, vos suivis et vos supports.');
        intro.append(dashboardTitleNode, dashboardSubtitleNode);
        var closeButton = node('button', 'og-dashboard-close', 'Fermer');
        closeButton.type = 'button';
        closeButton.addEventListener('click', close);
        header.append(intro, closeButton);
        panel.append(header);
        metricsNode = node('div', 'og-dashboard-metrics');
        panel.append(metricsNode);
        var libraryGrid = node('div', 'og-dashboard-pedagogical-libraries');
        var courseSection = node('section', 'og-dashboard-library-entry');
        var courseToggle = node('button', 'og-dashboard-library-entry-toggle', 'BIBLIOTHÈQUE DES SUPPORTS OFFICIER GUIDE');
        courseToggle.type = 'button';
        courseToggle.setAttribute('aria-expanded', 'false');
        var courseContent = node('div', 'og-dashboard-library-entry-content');
        courseContent.hidden = true;
        courseToggle.addEventListener('click', function () {
            var expanded = courseToggle.getAttribute('aria-expanded') !== 'true';
            courseToggle.setAttribute('aria-expanded', String(expanded));
            courseContent.hidden = !expanded;
        });
        courseSection.append(courseToggle,
            node('p', 'og-dashboard-muted', '6 catégories · Supports consultables et téléchargeables.'));
        coursesNode = node('div', 'og-dashboard-courses');
        courseContent.append(coursesNode);
        courseSection.append(courseContent);
        var exerciseSection = node('section', 'og-dashboard-library-entry og-dashboard-exercise-library-entry');
        exerciseSection.id = 'ogExerciseLibraryEntry';
        var exerciseToggle = node('button', 'og-dashboard-library-entry-toggle', 'BIBLIOTHÈQUE DES DOSSIERS D’EXERCICES ET CORRECTIONS');
        exerciseToggle.type = 'button';
        exerciseToggle.setAttribute('aria-expanded', 'false');
        var exerciseContent = node('div', 'og-dashboard-library-entry-content');
        exerciseContent.hidden = true;
        exerciseToggle.addEventListener('click', function () {
            var expanded = exerciseToggle.getAttribute('aria-expanded') !== 'true';
            exerciseToggle.setAttribute('aria-expanded', String(expanded));
            exerciseContent.hidden = !expanded;
        });
        exerciseSection.append(exerciseToggle,
            node('p', 'og-dashboard-muted', '4 niveaux · Exercices et corrections publiés, consultables et téléchargeables.'));
        exerciseLibraryNode = node('div', 'og-dashboard-library');
        exerciseContent.append(exerciseLibraryNode);
        exerciseSection.append(exerciseContent);
        // La bibliothèque des supports OG est commune aux espaces Officier Guide et Administrateur.
        // Les commandes d'ajout, de modification et de suppression restent réservées à l'administrateur.
        libraryGrid.append(courseSection, exerciseSection);

        // Carte de proposition documentaire, placée sous les deux bibliothèques.
        // Aucune ressource du Module 2.1 n'est affichée dans cet espace.
        var proposalEntry = node('section', 'og-dashboard-library-entry module2-og-entry');
        var proposalToggle = node('button', 'og-dashboard-library-entry-toggle', 'PROPOSITION DE DOCUMENTS À AJOUTER POUR LES CANDIDATS');
        proposalToggle.type = 'button';
        proposalToggle.setAttribute('aria-expanded', 'false');
        var proposalContent = node('div', 'og-dashboard-library-entry-content module2-og-content');
        proposalContent.hidden = true;
        proposalToggle.addEventListener('click', function () {
            var expanded = proposalToggle.getAttribute('aria-expanded') !== 'true';
            proposalToggle.setAttribute('aria-expanded', String(expanded));
            proposalContent.hidden = !expanded;
            if (expanded) {
                loadModule2OwnProposals();
                loadApprovedModule2Documents();
            }
        });
        proposalEntry.append(proposalToggle,
            node('p', 'og-dashboard-muted', 'Proposez de nouveaux documents pour les candidats et suivez leur traitement par l’administrateur.'));
        var proposalPanel = node('div', 'module2-og-panel');
        proposalPanel.append(node('h3', '', 'Proposition de documents à ajouter pour les candidats'));
        proposalPanel.append(node('p', 'og-dashboard-muted', 'Les documents proposés sont examinés par l’administrateur, qui ajoute le lien documentaire et décide de leur publication.'));
        var proposalForm = node('form', 'module2-og-form');
        function proposalField(labelText, tagName, required, maxLength) {
            var label = node('label', '', labelText);
            var control = node(tagName);
            control.required = !!required;
            if (maxLength) control.maxLength = maxLength;
            if (tagName === 'textarea') control.rows = 3;
            label.append(control);
            proposalForm.append(label);
            return control;
        }
        var proposalTitle = proposalField('Titre du document', 'input', true, 160);
        var proposalFileLabel = node('label', '', 'Joindre un document (PDF, TXT ou PPT — 20 Mo maximum)');
        var proposalFile = node('input');
        proposalFile.type = 'file';
        proposalFile.accept = '.pdf,.txt,.ppt,application/pdf,text/plain,application/vnd.ms-powerpoint';
        proposalFileLabel.append(proposalFile);
        proposalForm.append(proposalFileLabel);
        var proposalSubmit = node('button', 'og-dashboard-download', 'Envoyer la proposition');
        proposalSubmit.type = 'submit';
        var proposalFormStatus = node('p', 'module2-og-status');
        proposalFormStatus.setAttribute('role', 'status');
        proposalForm.append(proposalSubmit, proposalFormStatus);

        function uploadProposalAttachment(file) {
            var extension = file.name.split('.').pop().toLowerCase();
            var mimeTypes = {
                pdf: 'application/pdf',
                txt: 'text/plain',
                ppt: 'application/vnd.ms-powerpoint'
            };
            if (!Object.prototype.hasOwnProperty.call(mimeTypes, extension)) {
                return Promise.reject(new Error('Format refusé. Choisissez un fichier .pdf, .txt ou .ppt.'));
            }
            if (!file.size || file.size > 20 * 1024 * 1024) {
                return Promise.reject(new Error('Le fichier doit peser moins de 20 Mo.'));
            }
            return auth().jeton().then(function (token) {
                var claims = token && decodeClaims(token);
                if (!claims || !claims.sub) throw new Error('Identifiant Officier Guide indisponible.');
                var safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
                var path = claims.sub + '/' + Date.now() + '-' + safeName;
                return fetch(auth().url.replace(/\/$/, '') + '/storage/v1/object/guide-document-proposals/' +
                    path.split('/').map(encodeURIComponent).join('/'), {
                    method: 'POST',
                    headers: {
                        apikey: auth().key,
                        Authorization: 'Bearer ' + token,
                        'Content-Type': mimeTypes[extension],
                        'x-upsert': 'false',
                        'cache-control': '3600'
                    },
                    body: file
                }).then(function (response) {
                    return response.json().catch(function () { return {}; }).then(function (payload) {
                        if (!response.ok) throw new Error(payload.message || payload.error || 'Téléversement impossible.');
                        return { path: path, mime: mimeTypes[extension] };
                    });
                });
            });
        }

        proposalForm.addEventListener('submit', function (event) {
            event.preventDefault();
            if (!proposalForm.reportValidity()) return;
            var file = proposalFile.files && proposalFile.files[0];
            proposalSubmit.disabled = true;
            proposalFormStatus.textContent = file ? 'Téléversement du document puis envoi de la proposition…' : 'Envoi de la proposition…';
            var uploadedPath = null;
            var upload = file ? uploadProposalAttachment(file).then(function (result) {
                uploadedPath = result.path;
                return result;
            }) : Promise.resolve(null);
            upload.then(function (attachment) {
                return api('guide_document_proposals', { method: 'POST', prefer: 'return=minimal', body: {
                    title: proposalTitle.value.trim(),
                    category: 'Proposition Officier Guide',
                    description: '',
                    uploaded_file_path: attachment ? attachment.path : null,
                    original_filename: attachment ? file.name.slice(0, 255) : null,
                    file_size: attachment ? file.size : null,
                    mime_type: attachment ? attachment.mime : null
                }});
            }).then(function () {
                proposalForm.reset();
                proposalFormStatus.textContent = 'Proposition transmise à l’administrateur.';
                loadModule2OwnProposals();
            }).catch(function (error) {
                proposalFormStatus.textContent = error.message || 'Envoi impossible.';
                if (uploadedPath) {
                    auth().jeton().then(function (token) {
                        return fetch(auth().url.replace(/\/$/, '') + '/storage/v1/object/guide-document-proposals/' +
                            uploadedPath.split('/').map(encodeURIComponent).join('/'), {
                            method: 'DELETE',
                            headers: { apikey: auth().key, Authorization: 'Bearer ' + token }
                        });
                    }).catch(function () {});
                }
            }).finally(function () { proposalSubmit.disabled = false; });
        });
        var approvedDocuments = node('div', 'module2-og-approved-documents');
        var approvedDocumentsStatus = node('p', 'module2-og-status');
        proposalPanel.append(node('h4', '', 'Documents validés et disponibles'), approvedDocuments, approvedDocumentsStatus);
        function loadApprovedModule2Documents() {
            api('guide_document_proposals?select=id,title,category,description,drive_url,uploaded_file_path,original_filename,mime_type,status&status=eq.approved&order=created_at.asc')
                .then(function (rows) {
                    approvedDocuments.replaceChildren();
                    if (!rows.length) {
                        approvedDocumentsStatus.textContent = 'Aucun document complémentaire validé.';
                        return;
                    }
                    rows.forEach(function (row) {
                        var item = node('article', 'module2-og-approved-item');
                        item.append(node('strong', '', row.title),
                            node('span', 'module2-document-category', row.category || 'Document complémentaire'));
                        if (row.description) item.append(node('p', 'og-dashboard-muted', row.description));
                        var link = node('button', 'og-dashboard-download', 'Ouvrir le document');
                        link.type = 'button';
                        link.addEventListener('click', function () {
                            link.disabled = true;
                            var ouvrir = row.uploaded_file_path
                                ? auth().jeton().then(function (token) {
                                    if (!token) throw new Error('Session expirée. Reconnectez-vous.');
                                    var path = row.uploaded_file_path.split('/').map(encodeURIComponent).join('/');
                                    return fetch(auth().url.replace(/\/$/, '') + '/storage/v1/object/sign/guide-document-proposals/' + path, {
                                        method: 'POST',
                                        headers: { apikey: auth().key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ expiresIn: 300 })
                                    });
                                }).then(function (response) {
                                    return response.json().catch(function () { return {}; }).then(function (payload) {
                                        if (!response.ok) throw new Error(payload.message || payload.error || 'Accès au document refusé.');
                                        var signed = payload.signedURL || payload.signedUrl;
                                        if (!signed) throw new Error('Lien sécurisé indisponible.');
                                        if (!window.DoctrineViewer || !window.DoctrineViewer.openSignedDocument) throw new Error('Visionneuse documentaire indisponible.');
                                        return window.DoctrineViewer.openSignedDocument(new URL(signed, auth().url.replace(/\/$/, '') + '/').href,
                                            row.original_filename || row.title, row.mime_type || '', '2');
                                    });
                                })
                                : row.drive_url && window.DoctrineViewer && window.DoctrineViewer.openDrive
                                    ? window.DoctrineViewer.openDrive(row.drive_url, row.title, '2')
                                    : Promise.reject(new Error('Aucun fichier associé à ce document.'));
                            Promise.resolve(ouvrir).catch(function (error) {
                                approvedDocumentsStatus.textContent = error.message || 'Ouverture du document impossible.';
                            }).finally(function () { link.disabled = false; });
                        });
                        item.append(link);
                        approvedDocuments.append(item);
                    });
                    approvedDocumentsStatus.textContent = rows.length + ' document(s) validé(s).';
                }).catch(function (error) {
                    approvedDocumentsStatus.textContent = error.message || 'Chargement des documents validés impossible.';
                });
        }
        var ownProposals = node('ul', 'module2-og-own-list');
        var ownStatus = node('p', 'module2-og-status');
        ownStatus.setAttribute('role', 'status');
        proposalPanel.append(node('h4', '', 'Suivi de mes propositions'), proposalForm, ownProposals, ownStatus);
        proposalContent.append(proposalPanel);
        proposalEntry.append(proposalContent);
        function loadModule2OwnProposals() {
            api('guide_document_proposals?select=id,title,category,status,admin_note,created_at,original_filename&order=created_at.desc')
                .then(function (rows) {
                    ownProposals.replaceChildren();
                    if (!rows.length) {
                        ownStatus.textContent = 'Aucune proposition enregistrée.';
                        return;
                    }
                    rows.forEach(function (row) {
                        var item = node('li', '', row.title + ' — ' + row.category + ' — ' +
                            (row.status === 'approved' ? 'Validée' : row.status === 'rejected' ? 'Refusée' : 'En attente'));
                        if (row.original_filename) item.append(node('p', '', 'Pièce jointe : ' + row.original_filename));
                        if (row.admin_note) item.append(node('p', '', row.admin_note));
                        ownProposals.append(item);
                    });
                    ownStatus.textContent = '';
                }).catch(function (error) {
                    ownStatus.textContent = error.message || 'Chargement du suivi impossible.';
                });
        }
        if (dashboardMode !== 'admin') libraryGrid.append(proposalEntry);

        panel.append(libraryGrid);
        courseProposalArea = dashboardMode === 'admin' ? node('div', 'og-dashboard-course-proposal-area') : null;
        if (courseProposalArea) panel.append(courseProposalArea);
        statusNode = node('p', 'og-dashboard-status');
        statusNode.setAttribute('role', 'status');
        statusNode.setAttribute('aria-live', 'polite');
        panel.append(statusNode);
        root.append(panel);
        root.addEventListener('click', function (event) { if (event.target === root) close(); });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && root && !root.hidden) close();
        });
        document.body.append(root);
    }
    function openAdminDashboard() {
        if (root && !root.hidden && dashboardMode === 'admin') return Promise.resolve(true);
        // Construire le panneau avant d'écrire son statut : statusNode n'existe
        // pas encore au premier accès depuis le bouton Admin ANC de QCM-MAJOR.
        dashboardMode = 'admin';
        build();
        if (dashboardTitleNode) dashboardTitleNode.textContent = 'Espace Administrateur';
        if (dashboardSubtitleNode) dashboardSubtitleNode.textContent = 'Tous les candidats, leurs suivis et les ressources pédagogiques.';
        root.hidden = false;
        document.body.classList.add('og-dashboard-open');
        setStatus('Vérification des droits administrateur…');
        return adminAccess().then(function (allowed) {
            if (!allowed) {
                setStatus('Accès administrateur refusé. Vérifiez que le compte QCM-MAJOR possède le rôle administrateur dans les métadonnées Supabase.', true);
                return false;
            }
            trigger = null;
            startProgressRefresh();
            load();
            loadExerciseLibraries();
            return true;
        }).catch(function (error) {
            console.error('Ouverture de l’espace Administrateur impossible.', error);
            setStatus('Impossible de vérifier les droits administrateur : ' + (error.message || 'erreur de connexion Supabase'), true);
            return false;
        });
    }
    function updateTrigger() {
        var section = document.getElementById('corpusPreface');
        if (!section || !section.parentNode) return;
        var item = document.getElementById('guideDashboardNav');
        if (!item) {
            item = node('div', 'og-guide-entry-card');
            item.id = 'guideDashboardNav';
            item.hidden = true;
            var button = node('button', 'og-guide-entry-button', 'Espace Officier Guide');
            button.type = 'button';
            button.addEventListener('click', function () {
                // Le contrôle est répété au clic : un candidat ne peut pas ouvrir
                // le tableau de bord même si l'élément a été rendu visible par erreur.
                button.disabled = true;
                guideAccess().then(function (allowed) {
                    button.disabled = false;
                    if (allowed !== true) {
                        item.hidden = true;
                        if (root && !root.hidden) close();
                        return;
                    }
                    dashboardMode = 'guide';
                    trigger = button;
                    build();
                    if (dashboardTitleNode) dashboardTitleNode.textContent = 'Espace Officier Guide';
                    if (dashboardSubtitleNode) dashboardSubtitleNode.textContent = 'Votre cohorte, vos suivis et vos supports.';
                    root.hidden = false;
                    document.body.classList.add('og-dashboard-open');
                    startProgressRefresh();
                    load();
                    loadExerciseLibraries();
                }).catch(function () {
                    button.disabled = false;
                    item.hidden = true;
                    if (root && !root.hidden) close();
                });
            });
            item.append(button);
            section.parentNode.insertBefore(item, section);
        }
        // Masquer immédiatement à chaque initialisation/changement de session.
        // La carte ne réapparaît qu'après validation du rôle ET de la spécialité OG.
        item.hidden = true;
        if (root && !root.hidden) close();
        guideAccess().then(function (allowed) {
            var isOG = allowed === true;
            item.hidden = !isOG;
            // Un compte administrateur n'est pas nécessairement Officier Guide :
            // ne jamais fermer son tableau de bord lors du contrôle OG indépendant.
            if (!isOG && dashboardMode !== 'admin' && root && !root.hidden) close();
        }).catch(function () {
            item.hidden = true;
            if (dashboardMode !== 'admin' && root && !root.hidden) close();
        });
    }
    function adminLaunchRequested() {
        try { return new URLSearchParams(window.location.search).get('admin') === '1'; }
        catch (_) { return false; }
    }
    function init() {
        document.addEventListener('doctrine:admin-dashboard', openAdminDashboard);
        updateTrigger();
        applyGuideModuleVisibility();
        document.addEventListener('doctrine:login', function () {
            updateTrigger();
            applyGuideModuleVisibility();
            if (adminLaunchRequested()) openAdminDashboard();
        });
        // Le paramètre admin=1 est une demande explicite provenant du bouton
        // ADMIN ANC de QCM-MAJOR. Ouvrir immédiatement le tableau de bord :
        // le contrôle des droits est ensuite effectué par adminAccess().
        // Ne pas conditionner l'ouverture à jeton() : le relais de session peut
        // être encore en cours de restauration et laisser l'accueil affiché.
        if (adminLaunchRequested()) openAdminDashboard();
        document.addEventListener('doctrine:logout', function () {
            stopProgressRefresh();
            if (root) root.hidden = true;
            var item = document.getElementById('guideDashboardNav');
            if (item) item.hidden = true;
            setGuideModulesHidden(false);
            document.body.classList.remove('og-guide-entry-only');
            var progressionCard = document.querySelector('.study-dashboard');
            if (progressionCard) progressionCard.hidden = false;
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
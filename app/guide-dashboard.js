/* Espace Officier Guide indépendant — ne modifie aucun module existant. */
(function () {
    'use strict';

    var root = null;
    var trigger = null;
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
            var userMeta = claims.user_metadata || {};
            var role = String(meta.role || userMeta.role || '').trim().toLowerCase();
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
        var dialog = node('dialog', 'og-qcm-tracking-dialog');
        var panel = node('section', 'og-qcm-tracking-panel');
        var header = node('header', 'og-qcm-tracking-header');
        var heading = node('div');
        heading.append(node('p', 'og-dashboard-kicker', 'ESPACE OFFICIER GUIDE / COHORTE'));
        heading.append(node('h2', '', 'Suivi QCM-MAJOR'));
        heading.append(node('p', 'og-dashboard-muted', candidates.length + ' candidat(s) rattaché(s) à votre cohorte'));
        var closeButton = node('button', 'og-dashboard-close', 'Fermer');
        closeButton.type = 'button';
        closeButton.addEventListener('click', function () { dialog.close(); dialog.remove(); });
        header.append(heading, closeButton);
        panel.append(header);
        var layout = node('div', 'og-qcm-tracking-layout');
        var list = node('nav', 'og-qcm-candidate-list');
        list.setAttribute('aria-label', 'Candidats de ma cohorte');
        var detail = node('section', 'og-qcm-candidate-detail');
        detail.setAttribute('aria-live', 'polite');
        detail.append(node('p', 'og-qcm-empty', 'Sélectionnez le nom d’un candidat pour afficher ses notes par thème et son historique.'));
        candidates.forEach(function (candidate, index) {
            var average = qcmAverage(candidate);
            var results = qcmResults(candidate);
            var button = node('button', 'og-qcm-candidate-button');
            button.type = 'button';
            button.append(node('strong', '', candidateName(candidate)));
            button.append(node('span', '', (average === null ? 'Aucune note' : average.toFixed(2) + ' / 20') + ' · ' + results.length + ' résultat(s)'));
            button.setAttribute('aria-pressed', String(index === 0));
            button.addEventListener('click', function () {
                list.querySelectorAll('.og-qcm-candidate-button').forEach(function (item) {
                    item.classList.remove('is-selected'); item.setAttribute('aria-pressed', 'false');
                });
                button.classList.add('is-selected'); button.setAttribute('aria-pressed', 'true');
                renderQcmCandidateDetail(detail, candidate);
            });
            if (index === 0) {
                button.classList.add('is-selected');
                renderQcmCandidateDetail(detail, candidate);
            }
            list.append(button);
        });
        if (!candidates.length) list.append(node('p', 'og-qcm-empty', 'Aucun candidat n’est rattaché à votre cohorte.'));
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

        // Un seul accordéon : renderAiCorrection fournit déjà son propre panneau repliable.
        target.append(renderAiCorrection(candidate));
    }

    function openGuideCandidates() {
        var dialog = node('dialog', 'og-qcm-tracking-dialog og-candidate-list-dialog');
        var panel = node('section', 'og-qcm-tracking-panel');
        var header = node('header', 'og-qcm-tracking-header');
        var heading = node('div');
        heading.append(node('p', 'og-dashboard-kicker', 'ESPACE OFFICIER GUIDE / COHORTE'));
        heading.append(node('h2', '', 'CANDIDATS — COHORTE RATTACHÉE'));
        heading.append(node('p', 'og-dashboard-muted', 'Sélectionnez un candidat pour ouvrir sa fiche individuelle.'));
        var closeButton = node('button', 'og-dashboard-close', 'Fermer');
        closeButton.type = 'button';
        closeButton.addEventListener('click', function () { dialog.close(); dialog.remove(); });
        header.append(heading, closeButton);
        panel.append(header);

        // La liste est affichée immédiatement, sans écran d’accordéon intermédiaire.
        var workspace = node('div', 'og-candidate-workspace');
        var group = node('section', 'og-dashboard-candidate-group og-dashboard-candidate-group-open');
        group.append(node('div', 'og-dashboard-candidate-group-heading',
            'TOUS — ' + candidates.length + ' candidat(s)'));
        var groupItems = node('div', 'og-dashboard-candidate-group-items');
        var list = node('nav', 'og-qcm-candidate-list');
        list.setAttribute('aria-label', 'Tous les candidats de ma cohorte');
        var detail = node('section', 'og-qcm-candidate-detail og-candidate-profile-detail');
        detail.setAttribute('aria-live', 'polite');
        candidates.forEach(function (candidate, index) {
            var identity = candidate.candidate || {};
            var button = node('button', 'og-qcm-candidate-button');
            button.type = 'button';
            var identityRow = node('span', 'og-qcm-candidate-identity');
            identityRow.append(node('strong', '', identity.name || 'Pseudo non renseigné'));
            var followUp = candidateFollowUpStatus(candidate);
            identityRow.append(node('span', 'og-candidate-follow-up-status ' + followUp.className, followUp.label));
            button.append(identityRow);
            button.append(node('span', '', [identity.specialty, identity.email].filter(Boolean).join(' · ') || 'Profil à compléter'));
            button.setAttribute('aria-pressed', 'false');
            button.addEventListener('click', function () {
                list.querySelectorAll('.og-qcm-candidate-button').forEach(function (item) {
                    item.classList.remove('is-selected');
                    item.setAttribute('aria-pressed', 'false');
                });
                button.classList.add('is-selected');
                button.setAttribute('aria-pressed', 'true');
                renderCandidateProfileDetail(detail, candidate);
            });
            list.append(button);
        });
        if (!candidates.length) list.append(node('p', 'og-qcm-empty', 'Aucun candidat n’est rattaché à votre cohorte.'));
        groupItems.append(list);
        group.append(groupItems);
        workspace.append(group, detail);
        panel.append(workspace);
        // Ouvrir directement la fiche du premier candidat à l’arrivée.
        var firstCandidateButton = list.querySelector('.og-qcm-candidate-button');
        if (firstCandidateButton) firstCandidateButton.click();
        dialog.append(panel);
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) { dialog.close(); dialog.remove(); }
        });
        document.body.append(dialog);
        dialog.showModal();
    }

    function renderMetrics() {
        metricsNode.replaceChildren();
        var ready = candidates.filter(function (candidate) { return !attention(candidate); }).length;
        [
            ['CANDIDATS', candidates.length, 'cohorte rattachée'],
            ['À ACCOMPAGNER', candidates.length - ready, 'activité ou résultats à suivre']
        ].forEach(function (metric) {
            var card = metric[0] === 'CANDIDATS'
                ? node('button', 'og-dashboard-metric og-dashboard-metric-action og-dashboard-candidates-tracking')
                : node('article', 'og-dashboard-metric');
            if (metric[0] === 'CANDIDATS') {
                card.type = 'button';
                card.dataset.guideAction = 'candidates-tracking';
                card.addEventListener('click', openGuideCandidates);
            }
            card.append(node('span', 'og-dashboard-metric-label', metric[0]));
            card.append(node('strong', 'og-dashboard-metric-value', String(metric[1])));
            card.append(node('small', '', metric[2]));
            metricsNode.append(card);
        });

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
            card.addEventListener('click', function () { openGuideFeedback(definition.kind); });
            metricsNode.append(card);
        });
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
        var summary = node('summary', '', 'Progression des modules 1 à 7');
        section.append(summary);
        var grid = node('div', 'og-dashboard-module-grid');
        for (var moduleId = 1; moduleId <= 7; moduleId++) {
            var status = moduleState(candidate, moduleId);
            var item = node('div', 'og-dashboard-module-item');
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
    function renderExerciseLibraries() {
        if (!exerciseLibraryNode) return;
        exerciseLibraryNode.replaceChildren();
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
                    if (exercise.category) card.append(node('span', 'og-dashboard-library-category', exercise.category));
                    if (exercise.description) card.append(node('p', '', exercise.description));
                    var actions = node('div', 'og-dashboard-library-actions');
                    var open = node('button', 'og-dashboard-download', 'Ouvrir l’exercice');
                    open.type = 'button';
                    open.addEventListener('click', function () {
                        openDriveInViewer(exercise.drive_url, exercise.title);
                    });
                    actions.append(open);
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
                            var correctionActions = node('div', 'og-dashboard-library-actions');
                            var link = node('button', 'og-dashboard-download', 'Visualiser la correction');
                            link.type = 'button';
                            link.addEventListener('click', function () {
                                openDriveInViewer(correction.drive_url, correction.title);
                            });
                            correctionActions.append(link);
                            var downloadUrl = driveDownload(correction.drive_url);
                            var download = node('a', 'og-dashboard-download og-dashboard-library-download', 'Télécharger la correction');
                            if (downloadUrl) {
                                download.href = downloadUrl;
                                download.target = '_blank';
                                download.rel = 'noopener noreferrer';
                                download.setAttribute('download', '');
                            } else {
                                download.setAttribute('aria-disabled', 'true');
                                download.textContent = 'Téléchargement indisponible';
                            }
                            correctionActions.append(download);
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
            api('guide_exercise_library?select=id,title,category,description,drive_url,difficulty_level,sort_order&is_published=eq.true&order=difficulty_level.asc,sort_order.asc,title.asc'),
            api('guide_correction_library?select=id,exercise_id,title,description,drive_url,difficulty_level,sort_order&is_published=eq.true&order=difficulty_level.asc,sort_order.asc,title.asc')
        ]).then(function (results) {
            exerciseLibraryItems = results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [];
            correctionLibraryItems = results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : [];
            renderExerciseLibraries();
            if (results.some(function (result) { return result.status === 'rejected'; })) {
                exerciseLibraryNode.append(node('p', 'og-dashboard-muted', 'La bibliothèque des exercices et corrections est momentanément indisponible.'));
            }
        });
    }
    function renderCourses() {
        coursesNode.replaceChildren();
        var groups = Object.create(null);
        courses.forEach(function (course) {
            var category = course.category || 'Autres ressources';
            (groups[category] || (groups[category] = [])).push(course);
        });
        var categories = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
        if (!categories.length) {
            coursesNode.append(node('p', 'og-dashboard-empty', 'Le catalogue des supports est momentanément indisponible.'));
            return;
        }
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
                var link = node('a', 'og-dashboard-download', 'Télécharger');
                link.href = driveDownload(course.drive_url);
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                if (!link.href || !safeDriveUrl(course.drive_url)) {
                    link.removeAttribute('href');
                    link.setAttribute('aria-disabled', 'true');
                    link.textContent = 'Lien indisponible';
                }
                item.append(link);
                group.append(item);
            });
            coursesNode.append(group);
        });
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
        var progressRequest = idsRequest.then(function (ids) {
            if (!ids.length) return [];
            return api('doctrine_progress_events?select=user_id,module_id,event_type,created_at&user_id=in.(' + ids.join(',') + ')&order=created_at.desc');
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
                setStatus(candidates.length + ' candidat(s) suivi(s) · ' + courses.length + ' support(s) pédagogique(s) disponibles.');
            } else if (results[2].status === 'rejected') {
                setStatus('Suivi des modules indisponible : ' + results[2].reason.message, true);
            }
        }).finally(function () { loading = false; });
    }
    function close() {
        if (root) root.hidden = true;
        document.body.classList.remove('og-dashboard-open');
        if (trigger && trigger.isConnected && !trigger.hidden) trigger.focus();
    }
    function build() {
        if (root) return;
        root = node('section', 'og-dashboard-overlay');
        root.id = 'guideDashboard';
        root.hidden = true;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'guideDashboardTitle');
        var panel = node('div', 'og-dashboard-panel');
        var header = node('header', 'og-dashboard-header');
        var intro = node('div', 'og-dashboard-intro');
        intro.append(node('p', 'og-dashboard-kicker', 'DOCTRINE / ACCOMPAGNEMENT PÉDAGOGIQUE'));
        var h = node('h2', '', 'Espace Officier Guide');
        h.id = 'guideDashboardTitle';
        intro.append(h, node('p', 'og-dashboard-subtitle', 'Votre cohorte, vos suivis et les 30 supports de cours partagés.'));
        var closeButton = node('button', 'og-dashboard-close', 'Fermer');
        closeButton.type = 'button';
        closeButton.addEventListener('click', close);
        header.append(intro, closeButton);
        panel.append(header);
        metricsNode = node('div', 'og-dashboard-metrics');
        panel.append(metricsNode);
        var libraryGrid = node('div', 'og-dashboard-pedagogical-libraries');
        var courseSection = node('section', 'og-dashboard-library-entry');
        var courseToggle = node('button', 'og-dashboard-library-entry-toggle', 'BIBLIOTHÈQUE DES 30 SUPPORTS OFFICIER GUIDE');
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
        var exerciseSection = node('section', 'og-dashboard-library-entry');
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
        libraryGrid.append(courseSection, exerciseSection);
        panel.append(libraryGrid);
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
    function updateTrigger() {
        var nav = document.querySelector('body > .main-wrapper nav ul, .main-wrapper nav ul');
        if (!nav) return;
        var item = document.getElementById('guideDashboardNav');
        if (!item) {
            item = node('li');
            item.id = 'guideDashboardNav';
            // Accès fermé par défaut : ne jamais afficher l'espace OG
            // avant vérification du rôle et de la spécialité du profil.
            item.hidden = true;
            var button = node('button', '', 'Espace Officier Guide');
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
                    trigger = button;
                    build();
                    root.hidden = false;
                    document.body.classList.add('og-dashboard-open');
                    load();
                    loadExerciseLibraries();
                }).catch(function () {
                    button.disabled = false;
                    item.hidden = true;
                    if (root && !root.hidden) close();
                });
            });
            item.append(button);
            nav.append(item);
        }
        // Masquer immédiatement à chaque initialisation/changement de session.
        // L'entrée ne réapparaît qu'après validation du rôle ET de la spécialité OG.
        item.hidden = true;
        if (root && !root.hidden) close();
        guideAccess().then(function (allowed) {
            var isOG = allowed === true;
            item.hidden = !isOG;
            if (!isOG && root && !root.hidden) close();
        }).catch(function () {
            item.hidden = true;
            if (root && !root.hidden) close();
        });
    }
    function init() {
        updateTrigger();
        applyGuideModuleVisibility();
        document.addEventListener('doctrine:login', function () {
            updateTrigger();
            applyGuideModuleVisibility();
        });
        document.addEventListener('doctrine:logout', function () {
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
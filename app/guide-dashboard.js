/* Espace Officier Guide indépendant — ne modifie aucun module existant. */
(function () {
    'use strict';

    var root = null;
    var trigger = null;
    var statusNode = null;
    var metricsNode = null;
    var candidatesNode = null;
    var coursesNode = null;
    var exerciseLibraryNode = null;
    var exerciseLibraryItems = [];
    var correctionLibraryItems = [];
    var searchNode = null;
    var statusFilterNode = null;
    var selectedStatusFilter = 'all';
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
    function currentGuideStatus() {
        if (!auth() || typeof auth().jeton !== 'function') return Promise.resolve(false);
        return auth().jeton().then(function (token) {
            var claims = token && decodeClaims(token);
            var meta = claims && claims.app_metadata || {};
            var role = String(meta.role || '').trim().toLowerCase();
            var admin = role === 'admin' || meta.bm4_admin === true ||
                meta.bm4_admin === 'true' || meta.bm4_admin === 1 || meta.bm4_admin === '1' ||
                (typeof auth().estAdmin === 'function' && auth().estAdmin());
            if (!claims || !claims.sub || admin) return false;
            if (role === 'guide' || role === 'officier_guide') return true;
            // Même source de spécialité que le bouton OG principal de l'application.
            var profileCheck = typeof auth().specialite === 'function'
                ? auth().specialite().then(function (value) {
                    return String(value || '').trim().toUpperCase() === 'OG';
                }).catch(function () { return false; })
                : Promise.resolve(false);
            return profileCheck.then(function (isOg) {
                if (isOg) return true;
                return fetch(auth().url.replace(/\/$/, '') + '/rest/v1/rpc/get_current_user_specialty', {
                    method: 'POST',
                    headers: {
                        apikey: auth().key,
                        Authorization: 'Bearer ' + token,
                        'Content-Type': 'application/json'
                    },
                    body: '{}'
                }).then(function (response) {
                    if (!response.ok) return false;
                    return response.json().then(function (data) {
                        var specialty = data && typeof data === 'object' ? data.specialty : data;
                        return String(specialty || '').trim().toUpperCase() === 'OG';
                    });
                }).catch(function () { return false; });
            });
        }).catch(function () { return false; });
    }
    function guideAccess() {
        return currentGuideStatus();
    }

    function applyGuideModuleVisibility() {
        // Masquage immédiat pendant la vérification du profil : aucun flash des éléments réservés.
        setGuideModulesHidden(true);
        var progressionCard = document.querySelector('.study-dashboard');
        if (progressionCard) progressionCard.hidden = true;
        currentGuideStatus().then(function (isGuide) {
            setGuideModulesHidden(isGuide);
            if (progressionCard) progressionCard.hidden = isGuide;
            if (isGuide) renderGuideCorpus();
        });
    }

    function setGuideModulesHidden(hidden) {
        var ids = ['1', '2', '5', '6', '7'];
        ids.forEach(function (id) {
            var button = document.getElementById('btn-mod' + id);
            if (!button) return;
            var item = button.closest('li') || button;
            item.hidden = hidden;
            if (hidden) item.style.setProperty('display', 'none', 'important');
            else item.style.removeProperty('display');
            button.setAttribute('aria-hidden', String(hidden));
            button.tabIndex = hidden ? -1 : 0;
        });
        // Bloque également la navigation précédent/suivant vers les modules masqués.
        document.querySelectorAll('.module-nav-button[onclick]').forEach(function (button) {
            var match = button.getAttribute('onclick').match(/navigateModule\(['"]module(1|2|5|6|7)['"]\)/);
            if (!match) return;
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
                if (!response.ok) throw new Error(payload.message || payload.msg || payload.error || 'Erreur fonction IA HTTP ' + response.status);
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
    function renderMetrics() {
        metricsNode.replaceChildren();
        var ready = candidates.filter(function (candidate) { return !attention(candidate); }).length;
        [
            ['CANDIDATS', candidates.length, 'cohorte rattachée'],
            ['À ACCOMPAGNER', candidates.length - ready, 'activité ou résultats à suivre'],
            ['SUPPORTS OG', courses.length, 'ressources partagées']
        ].forEach(function (metric) {
            var card = node('article', 'og-dashboard-metric');
            card.append(node('span', 'og-dashboard-metric-label', metric[0]));
            card.append(node('strong', 'og-dashboard-metric-value', String(metric[1])));
            card.append(node('small', '', metric[2]));
            metricsNode.append(card);
        });
        var assignCard = node('button', 'og-dashboard-metric og-dashboard-metric-action');
        assignCard.type = 'button';
        assignCard.append(node('span', 'og-dashboard-metric-label', 'RATTACHER UN CANDIDAT'));
        assignCard.append(node('strong', 'og-dashboard-metric-value', '+'));
        assignCard.append(node('small', '', 'Associer à ma cohorte'));
        assignCard.addEventListener('click', openAssignCandidateDialog);
        metricsNode.append(assignCard);

        var retexCard = node('button', 'og-dashboard-metric og-dashboard-metric-action');
        retexCard.type = 'button';
        retexCard.append(node('span', 'og-dashboard-metric-label', 'FICHE RETEX DOCTRINE'));
        retexCard.append(node('strong', 'og-dashboard-metric-value', '↗'));
        retexCard.append(node('small', '', 'RETEX déjà envoyé · accéder au Module 7'));
        retexCard.addEventListener('click', function () { openModule7Form('retexCard', 'retexForm'); });
        metricsNode.append(retexCard);

        var reportCard = node('button', 'og-dashboard-metric og-dashboard-metric-action');
        reportCard.type = 'button';
        reportCard.append(node('span', 'og-dashboard-metric-label', 'FICHE DE SIGNALEMENT'));
        reportCard.append(node('strong', 'og-dashboard-metric-value', '+'));
        reportCard.append(node('small', '', 'Rédiger et transmettre un signalement'));
        reportCard.addEventListener('click', function () { openModule7Form('signalementCard', 'signalementForm'); });
        metricsNode.append(reportCard);
    }
    function openModule7Form(cardId, formId) {
        if (typeof window.openModal !== 'function') {
            setStatus('Le Module 7 est momentanément indisponible.', true);
            return;
        }
        // Le tableau de bord est une surcouche : le fermer avant d'ouvrir le module évite
        // qu'il reste au-dessus du Module 7 et intercepte visuellement les interactions.
        close();
        window.openModal('module7');
        var card = document.getElementById(cardId);
        var form = document.getElementById(formId);
        var heading = card && card.querySelector(':scope > p');
        if (!form || !heading) return;
        if (form.hidden) heading.click();
        var firstField = form.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
        if (firstField) firstField.focus({ preventScroll: true });
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
        form.append(intro, aiPanel, criteria, total, decisionLabel, commentLabel, status, actions);
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
            return { scores: scores, formGrade: formGrade, contentGrade: contentGrade,
                grade: Math.round((formGrade + contentGrade) * 100) / 100, complete: complete };
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
            (Array.isArray(suggestion.criteria) ? suggestion.criteria : []).forEach(function (criterion) {
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
                }
                renderAiSuggestion(suggestion);
                status.textContent = suggestion.readable
                    ? 'Proposition générée. Vérifiez les critères, puis enregistrez si vous la confirmez.'
                    : 'Le PDF ne peut pas être évalué automatiquement. Vérifiez-le manuellement.';
            } catch (error) {
                status.textContent = 'Correction IA impossible : ' + error.message;
                aiPanel.hidden = true;
            } finally {
                correction.disabled = false;
                correction.textContent = 'Relancer la correction IA';
            }
        }
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var totals = collectScores();
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
    function renderAiCorrection(candidate) {
        var section = node('details', 'og-dashboard-subaccordion og-dashboard-ai-correction');
        section.append(node('summary', '', 'Correction assistée par IA'));
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
        section.append(gridCard);
        var items = (candidate.doctrine && Array.isArray(candidate.doctrine.submissions)
            ? candidate.doctrine.submissions : []).filter(function (submission) {
            return submission.submission_type === 'proposition' || submission.submission_type === 'support_oral';
        });
        if (!items.length) {
            section.append(node('p', 'og-dashboard-muted', 'Aucune fiche de proposition ou fiche support oral transmise.'));
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
            groups[dossier].slice().sort(function (a, b) {
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
                    var result = node('p', 'og-dashboard-ai-result');
                    var commentText = String(review.comment);
                    result.textContent = commentText.length > 360 ? commentText.slice(0, 357) + '…' : commentText;
                    card.append(result);
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
            section.append(group);
        });
        return section;
    }
    function renderCandidates() {
        candidatesNode.replaceChildren();
        var statuses = [
            { key: 'all', label: 'TOUS' },
            { key: 'ready', label: 'PRÊT', className: 'is-ok' },
            { key: 'danger', label: 'EN DIFFICULTÉ', className: 'is-danger' },
            { key: 'watch', label: 'À SURVEILLER', className: 'is-warning' }
        ];
        var counts = { all: candidates.length, ready: 0, danger: 0, watch: 0 };
        candidates.forEach(function (candidate) {
            var status = candidateFollowUpStatus(candidate);
            if (status.label === 'PRÊT') counts.ready += 1;
            else if (status.label === 'EN DIFFICULTÉ') counts.danger += 1;
            else counts.watch += 1;
        });
        statusFilterNode.replaceChildren();
        statuses.forEach(function (status) {
            var button = node('button', 'og-dashboard-status-filter' +
                (status.className ? ' ' + status.className : '') +
                (selectedStatusFilter === status.key ? ' is-active' : ''),
                status.label + ' · ' + counts[status.key]);
            button.type = 'button';
            button.setAttribute('aria-pressed', String(selectedStatusFilter === status.key));
            button.addEventListener('click', function () {
                selectedStatusFilter = status.key;
                renderCandidates();
            });
            statusFilterNode.append(button);
        });
        var term = String(searchNode.value || '').trim().toLocaleLowerCase('fr');
        var filtered = candidates.filter(function (candidate) {
            var identity = candidate.candidate || {};
            var status = candidateFollowUpStatus(candidate);
            var statusKey = status.label === 'PRÊT' ? 'ready' :
                status.label === 'EN DIFFICULTÉ' ? 'danger' : 'watch';
            return (selectedStatusFilter === 'all' || selectedStatusFilter === statusKey) &&
                [candidateName(candidate), identity.email, identity.unit, identity.specialty]
                    .join(' ').toLocaleLowerCase('fr').indexOf(term) !== -1;
        });
        if (!filtered.length) {
            candidatesNode.append(node('p', 'og-dashboard-empty',
                candidates.length ? 'Aucun candidat ne correspond à cette recherche.' : 'Aucun candidat rattaché à votre cohorte.'));
            return;
        }
        var group = node('details', 'og-dashboard-candidate-group');
        var groupSummary = node('summary', 'og-dashboard-candidate-group-title',
            (statuses.find(function (status) { return status.key === selectedStatusFilter; }) || statuses[0]).label +
            ' — ' + filtered.length + ' candidat(s)');
        group.append(groupSummary);
        var groupItems = node('div', 'og-dashboard-candidate-group-items');
        filtered.forEach(function (candidate) {
            var identity = candidate.candidate || {};
            var card = node('details', 'og-dashboard-candidate');
            var summary = node('summary', 'og-dashboard-accordion-title');
            var title = node('span', 'og-dashboard-candidate-title', candidateName(candidate));
            var score = qcmAverage(candidate);
            var followUp = candidateFollowUpStatus(candidate);
            var pill = node('span', 'og-dashboard-pill ' + followUp.className, followUp.label);
            summary.append(title, pill);
            card.append(summary);
            var body = node('div', 'og-dashboard-candidate-body');
            var meta = [identity.unit, identity.specialty, identity.email].filter(Boolean).join(' · ');
            body.append(node('p', 'og-dashboard-muted', meta || 'Profil candidat à compléter'));
            var facts = node('div', 'og-dashboard-facts');
            [
                ['Moyenne QCM', score === null ? 'Pas encore de résultat' : score.toFixed(2) + ' / 20'],
                ['Tentatives QCM', String(qcmResults(candidate).length)],
                ['Fiches soumises', String(submissions(candidate).length)],
                ['Fiches validées', String(validSubmissions(candidate))],
                ['Dernière activité', candidate.doctrine && candidate.doctrine.last_activity
                    ? new Date(candidate.doctrine.last_activity).toLocaleDateString('fr-FR') : 'Non renseignée']
            ].forEach(function (fact) {
                var item = node('div', 'og-dashboard-fact');
                item.append(node('span', '', fact[0]), node('strong', '', fact[1]));
                facts.append(item);
            });
            body.append(facts);
            body.append(renderModuleProgress(candidate));
            var eligibility = node('details', 'og-dashboard-subaccordion og-dashboard-eligibility');
            eligibility.append(node('summary', '', 'Suivi admissibilité'));
            eligibility.append(renderOralTracking(candidate));
            eligibility.append(renderCcpmTracking(candidate));
            body.append(eligibility);
            var admission = candidate.admission || {};
            var docs = node('details', 'og-dashboard-subaccordion');
            docs.append(node('summary', '', 'Dossier et documents demandés'));
            var list = node('dl', 'og-dashboard-document-list');
            var cv = candidateCvs[candidate.candidate.id];
            list.append(node('dt', '', 'CV du candidat'));
            var cvValue = node('dd', 'og-dashboard-cv-value');
            if (!cvStatusAvailable) {
                cvValue.append(node('span', 'og-dashboard-pill is-unknown', 'Statut indisponible'));
            } else if (!cv) {
                cvValue.append(node('span', 'og-dashboard-pill is-pending', 'Non fourni'));
            } else {
                cvValue.append(node('span', 'og-dashboard-pill is-ok', 'Fourni'));
                cvValue.append(node('span', 'og-dashboard-cv-filename', cv.original_filename || 'CV.pdf'));
                if (cv.uploaded_at) cvValue.append(node('small', 'og-dashboard-muted',
                    'Déposé le ' + new Date(cv.uploaded_at).toLocaleDateString('fr-FR')));
                var download = node('button', 'og-dashboard-download og-dashboard-cv-download', 'Préparer le téléchargement');
                download.type = 'button';
                download.addEventListener('click', function () {
                    download.disabled = true;
                    download.textContent = 'Préparation…';
                    storageApi('object/sign/doctrine-candidate-cv/' + encodeURIComponent(candidate.candidate.id) + '/cv.pdf', {
                        method: 'POST', body: { expiresIn: 300 }
                    }).then(function (signed) {
                        var signedPath = signed.signedURL || signed.signedUrl;
                        if (!signedPath) throw new Error('Lien de téléchargement non retourné.');
                        var absoluteUrl = /^https?:\/\//i.test(signedPath)
                            ? signedPath : auth().url.replace(/\/$/, '') + '/storage/v1' + (signedPath.charAt(0) === '/' ? signedPath : '/' + signedPath);
                        var link = node('a', 'og-dashboard-download og-dashboard-cv-download', 'Télécharger le CV');
                        link.href = absoluteUrl;
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                        link.download = cv.original_filename || 'CV.pdf';
                        download.replaceWith(link);
                    }).catch(function (error) {
                        download.disabled = false;
                        download.textContent = 'Réessayer le téléchargement';
                        cvValue.append(node('small', 'og-dashboard-oral-feedback is-error', error.message));
                    });
                });
                cvValue.append(download);
            }
            list.append(cvValue);
            Object.keys(admission).filter(function (key) {
                return !['candidate_id', 'created_at', 'updated_at', 'id', 'ccpm_date', 'ccpm_score', 'guide_notes', 'ccpm_validated', 'mock_orals_done', 'mock_orals_target', 'next_oral_date'].includes(key);
            }).forEach(function (key) {
                var value = admission[key];
                if (value === null || value === undefined || typeof value === 'object') return;
                list.append(node('dt', '', key.replace(/_/g, ' ')), node('dd', '', String(value)));
            });
            if (list.children.length <= 2 && !Object.keys(admission).length) {
                list.append(node('p', 'og-dashboard-muted', 'Aucun autre état de document renseigné.'));
            }
            docs.append(list);
            body.append(docs);
            body.append(renderAiCorrection(candidate));
            card.append(body);
            groupItems.append(card);
        });
        group.append(groupItems);
        candidatesNode.append(group);
    }
    function renderExerciseLibraries() {
        if (!exerciseLibraryNode) return;
        exerciseLibraryNode.replaceChildren();
        var filter = node('select', 'og-dashboard-library-filter');
        filter.setAttribute('aria-label', 'Filtrer les exercices par difficulté');
        [
            ['', 'Toutes les difficultés'],
            ['1', '★☆☆☆ — Fondamentaux'],
            ['2', '★★☆☆ — Application'],
            ['3', '★★★☆ — Maîtrise'],
            ['4', '★★★★ — Expertise']
        ].forEach(function (entry) {
            var option = node('option', '', entry[1]);
            option.value = entry[0];
            filter.append(option);
        });
        var list = node('div', 'og-dashboard-library-grid');
        function render() {
            list.replaceChildren();
            var selected = filter.value;
            var rows = exerciseLibraryItems.filter(function (exercise) {
                return !selected || String(exercise.difficulty_level) === selected;
            });
            if (!rows.length) {
                list.append(node('p', 'og-dashboard-empty', 'Aucun exercice publié pour ce filtre.'));
                return;
            }
            rows.forEach(function (exercise) {
                var card = node('article', 'og-dashboard-library-card');
                var level = Number(exercise.difficulty_level) || 1;
                card.append(node('span', 'og-dashboard-library-stars', '★'.repeat(level) + '☆'.repeat(4 - level) +
                    ' · ' + ['Fondamentaux', 'Application', 'Maîtrise', 'Expertise'][level - 1]));
                card.append(node('h4', '', exercise.title));
                if (exercise.category) card.append(node('span', 'og-dashboard-library-category', exercise.category));
                if (exercise.description) card.append(node('p', '', exercise.description));
                var actions = node('div', 'og-dashboard-library-actions');
                var open = node('a', 'og-dashboard-download', 'Ouvrir l’exercice');
                open.href = exercise.drive_url;
                open.target = '_blank';
                open.rel = 'noopener noreferrer';
                actions.append(open);
                var related = correctionLibraryItems.filter(function (correction) {
                    return correction.exercise_id === exercise.id;
                });
                if (related.length) {
                    var details = node('details', 'og-dashboard-library-corrections');
                    var summary = node('summary', '', 'Corrections disponibles (' + related.length + ')');
                    details.append(summary);
                    related.forEach(function (correction) {
                        var line = node('div', 'og-dashboard-library-correction');
                        var title = node('strong', '', correction.title);
                        var link = node('a', 'og-dashboard-download', 'Ouvrir la correction');
                        link.href = correction.drive_url;
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                        line.append(title, link);
                        if (correction.description) line.append(node('p', '', correction.description));
                        details.append(line);
                    });
                    card.append(details);
                }
                card.append(actions);
                list.append(card);
            });
        }
        filter.addEventListener('change', render);
        exerciseLibraryNode.append(filter, list);
        render();
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
        Promise.allSettled([candidateRequest, courseRequest, progressRequest, cvRequest]).then(function (results) {
            if (results[0].status === 'fulfilled') {
                candidates = Array.isArray(results[0].value.candidates) ? results[0].value.candidates : [];
            } else {
                candidates = [];
                setStatus('Suivi candidats indisponible : ' + results[0].reason.message, true);
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
            renderCandidates();
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
        var candidateSection = node('section', 'og-dashboard-section');
        candidateSection.append(node('h3', '', 'Suivi de mes candidats'));
        searchNode = node('input', 'og-dashboard-search');
        searchNode.type = 'search';
        searchNode.placeholder = 'Rechercher un candidat, une unité ou une spécialité…';
        searchNode.setAttribute('aria-label', 'Rechercher un candidat');
        searchNode.addEventListener('input', renderCandidates);
        candidateSection.append(searchNode);
        statusFilterNode = node('div', 'og-dashboard-status-filters');
        statusFilterNode.setAttribute('role', 'group');
        statusFilterNode.setAttribute('aria-label', 'Filtrer les candidats par état de suivi');
        candidateSection.append(statusFilterNode);
        candidatesNode = node('div', 'og-dashboard-candidates');
        candidateSection.append(candidatesNode);
        panel.append(candidateSection);
        var courseSection = node('section', 'og-dashboard-section');
        courseSection.append(node('h3', '', 'Bibliothèque des 30 supports Officier Guide'));
        courseSection.append(node('p', 'og-dashboard-muted', 'Catalogue commun classé en six catégories. Les supports sont consultables et téléchargeables.'));
        coursesNode = node('div', 'og-dashboard-courses');
        courseSection.append(coursesNode);
        panel.append(courseSection);
        var exerciseSection = node('section', 'og-dashboard-section');
        exerciseSection.append(node('h3', '', 'Bibliothèque des dossiers d’exercices et corrections'));
        exerciseSection.append(node('p', 'og-dashboard-muted', 'Exercices classés par difficulté et corrections associées. Seuls les contenus publiés sont affichés.'));
        exerciseLibraryNode = node('div', 'og-dashboard-library');
        exerciseSection.append(exerciseLibraryNode);
        panel.append(exerciseSection);
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
            var button = node('button', '', 'Espace Officier Guide');
            button.type = 'button';
            button.addEventListener('click', function () {
                trigger = button;
                build();
                root.hidden = false;
                document.body.classList.add('og-dashboard-open');
                load();
                loadExerciseLibraries();
            });
            item.append(button);
            nav.append(item);
        }
        guideAccess().then(function (allowed) {
            item.hidden = !allowed;
            if (!allowed && root && !root.hidden) close();
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
            var progressionCard = document.querySelector('.study-dashboard');
            if (progressionCard) progressionCard.hidden = false;
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
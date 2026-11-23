(function () {
    'use strict';

    var EXERCISES = 'guide_exercise_library';
    var CORRECTIONS = 'guide_correction_library';
    var LEVELS = [
        { value: '1', label: '★ — Initiation' },
        { value: '2', label: '★★ — Bases' },
        { value: '3', label: '★★★ — Approfondissement' },
        { value: '4', label: '★★★★ — Défi' }
    ];
    var root, exerciseList, correctionList, status, formPanel, formTitle, form;
    var exercises = [], corrections = [], activeType = '', activeId = '';

    function auth() { return window.DoctrineAuth; }
    function isAdmin() { return !!(auth() && typeof auth().estAdmin === 'function' && auth().estAdmin()); }
    function el(tag, className, value) {
        var item = document.createElement(tag);
        if (className) item.className = className;
        if (value !== undefined && value !== null) item.textContent = value;
        return item;
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
            if (response.ok) return response.status === 204 ? [] : response.json().catch(function () { return []; });
            return response.json().catch(function () { return {}; }).then(function (payload) {
                throw new Error(payload.message || payload.details || 'Erreur Supabase (HTTP ' + response.status + ').');
            });
        });
    }
    function openDriveInViewer(url, title) {
        var viewer = window.DoctrineViewer;
        try { if (window.top && window.top.DoctrineViewer) viewer = window.top.DoctrineViewer; } catch (_) {}
        if (!viewer || typeof viewer.openDrive !== 'function' || !viewer.openDrive(url, title, 'exercices-corrections')) {
            setStatus('La visionneuse intégrée est indisponible. Actualisez DOCTRINE puis réessayez.', true);
            return false;
        }
        return true;
    }
    function safeDriveUrl(value) {
        var url = String(value || '').trim();
        if (!/^https:\/\/(?:drive\.google\.com|docs\.google\.com)\//i.test(url)) {
            throw new Error('Le lien doit être une adresse Google Drive ou Google Docs en HTTPS.');
        }
        return url;
    }
    function stars(level) {
        var value = Math.max(1, Math.min(4, Number(level) || 1));
        return '★'.repeat(value);
    }
    function setStatus(message, error) {
        status.textContent = message || '';
        status.classList.toggle('is-error', !!error);
    }
    function makeField(labelText, control) {
        var label = el('label', 'adm-guide-library-field', labelText);
        label.append(control);
        return label;
    }
    function buildForm() {
        form = el('form', 'adm-guide-library-form');
        form.innerHTML =
            '<label class="adm-guide-library-field" for="agl-title">Titre<input id="agl-title" maxlength="180" required></label>' +
            '<label class="adm-guide-library-field" for="agl-category">Catégorie (exercices)<input id="agl-category" maxlength="100"></label>' +
            '<label class="adm-guide-library-field" for="agl-exercise">Exercice associé (corrections)<select id="agl-exercise"></select></label>' +
            '<label class="adm-guide-library-field" for="agl-description">Description<textarea id="agl-description" rows="3" maxlength="1500"></textarea></label>' +
            '<label class="adm-guide-library-field" for="agl-url">Lien Google Drive<input id="agl-url" type="url" maxlength="1000" placeholder="https://drive.google.com/…" required></label>' +
            '<label class="adm-guide-library-field" for="agl-level">Difficulté<select id="agl-level">' +
            LEVELS.map(function (level) { return '<option value="' + level.value + '">' + level.label + '</option>'; }).join('') +
            '</select></label>' +
            '<label class="adm-guide-library-publish"><input id="agl-published" type="checkbox"> Publier pour les Officiers Guides</label>';
        var actions = el('div', 'adm-guide-library-actions');
        var save = el('button', 'adm-guide-library-primary', 'Enregistrer');
        save.type = 'submit';
        var cancel = el('button', 'adm-guide-library-secondary', 'Annuler');
        cancel.type = 'button';
        cancel.addEventListener('click', hideForm);
        actions.append(save, cancel);
        form.append(actions);
        form.addEventListener('submit', saveItem);
        formPanel.append(formTitle, form);
    }
    function buildInterface() {
        if (root) return;
        root = el('section', 'adm-guide-library-overlay');
        root.id = 'adm-guide-library';
        root.hidden = true;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'adm-guide-library-title');
        var card = el('div', 'adm-guide-library-card');
        var header = el('header', 'adm-guide-library-header');
        var intro = el('div');
        intro.append(el('p', 'adm-guide-library-kicker', 'ADMINISTRATION ANC / BIBLIOTHÈQUES PÉDAGOGIQUES'));
        intro.append(el('h2', '', 'Exercices et corrections'));
        intro.append(el('p', '', 'Gérez les dossiers, les niveaux et la publication des liens Google Drive.'));
        var close = el('button', 'adm-guide-library-secondary', 'Fermer');
        close.type = 'button';
        close.addEventListener('click', closePanel);
        header.append(intro, close);
        var sections = el('div', 'adm-guide-library-grid');
        var exerciseSection = el('section', 'adm-guide-library-section');
        var exerciseHeading = el('div', 'adm-guide-library-section-heading');
        exerciseHeading.append(el('h3', '', 'Dossiers d’exercices'));
        var addExercise = el('button', 'adm-guide-library-primary', '+ Ajouter');
        addExercise.type = 'button';
        addExercise.addEventListener('click', function () { openForm('exercise', null); });
        exerciseHeading.append(addExercise);
        exerciseList = el('div', 'adm-guide-library-list');
        exerciseSection.append(exerciseHeading, exerciseList);
        var correctionSection = el('section', 'adm-guide-library-section');
        var correctionHeading = el('div', 'adm-guide-library-section-heading');
        correctionHeading.append(el('h3', '', 'Corrections'));
        var addCorrection = el('button', 'adm-guide-library-primary', '+ Ajouter');
        addCorrection.type = 'button';
        addCorrection.addEventListener('click', function () { openForm('correction', null); });
        correctionHeading.append(addCorrection);
        correctionList = el('div', 'adm-guide-library-list');
        correctionSection.append(correctionHeading, correctionList);
        sections.append(exerciseSection, correctionSection);
        formPanel = el('section', 'adm-guide-library-form-panel');
        formPanel.hidden = true;
        formTitle = el('h3', '', 'Ajouter un élément');
        buildForm();
        status = el('p', 'adm-guide-library-status', 'Prêt.');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        card.append(header, sections, formPanel, status);
        root.append(card);
        root.addEventListener('click', function (event) { if (event.target === root) closePanel(); });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && root && !root.hidden) closePanel();
        });
        document.body.append(root);
    }
    function renderList(type) {
        var target = type === 'exercise' ? exerciseList : correctionList;
        var rows = type === 'exercise' ? exercises : corrections;
        target.replaceChildren();
        if (!rows.length) {
            target.append(el('p', 'adm-guide-library-empty', 'Aucun élément enregistré.'));
            return;
        }
        rows.forEach(function (item) {
            var article = el('article', 'adm-guide-library-item');
            var copy = el('div', 'adm-guide-library-copy');
            copy.append(el('h4', '', item.title));
            copy.append(el('p', 'adm-guide-library-stars', stars(item.difficulty_level) + ' · ' +
                LEVELS[Number(item.difficulty_level) - 1].label.split(' — ')[1]));
            if (type === 'exercise') copy.append(el('p', '', item.category || 'Général'));
            else {
                var parent = exercises.find(function (exercise) { return exercise.id === item.exercise_id; });
                copy.append(el('p', '', 'Exercice : ' + (parent ? parent.title : 'Exercice introuvable')));
            }
            copy.append(el('span', 'adm-guide-library-publication ' + (item.is_published ? 'is-published' : ''), item.is_published ? 'Publié' : 'Brouillon'));
            if (item.description) copy.append(el('p', '', item.description));
            var actions = el('div', 'adm-guide-library-item-actions');
            var open = el('button', 'adm-guide-library-secondary', 'Ouvrir dans DOCTRINE');
            open.type = 'button';
            open.addEventListener('click', function () { openDriveInViewer(item.drive_url, item.title); });
            var edit = el('button', 'adm-guide-library-secondary', 'Modifier');
            edit.type = 'button';
            edit.addEventListener('click', function () { openForm(type, item); });
            var remove = el('button', 'adm-guide-library-danger', 'Supprimer');
            remove.type = 'button';
            remove.addEventListener('click', function () { deleteItem(type, item); });
            actions.append(open, edit, remove);
            article.append(copy, actions);
            target.append(article);
        });
    }
    function load() {
        setStatus('Chargement des bibliothèques…');
        return Promise.all([
            api(EXERCISES + '?select=id,title,category,description,drive_url,difficulty_level,is_published,sort_order,created_at&order=sort_order.asc,title.asc'),
            api(CORRECTIONS + '?select=id,exercise_id,title,description,drive_url,difficulty_level,is_published,sort_order,created_at&order=sort_order.asc,title.asc')
        ]).then(function (result) {
            exercises = Array.isArray(result[0]) ? result[0] : [];
            corrections = Array.isArray(result[1]) ? result[1] : [];
            renderList('exercise');
            renderList('correction');
            setStatus(exercises.length + ' exercice(s) · ' + corrections.length + ' correction(s).');
        }).catch(function (error) {
            setStatus(error.message || 'Chargement impossible.', true);
        });
    }
    function openForm(type, item) {
        if (!isAdmin()) return;
        activeType = type;
        activeId = item ? item.id : '';
        form.reset();
        formTitle.textContent = (item ? 'Modifier ' : 'Ajouter ') + (type === 'exercise' ? 'un exercice' : 'une correction');
        form.querySelector('#agl-category').closest('label').hidden = type !== 'exercise';
        form.querySelector('#agl-exercise').closest('label').hidden = type !== 'correction';
        var exerciseSelect = form.querySelector('#agl-exercise');
        exerciseSelect.replaceChildren();
        exercises.forEach(function (exercise) {
            var option = document.createElement('option');
            option.value = exercise.id;
            option.textContent = exercise.title;
            exerciseSelect.append(option);
        });
        exerciseSelect.required = type === 'correction';
        if (type === 'correction' && !exercises.length) {
            setStatus('Créez d’abord un dossier d’exercice avant sa correction.', true);
            return;
        }
        form.querySelector('#agl-title').value = item ? item.title : '';
        form.querySelector('#agl-category').value = item && item.category ? item.category : 'Général';
        form.querySelector('#agl-description').value = item ? item.description || '' : '';
        form.querySelector('#agl-url').value = item ? item.drive_url : '';
        form.querySelector('#agl-level').value = item ? String(item.difficulty_level) : '1';
        form.querySelector('#agl-published').checked = !!(item && item.is_published);
        if (type === 'correction' && item) exerciseSelect.value = item.exercise_id;
        formPanel.hidden = false;
        form.querySelector('#agl-title').focus();
    }
    function hideForm() { formPanel.hidden = true; activeType = ''; activeId = ''; }
    function saveItem(event) {
        event.preventDefault();
        if (!isAdmin() || !form.reportValidity()) return;
        var payload;
        try {
            payload = {
                title: form.querySelector('#agl-title').value.trim(),
                description: form.querySelector('#agl-description').value.trim(),
                drive_url: safeDriveUrl(form.querySelector('#agl-url').value),
                difficulty_level: Number(form.querySelector('#agl-level').value),
                is_published: form.querySelector('#agl-published').checked,
                updated_by: null,
                updated_at: new Date().toISOString()
            };
            if (activeType === 'exercise') payload.category = form.querySelector('#agl-category').value.trim() || 'Général';
            else payload.exercise_id = form.querySelector('#agl-exercise').value;
        } catch (error) {
            setStatus(error.message, true);
            return;
        }
        if (!payload.title) { setStatus('Le titre est obligatoire.', true); return; }
        var tokenPromise = auth().jeton();
        tokenPromise.then(function (token) {
            var claims;
            try { claims = JSON.parse(decodeURIComponent(escape(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (_) { claims = {}; }
            payload.updated_by = claims.sub || null;
            if (!activeId) payload.created_by = claims.sub || null;
            var table = activeType === 'exercise' ? EXERCISES : CORRECTIONS;
            return api(table + (activeId ? '?id=eq.' + encodeURIComponent(activeId) : ''), {
                method: activeId ? 'PATCH' : 'POST',
                prefer: 'return=representation',
                body: payload
            });
        }).then(function () {
            hideForm();
            return load();
        }).catch(function (error) { setStatus(error.message || 'Enregistrement impossible.', true); });
    }
    function deleteItem(type, item) {
        if (!isAdmin() || !window.confirm('Supprimer définitivement « ' + item.title + ' » ?')) return;
        var table = type === 'exercise' ? EXERCISES : CORRECTIONS;
        api(table + '?id=eq.' + encodeURIComponent(item.id), { method: 'DELETE' })
            .then(load)
            .catch(function (error) {
                setStatus(type === 'exercise'
                    ? 'Suppression impossible : supprimez ou rattachez d’abord ses corrections. ' + (error.message || '')
                    : (error.message || 'Suppression impossible.'), true);
            });
    }
    function openPanel() {
        if (!isAdmin()) return;
        buildInterface();
        root.hidden = false;
        document.body.classList.add('adm-guide-library-open');
        load();
    }
    function closePanel() {
        if (!root) return;
        root.hidden = true;
        document.body.classList.remove('adm-guide-library-open');
    }
    function updateButtons() {
        var visible = isAdmin();
        document.querySelectorAll('.module-nav-controls').forEach(function (zone) {
            var button = zone.querySelector('.adm-guide-library-toggle');
            if (!button && visible) {
                button = el('button', 'module-nav-button adm-guide-library-toggle', '📚 Exercices & corrections');
                button.type = 'button';
                button.title = 'Administrer les bibliothèques d’exercices et de corrections';
                button.addEventListener('click', openPanel);
                zone.append(button);
            }
            if (button) button.hidden = !visible;
        });

        // Point d’entrée permanent depuis l’accueil : le bouton ne dépend plus
        // de l’ouverture préalable d’un module et reste dans la barre Admin.
        document.querySelectorAll('.app-utility-bar').forEach(function (zone) {
            var button = zone.querySelector('.adm-guide-library-home-toggle');
            if (!button && visible) {
                button = el('button', 'adm-guide-library-home-toggle', '📚 Exercices & corrections');
                button.type = 'button';
                button.title = 'Administrer les bibliothèques d’exercices et de corrections';
                button.addEventListener('click', openPanel);
                zone.append(button);
            }
            if (button) button.hidden = !visible;
        });
        if (!visible && root && !root.hidden) closePanel();
    }
    function init() {
        buildInterface();
        updateButtons();
        document.addEventListener('doctrine:login', updateButtons);
        document.addEventListener('doctrine:logout', updateButtons);
        document.addEventListener('click', function (event) {
            if (event.target.closest && event.target.closest('.module-nav-controls')) updateButtons();
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

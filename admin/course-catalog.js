(function () {
    'use strict';

    var TABLE = 'guide_course_catalog';
    var root = null;
    var list = null;
    var status = null;
    var search = null;
    var formPanel = null;
    var form = null;
    var activeCourseId = '';
    var courses = [];
    var opened = false;

    function auth() { return window.DoctrineAuth; }
    function isAdmin() { return !!(auth() && typeof auth().estAdmin === 'function' && auth().estAdmin()); }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function setStatus(message, error) {
        status.textContent = message || '';
        status.classList.toggle('is-error', !!error);
        status.classList.toggle('is-success', !error && !!message);
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

    function safeDriveUrl(value) {
        var url = String(value || '').trim();
        if (!/^https:\/\/(?:drive\.google\.com|docs\.google\.com)\//i.test(url)) {
            throw new Error('Le lien doit être une adresse Google Drive ou Google Docs en HTTPS.');
        }
        return url;
    }

    function downloadUrl(value) {
        var url = safeDriveUrl(value);
        var match = url.match(/\/(?:file|document|spreadsheets|presentation|forms)\/d\/([a-zA-Z0-9_-]+)/);
        var id = match ? match[1] : new URL(url).searchParams.get('id');
        return id ? 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id) : url;
    }

    function buildInterface() {
        if (root) return;
        root = el('section', 'adm-course-catalog');
        root.id = 'adm-course-catalog';
        root.hidden = true;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-labelledby', 'adm-course-title');

        var card = el('div', 'adm-course-card');
        var header = el('header', 'adm-course-header');
        var intro = el('div');
        intro.append(el('p', 'adm-course-kicker', 'ADMINISTRATION ANC / RESSOURCES PÉDAGOGIQUES'));
        intro.append(el('h2', '', 'Catalogue des cours Officiers Guides'));
        intro.append(el('p', 'adm-course-subtitle', 'Un catalogue commun aux Officiers Guides. Les modifications sont enregistrées dans Supabase.'));
        var close = el('button', 'adm-course-close', 'Fermer');
        close.type = 'button';
        close.addEventListener('click', closePanel);
        header.append(intro, close);

        var toolbar = el('div', 'adm-course-toolbar');
        search = document.createElement('input');
        search.type = 'search';
        search.placeholder = 'Rechercher un cours ou une catégorie…';
        search.setAttribute('aria-label', 'Rechercher un cours');
        search.addEventListener('input', render);
        var add = el('button', 'adm-course-primary', '+ Ajouter un cours');
        add.type = 'button';
        add.addEventListener('click', function () { openForm(null); });
        toolbar.append(search, add);

        status = el('p', 'adm-course-status', 'Chargement du catalogue…');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        list = el('div', 'adm-course-groups');

        formPanel = el('section', 'adm-course-form-panel');
        formPanel.hidden = true;
        var formTitle = el('h3', '', 'Ajouter un cours');
        form = document.createElement('form');
        form.innerHTML = '<label for="adm-course-name">Intitulé du cours</label>' +
            '<input id="adm-course-name" type="text" maxlength="160" required>' +
            '<label for="adm-course-category">Catégorie</label>' +
            '<input id="adm-course-category" type="text" maxlength="100" list="adm-course-categories" required>' +
            '<datalist id="adm-course-categories"></datalist>' +
            '<label for="adm-course-description">Description (facultatif)</label>' +
            '<textarea id="adm-course-description" rows="3" maxlength="1200"></textarea>' +
            '<label for="adm-course-url">Lien Google Drive</label>' +
            '<input id="adm-course-url" type="url" maxlength="1000" placeholder="https://drive.google.com/…" required>' +
            '<p class="adm-course-hint">Vérifiez que le fichier est partagé avec les comptes qui doivent le consulter.</p>';
        var formActions = el('div', 'adm-course-form-actions');
        var save = el('button', 'adm-course-primary', 'Enregistrer');
        save.type = 'submit';
        var cancel = el('button', 'adm-course-secondary', 'Annuler');
        cancel.type = 'button';
        cancel.addEventListener('click', hideForm);
        formActions.append(save, cancel);
        form.append(formActions);
        form.addEventListener('submit', saveCourse);
        formPanel.append(formTitle, form);

        card.append(header, toolbar, status, list, formPanel);
        root.append(card);
        root.addEventListener('click', function (event) { if (event.target === root) closePanel(); });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && root && !root.hidden) closePanel();
        });
        document.body.append(root);
    }

    function render() {
        if (!list) return;
        list.replaceChildren();
        var term = String(search.value || '').trim().toLocaleLowerCase('fr');
        var filtered = courses.filter(function (course) {
            return [course.title, course.category, course.description].join(' ').toLocaleLowerCase('fr').indexOf(term) !== -1;
        });
        var groups = Object.create(null);
        filtered.forEach(function (course) {
            var category = course.category || 'Sans catégorie';
            (groups[category] || (groups[category] = [])).push(course);
        });
        var categories = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
        if (!categories.length) {
            list.append(el('p', 'adm-course-empty', courses.length ? 'Aucun résultat pour cette recherche.' : 'Aucun cours dans le catalogue.'));
            return;
        }
        categories.forEach(function (category) {
            var details = document.createElement('details');
            details.className = 'adm-course-group';
            details.open = true;
            var summary = document.createElement('summary');
            summary.append(el('strong', '', category), el('span', 'adm-course-count', String(groups[category].length) + ' cours'));
            details.append(summary);
            groups[category].forEach(function (course) {
                var item = el('article', 'adm-course-item');
                var text = el('div', 'adm-course-item-text');
                text.append(el('h3', '', course.title));
                if (course.description) text.append(el('p', '', course.description));
                var actions = el('div', 'adm-course-item-actions');
                var download = el('a', 'adm-course-download', 'Télécharger');
                download.href = downloadUrl(course.drive_url);
                download.target = '_blank';
                download.rel = 'noopener noreferrer';
                var edit = el('button', 'adm-course-secondary', 'Modifier');
                edit.type = 'button';
                edit.addEventListener('click', function () { openForm(course); });
                var remove = el('button', 'adm-course-danger', 'Supprimer');
                remove.type = 'button';
                remove.addEventListener('click', function () { deleteCourse(course); });
                actions.append(download, edit, remove);
                item.append(text, actions);
                details.append(item);
            });
            list.append(details);
        });
    }

    function load() {
        setStatus('Chargement des cours…');
        return api(TABLE + '?select=id,title,category,description,drive_url,created_at&order=category.asc,title.asc')
            .then(function (rows) {
                courses = Array.isArray(rows) ? rows : [];
                render();
                setStatus(courses.length + ' cours dans le catalogue partagé · ' +
                    new Set(courses.map(function (course) { return course.category; })).size + ' catégories.');
            }).catch(function (error) {
                setStatus(error.message || 'Chargement impossible.', true);
            });
    }

    function openForm(course) {
        if (!isAdmin()) return;
        activeCourseId = course ? course.id : '';
        form.reset();
        form.querySelector('#adm-course-name').value = course ? course.title : '';
        form.querySelector('#adm-course-category').value = course ? course.category : '';
        form.querySelector('#adm-course-description').value = course ? (course.description || '') : '';
        form.querySelector('#adm-course-url').value = course ? course.drive_url : '';
        formPanel.querySelector('h3').textContent = course ? 'Modifier le cours' : 'Ajouter un cours';
        var datalist = form.querySelector('#adm-course-categories');
        datalist.replaceChildren();
        Array.from(new Set(courses.map(function (item) { return item.category; }))).sort().forEach(function (category) {
            var option = document.createElement('option');
            option.value = category;
            datalist.append(option);
        });
        formPanel.hidden = false;
        form.querySelector('#adm-course-name').focus();
    }

    function hideForm() { formPanel.hidden = true; activeCourseId = ''; }

    function saveCourse(event) {
        event.preventDefault();
        if (!isAdmin() || !form.reportValidity()) return;
        var button = form.querySelector('button[type="submit"]');
        var payload;
        try {
            payload = {
                title: form.querySelector('#adm-course-name').value.trim(),
                category: form.querySelector('#adm-course-category').value.trim(),
                description: form.querySelector('#adm-course-description').value.trim(),
                drive_url: safeDriveUrl(form.querySelector('#adm-course-url').value)
            };
        } catch (error) {
            setStatus(error.message, true);
            return;
        }
        if (!payload.title || !payload.category) {
            setStatus('Le titre et la catégorie sont obligatoires.', true);
            return;
        }
        button.disabled = true;
        setStatus('Enregistrement en cours…');
        api(TABLE + (activeCourseId ? '?id=eq.' + encodeURIComponent(activeCourseId) : ''), {
            method: activeCourseId ? 'PATCH' : 'POST',
            prefer: 'return=representation',
            body: payload
        }).then(function () {
            hideForm();
            return load();
        }).catch(function (error) {
            setStatus(error.message || 'Enregistrement impossible.', true);
        }).finally(function () { button.disabled = false; });
    }

    function deleteCourse(course) {
        if (!isAdmin() || !window.confirm('Supprimer définitivement « ' + course.title + ' » du catalogue partagé ?')) return;
        setStatus('Suppression en cours…');
        api(TABLE + '?id=eq.' + encodeURIComponent(course.id), { method: 'DELETE' })
            .then(load)
            .catch(function (error) { setStatus(error.message || 'Suppression impossible.', true); });
    }

    function openPanel() {
        if (!isAdmin()) return;
        buildInterface();
        root.hidden = false;
        opened = true;
        document.body.classList.add('adm-course-open');
        load();
    }

    function closePanel() {
        if (!root) return;
        root.hidden = true;
        opened = false;
        document.body.classList.remove('adm-course-open');
    }

    function addToolbarButtons() {
        document.querySelectorAll('.adm-course-catalog-toggle').forEach(function (button) {
            button.remove();
        });
        if (opened) closePanel();
    }

    function init() {
        buildInterface();
        addToolbarButtons();
        document.addEventListener('doctrine:login', addToolbarButtons);
        document.addEventListener('doctrine:logout', addToolbarButtons);
        document.addEventListener('click', function (event) {
            if (event.target.closest && event.target.closest('.module-nav-controls')) addToolbarButtons();
        });
        if (isAdmin()) addToolbarButtons();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

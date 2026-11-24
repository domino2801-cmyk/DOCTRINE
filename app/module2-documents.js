(function () {
    'use strict';

    var TABLE = 'guide_document_proposals';
    var auth = window.DoctrineAuth;
    var initialized = false;

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function api(path, options) {
        if (!auth || typeof auth.jeton !== 'function') return Promise.reject(new Error('Connexion DOCTRINE indisponible.'));
        return auth.jeton().then(function (token) {
            if (!token) throw new Error('Session expirée. Reconnectez-vous.');
            var headers = { apikey: auth.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
            if (options && options.prefer) headers.Prefer = options.prefer;
            return fetch(auth.url.replace(/\/$/, '') + '/rest/v1/' + path, {
                method: options && options.method || 'GET',
                headers: headers,
                body: options && options.body ? JSON.stringify(options.body) : undefined
            });
        }).then(function (response) {
            return response.text().then(function (body) {
                var data = body ? JSON.parse(body) : [];
                if (!response.ok) throw new Error(data.message || data.details || 'Erreur HTTP ' + response.status);
                return data;
            });
        });
    }

    function isAdmin() {
        return !!(auth && typeof auth.estAdmin === 'function' && auth.estAdmin());
    }

    function setStatus(node, message, error) {
        node.textContent = message || '';
        node.classList.toggle('is-error', !!error);
    }

    function documentCard(row) {
        var card = el('li', 'dossier-item module2-approved-document');
        var title = el('span', 'dossier-text', row.title);
        var meta = el('span', 'module2-document-category', row.category || 'Document complémentaire');
        var link = el('a', 'doc-link', 'Ouvrir');
        link.href = row.drive_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.append(title, meta, link);
        return card;
    }

    function findModule2Anchor() {
        var body = document.querySelector('.mod-body[data-mod="2"]');
        if (!body) return null;
        var heading = Array.prototype.find.call(body.querySelectorAll('p > strong'), function (node) {
            return node.textContent.trim().indexOf('2.1.') === 0;
        });
        var list = heading && heading.parentElement.nextElementSibling;
        return list && list.matches('ul.dossier-list') ? list : null;
    }

    function loadPublished() {
        var list = findModule2Anchor();
        if (!list) return;
        api(TABLE + '?select=id,title,category,description,drive_url,created_at&status=eq.approved&order=created_at.asc')
            .then(function (rows) {
                var old = list.parentElement.querySelector('.module2-approved-documents');
                if (old) old.remove();
                if (!rows.length) return;
                var extra = el('ul', 'dossier-list module2-approved-documents');
                rows.forEach(function (row) { extra.appendChild(documentCard(row)); });
                list.after(extra);
            }).catch(function (error) {
                console.error('Documents complémentaires du Module 2 indisponibles.', error);
            });
    }

    function buildGuidePanel() {
        var app = document.getElementById('guideModule8App');
        if (!app || document.getElementById('guideModule2ProposalPanel')) return;
        var panel = el('section', 'guide-panel');
        panel.id = 'guideModule2ProposalPanel';
        panel.appendChild(el('div', 'guide-panel-heading', 'Proposer un document pour le Module 2'));
        panel.appendChild(el('p', 'guide-muted', 'Proposez une ressource pour la rubrique 2.1. Le lien Google Drive sera ajouté par l’administrateur après insertion du document dans son Drive.'));
        var form = el('form', 'module2-proposal-form');
        var titleLabel = el('label', '', 'Titre du document');
        var title = el('input'); title.required = true; title.maxLength = 160;
        titleLabel.appendChild(title);
        var categoryLabel = el('label', '', 'Catégorie');
        var category = el('input'); category.required = true; category.maxLength = 100;
        categoryLabel.appendChild(category);
        var descriptionLabel = el('label', '', 'Description (facultatif)');
        var description = el('textarea'); description.maxLength = 1200; description.rows = 3;
        descriptionLabel.appendChild(description);
        var submit = el('button', 'guide-button guide-button-primary', 'Envoyer la proposition');
        submit.type = 'submit';
        var status = el('p', 'guide-form-status');
        status.setAttribute('role', 'status');
        form.append(titleLabel, categoryLabel, descriptionLabel, submit, status);
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (!form.reportValidity()) return;
            submit.disabled = true;
            setStatus(status, 'Envoi de la proposition…');
            api(TABLE, { method: 'POST', prefer: 'return=minimal', body: {
                title: title.value.trim(), category: category.value.trim(), description: description.value.trim()
            }}).then(function () {
                form.reset();
                setStatus(status, 'Proposition transmise à l’administrateur.');
                loadOwnProposals(ownList, ownStatus);
            }).catch(function (error) {
                setStatus(status, error.message || 'Envoi impossible.', true);
            }).finally(function () { submit.disabled = false; });
        });
        var ownTitle = el('h3', '', 'Mes propositions');
        var ownList = el('ul', 'module2-proposal-list');
        var ownStatus = el('p', 'guide-form-status');
        panel.append(form, ownTitle, ownList, ownStatus);
        var target = document.getElementById('guideCourseCatalog');
        if (target) target.before(panel);
        else app.appendChild(panel);
        loadOwnProposals(ownList, ownStatus);
    }

    function loadOwnProposals(list, status) {
        api(TABLE + '?select=id,title,category,status,admin_note,created_at&order=created_at.desc')
            .then(function (rows) {
                list.replaceChildren();
                if (!rows.length) { setStatus(status, 'Aucune proposition enregistrée.'); return; }
                rows.forEach(function (row) {
                    var line = el('li', '', row.title + ' — ' + row.category + ' — ' +
                        (row.status === 'approved' ? 'Validée' : row.status === 'rejected' ? 'Refusée' : 'En attente'));
                    if (row.admin_note) line.appendChild(el('p', 'guide-muted', row.admin_note));
                    list.appendChild(line);
                });
                setStatus(status, '');
            }).catch(function (error) { setStatus(status, error.message || 'Chargement impossible.', true); });
    }

    function adminPanel() {
        var body = document.querySelector('.mod-body[data-mod="2"]');
        if (!body || document.getElementById('module2DocumentAdmin')) return;
        var panel = el('section', 'adm-ui module2-document-admin');
        panel.id = 'module2DocumentAdmin';
        panel.appendChild(el('h3', '', 'Gestion des documents complémentaires — rubrique 2.1'));
        var form = el('form', 'module2-admin-form');
        function field(labelText, tag, required, maxLength) {
            var label = el('label', '', labelText);
            var input = el(tag);
            input.required = !!required;
            if (maxLength) input.maxLength = maxLength;
            if (tag === 'input') input.type = 'text';
            label.appendChild(input);
            form.appendChild(label);
            return input;
        }
        var title = field('Titre du document', 'input', true, 160);
        var category = field('Catégorie', 'input', true, 100);
        var description = field('Description (facultatif)', 'textarea', false, 1200);
        var url = field('Lien Google Drive (https://)', 'input', true, 1000);
        url.type = 'url';
        var add = el('button', 'guide-button guide-button-primary', 'Ajouter et publier la carte');
        add.type = 'submit';
        var status = el('p', 'adm-state');
        form.append(add, status);
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (!form.reportValidity()) return;
            var parsed;
            try { parsed = new URL(url.value.trim()); } catch (error) { parsed = null; }
            if (!parsed || parsed.protocol !== 'https:') { setStatus(status, 'Le lien doit commencer par https://.', true); return; }
            add.disabled = true;
            setStatus(status, 'Publication…');
            api(TABLE, { method: 'POST', prefer: 'return=minimal', body: {
                title: title.value.trim(), category: category.value.trim(), description: description.value.trim(),
                drive_url: parsed.href, status: 'approved'
            }}).then(function () {
                form.reset();
                setStatus(status, 'Carte publiée dans la rubrique 2.1.');
                loadPublished();
                loadProposals(proposals, proposalStatus);
            }).catch(function (error) { setStatus(status, error.message || 'Publication impossible.', true); })
                .finally(function () { add.disabled = false; });
        });
        panel.appendChild(form);
        panel.appendChild(el('h3', '', 'Propositions des Officiers Guides'));
        var proposals = el('div', 'module2-admin-proposals');
        var proposalStatus = el('p', 'adm-state');
        panel.append(proposals, proposalStatus);
        body.after(panel);
        loadProposals(proposals, proposalStatus);
    }

    function loadProposals(container, status) {
        api(TABLE + '?select=id,title,category,description,guide_id,created_at&status=eq.pending&order=created_at.asc')
            .then(function (rows) {
                container.replaceChildren();
                if (!rows.length) { setStatus(status, 'Aucune proposition en attente.'); return; }
                rows.forEach(function (row) {
                    var card = el('article', 'module2-admin-proposal');
                    card.append(el('strong', '', row.title), el('p', '', row.category),
                        el('p', '', row.description || 'Aucune description.'));
                    var linkLabel = el('label', '', 'Lien Google Drive après insertion dans votre Drive');
                    var link = el('input'); link.type = 'url'; link.required = true; link.placeholder = 'https://drive.google.com/...';
                    linkLabel.appendChild(link);
                    var noteLabel = el('label', '', 'Commentaire (facultatif)');
                    var note = el('textarea'); note.maxLength = 1000; noteLabel.appendChild(note);
                    var approve = el('button', 'guide-button guide-button-primary', 'Ajouter le lien et valider');
                    approve.type = 'button';
                    approve.addEventListener('click', function () {
                        var parsed;
                        try { parsed = new URL(link.value.trim()); } catch (error) { parsed = null; }
                        if (!parsed || parsed.protocol !== 'https:') { setStatus(status, 'Saisissez un lien HTTPS Google Drive valide.', true); return; }
                        approve.disabled = true;
                        api(TABLE + '?id=eq.' + encodeURIComponent(row.id), { method: 'PATCH', prefer: 'return=minimal',
                            body: { drive_url: parsed.href, status: 'approved', admin_note: note.value.trim() }
                        }).then(function () {
                            card.remove(); loadPublished(); setStatus(status, 'Proposition validée et publiée.');
                        }).catch(function (error) { setStatus(status, error.message || 'Validation impossible.', true); approve.disabled = false; });
                    });
                    var reject = el('button', 'guide-button', 'Refuser');
                    reject.type = 'button';
                    reject.addEventListener('click', function () {
                        if (!window.confirm('Refuser cette proposition ?')) return;
                        reject.disabled = true;
                        api(TABLE + '?id=eq.' + encodeURIComponent(row.id), { method: 'PATCH', prefer: 'return=minimal',
                            body: { status: 'rejected', admin_note: note.value.trim() }
                        }).then(function () { card.remove(); setStatus(status, 'Proposition refusée.'); })
                            .catch(function (error) { setStatus(status, error.message || 'Refus impossible.', true); reject.disabled = false; });
                    });
                    card.append(linkLabel, noteLabel, approve, reject);
                    container.appendChild(card);
                });
                setStatus(status, rows.length + ' proposition(s) en attente.');
            }).catch(function (error) { setStatus(status, error.message || 'Chargement des propositions impossible.', true); });
    }

    function init() {
        if (initialized) return;
        initialized = true;
        if (document.getElementById('guideModule8App')) {
            buildGuidePanel();
            document.addEventListener('doctrine:login', buildGuidePanel);
            return;
        }
        if (isAdmin()) adminPanel();
        loadPublished();
        document.addEventListener('doctrine:content-updated', function (event) {
            if (event.detail && event.detail.moduleId === '2') loadPublished();
        });
        document.addEventListener('doctrine:login', function () {
            if (isAdmin()) adminPanel();
            loadPublished();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
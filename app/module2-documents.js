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

    function openApprovedDocument(row) {
        if (row.uploaded_file_path) {
            return auth.jeton().then(function (token) {
                if (!token) throw new Error('Session expirée. Reconnectez-vous.');
                var path = row.uploaded_file_path.split('/').map(encodeURIComponent).join('/');
                return fetch(auth.url.replace(/\/$/, '') + '/storage/v1/object/sign/guide-document-proposals/' + path, {
                    method: 'POST',
                    headers: { apikey: auth.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ expiresIn: 300 })
                });
            }).then(function (response) {
                return response.json().catch(function () { return {}; }).then(function (payload) {
                    if (!response.ok) throw new Error(payload.message || payload.error || 'Accès au document refusé.');
                    var signed = payload.signedURL || payload.signedUrl;
                    if (!signed) throw new Error('Lien sécurisé du document indisponible.');
                    var url = new URL(signed, auth.url.replace(/\/$/, '') + '/');
                    if (!window.DoctrineViewer || typeof window.DoctrineViewer.openSignedDocument !== 'function') {
                        throw new Error('Visionneuse documentaire indisponible.');
                    }
                    return window.DoctrineViewer.openSignedDocument(url.href, row.original_filename || row.title || 'Document', row.mime_type || '', '2');
                });
            });
        }
        if (row.drive_url && window.DoctrineViewer && window.DoctrineViewer.openDrive) {
            return window.DoctrineViewer.openDrive(row.drive_url, row.title, '2');
        }
        throw new Error('Aucun fichier n’est associé à ce document.');
    }

    function documentCard(row) {
        var card = el('li', 'dossier-item module2-approved-document');
        var title = el('span', 'dossier-text', row.title);
        var meta = el('span', 'module2-document-category', row.category || 'Document complémentaire');
        var link = el('button', 'doc-link', 'Ouvrir');
        link.type = 'button';
        link.addEventListener('click', function () {
            link.disabled = true;
            Promise.resolve(openApprovedDocument(row)).catch(function (error) {
                console.error('Ouverture du document validé impossible.', error);
                window.alert(error.message || 'Impossible d’ouvrir ce document.');
            }).finally(function () { link.disabled = false; });
        });
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
        api(TABLE + '?select=id,title,category,description,drive_url,uploaded_file_path,original_filename,mime_type,created_at&status=eq.approved&order=created_at.asc')
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
        if (!app || isAdmin()) return;
        var existing = document.getElementById('guideModule2ProposalCard');
        if (existing) return;

        // Carte d'accès placée après les bibliothèques pédagogiques de l'espace OG.
        var card = el('section', 'guide-panel module2-proposal-entry');
        card.id = 'guideModule2ProposalCard';
        var heading = el('div', 'guide-panel-heading');
        heading.appendChild(el('div', '', 'PROPOSITIONS DOCUMENTAIRES'));
        var open = el('button', 'guide-button guide-button-primary', 'Proposition de documents à ajouter pour les candidats');
        open.type = 'button';
        open.setAttribute('aria-expanded', 'false');
        open.setAttribute('aria-controls', 'guideModule2ProposalResources');
        card.append(heading, open);

        var panel = el('section', 'guide-panel module2-proposal-resources');
        panel.id = 'guideModule2ProposalResources';
        panel.hidden = true;
        panel.setAttribute('aria-label', 'Ressources et propositions documentaires du Module 2.1');
        panel.appendChild(el('div', 'guide-panel-heading', '2.1. Les Piliers de l’Armée de Terre de Combat'));
        panel.appendChild(el('p', 'guide-muted', 'Consultez les documents déjà validés et proposez de nouvelles ressources. Les liens Google Drive sont ajoutés par l’administrateur après vérification.'));
        var resourcesTitle = el('h3', '', 'Ressources disponibles pour les candidats');
        var resources = el('ul', 'dossier-list module2-guide-resources');
        var resourceStatus = el('p', 'guide-form-status');
        resourceStatus.setAttribute('role', 'status');
        panel.append(resourcesTitle, resources, resourceStatus);

        var formTitle = el('h3', '', 'Proposer un nouveau document');
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

        var ownTitle = el('h3', '', 'Suivi de mes propositions');
        var ownList = el('ul', 'module2-proposal-list');
        var ownStatus = el('p', 'guide-form-status module2-proposal-status');
        panel.append(formTitle, form, ownTitle, ownList, ownStatus);

        open.addEventListener('click', function () {
            var expanded = !panel.hidden;
            panel.hidden = expanded;
            open.setAttribute('aria-expanded', String(!expanded));
            if (!expanded) {
                loadGuideResources(resources, resourceStatus);
                loadOwnProposals(ownList, ownStatus);
                panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        var target = document.getElementById('guideCourseCatalog');
        if (target && target.parentNode) {
            target.after(card, panel);
        } else {
            app.append(card, panel);
        }
    }

    function loadGuideResources(list, status) {
        api(TABLE + '?select=id,title,category,description,drive_url,created_at&status=eq.approved&order=created_at.asc')
            .then(function (rows) {
                list.replaceChildren();
                if (!rows.length) {
                    setStatus(status, 'Aucune ressource complémentaire validée pour le moment.');
                    return;
                }
                rows.forEach(function (row) {
                    var item = el('li', 'dossier-item module2-guide-resource');
                    var copy = el('div', 'module2-guide-resource-copy');
                    copy.appendChild(el('strong', 'dossier-text', row.title));
                    copy.appendChild(el('span', 'module2-document-category', row.category || 'Document complémentaire'));
                    if (row.description) copy.appendChild(el('p', 'guide-muted', row.description));
                    var link = el('button', 'doc-link', 'Ouvrir');
                    link.type = 'button';
                    link.addEventListener('click', function () {
                        link.disabled = true;
                        Promise.resolve(openApprovedDocument(row)).catch(function (error) {
                            setStatus(status, error.message || 'Ouverture du document impossible.', true);
                        }).finally(function () { link.disabled = false; });
                    });
                    item.append(copy, link);
                    list.appendChild(item);
                });
                setStatus(status, rows.length + ' ressource(s) disponible(s).');
            }).catch(function (error) {
                setStatus(status, error.message || 'Chargement des ressources impossible.', true);
            });
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
            if (!parsed || parsed.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(parsed.hostname.toLowerCase())) {
                setStatus(status, 'Le lien doit être une adresse Google Drive ou Google Docs en HTTPS.', true); return;
            }
            add.disabled = true;
            setStatus(status, 'Publication…');
            api(TABLE, { method: 'POST', prefer: 'return=minimal', body: {
                title: title.value.trim(), category: category.value.trim(), description: description.value.trim(),
                drive_url: parsed.href, status: 'approved'
            }}).then(function () {
                form.reset();
                setStatus(status, 'Carte publiée dans la rubrique 2.1.');
                loadPublished();
            }).catch(function (error) { setStatus(status, error.message || 'Publication impossible.', true); })
                .finally(function () { add.disabled = false; });
        });
        panel.appendChild(form);
        body.after(panel);
    }

    function init() {
        if (initialized) return;
        initialized = true;
        if (document.getElementById('guideModule8App')) return;
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
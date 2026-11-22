(function () {
    'use strict';

    var BUCKET = 'doctrine-candidate-cv';
    var MAX_SIZE = 10 * 1024 * 1024;
    var auth = window.DoctrineAuth;
    var requestId = 0;

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function apiHeaders(token, json) {
        var headers = { apikey: auth.key, Authorization: 'Bearer ' + token };
        if (json) headers['Content-Type'] = 'application/json';
        return headers;
    }

    function getCandidateId(token) {
        return fetch(auth.url.replace(/\/$/, '') + '/auth/v1/user', {
            headers: apiHeaders(token, false)
        }).then(function (response) {
            if (!response.ok) throw new Error('Session candidat indisponible.');
            return response.json();
        }).then(function (user) {
            if (!user || !user.id) throw new Error('Identifiant candidat indisponible.');
            return user.id;
        });
    }

    function apiError(response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
            throw new Error(body.message || body.error || 'Erreur Supabase (HTTP ' + response.status + ').');
        });
    }

    function createCard() {
        var body = document.querySelector('#modal-module6 .mod-body[data-mod="6"]');
        if (!body) return;
        var list = body.querySelector('.modal-list');
        if (!list) return;
        var card = body.querySelector('#module6CvCard');
        if (!card) {
            card = element('li', 'part-card module6-cv-card', '');
            card.id = 'module6CvCard';
            card.appendChild(element('div', 'section-title', '6.4. Dépôt de votre CV'));
            card.appendChild(element('p', '', 'Insérez votre CV réglementaire au format PDF. Il sera enregistré dans un espace privé Supabase et pourra être consulté par votre Officier Guide rattaché et par l’administration.'));
            var inputRow = element('div', 'align-row');
            var label = element('label', 'row-text module6-cv-label', 'Sélectionner votre CV (PDF, 10 Mo maximum)');
            label.htmlFor = 'module6CvFile';
            var newInput = document.createElement('input');
            newInput.type = 'file';
            newInput.id = 'module6CvFile';
            newInput.accept = 'application/pdf,.pdf';
            inputRow.append(label, newInput);
            var actionRow = element('div', 'align-row');
            actionRow.append(element('span', 'row-text', 'Transmission et validation du module 6'));
            var newButton = element('button', 'doc-link', 'Téléverser mon CV');
            newButton.id = 'module6CvUpload';
            newButton.type = 'button';
            actionRow.appendChild(newButton);
            var newStatus = element('p', 'module6-cv-status', 'Le dépôt de votre CV validera automatiquement le module 6.');
            newStatus.id = 'module6CvStatus';
            newStatus.setAttribute('role', 'status');
            newStatus.setAttribute('aria-live', 'polite');
            card.append(inputRow, actionRow, newStatus);
            list.appendChild(card);
        }

        var input = document.getElementById('module6CvFile');
        var button = document.getElementById('module6CvUpload');
        var status = document.getElementById('module6CvStatus');
        if (!input || !button || !status || button.dataset.cvBound === 'true') return;
        button.dataset.cvBound = 'true';

        button.addEventListener('click', function () {
            var file = input.files && input.files[0];
            if (!file) {
                status.textContent = 'Sélectionnez votre CV au format PDF avant de continuer.';
                status.classList.add('is-error');
                return;
            }
            if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
                status.textContent = 'Format refusé : seul un fichier PDF est accepté.';
                status.classList.add('is-error');
                return;
            }
            if (!file.size || file.size > MAX_SIZE) {
                status.textContent = 'Fichier trop volumineux : la taille maximale est de 10 Mo.';
                status.classList.add('is-error');
                return;
            }
            button.disabled = true;
            status.classList.remove('is-error', 'is-ok');
            status.textContent = 'Téléversement sécurisé du CV en cours…';
            var current = ++requestId;
            auth.jeton().then(function (token) {
                if (!token) throw new Error('Session expirée. Reconnectez-vous.');
                return getCandidateId(token).then(function (candidateId) {
                    var path = candidateId + '/cv.pdf';
                    return fetch(auth.url.replace(/\/$/, '') + '/storage/v1/object/' + BUCKET + '/' + path, {
                        method: 'POST',
                        headers: Object.assign(apiHeaders(token, false), {
                            'Content-Type': 'application/pdf',
                            'x-upsert': 'true',
                            'cache-control': '3600'
                        }),
                        body: file
                    }).then(function (response) {
                        if (!response.ok) return apiError(response);
                        return fetch(auth.url.replace(/\/$/, '') + '/rest/v1/doctrine_candidate_cvs?on_conflict=candidate_id', {
                            method: 'POST',
                            headers: Object.assign(apiHeaders(token, true), {
                                Prefer: 'resolution=merge-duplicates,return=minimal'
                            }),
                            body: JSON.stringify({
                                storage_path: path,
                                original_filename: file.name.slice(0, 255),
                                file_size: file.size,
                                mime_type: 'application/pdf'
                            })
                        }).then(function (metadataResponse) {
                            if (!metadataResponse.ok) return apiError(metadataResponse);
                            return true;
                        });
                    });
                });
            }).then(function () {
                if (current !== requestId) return;
                status.textContent = 'CV transmis avec succès. Module 6 validé automatiquement. Votre Officier Guide et l’administration peuvent maintenant le consulter.';
                status.classList.add('is-ok');
                input.value = '';
                button.textContent = 'Remplacer mon CV';
                button.disabled = false;
            }).catch(function (error) {
                if (current !== requestId) return;
                console.error('Dépôt du CV Module 6 impossible.', error);
                status.textContent = error.message || 'Dépôt impossible. Vérifiez votre connexion puis réessayez.';
                status.classList.add('is-error');
                button.disabled = false;
            });
        });

        loadExisting(card, input, button, status);
    }

    function loadExisting(card, input, button, status) {
        if (!auth) return;
        auth.jeton().then(function (token) {
            if (!token) return null;
            return fetch(auth.url.replace(/\/$/, '') + '/rest/v1/doctrine_candidate_cvs?select=original_filename,uploaded_at&limit=1', {
                headers: apiHeaders(token, false)
            }).then(function (response) {
                if (!response.ok) return apiError(response);
                return response.json();
            });
        }).then(function (rows) {
            if (!Array.isArray(rows) || !rows.length) return;
            status.textContent = 'CV déjà transmis : ' + rows[0].original_filename + '. Module 6 validé automatiquement le ' +
                new Date(rows[0].uploaded_at).toLocaleDateString('fr-FR') + '. Vous pouvez déposer une version actualisée si nécessaire.';
            status.classList.add('is-ok');
            button.textContent = 'Remplacer mon CV';
        }).catch(function (error) {
            console.warn('Vérification du CV déjà transmis impossible.', error);
        });
    }

    function initialize() {
        if (!auth) return;
        createCard();
        var body = document.querySelector('#modal-module6 .mod-body[data-mod="6"]');
        if (body) {
            var observer = new MutationObserver(function () { createCard(); });
            observer.observe(body, { childList: true, subtree: false });
        }
        document.addEventListener('doctrine:login', function () {
            createCard();
            var card = document.getElementById('module6CvCard');
            if (!card) return;
            loadExisting(card, document.getElementById('module6CvFile'),
                document.getElementById('module6CvUpload'), document.getElementById('module6CvStatus'));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();

(function () {
    'use strict';

    var retexForm = document.getElementById('retexForm');
    var signalementForm = document.getElementById('signalementForm');
    if (!retexForm || !signalementForm) return;

    function checked(form, name) {
        var el = form.querySelector('input[name="' + name + '"]:checked');
        return el ? el.value : null;
    }

    function setStatus(el, text, ok) {
        el.textContent = text;
        el.classList.toggle('is-ok', !!ok);
        el.classList.toggle('is-error', !ok && !!text);
    }

    function insertRow(table, row) {
        var auth = window.DoctrineAuth;
        if (!auth) return Promise.reject(new Error('auth'));
        return auth.jeton().then(function (token) {
            if (!token) throw new Error('session');
            return fetch(auth.url + '/rest/v1/' + table, {
                method: 'POST',
                headers: {
                    apikey: auth.key,
                    Authorization: 'Bearer ' + token,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify(row)
            });
        }).then(function (response) {
            if (response.ok) return;
            return response.json().catch(function () { return {}; }).then(function (body) {
                var err = new Error('HTTP ' + response.status);
                err.status = response.status;
                err.code = body && body.code;
                throw err;
            });
        });
    }

    function errorMessage(err) {
        if (err.message === 'session' || err.status === 401) return 'Session expirée : reconnectez-vous puis réessayez.';
        if (err.code === '23505') return 'Vous avez déjà transmis votre RETEX. Merci !';
        if (err.status === 404 || err.code === 'PGRST205') return 'Le service n’est pas encore configuré. Contactez l’administrateur.';
        if (err.status === 403) return 'Envoi refusé pour ce compte.';
        return 'Envoi impossible pour le moment. Réessayez plus tard.';
    }

    // --- 7.1 RETEX ---
    var retexStatus = document.getElementById('retexStatus');
    var retexSubmit = document.getElementById('retexSubmit');
    var retexEmail = document.getElementById('retexEmail');
    var retexSpecialty = document.getElementById('retexSpecialty');
    var specialtyValue = '';
    var requestId = 0;

    var retexCard = document.getElementById('retexCard');
    var retexHeading = retexCard.querySelector(':scope > p');
    var retexBadge = document.createElement('span');
    retexBadge.className = 'fiche-sent-badge';
    retexBadge.textContent = 'Retex déjà envoyé';
    retexBadge.hidden = true;
    retexHeading.appendChild(retexBadge);

    function toggleRetex() {
        if (!retexCard.classList.contains('is-sent')) return;
        var open = retexForm.hidden;
        retexForm.hidden = !open;
        retexHeading.setAttribute('aria-expanded', String(open));
    }
    retexHeading.addEventListener('click', toggleRetex);
    retexHeading.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleRetex();
        }
    });

    // Une fois le RETEX envoyé, la fiche devient un accordéon replié.
    function lockRetex(message) {
        retexForm.querySelectorAll('input, textarea').forEach(function (el) { el.disabled = true; });
        retexSubmit.disabled = true;
        setStatus(retexStatus, message, true);
        retexCard.classList.add('is-sent');
        retexForm.hidden = true;
        retexBadge.hidden = false;
        retexHeading.setAttribute('role', 'button');
        retexHeading.setAttribute('tabindex', '0');
        retexHeading.setAttribute('aria-expanded', 'false');
    }

    function unlockRetex() {
        retexForm.querySelectorAll('input, textarea').forEach(function (el) { el.disabled = false; });
        retexSubmit.disabled = false;
        retexCard.classList.remove('is-sent');
        retexForm.hidden = false;
        retexBadge.hidden = true;
        retexHeading.removeAttribute('role');
        retexHeading.removeAttribute('tabindex');
        retexHeading.removeAttribute('aria-expanded');
    }

    function refreshRetexProfile() {
        var auth = window.DoctrineAuth;
        if (!auth) return;
        var current = ++requestId;
        retexEmail.textContent = auth.email() || 'Non renseigné';
        specialtyValue = '';
        retexSpecialty.textContent = 'Non renseignée';
        unlockRetex();
        setStatus(retexStatus, '', true);

        auth.specialite().then(function (value) {
            if (current !== requestId) return;
            specialtyValue = value || '';
            retexSpecialty.textContent = specialtyValue || 'Non renseignée';
        }).catch(function () {});

        auth.jeton().then(function (token) {
            if (!token) return;
            return fetch(auth.url + '/rest/v1/doctrine_retex?select=id&limit=1', {
                headers: { apikey: auth.key, Authorization: 'Bearer ' + token }
            }).then(function (response) {
                if (!response.ok) return [];
                return response.json();
            }).then(function (rows) {
                if (current === requestId && rows.length) lockRetex('Vous avez déjà transmis votre RETEX. Merci !');
            });
        }).catch(function () {});
    }

    // « Tous les modules » est exclusif des choix individuels.
    retexForm.addEventListener('change', function (event) {
        var target = event.target;
        if (!target || target.name !== 'retex-modules' || !target.checked) return;
        var all = document.getElementById('retexAllModules');
        retexForm.querySelectorAll('input[name="retex-modules"]').forEach(function (el) {
            if (target === all ? el !== all : el === all) el.checked = false;
        });
    });

    retexForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var modules = Array.prototype.map.call(
            retexForm.querySelectorAll('input[name="retex-modules"]:checked'),
            function (el) { return el.value; }
        );
        var row = {
            specialty: specialtyValue || null,
            modules: modules,
            navigation: checked(retexForm, 'retex-navigation'),
            design: checked(retexForm, 'retex-design'),
            resources: checked(retexForm, 'retex-resources'),
            viewer: checked(retexForm, 'retex-viewer'),
            used_report: checked(retexForm, 'retex-report'),
            recommendation: checked(retexForm, 'retex-note'),
            comment: document.getElementById('retexComment').value.trim() || null
        };
        var empty = !modules.length && !row.navigation && !row.design && !row.resources &&
            !row.viewer && !row.used_report && !row.recommendation && !row.comment;
        if (empty) {
            setStatus(retexStatus, 'Renseignez au moins une réponse avant d’envoyer.', false);
            return;
        }
        retexSubmit.disabled = true;
        setStatus(retexStatus, 'Envoi en cours…', true);
        insertRow('doctrine_retex', row).then(function () {
            lockRetex('RETEX transmis. Merci pour ton retour !');
        }).catch(function (err) {
            retexSubmit.disabled = false;
            if (err.code === '23505') lockRetex(errorMessage(err));
            else setStatus(retexStatus, errorMessage(err), false);
        });
    });

    // --- 7.2 Signalement ---
    var sigStatus = document.getElementById('signalementStatus');
    var sigSubmit = document.getElementById('signalementSubmit');
    var sigDetails = document.getElementById('signalementDetails');
    var sigCount = document.getElementById('signalementCount');

    sigDetails.addEventListener('input', function () { sigCount.textContent = sigDetails.value.length; });

    signalementForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var type = document.getElementById('signalementType').value;
        var moduleId = document.getElementById('signalementModule').value;
        var details = sigDetails.value.trim();
        if (!type || !moduleId || !details) {
            setStatus(sigStatus, 'Renseignez le type d’incident, le module concerné et la description.', false);
            return;
        }
        sigSubmit.disabled = true;
        setStatus(sigStatus, 'Envoi en cours…', true);
        insertRow('doctrine_signalements', {
            incident_type: type,
            module_id: moduleId,
            resource: document.getElementById('signalementResource').value.trim() || null,
            details: details,
            priority: checked(signalementForm, 'signalement-priority') || 'Information'
        }).then(function () {
            signalementForm.reset();
            sigCount.textContent = '0';
            sigSubmit.disabled = false;
            setStatus(sigStatus, 'Compte-rendu transmis. Merci !', true);
        }).catch(function (err) {
            sigSubmit.disabled = false;
            setStatus(sigStatus, errorMessage(err), false);
        });
    });

    document.addEventListener('doctrine:login', refreshRetexProfile);
    document.addEventListener('doctrine:logout', function () {
        requestId++;
        retexForm.reset();
        signalementForm.reset();
        sigCount.textContent = '0';
        unlockRetex();
        setStatus(retexStatus, '', true);
        setStatus(sigStatus, '', true);
        retexEmail.textContent = 'Non renseigné';
        retexSpecialty.textContent = 'Non renseignée';
    });
    if (window.DoctrineAuth && window.DoctrineAuth.email()) refreshRetexProfile();
})();

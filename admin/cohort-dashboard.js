/* Tableau de bord global des candidats — Module Admin ANC. */
(function () {
    'use strict';

    var dialog = null;
    var statusNode = null;
    var groupsNode = null;
    var searchNode = null;
    var refreshButton = null;
    var trigger = null;
    var candidates = [];
    var periodDays = 30;
    var STALE_AFTER_DAYS = 14;

    function auth() { return window.DoctrineAuth; }
    function isAdmin() { return !!(auth() && typeof auth().estAdmin === 'function' && auth().estAdmin()); }

    function api(path, options) {
        return auth().jeton().then(function (token) {
            if (!token) throw new Error('Session expirée. Reconnectez-vous.');
            return fetch(auth().url.replace(/\/$/, '') + '/rest/v1/' + path, {
                method: options && options.method || 'GET',
                headers: {
                    apikey: auth().key,
                    Authorization: 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: options && options.body !== undefined ? JSON.stringify(options.body) : undefined
            });
        }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (payload) {
                if (!response.ok) throw new Error(payload.message || payload.details || 'Erreur HTTP ' + response.status);
                return payload;
            });
        });
    }

    function node(tag, className, text) {
        var item = document.createElement(tag);
        if (className) item.className = className;
        if (text !== undefined) item.textContent = text;
        return item;
    }

    function candidateName(candidate) {
        return [candidate.grade, candidate.name].filter(Boolean).join(' ') || candidate.email || 'Candidat';
    }

    function lastActivity(candidate) {
        return candidate.doctrine && candidate.doctrine.last_activity || '';
    }

    function relativeActivity(value) {
        if (!value) return 'Aucune activité enregistrée';
        var timestamp = Date.parse(value);
        if (!Number.isFinite(timestamp)) return 'Date inconnue';
        var days = Math.floor((Date.now() - timestamp) / 86400000);
        if (days <= 0) return 'Aujourd’hui';
        if (days === 1) return 'Hier';
        return 'Il y a ' + days + ' jours';
    }

    function periodResults(candidate) {
        var results = candidate.qcm && Array.isArray(candidate.qcm.results) ? candidate.qcm.results : [];
        var cutoff = periodDays > 0 ? Date.now() - periodDays * 86400000 : 0;
        return results.filter(function (result) {
            if (result.score === null || result.score === undefined || result.score === '') return false;
            var score = Number(result.score);
            var date = Date.parse(result.created_at || '');
            return Number.isFinite(score) && (!cutoff || (Number.isFinite(date) && date >= cutoff));
        });
    }

    function average(results) {
        var scores = results.map(function (result) { return Number(result.score); }).filter(Number.isFinite);
        return scores.length ? scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length : null;
    }

    // Critères identiques à ceux de l'espace Officier Guide.
    function candidateStatus(candidate) {
        var score = average(periodResults(candidate));
        var activity = Date.parse(lastActivity(candidate));
        var inactive = !Number.isFinite(activity) || Date.now() - activity > STALE_AFTER_DAYS * 86400000;
        if (score === null || score < 10 || inactive) return { key: 'difficulty', label: 'EN DIFFICULTÉ', score: score };
        if (score > 14) return { key: 'ready', label: 'PRÊT', score: score };
        return { key: 'watch', label: 'À SURVEILLER', score: score };
    }

    function productionSummary(candidate) {
        var submissions = candidate.doctrine && Array.isArray(candidate.doctrine.submissions)
            ? candidate.doctrine.submissions : [];
        var valid = new Set();
        var rework = new Set();
        submissions.forEach(function (submission) {
            if (submission.submission_type === 'support_oral') return;
            var review = (submission.reviews || [])[0];
            if (!review) return;
            if (review.status === 'valide') valid.add(String(submission.dossier));
            if (review.status === 'a_reprendre') rework.add(String(submission.dossier));
        });
        return { valid: Math.min(8, valid.size), rework: rework.size };
    }

    function createCandidateCard(candidate) {
        var status = candidateStatus(candidate);
        var production = productionSummary(candidate);
        var card = node('article', 'anc-cohort-candidate');
        var heading = node('div', 'anc-cohort-candidate-heading');
        heading.appendChild(node('strong', 'anc-cohort-name', candidateName(candidate.candidate || {})));
        heading.appendChild(node('span', 'anc-cohort-pill anc-cohort-pill-' + status.key, status.label));
        card.appendChild(heading);

        var meta = [
            candidate.candidate && candidate.candidate.unit,
            candidate.candidate && candidate.candidate.specialty,
            candidate.candidate && candidate.candidate.email
        ].filter(Boolean).join(' · ');
        card.appendChild(node('p', 'anc-cohort-meta', meta || 'Informations de profil incomplètes'));

        var score = status.score === null ? 'Aucune moyenne QCM' : status.score.toFixed(2) + ' / 20';
        var metrics = node('div', 'anc-cohort-metrics');
        [
            ['Moyenne QCM', score],
            ['Fiches validées', production.valid + ' / 8'],
            ['À reprendre', String(production.rework)],
            ['Dernière activité', relativeActivity(lastActivity(candidate))]
        ].forEach(function (entry) {
            var metric = node('div', 'anc-cohort-metric');
            metric.appendChild(node('span', '', entry[0]));
            metric.appendChild(node('strong', '', entry[1]));
            metrics.appendChild(metric);
        });
        card.appendChild(metrics);

        if (candidate.candidate && candidate.candidate.email) {
            var actions = node('div', 'anc-cohort-actions');
            var mail = node('a', 'anc-cohort-mail', 'Contacter le candidat');
            mail.href = 'mailto:' + candidate.candidate.email;
            actions.appendChild(mail);
            card.appendChild(actions);
        }
        return card;
    }

    function render() {
        if (!groupsNode) return;
        groupsNode.replaceChildren();
        var query = (searchNode.value || '').trim().toLocaleLowerCase('fr');
        var definitions = [
            { key: 'ready', title: 'Candidats PRÊTS', description: 'Résultats supérieurs à 14/20 et activité récente.' },
            { key: 'watch', title: 'Candidats À SURVEILLER', description: 'Résultats compris entre 10/20 et 14/20, avec activité récente.' },
            { key: 'difficulty', title: 'Candidats EN DIFFICULTÉ', description: 'Moyenne inférieure à 10/20, aucune moyenne disponible ou absence d’activité depuis plus de 14 jours.' }
        ];
        definitions.forEach(function (definition) {
            var matches = candidates.filter(function (candidate) {
                if (candidateStatus(candidate).key !== definition.key) return false;
                var identity = candidate.candidate || {};
                var text = [candidateName(identity), identity.email, identity.unit, identity.specialty].filter(Boolean).join(' ').toLocaleLowerCase('fr');
                return !query || text.indexOf(query) !== -1;
            });
            var group = node('details', 'anc-cohort-group anc-cohort-group-' + definition.key);
            group.open = definition.key !== 'ready';
            var summary = node('summary', 'anc-cohort-summary');
            summary.appendChild(node('span', '', definition.title));
            summary.appendChild(node('strong', 'anc-cohort-count', String(matches.length)));
            group.appendChild(summary);
            group.appendChild(node('p', 'anc-cohort-description', definition.description));
            var list = node('div', 'anc-cohort-list');
            if (!matches.length) list.appendChild(node('p', 'anc-cohort-empty', 'Aucun candidat dans cette catégorie.'));
            matches.forEach(function (candidate) { list.appendChild(createCandidateCard(candidate)); });
            group.appendChild(list);
            groupsNode.appendChild(group);
        });
        statusNode.textContent = candidates.length + ' candidat(s) recensé(s) — moyenne QCM calculée sur les ' +
            (periodDays ? periodDays + ' derniers jours' : 'toute la période') + '.';
    }

    function load() {
        statusNode.textContent = 'Chargement de l’ensemble des candidats…';
        refreshButton.disabled = true;
        return api('rpc/get_guide_candidate_dashboard', {
            method: 'POST',
            body: { p_candidate_id: null }
        }).then(function (result) {
            candidates = Array.isArray(result.candidates) ? result.candidates : [];
            render();
        }).catch(function (error) {
            statusNode.textContent = 'Impossible de charger les candidats : ' + error.message;
            groupsNode.replaceChildren();
        }).finally(function () {
            refreshButton.disabled = false;
        });
    }

    function close() {
        if (dialog) dialog.hidden = true;
        if (trigger && trigger.isConnected && !trigger.hidden) trigger.focus();
    }

    function openDashboard(source) {
        if (!isAdmin()) return;
        trigger = source || null;
        buildDialog();
        dialog.hidden = false;
        load();
    }

    function buildDialog() {
        if (dialog) return;
        dialog = node('div', 'anc-cohort-dialog');
        dialog.id = 'ancCohortDashboard';
        dialog.hidden = true;
        var panel = node('section', 'anc-cohort-panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'ancCohortTitle');
        var header = node('header', 'anc-cohort-header');
        var titleWrap = node('div');
        titleWrap.appendChild(node('p', 'anc-cohort-kicker', 'ADMINISTRATION ANC'));
        titleWrap.appendChild(node('h2', '', 'Suivi global des candidats'));
        titleWrap.lastChild.id = 'ancCohortTitle';
        titleWrap.appendChild(node('p', 'anc-cohort-subtitle', 'Vue transversale de tous les candidats, indépendamment de leur Officier Guide.'));
        header.appendChild(titleWrap);
        var closeButton = node('button', 'anc-cohort-close', 'Fermer');
        closeButton.type = 'button';
        closeButton.addEventListener('click', close);
        header.appendChild(closeButton);
        panel.appendChild(header);

        var controls = node('div', 'anc-cohort-controls');
        searchNode = node('input', 'anc-cohort-search');
        searchNode.type = 'search';
        searchNode.placeholder = 'Rechercher un candidat, une unité ou une spécialité…';
        searchNode.setAttribute('aria-label', 'Rechercher un candidat');
        searchNode.addEventListener('input', render);
        var period = node('select', 'anc-cohort-period');
        period.setAttribute('aria-label', 'Période de calcul de la moyenne QCM');
        [['30', '30 derniers jours'], ['7', '7 derniers jours'], ['0', 'Toute la période']].forEach(function (item) {
            period.add(new Option(item[1], item[0]));
        });
        period.addEventListener('change', function () {
            periodDays = Number(period.value);
            render();
        });
        controls.append(searchNode, period);
        panel.appendChild(controls);

        statusNode = node('p', 'anc-cohort-status', 'Prêt à charger.');
        statusNode.setAttribute('role', 'status');
        statusNode.setAttribute('aria-live', 'polite');
        panel.appendChild(statusNode);
        groupsNode = node('div', 'anc-cohort-groups');
        panel.appendChild(groupsNode);

        var footer = node('footer', 'anc-cohort-footer');
        refreshButton = node('button', 'anc-cohort-refresh', 'Actualiser les données');
        refreshButton.type = 'button';
        refreshButton.addEventListener('click', load);
        footer.appendChild(refreshButton);
        panel.appendChild(footer);
        dialog.appendChild(panel);
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) close();
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && !dialog.hidden) close();
        });
        document.body.appendChild(dialog);
    }

    function addToolbarButton() {
        if (!isAdmin()) return;
        document.querySelectorAll('.module-nav-controls').forEach(function (zone) {
            var button = zone.querySelector('.adm-cohort-toolbar');
            if (!button) {
                button = node('button', 'module-nav-button adm-cohort-toolbar', '👥 Cohorte');
                button.type = 'button';
                button.title = 'Suivi global de tous les candidats';
                button.addEventListener('click', function () { openDashboard(button); });
                zone.appendChild(button);
            }
            button.hidden = !isAdmin();

        });
    }

    function init() {
        addToolbarButton();
        document.addEventListener('doctrine:login', addToolbarButton);
        document.addEventListener('doctrine:logout', function () {
            if (dialog) dialog.hidden = true;
            document.querySelectorAll('.adm-cohort-toolbar').forEach(function (button) { button.hidden = true; });
        });
        var observer = new MutationObserver(addToolbarButton);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
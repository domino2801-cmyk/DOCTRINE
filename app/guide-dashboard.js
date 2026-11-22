/* Espace Officier Guide indépendant — ne modifie aucun module existant. */
(function () {
    'use strict';

    var root = null;
    var trigger = null;
    var statusNode = null;
    var metricsNode = null;
    var candidatesNode = null;
    var coursesNode = null;
    var searchNode = null;
    var candidates = [];
    var courses = [];
    var loading = false;

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
    function guideAccess() {
        if (!auth() || typeof auth().jeton !== 'function') return Promise.resolve(false);
        return auth().jeton().then(function (token) {
            var claims = token && decodeClaims(token);
            var meta = claims && claims.app_metadata || {};
            var role = String(meta.role || '').trim().toLowerCase();
            var specialty = String(meta.specialty || '').trim().toUpperCase();
            return !!(claims && claims.sub &&
                (role === 'guide' || role === 'officier_guide' || specialty === 'OG'));
        }).catch(function () { return false; });
    }
    function api(path, options) {
        options = options || {};
        return auth().jeton().then(function (token) {
            if (!token) throw new Error('Session expirée. Reconnectez-vous.');
            var headers = { apikey: auth().key, Authorization: 'Bearer ' + token };
            if (options.body !== undefined) headers['Content-Type'] = 'application/json';
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
    function attention(candidate) {
        var score = qcmAverage(candidate);
        var activity = Date.parse(candidate.doctrine && candidate.doctrine.last_activity || '');
        return score === null || score < 10 || !Number.isFinite(activity) || Date.now() - activity > 14 * 86400000;
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
    }
    function renderCandidates() {
        candidatesNode.replaceChildren();
        var term = String(searchNode.value || '').trim().toLocaleLowerCase('fr');
        var filtered = candidates.filter(function (candidate) {
            var identity = candidate.candidate || {};
            return [candidateName(candidate), identity.email, identity.unit, identity.specialty]
                .join(' ').toLocaleLowerCase('fr').indexOf(term) !== -1;
        });
        if (!filtered.length) {
            candidatesNode.append(node('p', 'og-dashboard-empty',
                candidates.length ? 'Aucun candidat ne correspond à cette recherche.' : 'Aucun candidat rattaché à votre cohorte.'));
            return;
        }
        filtered.forEach(function (candidate) {
            var identity = candidate.candidate || {};
            var card = node('details', 'og-dashboard-candidate');
            var summary = node('summary', 'og-dashboard-accordion-title');
            var title = node('span', 'og-dashboard-candidate-title', candidateName(candidate));
            var score = qcmAverage(candidate);
            var pill = node('span', 'og-dashboard-pill ' + (attention(candidate) ? 'is-warning' : 'is-ok'),
                attention(candidate) ? 'À ACCOMPAGNER' : 'SUIVI NORMAL');
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
            var admission = candidate.admission;
            if (admission && typeof admission === 'object' && Object.keys(admission).length) {
                var docs = node('details', 'og-dashboard-subaccordion');
                docs.append(node('summary', '', 'Dossier et documents demandés'));
                var list = node('dl', 'og-dashboard-document-list');
                Object.keys(admission).filter(function (key) {
                    return !['candidate_id', 'created_at', 'updated_at', 'id'].includes(key);
                }).forEach(function (key) {
                    var value = admission[key];
                    if (value === null || value === undefined || typeof value === 'object') return;
                    list.append(node('dt', '', key.replace(/_/g, ' ')), node('dd', '', String(value)));
                });
                if (!list.children.length) list.append(node('p', 'og-dashboard-muted', 'Aucun état de document renseigné.'));
                docs.append(list);
                body.append(docs);
            }
            card.append(body);
            candidatesNode.append(card);
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
        Promise.allSettled([candidateRequest, courseRequest]).then(function (results) {
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
            renderMetrics();
            renderCandidates();
            renderCourses();
            if (results.every(function (result) { return result.status === 'fulfilled'; })) {
                setStatus(candidates.length + ' candidat(s) suivi(s) · ' + courses.length + ' support(s) pédagogique(s) disponibles.');
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
        candidatesNode = node('div', 'og-dashboard-candidates');
        candidateSection.append(candidatesNode);
        panel.append(candidateSection);
        var courseSection = node('section', 'og-dashboard-section');
        courseSection.append(node('h3', '', 'Bibliothèque des 30 supports Officier Guide'));
        courseSection.append(node('p', 'og-dashboard-muted', 'Catalogue commun classé en six catégories. Les supports sont consultables et téléchargeables.'));
        coursesNode = node('div', 'og-dashboard-courses');
        courseSection.append(coursesNode);
        panel.append(courseSection);
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
        document.addEventListener('doctrine:login', updateTrigger);
        document.addEventListener('doctrine:logout', function () {
            if (root) root.hidden = true;
            var item = document.getElementById('guideDashboardNav');
            if (item) item.hidden = true;
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
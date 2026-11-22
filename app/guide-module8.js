(function () {
    'use strict';

    if (new URLSearchParams(window.location.search).get('embedded') === '1') {
        document.body.classList.add('is-embedded');
    }

    const GUIDE_ROLES = new Set(['guide', 'officier_guide']);
    const STALE_AFTER_DAYS = 14;
    const REVIEW_RUBRICS = {
        proposition: {
            label: 'Fiche de proposition',
            weight: 70,
            formLabel: '1. Forme, Présentation & Langue',
            contentLabel: 'Introduction, problématique, solutions et avis',
            criteria: [
                { key: 'form', label: '1. Forme, Présentation & Langue', max: 6, group: 'form' },
                { key: 'introduction', label: 'Introduction', max: 3, group: 'content' },
                { key: 'problematique_donnees', label: 'Problématique et données', max: 3, group: 'content' },
                { key: 'solutions', label: 'Solutions réalisables', max: 4, group: 'content' },
                { key: 'avis_conclusion', label: 'Avis et conclusion', max: 4, group: 'content' }
            ]
        },
        support_oral: {
            label: 'Fiche support oral',
            weight: 30,
            formLabel: 'Caractère opératoire et gabarit 5 cases',
            contentLabel: 'Introduction, argumentaire ID1/ID2/ID3 et conclusion',
            criteria: [
                { key: 'operatoire_forme', label: 'Caractère opératoire et gabarit 5 cases', max: 6, group: 'form' },
                { key: 'introduction', label: 'Introduction structurée en cinq points', max: 4, group: 'content' },
                { key: 'argumentaire', label: 'Argumentaire ID1 / ID2 / ID3 et preuves', max: 7, group: 'content' },
                { key: 'conclusion', label: 'Conclusion', max: 3, group: 'content' }
            ]
        }
    };
    const JURY_CHECKLISTS = {
        proposition: [
            { key: 'p_form_pages', label: 'Gabarit EM : timbre, destinataire réel (décideur), objet précis, références et pièces jointes.' },
            { key: 'p_form_header', label: 'Lisibilité : copie propre et aérée, titres soulignés et sauts de ligne.' },
            { key: 'p_form_references', label: 'Style impersonnel : aucun « je / nous / on » (expression au nom du bureau).' },
            { key: 'p_form_style', label: 'Langue et plagiat : phrases courtes (sujet-verbe-complément), orthographe soignée et aucune recopie mot pour mot du dossier.' },
            { key: 'p_intro_context', label: 'Préambule : fait générateur posé clairement, sans banalités.' },
            { key: 'p_intro_solution', label: 'Idée maîtresse : réponse engagée et justifiée (car / parce que), distincte de la simple description technique.' },
            { key: 'p_intro_plan', label: 'Annonce du plan : personnalisée et adaptée au sujet (pas de formule bateau).' },
            { key: 'p_problem_facts', label: 'Situation actuelle : synthèse factuelle, chiffrée et réglementaire (issue uniquement du dossier).' },
            { key: 'p_problem_level', label: 'Problématique : question centrale posée explicitement au bon niveau de commandement.' },
            { key: 'p_problem_criteria', label: 'Critères de choix : impératifs identifiés (délais, coût, légalité, efficacité, etc.).' },
            { key: 'p_solutions_three', label: 'Pertinence : trois solutions réalisables (ou deux solides), réalistes, légales et bien différenciées.' },
            { key: 'p_solutions_details', label: 'Caractérisation : chaque solution explique concrètement les moyens, coûts et délais.' },
            { key: 'p_solutions_risks', label: 'Triptyque rédigé : avantages, inconvénients et risques rédigés en phrases complètes.' },
            { key: 'p_opinion', label: 'Démonstration : choix justifié en croisant les solutions avec les critères de la partie 1, sans nouvel argument.' },
            { key: 'p_risk_mitigation', label: 'Maîtrise des risques : inconvénients relativisés et mesures concrètes pour limiter les risques.' },
            { key: 'p_conclusion', label: 'Conclusion et suites : idée maîtresse reformulée et actions immédiates pour initier la décision.' }
        ],
        support_oral: [
            { key: 'oral_operatoire', label: '1. Caractère opératoire et respect du gabarit des cinq cases (/6).' },
            { key: 'oral_introduction', label: '2. Introduction structurée selon les cinq points attendus (/4).' },
            { key: 'oral_argumentaire', label: '3. Argumentaire : articulation des ID1 / ID2 / ID3 et preuves vérifiables (/7).' },
            { key: 'oral_conclusion', label: '4. Conclusion cohérente avec l’argumentaire et orientée vers la décision ou les suites à donner (/3).' }
        ]
    };
    const JURY_CHECKLIST_SCORE_MAP = {
        proposition: {
            form: ['p_form_pages', 'p_form_header', 'p_form_references', 'p_form_style'],
            introduction: ['p_intro_context', 'p_intro_solution', 'p_intro_plan'],
            problematique_donnees: ['p_problem_facts', 'p_problem_level', 'p_problem_criteria'],
            solutions: ['p_solutions_three', 'p_solutions_details', 'p_solutions_risks'],
            avis_conclusion: ['p_opinion', 'p_risk_mitigation', 'p_conclusion']
        },
        support_oral: {
            operatoire_forme: ['oral_operatoire'],
            introduction: ['oral_introduction'],
            argumentaire: ['oral_argumentaire'],
            conclusion: ['oral_conclusion']
        }
    };
    const auth = window.DoctrineAuth;
    const nav = document.getElementById('guideModule8Nav');
    const app = document.getElementById('guideModule8App');
    const accessState = document.getElementById('guideAccessState');

    let candidates = [];
    let selectedCandidateId = '';
    let requestGeneration = 0;
    let aiCorrectionGeneration = 0;
    let reviewContextGeneration = 0;
    let reviewEditGeneration = 0;
    let activeReviewCandidate = null;
    let activeReviewSubmission = null;
    let savedReviewReport = null;
    let isAuthorized = false;
    let isAdminUser = false;
    let pageBindingsAttached = false;

    function rubricFor(submission) {
        return REVIEW_RUBRICS[submission?.submission_type] || REVIEW_RUBRICS.proposition;
    }

    function savedReviewFor(submission, overrideSubmission, overrideReview) {
        return overrideSubmission && submission?.id === overrideSubmission.id
            ? overrideReview
            : (submission?.reviews || [])[0];
    }

    function reviewGrade(review) {
        if (!review || review.grade === null || review.grade === undefined || review.grade === '') return null;
        const grade = Number(review.grade);
        return Number.isFinite(grade) && grade >= 0 && grade <= 20
            ? Math.round(grade * 100) / 100
            : null;
    }

    function weightedSynthesisGrade(submissions, dossier, overrideSubmission, overrideReview) {
        const dossierSubmissions = submissions.filter(function (submission) {
            return String(submission.dossier) === String(dossier);
        });
        const proposition = dossierSubmissions.find(function (submission) {
            return submission.submission_type !== 'support_oral';
        });
        const oralSupport = dossierSubmissions.find(function (submission) {
            return submission.submission_type === 'support_oral';
        });
        const propositionGrade = reviewGrade(savedReviewFor(proposition, overrideSubmission, overrideReview));
        const oralGrade = reviewGrade(savedReviewFor(oralSupport, overrideSubmission, overrideReview));
        if (propositionGrade === null || oralGrade === null) return null;
        return Math.round((propositionGrade * 0.7 + oralGrade * 0.3) * 100) / 100;
    }

    function decodeClaims(token) {
        try {
            const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(decodeURIComponent(escape(atob(payload))));
        } catch (error) {
            console.warn('Lecture des droits DOCTRINE impossible.', error);
            return null;
        }
    }

    async function currentAccess() {
        if (!auth || typeof auth.jeton !== 'function') return null;
        const token = await auth.jeton();
        if (!token) return null;
        const claims = decodeClaims(token);
        if (!claims) return null;
        const metadata = claims.app_metadata || {};
        const role = String(metadata.role || '').trim().toLowerCase();
        const specialty = String(metadata.specialty || '').trim().toUpperCase();
        const admin = role === 'admin' || metadata.bm4_admin === true ||
            metadata.bm4_admin === 'true' || metadata.bm4_admin === 1 || metadata.bm4_admin === '1';
        return {
            token: token,
            userId: claims.sub || '',
            allowed: admin || GUIDE_ROLES.has(role) || specialty === 'OG',
            isAdmin: admin,
            profile: metadata
        };
    }

    function updateNavigation(allowed) {
        if (!nav) return;
        nav.hidden = !allowed;
        if (!app) {
            document.dispatchEvent(new CustomEvent('doctrine:guide-access-change', {
                detail: { allowed: allowed }
            }));
        }
    }

    function setStatus(element, message, kind) {
        if (!element) return;
        element.textContent = message || '';
        element.classList.toggle('is-error', kind === 'error');
        element.classList.toggle('is-success', kind === 'success');
    }

    function apiUrl(path) {
        return auth.url.replace(/\/$/, '') + path;
    }

    async function api(path, options) {
        const token = await auth.jeton();
        if (!token) throw new Error('Session expirée. Connectez-vous à nouveau.');
        options = options || {};
        const headers = {
            apikey: auth.key,
            Authorization: 'Bearer ' + token
        };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';
        if (options.prefer) headers.Prefer = options.prefer;
        const response = await fetch(apiUrl(path), {
            method: options.method || 'GET',
            headers: headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body)
        });
        const payload = await response.json().catch(function () { return {}; });
        if (!response.ok) {
            const detail = payload.message || payload.msg || payload.error_description || payload.error;
            throw new Error(detail || 'Requête DOCTRINE refusée (HTTP ' + response.status + ').');
        }
        return payload;
    }

    function formatDate(value) {
        if (!value) return 'Non renseignée';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Non renseignée';
        return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }

    function relativeDate(value) {
        if (!value) return 'Aucune activité enregistrée';
        const timestamp = new Date(value).getTime();
        if (!Number.isFinite(timestamp)) return 'Date inconnue';
        const days = Math.round((timestamp - Date.now()) / 86400000);
        const relative = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });
        if (Math.abs(days) >= 1) return relative.format(days, 'day');
        const hours = Math.round((timestamp - Date.now()) / 3600000);
        if (Math.abs(hours) >= 1) return relative.format(hours, 'hour');
        const minutes = Math.round((timestamp - Date.now()) / 60000);
        return relative.format(minutes, 'minute');
    }

    function selectedPeriodResults(candidate) {
        const results = candidate.qcm && Array.isArray(candidate.qcm.results) ? candidate.qcm.results : [];
        const days = Number(document.getElementById('guidePeriodFilter')?.value || 30);
        const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
        return results.filter(function (result) {
            if (result.score === null || result.score === undefined || result.score === '') return false;
            const score = Number(result.score);
            const timestamp = Date.parse(result.created_at || '');
            return Number.isFinite(score) && (!cutoff || (Number.isFinite(timestamp) && timestamp >= cutoff));
        });
    }

    function average(results) {
        const scores = results.filter(function (result) {
            return result.score !== null && result.score !== undefined && result.score !== '';
        }).map(function (result) { return Number(result.score); }).filter(Number.isFinite);
        return scores.length ? scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length : null;
    }

    function proposalSubmissions(candidate) {
        const submissions = candidate.doctrine && Array.isArray(candidate.doctrine.submissions)
            ? candidate.doctrine.submissions : [];
        return submissions.filter(function (submission) {
            return submission.submission_type !== 'support_oral';
        });
    }

    function validDossierCount(candidate) {
        const valid = new Set();
        proposalSubmissions(candidate).forEach(function (submission) {
            const review = (submission.reviews || [])[0];
            if (review && review.status === 'valide') valid.add(String(submission.dossier));
        });
        return valid.size;
    }

    function reworkCount(candidate) {
        return new Set(proposalSubmissions(candidate).filter(function (submission) {
            const review = (submission.reviews || [])[0];
            return review && review.status === 'a_reprendre';
        }).map(function (submission) { return String(submission.dossier); })).size;
    }

    function candidateStatus(candidate) {
        const score = average(selectedPeriodResults(candidate));
        const lastActivity = Date.parse(candidate.doctrine?.last_activity || '');
        const inactive = !Number.isFinite(lastActivity) ||
            Date.now() - lastActivity > STALE_AFTER_DAYS * 86400000;
        if (score === null || score < 10 || inactive) {
            return { label: 'EN DIFFICULTÉ', className: 'guide-status-risk', score: score };
        }
        if (score > 14) return { label: 'PRÊT', className: 'guide-status-ready', score: score };
        return { label: 'À SURVEILLER', className: 'guide-status-watch', score: score };
    }

    function shouldShowRelaunch(candidate) {
        const lastActivity = Date.parse(candidate.doctrine?.last_activity || '');
        return !Number.isFinite(lastActivity) || Date.now() - lastActivity > 7 * 86400000;
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function candidateName(candidate) {
        return [candidate.grade, candidate.name].filter(Boolean).join(' ') || candidate.email || 'Candidat';
    }

    function candidateMeta(candidate) {
        return [candidate.unit, candidate.specialty, candidate.email].filter(Boolean).join(' · ');
    }

    function addCandidateCell(parent, candidate) {
        parent.appendChild(element('span', 'guide-person-name', candidateName(candidate)));
        parent.appendChild(element('span', 'guide-person-meta', candidateMeta(candidate) || 'Profil incomplet'));
    }

    function createActions(candidate) {
        const actions = element('div', 'guide-row-actions');
        const open = element('button', 'guide-button', 'Voir le dossier');
        open.type = 'button';
        open.addEventListener('click', function () { selectCandidate(candidate.candidate.id); });
        actions.appendChild(open);

        const email = candidate.candidate.email;
        const reminder = email && shouldShowRelaunch(candidate) ? element('a', 'guide-button', 'Relancer') : null;
        if (reminder) {
            reminder.href = 'mailto:' + encodeURIComponent(email) +
                '?subject=' + encodeURIComponent('Suivi de votre préparation BM4') +
                '&body=' + encodeURIComponent('Bonjour,\n\nJe vous contacte au sujet de votre préparation BM4.\n\nCordialement,');
            reminder.setAttribute('aria-label', 'Relancer ' + candidateName(candidate));
            actions.appendChild(reminder);
        }
        return actions;
    }

    function renderCandidateRow(candidate) {
        const status = candidateStatus(candidate);
        const row = document.createElement('tr');
        const identity = document.createElement('td');
        addCandidateCell(identity, candidate.candidate);
        const qcm = document.createElement('td');
        qcm.appendChild(element('span', 'guide-status-badge ' + status.className, status.label));
        qcm.appendChild(element('span', 'guide-score-line',
            (status.score === null ? 'Aucune moyenne' : status.score.toFixed(2) + ' / 20') +
            ' · Palier ' + String(candidate.qcm?.progress?.max_unlocked_questions || 10) + ' Q'));
        const productions = document.createElement('td');
        productions.appendChild(element('span', '', Math.min(8, validDossierCount(candidate)) + ' / 8 fiches validées'));
        const needsWork = reworkCount(candidate);
        productions.appendChild(element('span', 'guide-production-line',
            needsWork + ' fiche(s) à corriger'));
        const activity = document.createElement('td');
        activity.appendChild(element('span', 'guide-activity-line', relativeDate(candidate.doctrine?.last_activity)));
        const actionCell = document.createElement('td');
        actionCell.appendChild(createActions(candidate));
        row.append(identity, qcm, productions, activity, actionCell);
        return row;
    }

    function renderCandidateCard(candidate) {
        const status = candidateStatus(candidate);
        const card = element('article', 'guide-cohort-card');
        const identity = element('div');
        addCandidateCell(identity, candidate.candidate);
        card.appendChild(identity);
        const score = element('div');
        score.appendChild(element('span', 'guide-status-badge ' + status.className, status.label));
        score.appendChild(element('span', 'guide-score-line',
            (status.score === null ? 'Aucune moyenne' : status.score.toFixed(2) + ' / 20') +
            ' · Palier ' + String(candidate.qcm?.progress?.max_unlocked_questions || 10) + ' Q'));
        card.appendChild(score);
        card.appendChild(element('div', 'guide-production-line',
            Math.min(8, validDossierCount(candidate)) + ' / 8 fiches validées · ' + reworkCount(candidate) + ' à corriger'));
        card.appendChild(element('div', 'guide-activity-line',
            'Dernière activité : ' + relativeDate(candidate.doctrine?.last_activity)));
        card.appendChild(createActions(candidate));
        return card;
    }

    function filteredCandidates() {
        const selected = document.getElementById('guideCandidateFilter')?.value || '';
        return selected ? candidates.filter(function (candidate) {
            return candidate.candidate.id === selected;
        }) : candidates;
    }

    function renderCohort() {
        const rows = document.getElementById('guideCohortRows');
        const cards = document.getElementById('guideCohortCards');
        const empty = document.getElementById('guideEmptyCohort');
        if (!rows || !cards) return;
        rows.replaceChildren();
        cards.replaceChildren();
        const visible = filteredCandidates();
        visible.forEach(function (candidate) {
            rows.appendChild(renderCandidateRow(candidate));
            cards.appendChild(renderCandidateCard(candidate));
        });
        if (empty) empty.hidden = candidates.length > 0;
        const count = document.getElementById('guideCohortCount');
        if (count) count.textContent = candidates.length + (candidates.length > 1 ? ' candidats' : ' candidat');

        const allOption = document.getElementById('guideCandidateFilter')?.options[0];
        if (allOption) allOption.textContent = 'Tous mes candidats (' + candidates.length + ')';
        const detailSelect = document.getElementById('guideDetailCandidate');
        if (detailSelect) {
            const selected = selectedCandidateId;
            detailSelect.replaceChildren(new Option('— Choisir un candidat —', ''));
            candidates.forEach(function (candidate) {
                detailSelect.add(new Option(candidateName(candidate.candidate), candidate.candidate.id));
            });
            detailSelect.value = selected;
        }
        renderDetails();
    }

    function selectCandidate(candidateId) {
        selectedCandidateId = candidateId;
        const detailSelect = document.getElementById('guideDetailCandidate');
        const filter = document.getElementById('guideCandidateFilter');
        if (detailSelect) detailSelect.value = candidateId;
        if (filter) filter.value = '';
        renderCohort();
        document.getElementById('guideCandidateDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderProgress(candidate) {
        const container = document.getElementById('guideProgressModules');
        if (!container) return;
        container.replaceChildren();
        const doctrine = candidate.doctrine || {};
        const events = doctrine.progress_events || [];
        const submissions = doctrine.submissions || [];
        const documents = new Set((doctrine.documents || []).map(function (doc) {
            return doc.document_title;
        }).filter(Boolean)).size;
        const proposalCount = submissions.filter(function (item) { return item.submission_type !== 'support_oral'; }).length;
        const oralCount = submissions.filter(function (item) { return item.submission_type === 'support_oral'; }).length;
        const dossierCount = new Set(submissions.map(function (item) { return String(item.dossier); })).size;
        const corrections = new Set(events.filter(function (event) {
            return event.module_id === '4' && event.event_type === 'correction_accessible';
        }).map(function (event) { return String(event.dossier); })).size;
        const scores = (candidate.qcm?.results || []).map(function (result) {
            return Number(result.score);
        }).filter(Number.isFinite);
        const average = scores.length ? scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length : null;

        function eventFor(id) {
            return events.find(function (event) {
                return String(event.module_id) === String(id) && event.event_type === 'module_completed';
            }) || null;
        }
        function card(name, done, detail, date) {
            const item = element('article', 'guide-progress-card');
            item.classList.toggle('is-complete', Boolean(done));
            item.append(element('span', '', name));
            item.append(element('strong', '', done ? 'Validé' + (date ? ' · ' + formatDate(date) : '') : 'En cours'));
            if (detail) item.append(element('small', 'guide-progress-detail', detail));
            container.appendChild(item);
        }

        const module1 = eventFor(1);
        const module2 = eventFor(2);
        const module3 = eventFor(3);
        const module4 = eventFor(4);
        const module5 = eventFor(5);
        const module6 = eventFor(6);
        const module7 = eventFor(7);
        const cv = doctrine.candidate_cv;
        const retex = doctrine.retex;
        card('Module 1', Boolean(module1), 'Présentation lue et validation enregistrée', module1?.created_at);
        card('Module 2', Boolean(module2), documents + ' document(s) consulté(s)', module2?.created_at);
        card('Module 3', Boolean(module3), 'Validation à la première ouverture', module3?.created_at);
        card('Module 4', Boolean(module4) || dossierCount >= 2,
            dossierCount + ' dossier(s) avec fiche(s) transmise(s) · ' + corrections + ' corrigé(s) accessible(s)', module4?.created_at);
        card('Module 5', Boolean(module5) || (average !== null && average >= 13),
            average === null ? 'Aucun résultat QCM enregistré' : 'Moyenne QCM-MAJOR : ' + average.toFixed(2) + ' / 20',
            module5?.created_at);
        card('Module 6', Boolean(cv) || Boolean(module6),
            cv ? 'CV transmis le ' + formatDate(cv.uploaded_at) : 'CV en attente',
            module6?.created_at || cv?.uploaded_at);
        card('Module 7', Boolean(retex) || Boolean(module7),
            retex ? 'RETEX transmis le ' + formatDate(retex.created_at) : 'RETEX en attente',
            module7?.created_at || retex?.created_at);
        [
            ['Fiches de proposition', proposalCount + ' dépôt(s)'],
            ['Supports oraux', oralCount + ' dépôt(s)']
        ].forEach(function (entry) {
            const item = element('article', 'guide-progress-card');
            item.append(element('span', '', entry[0]), element('strong', '', entry[1]));
            container.appendChild(item);
        });
    }

    function renderSubmissions(candidate) {
        const container = document.getElementById('guideSubmissions');
        const count = document.getElementById('guideProductionCount');
        const alert = document.getElementById('guideReviewAlert');
        if (!container) return;
        container.replaceChildren();
        const submissions = candidate.doctrine?.submissions || [];
        const oralSupportCount = submissions.filter(function (submission) {
            return submission.submission_type === 'support_oral';
        }).length;
        if (count) count.textContent = Math.min(8, validDossierCount(candidate)) +
            ' / 8 propositions validées · ' + oralSupportCount + ' support(s) oral(aux) transmis';
        const needsWork = reworkCount(candidate);
        if (alert) {
            alert.hidden = needsWork === 0;
            alert.textContent = needsWork + ' fiche(s) à corriger.';
        }
        if (!submissions.length) {
            container.appendChild(element('p', 'guide-muted', 'Aucune fiche transmise.'));
            return;
        }
        submissions.forEach(function (submission) {
            const card = element('article', 'guide-submission-card');
            const description = element('div');
            const isOralSupport = submission.submission_type === 'support_oral';
            description.appendChild(element('strong', '', (isOralSupport ? 'Fiche support oral' : 'Fiche de proposition') +
                ' — Dossier ' + submission.dossier));
            const review = (submission.reviews || [])[0];
            const decision = review
                ? (review.status === 'valide' ? 'Validé' : review.status === 'a_reprendre' ? 'À reprendre' : 'En attente')
                    + (review.grade === null || review.grade === undefined ? '' : ' · ' + Number(review.grade).toFixed(2) + ' / 20')
                : 'En attente d’évaluation';
            description.appendChild(element('span', 'guide-review-label',
                formatDate(submission.created_at) + ' · ' + decision));
            if (!isOralSupport) {
                const weightedGrade = weightedSynthesisGrade(submissions, submission.dossier);
                const oralSubmission = submissions.find(function (candidateSubmission) {
                    return String(candidateSubmission.dossier) === String(submission.dossier)
                        && candidateSubmission.submission_type === 'support_oral';
                });
                const oralReview = (oralSubmission?.reviews || [])[0];
                const hasComponentGrade = reviewGrade(review) !== null || reviewGrade(oralReview) !== null;
                if (weightedGrade !== null || hasComponentGrade) {
                    description.appendChild(element('span', 'guide-review-label', weightedGrade === null
                        ? reviewGrade(review) === null
                            ? 'Synthèse pondérée 70/30 : note de la fiche de proposition manquante.'
                            : 'Synthèse pondérée 70/30 : note du support oral manquante.'
                        : 'Synthèse pondérée 70/30 : ' +
                            weightedGrade.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
                            ' / 20'));
                }
            }
            card.appendChild(description);
            const button = element('button', 'guide-button guide-button-primary',
                isOralSupport ? 'Ouvrir le support oral' : 'Ouvrir la fiche de proposition');
            button.type = 'button';
            button.disabled = !submission.storage_path;
            if (!submission.storage_path) button.title = 'Cette fiche a été transmise avant l’archivage des PDF.';
            button.addEventListener('click', function () { openSubmission(candidate, submission); });
            const actions = element('div', 'guide-row-actions');
            actions.appendChild(button);
            const reviewButton = element('button', 'guide-button', 'Évaluer');
            reviewButton.type = 'button';
            reviewButton.disabled = !submission.storage_path;
            reviewButton.addEventListener('click', function () { openReview(candidate, submission); });
            actions.appendChild(reviewButton);
            const aiButton = element('button', 'guide-button',
                isOralSupport ? 'Correction IA — Fichette orale' : 'Correction IA — Proposition');
            aiButton.type = 'button';
            aiButton.disabled = !submission.storage_path;
            aiButton.title = 'Analyser le document avec Google Gemini ; la proposition doit être vérifiée et validée par l’Officier Guide.';
            aiButton.addEventListener('click', function () {
                runAiCorrection(candidate, submission, aiButton);
            });
            actions.appendChild(aiButton);
            card.appendChild(actions);
            container.appendChild(card);
        });
    }

    function renderThemeHistory(candidate) {
        const container = document.getElementById('guideThemeHistory');
        const strengths = document.getElementById('guideStrengths');
        if (!container || !strengths) return;
        container.replaceChildren();
        strengths.replaceChildren();
        const results = selectedPeriodResults(candidate);
        const byTheme = new Map();
        results.forEach(function (result) {
            const score = Number(result.score);
            if (!Number.isFinite(score)) return;
            const theme = String(result.theme || 'Thème non renseigné');
            if (!byTheme.has(theme)) byTheme.set(theme, []);
            byTheme.get(theme).push(score);
        });
        const themes = Array.from(byTheme.entries()).map(function (entry) {
            return {
                name: entry[0],
                average: entry[1].reduce(function (sum, value) { return sum + value; }, 0) / entry[1].length,
                count: entry[1].length
            };
        }).sort(function (a, b) { return b.average - a.average; });
        if (!themes.length) {
            container.appendChild(element('p', 'guide-muted', 'Aucun résultat QCM pour la période sélectionnée.'));
            strengths.appendChild(element('span', 'guide-muted', 'Aucun point fort ou axe d’effort disponible.'));
            return;
        }
        themes.forEach(function (theme) {
            const row = element('div', 'guide-theme-row');
            row.appendChild(element('span', '', theme.name + ' · ' + theme.count + ' série(s)'));
            const track = element('div', 'guide-theme-track');
            const fill = element('div', 'guide-theme-fill');
            fill.style.width = Math.max(0, Math.min(100, theme.average * 5)) + '%';
            track.appendChild(fill);
            row.appendChild(track);
            row.appendChild(element('span', 'guide-theme-score', theme.average.toFixed(2) + ' / 20'));
            container.appendChild(row);
        });
        const best = themes.slice(0, 2);
        const effort = themes.slice(-2).reverse();
        best.forEach(function (theme) {
            strengths.appendChild(element('span', 'guide-theme-chip', 'Point fort · ' + theme.name + ' (' + theme.average.toFixed(1) + ')'));
        });
        effort.forEach(function (theme) {
            if (best.some(function (item) { return item.name === theme.name; })) return;
            strengths.appendChild(element('span', 'guide-theme-chip', 'À travailler · ' + theme.name + ' (' + theme.average.toFixed(1) + ')'));
        });
    }

    function renderAdmission(candidate) {
        const data = candidate.admission || {};
        const setValue = function (id, value) {
            const input = document.getElementById(id);
            if (input) input.value = value === null || value === undefined ? '' : value;
        };
        setValue('guideCcpmDate', data.ccpm_date);
        setValue('guideCcpmScore', data.ccpm_score);
        setValue('guideOralsDone', data.mock_orals_done ?? 0);
        setValue('guideOralsTarget', data.mock_orals_target ?? 4);
        setValue('guideNotes', data.guide_notes || '');
        const validated = document.getElementById('guideCcpmValidated');
        if (validated) validated.checked = Boolean(data.ccpm_validated);
        const nextOral = document.getElementById('guideNextOral');
        if (nextOral) {
            const date = data.next_oral_date ? new Date(data.next_oral_date) : null;
            nextOral.value = date && !Number.isNaN(date.getTime())
                ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                : '';
        }
    }

    function renderDetails() {
        const panel = document.getElementById('guideCandidateDetail');
        const candidate = candidates.find(function (item) {
            return item.candidate.id === selectedCandidateId;
        });
        if (!panel) return;
        panel.hidden = !candidate;
        if (!candidate) return;
        const title = document.getElementById('guideDetailTitle');
        const subtitle = document.getElementById('guideDetailSubtitle');
        if (title) title.textContent = candidateName(candidate.candidate);
        if (subtitle) subtitle.textContent = candidateMeta(candidate.candidate);

        const results = candidate.qcm?.results || [];
        const currentAverage = average(selectedPeriodResults(candidate));
        const mean = document.getElementById('guideAverage');
        if (mean) mean.textContent = currentAverage === null ? '—' : currentAverage.toFixed(2) + ' / 20';
        const now = Date.now();
        const current30 = average(results.filter(function (result) {
            const timestamp = Date.parse(result.created_at || '');
            return Number.isFinite(timestamp) && now - timestamp <= 30 * 86400000;
        }));
        const previous30 = average(results.filter(function (result) {
            const timestamp = Date.parse(result.created_at || '');
            return Number.isFinite(timestamp) && now - timestamp > 30 * 86400000 &&
                now - timestamp <= 60 * 86400000;
        }));
        const trend = document.getElementById('guideTrend');
        if (trend) trend.textContent = current30 === null || previous30 === null
            ? 'Données insuffisantes'
            : (current30 - previous30 >= 0 ? '+' : '') + (current30 - previous30).toFixed(2) + ' pt';
        const maxLevel = document.getElementById('guideMaxLevel');
        if (maxLevel) maxLevel.textContent = (candidate.qcm?.progress?.max_unlocked_questions || 10) + ' Q';
        renderThemeHistory(candidate);
        renderProgress(candidate);
        renderCandidateCv(candidate);
        renderSubmissions(candidate);
        renderAdmission(candidate);
    }

    async function renderCandidateCv(candidate) {
        const status = document.getElementById('guideCandidateCvStatus');
        const actions = document.getElementById('guideCandidateCvActions');
        if (!status || !actions) return;
        actions.replaceChildren();
        status.textContent = 'Vérification du dépôt du CV…';
        try {
            const rows = await api('/rest/v1/doctrine_candidate_cvs?select=storage_path,original_filename,file_size,uploaded_at&candidate_id=eq.' +
                encodeURIComponent(candidate.candidate.id) + '&limit=1');
            if (!rows.length) {
                status.textContent = 'Aucun CV déposé pour ce candidat. Le module 6 reste en attente de son CV.';
                const progressGrid = document.getElementById('guideProgressModules');
                if (progressGrid) {
                    progressGrid.querySelector('[data-module6-cv-progress]')?.remove();
                    const progressCard = element('article', 'guide-progress-card');
                    progressCard.dataset.module6CvProgress = 'true';
                    progressCard.append(element('span', '', 'Module 6'), element('strong', '', 'CV en attente'));
                    progressGrid.appendChild(progressCard);
                }
                return;
            }
            const cv = rows[0];
            status.textContent = 'CV reçu : ' + cv.original_filename + ' — déposé le ' +
                formatDate(cv.uploaded_at) + ' — ' + Math.ceil(Number(cv.file_size || 0) / 1024) + ' Ko.';
            const progressGrid = document.getElementById('guideProgressModules');
            if (progressGrid) {
                progressGrid.querySelector('[data-module6-cv-progress]')?.remove();
                const progressCard = element('article', 'guide-progress-card');
                progressCard.dataset.module6CvProgress = 'true';
                progressCard.append(element('span', '', 'Module 6'), element('strong', '', 'CV transmis — validé'));
                progressGrid.appendChild(progressCard);
            }
            const button = element('button', 'guide-button guide-button-primary', 'Consulter le CV (PDF)');
            button.type = 'button';
            button.addEventListener('click', async function () {
                button.disabled = true;
                try {
                    const path = cv.storage_path.split('/').map(encodeURIComponent).join('/');
                    const signed = await api('/storage/v1/object/sign/doctrine-candidate-cv/' + path, {
                        method: 'POST',
                        body: { expiresIn: 300 }
                    });
                    const signedUrl = signed.signedURL || signed.signedUrl;
                    if (!signedUrl) throw new Error('Lien sécurisé du CV indisponible.');
                    const tab = window.open('about:blank', '_blank');
                    if (!tab) throw new Error('Autorisez les fenêtres contextuelles pour consulter le CV.');
                    tab.opener = null;
                    tab.location.href = relativeStorageUrl(signedUrl);
                } catch (error) {
                    setStatus(status, error.message || 'Ouverture du CV impossible.', 'error');
                } finally {
                    button.disabled = false;
                }
            });
            actions.appendChild(button);
        } catch (error) {
            setStatus(status, error.message || 'Vérification du CV impossible.', 'error');
        }
    }

    async function loadDashboard() {
        const status = document.getElementById('guideStatus');
        const generation = ++requestGeneration;
        setStatus(status, 'Chargement de la cohorte…');
        try {
            const result = await api('/rest/v1/rpc/get_guide_candidate_dashboard', {
                method: 'POST',
                body: { p_candidate_id: null }
            });
            if (generation !== requestGeneration) return;
            candidates = Array.isArray(result.candidates) ? result.candidates : [];
            if (!candidates.some(function (candidate) { return candidate.candidate.id === selectedCandidateId; })) {
                selectedCandidateId = '';
            }
            if (result.guide) {
                const guideName = [result.guide.grade, result.guide.name].filter(Boolean).join(' ');
                const identity = document.getElementById('guideIdentityBadge');
                if (identity) identity.textContent = 'Guide : ' + (guideName || 'profil non renseigné');
            }
            renderCohort();
            setStatus(status, candidates.length ? '' : 'Aucun candidat rattaché à votre cohorte.');
        } catch (error) {
            if (generation !== requestGeneration) return;
            setStatus(status, error.message || 'Chargement de la cohorte impossible.', 'error');
        }
    }

    function activateTab(tabName) {
        document.querySelectorAll('[data-guide-tab]').forEach(function (button) {
            const active = button.dataset.guideTab === tabName;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        });
        document.querySelectorAll('[data-guide-panel]').forEach(function (panel) {
            const active = panel.dataset.guidePanel === tabName;
            panel.classList.toggle('is-active', active);
            panel.hidden = !active;
        });
    }

    function relativeStorageUrl(signedUrl) {
        if (/^https?:\/\//i.test(signedUrl)) return signedUrl;
        if (signedUrl.startsWith('/storage/v1/')) return new URL(signedUrl, auth.url).href;
        if (signedUrl.startsWith('/object/')) return new URL('/storage/v1' + signedUrl, auth.url).href;
        if (signedUrl.startsWith('object/')) return new URL('/storage/v1/' + signedUrl, auth.url).href;
        return new URL(signedUrl, auth.url).href;
    }

    async function openSubmission(candidate, submission) {
        const status = document.getElementById('guideStatus');
        try {
            const path = submission.storage_path.split('/').map(encodeURIComponent).join('/');
            const signed = await api('/storage/v1/object/sign/candidate-fiches/' + path, {
                method: 'POST',
                body: { expiresIn: 300 }
            });
            const signedUrl = signed.signedURL || signed.signedUrl;
            if (!signedUrl) throw new Error('URL PDF signée manquante dans la réponse Storage.');
            const viewer = window.parent !== window && window.parent.DoctrineViewer
                ? window.parent.DoctrineViewer
                : window.DoctrineViewer;
            if (!viewer || typeof viewer.openSignedPdf !== 'function') {
                throw new Error('La visionneuse PDF est indisponible. Rechargez la page.');
            }
            const title = candidateName(candidate.candidate) + ' — ' +
                (submission.submission_type === 'support_oral' ? 'Support oral' : 'Fiche de proposition') +
                ' — Dossier ' + submission.dossier;
            await viewer.openSignedPdf(relativeStorageUrl(signedUrl), title, '8');
            setStatus(status, '');
        } catch (error) {
            setStatus(status, error.message || 'Ouverture sécurisée du PDF impossible.', 'error');
        }
    }

    function renderReviewCriteria(submission, review) {
        const container = document.getElementById('guideReviewCriteria');
        const notice = document.getElementById('guideReviewLegacyNotice');
        if (!container) return;
        const rubric = rubricFor(submission);
        const scores = review?.rubric_scores && typeof review.rubric_scores === 'object'
            ? review.rubric_scores
            : {};
        container.replaceChildren();
        rubric.criteria.forEach(function (criterion) {
            const label = element('label', 'guide-review-criterion');
            label.appendChild(element('span', '', criterion.label + ' — /' + criterion.max));
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.max = String(criterion.max);
            input.step = '0.01';
            input.required = true;
            input.dataset.rubricScore = criterion.key;
            input.setAttribute('aria-label', criterion.label + ' sur ' + criterion.max);
            const savedScore = Number(scores[criterion.key]);
            if (scores[criterion.key] !== undefined && Number.isFinite(savedScore) &&
                savedScore >= 0 && savedScore <= criterion.max) {
                input.value = String(savedScore);
            }
            label.appendChild(input);
            container.appendChild(label);
        });
        if (notice) {
            const isLegacyReview = reviewGrade(review) !== null && Object.keys(scores).length === 0;
            notice.hidden = !isLegacyReview;
            notice.textContent = isLegacyReview
                ? 'Cette évaluation antérieure ne contient pas le détail de la grille. Renseignez les critères ci-dessus pour la mettre à jour.'
                : '';
        }
        const weight = document.getElementById('guideReviewWeight');
        if (weight) {
            weight.textContent = 'Cette fiche compte pour ' + rubric.weight +
                ' % de la synthèse BM4 ; l’autre fiche doit également être évaluée pour calculer la moyenne pondérée.';
        }
    }

    function automaticJuryChecklist(submission, rubricScores) {
        const type = submission?.submission_type || 'proposition';
        const checklist = JURY_CHECKLISTS[type] || JURY_CHECKLISTS.proposition;
        const scoreMap = JURY_CHECKLIST_SCORE_MAP[type] || {};
        const rubric = REVIEW_RUBRICS[type] || REVIEW_RUBRICS.proposition;
        const result = {};
        checklist.forEach(function (item) { result[item.key] = false; });
        rubric.criteria.forEach(function (criterion) {
            const rawScore = rubricScores?.[criterion.key];
            if (rawScore === undefined || rawScore === null || rawScore === '') return;
            const score = Number(rawScore);
            if (!Number.isFinite(score) || score < 0 || score > criterion.max) return;
            if (score >= criterion.max * 0.75) {
                (scoreMap[criterion.key] || []).forEach(function (key) {
                    result[key] = true;
                });
            }
        });
        return result;
    }

    function syncAutomaticJuryChecklist() {
        if (!activeReviewSubmission) return;
        const totals = collectReviewScores();
        const suggested = automaticJuryChecklist(activeReviewSubmission, totals.rubricScores);
        const container = document.getElementById('guideJuryChecklistItems');
        if (!container) return;
        container.querySelectorAll('[data-jury-checklist]').forEach(function (input) {
            if (input.dataset.juryManual === 'true') return;
            input.checked = suggested[input.dataset.juryChecklist] === true;
        });
    }

    function renderJuryChecklist(submission, review) {
        const container = document.getElementById('guideJuryChecklistItems');
        if (!container) return;
        const checklist = JURY_CHECKLISTS[submission?.submission_type] || JURY_CHECKLISTS.proposition;
        const saved = review?.jury_checklist && typeof review.jury_checklist === 'object'
            ? review.jury_checklist
            : {};
        // Ignore les anciennes clés de sous-points oraux : seules les clés
        // du référentiel actuellement affiché peuvent restaurer un état manuel.
        const hasSavedChecklist = checklist.some(function (item) {
            return Object.prototype.hasOwnProperty.call(saved, item.key);
        });
        const initial = hasSavedChecklist
            ? saved
            : automaticJuryChecklist(submission, review?.rubric_scores || {});
        container.replaceChildren();
        checklist.forEach(function (item) {
            const label = element('label', 'guide-jury-check-item');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.juryChecklist = item.key;
            input.checked = initial[item.key] === true;
            if (hasSavedChecklist) input.dataset.juryManual = 'true';
            input.addEventListener('change', function () {
                input.dataset.juryManual = 'true';
            });
            input.setAttribute('aria-label', item.label);
            label.append(input, element('span', '', item.label));
            container.appendChild(label);
        });
    }

    function collectJuryChecklist(submission) {
        const type = submission?.submission_type;
        const allowedItems = JURY_CHECKLISTS[type];
        const container = document.getElementById('guideJuryChecklistItems');
        const checklist = {};
        if (!allowedItems || !container) return checklist;
        const allowedKeys = new Set(allowedItems.map(function (item) { return item.key; }));
        container.querySelectorAll('[data-jury-checklist]').forEach(function (input) {
            const key = input.dataset.juryChecklist;
            if (allowedKeys.has(key)) checklist[key] = input.checked;
        });
        return checklist;
    }

    function collectReviewScores() {
        const rubric = rubricFor(activeReviewSubmission);
        const rubricScores = {};
        let formGrade = 0;
        let contentGrade = 0;
        let complete = true;
        rubric.criteria.forEach(function (criterion) {
            const input = document.querySelector('[data-rubric-score="' + criterion.key + '"]');
            const value = input?.value ?? '';
            if (value === '') {
                complete = false;
                return;
            }
            const score = Number(value);
            if (!Number.isFinite(score) || score < 0 || score > criterion.max) {
                complete = false;
                return;
            }
            rubricScores[criterion.key] = score;
            if (criterion.group === 'form') formGrade += score;
            else contentGrade += score;
        });
        return {
            rubricScores: rubricScores,
            formGrade: Math.round(formGrade * 100) / 100,
            contentGrade: Math.round(contentGrade * 100) / 100,
            grade: Math.round((formGrade + contentGrade) * 100) / 100,
            complete: complete && Object.keys(rubricScores).length === rubric.criteria.length
        };
    }

    function openReview(candidate, submission) {
        const generation = ++aiCorrectionGeneration;
        reviewContextGeneration += 1;
        reviewEditGeneration = 0;
        activeReviewCandidate = candidate;
        activeReviewSubmission = submission;
        const dialog = document.getElementById('guideReviewDialog');
        const title = document.getElementById('guideReviewTitle');
        const reviewStatus = document.getElementById('guideReviewStatus');
        const aiResult = document.getElementById('guideAiCorrectionResult');
        const review = (submission.reviews || [])[0] || {};
        const rubric = rubricFor(submission);
        if (title) title.textContent = candidateName(candidate.candidate) + ' — ' +
            rubric.label + ' — Dossier ' + submission.dossier;
        document.getElementById('guideReviewSubmissionId').value = submission.id;
        renderReviewCriteria(submission, review);
        renderJuryChecklist(submission, review);
        document.querySelectorAll('[data-rubric-score]').forEach(function (input) {
            input.addEventListener('input', syncAutomaticJuryChecklist);
        });
        if (aiResult) {
            aiResult.replaceChildren();
            aiResult.hidden = true;
        }
        document.getElementById('guideReviewDecision').value = review.status === 'a_reprendre' ? 'a_reprendre' : 'valide';
        document.getElementById('guideReviewComment').value = review.comment || '';
        savedReviewReport = review.status === 'valide' && review.reviewed_at
            ? createReviewReport(candidate, submission, review, review.reviewed_at)
            : null;
        const downloadButton = document.getElementById('guideDownloadReview');
        if (downloadButton) downloadButton.hidden = !savedReviewReport || !savedReviewReport.evaluations.length;
        const finalExportButton = document.getElementById('guideExportFinalCandidate');
        if (finalExportButton) finalExportButton.hidden = !savedReviewReport || savedReviewReport.weightedGrade === null;
        const saveButton = document.querySelector('#guideReviewForm button[type="submit"]');
        if (saveButton) saveButton.disabled = false;
        updateFinalGrade();
        setStatus(reviewStatus, '');
        if (dialog && !dialog.open) dialog.showModal();
        return generation;
    }

    function aiCriteriaForDisplay(suggestion) {
        const criteria = Array.isArray(suggestion.criteria) ? suggestion.criteria.slice() : [];
        if (suggestion.submission_type !== 'support_oral') return criteria;

        const operatoire = suggestion.oral_operatoire || {
            label: 'Caractère opératoire et respect du gabarit en 5 cases',
            grade: suggestion.form_grade,
            max_grade: 6,
            observation: suggestion.form_observations,
            evidence: suggestion.form_evidence
        };
        const alreadyIncluded = criteria.some(function (criterion) {
            return criterion.label === operatoire.label ||
                criterion.label === 'Caractère opératoire et gabarit 5 cases' ||
                criterion.label === 'Caractère opératoire et respect du gabarit en 5 cases';
        });
        return alreadyIncluded ? criteria : [operatoire].concat(criteria);
    }

    function formatAiFeedback(suggestion) {
        const isOral = suggestion.submission_type === 'support_oral';
        const lines = [
            ...(isOral ? [] : [
                '1. Forme, Présentation & Langue : ' + suggestion.form_grade + ' / 6 — ' + suggestion.form_observations +
                    ' — Indice : ' + (suggestion.form_evidence || 'non repéré')
            ]),
            ...aiCriteriaForDisplay(suggestion).map(function (criterion) {
                return criterion.label + ' : ' + criterion.grade + ' / ' + criterion.max_grade +
                    ' — ' + criterion.observation + ' — Indice : ' + (criterion.evidence || 'non repéré');
            }),
            'Points forts : ' + (suggestion.strengths.length ? suggestion.strengths.join('; ') : 'non précisés'),
            'Axes de progrès : ' + (suggestion.improvements.length ? suggestion.improvements.join('; ') : 'non précisés'),
            'Synthèse : ' + suggestion.overall_comment,
            ...(isOral
                ? ['Comparaison avec la fiche écrite : ' + (suggestion.anti_copy_analysis || 'Non renseignée')]
                : [])
        ];
        return lines.join('\n');
    }

    function markReviewDirty() {
        reviewEditGeneration += 1;
        savedReviewReport = null;
        const downloadButton = document.getElementById('guideDownloadReview');
        if (downloadButton) downloadButton.hidden = true;
        const finalExportButton = document.getElementById('guideExportFinalCandidate');
        if (finalExportButton) finalExportButton.hidden = true;
    }

    function renderAiCorrection(suggestion) {
        const panel = document.getElementById('guideAiCorrectionResult');
        const status = document.getElementById('guideReviewStatus');
        if (!panel) return;
        panel.replaceChildren();
        panel.hidden = false;
        panel.appendChild(element('h3', '', suggestion.submission_type === 'support_oral'
            ? 'Proposition de correction IA — Fichette orale'
            : 'Proposition de correction IA — Fiche de proposition'));

        if (!suggestion.readable) {
            panel.appendChild(element('p', 'guide-ai-disclaimer',
                'Aucune note n’a été reprise : le document doit être vérifié manuellement.'));
            panel.appendChild(element('p', '', suggestion.limitations || 'Le document est incomplet ou illisible.'));
            return;
        }

        const criteria = element('ul', 'guide-ai-criteria');
        aiCriteriaForDisplay(suggestion).forEach(function (criterion) {
            const item = element('li', 'guide-ai-criterion-card');
            item.appendChild(element('strong', 'guide-ai-criterion-title', criterion.label + ' — ' +
                criterion.grade + ' / ' + criterion.max_grade));
            item.appendChild(element('p', 'guide-ai-criterion-observation',
                criterion.observation || 'Observation non renseignée.'));
            if (criterion.evidence) {
                item.appendChild(element('p', 'guide-ai-criterion-evidence',
                    'Indice à vérifier : ' + criterion.evidence));
            }
            criteria.appendChild(item);
        });
        panel.append(
            element('p', 'guide-ai-disclaimer',
                'Suggestion non enregistrée. Vérifiez la fiche et les notes avant de valider.'),
            element('p', '', (suggestion.submission_type === 'support_oral' ? 'Note du premier critère : ' : 'Note de forme : ') +
                suggestion.form_grade + ' / 6 · Autres critères : ' +
                suggestion.content_grade + ' / ' + (suggestion.content_max_grade || 14) +
                ' · Fiabilité estimée : ' + suggestion.confidence),
            ...(suggestion.submission_type === 'support_oral' ? [] : [
                element('h4', '', '1. Forme, Présentation & Langue — ' + suggestion.form_grade + ' / 6'),
                element('p', '', suggestion.form_observations),
                element('p', 'guide-ai-evidence', 'Indice à vérifier : ' + (suggestion.form_evidence || 'non repéré'))
            ]),
            criteria,
            ...(suggestion.submission_type === 'support_oral' ? [
                element('h4', '', 'Comparaison avec la fiche écrite'),
                element('p', 'guide-ai-disclaimer', suggestion.reference_written_found
                    ? (suggestion.anti_copy_analysis || 'Comparaison réalisée ; aucun détail fourni.')
                    : 'Aucune fiche écrite archivée exploitable : la comparaison anti-copier-coller n’a pas pu être réalisée.')
            ] : []),
            element('h4', '', 'Points forts'),
            element('p', '', suggestion.strengths.length ? suggestion.strengths.join(' · ') : 'Non précisés'),
            element('h4', '', 'Axes de progrès'),
            element('p', '', suggestion.improvements.length ? suggestion.improvements.join(' · ') : 'Non précisés'),
            element('p', '', suggestion.overall_comment)
        );

        const addCommentButton = element('button', 'guide-button', 'Ajouter la synthèse aux commentaires');
        addCommentButton.type = 'button';
        addCommentButton.addEventListener('click', function () {
            const comment = document.getElementById('guideReviewComment');
            const feedback = formatAiFeedback(suggestion);
            const prefix = comment.value.trim() ? comment.value.trim() + '\n\n' : '';
            if (prefix.length + feedback.length > comment.maxLength) {
                setStatus(status, 'La synthèse dépasse la limite de commentaires. Raccourcissez-la avant de l’ajouter.', 'error');
                return;
            }
            comment.value = prefix + feedback;
            markReviewDirty();
            comment.focus();
            setStatus(status, 'Synthèse ajoutée. Relisez et modifiez le commentaire avant l’enregistrement.', 'success');
        });
        panel.appendChild(addCommentButton);
    }

    async function runAiCorrection(candidate, submission, button) {
        const generation = openReview(candidate, submission);
        const status = document.getElementById('guideReviewStatus');
        const panel = document.getElementById('guideAiCorrectionResult');
        const dialog = document.getElementById('guideReviewDialog');
        const saveButton = document.querySelector('#guideReviewForm button[type="submit"]');
        if (button) button.disabled = true;
        if (saveButton) saveButton.disabled = true;
        if (panel) {
            panel.replaceChildren(element('p', '', 'Analyse du PDF par Google Gemini…'));
            panel.hidden = false;
        }
        if (submission.submission_type !== 'proposition' && submission.submission_type !== 'support_oral') {
            if (panel) panel.hidden = true;
            if (button) button.disabled = false;
            if (saveButton) saveButton.disabled = false;
            setStatus(status, 'La correction IA est réservée aux fiches de proposition et aux fichette(s) orales.', 'error');
            return;
        }
        setStatus(status, submission.submission_type === 'support_oral'
            ? 'La fichette orale est transmise à Google Gemini pour préparer une proposition de correction.'
            : 'La fiche de proposition est transmise à Google Gemini pour préparer une proposition de correction.');
        try {
            const suggestion = await api('/functions/v1/correct-fiche-ai', {
                method: 'POST',
                body: { submission_id: submission.id }
            });
            if (generation !== aiCorrectionGeneration || !dialog.open ||
                document.getElementById('guideReviewSubmissionId').value !== submission.id) return;
            if (suggestion.readable) {
                const formCriterion = rubricFor(submission).criteria.find(function (criterion) {
                    return criterion.group === 'form';
                });
                const formInput = formCriterion
                    ? document.querySelector('[data-rubric-score="' + formCriterion.key + '"]')
                    : null;
                if (formInput) formInput.value = String(suggestion.form_grade);
                rubricFor(submission).criteria.filter(function (criterion) {
                    return criterion.group === 'content';
                }).forEach(function (criterion, index) {
                    const input = document.querySelector('[data-rubric-score="' + criterion.key + '"]');
                    const suggestedCriterion = suggestion.criteria[index];
                    if (input && suggestedCriterion) input.value = String(suggestedCriterion.grade);
                });
                markReviewDirty();
                updateFinalGrade();
            }
            renderAiCorrection(suggestion);
            setStatus(status, suggestion.readable
                ? 'Proposition générée. Vérifiez les critères, la comparaison éventuelle et confirmez ou modifiez les notes.'
                : 'Le PDF ne peut pas être évalué automatiquement. Vérifiez-le manuellement.',
            suggestion.readable ? 'success' : 'error');
        } catch (error) {
            if (generation !== aiCorrectionGeneration || !dialog.open) return;
            if (panel) panel.hidden = true;
            setStatus(status, error.message || 'Correction IA impossible.', 'error');
        } finally {
            if (button) button.disabled = false;
            if (generation === aiCorrectionGeneration && saveButton) saveButton.disabled = false;
        }
    }

    function updateFinalGrade() {
        const totals = collectReviewScores();
        const formGrade = document.getElementById('guideFormGrade');
        const contentGrade = document.getElementById('guideContentGrade');
        if (formGrade) formGrade.value = totals.complete ? String(totals.formGrade) : '';
        if (contentGrade) contentGrade.value = totals.complete ? String(totals.contentGrade) : '';
        const output = document.getElementById('guideFinalGrade');
        if (output) output.textContent = totals.complete
            ? totals.grade.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' / 20'
            : 'À compléter / 20';
    }

    function extractFeedbackSection(comment, label, nextLabels) {
        const source = String(comment || '')
            // Normalise les retours à la ligne enregistrés littéralement sous la forme « \n ».
            .replace(/\\r\\n|\\n|\\r/g, '\n');
        const startPattern = new RegExp('(?:^|\n)' + label + '\\s*:\\s*', 'i');
        const match = startPattern.exec(source);
        if (!match) return '';
        const tail = source.slice(match.index + match[0].length);
        const stopLabels = [...nextLabels, 'Comparaison avec la fiche écrite'];
        const stop = new RegExp('\n(?:' + stopLabels.join('|') + ')\\s*:', 'i').exec(tail);
        return (stop ? tail.slice(0, stop.index) : tail).trim();
    }

    function criterionObservation(comment, label) {
        const line = String(comment || '').split(/\r?\n/).find(function (item) {
            return item.trim().toLowerCase().startsWith(String(label || '').trim().toLowerCase() + ' :');
        });
        if (!line) return '';
        const separator = line.indexOf(' — ');
        return separator >= 0 ? line.slice(separator + 3).trim() : '';
    }

    function createReviewReport(candidate, submission, review, reviewedAt) {
        const guideBadge = document.getElementById('guideIdentityBadge');
        const submissions = (candidate.doctrine?.submissions || []).filter(function (item) {
            return String(item.dossier) === String(submission.dossier) &&
                (item.submission_type === 'proposition' || item.submission_type === 'support_oral');
        });
        const evaluations = submissions.map(function (item) {
            const saved = item.id === submission.id ? review : (item.reviews || [])[0];
            if (!saved || saved.status !== 'valide' || reviewGrade(saved) === null) return null;
            const rubric = rubricFor(item);
            return {
                type: item.submission_type,
                label: rubric.label,
                grade: reviewGrade(saved),
                rubricScores: saved.rubric_scores || {},
                criteria: rubric.criteria,
                juryChecklist: (JURY_CHECKLISTS[item.submission_type] || []).map(function (checklistItem) {
                    return {
                        key: checklistItem.key,
                        label: checklistItem.label,
                        checked: Boolean(saved.jury_checklist && saved.jury_checklist[checklistItem.key])
                    };
                }),
                comment: saved.comment || '',
                reviewedAt: saved.reviewed_at || reviewedAt || new Date().toISOString()
            };
        }).filter(Boolean);
        const proposition = evaluations.find(function (item) { return item.type === 'proposition'; });
        const oral = evaluations.find(function (item) { return item.type === 'support_oral'; });
        const weightedGrade = proposition && oral
            ? Math.round((proposition.grade * 0.7 + oral.grade * 0.3) * 100) / 100
            : null;
        // Les points forts restent rattachés à leur fiche d'origine :
        // fiche de proposition (fiche DR) et fichette orale sont présentées séparément.
        const propositionStrengths = proposition
            ? extractFeedbackSection(proposition.comment, 'Points forts', ['Axes de progrès', 'Axes d’amélioration'])
            : '';
        const oralStrengths = oral
            ? extractFeedbackSection(oral.comment, 'Points forts', ['Axes de progrès', 'Axes d’amélioration'])
            : '';
        const strengths = [
            propositionStrengths ? 'FICHE DR — FICHE DE PROPOSITION\n' + propositionStrengths : '',
            oralStrengths ? 'FICHETTE ORALE\n' + oralStrengths : ''
        ].filter(Boolean).join('\n\n');
        // Les axes prioritaires restent eux aussi rattachés à leur fiche d'origine.
        const propositionImprovements = proposition
            ? extractFeedbackSection(proposition.comment, 'Axes de progrès', ['Synthèse', 'Points forts'])
                || extractFeedbackSection(proposition.comment, 'Axes d’amélioration', ['Synthèse', 'Points forts'])
            : '';
        const oralImprovements = oral
            ? extractFeedbackSection(oral.comment, 'Axes de progrès', ['Synthèse', 'Points forts'])
                || extractFeedbackSection(oral.comment, 'Axes d’amélioration', ['Synthèse', 'Points forts'])
            : '';
        const improvements = [
            propositionImprovements ? 'FICHE DR — FICHE DE PROPOSITION\n' + propositionImprovements : '',
            oralImprovements ? 'FICHETTE ORALE\n' + oralImprovements : ''
        ].filter(Boolean).join('\n\n');
        return {
            candidateName: candidateName(candidate.candidate),
            specialty: candidate.candidate.specialty || candidate.candidate.specialty_label || '',
            dossier: String(submission.dossier),
            subject: submission.subject || submission.title || 'Évaluation BM4',
            guideName: guideBadge ? guideBadge.textContent.replace(/^Guide\s*:\s*/i, '').trim() : 'Non renseigné',
            evaluations: evaluations,
            weightedGrade: weightedGrade,
            strengths: strengths,
            improvements: improvements,
            exportedAt: formatDate(new Date().toISOString())
        };
    }

    async function downloadReviewReport() {
        const button = document.getElementById('guideDownloadReview');
        const status = document.getElementById('guideReviewStatus');
        if (!savedReviewReport || !button) return;
        button.disabled = true;
        try {
            if (!savedReviewReport.evaluations.length) {
                throw new Error('Aucune évaluation validée par l’Officier Guide à exporter.');
            }
            const { createOfficialBm4Pdf } = await import('./bm4-official-pdf.mjs');
            const pdf = await createOfficialBm4Pdf(savedReviewReport);
            const url = URL.createObjectURL(pdf);
            const link = element('a');
            const filename = savedReviewReport.candidateName
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'candidat';
            const suffix = savedReviewReport.weightedGrade === null
                ? (savedReviewReport.evaluations[0].type === 'proposition' ? 'Ecrit_70' : 'Oral_30')
                : 'Complet_70_30';
            link.href = url;
            link.download = 'Grille_BM4_Dossier_' + filename + '_' + savedReviewReport.dossier + '_' + suffix + '.pdf';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
            setStatus(status, 'Grille BM4 officielle téléchargée.', 'success');
        } catch (error) {
            console.error('Génération de la grille BM4 officielle impossible.', error);
            setStatus(status, error.message || 'Génération de la grille BM4 impossible.', 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function exportFinalCandidateEvaluation() {
        const button = document.getElementById('guideExportFinalCandidate');
        const status = document.getElementById('guideReviewStatus');
        if (!savedReviewReport || !button) return;
        if (savedReviewReport.weightedGrade === null ||
            !savedReviewReport.evaluations.some(function (item) { return item.type === 'proposition'; }) ||
            !savedReviewReport.evaluations.some(function (item) { return item.type === 'support_oral'; })) {
            setStatus(status, 'L’évaluation finale nécessite la validation de la fiche de proposition et de la fichette orale.', 'error');
            return;
        }
        button.disabled = true;
        try {
            const { createOfficialBm4Pdf } = await import('./bm4-official-pdf.mjs');
            const pdf = await createOfficialBm4Pdf(savedReviewReport);
            const url = URL.createObjectURL(pdf);
            const link = element('a');
            const filename = savedReviewReport.candidateName
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'candidat';
            link.href = url;
            link.download = 'Evaluation_finale_BM4_' + filename + '_Dossier_' + savedReviewReport.dossier + '.pdf';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
            setStatus(status, 'Évaluation finale BM4 exportée. Le PDF peut être transmis au candidat.', 'success');
        } catch (error) {
            console.error('Export de l’évaluation finale impossible.', error);
            setStatus(status, error.message || 'Export de l’évaluation finale impossible.', 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function saveReview(event) {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const submissionId = document.getElementById('guideReviewSubmissionId').value;
        const status = document.getElementById('guideReviewStatus');
        if (!activeReviewSubmission || !JURY_CHECKLISTS[activeReviewSubmission.submission_type] ||
            String(activeReviewSubmission.id) !== String(submissionId)) {
            setStatus(status, 'La fiche sélectionnée ne correspond plus à l’évaluation ouverte. Fermez puis rouvrez la fiche.', 'error');
            return;
        }
        const totals = collectReviewScores();
        if (!totals.complete) {
            setStatus(status, 'Renseignez une note valide pour chaque critère de la grille.', 'error');
            return;
        }
        const button = form.querySelector('button[type="submit"]');
        const contextGeneration = reviewContextGeneration;
        const editGeneration = reviewEditGeneration;
        const comment = document.getElementById('guideReviewComment').value.trim();
        const decision = document.getElementById('guideReviewDecision').value;
        const juryChecklist = collectJuryChecklist(activeReviewSubmission);
        if (button) button.disabled = true;
        setStatus(status, 'Enregistrement de l’évaluation…');
        try {
            const savedReview = await api('/rest/v1/fiche_reviews?on_conflict=submission_id%2Cguide_id', {
                method: 'POST',
                prefer: 'resolution=merge-duplicates,return=representation',
                body: {
                    submission_id: submissionId,
                    form_grade: totals.formGrade,
                    content_grade: totals.contentGrade,
                    grade: totals.grade,
                    rubric_scores: totals.rubricScores,
                    jury_checklist: juryChecklist,
                    status: decision,
                    comment: comment
                }
            });
            const savedRow = Array.isArray(savedReview) ? savedReview[0] : null;
            if (contextGeneration === reviewContextGeneration && editGeneration === reviewEditGeneration &&
                activeReviewCandidate && activeReviewSubmission) {
                const finalReview = {
                    form_grade: savedRow?.form_grade ?? totals.formGrade,
                    content_grade: savedRow?.content_grade ?? totals.contentGrade,
                    grade: savedRow?.grade ?? totals.grade,
                    rubric_scores: savedRow?.rubric_scores ?? totals.rubricScores,
                    jury_checklist: savedRow?.jury_checklist ?? juryChecklist,
                    status: savedRow?.status ?? decision,
                    comment: savedRow?.comment ?? comment,
                    reviewed_at: savedRow?.reviewed_at || new Date().toISOString()
                };
                savedReviewReport = finalReview.status === 'valide'
                    ? createReviewReport(activeReviewCandidate, activeReviewSubmission, finalReview, finalReview.reviewed_at)
                    : null;
                const downloadButton = document.getElementById('guideDownloadReview');
                if (downloadButton) {
                    downloadButton.hidden = !savedReviewReport || !savedReviewReport.evaluations.length;
                }
                const finalExportButton = document.getElementById('guideExportFinalCandidate');
                if (finalExportButton) {
                    finalExportButton.hidden = !savedReviewReport || savedReviewReport.weightedGrade === null;
                }
                setStatus(status, finalReview.status === 'valide'
                    ? 'Évaluation validée et enregistrée.'
                    : 'Évaluation enregistrée comme « à reprendre ». Aucun PDF officiel ne peut être édité avant validation.', 'success');

            } else if (contextGeneration === reviewContextGeneration) {
                setStatus(status, 'Évaluation enregistrée. Enregistrez les modifications en cours pour télécharger le compte rendu.', 'success');
            }
            await loadDashboard();
            await loadGuideCourses();
        } catch (error) {
            setStatus(status, error.message || 'Enregistrement de l’évaluation impossible.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function saveAdmission(event) {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity() || !selectedCandidateId) return;
        const scoreValue = document.getElementById('guideCcpmScore').value;
        const nextOralValue = document.getElementById('guideNextOral').value;
        const status = document.getElementById('guideAdmissionStatus');
        const button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        setStatus(status, 'Enregistrement du suivi admission…');
        try {
            const row = {
                candidate_id: selectedCandidateId,
                ccpm_date: document.getElementById('guideCcpmDate').value || null,
                ccpm_score: scoreValue === '' ? null : Number(scoreValue),
                ccpm_validated: document.getElementById('guideCcpmValidated').checked,
                mock_orals_done: Number(document.getElementById('guideOralsDone').value || 0),
                mock_orals_target: Number(document.getElementById('guideOralsTarget').value || 4),
                next_oral_date: nextOralValue ? new Date(nextOralValue).toISOString() : null,
                guide_notes: document.getElementById('guideNotes').value.trim()
            };
            await api('/rest/v1/candidate_admission_tracking?on_conflict=candidate_id', {
                method: 'POST',
                prefer: 'resolution=merge-duplicates,return=representation',
                body: row
            });
            setStatus(status, 'Suivi admission enregistré.', 'success');
            await loadDashboard();
            await loadGuideCourses();
        } catch (error) {
            setStatus(status, error.message || 'Enregistrement du suivi admission impossible.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function searchCandidates(event) {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const query = document.getElementById('guideCandidateSearch').value.trim().toUpperCase();
        const status = document.getElementById('guideSearchStatus');
        const results = document.getElementById('guideSearchResults');
        results.replaceChildren();
        const item = element('article', 'guide-search-result');
        const description = element('div');
        description.appendChild(element('strong', '', 'Code candidat'));
        description.appendChild(element('small', '', query));
        const attach = element('button', 'guide-button guide-button-primary', 'Rattacher ce code');
        attach.type = 'button';
        attach.addEventListener('click', function () { assignCandidate(query, attach); });
        item.append(description, attach);
        results.appendChild(item);
        setStatus(status, 'Vérifiez que ce code vous a bien été communiqué par le candidat.');
    }

    async function assignCandidate(candidateCode, button) {
        button.disabled = true;
        const status = document.getElementById('guideSearchStatus');
        setStatus(status, 'Rattachement du candidat…');
        try {
            const candidateId = await api('/rest/v1/rpc/assign_guide_candidate_by_code', {
                method: 'POST',
                body: { p_code: candidateCode }
            });
            if (typeof candidateId !== 'string' ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId)) {
                throw new Error('Le service de rattachement a retourné un identifiant candidat invalide.');
            }
            selectedCandidateId = candidateId;
            document.getElementById('guideCandidateFilter').value = '';
            document.getElementById('guideAssignDialog').close();
            await loadDashboard();
            setStatus(document.getElementById('guideStatus'), 'Candidat rattaché à votre cohorte.', 'success');
        } catch (error) {
            button.disabled = false;
            setStatus(status, error.message || 'Rattachement impossible.', 'error');
        }
    }

    const GUIDE_COURSES_ENDPOINT = '/rest/v1/guide_course_catalog';

    function normalizeDriveUrl(value) {
        const url = String(value || '').trim();
        if (!/^https:\/\/(?:drive\.google\.com|docs\.google\.com)\//i.test(url)) {
            throw new Error('Saisissez un lien Google Drive ou Google Docs valide en HTTPS.');
        }
        return url;
    }

    function driveDownloadUrl(value) {
        const url = normalizeDriveUrl(value);
        const match = url.match(/\/(?:file|document|spreadsheets|presentation|forms)\/d\/([a-zA-Z0-9_-]+)/);
        const queryId = new URL(url).searchParams.get('id');
        const id = match ? match[1] : queryId;
        return id ? 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id) : url;
    }

    function renderGuideCourses(rows) {
        const list = document.getElementById('guideCourseList');
        const empty = document.getElementById('guideCourseEmpty');
        if (!list) return;
        list.replaceChildren();
        const courses = Array.isArray(rows) ? rows : [];
        if (empty) empty.hidden = courses.length > 0;
        courses.forEach(function (course) {
            const item = element('article', 'guide-course-card');
            const heading = element('h3', '', course.title);
            item.appendChild(heading);
            if (isAdminUser) {
                item.appendChild(element('span', 'guide-course-category', course.category));
                if (course.description) item.appendChild(element('p', 'guide-course-description', course.description));
            }
            const actions = element('div', 'guide-course-actions');
            const download = element('a', 'guide-course-download', 'Télécharger');
            download.href = driveDownloadUrl(course.drive_url);
            download.setAttribute('download', '');
            download.rel = 'noopener noreferrer';
            actions.appendChild(download);
            if (isAdminUser) {
                const edit = element('button', 'guide-button', 'Modifier');
                edit.type = 'button';
                edit.addEventListener('click', function () { openGuideCourseForm(course); });
                const remove = element('button', 'guide-button', 'Supprimer');
                remove.type = 'button';
                remove.addEventListener('click', function () { deleteGuideCourse(course); });
                actions.append(edit, remove);
            }
            item.appendChild(actions);
            list.appendChild(item);
        });
    }

    async function loadGuideCourses() {
        const status = document.getElementById('guideCourseStatus');
        setStatus(status, 'Chargement du catalogue…');
        try {
            const rows = await api(GUIDE_COURSES_ENDPOINT + '?select=id,title,category,description,drive_url,created_at&order=category.asc,title.asc');
            renderGuideCourses(rows);
            setStatus(status, '');
        } catch (error) {
            setStatus(status, error.message || 'Chargement du catalogue impossible.', 'error');
        }
    }

    function openGuideCourseForm(course) {
        if (!isAdminUser) return;
        const form = document.getElementById('guideCourseForm');
        form.reset();
        document.getElementById('guideCourseId').value = course?.id || '';
        document.getElementById('guideCourseName').value = course?.title || '';
        document.getElementById('guideCourseCategory').value = course?.category || '';
        document.getElementById('guideCourseDescription').value = course?.description || '';
        document.getElementById('guideCourseDriveUrl').value = course?.drive_url || '';
        document.getElementById('guideCourseDialogTitle').textContent = course ? 'Modifier un cours' : 'Ajouter un cours';
        setStatus(document.getElementById('guideCourseFormStatus'), '');
        document.getElementById('guideCourseDialog').showModal();
    }

    async function saveGuideCourse(event) {
        event.preventDefault();
        if (!isAdminUser) return;
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const id = document.getElementById('guideCourseId').value;
        const status = document.getElementById('guideCourseFormStatus');
        const button = form.querySelector('button[type="submit"]');
        const payload = {
            title: document.getElementById('guideCourseName').value.trim(),
            category: document.getElementById('guideCourseCategory').value.trim(),
            description: document.getElementById('guideCourseDescription').value.trim(),
            drive_url: normalizeDriveUrl(document.getElementById('guideCourseDriveUrl').value)
        };
        if (button) button.disabled = true;
        setStatus(status, 'Enregistrement du cours…');
        try {
            await api(GUIDE_COURSES_ENDPOINT + (id ? '?id=eq.' + encodeURIComponent(id) : ''), {
                method: id ? 'PATCH' : 'POST',
                prefer: 'return=representation',
                body: payload
            });
            document.getElementById('guideCourseDialog').close();
            await loadGuideCourses();
        } catch (error) {
            setStatus(status, error.message || 'Enregistrement du cours impossible.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function deleteGuideCourse(course) {
        if (!isAdminUser) return;
        if (!window.confirm('Supprimer le cours « ' + course.title + ' » du catalogue ?')) return;
        try {
            await api(GUIDE_COURSES_ENDPOINT + '?id=eq.' + encodeURIComponent(course.id), { method: 'DELETE' });
            await loadGuideCourses();
        } catch (error) {
            setStatus(document.getElementById('guideCourseStatus'), error.message || 'Suppression impossible.', 'error');
        }
    }

    function bindPageEvents() {
        if (pageBindingsAttached) return;
        pageBindingsAttached = true;
        document.getElementById('guideRefresh')?.addEventListener('click', loadDashboard);
        document.getElementById('guideCourseAdd')?.addEventListener('click', function () { openGuideCourseForm(null); });
        document.getElementById('guideCourseForm')?.addEventListener('submit', saveGuideCourse);
        document.getElementById('guideCandidateFilter')?.addEventListener('change', function (event) {
            if (event.target.value) selectedCandidateId = event.target.value;
            renderCohort();
        });
        document.getElementById('guidePeriodFilter')?.addEventListener('change', renderCohort);
        document.getElementById('guideDetailCandidate')?.addEventListener('change', function (event) {
            selectedCandidateId = event.target.value;
            renderDetails();
        });
        document.querySelectorAll('[data-guide-tab]').forEach(function (button) {
            button.addEventListener('click', function () { activateTab(button.dataset.guideTab); });
        });
        document.getElementById('guideAdmissionForm')?.addEventListener('submit', saveAdmission);
        document.getElementById('guideReviewForm')?.addEventListener('submit', saveReview);
        document.getElementById('guideDownloadReview')?.addEventListener('click', downloadReviewReport);
        document.getElementById('guideExportFinalCandidate')?.addEventListener('click', exportFinalCandidateEvaluation);
        document.getElementById('guideReviewForm')?.addEventListener('input', function (event) {
            if (event.target.id === 'guideReviewSubmissionId') return;
            markReviewDirty();
            updateFinalGrade();
        });
        document.getElementById('guideReviewForm')?.addEventListener('change', function (event) {
            if (event.target.id === 'guideReviewSubmissionId') return;
            markReviewDirty();
            updateFinalGrade();
        });
        document.getElementById('guideReviewDialog')?.addEventListener('close', function () {
            aiCorrectionGeneration += 1;
        });
        document.getElementById('guideAssignOpen')?.addEventListener('click', function () {
            const dialog = document.getElementById('guideAssignDialog');
            document.getElementById('guideCandidateSearch').value = '';
            document.getElementById('guideSearchResults').replaceChildren();
            setStatus(document.getElementById('guideSearchStatus'), '');
            dialog.showModal();
            document.getElementById('guideCandidateSearch').focus();
        });
        document.getElementById('guideAssignForm')?.addEventListener('submit', searchCandidates);
        document.querySelectorAll('[data-guide-close]').forEach(function (button) {
            button.addEventListener('click', function () {
                document.getElementById(button.dataset.guideClose)?.close();
            });
        });
        document.querySelectorAll('dialog.guide-dialog').forEach(function (dialog) {
            dialog.addEventListener('click', function (event) {
                if (event.target === dialog) dialog.close();
            });
        });
    }

    async function initializePage() {
        const status = document.getElementById('guideStatus');
        try {
            const access = await currentAccess();
            isAuthorized = Boolean(access && access.allowed);
            isAdminUser = Boolean(access && access.isAdmin);
            const adminControls = document.getElementById('guideCourseAdminControls');
            if (adminControls) adminControls.hidden = !isAdminUser;
            updateNavigation(isAuthorized);
            if (!isAuthorized) {
                if (accessState) {
                    accessState.querySelector('h1').textContent = access
                        ? 'Accès réservé aux comptes de spécialité OG, aux officiers guides et aux administrateurs.'
                        : 'Connexion DOCTRINE requise.';
                    accessState.querySelector('p').textContent = access
                        ? 'Votre compte doit avoir la spécialité OG ou le rôle guide/officier_guide.'
                        : 'Connectez-vous avec votre compte QCM-MAJOR, puis revenez dans cet espace.';
                }
                return;
            }
            if (app) app.hidden = false;
            if (accessState) accessState.hidden = true;
            bindPageEvents();
            await loadDashboard();
            await loadGuideCourses();
        } catch (error) {
            isAuthorized = false;
            updateNavigation(false);
            if (status) setStatus(status, error.message || 'Vérification des droits impossible.', 'error');
            if (accessState) {
                accessState.querySelector('h1').textContent = 'Vérification des droits impossible.';
                accessState.querySelector('p').textContent = error.message || 'Réessayez après connexion.';
            }
        }
    }

    if (nav) {
        updateNavigation(false);
        document.addEventListener('doctrine:login', function () {
            currentAccess().then(function (access) {
                isAuthorized = Boolean(access && access.allowed);
                updateNavigation(isAuthorized);
            }).catch(function (error) {
                console.error('Vérification du rôle guide impossible.', error);
                updateNavigation(false);
            });
        });
        document.addEventListener('doctrine:logout', function () {
            isAuthorized = false;
            updateNavigation(false);
        });
        currentAccess().then(function (access) {
            isAuthorized = Boolean(access && access.allowed);
            updateNavigation(isAuthorized);
        }).catch(function (error) {
            console.error('Vérification du rôle guide impossible.', error);
            updateNavigation(false);
        });
    }

    if (app) {
        document.addEventListener('doctrine:login', initializePage);
        document.addEventListener('doctrine:logout', function () {
            isAuthorized = false;
            isAdminUser = false;
            const adminControls = document.getElementById('guideCourseAdminControls');
            if (adminControls) adminControls.hidden = true;
            requestGeneration++;
            candidates = [];
            selectedCandidateId = '';
            if (app) app.hidden = true;
            if (accessState) {
                accessState.hidden = false;
                accessState.querySelector('h1').textContent = 'Session fermée.';
                accessState.querySelector('p').textContent = 'Reconnectez-vous avec un compte guide ou administrateur.';
            }
        });
        initializePage();
    }
})();

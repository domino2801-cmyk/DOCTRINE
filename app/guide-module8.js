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
            formLabel: 'Forme, présentation et langue',
            contentLabel: 'Introduction, problématique, solutions et avis',
            criteria: [
                { key: 'form', label: 'Forme, présentation et langue', max: 6, group: 'form' },
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
        const moduleOneDone = events.some(function (event) {
            return event.module_id === '1' && event.event_type === 'module_completed';
        });
        const documents = new Set((doctrine.documents || []).map(function (doc) {
            return doc.document_title;
        }).filter(Boolean)).size;
        const submissions = doctrine.submissions || [];
        const proposalCount = submissions.filter(function (submission) {
            return submission.submission_type !== 'support_oral';
        }).length;
        const oralSupportCount = submissions.filter(function (submission) {
            return submission.submission_type === 'support_oral';
        }).length;
        const corrections = new Set(events.filter(function (event) {
            return event.module_id === '4' && event.event_type === 'correction_accessible';
        }).map(function (event) { return String(event.dossier); })).size;
        [
            ['Module 1', moduleOneDone ? 'Validé' : 'Non validé'],
            ['Module 2', documents + ' document(s) lu(s)'],
            ['Fiches de proposition', proposalCount + ' dépôt(s)'],
            ['Supports oraux', oralSupportCount + ' dépôt(s)'],
            ['Module 4', corrections + ' corrigé(s) débloqué(s)']
        ].forEach(function (item) {
            const card = element('article', 'guide-progress-card');
            card.append(element('span', '', item[0]), element('strong', '', item[1]));
            container.appendChild(card);
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
            aiButton.title = isOralSupport
                ? 'Évaluer la fichette selon la grille orale et la comparer à la fiche écrite archivée, si disponible.'
                : 'Transmettre la fiche de proposition à Google Gemini pour obtenir une proposition à vérifier.';
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
        renderSubmissions(candidate);
        renderAdmission(candidate);
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
        if (aiResult) {
            aiResult.replaceChildren();
            aiResult.hidden = true;
        }
        document.getElementById('guideReviewDecision').value = review.status === 'a_reprendre' ? 'a_reprendre' : 'valide';
        document.getElementById('guideReviewComment').value = review.comment || '';
        savedReviewReport = review.reviewed_at
            ? createReviewReport(candidate, submission, review, review.reviewed_at)
            : null;
        const downloadButton = document.getElementById('guideDownloadReview');
        if (downloadButton) downloadButton.hidden = !savedReviewReport;
        const saveButton = document.querySelector('#guideReviewForm button[type="submit"]');
        if (saveButton) saveButton.disabled = false;
        updateFinalGrade();
        setStatus(reviewStatus, '');
        if (dialog && !dialog.open) dialog.showModal();
        return generation;
    }

    function formatAiFeedback(suggestion) {
        const lines = [
            'Proposition Gemini — à vérifier',
            (suggestion.form_label || 'Forme') + ' : ' + suggestion.form_grade + ' / ' +
                (suggestion.form_max_grade || 6) + ' — ' + suggestion.form_observations,
            ...suggestion.criteria.map(function (criterion) {
                return criterion.label + ' : ' + criterion.grade + ' / ' + criterion.max_grade +
                    ' — ' + criterion.observation;
            }),
            'Points forts : ' + (suggestion.strengths.length ? suggestion.strengths.join('; ') : 'non précisés'),
            'Axes de progrès : ' + (suggestion.improvements.length ? suggestion.improvements.join('; ') : 'non précisés'),
            'Synthèse : ' + suggestion.overall_comment,
            ...(suggestion.submission_type === 'support_oral'
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
        suggestion.criteria.forEach(function (criterion) {
            const item = element('li');
            item.appendChild(element('strong', '', criterion.label + ' — ' +
                criterion.grade + ' / ' + criterion.max_grade));
            item.appendChild(element('p', '', criterion.observation));
            if (criterion.evidence) {
                item.appendChild(element('p', '', 'Indice à vérifier : ' + criterion.evidence));
            }
            criteria.appendChild(item);
        });
        panel.append(
            element('p', 'guide-ai-disclaimer',
                'Suggestion non enregistrée. Vérifiez la fiche et les notes avant de valider.'),
            element('p', '', (suggestion.form_label || 'Forme') + ' : ' + suggestion.form_grade +
                ' / ' + (suggestion.form_max_grade || 6) + ' · Fond : ' +
                suggestion.content_grade + ' / ' + (suggestion.content_max_grade || 14) +
                ' · Fiabilité estimée : ' + suggestion.confidence),
            element('p', '', suggestion.form_observations),
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
        setStatus(status, submission.submission_type === 'support_oral'
            ? 'La fichette est transmise à Google Gemini. La fiche écrite du même dossier sera recherchée pour comparaison si elle est archivée.'
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

    function createReviewReport(candidate, submission, review, reviewedAt) {
        const guideBadge = document.getElementById('guideIdentityBadge');
        const rubric = rubricFor(submission);
        const submissions = candidate.doctrine?.submissions || [];
        const weightedGrade = weightedSynthesisGrade(submissions, submission.dossier, submission, review);
        return {
            candidateName: candidateName(candidate.candidate),
            dossier: String(submission.dossier),
            submissionLabel: rubric.label,
            weightPercent: rubric.weight,
            formLabel: rubric.formLabel,
            contentLabel: rubric.contentLabel,
            guideName: guideBadge ? guideBadge.textContent.replace(/^Guide\s*:\s*/i, '').trim() : 'Non renseigné',
            formGrade: Number(review.form_grade).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
            contentGrade: Number(review.content_grade).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
            finalGrade: Number(review.grade ?? (Number(review.form_grade) + Number(review.content_grade)))
                .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            weightedGrade: weightedGrade === null
                ? ''
                : weightedGrade.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            criteria: rubric.criteria.filter(function (criterion) {
                return Number.isFinite(Number(review.rubric_scores?.[criterion.key]));
            }).map(function (criterion) {
                return {
                    label: criterion.label,
                    grade: Number(review.rubric_scores[criterion.key]).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
                    maxGrade: criterion.max
                };
            }),
            decision: review.status === 'a_reprendre' ? 'À reprendre' : 'Validé',
            comment: review.comment || '',
            reviewedAt: formatDate(reviewedAt),
            exportedAt: formatDate(new Date().toISOString())
        };
    }

    async function downloadReviewReport() {
        const button = document.getElementById('guideDownloadReview');
        const status = document.getElementById('guideReviewStatus');
        if (!savedReviewReport || !button) return;
        button.disabled = true;
        try {
            const { createEvaluationPdf } = await import('./evaluation-report.mjs');
            const pdf = createEvaluationPdf(savedReviewReport);
            const url = URL.createObjectURL(pdf);
            const link = element('a');
            const filename = savedReviewReport.candidateName
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'candidat';
            link.href = url;
            link.download = `evaluation-${filename}-dossier-${savedReviewReport.dossier}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
            setStatus(status, 'Compte rendu téléchargé.', 'success');
        } catch (error) {
            console.error('Génération du compte rendu PDF impossible.', error);
            setStatus(status, 'Génération du compte rendu PDF impossible.', 'error');
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
                    status: decision,
                    comment: comment
                }
            });
            const savedRow = Array.isArray(savedReview) ? savedReview[0] : null;
            if (contextGeneration === reviewContextGeneration && editGeneration === reviewEditGeneration &&
                activeReviewCandidate && activeReviewSubmission) {
                savedReviewReport = createReviewReport(activeReviewCandidate, activeReviewSubmission, {
                    form_grade: savedRow?.form_grade ?? totals.formGrade,
                    content_grade: savedRow?.content_grade ?? totals.contentGrade,
                    grade: savedRow?.grade ?? totals.grade,
                    rubric_scores: savedRow?.rubric_scores ?? totals.rubricScores,
                    status: savedRow?.status ?? decision,
                    comment: savedRow?.comment ?? comment
                }, savedRow?.reviewed_at || new Date().toISOString());
                document.getElementById('guideDownloadReview').hidden = false;
                setStatus(status, 'Évaluation enregistrée.', 'success');
            } else if (contextGeneration === reviewContextGeneration) {
                setStatus(status, 'Évaluation enregistrée. Enregistrez les modifications en cours pour télécharger le compte rendu.', 'success');
            }
            await loadDashboard();
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

    function bindPageEvents() {
        if (pageBindingsAttached) return;
        pageBindingsAttached = true;
        document.getElementById('guideRefresh')?.addEventListener('click', loadDashboard);
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

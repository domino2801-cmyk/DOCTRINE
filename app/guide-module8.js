(function () {
    'use strict';

    if (new URLSearchParams(window.location.search).get('embedded') === '1') {
        document.body.classList.add('is-embedded');
    }

    const GUIDE_ROLES = new Set(['guide', 'officier_guide']);
    const STALE_AFTER_DAYS = 14;
    const auth = window.DoctrineAuth;
    const nav = document.getElementById('guideModule8Nav');
    const app = document.getElementById('guideModule8App');
    const accessState = document.getElementById('guideAccessState');

    let candidates = [];
    let selectedCandidateId = '';
    let requestGeneration = 0;
    let isAuthorized = false;
    let pageBindingsAttached = false;

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
        const admin = role === 'admin' || metadata.bm4_admin === true ||
            metadata.bm4_admin === 'true' || metadata.bm4_admin === 1 || metadata.bm4_admin === '1';
        return {
            token: token,
            userId: claims.sub || '',
            allowed: admin || GUIDE_ROLES.has(role),
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
            const review = isOralSupport ? null : (submission.reviews || [])[0];
            const decision = isOralSupport
                ? 'Consultation uniquement'
                : review
                    ? (review.status === 'valide' ? 'Validé' : review.status === 'a_reprendre' ? 'À reprendre' : 'En attente')
                        + (review.grade === null || review.grade === undefined ? '' : ' · ' + Number(review.grade).toFixed(2) + ' / 20')
                    : 'En attente d’évaluation';
            description.appendChild(element('span', 'guide-review-label',
                formatDate(submission.created_at) + ' · ' + decision));
            card.appendChild(description);
            const button = element('button', 'guide-button guide-button-primary',
                isOralSupport ? 'Ouvrir le support oral' : 'Ouvrir PDF & Noter');
            button.type = 'button';
            button.disabled = !submission.storage_path;
            if (!submission.storage_path) button.title = 'Cette fiche a été transmise avant l’archivage des PDF.';
            button.addEventListener('click', function () { openReview(candidate, submission); });
            card.appendChild(button);
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

    async function openReview(candidate, submission) {
        const dialog = document.getElementById('guideReviewDialog');
        const title = document.getElementById('guideReviewTitle');
        const frame = document.getElementById('guidePdfPreview');
        const pdfStatus = document.getElementById('guidePdfStatus');
        const reviewStatus = document.getElementById('guideReviewStatus');
        const isOralSupport = submission.submission_type === 'support_oral';
        const review = isOralSupport ? {} : (submission.reviews || [])[0] || {};
        const reviewForm = document.getElementById('guideReviewForm');
        const layout = dialog?.querySelector('.guide-review-layout');
        const kicker = dialog?.querySelector('.guide-kicker');
        if (reviewForm) reviewForm.hidden = isOralSupport;
        if (layout) layout.classList.toggle('is-readonly', isOralSupport);
        if (kicker) kicker.textContent = isOralSupport ? 'CONSULTATION — SUPPORT ORAL' : 'ÉVALUATION BM4';
        if (title) title.textContent = candidateName(candidate.candidate) + ' — ' +
            (isOralSupport ? 'Support oral' : 'Fiche de proposition') + ' — Dossier ' + submission.dossier;
        document.getElementById('guideReviewSubmissionId').value = submission.id;
        document.getElementById('guideFormGrade').value = review.form_grade ?? '';
        document.getElementById('guideContentGrade').value = review.content_grade ?? '';
        document.getElementById('guideReviewDecision').value = review.status === 'a_reprendre' ? 'a_reprendre' : 'valide';
        document.getElementById('guideReviewComment').value = review.comment || '';
        updateFinalGrade();
        frame.src = 'about:blank';
        setStatus(pdfStatus, 'Génération d’une URL sécurisée…');
        setStatus(reviewStatus, '');
        if (dialog && !dialog.open) dialog.showModal();
        try {
            const path = submission.storage_path.split('/').map(encodeURIComponent).join('/');
            const signed = await api('/storage/v1/object/sign/candidate-fiches/' + path, {
                method: 'POST',
                body: { expiresIn: 300 }
            });
            const signedUrl = signed.signedURL || signed.signedUrl;
            if (!signedUrl) throw new Error('URL PDF signée manquante dans la réponse Storage.');
            frame.src = relativeStorageUrl(signedUrl);
            setStatus(pdfStatus, 'PDF accessible pendant 5 minutes.', 'success');
        } catch (error) {
            setStatus(pdfStatus, error.message || 'Ouverture sécurisée du PDF impossible.', 'error');
        }
    }

    function updateFinalGrade() {
        const formGrade = Number(document.getElementById('guideFormGrade')?.value);
        const contentGrade = Number(document.getElementById('guideContentGrade')?.value);
        const total = (Number.isFinite(formGrade) ? formGrade : 0) +
            (Number.isFinite(contentGrade) ? contentGrade : 0);
        const output = document.getElementById('guideFinalGrade');
        if (output) output.textContent = total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' / 20';
    }

    async function saveReview(event) {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const submissionId = document.getElementById('guideReviewSubmissionId').value;
        const formGrade = Number(document.getElementById('guideFormGrade').value);
        const contentGrade = Number(document.getElementById('guideContentGrade').value);
        const status = document.getElementById('guideReviewStatus');
        const button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        setStatus(status, 'Enregistrement de l’évaluation…');
        try {
            await api('/rest/v1/fiche_reviews?on_conflict=submission_id%2Cguide_id', {
                method: 'POST',
                prefer: 'resolution=merge-duplicates,return=representation',
                body: {
                    submission_id: submissionId,
                    form_grade: formGrade,
                    content_grade: contentGrade,
                    grade: formGrade + contentGrade,
                    status: document.getElementById('guideReviewDecision').value,
                    comment: document.getElementById('guideReviewComment').value.trim()
                }
            });
            setStatus(status, 'Évaluation enregistrée.', 'success');
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
        const query = document.getElementById('guideCandidateSearch').value.trim();
        const status = document.getElementById('guideSearchStatus');
        const results = document.getElementById('guideSearchResults');
        results.replaceChildren();
        setStatus(status, 'Recherche en cours…');
        try {
            const rows = await api('/rest/v1/rpc/search_guide_candidates', {
                method: 'POST',
                body: { p_query: query }
            });
            if (!Array.isArray(rows) || rows.length === 0) {
                setStatus(status, 'Aucun candidat correspondant.', 'success');
                return;
            }
            setStatus(status, rows.length + ' résultat(s).');
            rows.forEach(function (candidate) {
                const item = element('article', 'guide-search-result');
                const description = element('div');
                description.appendChild(element('strong', '', candidate.display_name || candidate.email || 'Candidat'));
                description.appendChild(element('small', '',
                    [candidate.grade, candidate.unit, candidate.specialty, candidate.matricule, candidate.email]
                        .filter(Boolean).join(' · ')));
                const attach = element('button', 'guide-button guide-button-primary', 'Rattacher');
                attach.type = 'button';
                attach.addEventListener('click', function () { assignCandidate(candidate.candidate_id, attach); });
                item.append(description, attach);
                results.appendChild(item);
            });
        } catch (error) {
            setStatus(status, error.message || 'Recherche impossible.', 'error');
        }
    }

    async function assignCandidate(candidateId, button) {
        button.disabled = true;
        const status = document.getElementById('guideSearchStatus');
        setStatus(status, 'Rattachement du candidat…');
        try {
            await api('/rest/v1/rpc/assign_guide_candidate', {
                method: 'POST',
                body: { p_candidate_id: candidateId }
            });
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
        document.getElementById('guideFormGrade')?.addEventListener('input', updateFinalGrade);
        document.getElementById('guideContentGrade')?.addEventListener('input', updateFinalGrade);
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
        document.getElementById('guideReviewDialog')?.addEventListener('close', function () {
            const frame = document.getElementById('guidePdfPreview');
            if (frame) frame.src = 'about:blank';
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
                        ? 'Accès réservé aux officiers guides et aux administrateurs.'
                        : 'Connexion DOCTRINE requise.';
                    accessState.querySelector('p').textContent = access
                        ? 'Votre compte ne dispose pas du rôle guide ou administrateur.'
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

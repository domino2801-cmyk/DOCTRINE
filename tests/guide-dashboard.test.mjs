import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, script, css, seed, viewerScript, viewerCss, appScript, cohortDashboardScript, authScript, adminRoleSql, guideModuleSql] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app/guide-dashboard.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/guide-dashboard.css', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/patches/2026-11-22-guide-course-catalog-seed.sql', import.meta.url), 'utf8'),
    readFile(new URL('../viewer/viewer.js', import.meta.url), 'utf8'),
    readFile(new URL('../viewer/viewer.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../admin/cohort-dashboard.js', import.meta.url), 'utf8'),
    readFile(new URL('../auth/auth.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/admin-role-qcm-major-compatibility.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/guide_module8.sql', import.meta.url), 'utf8')
]);

test('l’espace Officier Guide est chargé séparément des modules existants', () => {
    assert.match(html, /app\/guide-dashboard\.css/);
    assert.match(html, /app\/guide-dashboard\.js/);
    assert.match(script, /guideDashboardNav/);
    assert.match(script, /applyGuideModuleVisibility\(\)/);
    assert.match(script, /currentGuideStatus\(\)\.then\(function \(isGuide\)/);
    assert.match(script, /if \(!claims \|\| !claims\.sub\) return null/);
    assert.match(script, /if \(isGuide === null\) return/);
    assert.match(script, /Une session absente ou encore en cours de restauration ne doit jamais/);
    assert.ok(script.includes('&select=speciality'));
    assert.match(script, /style\.setProperty\('display', 'none', 'important'\)/);
    assert.match(script, /getElementById\('btn-mod' \+ id\)/);
    assert.match(script, /module-nav-button\[onclick\]/);
    assert.match(script, /var ids = \['1', '2', '3', '4', '5', '6', '7'\]/);
    assert.match(script, /module8Item\.hidden = true/);
    assert.match(script, /module8Button\.tabIndex = -1/);
    assert.match(script, /item\.hidden = true/);
    assert.match(script, /var isOG = allowed === true/);
    assert.match(script, /item\.hidden = !isOG/);
    assert.ok(script.includes('item.hidden = true;'));
    assert.ok(script.includes('if (root && !root.hidden) close()'));
    assert.match(script, /var hidden = !!isGuide \|\| \(!isGuide && match\[1\] === '8'\)/);
    assert.match(script, /navigateModule.*module\(\[1-8\]\)/);
    assert.match(script, /og-guide-entry-only/);
    assert.match(script, /moduleNav\.hidden = !!isGuide/);
    assert.match(script, /insertBefore\(item, section\)/);
    assert.match(css, /\.og-guide-entry-card \{[\s\S]*?width:100%/);
    assert.match(css, /\.og-guide-entry-button \{[\s\S]*?text-align:center/);
    assert.match(css, /\.main-wrapper > nav\[hidden\] \{ display:none !important; \}/);
    assert.match(script, /setGuideModulesHidden\(false\)/);
    assert.match(html, /id="corpusPreface"/);
    assert.match(script, /function renderGuideCorpus\(\)/);
    assert.match(script, /Encadrer un candidat au Brevet Militaire de 4e niveau/);
    assert.match(script, /Structurer la durée/);
    assert.match(script, /Affûter la méthode/);
    assert.match(script, /Forger la posture/);
    assert.match(script, /Officier guide BM2 et BM4/);
    assert.match(script, /if \(isGuide\) renderGuideCorpus\(\)/);
    assert.match(script, /RATTACHER UN CANDIDAT/);
    assert.match(script, /openAssignCandidateDialog/);
    assert.match(script, /RETOUR D’EXPÉRIENCE OFFICIER GUIDE/);
    assert.match(script, /SIGNALEMENT OFFICIER GUIDE/);
    assert.match(script, /openGuideFeedback\(definition\.kind\)/);
    assert.doesNotMatch(script, /openModule7Form|window\.openModal\('module7'\)/);
    assert.match(script, /rpc\/assign_guide_candidate_by_code/);
    assert.match(script, /p_code: code/);
    assert.match(script, /Code candidat de 8 caractères/);
    assert.match(css, /\.og-dashboard-metric-action/);
    assert.match(css, /\.og-dashboard-assign-dialog/);
    assert.match(script, /id = 'guideDashboard'/);
    assert.match(script, /SUIVI QCM-MAJOR/);
    assert.match(script, /Suivi individuel par candidat de ma cohorte/);
    assert.match(script, /dataset\.guideAction = 'qcm-major-tracking'/);
    assert.match(script, /function openGuideQcmTracking\(\)/);
    assert.ok(script.includes('function qcmThemeSummary(results)'));
    assert.ok(script.includes('function renderQcmCandidateDetail(target, candidate)'));
    assert.ok(script.includes('function openGuideQcmTracking()'));
    assert.ok(script.includes('result.theme'));
    assert.ok(script.includes('og-qcm-bar-track'));
    assert.ok(script.includes('Historique complet des résultats enregistrés'));
    assert.ok(script.includes("for (var number = 1; number <= 6; number += 1)"));
    assert.ok(script.includes("groups.all = { number: 7, theme: 'ALL', scores: [], count: 0 }"));
    assert.match(script, /if \(\/\^all\$\/i\.test\(label\)\)/);
    assert.ok(script.includes("groups.all.scores.push(score)"));
    assert.match(script, /label\.match\(\/\^\\s\*\(\?:\(\?:th\[eè\]me\|theme\|module\)\\s\*\)\?\(\[1-6\]\)\\b\/i\)/);
    assert.match(script, /return left\.number - right\.number/);
    assert.match(script, /result\.theme_number \|\| result\.module_number/);
    assert.ok(script.includes("Aucune note"));
    assert.ok(script.includes("historyContent.hidden = true"));
    assert.ok(script.includes("historyToggle.setAttribute('aria-expanded', 'false')"));
    assert.ok(script.includes("historyContent.hidden = expanded"));
    assert.ok(css.includes('.og-qcm-history-toggle.is-expanded'));
    assert.ok(css.includes('.og-qcm-theme-chart'));
    assert.ok(css.includes('.og-qcm-candidate-button'));
    assert.doesNotMatch(script, /guide_action|og-dashboard-ai-frame/);
});

test('la navigation CANDIDATS ouvre la fiche du premier compte et permet de parcourir la liste avec les flèches', () => {
    assert.ok(script.includes('function openGuideCandidates()'));
    assert.ok(script.includes('CANDIDATS — TOUS LES COMPTES'));
    assert.ok(script.includes('OFFICIERS GUIDES — '));
    assert.ok(script.includes('function renderCandidateProfileDetail(target, candidate)'));
    assert.ok(script.includes('og-candidate-stepper'));
    assert.ok(script.includes('Candidat précédent'));
    assert.ok(script.includes('Candidat suivant'));
    assert.ok(script.includes('showCandidate(selectedIndex - 1)'));
    assert.ok(script.includes('showCandidate(selectedIndex + 1)'));
    assert.ok(script.includes('renderCandidateProfileDetail(detail, candidate)'));
    assert.ok(script.includes("'Candidat ' + (selectedIndex + 1) + ' / '"));
    assert.ok(script.includes("var ogGroup = node('details', 'og-dashboard-candidate-group og-dashboard-admin-og-group')"));
    assert.ok(script.includes('identity.specialty'));
    assert.ok(script.includes('identity.email'));
    assert.ok(script.includes('FICHE CANDIDAT'));
    assert.ok(script.includes('og-candidate-profile-hero'));
    assert.ok(script.includes('og-candidate-profile-progress-card'));
    assert.ok(script.includes('og-candidate-profile-module-track'));
    assert.ok(script.includes('Suivi d’admission'));
    assert.ok(script.includes('Dossier et documents demandés'));
    assert.ok(script.includes('renderAiCorrection(candidate)'));
    assert.ok(script.includes('SUIVI QCM-MAJOR'));
    assert.ok(script.includes('Historique complet des résultats enregistrés'));
    assert.ok(script.includes('historyContent.hidden = true'));
    assert.ok(script.includes('og-dashboard-qcm-tracking'));
    assert.ok(script.includes('Progression des modules 1 à 7'));
    assert.ok(script.includes('Correction assistée par IA'));
});
test('la fiche de chaque candidat administrateur permet de modifier sa spécialité', () => {
    assert.match(script, /var specialtyButton = node\('button', 'admin-edit-btn', 'Spécialité'\)/);
    assert.match(script, /specialtyButton\.title = 'Modifier la spécialité du candidat'/);
    assert.match(script, /specialties = \['INF', 'BLD', 'ART', 'GEN', 'AER', 'EMP', 'SIC', 'CYB', 'RENS', 'ADM', 'GRH', 'PBF', 'MVT', 'MAI', 'COM', 'RHL', 'EPS', 'SAN', 'FSP', 'EMIA', 'OG'\]/);
    assert.match(script, /api\('rpc\/update_candidate_specialty'/);
    assert.match(script, /body: \{ p_user_id: identity\.id, p_new_specialty: newSpecialty \}/);
    assert.match(script, /identity\.specialty = newSpecialty/);
});

test('le suivi global administrateur permet de retirer un candidat du cache local', () => {
    assert.match(script, /var removeCacheButton = node\('button', 'admin-delete-btn', 'Retirer du cache'\)/);
    assert.match(css, /\.og-candidate-profile-identity > \.admin-edit-btn,[\s\S]*?\.og-candidate-profile-identity > \.admin-delete-btn \{[\s\S]*?width:170px[\s\S]*?min-height:40px/);
    assert.match(css, /@media\(max-width:520px\)[\s\S]*?\.og-candidate-profile-identity > \.admin-delete-btn \{[\s\S]*?width:100%/);
    assert.match(script, /Retirer .* du cache local \? Le compte Supabase ne sera pas supprimé\./);
    assert.match(script, /detail: \{ id: identity\.id \}/);
    assert.match(script, /adminOgCandidates\.findIndex\(function \(item\)/);
    assert.match(script, /adminOgCandidates\.splice\(removedIndex, 1\)/);
    assert.match(script, /renderAdminOgNavigator\(\)/);
    assert.match(script, /Aucun candidat QCM-MAJOR disponible\./);
});

test('la fiche de chaque candidat de la vue administrateur permet de bloquer ou débloquer son compte', () => {
    assert.match(script, /if \(dashboardMode === 'admin'\) \{[\s\S]*?var blockButton = node\('button', 'admin-account-block-btn admin-delete-btn'/);
    assert.match(script, /api\('rpc\/get_admin_blocked_accounts', \{ method: 'POST', body: \{\} \}\)/);
    assert.match(script, /identity\.blockedStatusKnown = blockedStatusKnown/);
    assert.match(script, /identity\.blocked = blockedStatusKnown && blockedIds\.has/);
    assert.match(script, /api\('rpc\/set_account_blocked'/);
    assert.match(script, /body: \{ p_user_id: identity\.id, p_blocked: blocked \}/);
    assert.match(script, /blockButton\.classList\.toggle\('is-blocked', blocked\)/);
    assert.match(script, /blockButton\.disabled = !identity\.id \|\| identity\.blockedStatusKnown !== true/);
});

test('les fiches RETEX et Signalement Officier Guide sont autonomes et indépendantes du Module 7', () => {
    assert.match(script, /RETOUR D’EXPÉRIENCE OFFICIER GUIDE/);
    assert.match(script, /SIGNALEMENT OFFICIER GUIDE/);
    assert.match(script, /function openGuideFeedback\(kind\)/);
    assert.match(script, /guide_retex_reports/);
    assert.match(script, /guide_signalements/);
    assert.match(script, /Mon historique/);
    assert.match(script, /Enregistrer et transmettre/);
    assert.doesNotMatch(script, /openModule7Form/);
    assert.doesNotMatch(script, /selectedGuideModule7Card/);
    assert.match(script, /Q1\. Comment évaluez-vous la facilité d’utilisation/);
    assert.match(script, /Q14\. Quelle recommandation/);
    assert.match(script, /Q6\. Quelles difficultés rencontrez-vous/);
    assert.match(script, /Intervention ou décision attendue/);
});

test('le catalogue des 30 supports est administrable depuis le tableau de bord admin', () => {
    assert.match(script, /function openCourseAdminForm\(course\)/);
    assert.match(script, /\+ Ajouter un cours/);
    assert.match(script, /deleteCourseAdmin\(course\)/);
    assert.match(script, /Propositions de cours des Officiers Guides/);
    assert.match(script, /Valider et ajouter au catalogue/);
    assert.match(script, /category: categoryInput\.value\.trim\(\)/);
    assert.match(script, /guide_course_catalog/);
});
test('la carte de proposition de cours est retirée de l’interface Officier Guide', () => {
    assert.doesNotMatch(script, /Proposer un cours pour le Module 2\.1/);
    assert.doesNotMatch(script, /module2-og-course-proposals/);
    assert.doesNotMatch(script, /function loadOwnCourseProposals\(\)/);
    assert.doesNotMatch(script, /Suivi de mes propositions de cours/);
    // Le circuit de proposition documentaire général reste disponible.
    assert.match(script, /PROPOSITION DE DOCUMENTS À AJOUTER POUR LES CANDIDATS/);
    assert.match(script, /function loadModule2OwnProposals\(\)/);
});

test('le RPC administrateur inclut les profils OG même avec un rôle guide, sans changer leurs droits', () => {
    const start = guideModuleSql.indexOf('create or replace function public.get_guide_candidate_dashboard');
    const end = guideModuleSql.indexOf('revoke all on function public.get_guide_candidate_dashboard', start);
    const rpc = guideModuleSql.slice(start, end);
    assert.ok(rpc.includes("not in ('admin', 'guide', 'officier_guide')"));
    assert.ok(rpc.includes("or upper(trim(coalesce("));
    assert.ok(rpc.includes("))) = 'OG'"));
    assert.ok(rpc.includes('user_account.email_confirmed_at is not null'));
    assert.ok(rpc.includes('bm4_admin'));
    assert.ok(rpc.includes('public.doctrine_is_admin() or assignment.assigned_at is not null'));
    assert.ok(rpc.includes('public.doctrine_is_admin() or public.doctrine_is_guide()'));
    assert.ok(rpc.includes('not public.doctrine_can_access_candidate(p_candidate_id)'));
});



test('les signalements de questions QCM-MAJOR sont intégrés à la fenêtre administrative unifiée', () => {
    assert.match(script, /question_reports\?select=id,question_id,question_text,answers,correct_answer_index,quiz_theme,details,reporter_id,status,admin_response,created_at/);
    assert.match(script, /Questions QCM-MAJOR/);
    assert.match(script, /question_text:'Question signalée'/);
    assert.match(script, /answers:'Réponses proposées'/);
    assert.match(script, /record\.origin === 'questions' \? \[\['pending','À traiter'\],\['resolved','Résolu'\]\]/);
    assert.match(script, /record\.origin === 'candidate' \? 'doctrine_signalements' : 'question_reports'/);
});

test('le tableau de bord utilise les données filtrées par le RPC guide', () => {
    assert.match(script, /rpc\/get_guide_candidate_dashboard/);
    assert.match(script, /body:\s*\{\s*p_candidate_id:\s*null\s*\}/);
    assert.match(script, /guide_course_catalog\?select=/);
    assert.match(script, /function extractModuleProgressEvents\(payload\)/);
    assert.match(script, /candidateRequest\.then\(function \(payload\)/);
    assert.match(script, /rpc\/get_guide_candidate_dashboard/);
    assert.doesNotMatch(script, /doctrine_progress_events\?select=user_id,module_id,event_type/);
    assert.match(guideModuleSql, /event\.module_id in \('1', '2', '3', '4', '5', '6', '7'\)/);
    assert.match(script, /candidate_admission_tracking\?on_conflict=candidate_id/);
    assert.match(script, /Oraux blancs réalisés/);
    assert.match(script, /Objectif d’oraux blancs/);
    assert.match(script, /Date du prochain oral/);
    assert.match(script, /Suivi du CCPM/);
    assert.match(script, /Suivi d’admission/);
    assert.match(script, /Correction assistée par IA/);
    assert.match(script, /Grille interactive d’évaluation BM4/);
    assert.match(script, /fiche de proposition \(70 %\)/);
    assert.match(script, /support oral \(30 %\)/);
    assert.match(script, /moyenne pondérée de l’épreuve/);
    assert.match(script, /axes d’amélioration selon la grille officielle/);
    assert.match(script, /Le compte rendu PDF officiel est généré après son enregistrement/);
    assert.match(script, /grille-evaluation-synthese-bm4-interactive\.pdf/);
    assert.match(css, /\.og-dashboard-ai-grid-card/);
    assert.match(css, /\.og-dashboard-ai-grid-link/);
    assert.match(script, /renderAiCorrection\(candidate\)/);
    assert.match(script, /Ouvrir la fiche de proposition/);
    assert.match(script, /Ouvrir la fiche support oral/);
    assert.match(script, /Évaluer avec la grille BM4/);
    assert.match(script, /Correction IA — Proposition/);
    assert.match(script, /Correction IA — Fichette orale/);
    assert.match(script, /openCandidatePdf\(candidate, submission/);
    assert.match(script, /openDashboardReview\(candidate, submission, false\)/);
    assert.match(script, /openDashboardReview\(candidate, submission, true\)/);
    assert.match(script, /functionsApi\('\/functions\/v1\/correct-fiche-ai'/);
    assert.match(script, /fiche_reviews\?on_conflict=submission_id/);
    assert.match(script, /ogDashboardReviewDialog/);
    assert.match(script, /relativeStorageUrl\(signedUrl\)/);
    assert.match(script, /window\.top\.DoctrineViewer/);
    assert.match(viewerScript, /panneau\.style\.zIndex = '2147483647'/);
    assert.match(viewerScript, /panneau\.focus\(\{ preventScroll: true \}\)/);
    assert.match(viewerCss, /z-index:\s*2147483647/);
    assert.match(script, /og-dashboard-review-criteria/);
    assert.match(script, /accordion\('Suivi d’admission'[\s\S]*?content\.append\(renderOralTracking\(candidate\)\);[\s\S]*?content\.append\(renderCcpmTracking\(candidate\)\)/);

    assert.match(script, /Note CCPM \/ 20/);
    assert.match(script, /Notes de l’Officier Guide/);
    assert.match(script, /CCPM validé/);
    assert.match(script, /ccpm_score: numericScore/);
    assert.match(script, /guide_notes: notes\.value\.trim\(\) \|\| null/);
    assert.match(script, /ccpm_validated: validated\.checked/);
    assert.match(script, /doctrine_candidate_cvs\?select=candidate_id,storage_path,original_filename,uploaded_at/);
    assert.match(script, /Documents transmis/);
    assert.match(script, /candidateCvs\[candidate\.candidate && candidate\.candidate\.id\]/);
    assert.match(script, /Télécharger le document/);
    assert.match(script, /object\/sign\/candidate-cvs/);
    assert.doesNotMatch(script, /ccpm_date\s*:/);
    assert.match(script, /Progression des modules 1 à 7/);
    assert.match(script, /candidateFollowUpStatus/);
    assert.match(script, /EN DIFFICULTÉ/);
    assert.match(script, /À SURVEILLER/);
    assert.match(script, /PRÊT/);
    assert.match(script, /og-candidate-follow-up-status/);
    assert.match(script, /candidateFollowUpStatus\(candidate\)/);
    assert.match(css, /\.og-candidate-follow-up-status\.is-ok/);
    assert.match(css, /\.og-candidate-follow-up-status\.is-danger/);
    assert.match(css, /\.og-candidate-follow-up-status\.is-warning/);
    assert.doesNotMatch(script, /Suivi de mes candidats|og-dashboard-status-filters|og-dashboard-status-filter|function renderCandidates\(/);
    assert.doesNotMatch(script, /og-dashboard-candidate-group-title/);
    assert.doesNotMatch(script, /SUIVI NORMAL/);
    assert.match(script, /var guideRole = role === 'guide' \|\| role === 'officier_guide'/);
    assert.ok(script.includes('rôle guide/officier_guide ET champ profiles.speciality exactement égal à OG'));
    assert.match(script, /select=speciality/);
    assert.ok(script.includes('profile.speciality'));
    assert.ok(script.includes("=== 'OG'"));
    assert.doesNotMatch(script, /get_current_user_specialty|isGuideSpecialty/);
    assert.ok(script.includes('setGuideModulesHidden(false)'));
    assert.match(script, /querySelector\('\.study-dashboard'\)/);
    assert.match(script, /progressionCard\.hidden = isGuide/);
    assert.match(script, /progressionCard\.hidden = false/);
});

test('les supports OG sont fournis par le catalogue commun, sans créer de module', () => {
    const entries = seed.match(/\('(?:[^']|'')*',\s*'(?:[^']|'')*',\s*'(?:[^']|'')*',\s*'[A-Za-z0-9_-]+'\)/g) || [];
    assert.equal(entries.length, 30);
    assert.match(seed, /aucune progression candidat n'est modifiée/i);
});

test('l’interface possède des cartes, accordéons et styles responsive isolés', () => {
    assert.match(css, /\.og-dashboard-metric/);
    assert.match(css, /\.og-dashboard-candidate/);
    assert.match(css, /\.og-dashboard-course-group/);
    assert.match(css, /@media\s*\(max-width:\s*600px\)/);
    assert.match(css, /\.og-dashboard-overlay\[hidden\]/);
    assert.match(css, /\.og-dashboard-module-grid/);
    assert.match(css, /\.og-dashboard-oral-fields/);
    assert.match(css, /\.og-dashboard-review-dialog/);
    assert.match(css, /\.og-dashboard-review-criteria/);
    assert.match(css, /background:#26392f; color:#f2f5ee; caret-color:#e6c96f; color-scheme:dark/);
    assert.match(css, /\.og-dashboard-review-dialog select option \{ background:#26392f; color:#f2f5ee; \}/);
    assert.match(css, /Contraste renforcé des évaluations proposition et support oral/);
    assert.match(css, /\.og-dashboard-review-dialog input,\s*\.og-dashboard-review-dialog select,\s*\.og-dashboard-review-dialog textarea/);
    assert.match(css, /background-color:\s*#26392f !important/);
});

test('les exercices et corrections publiés s’ouvrent dans la visionneuse DOCTRINE', () => {
    assert.match(script, /openDriveInViewer\(exercise\.drive_url, exercise\.title\)/);
    assert.match(script, /openDriveInViewer\(correction\.drive_url, correction\.title\)/);
    assert.match(script, /EXERCISE_LEVELS/);
    assert.match(script, /'★'.repeat\(correctionLevel\)/);
    assert.doesNotMatch(script, /Fondamentaux|Application|Maîtrise|Expertise/);
    assert.doesNotMatch(script, /open\.target = '_blank'/);
    assert.match(viewerScript, /openDrive: ouvrirDrive/);
});


test('les exercices Officier Guide sont regroupés en quatre accordéons par difficulté', () => {
    assert.match(script, /og-dashboard-library-levels/);
    assert.match(script, /og-dashboard-library-level-group/);
    assert.match(script, /EXERCISE_LEVELS\.forEach/);
    assert.match(script, /Aucun exercice publié à ce niveau/);
    assert.match(script, /node\('button', 'og-dashboard-download', 'Télécharger'\)/);
    assert.match(script, /openDriveInViewer\(exercise\.drive_url, exercise\.title\)/);
    assert.match(script, /Corrections disponibles/);
    assert.match(css, /\.og-dashboard-library-level-group/);
    assert.match(css, /\.og-dashboard-library-level-group\[open\]/);
    assert.doesNotMatch(script, /Toutes les difficultés/);
});


test('le niveau est à gauche et le nombre cliquable à droite ouvre ou ferme son accordéon', () => {
    assert.match(script, /og-dashboard-library-level-title/);
    assert.match(script, /og-dashboard-library-level-count/);
    assert.match(script, /levelRows\.length \+ \(levelRows\.length > 1 \? ' exercices' : ' exercice'\)/);
    assert.match(script, /levelCount\.addEventListener\('click'/);
    assert.match(script, /group\.open = !group\.open/);
    assert.match(script, /summary\.addEventListener\('click'/);
    assert.match(css, /\.og-dashboard-library-level-group\[open\]/);
    assert.match(css, /\.og-dashboard-library-level-count \{[^}]*margin-left:auto/s);
    assert.match(css, /@media\(max-width:600px\)/);
    assert.doesNotMatch(css, /\.og-dashboard-library-level-heading::after/);
});


test('les étoiles des cartes sont petites et alignées sur les quatre niveaux', () => {
    assert.match(script, /og-dashboard-library-stars-icons/);
    assert.match(script, /og-dashboard-library-stars-label/);
    assert.match(script, /'★'\.repeat\(difficulty\)/);
    assert.match(css, /\.og-dashboard-library-stars-icons \{[^}]*flex:0 0 3\.6em[^}]*font-size:15px/s);
    assert.match(css, /\.og-dashboard-library-stars-label \{[^}]*font-size:13px/s);
});


test('les deux bibliothèques utilisent des cartes de largeur identique, titres blancs et compteurs jaunes', () => {
    assert.match(css, /\.og-dashboard-course-group, \.og-dashboard-library-level-group \{[^}]*width:100%[^}]*box-sizing:border-box/s);
    assert.match(css, /\.og-dashboard-accordion-title, \.og-dashboard-library-level-heading \{[^}]*width:100%[^}]*color:#f2f5ee/s);
    assert.match(css, /\.og-dashboard-count, \.og-dashboard-library-level-count \{[^}]*min-height:32px[^}]*border:1px solid rgba\(216,184,91/);
    assert.match(css, /\.og-dashboard-count, \.og-dashboard-library-level-count \{[^}]*border-radius:7px[^}]*color:#ffdc75[^}]*background:rgba\(216,184,91/);
    assert.match(css, /\.og-dashboard-accordion-title, \.og-dashboard-library-level-heading \{[^}]*width:100%[^}]*min-height:48px/);
    assert.match(css, /\.og-dashboard-library-level-group\[open\] \{ border-color:rgba\(183,207,185/);
    assert.match(css, /\.og-dashboard-library-level-count \{ cursor:pointer; \}/);
    assert.doesNotMatch(css, /\.og-dashboard-library-level-count \{[^}]*padding:0[^}]*border:0[^}]*background:transparent/s);
});


test('la page principale recharge la version du tableau de bord contenant les bibliothèques', () => {
    assert.match(html, /app\/guide-dashboard\.js\?v=20261127-INACTIVE-17D-2/);
    assert.ok(html.includes('pdf-lib@1.17.1/dist/pdf-lib.min.js'));
    assert.ok(html.indexOf('pdf-lib@1.17.1/dist/pdf-lib.min.js') < html.indexOf('app/guide-dashboard.js'));
    assert.ok(script.includes("await import('./bm4-official-pdf.mjs')"));
    assert.match(script, /libraryGrid\.append\(courseSection, exerciseSection\)/);
    assert.match(script, /BIBLIOTHÈQUE DES DOSSIERS D’EXERCICES ET CORRECTIONS/);
});

test('le dossier candidat Officier Guide propose les deux exports PDF BM4 avec les mêmes règles de validation', () => {
    assert.match(script, /function buildDossierBm4Report\(candidate, dossierItems\)/);
    assert.match(script, /data-rubric-observation/);
    assert.match(script, /data-rubric-evidence/);
    assert.match(script, /rubric_observations: totals\.observations/);
    assert.match(script, /rubric_evidence: totals\.evidence/);
    assert.match(script, /var displayCriteria = isOral/);
    assert.match(css, /\.og-dashboard-review-criterion-feedback/);
    assert.match(script, /form_observations: isOral \? null : totals\.observations\.form/);
    assert.match(script, /form_evidence: isOral \? null : totals\.evidence\.form/);
    assert.match(script, /rubricObservations: review\.rubric_observations/);
    assert.match(script, /rubricEvidence: review\.rubric_evidence/);
    assert.match(script, /var reviewRequest = candidateRequest\.then/);
    assert.match(script, /fiche_reviews\?select=submission_id,guide_id,form_observations,form_evidence,rubric_observations,rubric_evidence/);
    assert.match(script, /structuredReviews\.get\(String\(submission\.id\)/);
    assert.match(script, /review\.rubric_observations = structured\.rubric_observations/);
    assert.match(script, /review\.rubric_evidence = structured\.rubric_evidence/);
    assert.match(script, /function reviewGradeForExport\(submission, review\)/);
    assert.match(script, /createOfficialBm4Pdf\(report\)/);
    assert.match(script, /Télécharger la grille BM4 officielle/);
    assert.match(script, /Exporter l’évaluation finale pour le candidat/);
    assert.match(script, /proposition\.grade \* 0\.7 \+ oral\.grade \* 0\.3/);
    assert.match(script, /if \(hasProposition && hasOral && dossierReport\.weightedGrade !== null\)/);
    assert.match(script, /Evaluation_finale_BM4_/);
    assert.match(script, /Grille_BM4_Dossier_/);
    assert.match(css, /\.og-dashboard-dossier-exports \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(css, /@media\(max-width:600px\) \{ \.og-dashboard-dossier-exports \{ grid-template-columns:minmax\(0,1fr\); \} \}/);
});


test('le tableau de bord affiche un message explicite si le service IA est temporairement indisponible', () => {
    const unavailable = 'Service IA temporairement indisponible. Votre fiche n\'a pas été corrigée. Vous pouvez réessayer ultérieurement.';
    assert.match(script, /error\.status = response\.status/);
    assert.match(script, /error\.status === 502 \|\| error\.status === 503/);
    assert.ok(script.includes(unavailable));
});


test('le tableau Officier Guide bloque la modification si les observations structurées ne sont pas relues', () => {
    assert.match(script, /submission\.rubricFeedbackLoaded = !missingStructuredReview/);
    assert.match(script, /submission\.rubricFeedbackLoaded = false/);
    assert.match(script, /submission\.rubricFeedbackLoaded !== true/);
    assert.match(script, /modification est bloquée pour protéger les observations existantes/);
    assert.match(script, /Enregistrement bloqué : les observations structurées BM4/);
});


test('les cartes proposition et support oral affichent les commentaires complets de l’Officier Guide', () => {
    assert.match(script, /var title = isOral \? 'FICHE SUPPORT ORAL' : 'FICHE DE PROPOSITION'/);
    assert.match(script, /'Commentaires de l’Officier Guide'/);
    assert.match(script, /result\.textContent = String\(review\.comment\)/);
    assert.doesNotMatch(script, /commentText\.length > 360/);
    assert.doesNotMatch(script, /commentText\.slice\(0,\s*357\)/);
    assert.match(css, /\.og-dashboard-ai-result \{[^}]*white-space:pre-wrap/s);
    assert.match(css, /\.og-dashboard-ai-result \{[^}]*overflow-wrap:anywhere/s);
});


test('la correction IA affiche une pastille rouge pour les fiches proposition et oral en attente', () => {
    assert.match(script, /function pendingAiCorrectionCount\(candidate\)/);
    assert.match(script, /submission\.submission_type !== 'proposition' && submission\.submission_type !== 'support_oral'/);
    assert.match(script, /review\.status === 'en_attente'/);
    assert.match(script, /og-dashboard-ai-pending-badge/);
    assert.match(script, /pendingBadge\.hidden = pendingCount === 0/);
    assert.match(css, /\.og-dashboard-ai-pending-badge \{[^}]*background:#c93636/s);
    assert.match(css, /\.og-dashboard-ai-pending-badge\[hidden\] \{ display:none; \}/);
});

test('la correction IA est placée sous Dossier et documents demandés dans la fiche candidat', () => {
    const start = script.indexOf('function renderCandidateProfileDetail(target, candidate)');
    const end = script.indexOf('function openGuideCandidates()', start);
    const profile = script.slice(start, end);
    assert.match(profile, /og-candidate-profile-accordion/);
    assert.ok(profile.includes("accordion('Dossier et documents demandés'"));
    assert.ok(profile.includes("target.append(renderAiCorrection(candidate))"));
    assert.ok(profile.indexOf("accordion('Dossier et documents demandés'") < profile.indexOf('target.append(renderAiCorrection(candidate))'));
    assert.ok(!profile.includes('og-candidate-profile-ai-column'));
    const aiStart = script.indexOf('function renderAiCorrection(candidate)');
    const aiEnd = script.indexOf('\n    function ', aiStart + 20);
    const ai = script.slice(aiStart, aiEnd);
    assert.ok(ai.includes('og-candidate-profile-accordion og-candidate-profile-ai'));
    assert.ok(ai.includes('og-candidate-profile-accordion-content'));
    assert.ok(css.includes(".og-candidate-profile-accordion > summary::after { content:'＋'"));
    assert.ok(css.includes(".og-candidate-profile-accordion[open] > summary::after { content:'−'"));
    assert.ok(!ai.includes('og-dashboard-subaccordion'));
});

test('l’Officier Guide peut télécharger le CV transmis depuis la fiche candidat', () => {
    const start = script.indexOf('function renderCandidateProfileDetail(target, candidate)');
    const end = script.indexOf('function openGuideCandidates()', start);
    const profile = script.slice(start, end);
    assert.match(profile, /Télécharger le document/);
    assert.ok(profile.includes('downloadCandidateCv(candidate, cv, downloadCvButton)'));
    const downloadStart = script.indexOf('async function downloadCandidateCv(candidate, cv, button)');
    const downloadEnd = script.indexOf('async function openCandidatePdf', downloadStart);
    const download = script.slice(downloadStart, downloadEnd);
    assert.ok(download.includes('object/sign/candidate-cvs/'));
    assert.ok(download.includes('download: filename'));
    assert.ok(download.includes('link.click()'));
});

test('la fiche candidat utilise des accordéons repliés et ne duplique pas les statistiques QCM', () => {
    const start = script.indexOf('function renderCandidateProfileDetail(target, candidate)');
    const end = script.indexOf('function openGuideCandidates()', start);
    const profile = script.slice(start, end);
    assert.match(profile, /og-candidate-profile-accordion/);
    assert.match(profile, /accordion\('Progression des modules 1 à 7'/);
    assert.match(profile, /progressSection/);
    assert.match(profile, /Suivi d’admission/);
    assert.match(profile, /Dossier et documents demandés/);
    assert.doesNotMatch(profile, /Activité documentaire|og-candidate-profile-activity|doctrine\.documents/);
    assert.doesNotMatch(profile, /accordion\('Correction assistée par IA'/);
    assert.match(profile, /target\.append\(renderAiCorrection\(candidate\)\)/);
    assert.match(profile, /renderOralTracking\(candidate\)/);
    assert.match(profile, /renderCcpmTracking\(candidate\)/);
    assert.match(profile, /renderAiCorrection\(candidate\)/);
    assert.doesNotMatch(profile, /renderQcmCandidateDetail|Moyenne générale|QCM enregistrés|Tentatives QCM/);
    assert.match(profile, /moduleNumber <= 7/);
});


test('la fiche candidat est alimentée par les sources réelles et expose les états de disponibilité', () => {
    const start = script.indexOf('function renderCandidateProfileDetail(target, candidate)');
    const end = script.indexOf('function openGuideCandidates()', start);
    const profile = script.slice(start, end);
    assert.match(profile, /candidate\.doctrine/);
    assert.match(profile, /doctrine\.progress_events/);
    assert.match(profile, /moduleState\(candidate, String\(moduleNumber\)\)/);
    assert.match(profile, /Fiches soumises/);
    assert.match(profile, /Fiches validées/);
    assert.match(profile, /doctrine\.last_activity/);
    assert.match(profile, /renderOralTracking\(candidate\)/);
    assert.match(profile, /renderCcpmTracking\(candidate\)/);
    assert.match(profile, /candidateCvs\[candidate\.candidate && candidate\.candidate\.id\]/);
    assert.match(profile, /Documents transmis/);
    assert.doesNotMatch(profile, /doctrine\.documents|activité documentaire/i);
    assert.match(profile, /renderAiCorrection\(candidate\)/);
    assert.match(script, /function extractModuleProgressEvents\(payload\)/);
    assert.match(script, /rpc\/get_guide_candidate_dashboard/);
    assert.doesNotMatch(script, /api\('doctrine_progress_events\?select=user_id,module_id,event_type,created_at/);
    assert.match(script, /api\('doctrine_candidate_cvs\?select=candidate_id,storage_path,original_filename,uploaded_at/);
    assert.match(script, /api\('candidate_admission_tracking\?on_conflict=candidate_id/);
    assert.doesNotMatch(profile, /Moyenne QCM|Tentatives QCM|qcmAverage\(/);
});


test('les indicateurs administratifs sont regroupés dans une carte responsive de la fiche candidat', () => {
    const start = script.indexOf('function renderCandidateProfileDetail(target, candidate)');
    const end = script.indexOf('function openGuideCandidates()', start);
    const profile = script.slice(start, end);
    assert.match(profile, /og-candidate-profile-summary-card/);
    assert.match(profile, /Fiches soumises/);
    assert.match(profile, /Fiches validées/);
    assert.match(profile, /Dernière activité/);
    assert.doesNotMatch(profile, /Moyenne QCM|Tentatives QCM/);
    assert.match(css, /\.og-candidate-profile-summary-card\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/s);
    assert.match(css, /@media\(max-width:520px\)[\s\S]*?\.og-candidate-profile-summary-card\s*\{\s*grid-template-columns:minmax\(0,1fr\)/);
    assert.ok(profile.indexOf("['Fiches validées'") < profile.indexOf("['Dernière activité'"));
});


test('le mode administrateur reprend le tableau de bord et isole les candidats OG dans un accordéon replié', () => {
    assert.match(script, /function adminAccess\(\)/);
    assert.match(script, /function openAdminDashboard\(\)/);
    assert.match(script, /function adminLaunchRequested\(\)/);
    assert.match(script, /new URLSearchParams\(window\.location\.search\)\.get\('admin'\) === '1'/);
    assert.match(script, /if \(adminLaunchRequested\(\) \|\| \(auth\(\) && auth\(\)\.estAdmin\(\)\)\) openAdminDashboard\(\)/);
    assert.match(script, /if \(adminLaunchRequested\(\) \|\| \(auth\(\) && auth\(\)\.estAdmin\(\)\)\) openAdminDashboard\(\)/);
    assert.match(script, /À chaque connexion, un compte portant le rôle administrateur/);
    assert.doesNotMatch(cohortDashboardScript, /adm-admin-dashboard-toolbar|doctrine:admin-dashboard/);
    assert.match(script, /doctrine:admin-dashboard/);
    assert.match(script, /dashboardTitleNode\.textContent = 'Espace Administrateur'/);
    assert.match(script, /function isOgCandidate\(candidate\)/);
    assert.match(script, /var regularCandidates = dashboardMode === 'admin'/);
    assert.match(script, /var ogCandidates = dashboardMode === 'admin'/);
    assert.match(script, /var ogGroup = node\('details', 'og-dashboard-candidate-group og-dashboard-admin-og-group'\)/);
    assert.match(script, /OFFICIERS GUIDES — '/);
    assert.match(script, /ogGroup\.append\(ogGroupItems\)/);
    assert.match(script, /sidebar\.append\(ogGroup\)/);
});


test('le contrôle Officier Guide ne ferme pas le tableau de bord administrateur', () => {
    const start = script.indexOf('function updateTrigger()');
    const end = script.indexOf('function adminLaunchRequested()', start);
    const updateTrigger = script.slice(start, end);
    assert.match(updateTrigger, /dashboardMode !== 'admin' && root && !root\.hidden\) close\(\)/);
    assert.match(updateTrigger, /dashboardMode !== 'admin' && root && !root\.hidden\) close\(\)/);
});

test('le rôle admin transmis par QCM-MAJOR est reconnu côté navigateur et côté Supabase', () => {
    assert.match(authScript, /claims\.role === 'admin'/);
    assert.match(authScript, /meta\.role === 'admin'/);
    assert.match(adminRoleSql, /auth\.jwt\(\) ->> 'role'\) = 'admin'/);
    assert.match(adminRoleSql, /auth\.jwt\(\) -> 'app_metadata' ->> 'role'\) = 'admin'/);
    assert.match(script, /api\('rpc\/doctrine_is_admin'/);
});

test('les propositions de cours OG sont affichées dans une carte indépendante sous les bibliothèques', () => {
    const start = script.indexOf('function renderCourses()');
    const end = script.indexOf('function load()', start);
    const render = script.slice(start, end);
    assert.match(script, /var courseProposalArea = null/);
    assert.match(script, /courseProposalArea = dashboardMode === 'admin' \? node\('div', 'og-dashboard-course-proposal-area'\) : null/);
    assert.match(script, /panel\.append\(libraryGrid\);[\s\S]*?panel\.append\(courseProposalArea\)/);
    assert.match(render, /courseProposalArea\.replaceChildren\(courseProposalList\)/);
    assert.doesNotMatch(render, /coursesNode\.append\(courseProposalList\)/);
    assert.match(css, /\.og-dashboard-course-proposal-area/);
    assert.match(css, /\.og-dashboard-course-proposals \{[^}]*padding:14px/s);
});

test('le suivi QCM-MAJOR global exclut les 8 profils Officier Guide du total des candidats', () => {
    const start = script.indexOf('function openGuideQcmTracking()');
    const end = script.indexOf('// Fiche individuelle', start);
    const tracking = script.slice(start, end);
    assert.match(tracking, /var qcmCandidates = dashboardMode === 'admin' \? candidates\.filter\(function \(candidate\) \{ return !isOgCandidate\(candidate\); \}\) : candidates/);
    assert.match(tracking, /qcmCandidates\.length \+ ' candidat\(s\) dans '/);
    assert.match(tracking, /var adminOgCandidates = dashboardMode === 'admin' \? qcmCandidates : \[\]/);
    assert.match(tracking, /dashboardMode === 'admin' \|\| isOgCandidate\(candidate\)/);
    assert.match(tracking, /CANDIDATS QCM-MAJOR/);
});

test('la navigation globale des candidats utilise les flèches précédent et suivant comme QCM-MAJOR', () => {
    const start = script.indexOf('function openGuideCandidates()');
    const end = script.indexOf('function renderMetrics()', start);
    const navigation = script.slice(start, end);
    assert.match(navigation, /og-candidate-stepper/);
    assert.match(navigation, /Candidat précédent/);
    assert.match(navigation, /Candidat suivant/);
    assert.match(navigation, /showCandidate\(selectedIndex - 1\)/);
    assert.match(navigation, /showCandidate\(selectedIndex \+ 1\)/);
    assert.match(navigation, /Candidat ' \+ \(selectedIndex \+ 1\) \+ ' \/ '/);
});


test('la bibliothèque exercices et corrections est commune, avec gestion admin de publication', () => {
    const start = script.indexOf("var libraryGrid = node('div', 'og-dashboard-pedagogical-libraries')");
    const end = script.indexOf('// Carte de proposition documentaire', start);
    const libraries = script.slice(start, end);
    assert.match(libraries, /libraryGrid\.append\(courseSection, exerciseSection\)/);
    assert.match(libraries, /6 catégories · Supports consultables et téléchargeables\./);
    assert.match(script, /if \(dashboardMode === 'admin'\) \{[\s\S]*?\+ Ajouter un cours/);
    assert.match(script, /if \(dashboardMode === 'admin'\) \{[\s\S]*?'Modifier'/);
    assert.match(script, /if \(dashboardMode === 'admin'\) \{[\s\S]*?'Supprimer'/);
    assert.match(script, /if \(root && root\.dataset\.dashboardMode === dashboardMode\) return/);
    assert.match(script, /root\.dataset\.dashboardMode = dashboardMode/);
    assert.match(script, /exerciseSection\.id = 'ogExerciseLibraryEntry'/);
    assert.match(css, /\.og-dashboard-exercise-library-entry\s*\{[\s\S]*?display:block !important/);
    assert.match(script, /BIBLIOTHÈQUE DES SUPPORTS OFFICIER GUIDE/);
    assert.match(script, /BIBLIOTHÈQUE DES DOSSIERS D’EXERCICES ET CORRECTIONS/);
    assert.match(script, /4 niveaux · Exercices et corrections publiés, consultables et téléchargeables\./);
    assert.match(script, /function setExerciseLibraryPublished\(type, item, published\)/);
    assert.match(script, /body: \{ is_published: !!published, updated_at: new Date\(\)\.toISOString\(\) \}/);
    assert.match(script, /exercise\.is_published \? 'Désactiver' : 'Réactiver'/);
    assert.match(script, /correction\.is_published \? 'Désactiver' : 'Réactiver'/);
    assert.match(script, /Publier pour les Officiers Guides/);
    assert.match(script, /dashboardMode === 'admin'/);
    assert.match(script, /is_published=eq\.true/);
});


test('le clic sur le signalement ouvre la saisie OG ou la vue admin unifiée selon le rôle', () => {
    assert.match(script, /if \(definition\.kind === 'signalement' && dashboardMode === 'admin'\) openAdminSignalements\(\)/);
    assert.match(script, /function openAdminSignalements\(\)/);
    assert.match(script, /guide_signalements\?select=id,guide_email,payload,priority,status,admin_response,created_at/);
    assert.match(script, /doctrine_signalements\?select=id,candidate_email,incident_type,module_id,resource,details,priority,status,admin_response,created_at/);
    assert.match(script, /Toutes les origines/);
    assert.match(script, /Officiers Guides/);
    assert.match(script, /Candidats/);
    assert.match(script, /Enregistrer le traitement/);
    assert.match(script, /processed_by:claims && claims\.sub/);
    assert.match(css, /\.og-dashboard-admin-signalement-controls/);
    assert.match(css, /@media\(max-width:680px\)/);
});

test('la migration harmonise les statuts candidats sans désactiver RLS', async () => {
    const migration = await readFile(new URL('../supabase/guide-admin-signalements-harmonization.sql', import.meta.url), 'utf8');
    assert.match(migration, /add column if not exists admin_response/);
    assert.match(migration, /pending.*submitted/);
    assert.match(migration, /in_review.*action_required.*resolved.*closed/s);
    assert.doesNotMatch(migration, /disable row level security/i);
});

test('la carte Signalement admin affiche une pastille globale pour les trois origines et actualise le compteur', () => {
    assert.match(script, /function refreshAdminSignalementBadge\(badge\)/);
    assert.match(script, /guide_signalements\?select=id,status&limit=500/);
    assert.match(script, /doctrine_signalements\?select=id,status&limit=500/);
    assert.match(script, /question_reports\?select=id,status&limit=500/);
    assert.match(script, /og-dashboard-signalement-badge/);
    assert.match(script, /setInterval\(function \(\) \{[\s\S]*?refreshAdminSignalementBadge\(signalementBadge\)/);
    assert.match(script, /pending === 0/);
});

test('la pastille RETEX ne compte que les fiches non lues et conserve la lecture par administrateur', () => {
    assert.match(script, /function refreshAdminRetexBadge\(badge\)/);
    assert.match(script, /retex_responses\?select=id&limit=2000/);
    assert.match(script, /guide_retex_reports\?select=id&limit=2000/);
    assert.match(script, /doctrine_retex_reads\?select=source,retex_id&limit=10000/);
    assert.match(script, /badge\.hidden = total === 0/);
    assert.match(script, /function markRetexRead\(row, sourceKey, button, state\)/);
    assert.match(script, /on_conflict=admin_id%2Csource%2Cretex_id/);
    assert.match(script, /Marquer comme lu/);
    assert.match(script, /IntersectionObserver/);
    assert.match(script, /intersectionRatio < 0\.1/);
    assert.match(script, /observedSource/);
    assert.match(script, /readObserver\.disconnect\(\)/);
    assert.match(script, /RETEX non lu/);
    assert.match(script, /adminRetexRefreshTimer = setInterval/);
});
test('la migration RETEX lus protège les lectures par RLS et ne désactive jamais RLS', async () => {
    const migration = await readFile(new URL('../supabase/retex-read-status.sql', import.meta.url), 'utf8');
    assert.match(migration, /admin_id uuid not null default auth\.uid\(\)/);
    assert.match(migration, /primary key \(admin_id, source, retex_id\)/);
    assert.match(migration, /enable row level security/);
    assert.match(migration, /doctrine_is_admin\(\)/);
    assert.doesNotMatch(migration, /disable row level security/i);
});

test('la consultation RETEX QCM-MAJOR est réservée aux administrateurs', () => {
    assert.match(script, /function openAdminRetex\(\)/);
    const start = script.indexOf('function openAdminRetex()');
    const end = script.indexOf('function guideFeedbackDialog(kind)', start);
    const adminRetex = script.slice(start, end);
    assert.match(adminRetex, /adminAccess\(\)\.then\(function \(allowed\)/);
    assert.ok(adminRetex.indexOf('if (!allowed || dashboardMode !== \'admin\')') < adminRetex.indexOf('Promise.all([api(sources[sourceKey].query), refreshReadEntries()])'));
    assert.match(adminRetex, /refusée ou indisponible/);
    assert.match(adminRetex, /Exporter la synthèse en PDF/);
    assert.match(adminRetex, /Tous les retours enregistrés/);
    assert.match(script, /else if \(definition\.kind === 'retex' && dashboardMode === 'admin'\) openAdminRetex\(\)/);
    assert.match(script, /else openGuideFeedback\(definition\.kind\)/);
    assert.match(adminRetex, /guide_retex_reports/);
});

test('la consultation administrateur distingue les RETEX QCM-MAJOR et les RETEX des Officiers Guides OG', () => {
    const start = script.indexOf('function openAdminRetex()');
    const end = script.indexOf('function guideFeedbackDialog(kind)', start);
    const adminRetex = script.slice(start, end);
    assert.match(adminRetex, /RETEX QCM-MAJOR/);
    assert.match(adminRetex, /conic-gradient/);
    assert.match(adminRetex, /Commentaires libres/);
    assert.match(adminRetex, /function exportPdf\(\)/);
    assert.match(adminRetex, /RETEX Officier Guide OG/);
    assert.match(adminRetex, /guide_retex_reports\?select=id,user_id,guide_email,payload,priority,status,admin_response,created_at,updated_at/);
    assert.match(adminRetex, /retex_responses\?select=/);
    assert.match(adminRetex, /row\.payload \|\| \{\}/);
    assert.match(adminRetex, /Q11 — Principal point fort de l’application/);
    assert.match(adminRetex, /Q14 — Recommandations pour l’accompagnement BM4/);
    assert.match(adminRetex, /Réponse de l’administration/);
    assert.match(adminRetex, /!\['themes', 'navigation', 'design', 'best_mode', 'scoring_opinion'/);
    assert.match(adminRetex, /'used_report_form', 'recommendation'/);
    assert.match(adminRetex, /Exporter la synthèse en PDF/);
    assert.match(adminRetex, /function makeChart\(question\)/);
    assert.match(adminRetex, /pie-svg/);
    assert.match(adminRetex, /<svg class="pie-svg"/);
    assert.match(adminRetex, /<path d=/);
    assert.match(adminRetex, /print-color-adjust:exact/);
    assert.match(adminRetex, /Facilité d’utilisation/);
    assert.match(adminRetex, /Suivi des candidats/);
    assert.match(adminRetex, /Retours détaillés des Officiers Guides/);
    assert.match(adminRetex, /sources\.guide\.chartQuestions\.some/);
    assert.match(adminRetex, /chartQuestion\[0\] === question\[0\]/);
    assert.match(adminRetex, /pdfChartQuestions\.map\(makeChart\)/);
    assert.match(adminRetex, /Statut de traitement/);
    assert.match(adminRetex, /Réponse de l’administration/);
    assert.match(adminRetex, /adminAccess\(\)\.then\(function \(allowed\)/);
    assert.match(adminRetex, /if \(!allowed \|\| dashboardMode !== 'admin'\)/);
    assert.match(adminRetex, /responses\.hidden = false/);
});


test('les trois indicateurs Fiches soumises, Fiches validées et Dernière activité sont sur une ligne sur ordinateur', () => {
    assert.match(css, /\.og-candidate-workspace \.og-candidate-profile-summary-card \{ order:0; grid-template-columns:repeat\(3,minmax\(0,1fr\)\); \}/);
    assert.match(css, /@media\(max-width:520px\)[\s\S]*?\.og-candidate-workspace \.og-candidate-profile-summary-card \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\); \}/);
    assert.match(css, /@media\(max-width:360px\)[\s\S]*?\.og-candidate-workspace \.og-candidate-profile-summary-card \{ grid-template-columns:minmax\(0,1fr\); \}/);
});


test('le pseudo candidat passe en rouge vif uniquement après rappel QCM envoyé et 17 jours sans reprise', () => {
    assert.match(cohortDashboardScript, /qcm_inactivity_emails\?select=user_id,activity_at,status,sent_at/);
    assert.match(cohortDashboardScript, /reminder\.status === 'sent'/);
    assert.match(cohortDashboardScript, /reminder\.sent_at/);
    assert.match(cohortDashboardScript, /last <= activity/);
    assert.match(cohortDashboardScript, /Date\.now\(\) - activity >= 17 \* 86400000/);
    assert.match(cohortDashboardScript, /anc-cohort-name-inactive-17d/);
    const start = script.indexOf('function renderCandidateProfileDetail(target, candidate)');
    const end = script.indexOf('function openGuideCandidates()', start);
    const profile = script.slice(start, end);
    assert.match(profile, /inactivityEmail\.status === 'sent'/);
    assert.match(profile, /inactivityEmail\.sent_at/);
    assert.match(profile, /lastActivityTimestamp <= notificationActivityTimestamp/);
    assert.match(profile, /Date\.now\(\) - notificationActivityTimestamp >= 17 \* 24 \* 60 \* 60 \* 1000/);
    assert.match(profile, /dashboardMode === 'admin' && inactiveFor17Days/);
    assert.match(profile, /pseudoNode\.classList\.add\('is-inactive-17-days'\)/);
    assert.match(script, /qcm_inactivity_emails\?select=user_id,activity_at,status,sent_at/);
    assert.match(script, /order=activity_at\.desc/);
    assert.doesNotMatch(script, /status=eq\.sent&sent_at=not\.is\.null/);
    assert.match(css, /\.og-candidate-profile-pseudo\.is-inactive-17-days/);
    assert.match(css, /color:#ff2020/);
});

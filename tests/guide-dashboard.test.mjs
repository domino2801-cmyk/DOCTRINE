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
    assert.ok(script.includes('og-candidate-profile-columns'));
    assert.ok(script.includes('og-candidate-profile-ai-column'));
    assert.ok(css.includes('.og-candidate-profile-columns'));
    assert.ok(css.includes('grid-template-columns:minmax(0,1.55fr) minmax(320px,.85fr)'));
    assert.ok(script.includes('SUIVI QCM-MAJOR'));
    assert.ok(script.includes('Historique complet des résultats enregistrés'));
    assert.ok(script.includes('historyContent.hidden = true'));
    assert.ok(script.includes('og-dashboard-qcm-tracking'));
    assert.ok(script.includes('Progression des modules 1 à 7'));
    assert.ok(script.includes('Correction assistée par IA'));
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
    assert.match(script, /Faits constatés et conséquences/);
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


test('le tableau de bord utilise les données filtrées par le RPC guide', () => {
    assert.match(script, /rpc\/get_guide_candidate_dashboard/);
    assert.match(script, /body:\s*\{\s*p_candidate_id:\s*null\s*\}/);
    assert.match(script, /guide_course_catalog\?select=/);
    assert.match(script, /doctrine_progress_events\?select=user_id,module_id,event_type/);
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
    assert.match(script, /Ouvrir l’exercice/);
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


test('la page principale charge pdf-lib avant les exports PDF du dossier Officier Guide', () => {
    assert.ok(html.includes('pdf-lib@1.17.1/dist/pdf-lib.min.js'));
    assert.ok(html.indexOf('pdf-lib@1.17.1/dist/pdf-lib.min.js') < html.indexOf('app/guide-dashboard.js'));
    assert.ok(script.includes("await import('./bm4-official-pdf.mjs')"));
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


test('les accordéons de la fiche candidat et la correction IA partagent le même style +/− avec une colonne IA dédiée', () => {
    const start = script.indexOf('function renderCandidateProfileDetail(target, candidate)');
    const end = script.indexOf('function openGuideCandidates()', start);
    const profile = script.slice(start, end);
    assert.match(profile, /og-candidate-profile-accordion/);
    assert.ok(profile.includes('profileAi.append(renderAiCorrection(candidate))'));
    assert.ok(profile.includes("node('aside', 'og-candidate-profile-ai-column')"));
    assert.ok(profile.includes("node('div', 'og-candidate-profile-main')"));
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
    assert.match(profile, /profileAi\.append\(renderAiCorrection\(candidate\)\)/);
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
    assert.match(script, /api\('doctrine_progress_events\?select=user_id,module_id,event_type,created_at/);
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
    assert.match(css, /\.og-candidate-profile-summary-card\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);
    assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.og-candidate-profile-summary-card\s*\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
    assert.match(css, /@media\(max-width:520px\)[\s\S]*?\.og-candidate-profile-summary-card\s*\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(css, /@media\(max-width:390px\)[\s\S]*?\.og-candidate-profile-summary-card\s*\{\s*grid-template-columns:minmax\(0,1fr\)/);
});


test('le mode administrateur reprend le tableau de bord et isole les candidats OG dans un accordéon replié', () => {
    assert.match(script, /function adminAccess\(\)/);
    assert.match(script, /function openAdminDashboard\(\)/);
    assert.match(script, /function adminLaunchRequested\(\)/);
    assert.match(script, /new URLSearchParams\(window\.location\.search\)\.get\('admin'\) === '1'/);
    assert.match(script, /if \(adminLaunchRequested\(\)\) openAdminDashboard\(\)/);
    assert.match(script, /if \(adminLaunchRequested\(\)\) openAdminDashboard\(\)/);
    assert.match(script, /Ne pas conditionner l'ouverture à jeton\(\)/);
    assert.doesNotMatch(cohortDashboardScript, /adm-admin-dashboard-toolbar|doctrine:admin-dashboard/);
    assert.match(script, /doctrine:admin-dashboard/);
    assert.match(script, /dashboardTitleNode\.textContent = 'Espace Administrateur'/);
    assert.match(script, /function isOgCandidate\(candidate\)/);
    assert.match(script, /var regularCandidates = dashboardMode === 'admin'/);
    assert.match(script, /var ogCandidates = dashboardMode === 'admin'/);
    assert.match(script, /var ogGroup = node\('details', 'og-dashboard-candidate-group og-dashboard-admin-og-group'\)/);
    assert.match(script, /OFFICIERS GUIDES — '/);
    assert.match(script, /ogGroup\.append\(ogGroupItems\)/);
    assert.match(script, /workspace\.append\(ogGroup\)/);
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

test('le suivi QCM-MAJOR global affiche le stepper à gauche, les Officiers Guides dessous et la fiche candidat à droite', () => {
    const start = script.indexOf('function openGuideQcmTracking()');
    const end = script.indexOf('// Fiche individuelle', start);
    const tracking = script.slice(start, end);
    assert.match(tracking, /candidates\.filter\(function \(candidate\) \{ return !isOgCandidate\(candidate\); \}\)/);
    assert.match(tracking, /qcmCandidates\.length \+ ' candidat\(s\) dans '/);
    assert.match(tracking, /CANDIDATS QCM-MAJOR — ' \+ qcmCandidates\.length/);
    assert.match(tracking, /og-candidate-stepper/);
    assert.match(tracking, /Candidat précédent/);
    assert.match(tracking, /Candidat suivant/);
    assert.match(tracking, /Candidat ' \+ \(selectedIndex \+ 1\) \+ ' \/ '/);
    assert.match(tracking, /OFFICIERS GUIDES — ' \+ ogCandidates\.length \+ ' compte\(s\)'/);
    assert.match(tracking, /sidebar\.append\(ogGroup\)/);
    assert.match(tracking, /layout\.append\(sidebar, detail\)/);
    assert.match(tracking, /renderCandidateProfileDetail\(detail, candidate\)/);
    assert.doesNotMatch(tracking, /og-qcm-og-navigator|renderQcmCandidateDetail/);
    assert.match(css, /\.og-qcm-global-follow-up-layout \{ grid-template-columns:minmax\(260px,\.72fr\) minmax\(0,1\.8fr\)/);
    assert.match(css, /@media\(max-width:850px\)[\s\S]*?\.og-qcm-global-follow-up-layout \{ grid-template-columns:minmax\(0,1fr\)/);
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

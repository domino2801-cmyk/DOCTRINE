import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, script, css, seed, viewerScript, viewerCss, appScript] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app/guide-dashboard.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/guide-dashboard.css', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/patches/2026-11-22-guide-course-catalog-seed.sql', import.meta.url), 'utf8'),
    readFile(new URL('../viewer/viewer.js', import.meta.url), 'utf8'),
    readFile(new URL('../viewer/viewer.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/app.js', import.meta.url), 'utf8')
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
    assert.match(script, /var ids = \['1', '2', '3', '4', '5', '6', '7', '8'\]/);
    assert.match(script, /navigateModule.*module\(\[1-8\]\)/);
    assert.match(script, /og-guide-entry-only/);
    assert.match(css, /body\.og-guide-entry-only nav ul \{ justify-content:center; \}/);
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
    assert.doesNotMatch(script, /btn-mod8|modal-module8/i);
    assert.match(script, /SUIVI QCM-MAJOR/);
    assert.match(script, /Suivi individuel par candidat de ma cohorte/);
    assert.match(script, /dataset\.guideAction = 'qcm-major-tracking'/);
    assert.match(script, /function openGuideQcmTracking\(\)/);
    assert.match(script, /window\.location\.href = 'app\/guide-module8\.html\?embedded=1'/);
    assert.doesNotMatch(script, /guide_action|og-dashboard-ai-frame/);
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
    assert.match(script, /Suivi admissibilité/);
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
    assert.match(script, /eligibility\.append\(renderOralTracking\(candidate\)\)/);
    assert.match(script, /eligibility\.append\(renderCcpmTracking\(candidate\)\)/);

    assert.match(script, /Note CCPM \/ 20/);
    assert.match(script, /Notes de l’Officier Guide/);
    assert.match(script, /CCPM validé/);
    assert.match(script, /ccpm_score: numericScore/);
    assert.match(script, /guide_notes: notes\.value\.trim\(\) \|\| null/);
    assert.match(script, /ccpm_validated: validated\.checked/);
    assert.match(script, /'ccpm_date'/);
    assert.match(script, /doctrine_candidate_cvs\?select=candidate_id,storage_path,original_filename,uploaded_at/);
    assert.match(script, /CV du candidat/);
    assert.match(script, /Non fourni/);
    assert.match(script, /Fourni/);
    assert.match(script, /object\/sign\/doctrine-candidate-cv/);
    assert.match(script, /Préparer le téléchargement/);
    assert.doesNotMatch(script, /ccpm_date\s*:/);
    assert.match(script, /Progression des modules 1 à 7/);
    assert.match(script, /candidateFollowUpStatus/);
    assert.match(script, /EN DIFFICULTÉ/);
    assert.match(script, /À SURVEILLER/);
    assert.match(script, /PRÊT/);
    assert.doesNotMatch(script, /SUIVI NORMAL/);
    assert.match(script, /var guideRole = role === 'guide' \|\| role === 'officier_guide'/);
    assert.ok(script.includes('rôle guide/officier_guide ET champ profiles.speciality exactement égal à OG'));
    assert.match(script, /select=speciality/);
    assert.ok(script.includes('profile.speciality'));
    assert.ok(script.includes("=== 'OG'"));
    assert.doesNotMatch(script, /get_current_user_specialty|isGuideSpecialty/);
    assert.ok(script.includes('setGuideModulesHidden(true)'));
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

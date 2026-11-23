import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, script, css, seed, viewerScript, viewerCss] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app/guide-dashboard.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/guide-dashboard.css', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/patches/2026-11-22-guide-course-catalog-seed.sql', import.meta.url), 'utf8'),
    readFile(new URL('../viewer/viewer.js', import.meta.url), 'utf8'),
    readFile(new URL('../viewer/viewer.css', import.meta.url), 'utf8')
]);

test('l’espace Officier Guide est chargé séparément des modules existants', () => {
    assert.match(html, /app\/guide-dashboard\.css/);
    assert.match(html, /app\/guide-dashboard\.js/);
    assert.match(script, /guideDashboardNav/);
    assert.match(script, /applyGuideModuleVisibility\(\)/);
    assert.match(script, /currentGuideStatus\(\)\.then\(function \(isGuide\)/);
    assert.match(script, /auth\(\)\.specialite\(\)/);
    assert.match(script, /style\.setProperty\('display', 'none', 'important'\)/);
    assert.match(script, /getElementById\('btn-mod' \+ id\)/);
    assert.match(script, /module-nav-button\[onclick\]/);
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
    assert.match(script, /FICHE RETEX DOCTRINE/);
    assert.match(script, /RETEX déjà envoyé/);
    assert.match(script, /FICHE DE SIGNALEMENT/);
    assert.match(script, /Rédiger et transmettre un signalement/);
    assert.match(script, /openModule7Form\('retexCard', 'retexForm'\)/);
    assert.match(script, /openModule7Form\('signalementCard', 'signalementForm'\)/);
    assert.match(script, /close\(\);\s*window\.openModal\('module7'\)/, 'le tableau de bord doit être fermé avant le Module 7');
    assert.match(script, /if \(form\.hidden\) heading\.click\(\)/);
    assert.match(script, /window\.openModal\('module7'\)/);
    assert.match(script, /rpc\/assign_guide_candidate_by_code/);
    assert.match(script, /p_code: code/);
    assert.match(script, /Code candidat de 8 caractères/);
    assert.match(css, /\.og-dashboard-metric-action/);
    assert.match(css, /\.og-dashboard-assign-dialog/);
    assert.match(script, /id = 'guideDashboard'/);
    assert.doesNotMatch(script, /btn-mod8|modal-module8/i);
    assert.doesNotMatch(script, /app\/guide-module8\.html|guide_action|og-dashboard-ai-frame/);
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
    assert.match(script, /role === 'guide' \\|\\| role === 'officier_guide'/);
    assert.match(script, /get_current_user_specialty/);
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


test('chaque accordéon affiche difficulté et nombre d’exercices sur une seule ligne avec le contrôle en fin de ligne', () => {
    assert.match(script, /level\.label \+ ' · ' \+ levelRows\.length/);
    assert.match(css, /\.og-dashboard-library-level-heading::after \{ flex-shrink:0; margin-left:auto; \}/);
    assert.match(css, /@media\(max-width:600px\)/);
});


test('le nombre d’exercices est le déclencheur à droite de l’accordéon, sans bouton plus', () => {
    assert.match(script, /og-dashboard-library-level-count/);
    assert.match(script, /levelRows\.length \+ \(levelRows\.length > 1 \? ' exercices' : ' exercice'\)/);
    assert.doesNotMatch(css, /content:'[＋+−-]'/);
    assert.match(css, /\.og-dashboard-library-level-count \{[^}]*margin-left:auto/s);
});

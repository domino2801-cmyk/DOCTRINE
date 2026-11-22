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
    assert.match(script, /RATTACHER UN CANDIDAT/);
    assert.match(script, /openAssignCandidateDialog/);
    assert.match(script, /FICHE RETEX DOCTRINE/);
    assert.match(script, /RETEX déjà envoyé/);
    assert.match(script, /FICHE DE SIGNALEMENT/);
    assert.match(script, /Rédiger et transmettre un signalement/);
    assert.match(script, /openModule7Form\('retexCard', 'retexForm'\)/);
    assert.match(script, /openModule7Form\('signalementCard', 'signalementForm'\)/);
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
    assert.match(script, /admin \|\| role === 'guide' \|\| role === 'officier_guide' \|\| specialty === 'OG'/);
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
});
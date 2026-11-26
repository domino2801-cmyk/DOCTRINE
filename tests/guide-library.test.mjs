import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, admin, adminCss, guide, guideCss, html, sw, viewer, driveProxy] = await Promise.all([
    readFile(new URL('../supabase/patches/2026-11-23-guide-exercise-correction-library.sql', import.meta.url), 'utf8'),
    readFile(new URL('../admin/guide-library.js', import.meta.url), 'utf8'),
    readFile(new URL('../admin/guide-library.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/guide-dashboard.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/guide-dashboard.css', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../viewer/viewer.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/drive-proxy/index.ts', import.meta.url), 'utf8')
]);

test('les deux bibliothèques sont isolées des 30 supports et des progressions existantes', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.guide_exercise_library/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.guide_correction_library/);
    assert.match(migration, /REFERENCES public\.guide_exercise_library\(id\) ON DELETE RESTRICT/);
    assert.doesNotMatch(migration, /ALTER TABLE public\.(guide_course_catalog|user_progress|doctrine_progress_events)/i);
    assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test('les niveaux de difficulté sont limités aux quatre étoiles attendues', () => {
    assert.match(migration, /difficulty_level BETWEEN 1 AND 4/);
    assert.match(admin, /★ — Initiation/);
    assert.match(admin, /★★ — Bases/);
    assert.match(admin, /★★★ — Approfondissement/);
    assert.match(admin, /★★★★ — Défi/);
    assert.doesNotMatch(admin, /Fondamentaux|Application|Maîtrise|Expertise/);
    assert.match(admin, /return '★'\.repeat\(value\)/);
    for (const label of ['Initiation', 'Bases', 'Approfondissement', 'Défi']) {
        assert.ok(admin.includes(label), 'niveau manquant : ' + label);
    }
});

test('la RLS réserve la gestion aux administrateurs et masque les brouillons aux guides', () => {
    assert.match(migration, /doctrine_is_admin\(\) OR \(doctrine_is_guide\(\) AND is_published\)/);
    assert.match(migration, /AND is_published\s+AND EXISTS/);
    assert.match(migration, /guide_exercise_library_admin_insert/);
    assert.match(migration, /guide_correction_library_admin_update/);
    assert.match(admin, /function isAdmin\(\)/);
    assert.match(admin, /is_published: form\.querySelector\('#agl-published'\)\.checked/);
});

test('chaque dossier regroupe ses corrections et propose les actions de gestion', () => {
    assert.match(admin, /function renderCorrection\(item, parentList\)/);
    assert.match(admin, /function renderList\(type\)/);
    assert.match(admin, /corrections\.filter\(function \(correction\) \{ return correction\.exercise_id === item\.id; \}\)/);
    assert.match(admin, /\+ Ajouter une correction/);
    assert.match(admin, /openForm\('correction', null, item\.id\)/);
    assert.match(admin, /function deleteItem\(type, item\)/);
    assert.match(adminCss, /adm-guide-library-linked-corrections/);
});

test('les liens Google Drive sont validés côté interface et base', () => {
    assert.match(admin, /drive\\\.google\\\.com\|docs\\\.google\\\.com/);
    assert.match(migration, /drive\[\.\]google\[\.\]com/);
    assert.match(migration, /docs\[\.\]google\[\.\]com/);
});

test('l’espace Officier Guide affiche uniquement les contenus publiés et leurs corrections liées', () => {
    assert.match(guide, /guide_exercise_library\?select=/);
    assert.match(guide, /guide_correction_library\?select=/);
    assert.match(guide, /is_published=eq\.true/);
    assert.match(guide, /BIBLIOTHÈQUE DES DOSSIERS D’EXERCICES ET CORRECTIONS/);
    assert.match(guide, /correction\.exercise_id === exercise\.id/);
    assert.match(guide, /★ — Initiation/);
    assert.match(guide, /★★ — Bases/);
    assert.match(guide, /★★★ — Approfondissement/);
    assert.match(guide, /★★★★ — Défi/);
    assert.match(guide, /og-dashboard-library-correction-stars/);
    assert.match(guide, /node\('button', 'og-dashboard-download', 'Télécharger'\)/);
    assert.match(guide, /node\('button', 'og-dashboard-download', 'Télécharger'\)/);
    assert.match(guide, /openDriveInViewer\(exercise\.drive_url, exercise\.title\)/);
    assert.match(guide, /openDriveInViewer\(correction\.drive_url, correction\.title\)/);
    assert.doesNotMatch(guide, /driveDownload\(correction\.drive_url\)/);
    assert.equal((guide.match(/node\\('button', 'og-dashboard-download', 'Télécharger'\\)/g) || []).length, 2);
    assert.match(guideCss, /\.og-dashboard-pedagogical-libraries/);
});

test('la gestion des dossiers et corrections est intégrée à la bibliothèque du tableau de bord administrateur', () => {
    assert.match(guide, /dashboardMode === 'admin'/);
    assert.match(guide, /function exerciseLibraryAdminForm\(type, item\)/);
    assert.match(guide, /\+ Ajouter un dossier d’exercice/);
    assert.match(guide, /\+ Ajouter une correction/);
    assert.match(guide, /editExercise/);
    assert.match(guide, /deleteExerciseLibraryItem\('exercise', exercise\)/);
    assert.match(guide, /editCorrection/);
    assert.match(guide, /deleteExerciseLibraryItem\('correction', correction\)/);
    assert.match(guide, /Publier pour les Officiers Guides/);
    assert.match(guide, /exerciseLibrarySelectedId/);
    assert.match(guideCss, /og-dashboard-library-admin-form/);
});

test('le panneau Admin est chargé séparément et fonctionne hors connexion via le cache PWA', () => {
    assert.match(html, /admin\/guide-library\.js/);
    assert.match(html, /admin\/guide-library\.css/);
    assert.match(sw, /\.\/admin\/guide-library\.js/);
    assert.match(sw, /\.\/admin\/guide-library\.css/);
    assert.match(adminCss, /@media\(max-width:760px\)/);
});


test('les exercices et corrections réutilisent la visionneuse intégrée et le ZIP complet', () => {
    assert.match(viewer, /openDrive: ouvrirDrive/);
    assert.match(viewer, /function ouvrirDrive\(url, nom, module\)/);
    assert.match(viewer, /function telechargerTout\(\)/);
    assert.match(viewer, /creerZip\(entrees\)/);
    assert.match(viewer, /profondeur < 8/);
    assert.match(viewer, /if \(bilan\.echecs\) throw new Error/);
    assert.match(driveProxy, /pageSize=1000/);
    assert.match(driveProxy, /nextPageToken/);
    assert.match(driveProxy, /accesBibliothequePubliee/);
    assert.match(driveProxy, /accesBibliotheque === false/);
    assert.match(driveProxy, /if \(!supportHistorique && accesBibliotheque !== true && requis === null\)/);
    assert.match(driveProxy, /Ressource Drive non autorisée/);
    assert.match(driveProxy, /chaineParentsDrive/);
    assert.match(admin, /openDriveInViewer\(item\.drive_url, item\.title\)/);
    assert.doesNotMatch(admin, /open\.target = '_blank'/);
});

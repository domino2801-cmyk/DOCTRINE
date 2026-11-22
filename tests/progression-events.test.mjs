import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(path.join(root, "app", "app.js"), "utf8");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const readme = readFileSync(path.join(root, "README.md"), "utf8");
const migration = readFileSync(path.join(root, "supabase", "progression-events.sql"), "utf8");
const module5Migration = readFileSync(path.join(root, "supabase", "module5-qcm-auto-validation.sql"), "utf8");
const module4Migration = readFileSync(path.join(root, "supabase", "module4-two-dossiers-auto-validation.sql"), "utf8");
const boundary = app.indexOf("    function updateCorrectionDossierOptions()");
if (boundary < 0) throw new Error("Study progress functions not found");
const progressContext = vm.createContext({ window: {} });
vm.runInContext(app.slice(0, boundary) + "\nglobalThis.calculateDossierProgress = calculateDossierProgress;", progressContext);

test("progress event table accepts only candidate-owned events with server timestamps", () => {
    assert.match(migration, /create table if not exists public\.doctrine_progress_events/i);
    assert.match(migration, /event_type in \([\s\S]*'module_started'[\s\S]*'module_completed'[\s\S]*'dossier_completed'[\s\S]*'correction_accessible'/i);
    assert.match(migration, /alter table public\.doctrine_progress_events enable row level security/i);
    assert.match(migration, /grant insert on public\.doctrine_progress_events to authenticated/i);
    assert.match(migration, /user_id = auth\.uid\(\)/i);
    assert.match(migration, /new\.user_id := auth\.uid\(\)/i);
    assert.match(migration, /new\.created_at := now\(\)/i);
    assert.match(migration, /create extension if not exists pg_cron/i);
    assert.match(migration, /where created_at < now\(\) - interval '12 months'/i);
});

test("DOCTRINE emits progress transitions separately from document clicks", () => {
    assert.ok(app.includes("enregistrerEvenementProgression") && app.includes("module_completed"));
    assert.ok(app.includes("enregistrerEvenementProgression") && app.includes("module_completed"));
    assert.ok(app.includes("enregistrerEvenementProgression") && app.includes("module_completed"));
    assert.ok(app.includes("enregistrerEvenementProgression") && app.includes("module_completed"));
    assert.doesNotMatch(app, /Étape synchronisée avec votre compte/);
    assert.match(app, /Étape non synchronisée\. Vérifiez votre connexion puis réessayez/);
    assert.match(app, /doctrine_progress_events/);
    assert.match(html, /id="progressionSyncStatus"/);
    assert.match(readme, /Les consultations de documents sont des clics enregistrés, pas une preuve de lecture/);
    assert.match(readme, /Les événements antérieurs à l’installation ne sont pas reconstitués/);
});

test("the exercise progress reaches 100 percent after half the dossiers while remaining capped", () => {
    const progress = progressContext.calculateDossierProgress;
    assert.equal(progress(7, 16), 88);
    assert.equal(progress(8, 16), 100);
    assert.equal(progress(12, 16), 100);
    assert.equal(progress(0, 0), 0);
});


test("module 5 is completed automatically from the QCM-MAJOR ready threshold", () => {
    assert.match(app, /function verifierValidationAutomatiqueModule5\(\)/);
    assert.match(app, /verify_qcm_module5_completion/);
    assert.match(app, /id === 'module5'\) verifierValidationAutomatiqueModule5\(\)/);
    assert.doesNotMatch(app, /if \(!\['module2', 'module4', 'module5', 'module6', 'module7'\]\.includes\(id\)\) return/);
    assert.match(readme, /moyenne des résultats QCM-MAJOR.*au moins 13\/20/);
    assert.match(module5Migration, /create or replace function public\.verify_qcm_module5_completion\(\)/i);
    assert.match(module5Migration, /average_score.*< 13/is);
    assert.match(module5Migration, /event_type = 'module_completed'/);
});


test("module 3 is completed automatically when the candidate opens it", () => {
    assert.match(app, /function verifierValidationAutomatiqueModule3\(\)/);
    assert.match(app, /if \(id === 'module3'\) verifierValidationAutomatiqueModule3\(\)/);
    assert.match(app, /enregistrerEvenementProgression\('module_completed', '3'\)/);
    assert.match(app, /doctrine-module3-auto-validated/);
    assert.match(app, /Le suivi des dossiers « Fait » reste indépendant/);
    assert.doesNotMatch(readme, /module 3 est validé lorsque tous ses dossiers sont marqués/);
});


test("module 4 is completed automatically after submissions on two distinct dossiers", () => {
    assert.match(app, /function verifierValidationAutomatiqueModule4\(\)/);
    assert.match(app, /verify_doctrine_module4_completion/);
    assert.match(app, /id === 'module4'\) verifierValidationAutomatiqueModule4\(\)/);
    assert.doesNotMatch(app, /if \(!\['module2', 'module4', 'module6', 'module7'\]\.includes\(id\)\) return/);
    assert.match(app, /verifierValidationAutomatiqueModule4\(\);/);
    assert.match(module4Migration, /count\(distinct dossier\)/i);
    assert.match(module4Migration, /coalesce\(submission_count,\s*0\)\s*>=\s*2/i);
    assert.match(module4Migration, /event_type = 'module_completed'/);
    assert.match(readme, /au moins deux dossiers distincts/);
});


test("module 7 is completed automatically when a RETEX is inserted", async () => {
    const retexMigration = readFileSync(path.join(root, "supabase", "module7-retex-auto-validation.sql"), "utf8");
    const retexViewer = readFileSync(path.join(root, "viewer", "retex-signalements.js"), "utf8");
    assert.match(app, /if \(id !== 'module2'\) return/);
    assert.doesNotMatch(app, /if \(!\['module2', 'module6', 'module7'\]\.includes\(id\)\) return/);
    assert.match(retexViewer, /insertRow\('doctrine_retex', row\)\.then\(function \(\) \{[\s\S]*Module 7 validé automatiquement/);
    const retexCardStart = html.indexOf('id="retexCard"');
    const retexCardEnd = html.indexOf('</section>', retexCardStart);
    assert.ok(retexCardStart >= 0 && retexCardEnd > retexCardStart, "Carte RETEX 7.1 introuvable ou non fermée");
    const retexCard = html.slice(retexCardStart, retexCardEnd);
    assert.doesNotMatch(retexCard, /id="retexStatus"/);
    assert.match(html, /<p id="retexStatus" class="fiche-status module7-retex-status" role="status" aria-live="polite"><\/p>\s*<section class="part-card fiche-card" id="signalementCard">/);
    assert.match(retexViewer, /rows\.length\) lockRetex\('RETEX déjà transmis\. Module 7 validé automatiquement/);
    assert.match(retexViewer, /err\.code === '23505'\) return 'RETEX déjà transmis\. Module 7 validé automatiquement/);
    assert.match(retexMigration, /create or replace function public\.doctrine_retex_complete_module7\(\)/i);
    assert.match(retexMigration, /after insert on public\.doctrine_retex/i);
    assert.match(retexMigration, /event_type = 'module_completed'/i);
    assert.match(retexMigration, /module_id = '7'/i);
    assert.match(retexMigration, /insert into public\.doctrine_progress_events/i);
    assert.match(readme, /module 7 est validé automatiquement dès que le candidat transmet son RETEX/i);
});

test("module 6 is validated automatically after a private candidate CV PDF is uploaded", async () => {
    const cvSql = readFileSync(path.join(root, "supabase", "module6-cv-upload.sql"), "utf8");
    const cvViewer = readFileSync(path.join(root, "viewer", "module6-cv.js"), "utf8");
    const guideHtml = readFileSync(path.join(root, "app", "guide-module8.html"), "utf8");
    const guideJs = readFileSync(path.join(root, "app", "guide-module8.js"), "utf8");
    assert.match(html, /id="module6CvCard"/);
    assert.match(html, /6\.4\. Dépôt de votre CV/);
    assert.match(html, /id="module6CvFile" type="file" accept="application\/pdf,\.pdf"/);
    assert.match(html, /id="module6CvUpload"/);
    assert.match(cvViewer, /var BUCKET = 'doctrine-candidate-cv'/);
    assert.match(cvViewer, /doctrine_candidate_cvs\?on_conflict=candidate_id/);
    assert.match(cvViewer, /application\/pdf/);
    assert.match(cvSql, /create table if not exists public\.doctrine_candidate_cvs/i);
    assert.match(cvSql, /values \('doctrine-candidate-cv', 'doctrine-candidate-cv', false/i);
    assert.match(cvSql, /doctrine_can_access_candidate\(candidate_id\)/);
    assert.match(cvSql, /after insert or update of storage_path on public\.doctrine_candidate_cvs/i);
    assert.match(cvSql, /event_type, module_id\)\s*values \(new\.candidate_id, 'module_completed', '6'\)/i);
    assert.match(guideHtml, /id="guideCandidateCvActions"/);
    assert.match(guideJs, /renderCandidateCv\(candidate\)/);
    assert.match(guideJs, /doctrine_candidate_cvs\?select=storage_path,original_filename,file_size,uploaded_at/);
    assert.match(guideJs, /object\/sign\/doctrine-candidate-cv/);
    assert.match(app, /if \(id !== 'module2'\) return/);
});

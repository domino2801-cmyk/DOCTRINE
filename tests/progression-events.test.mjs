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
    assert.match(app, /if \(!\['module2', 'module6'\]\.includes\(id\)\) return/);
    assert.doesNotMatch(app, /if \(!\['module2', 'module6', 'module7'\]\.includes\(id\)\) return/);
    assert.match(retexViewer, /insertRow\('doctrine_retex', row\)\.then\(function \(\) \{[\s\S]*Module 7 validé automatiquement/);
    assert.match(retexViewer, /rows\.length\) lockRetex\('RETEX déjà transmis\. Module 7 validé automatiquement/);
    assert.match(retexViewer, /err\.code === '23505'\) return 'RETEX déjà transmis\. Module 7 validé automatiquement/);
    assert.match(retexMigration, /create or replace function public\.doctrine_retex_complete_module7\(\)/i);
    assert.match(retexMigration, /after insert on public\.doctrine_retex/i);
    assert.match(retexMigration, /event_type = 'module_completed'/i);
    assert.match(retexMigration, /module_id = '7'/i);
    assert.match(retexMigration, /insert into public\.doctrine_progress_events/i);
    assert.match(readme, /module 7 est validé automatiquement dès que le candidat transmet son RETEX/i);
});

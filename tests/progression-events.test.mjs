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

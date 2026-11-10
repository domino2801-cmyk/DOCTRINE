import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(path.join(root, "app", "app.js"), "utf8");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const readme = readFileSync(path.join(root, "README.md"), "utf8");
const migration = readFileSync(path.join(root, "supabase", "progression-events.sql"), "utf8");

test("progress event table accepts only candidate-owned events with server timestamps", () => {
    assert.match(migration, /create table if not exists public\.doctrine_progress_events/i);
    assert.match(migration, /event_type in \([\s\S]*'module_started'[\s\S]*'module_completed'[\s\S]*'dossier_completed'[\s\S]*'correction_accessible'/i);
    assert.match(migration, /alter table public\.doctrine_progress_events enable row level security/i);
    assert.match(migration, /grant insert on public\.doctrine_progress_events to authenticated/i);
    assert.match(migration, /user_id = auth\.uid\(\)/i);
    assert.match(migration, /new\.user_id := auth\.uid\(\)/i);
    assert.match(migration, /new\.created_at := now\(\)/i);
    assert.match(migration, /where created_at < now\(\) - interval '12 months'/i);
});

test("DOCTRINE emits progress transitions separately from document clicks", () => {
    assert.match(app, /enregistrerEvenementProgression\('module_started'/);
    assert.match(app, /enregistrerEvenementProgression\('module_completed', '1'\)/);
    assert.match(app, /enregistrerEvenementProgression\('dossier_completed', '3', id\)/);
    assert.match(app, /enregistrerEvenementProgression\('correction_accessible', '4', dossier\)/);
    assert.match(app, /doctrine_progress_events/);
    assert.match(html, /id="progressionSyncStatus"/);
    assert.match(readme, /Les consultations de documents sont des clics enregistrés, pas une preuve de lecture/);
    assert.match(readme, /Les événements antérieurs à l’installation ne sont pas reconstitués/);
});

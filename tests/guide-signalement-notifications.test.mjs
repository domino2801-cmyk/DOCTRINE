import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const migration = read("supabase/guide-signalement-notifications.sql");
const push = read("supabase/functions/doctrine-report-push/index.ts");
const worker = read("sw.js");
const admin = read("admin/fiches-admin.js");
const guideSql = read("supabase/guide-officer-feedback.sql");

test("un signalement Officier Guide déclenche une notification push sécurisée", () => {
    assert.match(migration, /after insert on public\\.guide_signalements/i);
    assert.match(migration, /notify_doctrine_guide_signalement/);
    assert.match(migration, /doctrine_report_push_url/);
    assert.match(migration, /doctrine_report_push_webhook_secret/);
    assert.match(migration, /x-doctrine-webhook-secret/);
});

test("l'Edge Function accepte les signalements candidats et Officier Guide", () => {
    assert.match(push, /reportTable !== "doctrine_signalements" && reportTable !== "guide_signalements"/);
    assert.match(push, /from\\(reportTable\\)/);
    assert.match(push, /"doctrine-guide-signalement"/);
    assert.match(push, /from\\("guide_signalements"\\)/);
    assert.match(push, /return candidateCount \\+ guideCount/);
});

test("le compteur global inclut les dossiers candidats et Officier Guide encore ouverts", () => {
    assert.match(push, /from\\("doctrine_signalements"\\)[\\s\\S]*?eq\\("status", "pending"\\)/);
    assert.match(push, /from\\("guide_signalements"\\)[\\s\\S]*?in\\("status", \\["submitted", "in_review", "action_required"\\]\\)/);
});

test("la notification Officier Guide ouvre directement sa file dans l'administration", () => {
    assert.match(worker, /doctrine-guide-signalement/);
    assert.match(worker, /reportType: isGuideReport \\? 'guide-signalements'/);
    assert.match(worker, /doctrine-open-guide-signalements/);
    assert.match(admin, /admin-section', reportType/);
    assert.match(admin, /doctrine-open-guide-signalements/);
    assert.match(admin, /detail: 'guide-signalements'/);
});

test("les droits RLS de lecture admin et de dépôt OG restent en place", () => {
    assert.match(guideSql, /guide_signalements_insert_own/);
    assert.match(guideSql, /guide_signalements_admin_read/);
    assert.match(guideSql, /guide_signalements_admin_update/);
});

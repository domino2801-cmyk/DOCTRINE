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
    assert.ok(migration.includes("after insert on public.guide_signalements"));
    assert.ok(migration.includes("notify_doctrine_guide_signalement"));
    assert.ok(migration.includes("doctrine_report_push_url"));
    assert.ok(migration.includes("doctrine_report_push_webhook_secret"));
    assert.ok(migration.includes("x-doctrine-webhook-secret"));
});

test("l'Edge Function accepte les signalements candidats et Officier Guide", () => {
    assert.ok(push.includes('reportTable !== "doctrine_signalements" && reportTable !== "guide_signalements"'));
    assert.ok(push.includes("from(reportTable)"));
    assert.ok(push.includes('"doctrine-guide-signalement"'));
    assert.ok(push.includes('from("guide_signalements")'));
    assert.ok(push.includes("return candidateCount + guideCount"));
});

test("le compteur global inclut les dossiers candidats et Officier Guide encore ouverts", () => {
    assert.ok(push.includes('.from("doctrine_signalements")'));
    assert.ok(push.includes('.eq("status", "pending")'));
    assert.ok(push.includes('.from("guide_signalements")'));
    assert.ok(push.includes('.in("status", ["submitted", "in_review", "action_required"])'));
});

test("la notification Officier Guide ouvre directement sa file dans l'administration", () => {
    assert.ok(worker.includes("doctrine-guide-signalement"));
    assert.ok(worker.includes("reportType: isGuideReport ? 'guide-signalements'"));
    assert.ok(worker.includes("doctrine-open-guide-signalements"));
    assert.ok(admin.includes("admin-section', reportType"));
    assert.ok(admin.includes("doctrine-open-guide-signalements"));
    assert.ok(admin.includes("detail: 'guide-signalements'"));
});

test("les droits RLS de lecture admin et de dépôt OG restent en place", () => {
    assert.ok(guideSql.includes("guide_signalements_insert_own"));
    assert.ok(guideSql.includes("guide_signalements_admin_read"));
    assert.ok(guideSql.includes("guide_signalements_admin_update"));
});

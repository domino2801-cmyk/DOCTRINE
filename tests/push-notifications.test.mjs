import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const sql = read("supabase/push-notifications.sql");
const edge = read("supabase/functions/doctrine-event-push/index.ts");
const worker = read("sw.js");
const client = read("app/push-notifications.js");
const html = read("index.html");
const config = read("supabase/config.toml");

test("les nouveaux RETEX candidats et Officier Guide déclenchent des push vers les administrateurs", () => {
  assert.match(sql, /after insert on public\.doctrine_retex/);
  assert.match(sql, /after insert on public\.guide_retex_reports/);
  assert.match(edge, /retex-submitted/);
  assert.match(edge, /isAdmin\(user\.app_metadata/);
});

test("une nouvelle fiche est notifiée uniquement aux Officiers Guides rattachés", () => {
  assert.match(sql, /after insert or update on public\.doctrine_fiche_submissions/);
  assert.match(edge, /from\("guide_candidates"\)/);
  assert.match(edge, /\.eq\("candidate_id", candidateId\)/);
  assert.match(edge, /fiche-submitted/);
});

test("la validation d'une fiche notifie le candidat propriétaire", () => {
  assert.match(sql, /after insert or update on public\.fiche_reviews/);
  assert.match(sql, /new\.status <> 'valide'/);
  assert.match(edge, /fiche-validated/);
  assert.match(edge, /ids: \[submission\.user_id\]/);
});

test("les abonnements sont privés et les événements sont transmis par webhook signé", () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /grant all on public\.doctrine_push_subscriptions to service_role/);
  assert.match(sql, /x-doctrine-webhook-secret/);
  assert.match(edge, /DOCTRINE_EVENT_PUSH_WEBHOOK_SECRET/);
  assert.match(edge, /DOCTRINE_VAPID_PRIVATE_KEY/);
});

test("l'interface permet d'activer ou désactiver les notifications sur chaque appareil", () => {
  assert.match(client, /Notification\.requestPermission/);
  assert.match(client, /pushManager\.subscribe/);
  assert.match(client, /pushManager\.getSubscription/);
  assert.match(client, /panel\.remove\(\)/);
  assert.match(client, /activationWatchdog/);
  assert.match(client, /Réessayer/);
  assert.match(client, /Création de l’abonnement dans Android/);
  assert.match(client, /Enregistrement sécurisé de l’appareil/);
  assert.match(client, /Notification\.permission === 'granted'/);
  assert.equal((client.match(/function request\(method, payload\)/g) || []).length, 1);
  assert.doesNotMatch(client, /navigator\.serviceWorker\.ready\.then\(function \(registration\)/);
  assert.match(html, /app\/push-notifications\.js/);
  assert.match(worker, /addEventListener\('push'/);
  assert.match(worker, /notificationclick/);
  assert.match(config, /\[functions\.doctrine-event-push\]/);
});

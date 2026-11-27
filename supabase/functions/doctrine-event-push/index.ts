import { createClient } from "npm:@supabase/supabase-js@2.57.4";
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-doctrine-webhook-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: cors });
const secret = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error("Missing push configuration: " + key);
  return value;
};
const allowedHosts = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.port && !u.username && !u.password &&
      (allowedHosts.includes(u.hostname) || u.hostname.endsWith(".push.apple.com") ||
       u.hostname.endsWith(".push.services.mozilla.com") || u.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}
function isAdmin(meta: Record<string, unknown>) {
  return meta.role === "admin" || meta.bm4_admin === true || meta.bm4_admin === "true" || meta.bm4_admin === "1";
}
async function sendToUsers(db: ReturnType<typeof createClient>, userIds: string[], payload: Record<string, unknown>) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return { sent: 0, failed: 0 };
  const { data: subs, error } = await db.from("doctrine_push_subscriptions")
    .select("user_id,endpoint,p256dh,auth").in("user_id", ids);
  if (error) throw error;
  webpush.setVapidDetails("https://qcm-major.fr", secret("DOCTRINE_VAPID_PUBLIC_KEY"), secret("DOCTRINE_VAPID_PRIVATE_KEY"));
  let sent = 0, failed = 0;
  for (const sub of subs || []) {
    if (!validEndpoint(sub.endpoint)) {
      await db.from("doctrine_push_subscriptions").delete().eq("user_id", sub.user_id).eq("endpoint", sub.endpoint);
      continue;
    }
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload), { TTL: 3600, urgency: "high" });
      sent++;
    } catch (err) {
      const status = err instanceof webpush.WebPushError ? err.statusCode : 0;
      if (status === 404 || status === 410) {
        await db.from("doctrine_push_subscriptions").delete().eq("user_id", sub.user_id).eq("endpoint", sub.endpoint);
      } else { failed++; console.error("Push delivery failed", status); }
    }
  }
  return { sent, failed };
}
async function eventRecipients(db: ReturnType<typeof createClient>, event: string, record: Record<string, unknown>) {
  if (event === "retex-submitted") {
    const ids: string[] = [];
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      for (const user of data.users) if (isAdmin(user.app_metadata || {})) ids.push(user.id);
      if (data.users.length < 1000) break;
    }
    return { ids, title: "DOCTRINE — Nouveau RETEX", body: "Un nouveau RETEX vient d’être transmis.", url: "./index.html?admin-section=retex" };
  }
  if (event === "fiche-submitted") {
    const candidateId = String(record.user_id || "");
    const { data, error } = await db.from("guide_candidates").select("guide_id").eq("candidate_id", candidateId);
    if (error) throw error;
    const type = record.submission_type === "support_oral" ? "fiche support oral" : "fiche de proposition";
    return { ids: (data || []).map(row => row.guide_id), title: "DOCTRINE — Nouvelle fiche à corriger",
      body: "Une " + type + " du dossier " + String(record.dossier || "") + " attend votre correction.",
      url: "./index.html?module=module8" };
  }
  if (event === "fiche-validated") {
    const { data: submission, error } = await db.from("doctrine_fiche_submissions")
      .select("user_id,dossier,submission_type").eq("id", String(record.submission_id || "")).maybeSingle();
    if (error) throw error;
    if (!submission) return { ids: [], title: "", body: "", url: "./index.html" };
    const label = submission.submission_type === "support_oral" ? "fiche support oral" : "fiche de proposition";
    return { ids: [submission.user_id], title: "DOCTRINE — Fiche validée",
      body: "Votre " + label + " du dossier " + submission.dossier + " a été validée par l’Officier Guide.",
      url: "./index.html?module=module8" };
  }
  throw new Error("Unknown push event");
}
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const db = createClient(secret("SUPABASE_URL"), secret("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    if (request.method === "GET" || request.method === "POST" && request.headers.has("Authorization")) {
      const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) return json({ error: "Unauthorized" }, 401);
      if (request.method === "GET") return json({ publicKey: secret("DOCTRINE_VAPID_PUBLIC_KEY") });
      const body = await request.json();
      if (body.type === "subscribe") {
        const sub = body.subscription;
        if (!sub || !validEndpoint(sub.endpoint) || typeof sub.keys?.p256dh !== "string" ||
            sub.keys.p256dh.length < 80 || sub.keys.p256dh.length > 200 ||
            typeof sub.keys.auth !== "string" || sub.keys.auth.length < 20 || sub.keys.auth.length > 100)
          return json({ error: "Invalid subscription" }, 400);
        const { error: saveError } = await db.from("doctrine_push_subscriptions").upsert({
          user_id: data.user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth
        }, { onConflict: "user_id,endpoint" });
        if (saveError) throw saveError;
        return json({ enabled: true });
      }
      if (body.type === "unsubscribe") {
        if (typeof body.endpoint !== "string") return json({ error: "Invalid endpoint" }, 400);
        const { error: deleteError } = await db.from("doctrine_push_subscriptions")
          .delete().eq("user_id", data.user.id).eq("endpoint", body.endpoint);
        if (deleteError) throw deleteError;
        return json({ enabled: false });
      }
      return json({ error: "Invalid request" }, 400);
    }
    if (request.method !== "POST" || request.headers.get("x-doctrine-webhook-secret") !== secret("DOCTRINE_EVENT_PUSH_WEBHOOK_SECRET"))
      return json({ error: "Unauthorized" }, 401);
    const body = await request.json();
    if (typeof body.event !== "string" || !body.record || typeof body.record !== "object")
      return json({ error: "Invalid event" }, 400);
    const target = await eventRecipients(db, body.event, body.record as Record<string, unknown>);
    const result = await sendToUsers(db, target.ids, {
      type: body.event, title: target.title, body: target.body, url: target.url
    });
    return json(result, result.failed ? 502 : 200);
  } catch (err) {
    console.error("DOCTRINE event push failed", err instanceof Error ? err.message : "unknown");
    return json({ error: "Push service unavailable" }, 500);
  }
});

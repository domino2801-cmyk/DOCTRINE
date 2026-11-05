import { createClient } from "npm:@supabase/supabase-js@2.57.4";
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-doctrine-webhook-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function response(body: Record<string, unknown>, status = 200) {
    return Response.json(body, { status, headers: corsHeaders });
}

function isAdmin(metadata: Record<string, unknown>) {
    return metadata.role === "admin"
        || metadata.bm4_admin === true
        || metadata.bm4_admin === "true"
        || metadata.bm4_admin === "1";
}

function requiredSecret(name: string) {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing notification configuration: ${name}`);
    return value;
}

const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];

function validEndpoint(endpoint: unknown): endpoint is string {
    if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
    try {
        const url = new URL(endpoint);
        const host = url.hostname;
        const knownHost = PUSH_HOSTS.includes(host) || host.endsWith(".push.apple.com")
            || host.endsWith(".push.services.mozilla.com") || host.endsWith(".notify.windows.com");
        return url.protocol === "https:" && knownHost
            && !url.port && !url.username && !url.password;
    } catch {
        return false;
    }
}

async function pendingSignalements(database: ReturnType<typeof createClient>) {
    const { count, error } = await database.from("doctrine_signalements")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
    if (error) throw error;
    if (typeof count !== "number" || !Number.isSafeInteger(count)) {
        throw new Error("Could not count pending signalements");
    }
    return count;
}

async function envoyerNotifications(
    database: ReturnType<typeof createClient>,
    nombreEnAttente: number,
    userId?: string,
    type = "doctrine-signalement"
) {
    let query = database.from("doctrine_admin_push_subscriptions").select("user_id,endpoint,p256dh,auth");
    if (userId) query = query.eq("user_id", userId);
    const { data: subscriptions, error } = await query;
    if (error) throw error;

    webpush.setVapidDetails(
        "https://qcm-major.fr",
        requiredSecret("DOCTRINE_VAPID_PUBLIC_KEY"),
        requiredSecret("DOCTRINE_VAPID_PRIVATE_KEY")
    );

    let sent = 0;
    let failed = 0;
    for (const subscription of subscriptions || []) {
        const { data: account, error: accountError } = await database.auth.admin.getUserById(subscription.user_id);
        if (accountError) throw accountError;
        if (!account.user || !isAdmin(account.user.app_metadata || {})) continue;

        if (!validEndpoint(subscription.endpoint)) {
            const { error: deleteError } = await database.from("doctrine_admin_push_subscriptions")
                .delete().eq("user_id", subscription.user_id).eq("endpoint", subscription.endpoint);
            if (deleteError) throw deleteError;
            console.error("Unsupported DOCTRINE push endpoint removed");
            continue;
        }

        try {
            await webpush.sendNotification({
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth }
            }, JSON.stringify({ type, pendingCount: nombreEnAttente }), {
                TTL: 3600,
                urgency: "normal"
            });
            sent += 1;
        } catch (error) {
            if (error instanceof webpush.WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
                const { error: deleteError } = await database.from("doctrine_admin_push_subscriptions")
                    .delete().eq("user_id", subscription.user_id).eq("endpoint", subscription.endpoint);
                if (deleteError) throw deleteError;
            } else {
                failed += 1;
                console.error("DOCTRINE push delivery failed", {
                    status: error instanceof webpush.WebPushError ? error.statusCode : null
                });
            }
        }
    }

    return { sent, failed };
}

Deno.serve(async request => {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
        const database = createClient(
            requiredSecret("SUPABASE_URL"),
            requiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
            { auth: { persistSession: false, autoRefreshToken: false } }
        );
        const webhookHeader = request.headers.get("x-doctrine-webhook-secret");
        const isWebhook = webhookHeader !== null
            && webhookHeader === requiredSecret("DOCTRINE_REPORT_PUSH_WEBHOOK_SECRET");
        if (webhookHeader !== null && !isWebhook) return response({ error: "Unauthorized" }, 401);

        let userId: string | null = null;
        if (!isWebhook) {
            const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
            if (!token) return response({ error: "Unauthorized" }, 401);
            const { data, error } = await database.auth.getUser(token);
            if (error || !data.user) return response({ error: "Unauthorized" }, 401);
            if (!isAdmin(data.user.app_metadata || {})) return response({ error: "Admin access required" }, 403);
            userId = data.user.id;
        }

        if (request.method === "GET") {
            if (!userId) return response({ error: "Method not allowed" }, 405);
            const url = new URL(request.url);
            const endpoint = url.searchParams.get("endpoint");
            let enabled = false;
            if (endpoint) {
                const { data, error } = await database.from("doctrine_admin_push_subscriptions")
                    .select("endpoint").eq("user_id", userId).eq("endpoint", endpoint).maybeSingle();
                if (error) throw error;
                enabled = !!data;
            }
            return response({
                publicKey: requiredSecret("DOCTRINE_VAPID_PUBLIC_KEY"),
                enabled,
                pendingCount: await pendingSignalements(database)
            });
        }

        if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

        let payload: Record<string, unknown>;
        try {
            const parsed: unknown = await request.json();
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                return response({ error: "Invalid JSON" }, 400);
            }
            payload = parsed as Record<string, unknown>;
        } catch {
            return response({ error: "Invalid JSON" }, 400);
        }

        if (isWebhook) {
            const record = payload.record;
            if (!record || typeof record !== "object" || Array.isArray(record)) {
                return response({ error: "Invalid signalement event" }, 400);
            }
            const signalementId = Number((record as Record<string, unknown>).id);
            if (payload.type !== "INSERT" || payload.schema !== "public"
                || payload.table !== "doctrine_signalements"
                || !Number.isSafeInteger(signalementId) || signalementId <= 0) {
                return response({ error: "Invalid signalement event" }, 400);
            }
            const { data: signalement, error } = await database.from("doctrine_signalements")
                .select("id,status").eq("id", signalementId).maybeSingle();
            if (error) throw error;
            if (!signalement || signalement.status !== "pending") return response({ sent: 0 });

            const result = await envoyerNotifications(database, await pendingSignalements(database));
            if (result.failed > 0) return response({ error: "Some notifications could not be sent", ...result }, 502);
            return response(result);
        }

        if (!userId) return response({ error: "Unauthorized" }, 401);
        if (payload.type === "subscribe") {
            const subscription = payload.subscription;
            if (!subscription || typeof subscription !== "object" || Array.isArray(subscription)) {
                return response({ error: "Invalid push subscription" }, 400);
            }
            const endpoint = (subscription as Record<string, unknown>).endpoint;
            const keys = (subscription as Record<string, unknown>).keys;
            if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
                return response({ error: "Invalid push subscription" }, 400);
            }
            const pushKeys = keys as Record<string, unknown>;
            if (!validEndpoint(endpoint) || typeof pushKeys.p256dh !== "string" || pushKeys.p256dh.length < 80
                || pushKeys.p256dh.length > 200 || typeof pushKeys.auth !== "string" || pushKeys.auth.length < 20
                || pushKeys.auth.length > 100) {
                return response({ error: "Invalid push subscription" }, 400);
            }
            const { error } = await database.from("doctrine_admin_push_subscriptions").upsert({
                user_id: userId,
                endpoint,
                p256dh: pushKeys.p256dh,
                auth: pushKeys.auth
            }, { onConflict: "user_id,endpoint" });
            if (error) throw error;
            return response({ enabled: true });
        }

        if (payload.type === "unsubscribe") {
            if (typeof payload.endpoint !== "string" || payload.endpoint.length > 2048) {
                return response({ error: "Invalid push endpoint" }, 400);
            }
            const { error } = await database.from("doctrine_admin_push_subscriptions")
                .delete().eq("user_id", userId).eq("endpoint", payload.endpoint);
            if (error) throw error;
            return response({ enabled: false });
        }

        if (payload.type === "test") {
            const result = await envoyerNotifications(database, await pendingSignalements(database), userId, "doctrine-test");
            if (result.failed > 0) return response({ error: "Some notifications could not be sent", ...result }, 502);
            if (result.sent === 0) return response({ error: "Aucun appareil actif pour ce compte." }, 409);
            return response(result);
        }

        return response({ error: "Invalid notification request" }, 400);
    } catch (error) {
        console.error("DOCTRINE push handler failed", error instanceof Error ? error.message : "Unknown error");
        return response({ error: "Notification service unavailable. Check Supabase function logs." }, 500);
    }
});

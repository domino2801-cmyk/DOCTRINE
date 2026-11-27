import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGINS = new Set([
  "https://qcm-major.fr",
  "https://www.qcm-major.fr",
  "https://domino2801-cmyk.github.io"
]);
const TTL_SECONDS = 90;

function response(request: Request, body: Record<string, unknown>, status = 200) {
  const origin = request.headers.get("Origin") || "";
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  });
  if (ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(body), { status, headers });
}
function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing Supabase configuration: " + name);
  return value;
}
function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function bearer(request: Request) {
  return (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
    return response(request, {});
  }
  if (request.method !== "POST") return response(request, { error: "Method not allowed" }, 405);
  const origin = request.headers.get("Origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, { error: "Origin not allowed" }, 403);

  try {
    const url = required("SUPABASE_URL");
    const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = required("SUPABASE_ANON_KEY");
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const publicAuth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.action !== "string") return response(request, { error: "Invalid request" }, 400);

    if (body.action === "create") {
      const token = bearer(request);
      if (!token) return response(request, { error: "Unauthorized" }, 401);
      const { data: auth, error: authError } = await admin.auth.getUser(token);
      const user = auth?.user;
      if (authError || !user?.id || !user.email || !user.email_confirmed_at) {
        return response(request, { error: "A confirmed QCM-MAJOR session is required" }, 401);
      }
      const code = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const tokenHash = await sha256(code);
      const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
      const { error: insertError } = await admin.from("doctrine_auth_handoffs").insert({
        token_hash: tokenHash,
        user_id: user.id,
        email: user.email,
        expires_at: expiresAt
      });
      if (insertError) throw insertError;
      return response(request, { code, expires_at: expiresAt });
    }

    if (body.action === "redeem") {
      if (typeof body.code !== "string" || body.code.length < 40 || body.code.length > 100) {
        return response(request, { error: "Invalid or expired handoff" }, 400);
      }
      const tokenHash = await sha256(body.code);
      // DELETE ... RETURNING est atomique : une seule requête peut consommer le code.
      const { data: handoff, error: consumeError } = await admin
        .from("doctrine_auth_handoffs")
        .delete()
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .select("user_id,email")
        .maybeSingle();
      if (consumeError) throw consumeError;
      if (!handoff) return response(request, { error: "Invalid, expired or already used handoff" }, 401);

      // Crée une session ANC indépendante : le refresh token QCM-MAJOR n'est pas réutilisé.
      const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: handoff.email
      });
      const tokenHashOtp = generated?.properties?.hashed_token;
      if (generateError || !tokenHashOtp) {
        console.error("Could not issue isolated ANC session", generateError?.message || "missing token hash");
        return response(request, { error: "Could not establish ANC session" }, 503);
      }
      const { data: verified, error: verifyError } = await publicAuth.auth.verifyOtp({
        token_hash: tokenHashOtp,
        type: "magiclink"
      });
      if (verifyError || !verified?.session || verified.user?.id !== handoff.user_id ||
          !verified.user?.email_confirmed_at) {
        console.error("ANC session identity verification failed", verifyError?.message || "identity mismatch");
        return response(request, { error: "Identity verification failed" }, 401);
      }
      return response(request, {
        session: {
          access_token: verified.session.access_token,
          refresh_token: verified.session.refresh_token,
          expires_at: verified.session.expires_at,
          email: verified.user.email,
          user_id: verified.user.id
        }
      });
    }
    return response(request, { error: "Unknown action" }, 400);
  } catch (error) {
    console.error("DOCTRINE auth handoff failed", error instanceof Error ? error.message : "unknown");
    return response(request, { error: "Authentication relay unavailable" }, 500);
  }
});

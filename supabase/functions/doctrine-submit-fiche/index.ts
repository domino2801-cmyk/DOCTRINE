import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const DESTINATAIRE = "domino2801@gmail.com";
const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS = /\.(pdf|docx?)$/i;

function response(body: Record<string, unknown>, status = 200) {
    return Response.json(body, { status, headers: corsHeaders });
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function base64(bytes: Uint8Array) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

    try {
        const database = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
            auth: { persistSession: false }
        });

        const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        const { data: userData, error: userError } = await database.auth.getUser(token);
        if (userError || !userData.user) return response({ error: "Session invalide" }, 401);

        const form = await request.formData();
        const file = form.get("file");
        const dossier = String(form.get("dossier") || "").trim();
        if (!(file instanceof File) || !EXTENSIONS.test(file.name)) {
            return response({ error: "Fichier PDF, DOC ou DOCX requis" }, 400);
        }
        if (file.size === 0 || file.size > MAX_BYTES) {
            return response({ error: "Le fichier doit faire moins de 10 Mo" }, 400);
        }
        if (!/^\d{1,3}$/.test(dossier)) return response({ error: "Dossier invalide" }, 400);

        const { data: profile } = await database.from("profiles")
            .select("name").eq("id", userData.user.id).maybeSingle();
        const pseudo = String(profile?.name || userData.user.email || "inconnu").slice(0, 100);

        const apiKey = Deno.env.get("RESEND_API_KEY") || Deno.env.get("RESEND_API_KEY2");
        if (!apiKey) throw new Error("Missing configuration: RESEND_API_KEY");

        const attachment = base64(new Uint8Array(await file.arrayBuffer()));
        const sent = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                from: Deno.env.get("DOCTRINE_MAIL_FROM") || "DOCTRINE <onboarding@resend.dev>",
                to: [DESTINATAIRE],
                subject: `envoi du dossier ${dossier}`,
                text: `Bonjour, veuillez trouver ci joint le devoir de : ${pseudo}`,
                html: `<p>Bonjour, veuillez trouver ci joint le devoir de : ${escapeHtml(pseudo)}</p>`,
                attachments: [{ filename: file.name.slice(0, 150), content: attachment }]
            })
        });
        if (!sent.ok) {
            console.error("Resend error", sent.status, await sent.text());
            return response({ error: "Envoi du mail impossible" }, 502);
        }
        const { error: recordError } = await database.from("doctrine_fiche_submissions")
            .upsert({ user_id: userData.user.id, dossier: Number(dossier) });
        if (recordError) throw recordError;
        return response({ ok: true });
    } catch (error) {
        console.error(error);
        return response({ error: "Erreur serveur" }, 500);
    }
});

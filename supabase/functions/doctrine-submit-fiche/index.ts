import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const DESTINATAIRE = "domino2801@gmail.com";
const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS = /\.pdf$/i;

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
    if (request.method !== "POST" && request.method !== "GET") return response({ error: "Method not allowed" }, 405);

    try {
        const database = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
            auth: { persistSession: false }
        });

        const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        const { data: userData, error: userError } = await database.auth.getUser(token);
        if (userError || !userData.user) return response({ error: "Session invalide" }, 401);

        if (request.method === "GET") {
            const { data, error } = await database.from("doctrine_fiche_submissions")
                .select("dossier").eq("user_id", userData.user.id);
            if (error) throw error;
            return response({ dossiers: (data || []).map((row) => row.dossier) });
        }

        const form = await request.formData();
        const file = form.get("file");
        const dossier = String(form.get("dossier") || "").trim();
        if (!(file instanceof File) || !EXTENSIONS.test(file.name)) {
            return response({ error: "Une fiche scannée au format PDF est requise." }, 400);
        }
        if (file.size === 0 || file.size > MAX_BYTES) {
            return response({ error: "Le fichier doit faire moins de 10 Mo" }, 400);
        }
        if (!/^\d{1,3}$/.test(dossier)) return response({ error: "Dossier invalide" }, 400);

        const validatorUrl = Deno.env.get("DOCTRINE_SCAN_VALIDATOR_URL");
        const validatorKey = Deno.env.get("DOCTRINE_SCAN_VALIDATOR_SECRET");
        if (!validatorUrl || !validatorKey || validatorKey.length < 32) {
            console.error("Configuration du service de validation absente ou invalide");
            return response({ error: "Vérification temporairement indisponible. Réessayez plus tard." }, 503);
        }
        let endpoint: URL;
        try {
            endpoint = new URL(validatorUrl);
            if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error("URL invalide");
        } catch {
            console.error("URL HTTPS du service de validation invalide");
            return response({ error: "Vérification temporairement indisponible. Réessayez plus tard." }, 503);
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        let checked: Response;
        try {
            checked = await fetch(endpoint, {
                method: "POST",
                headers: { Authorization: `Bearer ${validatorKey}`, "Content-Type": "application/pdf" },
                body: bytes,
                signal: AbortSignal.timeout(55000),
                redirect: "error"
            });
        } catch (error) {
            console.error("Service de validation indisponible", error);
            return response({ error: "Vérification temporairement indisponible. Réessayez plus tard." }, 503);
        }
        let result: unknown;
        try {
            result = await checked.json();
        } catch {
            console.error("Réponse de validation illisible", checked.status);
            return response({ error: "Vérification temporairement indisponible. Réessayez plus tard." }, 503);
        }
        if (!checked.ok || !result || typeof result !== "object"
            || !("valide" in result) || !("status" in result)) {
            console.error("Réponse de validation invalide", checked.status);
            return response({ error: "Vérification temporairement indisponible. Réessayez plus tard." }, 503);
        }
        if (result.valide !== true || result.status !== "SUCCESS") {
            const messages: Record<string, string> = {
                NOT_A_SCAN: "Le PDF ne semble pas être une copie scannée sans texte numérique. La fiche n’a pas été transmise.",
                INVALID_TEMPLATE: "La copie ne correspond pas suffisamment au modèle attendu. La fiche n’a pas été transmise.",
                PDF_ERROR: "Le PDF est illisible ou protégé. La fiche n’a pas été transmise."
            };
            const code = typeof result.status === "string" ? result.status : "";
            if (Object.hasOwn(messages, code)) return response({ error: messages[code], code }, 422);
            console.error("Erreur technique du service de validation", code);
            return response({ error: "Vérification temporairement indisponible. Réessayez plus tard." }, 503);
        }

        const { data: profile } = await database.from("profiles")
            .select("name").eq("id", userData.user.id).maybeSingle();
        const pseudo = String(profile?.name || userData.user.email || "inconnu").slice(0, 100);

        const apiKey = Deno.env.get("RESEND_API_KEY") || Deno.env.get("RESEND_API_KEY2");
        if (!apiKey) throw new Error("Missing configuration: RESEND_API_KEY");

        const attachment = base64(bytes);
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

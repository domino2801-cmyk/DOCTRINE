import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const DESTINATAIRE = "domino2801@gmail.com";
const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS = /\.(pdf|docx?)$/i;
const FICHE_BUCKET = "candidate-fiches";

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

async function removeArchive(database: ReturnType<typeof createClient>, path: string) {
    const { error } = await database.storage.from(FICHE_BUCKET).remove([path]);
    if (error) {
        console.error("Supabase Storage cleanup error", path, error);
        return false;
    }
    return true;
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
            return response({ error: "Fichier PDF, DOC ou DOCX requis" }, 400);
        }
        if (file.size === 0 || file.size > MAX_BYTES) {
            return response({ error: "Le fichier doit faire moins de 10 Mo" }, 400);
        }
        if (!/^\d{1,3}$/.test(dossier)) return response({ error: "Dossier invalide" }, 400);

        const { data: profile } = await database.from("profiles")
            .select("name").eq("id", userData.user.id).maybeSingle();
        const pseudo = String(profile?.name || userData.user.email || "inconnu").slice(0, 100);

        const fileBytes = new Uint8Array(await file.arrayBuffer());
        const isPdf = /\.pdf$/i.test(file.name);
        if (isPdf && String.fromCharCode(...fileBytes.subarray(0, 5)) !== "%PDF-") {
            return response({ error: "Le fichier ne semble pas être un PDF valide" }, 400);
        }

        const { data: previousSubmission, error: previousSubmissionError } =
            await database.from("doctrine_fiche_submissions")
                .select("id,storage_path")
                .eq("user_id", userData.user.id)
                .eq("dossier", Number(dossier))
                .maybeSingle();
        if (previousSubmissionError) throw previousSubmissionError;

        let storagePath: string | null = null;
        if (isPdf) {
            const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
            storagePath = `${userData.user.id}/${dossier}_${timestamp}.pdf`;
            const { error: uploadError } = await database.storage
                .from(FICHE_BUCKET)
                .upload(storagePath, fileBytes, {
                    contentType: "application/pdf",
                    cacheControl: "3600",
                    upsert: false
                });
            if (uploadError) {
                console.error("Fiche Storage upload error", uploadError);
                return response({ error: "Archivage du PDF impossible. Réessayez." }, 502);
            }
        }

        const apiKey = Deno.env.get("RESEND_API_KEY") || Deno.env.get("RESEND_API_KEY2");
        if (!apiKey) {
            if (storagePath) await removeArchive(database, storagePath);
            throw new Error("Missing configuration: RESEND_API_KEY");
        }

        const attachment = base64(fileBytes);
        let sent: Response;
        try {
            sent = await fetch("https://api.resend.com/emails", {
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
        } catch (error) {
            if (storagePath) await removeArchive(database, storagePath);
            throw error;
        }
        if (!sent.ok) {
            console.error("Resend error", sent.status, await sent.text());
            if (storagePath) await removeArchive(database, storagePath);
            return response({ error: "Envoi du mail impossible" }, 502);
        }

        const { data: submission, error: recordError } = await database.from("doctrine_fiche_submissions")
            .upsert({
                user_id: userData.user.id,
                dossier: Number(dossier),
                storage_path: storagePath
            }, { onConflict: "user_id,dossier" })
            .select("id")
            .single();
        if (recordError) {
            if (storagePath) await removeArchive(database, storagePath);
            console.error("Fiche submission record error after email delivery", recordError);
            return response({
                error: "La fiche a été envoyée par e-mail, mais son archivage de suivi a échoué. Contactez l’administration."
            }, 500);
        }

        const warnings: string[] = [];
        if (previousSubmission?.id) {
            const { error: reviewError } = await database.from("fiche_reviews")
                .delete().eq("submission_id", previousSubmission.id);
            if (reviewError) {
                console.error("Previous fiche review reset error", reviewError);
                warnings.push("L’ancienne évaluation n’a pas pu être réinitialisée.");
            }
        }
        if (previousSubmission?.storage_path && previousSubmission.storage_path !== storagePath) {
            const removed = await removeArchive(database, previousSubmission.storage_path);
            if (!removed) {
                warnings.push("Une ancienne archive n’a pas pu être supprimée.");
            }
        }

        return response({
            ok: true,
            archived: isPdf,
            ...(warnings.length ? { warning: warnings.join(" ") } : {})
        });
    } catch (error) {
        console.error(error);
        return response({ error: "Erreur serveur" }, 500);
    }
});

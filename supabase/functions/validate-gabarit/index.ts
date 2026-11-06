import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { comparePdf } from "./compare.ts";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function response(body: Record<string, unknown>, status = 200) {
    return Response.json(body, { status, headers: CORS_HEADERS });
}

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
    if (request.method !== "POST") return response({ error: "Méthode non autorisée" }, 405);

    try {
        const authorization = request.headers.get("Authorization");
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
        if (!authorization || !supabaseUrl || !supabaseAnonKey) {
            return response({ error: "Non autorisé" }, 401);
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authorization } },
            auth: { persistSession: false }
        });
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return response({ error: "Non autorisé" }, 401);

        const formData = await request.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) return response({ error: "Aucun fichier reçu" }, 400);
        if (file.size === 0 || file.size > MAX_FILE_BYTES) {
            return response({ error: "Le fichier doit faire 10 Mo maximum" }, 400);
        }

        const candidateBytes = new Uint8Array(await file.arrayBuffer());
        if (new TextDecoder().decode(candidateBytes.subarray(0, 5)) !== "%PDF-") {
            return response({ error: "Le fichier transmis n'est pas un PDF valide" }, 400);
        }

        const { data: modelFile, error: storageError } = await supabase.storage
            .from("gabarits")
            .download("modele_officiel.pdf");
        if (storageError || !modelFile) {
            console.error("Impossible de charger le modèle de référence", storageError);
            return response({ error: "Impossible de charger le modèle de référence" }, 500);
        }

        return response(await comparePdf(new Uint8Array(await modelFile.arrayBuffer()), candidateBytes));
    } catch (error) {
        console.error("Erreur lors de la validation du gabarit", error);
        return response({ error: "Erreur serveur" }, 500);
    }
});

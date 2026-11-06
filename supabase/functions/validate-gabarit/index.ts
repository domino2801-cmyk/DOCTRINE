import { Buffer } from "node:buffer";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { PDFiumLibrary } from "npm:@hyzyla/pdfium@3.0.0";
import pixelmatch from "npm:pixelmatch@8.0.0";
import { PNG } from "npm:pngjs@7.0.0";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const RENDER_SCALE = 150 / 72;
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function response(body: Record<string, unknown>, status = 200) {
    return Response.json(body, { status, headers: CORS_HEADERS });
}

async function renderPdfPages(pdfBytes: Uint8Array) {
    const library = await PDFiumLibrary.init();
    try {
        const document = await library.loadDocument(Buffer.from(pdfBytes));
        try {
            const pages = Array.from(document.pages());
            const images: PNG[] = [];

            for (const page of pages) {
                try {
                    const rendered = await page.render({
                        scale: RENDER_SCALE,
                        render: ({ data, width, height }) =>
                            PNG.sync.write({ width, height, data })
                    });
                    images.push(PNG.sync.read(Buffer.from(rendered.data)));
                } finally {
                    page.close();
                }
            }

            return images;
        } finally {
            document.destroy();
        }
    } finally {
        library.destroy();
    }
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

        const [modelPages, candidatePages] = await Promise.all([
            renderPdfPages(new Uint8Array(await modelFile.arrayBuffer())),
            renderPdfPages(candidateBytes)
        ]);
        if (modelPages.length !== 2 || candidatePages.length !== 2) {
            return response({
                conforme: false,
                error: `Le modèle et le document doivent faire strictement 2 pages. (Modèle: ${modelPages.length}, reçu: ${candidatePages.length})`
            });
        }

        let totalPixels = 0;
        let differentPixels = 0;
        for (let i = 0; i < 2; i++) {
            const model = modelPages[i];
            const candidate = candidatePages[i];
            if (model.width !== candidate.width || model.height !== candidate.height) {
                return response({ conforme: false, error: "Les dimensions des pages ne correspondent pas au modèle" });
            }

            const diff = new PNG({ width: model.width, height: model.height });
            differentPixels += pixelmatch(
                model.data,
                candidate.data,
                diff.data,
                model.width,
                model.height,
                { threshold: 0.1, includeAA: false }
            );
            totalPixels += model.width * model.height;
        }

        const score = 100 - (differentPixels / totalPixels) * 100;
        const conforme = score >= 88;
        return response({
            conforme,
            score: score.toFixed(2),
            message: conforme ? "Gabarit officiel validé" : "Gabarit non conforme ou mauvaise fiche"
        });
    } catch (error) {
        console.error("Erreur lors de la validation du gabarit", error);
        return response({ error: "Erreur serveur" }, 500);
    }
});

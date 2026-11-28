import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

const [sql, edgeFunction, index, page, styles, script, appScript, adminScript, viewerScript, ogAccessPatch, shortCodePatch, appStyles, dashboardScript] = await Promise.all([
    read("supabase/guide_module8.sql"),
    read("supabase/functions/doctrine-submit-fiche/index.ts"),
    read("index.html"),
    read("app/guide-module8.html"),
    read("app/guide-module8.css"),
    read("app/guide-module8.js"),
    read("app/app.js"),
    read("admin/admin.js"),
    read("viewer/viewer.js"),
    read("supabase/guide_module8-og-access.sql"),
    read("supabase/guide_module8-short-code.sql"),
    read("app/styles.css"),
    read("app/guide-dashboard.js")
]);
const progressSyncSql = await read("supabase/guide-progress-harmonization.sql");
const correctionAiFunction = await read("supabase/functions/correct-fiche-ai/index.ts");

test("les fonctions de cohorte autorisent les admins et limitent les guides aux rattachements", () => {
    assert.match(sql, /raw_app_meta_data[\s\S]*'role', p_role/);
    assert.match(sql, /p_role is null[\s\S]*p_role not in \('candidat', 'guide', 'officier_guide', 'admin'\)/);
    assert.match(sql, /session_user in \('postgres', 'supabase_admin'\)/);
    assert.match(sql, /grant select on public\.guide_candidates to authenticated/);
    assert.doesNotMatch(sql, /grant select, insert, delete on public\.guide_candidates to authenticated/i);
    assert.match(sql, /create or replace function public\.doctrine_can_access_candidate/);
    assert.match(sql, /assignment\.guide_id = auth\.uid\(\)[\s\S]*assignment\.candidate_id = p_candidate_id/);
    assert.match(sql, /create table if not exists public\.doctrine_candidate_guide_codes[\s\S]*code text not null unique check \(code ~ '\^\[A-HJ-NP-Z2-9\]\{8\}\$'\)/);
    assert.match(sql, /create or replace function public\.get_doctrine_candidate_guide_code\(\)[\s\S]*pg_catalog\.get_bit[\s\S]*grant execute on function public\.get_doctrine_candidate_guide_code\(\) to authenticated/);
    assert.match(sql, /create or replace function public\.doctrine_is_guide\(\)[\s\S]*security definer[\s\S]*auth\.jwt\(\) -> 'app_metadata' ->> 'role'[\s\S]*and exists[\s\S]*from public\.profiles profile[\s\S]*profile\.id = auth\.uid\(\)[\s\S]*to_jsonb\(profile\) ->> 'speciality'[\s\S]*'OG'/);
    assert.match(shortCodePatch, /create table if not exists public\.doctrine_candidate_guide_codes/);
    assert.match(shortCodePatch, /create or replace function public\.get_doctrine_candidate_guide_code\(\)/);
    assert.match(shortCodePatch, /create or replace function public\.assign_guide_candidate_by_code\(p_code text\)/);
    assert.match(shortCodePatch, /revoke all on public\.doctrine_candidate_guide_codes from public, anon, authenticated/);
    assert.match(sql, /create or replace function public\.doctrine_is_guide\(\)[\s\S]*security definer[\s\S]*auth\.jwt\(\) -> 'app_metadata' ->> 'role'[\s\S]*and exists[\s\S]*from public\.profiles profile[\s\S]*profile\.id = auth\.uid\(\)[\s\S]*to_jsonb\(profile\) ->> 'speciality'[\s\S]*'OG'/);
    assert.doesNotMatch(sql, /auth\.jwt\(\) -> 'app_metadata' ->> 'specialty'/);
    assert.match(ogAccessPatch, /security definer[\s\S]*auth\.jwt\(\) -> 'app_metadata' ->> 'role'[\s\S]*from public\.profiles profile[\s\S]*profile\.id = auth\.uid\(\)[\s\S]*'OG'/);
    assert.doesNotMatch(ogAccessPatch, /auth\.jwt\(\) -> 'app_metadata' ->> 'specialty'/);
    assert.match(dashboardScript, /var role = String\(meta\.role \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
    assert.doesNotMatch(dashboardScript, /meta\.role \|\| userMeta\.role/);
    assert.match(sql, /create or replace function public\.search_guide_candidates\(p_query text\)/);
    assert.match(sql, /cp\.id as candidate_id[\s\S]*cp\.email::text as email[\s\S]*cp\.label as display_name[\s\S]*cp\.matricule_value as matricule/i);
    assert.match(sql, /create or replace function public\.get_guide_candidate_dashboard/);
    assert.match(sql, /candidate_assignment\.guide_id = auth\.uid\(\)/);
    assert.match(sql, /not public\.doctrine_can_access_candidate\(p_candidate_id\)/);
    assert.match(sql, /create policy doctrine_guides_read_assigned_quiz_results/);
    assert.match(sql, /alter table public\.profiles enable row level security/i);
    assert.match(sql, /alter table public\.quiz_results enable row level security/i);
    assert.doesNotMatch(sql, /\bcurrent_user\./i);
    assert.doesNotMatch(sql, /grant select on public\.quiz_results to anon/i);
});

test("les notes et le suivi admission distinguent lecture candidat et écriture guide rattaché", () => {
    assert.match(sql, /create table if not exists public\.fiche_reviews/);
    assert.match(sql, /references public\.doctrine_fiche_submissions \(id\)/);
    assert.match(sql, /rubric_scores jsonb not null default '\{\}'::jsonb/);
    assert.match(sql, /security definer\s+set search_path = ''\s+as \$\$[\s\S]*new\.rubric_scores/);
    assert.match(sql, /create policy fiche_reviews_candidate_read_own/);
    assert.match(sql, /create policy fiche_reviews_guide_insert_assigned/);
    assert.match(sql, /submission_type in \('proposition', 'support_oral'\)/);
    assert.match(sql, /create table if not exists public\.candidate_admission_tracking/);
    assert.match(sql, /candidate_admission_tracking_candidate_read_own/);
    assert.match(sql, /candidate_admission_tracking_guide_update_assigned/);
    assert.match(sql, /new\.grade := round\(new\.form_grade \+ new\.content_grade, 2\)/);
});

test("l’archive PDF est privée et signable uniquement par le candidat ou son guide", () => {
    assert.match(sql, /values \('candidate-fiches', 'candidate-fiches', false/);
    assert.match(sql, /candidate_fiches_upload_own_folder/);
    assert.match(sql, /candidate_fiches_read_owner_or_assigned_guide/);
    assert.match(script, /\/storage\/v1\/object\/sign\/candidate-fiches/);
    assert.match(sql, /doctrine_can_access_candidate_path\(name\)/);
});

test("la grille interactive BM4 est ouvrable, téléchargeable et précachée", async () => {
    const rubricPath = "app/grille-evaluation-synthese-bm4-interactive.pdf";
    const [rubric, serviceWorker] = await Promise.all([
        readFile(new URL(rubricPath, root)),
        read("sw.js")
    ]);
    const rubricContent = rubric.toString("latin1");

    assert.match(page, /class="guide-rubric-card"[\s\S]*Grille interactive d’évaluation BM4/);
    assert.match(page, /href="grille-evaluation-synthese-bm4-interactive\.pdf" target="_blank" rel="noopener">Ouvrir la grille/);
    assert.match(page, /href="grille-evaluation-synthese-bm4-interactive\.pdf" download>Télécharger une copie vierge/);
    assert.ok(rubricContent.startsWith("%PDF-"), "the integrated file must be a PDF");
    assert.match(rubricContent, /\/AcroForm\b/, "the PDF must retain its interactive form");
    assert.match(serviceWorker, /new URL\('\.\/app\/grille-evaluation-synthese-bm4-interactive\.pdf'/);
});

test("le compte rendu d’évaluation génère un PDF rempli avec des pages indexées", async () => {
    const { createEvaluationPdf } = await import("../app/evaluation-report.mjs");
    const blob = createEvaluationPdf({
        candidateName: "Caporal Élodie Martin",
        dossier: "4",
        guideName: "Commandant Léa Bernard",
        formGrade: "5,5",
        contentGrade: "12",
        finalGrade: "17,50",
        submissionLabel: "Fiche support oral",
        weightPercent: 30,
        weightedGrade: "17,05",
        formLabel: "Caractère opératoire et forme",
        contentLabel: "Introduction, argumentaire et conclusion",
        criteria: [{ label: "Argumentaire de conviction", grade: "5,5", maxGrade: 7 }],
        decision: "À reprendre",
        comment: "Bonne analyse.\nÀ préciser : les délais.",
        reviewedAt: "18 nov. 2026 à 07:00",
        exportedAt: "18 nov. 2026 à 07:05"
    });
    const pdf = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    const xrefOffset = Number(pdf.match(/startxref\n(\d+)/)?.[1]);

    assert.equal(blob.type, "application/pdf");
    assert.ok(pdf.startsWith("%PDF-1.4"));
    assert.match(pdf, /Caporal Élodie Martin/);
    assert.match(pdf, /17,50 \/ 20/);
    assert.match(pdf, /17,05 \/ 20/);
    assert.match(pdf, /Fiche support oral/);
    assert.match(pdf, /Argumentaire de conviction/);
    assert.match(pdf, /Bonne analyse/);
    assert.match(pdf, /À reprendre/);
    assert.match(pdf, /ÉVALUATION/);
    assert.equal(pdf.slice(xrefOffset, xrefOffset + 4), "xref");
    const xrefLines = pdf.slice(xrefOffset).split("\n");
    const objectCount = Number(xrefLines[1].split(" ")[1]);
    for (let index = 1; index < objectCount; index += 1) {
        const offset = Number(xrefLines[index + 2].slice(0, 10));
        assert.ok(pdf.startsWith(`${index} 0 obj\n`, offset), `object ${index} has a valid cross-reference offset`);
    }
    assert.match(page, /id="guideDownloadReview"/);
    assert.match(page, /id="guideDownloadReview"[^>]*>Télécharger la grille BM4 officielle/);
    assert.match(page, /id="guideDownloadReview"[^>]*hidden/);
    assert.match(script, /const downloadButton = document\.getElementById\('guideDownloadReview'\)/);
    assert.match(script, /if \(downloadButton\) downloadButton\.hidden = !savedReviewReport \|\| !savedReviewReport\.evaluations\.length/);
    assert.match(script, /function markReviewDirty\(\)[\s\S]*savedReviewReport = null/);
    const multiPageBlob = createEvaluationPdf({
        candidateName: "Caporal Élodie Martin",
        dossier: "4",
        guideName: "Commandant Léa Bernard",
        formGrade: "5,5",
        contentGrade: "12",
        finalGrade: "17,50",
        decision: "Validé",
        comment: "Commentaire détaillé. ".repeat(220),
        reviewedAt: "18 nov. 2026 à 07:00",
        exportedAt: "18 nov. 2026 à 07:05"
    });
    const multiPagePdf = Buffer.from(await multiPageBlob.arrayBuffer()).toString("latin1");
    assert.match(multiPagePdf, /\/Count 2/);
});

test("la correction Gemini est disponible pour les deux types de fiches avec validation guide et PDF", async () => {
    const [aiFunction, supabaseConfig] = await Promise.all([
        read("supabase/functions/correct-fiche-ai/index.ts"),
        read("supabase/config.toml")
    ]);

    assert.match(page, /correction assistée par IA est disponible pour les fiches de proposition et les fichette/);
    assert.match(page, /compte rendu PDF officiel est généré après son enregistrement/);
    assert.match(page, /id="guideAiCorrectionResult"[^>]*hidden/);
    assert.match(script, /isOralSupport \? 'Correction IA — Fichette orale' : 'Correction IA — Proposition'/);
    assert.match(script, /1\. Forme, Présentation & Langue/);
    assert.match(script, /suggestion\.form_evidence/);
    assert.match(script, /\/functions\/v1\/correct-fiche-ai/);
    assert.match(script, /await api\('\/rest\/v1\/fiche_reviews\?on_conflict=/);
    assert.doesNotMatch(script, /GEMINI_API_KEY/);
    assert.match(aiFunction, /Deno\.env\.get\("GOOGLE_API_KEY"\)\s*\|\|\s*Deno\.env\.get\("GEMINI_API_KEY"\)/);
    assert.match(aiFunction, /submission\.submission_type !== "proposition" && submission\.submission_type !== "support_oral"/);
    assert.match(aiFunction, /form_evidence/);
    assert.match(aiFunction, /Pour ce premier critère, obligatoire et doté d’une note sur 6/);
    assert.match(aiFunction, /Annotation ou justification du critère Forme absente/);
    assert.match(aiFunction, /Annotation ou justification du premier critère oral absente/);
    assert.match(aiFunction, /const isOral = submission\.submission_type === "support_oral"/);
    assert.match(aiFunction, /Deno\.env\.get\("GEMINI_FALLBACK_MODEL"\)/);
    assert.match(aiFunction, /requestGeminiFallback/);
    assert.match(aiFunction, /GEMINI_FALLBACK_MAX_ATTEMPTS = 3/);
    assert.match(aiFunction, /GEMINI_FALLBACK_RETRY_DELAYS_MS = \[1200, 3000\]/);
    assert.match(aiFunction, /GEMINI_RETRYABLE_STATUSES = new Set\(\[408, 429, 500, 502, 503, 504\]\)/);
    assert.match(aiFunction, /Retrying Gemini secondary model after transient HTTP error/);
    assert.match(aiFunction, /await wait\(delay\)/);
    assert.match(aiFunction, /Using Gemini secondary model after primary model failed/);
    assert.match(aiFunction, /Gemini secondary model returned HTTP/);
    assert.match(aiFunction, /Le modèle Gemini de secours/);
    assert.match(aiFunction, /ai_provider: correctionProvider/);
    assert.doesNotMatch(aiFunction, /OPENAI_API_KEY|OPENAI_MODEL|api\.openai\.com|requestOpenAiFallback/);
    assert.match(aiFunction, /responseMimeType: "application\/json"/);
    assert.match(aiFunction, /generationConfig: \{ responseMimeType: "application\/json", responseSchema: schema \}/);

    assert.match(aiFunction, /ORAL_RUBRIC_PROMPT/);
    assert.match(aiFunction, /SUBJECT_DRIVE_FOLDER_IDS/);
    assert.match(aiFunction, /getSubjectReferenceDocuments\(dossier: number\)/);
    assert.match(aiFunction, /const subjectFolderId = SUBJECT_DRIVE_FOLDER_IDS\[Number\(dossier\)\]/);
    // Comparer la fonction Edge aux numéros et liens Drive réellement affichés dans l’application.
    const mappingBlock = aiFunction.match(/const SUBJECT_DRIVE_FOLDER_IDS: Record<number, string> = \{([\s\S]*?)\n\};/);
    assert.ok(mappingBlock, "table des dossiers Drive déclarée explicitement");
    const functionMappings = Object.fromEntries([...mappingBlock[1].matchAll(/^\s*(\d+):\s*"([^"]+)",?$/gm)].map(match => [match[1], match[2]]));
    const applicationMappings = Object.fromEntries([...index.matchAll(/<input type="checkbox" data-dossier="(\d+)"[^>]*>\s*<span>Dossier \d+\s*:\s*([^<]+)<\/span>[\s\S]*?href="https:\/\/drive\.google\.com\/drive\/folders\/([^?"]+)/g)].map(match => [match[1], match[3]]));
    assert.equal(Object.keys(applicationMappings).length, 16, "l’application doit exposer les 16 dossiers");
    assert.deepEqual(Object.keys(functionMappings).sort((a, b) => Number(a) - Number(b)), Array.from({ length: 16 }, (_, index) => String(index + 1)), "la fonction doit associer exactement les dossiers 1 à 16");
    assert.deepEqual(functionMappings, applicationMappings, "les numéros et identifiants Drive de correct-fiche-ai doivent correspondre exactement à ceux de l’application");
    assert.equal(functionMappings["7"], "1vGE8GLEFHoX3_DjozDBR3x8ujArRV2a5", "dossier 7 = Toulaud Air Sport");
    assert.equal(functionMappings["8"], "1drUZgFsAX7tRadB-FaxuDJ1EKXC9AonL", "dossier 8 = Opération Sentinelle");
    assert.equal(functionMappings["9"], "1Fn6pmTs981S3VrTwLtNCAj2j5_d7pDtH", "dossier 9 = ARMADA");
    assert.equal(functionMappings["10"], "1_w3RI1xmAN0FCZeCEeVRXcRqvFi7ek_6", "dossier 10 = Infrastructures");
    assert.match(aiFunction, /GOOGLE_SERVICE_ACCOUNT_JSON/);
    assert.match(aiFunction, /getSubjectReferenceDocuments\(Number\(submission\.dossier\)\)/);
    assert.match(aiFunction, /listDriveChildren\(folderId, token\)/);
    assert.match(aiFunction, /MAX_REFERENCE_FILES/);
    assert.match(aiFunction, /MAX_REFERENCE_TOTAL_BYTES/);
    assert.match(aiFunction, /isCorrectionFileName/);
    assert.match(aiFunction, /corrig[eé]/);
    assert.match(aiFunction, /referenceDocuments\.map/);
    assert.match(aiFunction, /referenceWrittenBytes,[\s\S]*referenceDocuments, analysisPrompt, responseSchema/);
    assert.match(aiFunction, /RÉFÉRENTIEL DOCUMENTAIRE OBLIGATOIRE/);
    assert.match(aiFunction, /contrôle complet/);
    assert.match(aiFunction, /dossier incomplet/);
    assert.match(aiFunction, /from\("guide_candidates"\)[\s\S]*eq\("guide_id", userData\.user\.id\)[\s\S]*eq\("candidate_id", submission\.user_id\)/);
    assert.match(aiFunction, /form_grade: \{ type: "number", minimum: 0, maximum: 6 \}/);
    assert.match(aiFunction, /"Introduction", 3[\s\S]*"Problématique et données", 3[\s\S]*"Solutions réalisables", 4[\s\S]*"Avis et conclusion", 4/);
    assert.match(aiFunction, /store: false/);
    assert.match(aiFunction, /Deno\.env\.get\("GEMINI_MODEL"\)\s*\|\|\s*DEFAULT_MODEL/);
    assert.match(aiFunction, /geminiResponse\.text\(\)/);
    assert.match(aiFunction, /generateContent/);
    assert.match(supabaseConfig, /\[functions\.correct-fiche-ai\]\s*\nverify_jwt = false/);
});

test("les deux types de fiches sont identifiés, enregistrés séparément et limités aux bons usages", () => {
    const submissionsSql = readFile(new URL("supabase/fiche-submissions.sql", root), "utf8");
    const driveProxy = readFile(new URL("supabase/functions/drive-proxy/index.ts", root), "utf8");
    return Promise.all([submissionsSql, driveProxy]).then(([schema, proxy]) => {
        assert.match(schema, /submission_type in \('proposition', 'support_oral'\)/);
        assert.match(schema, /primary key \(user_id, dossier, submission_type\)/i);
        assert.match(edgeFunction, /row\.submission_type === "proposition"/);
        assert.match(edgeFunction, /subject: `DOCTRINE — \$\{submissionLabel\} — dossier \$\{dossier\}`/);
        assert.match(edgeFunction, /onConflict: "user_id,dossier,submission_type"/);
        assert.match(edgeFunction, /submission_type: submissionType/);
        assert.match(proxy, /submission_type=eq\.proposition/);
        assert.match(appScript, /body\.append\('submission_type', config\.submissionType\)/);
        assert.match(appScript, /if \(config\.submissionType === 'proposition'\) \{\s+transmittedDossiers\.add/);
        assert.match(sql, /'submission_type', submission\.submission_type/);
        assert.match(sql, /submission\.submission_type in \('proposition', 'support_oral'\)/);
        assert.match(script, /Fiche support oral/);
        assert.match(script, /isOralSupport \? 'Ouvrir le support oral' : 'Ouvrir la fiche de proposition'/);
        assert.match(script, /openSubmission\(candidate, submission\)/);
        assert.match(script, /reviewButton = element\('button', 'guide-button', 'Évaluer'\)/);
        assert.match(script, /viewer\.openSignedPdf\(relativeStorageUrl\(signedUrl\), title, '8'\)/);
        assert.match(page, /viewer\/viewer\.css/);
        assert.match(page, /viewer\/viewer\.js/);
        assert.match(page, /theme-color" content="#20352b"/);
        assert.match(page, /id="guideReviewForm" class="guide-review-form"/);
        assert.match(page, /id="guideReviewCriteria" class="guide-review-criteria"/);
        assert.match(script, /weight: 70/);
        assert.match(script, /weight: 30/);
        assert.match(script, /key: 'form', label: '1. Forme, Présentation & Langue', max: 6/);
        assert.match(script, /key: 'argumentaire', label: 'Argumentaire ID1 \/ ID2 \/ ID3 et preuves', max: 7/);
        assert.match(script, /propositionGrade \* 0\.7 \+ oralGrade \* 0\.3/);
        assert.match(script, /rubric_scores: totals\.rubricScores/);
        assert.match(script, /weightedSynthesisGrade\(submissions, submission\.dossier\)/);
        assert.match(sql, /'rubric_scores', review\.rubric_scores/);
        assert.doesNotMatch(page, /guidePdfPreview|guidePdfStatus/);
        assert.match(styles, /--guide-paper: #141c19/);
        assert.match(styles, /border-bottom: 3px solid #b52e35/);
        assert.match(styles, /@media \(max-width: 767px\)/);
        assert.match(styles, /@media \(max-width: 440px\)/);
        assert.match(styles, /\.guide-module8-page\.is-embedded \.guide-app\s*\{\s*padding: 0 8px 18px;/);
        assert.match(appStyles, /\.module8-frame\s*\{[^}]*height: clamp\(240px, calc\(100dvh - 280px\), 760px\)/);
        assert.match(appStyles, /\.module8-frame \{ height: clamp\(180px, calc\(100dvh - 250px\), 680px\); \}/);
        assert.match(viewerScript, /window\.DoctrineViewer = \{ openSignedPdf: ouvrirPdfSigne, openSignedDocument: ouvrirDocumentSigne, openDrive: ouvrirDrive \}/);
        assert.match(viewerScript, /urlDocument\.pathname\.startsWith\('\/storage\/v1\/object\/sign\/candidate-fiches\/'\)/);
        assert.match(viewerScript, /new Blob\(\[blob\], \{ type: 'application\/pdf' \}\)/);
        assert.match(viewerScript, /telecharger\.hidden = false/);
        assert.match(adminScript, /var supportOralGate = n === '4' && el\.querySelector\('#supportOralGate'\)/);
        assert.match(adminScript, /var submissionGates = \[correctionGate, supportOralGate\]/);
        assert.match(adminScript, /\.adm-ui:not\(#correctionGate\):not\(#supportOralGate\)/);
        assert.match(adminScript, /corpsEl\.querySelector\('#supportOralGate'\)/);
    });
});

test("la soumission conserve l’envoi e-mail et archive les PDF sous le dossier du candidat", () => {
    assert.match(edgeFunction, /fileBytes\.subarray\(0, 5\).*"%PDF-"/);
    assert.match(edgeFunction, /storagePath = `\$\{userData\.user\.id\}\/\$\{submissionType\}_\$\{dossier\}_\$\{timestamp\}\.pdf`/);
    assert.match(edgeFunction, /\.from\(FICHE_BUCKET\)\s*\.upload\(storagePath, fileBytes/);
    assert.match(edgeFunction, /https:\/\/api\.resend\.com\/emails/);
    assert.match(edgeFunction, /storage_path: storagePath/);
});

test("le catalogue commun est administré par admin et consultable en téléchargement par les officiers guides", () => {
    assert.match(page, /id="guideCourseCatalog"/);
    assert.match(page, /id="guideCourseAdminControls" hidden/);
    assert.match(page, /id="guideCourseForm"/);
    assert.match(page, /<dialog id="guideCourseDialog"[^>]*aria-labelledby="guideCourseDialogTitle">/);
    assert.doesNotMatch(page, /<dialog id="guideCourseDialog"[^>]*\shidden(?:\s|>)/);
    assert.match(script, /let isAdminUser = false/);
    assert.match(script, /if \(!isAdminUser\) return/);
    assert.match(script, /function driveDownloadUrl\(value\)/);
    assert.match(script, /element\('a', 'guide-course-download', 'Télécharger'\)/);
    assert.doesNotMatch(script, /Ouvrir dans Google Drive/);
    assert.match(sql, /create table if not exists public\.guide_course_catalog/);
    assert.match(sql, /create policy guide_course_catalog_read_guides[\s\S]*public\.doctrine_is_guide\(\)[\s\S]*public\.doctrine_is_admin\(\)/);
    assert.match(sql, /create policy guide_course_catalog_admin_insert[\s\S]*public\.doctrine_is_admin\(\)/);
    assert.match(sql, /create policy guide_course_catalog_admin_update[\s\S]*public\.doctrine_is_admin\(\)/);
    assert.match(sql, /create policy guide_course_catalog_admin_delete[\s\S]*public\.doctrine_is_admin\(\)/);
    assert.match(styles, /\.guide-course-grid/);
});

test("l’entrée Module 8 est conditionnelle et la page propose les parcours demandés", () => {
    assert.match(index, /id="guideModule8Nav" hidden/);
    assert.match(index, /id="btn-mod8"[^>]*onclick="openModal\('module8'\)"/);
    assert.match(index, /id="modal-module8"[\s\S]*navigateModule\('module7'\)[\s\S]*id="module8-title"[\s\S]*data-src="app\/guide-module8\.html\?embedded=1"/);
    assert.match(index, /onclick="navigateModule\('module8'\)"><span>Suivant<\/span>/);
    assert.match(index, /app\/guide-module8\.js/);
    assert.match(appScript, /module8: 'btn-mod8'/);
    assert.match(appScript, /if \(id === 'module8'\) \{\s+const guideModule8Nav = document\.getElementById\('guideModule8Nav'\);\s+return Boolean\(guideModule8Nav && !guideModule8Nav\.hidden\);/);
    assert.match(appScript, /if \(id === 'module8'\) \{\s+const guideFrame = document\.getElementById\('guideModule8Frame'\);[\s\S]*guideFrame\.src = guideFrame\.dataset\.src/);
    assert.match(appScript, /if \(id !== 'module8'\) enregistrerEvenementProgression\('module_started'/);
    assert.match(script, /doctrine:guide-access-change/);
    assert.match(page, /<h1>ESPACE OFFICIER GUIDE<\/h1>/);
    assert.doesNotMatch(page, /Suivi de Cohortes BM4/);
    assert.match(styles, /\.guide-module8-page\.is-embedded \.guide-header\s*\{\s*display:\s*none;/);
    assert.match(script, /GUIDE_ROLES = new Set\(\['guide', 'officier_guide'\]\)/);
    assert.match(script, /specialty === 'OG'/);
    assert.match(script, /admin \|\| \(GUIDE_ROLES\.has\(role\) && specialty === 'OG'\)/);
    assert.match(page, /Code candidat de 8 caractères \(communiqué par le candidat\)/);
    assert.match(page, /pattern="\[A-HJ-NP-Za-hj-np-z2-9\]\{8\}"/);
    assert.match(script, /assign_guide_candidate_by_code/);
    assert.match(script, /assignCandidate\(query, attach\)/);
    assert.match(page, /Tous mes candidats/);
    assert.match(page, /7 derniers jours/);
    assert.match(page, /30 derniers jours/);
    assert.match(page, /Rattacher un candidat/);
    assert.match(page, /Historique QCM par thème/);
    assert.match(page, /Journal Oral &amp; Sport/);
    assert.match(styles, /@media \(max-width: 767px\)/);
    assert.match(styles, /\.guide-cohort-cards\s*\{\s*display: grid/);
    const pageIds = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    const missingPageIds = [...new Set([...script.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)]
        .map(match => match[1]).filter(id => id !== "guideModule8Nav" && !pageIds.has(id)))];
    assert.deepEqual(missingPageIds, []);
});

test("le Module 1 affiche un code candidat court au style des cartes existantes", () => {
    assert.match(index, /id="candidateGuideCodeCard"[\s\S]*1\.5\.[\s\S]*Code pour Officier Guide/);
    assert.match(index, /id="candidateGuideCode" class="candidate-guide-code-value"/);
    assert.match(index, /id="copyCandidateGuideCode"[^>]*>Copier mon code/);
    assert.match(index, /id="candidateGuideCodeCard" class="candidate-guide-code-card dossier-item part-card"/);
    assert.match(index, /id="candidateGuideCodeCard"[\s\S]*?<div class="candidate-guide-code-heading">[\s\S]*?<h3 id="candidate-guide-code-title">1\.5\. Code pour Officier Guide<\/h3>[\s\S]*?<button id="copyCandidateGuideCode"[\s\S]*?<\/div>\s*<ul class="candidate-guide-code-description">\s*<li>[\s\S]*?<output id="candidateGuideCode"/);
    assert.ok(index.indexOf('id="candidateGuideCodeCard"') > index.indexOf('</div><!-- /mod-body -->'));
    assert.ok(index.indexOf('id="candidateGuideCodeCard"') < index.indexOf('id="chkModule1Valid"'));
    assert.match(appScript, /get_doctrine_candidate_guide_code/);
    assert.match(appScript, /\^\[A-HJ-NP-Z2-9\]\{8\}\$/);
    assert.match(appScript, /doctrine:login[\s\S]*refreshCandidateGuideCode/);
    assert.match(appScript, /navigator\.clipboard\.writeText\(code\)/);
});

test("le marqueur MRG masqué ne devient pas une carte visible du Module 2", () => {
    assert.match(index, /<div data-module2-mrg-version="1" hidden><\/div>/);
    assert.match(appScript, /\.mod-body\[data-mod="2"\] > div:not\(\[hidden\]\)/);
});

test("les seuils QCM et l’inactivité produisent les badges attendus", () => {
    const match = script.match(/function candidateStatus\(candidate\) \{[\s\S]*?\n    \}/);
    assert.ok(match, "candidateStatus must remain available for the cohort status calculation");
    const calculateStatus = vm.runInNewContext('(' + match[0] + ')', {
        Date,
        STALE_AFTER_DAYS: 14,
        selectedPeriodResults: candidate => candidate,
        average: candidate => candidate.mean
    });
    const active = new Date(Date.now() - 86400000).toISOString();
    const inactive = new Date(Date.now() - 15 * 86400000).toISOString();
    assert.equal(calculateStatus({ mean: 15, doctrine: { last_activity: active } }).label, "PRÊT");
    assert.equal(calculateStatus({ mean: 14, doctrine: { last_activity: active } }).label, "À SURVEILLER");
    assert.equal(calculateStatus({ mean: 10, doctrine: { last_activity: active } }).label, "À SURVEILLER");
    assert.equal(calculateStatus({ mean: 9.99, doctrine: { last_activity: active } }).label, "EN DIFFICULTÉ");
    assert.equal(calculateStatus({ mean: 18, doctrine: { last_activity: inactive } }).label, "EN DIFFICULTÉ");
});

test("la taille du texte BM4 s’adapte aux dimensions des champs PDF", async () => {
    const { calculateBm4FontSize } = await import("../app/bm4-official-pdf.mjs");
    const font = {
        widthOfTextAtSize: (text, size) => [...text].length * size * 0.5
    };

    assert.equal(calculateBm4FontSize("NOTE", {
        font, width: 100, height: 20, baseSize: 10
    }), 10, "un texte court conserve la taille du modèle");

    const reducedWidth = calculateBm4FontSize("UNE OBSERVATION BEAUCOUP TROP LONGUE", {
        font, width: 70, height: 20, baseSize: 10, minSize: 5
    });
    assert.ok(reducedWidth < 10 && reducedWidth >= 5,
        "un texte trop large réduit progressivement la police");

    const reducedHeight = calculateBm4FontSize("première ligne\ndeuxième ligne\ntroisième ligne", {
        font, width: 200, height: 20, baseSize: 10, multiline: true, minSize: 5
    });
    assert.ok(reducedHeight < 10 && reducedHeight >= 5,
        "un texte multiligne tient compte de la hauteur disponible");

    assert.equal(calculateBm4FontSize("texte", {
        font, width: 100, height: 20, baseSize: 10
    }), 10, "les champs qui disposent de suffisamment de place gardent leur police");
});

test("l’observation et l’indice du critère Forme sont persistés séparément et transmis au PDF", async () => {
    assert.match(page, /id="guideFormObservation"/);
    assert.match(page, /id="guideFormEvidence"/);
    assert.match(script, /form_observations: formObservations/);
    assert.match(script, /form_evidence: formEvidence/);
    assert.match(script, /fiche_reviews\?select=submission_id,guide_id,form_observations,form_evidence/);
    assert.match(script, /reviewByKey\.get\(String\(submission\.id\)/);
    assert.match(script, /formObservations: saved\.form_observations/);
    assert.match(script, /formEvidence: saved\.form_evidence/);
    assert.match(script, /rubric_observations: totals\.rubricObservations/);
    assert.match(script, /rubric_evidence: totals\.rubricEvidence/);
    assert.match(script, /data-rubric-observation/);
    assert.match(script, /data-rubric-evidence/);
    assert.match(script, /rubricObservations: saved\.rubric_observations/);
    assert.match(script, /rubricEvidence: saved\.rubric_evidence/);
    assert.doesNotMatch(script, /ensureAiFormObservationInComment/);

    const helper = await read("app/bm4-official-pdf.mjs");
    assert.match(helper, /rubricObservations/);
    assert.match(helper, /rubricEvidence/);
    assert.match(helper, /Chaque critère utilise ses champs structurés/);
    assert.match(helper, /observation obligatoire du critère/);
    assert.match(sql, /add column if not exists form_observations text/);
    assert.match(sql, /add column if not exists form_evidence text/);
    assert.match(sql, /add column if not exists rubric_observations jsonb/);
    assert.match(sql, /add column if not exists rubric_evidence jsonb/);
});

test("l’observation et l’indice du critère Forme sont visibles et obligatoires dans les deux interfaces", () => {
    assert.match(script, /criterion\.key === 'form'[\s\S]*observation\.required = criterion\.key === 'form'[\s\S]*evidence\.required = criterion\.key === 'form'/);
    assert.match(script, /formFeedbackComplete[\s\S]*rubricObservations\.form[\s\S]*rubricEvidence\.form/);
    assert.match(script, /Pour le critère Forme, renseignez obligatoirement une observation et un indice documentaire vérifiable/);
    assert.match(script, /suggestionRubricDetails\(suggestion\)[\s\S]*observations\.form = String\(suggestion\.form_observations[\s\S]*evidence\.form = String\(suggestion\.form_evidence/);
    assert.match(dashboardScript, /criterion\.key === 'form'[\s\S]*observation\.required = criterion\.key === 'form'[\s\S]*evidence\.required = criterion\.key === 'form'/);
    assert.match(dashboardScript, /formFeedbackComplete[\s\S]*observations\.form[\s\S]*evidence\.form/);
    assert.match(dashboardScript, /Pour le critère Forme, renseignez obligatoirement une observation et un indice documentaire vérifiable/);
    assert.match(dashboardScript, /form_observations: isOral \? null : totals\.observations\.form/);
    assert.match(dashboardScript, /form_evidence: isOral \? null : totals\.evidence\.form/);
});

test("la correction IA exige observation et indice pour chacun des neuf critères BM4", () => {
    assert.match(correctionAiFunction, /criteria\.some\(\(criterion\) =>[\s\S]*!criterion\.observation\.trim\(\) \|\| !criterion\.evidence\.trim\(\)/);
    assert.match(correctionAiFunction, /\[operatoire, introduction, argumentaire, conclusion\]\.some\(\(criterion\) =>[\s\S]*!criterion\.observation\.trim\(\) \|\| !criterion\.evidence\.trim\(\)/);
    assert.match(correctionAiFunction, /Observation ou indice documentaire absent pour un critère de la fiche de proposition/);
    assert.match(correctionAiFunction, /Observation ou indice documentaire absent pour un critère de la fichette orale/);
});

test("la migration dédiée crée les deux dictionnaires et reprend les anciennes observations Forme", async () => {
    const migration = await read("supabase/patches/2026-11-23-bm4-structured-rubric-feedback.sql");
    assert.match(migration, /add column if not exists rubric_observations jsonb not null default '\{\}'::jsonb/);
    assert.match(migration, /add column if not exists rubric_evidence jsonb not null default '\{\}'::jsonb/);
    assert.match(migration, /add column if not exists form_observations text/);
    assert.match(migration, /add column if not exists form_evidence text/);
    assert.match(migration, /update public\.fiche_reviews[\s\S]*rubric_observations[\s\S]*review\.form_observations/);
    assert.match(migration, /when 'support_oral' then 'operatoire_forme' else 'form' end/);
    assert.match(migration, /notify pgrst, 'reload schema'/);
});

test("la grille AcroForm officielle remplace le compte rendu et exige une validation de l’Officier Guide", async () => {
    const helper = await read("app/bm4-official-pdf.mjs");
    const serviceWorker = await read("sw.js");
    assert.match(page, /pdf-lib@1\.17\.1/);
    assert.match(page, /Télécharger la grille BM4 officielle/);
    assert.match(script, /createOfficialBm4Pdf/);
    assert.match(script, /savedReviewReport = finalReview\.status === 'valide'/);
    assert.match(script, /Grille_BM4_Dossier_/);
    assert.match(helper, /grille-evaluation-synthese-bm4-interactive\.pdf/);
    assert.match(helper, /candidat_nom/);
    assert.match(helper, /note_em_/);
    assert.match(helper, /note_oral_/);
    assert.match(helper, /moyenne_globale/);
    assert.match(helper, /setFieldText\('total_em', formatGrade\(proposition\.grade\)\)/);
    assert.match(helper, /setFieldText\('total_oral', formatGrade\(oral\.grade\)\)/);
    assert.doesNotMatch(helper, /setFieldText\('total_(?:em|oral)',[^;]*\+ ['"] \/ 20/);
    assert.match(helper, /setFieldText\('moyenne_globale', report\.weightedGrade === null[\s\S]*?: formatGrade\(report\.weightedGrade\)\)/);
    assert.doesNotMatch(helper, /formatGrade\(report\.weightedGrade\) \+ ['"] \/ 20/);
    assert.match(helper, /points_forts/);
    assert.match(helper, /axes_amelioration/);
    assert.match(helper, /form\.flatten\(\)/);
    assert.match(serviceWorker, /app\/bm4-official-pdf\.mjs/);
});


test("l’export final candidat est distinct et conditionné à la validation des deux fiches", () => {
    assert.match(page, /id="guideExportFinalCandidate"[^>]*hidden>Exporter l’évaluation finale pour le candidat/);
    assert.match(script, /async function exportFinalCandidateEvaluation\(\)/);
    assert.match(script, /savedReviewReport\.weightedGrade === null/);
    assert.match(script, /type === 'proposition'/);
    assert.match(script, /type === 'support_oral'/);
    assert.match(script, /Evaluation_finale_BM4_/);
    assert.match(script, /Évaluation finale BM4 exportée/);
    assert.match(script, /guideExportFinalCandidate'\)\?\.addEventListener\('click', exportFinalCandidateEvaluation\)/);
});

test("les observations IA de la fichette affichent réellement les quatre critères, dont opératoire /6", () => {
    const helperMatch = script.match(/function aiCriteriaForDisplay\(suggestion\) \{[\s\S]*?\n    \}/);
    assert.ok(helperMatch, "le helper utilisé par le rendu des observations IA doit exister");
    const buildCriteria = vm.runInNewContext('(' + helperMatch[0] + ')');
    const suggestion = {
        submission_type: "support_oral",
        form_grade: 5,
        form_observations: "Les cinq cases sont présentes, mais deux actions manquent de responsables.",
        form_evidence: "Case 3 : absence de responsable désigné.",
        oral_operatoire: {
            label: "Caractère opératoire et gabarit 5 cases",
            grade: 5,
            max_grade: 6,
            observation: "Les cinq cases sont présentes, mais deux actions manquent de responsables.",
            evidence: "Case 3 : absence de responsable désigné."
        },
        criteria: [
            { label: "Introduction structurée en cinq points", grade: 3, max_grade: 4, observation: "Introduction incomplète.", evidence: "Page 1." },
            { label: "Argumentaire ID1 / ID2 / ID3 et preuves", grade: 5, max_grade: 7, observation: "ID2 manque de preuve.", evidence: "Case 4." },
            { label: "Conclusion", grade: 2, max_grade: 3, observation: "Conclusion présente.", evidence: "Case 5." }
        ]
    };
    const displayed = buildCriteria(suggestion);
    assert.equal(displayed.length, 4);
    assert.match(displayed[0].label, /Caractère opératoire/);
    assert.equal(displayed[0].grade, 5);
    assert.equal(displayed[0].max_grade, 6);
    assert.match(displayed[0].observation, /responsables/);
    assert.match(displayed[0].evidence, /Case 3/);
    assert.deepEqual(Array.from(displayed, item => item.label), [
        "Caractère opératoire et gabarit 5 cases",
        "Introduction structurée en cinq points",
        "Argumentaire ID1 / ID2 / ID3 et preuves",
        "Conclusion"
    ]);
    assert.match(script, /aiCriteriaForDisplay\(suggestion\)\.forEach/);
    assert.match(script, /element\('li', 'guide-ai-criterion-card'\)/);
    assert.match(script, /element\('strong', 'guide-ai-criterion-title'/);
    assert.match(script, /element\('p', 'guide-ai-criterion-observation'/);
    assert.match(script, /element\('p', 'guide-ai-criterion-evidence'/);
    assert.match(styles, /\.guide-ai-criteria li\.guide-ai-criterion-card\s*\{[\s\S]*?border-left: 3px solid #d9a95f;[\s\S]*?border-radius: 8px;/);
    assert.match(styles, /\.guide-ai-criteria \.guide-ai-criterion-title/);
    assert.match(styles, /\.guide-ai-criteria \.guide-ai-criterion-observation/);
    assert.match(styles, /\.guide-ai-criteria \.guide-ai-criterion-evidence/);
});

test("les axes d’amélioration sont séparés et exclus des synthèses et comparaisons", () => {
    assert.ok(script.includes("const propositionImprovements = proposition"));
    assert.ok(script.includes("const oralImprovements = oral"));
    assert.ok(script.includes("'FICHE DR — FICHE DE PROPOSITION\\n' + propositionImprovements"));
    assert.ok(script.includes("'FICHETTE ORALE\\n' + oralImprovements"));
    assert.ok(script.includes("const stopLabels = [...nextLabels, 'Comparaison avec la fiche écrite']"));

    const helperStart = script.indexOf("function extractFeedbackSection(comment, label, nextLabels) {");
    const helperEnd = script.indexOf("\n    function criterionObservation", helperStart);
    assert.ok(helperStart >= 0 && helperEnd > helperStart, "le helper d’extraction doit exister");
    const helperSource = script.slice(helperStart, helperEnd).trim();
    const extract = vm.runInNewContext("(" + helperSource + ")");
    const comment = ["Axes de progrès: Premier axe; deuxième axe", "Synthèse : Synthèse de la fiche.", "", "Comparaison avec la fiche écrite : Comparaison détaillée."].join("\n");
    assert.equal(extract(comment, "Axes de progrès", ["Synthèse", "Points forts"]), "Premier axe; deuxième axe");
});

test("les points clés du jury sont cochables manuellement et conservés pour les deux fiches", () => {
    assert.match(page, /id="guideJuryChecklistItems"/);
    assert.match(page, /Points clés attendus par le jury/);
    assert.match(script, /const JURY_CHECKLISTS = \{/);
    assert.match(script, /p_form_pages/);
    assert.match(script, /p_solutions_three/);
    assert.match(script, /oral_operatoire/);
    assert.match(script, /oral_introduction/);
    assert.match(script, /oral_argumentaire/);
    assert.match(script, /oral_conclusion/);
    assert.match(script, /function renderJuryChecklist\(submission, review\)/);
    assert.match(script, /const JURY_CHECKLIST_SCORE_MAP = \{/);
    assert.match(script, /function automaticJuryChecklist\(submission, rubricScores\)/);
    assert.match(script, /score >= criterion\.max \* 0\.75/);
    assert.match(script, /function syncAutomaticJuryChecklist\(\)/);
    assert.match(script, /input\.dataset\.juryManual === 'true'/);
    assert.match(script, /input\.dataset\.juryManual = 'true'/);
    assert.match(script, /input\.addEventListener\('input', syncAutomaticJuryChecklist\)/);
    assert.match(script, /function collectJuryChecklist\(submission\)/);
    assert.match(script, /const allowedItems = JURY_CHECKLISTS\[type\]/);
    assert.match(script, /container\.querySelectorAll\('\[data-jury-checklist\]'\)/);
    assert.match(script, /if \(allowedKeys\.has\(key\)\) checklist\[key\] = input\.checked/);
    assert.match(script, /collectJuryChecklist\(activeReviewSubmission\)/);
    assert.match(script, /String\(activeReviewSubmission\.id\) !== String\(submissionId\)/);
    assert.match(script, /container\.querySelectorAll\('\[data-jury-checklist\]'\)/);
    assert.match(script, /jury_checklist: juryChecklist/);
    assert.match(script, /jury_checklist: savedRow\?\.jury_checklist \?\? juryChecklist/);
    assert.match(sql, /add column if not exists jury_checklist jsonb not null default '\{\}'::jsonb/);
    assert.match(sql, /jsonb_each\(new\.jury_checklist\)/);
    assert.match(sql, /'oral_operatoire',\s*'oral_introduction',\s*'oral_argumentaire',\s*'oral_conclusion'/);
    assert.doesNotMatch(sql, /'o_operatoire'|'o_five_cases'|'o_readability'/);

    assert.match(sql, /'jury_checklist', review\.jury_checklist/);
    assert.match(styles, /\.guide-jury-check-item input\[type="checkbox"\]/);
});


test("les cases du jury sont précochées selon les notes et restent modifiables par le guide", () => {
    assert.match(script, /form: \['p_form_pages', 'p_form_header', 'p_form_references', 'p_form_style'\]/);
    assert.match(script, /introduction: \['p_intro_context', 'p_intro_solution', 'p_intro_plan'\]/);
    assert.match(script, /operatoire_forme: \['oral_operatoire'\]/);
    assert.match(script, /introduction: \['oral_introduction'\]/);
    assert.match(script, /argumentaire: \['oral_argumentaire'\]/);
    assert.match(script, /conclusion: \['oral_conclusion'\]/);
    const oralChecklist = script.match(/support_oral: \[([\s\S]*?)\n        \]/);
    assert.ok(oralChecklist, "la checklist orale doit être définie");
    assert.equal([...oralChecklist[1].matchAll(/\{ key:/g)].length, 4,
        "la fichette orale doit afficher exactement les quatre critères officiels");
    assert.match(oralChecklist[1], /gabarit des cinq cases \(\/6\)/);
    assert.match(oralChecklist[1], /cinq points attendus \(\/4\)/);
    assert.match(oralChecklist[1], /ID1 \/ ID2 \/ ID3 et preuves vérifiables \(\/7\)/);
    assert.match(oralChecklist[1], /orientée vers la décision ou les suites à donner \(\/3\)/);
    assert.doesNotMatch(oralChecklist[1], /copier-coller|langue|chronométrage|paperboard|lecture/);
    assert.match(script, /const initial = hasSavedChecklist\s*\?\s*saved\s*:\s*automaticJuryChecklist/);
    assert.match(script, /checklist\.some\(function \(item\) \{\s+return Object\.prototype\.hasOwnProperty\.call\(saved, item\.key\);/);
    assert.match(script, /if \(input\.dataset\.juryManual === 'true'\) return/);
    assert.match(script, /input\.addEventListener\('change', function \(\)/);
    assert.match(script, /jury_checklist: juryChecklist/);
});


test("le suivi Officier Guide consolide les validations des sept modules et les preuves existantes", () => {
    assert.equal((script.match(/card\('Module [1-7]'/g) || []).length, 7);
    assert.match(script, /async function enrichCandidateProgress/);
    assert.match(script, /doctrine_progress_events\?select=event_type,module_id,dossier,created_at/);
    assert.match(script, /doctrine_retex\?select=created_at/);
    assert.match(script, /doctrine_candidate_cvs\?select=uploaded_at,original_filename,file_size/);
    assert.match(script, /'Module 7', Boolean\(retex\) \|\| Boolean\(module7\)/);
    assert.match(progressSyncSql, /grant select on public\.doctrine_retex to authenticated/);
    assert.match(progressSyncSql, /grant select on public\.doctrine_progress_events to authenticated/);
    assert.match(progressSyncSql, /create policy doctrine_progress_events_candidate_or_assigned_guide_read[\s\S]*user_id = auth\.uid\(\)[\s\S]*public\.doctrine_can_access_candidate\(user_id\)/);
    assert.doesNotMatch(progressSyncSql, /drop policy[^;]*doctrine_progress_events/i);
    assert.match(progressSyncSql, /relrowsecurity/);
    assert.match(progressSyncSql, /doctrine_can_access_candidate\(user_id\)/);
    assert.match(progressSyncSql, /count\(distinct submission\.dossier\) >= 2/);
    assert.match(progressSyncSql, /average_score >= 13/);
    assert.match(progressSyncSql, /public\.doctrine_candidate_cvs/);
    assert.match(progressSyncSql, /public\.doctrine_retex retex/);
    assert.match(progressSyncSql, /started\.event_type = 'module_started'/);
    assert.doesNotMatch(progressSyncSql, /drop trigger if exists doctrine_progress_events_set_identity/);
    assert.match(progressSyncSql, /create or replace function public\.doctrine_progress_events_set_identity/);
    assert.match(progressSyncSql, /if auth\.uid\(\) is not null[\s\S]*new\.user_id := auth\.uid\(\)[\s\S]*elsif new\.user_id is null/);
});

test('la grille BM4 peut être ouverte directement depuis le suivi Officier Guide pour une fiche du dossier', () => {
    assert.match(script, /guide_action/);
    assert.match(script, /candidate_id/);
    assert.match(script, /submission_id/);
    assert.match(script, /guideAction === 'open'/);
    assert.match(script, /openSubmission\(candidate, submission\)/);
    assert.match(script, /guideAction === 'evaluate'/);
    assert.match(script, /openReview\(candidate, submission\)/);
    assert.match(script, /guideAction === 'correct'/);
    assert.match(script, /runAiCorrection\(candidate, submission, null\)/);
    assert.match(script, /doctrine:guide-review-saved/);
});


test("le module 8 affiche le message explicite lorsque le service IA renvoie HTTP 502 ou 503", () => {
    const unavailable = "Service IA temporairement indisponible. Votre fiche n'a pas été corrigée. Vous pouvez réessayer ultérieurement.";
    assert.match(script, /error\.status = response\.status/);
    assert.match(script, /error\.status === 502 \|\| error\.status === 503/);
    assert.ok(script.includes(unavailable));
});


test("une évaluation BM4 reste verrouillée si le rechargement structuré échoue ou ne retrouve pas un avis", () => {
    assert.match(script, /submission\.rubricFeedbackLoaded = !missingStructuredReview/);
    assert.match(script, /submission\.rubricFeedbackLoaded = false/);
    assert.match(script, /submission\.rubricFeedbackLoaded !== true/);
    assert.match(script, /modification des évaluations bloquée/);
    assert.match(script, /Enregistrement bloqué : les observations structurées BM4/);
});


test("les champs Forme alimentés par Gemini restent visibles dans le tableau de bord Officier Guide", () => {
    assert.match(dashboardScript, /Observation du critère Forme — obligatoire/);
    assert.match(dashboardScript, /Indice documentaire du critère Forme/);
    assert.match(dashboardScript, /formObservation\.value = String\(suggestion\.form_observations \|\| ''\)\.trim\(\)/);
    assert.match(dashboardScript, /formEvidence\.value = String\(suggestion\.form_evidence \|\| ''\)\.trim\(\)/);
    assert.doesNotMatch(dashboardScript, /formObservationLabel\.hidden\s*=\s*true/);
    assert.doesNotMatch(dashboardScript, /formEvidenceLabel\.hidden\s*=\s*true/);
});


test("Gemini doit rédiger toutes les corrections écrites et orales en français", () => {
    const frenchRule = /RÈGLE DE LANGUE IMPÉRATIVE[\s\S]*?aucune phrase ni expression anglaise dans tes commentaires/i;
    assert.match(correctionAiFunction, frenchRule);
    assert.match(correctionAiFunction, /Rédige toutes les observations, preuves expliquées, limitations, points forts, axes de progrès et la synthèse exclusivement en français/i);
    assert.match(correctionAiFunction, /const RUBRIC_PROMPT = \[/);
    assert.match(correctionAiFunction, /const ORAL_RUBRIC_PROMPT = \[/);
    assert.match(correctionAiFunction, /courte citation originale d’un document peut rester dans sa langue, avec une explication en français/i);
});


test("la correction IA exploite obligatoirement le dossier d’exercice et les rapports des jurys 2023, 2024 et 2025", () => {
    assert.match(correctionAiFunction, /const JURY_REFERENCE_FILES = \[/);
    assert.match(correctionAiFunction, /year: "2023", id: "1NTokt0W6_EfUxgC6jHrC0kjZe2pr1mNu"/);
    assert.match(correctionAiFunction, /year: "2024", id: "1avqwK8RYtifPxRm5IJst6vp2bThdusMu"/);
    assert.match(correctionAiFunction, /year: "2025", id: "1EYf-cJLYYcpaQtyXI39UClwfXZe6nSxy"/);
    assert.match(correctionAiFunction, /async function getJuryReferenceDocuments/);
    assert.match(correctionAiFunction, /getSubjectReferenceDocuments\(Number\(submission\.dossier\)\)/);
    assert.match(correctionAiFunction, /juryReferences = await getJuryReferenceDocuments\(\)/);
    assert.match(correctionAiFunction, /referenceDocuments = subjectReferences\.concat\(juryReferences\)/);
    assert.match(correctionAiFunction, /reference_sources: referenceSources/);
    assert.match(correctionAiFunction, /Exploite les trois rapports du jury pour confronter la méthode/);
    assert.match(correctionAiFunction, /inaccessible dans Google Drive/);
    assert.match(correctionAiFunction, /n’est pas un PDF exploitable/);
});

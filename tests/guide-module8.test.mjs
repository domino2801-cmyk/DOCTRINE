import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

const [sql, edgeFunction, index, page, styles, script, appScript, adminScript, viewerScript, ogAccessPatch, shortCodePatch, appStyles] = await Promise.all([
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
    read("app/styles.css")
]);

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
    assert.match(sql, /create or replace function public\.assign_guide_candidate_by_code\(p_code text\)[\s\S]*public\.doctrine_is_guide\(\)[\s\S]*code_row\.code = candidate_code[\s\S]*perform public\.assign_guide_candidate\(candidate_id\)/);
    assert.match(shortCodePatch, /create table if not exists public\.doctrine_candidate_guide_codes/);
    assert.match(shortCodePatch, /create or replace function public\.get_doctrine_candidate_guide_code\(\)/);
    assert.match(shortCodePatch, /create or replace function public\.assign_guide_candidate_by_code\(p_code text\)/);
    assert.match(shortCodePatch, /revoke all on public\.doctrine_candidate_guide_codes from public, anon, authenticated/);
    assert.match(sql, /create or replace function public\.doctrine_is_guide\(\)[\s\S]*auth\.jwt\(\) -> 'app_metadata' ->> 'specialty'[\s\S]*'OG'/);
    assert.match(ogAccessPatch, /public\.doctrine_is_guide\(\)[\s\S]*auth\.jwt\(\) -> 'app_metadata' ->> 'specialty'[\s\S]*'OG'/);
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
    assert.match(aiFunction, /subjectReferences\.map/);
    assert.match(aiFunction, /DOSSIER DOCUMENTAIRE DE RÉFÉRENCE/);
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
        assert.match(viewerScript, /window\.DoctrineViewer = \{ openSignedPdf: ouvrirPdfSigne \}/);
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
    assert.match(script, /admin \|\| GUIDE_ROLES\.has\(role\)/);
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

    const reducedHeight = calculateBm4FontSize("première ligne\\ndeuxième ligne\\ntroisième ligne", {
        font, width: 200, height: 20, baseSize: 10, multiline: true, minSize: 5
    });
    assert.ok(reducedHeight < 10 && reducedHeight >= 5,
        "un texte multiligne tient compte de la hauteur disponible");

    assert.equal(calculateBm4FontSize("texte", {
        font, width: 100, height: 20, baseSize: 10
    }), 10, "les champs qui disposent de suffisamment de place gardent leur police");
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

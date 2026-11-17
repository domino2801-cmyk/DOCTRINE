import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

const [sql, edgeFunction, index, page, styles, script, appScript, adminScript, ogAccessPatch, shortCodePatch] = await Promise.all([
    read("supabase/guide_module8.sql"),
    read("supabase/functions/doctrine-submit-fiche/index.ts"),
    read("index.html"),
    read("app/guide-module8.html"),
    read("app/guide-module8.css"),
    read("app/guide-module8.js"),
    read("app/app.js"),
    read("admin/admin.js"),
    read("supabase/guide_module8-og-access.sql"),
    read("supabase/guide_module8-short-code.sql")
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
    assert.match(sql, /create policy fiche_reviews_candidate_read_own/);
    assert.match(sql, /create policy fiche_reviews_guide_insert_assigned/);
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
        assert.match(sql, /submission\.submission_type = 'proposition'/);
        assert.match(script, /Fiche support oral/);
        assert.match(script, /isOralSupport \? 'Ouvrir le support oral' : 'Ouvrir PDF & Noter'/);
        assert.match(script, /layout\.classList\.toggle\('is-readonly', isOralSupport\)/);
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
    assert.match(index, /id="candidateGuideCodeCard" class="candidate-guide-code-card dossier-item"/);
    assert.ok(index.indexOf('id="candidateGuideCodeCard"') > index.indexOf('</div><!-- /mod-body -->'));
    assert.ok(index.indexOf('id="candidateGuideCodeCard"') < index.indexOf('id="chkModule1Valid"'));
    assert.match(appScript, /get_doctrine_candidate_guide_code/);
    assert.match(appScript, /\^\[A-HJ-NP-Z2-9\]\{8\}\$/);
    assert.match(appScript, /doctrine:login[\s\S]*refreshCandidateGuideCode/);
    assert.match(appScript, /navigator\.clipboard\.writeText\(code\)/);
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

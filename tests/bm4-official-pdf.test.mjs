import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createOfficialBm4Pdf } from "../app/bm4-official-pdf.mjs";

const templateBytes = await readFile(new URL("../app/grille-evaluation-synthese-bm4-interactive.pdf", import.meta.url));
const PDFLib = { PDFDocument, StandardFonts, rgb };

const report = {
    candidateName: "Caporal Élodie Martin",
    specialty: "INF",
    dossier: "4",
    subject: "Organisation du soutien en opération",
    guideName: "Commandant Léa Bernard",
    weightedGrade: 15.65,
    strengths: "FICHE DR — FICHE DE PROPOSITION\\nAnalyse structurée et propositions réalistes.\\n\\nFICHETTE ORALE\\nPrésentation orale claire et convaincante.",
    improvements: "Préciser le calendrier de mise en œuvre.",
    evaluations: [
        {
            type: "proposition",
            grade: 15.5,
            juryChecklist: [
                { key: "p_form_pages", label: "Gabarit EM : timbre, destinataire réel, objet précis, références et pièces jointes.", checked: true },
                { key: "p_form_header", label: "Lisibilité : copie propre et aérée.", checked: false }
            ],
            rubricScores: {
                form: 5.5,
                introduction: 2.5,
                problematique_donnees: 2.5,
                solutions: 3.5,
                avis_conclusion: 1.5
            },
            criteria: [
                { key: "form", label: "1. Forme, Présentation & Langue" },
                { key: "introduction", label: "Introduction" },
                { key: "problematique_donnees", label: "Problématique et données" },
                { key: "solutions", label: "Solutions réalisables" },
                { key: "avis_conclusion", label: "Avis et conclusion" }
            ],
            comment: [
                "1. Forme, Présentation & Langue : — Présentation claire et rédaction soignée.",
                "Introduction : — Accroche pertinente et contexte bien posé.",
                "Problématique et données : — Données chiffrées à compléter.",
                "Solutions réalisables : — Solutions adaptées aux contraintes.",
                "Avis et conclusion : — Conclusion à rendre plus ferme."
            ].join("\n")
        },
        {
            type: "support_oral",
            grade: 16,
            juryChecklist: [
                { key: "o_anti_copy", label: "Non-recopie : le support n’est pas un copier-coller miniature de la fiche état-major.", checked: true },
                { key: "o_five_cases", label: "Gabarit e-Form : tableau structuré en cinq cases.", checked: false },
                { key: "o_operatoire", label: "Exploitabilité orale : mots-clés et chiffres saillants.", checked: true }
            ],
            rubricScores: {
                operatoire_forme: 5.5,
                introduction: 3,
                argumentaire: 6,
                conclusion: 1.5
            },
            criteria: [
                { key: "operatoire_forme", label: "Caractère opératoire et gabarit 5 cases" },
                { key: "introduction", label: "Introduction structurée en cinq points" },
                { key: "argumentaire", label: "Argumentaire ID1 / ID2 / ID3 et preuves" },
                { key: "conclusion", label: "Conclusion" }
            ],
            comment: [
                "Caractère opératoire et gabarit 5 cases : — Support lisible et directement exploitable.",
                "Introduction structurée en cinq points : — Introduction concise.",
                "Argumentaire ID1 / ID2 / ID3 et preuves : — Argumentation convaincante.",
                "Conclusion : — Conclusion à approfondir."
            ].join("\n")
        }
    ]
};

test("génère réellement la grille BM4 et vérifie les champs, notes et observations", async () => {
    const blob = await createOfficialBm4Pdf(report, {
        PDFLib,
        templateBytes,
        flatten: false
    });

    assert.equal(blob.type, "application/pdf");
    const generatedBytes = new Uint8Array(await blob.arrayBuffer());
    assert.ok(generatedBytes.length > 1000, "le PDF généré ne doit pas être vide");
    assert.equal(Buffer.from(generatedBytes).subarray(0, 5).toString(), "%PDF-");

    // On rouvre le fichier effectivement généré : le test ne se limite pas
    // à contrôler les données d'entrée ou les fonctions de mise en page.
    const reopened = await PDFDocument.load(generatedBytes);
    const form = reopened.getForm();
    const value = name => form.getTextField(name).getText();

    assert.equal(value("candidat_nom"), "Caporal Élodie Martin");
    assert.equal(value("specialite_ds"), "INF");
    assert.equal(value("sujet_traite"), "Organisation du soutien en opération");
    assert.equal(value("officier_guide"), "Commandant Léa Bernard");

    const expectedWrittenGrades = ["5,5", "2,5", "2,5", "3,5", "1,5"];
    const expectedWrittenObservations = [
        "Présentation claire et rédaction soignée.",
        "Accroche pertinente et contexte bien posé.",
        "Données chiffrées à compléter.",
        "Solutions adaptées aux contraintes.",
        "Conclusion à rendre plus ferme."
    ];
    expectedWrittenGrades.forEach((grade, index) => {
        assert.equal(value("note_em_" + (index + 1)), grade, "note écrite " + (index + 1));
        assert.equal(value("obs_em_" + (index + 1)), expectedWrittenObservations[index], "observation écrite " + (index + 1));
    });
    assert.equal(value("total_em"), "15,5");

    const expectedOralGrades = ["5,5", "3", "6", "1,5"];
    const expectedOralObservations = [
        "Support lisible et directement exploitable.",
        "Introduction concise.",
        "Argumentation convaincante.",
        "Conclusion à approfondir."
    ];
    expectedOralGrades.forEach((grade, index) => {
        assert.equal(value("note_oral_" + (index + 1)), grade, "note orale " + (index + 1));
        assert.equal(value("obs_oral_" + (index + 1)), expectedOralObservations[index], "observation orale " + (index + 1));
    });
    assert.equal(value("total_oral"), "16");
    assert.equal(value("moyenne_globale"), "15,65");
    // Les champs du débriefing sont des cases de notes, distinctes des commentaires.
    assert.equal(value("bilan_em"), "15,5");
    assert.equal(value("bilan_oral"), "16");
    assert.equal(value("points_forts"), [
        "FICHE DE PROPOSITION",
        "Analyse structurée et propositions réalistes.",
        "",
        "FICHETTE ORALE",
        "Présentation orale claire et convaincante."
    ].join("\n"));
    assert.doesNotMatch(value("points_forts"), /FICHE DR/);
    assert.match(value("points_forts"), /FICHE DE PROPOSITION/);
    assert.match(value("points_forts"), /FICHETTE ORALE/);
    assert.ok(value("points_forts").indexOf("FICHE DE PROPOSITION") < value("points_forts").indexOf("FICHETTE ORALE"));
    assert.equal(value("axes_amelioration"), report.improvements);
    assert.equal(reopened.getPageCount(), (await PDFDocument.load(templateBytes)).getPageCount(), "le PDF doit conserver strictement les deux pages du modèle");
    assert.equal(form.getCheckBox("cb_em_1_1").isChecked(), true, "le premier point de la fiche de proposition doit cocher la case déjà présente");
    assert.equal(form.getCheckBox("cb_em_1_2").isChecked(), false, "un point non acquis doit rester décoché");
    assert.equal(form.getCheckBox("cb_oral_1_1").isChecked(), true, "le point non-recopie oral doit cocher sa case existante");
    assert.equal(form.getCheckBox("cb_oral_1_3").isChecked(), true, "le point exploitabilité orale doit cocher sa case existante");

    // Contrôle aussi le mode réellement utilisé en production : PDF aplati,
    // lisible sans formulaire interactif et sans champs AcroForm résiduels.
    const productionBlob = await createOfficialBm4Pdf(report, { PDFLib, templateBytes });
    const productionPdf = await PDFDocument.load(new Uint8Array(await productionBlob.arrayBuffer()));
    assert.equal(productionPdf.getPageCount(), (await PDFDocument.load(templateBytes)).getPageCount(), "le PDF final doit conserver les pages du modèle, sans ajout");
    assert.equal(productionPdf.getForm().getFields().length, 0, "les champs doivent être aplatis dans le PDF final");
});

test("récupère l'observation de forme malgré les variantes de format des commentaires", async () => {
    const variants = [
        "Forme : 5,5 / 6 — Observation issue de la synthèse IA · Indice : document relu",
        "Forme, Présentation & Langue : Observation saisie par le guide",
        "Forme / Présentation / Langue : Observation avec séparateurs obliques",
        "forme présentation langue: — Observation avec tiret",
        "Forme, présentation et langue (/6) : 5,5/6 – Observation avec libellé complet",
        "1. Forme, Présentation & Langue (/6) : Observation saisie sans note"
    ];

    for (const comment of variants) {
        const variantReport = structuredClone(report);
        variantReport.evaluations[0].comment = comment;
        const blob = await createOfficialBm4Pdf(variantReport, {
            PDFLib,
            templateBytes,
            flatten: false
        });
        const pdf = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
        assert.match(
            pdf.getForm().getTextField("obs_em_1").getText(),
            /Observation/,
            "l'observation doit être extraite même si sa présentation varie"
        );
    }
});

test("conserve l'indice documentaire de la correction IA dans l'observation PDF", async () => {
    const indexedReport = structuredClone(report);
    indexedReport.evaluations[0].comment =
        "Forme : La fiche de proposition écrite respecte les codes militaires. · Indice : Fiche de proposition écrite, page 2, lignes 14 à 26 : CIAZDS-NORD.";

    const blob = await createOfficialBm4Pdf(indexedReport, {
        PDFLib,
        templateBytes,
        flatten: false
    });
    const pdf = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    assert.equal(
        pdf.getForm().getTextField("obs_em_1").getText(),
        "La fiche de proposition écrite respecte les codes militaires. · Indice : Fiche de proposition écrite, page 2, lignes 14 à 26 : CIAZDS-NORD."
    );
});

test("utilise l'observation de forme de secours si le commentaire ne la contient pas", async () => {
    const fallbackReport = structuredClone(report);
    fallbackReport.evaluations[0].comment = "Introduction : — Contexte bien posé.";
    fallbackReport.evaluations[0].formObservations = "Observation de forme enregistrée séparément.";

    const blob = await createOfficialBm4Pdf(fallbackReport, {
        PDFLib,
        templateBytes,
        flatten: false
    });
    const pdf = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    assert.equal(
        pdf.getForm().getTextField("obs_em_1").getText(),
        "Observation de forme enregistrée séparément."
    );
});

test("utilise prioritairement l’observation et l’indice structurés sans dépendre du commentaire", async () => {
    const structuredReport = structuredClone(report);
    structuredReport.evaluations[0].comment = "Introduction : — Contexte bien posé.";
    structuredReport.evaluations[0].formObservations = "Observation structurée prioritaire.";
    structuredReport.evaluations[0].formEvidence = "Page 2, en-tête et références.";

    const blob = await createOfficialBm4Pdf(structuredReport, {
        PDFLib,
        templateBytes,
        flatten: false
    });
    const pdf = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    assert.equal(
        pdf.getForm().getTextField("obs_em_1").getText(),
        "Observation structurée prioritaire. · Indice : Page 2, en-tête et références."
    );
});


test("exporte les neuf observations et indices structurés sans lire le commentaire libre", async () => {
    const structuredReport = structuredClone(report);
    structuredReport.evaluations[0].comment = "Commentaire général sans observation de critère.";
    structuredReport.evaluations[0].rubricObservations = {
        form: "Observation forme écrite.",
        introduction: "Observation introduction écrite.",
        problematique_donnees: "Observation problématique écrite.",
        solutions: "Observation solutions écrite.",
        avis_conclusion: "Observation conclusion écrite."
    };
    structuredReport.evaluations[0].rubricEvidence = {
        form: "Preuve page 1.",
        introduction: "Preuve page 2.",
        problematique_donnees: "Preuve page 3.",
        solutions: "Preuve page 4.",
        avis_conclusion: "Preuve page 5."
    };
    structuredReport.evaluations[1].comment = "Autre commentaire général.";
    structuredReport.evaluations[1].rubricObservations = {
        operatoire_forme: "Observation opératoire orale.",
        introduction: "Observation introduction orale.",
        argumentaire: "Observation argumentaire oral.",
        conclusion: "Observation conclusion orale."
    };
    structuredReport.evaluations[1].rubricEvidence = {
        operatoire_forme: "Preuve oral page 1.",
        introduction: "Preuve oral page 2.",
        argumentaire: "Preuve oral page 3.",
        conclusion: "Preuve oral page 4."
    };

    const blob = await createOfficialBm4Pdf(structuredReport, { PDFLib, templateBytes, flatten: false });
    const pdf = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    const form = pdf.getForm();
    const expectedWritten = [
        "Observation forme écrite. · Indice : Preuve page 1.",
        "Observation introduction écrite. · Indice : Preuve page 2.",
        "Observation problématique écrite. · Indice : Preuve page 3.",
        "Observation solutions écrite. · Indice : Preuve page 4.",
        "Observation conclusion écrite. · Indice : Preuve page 5."
    ];
    const expectedOral = [
        "Observation opératoire orale. · Indice : Preuve oral page 1.",
        "Observation introduction orale. · Indice : Preuve oral page 2.",
        "Observation argumentaire oral. · Indice : Preuve oral page 3.",
        "Observation conclusion orale. · Indice : Preuve oral page 4."
    ];
    expectedWritten.forEach((value, index) => assert.equal(form.getTextField("obs_em_" + (index + 1)).getText(), value));
    expectedOral.forEach((value, index) => assert.equal(form.getTextField("obs_oral_" + (index + 1)).getText(), value));
});

test("signale explicitement une bibliothèque PDF absente", async () => {
    await assert.rejects(
        () => createOfficialBm4Pdf(report, { PDFLib: null, templateBytes }),
        /bibliothèque PDF n’est pas chargée/
    );
});

test("signale un champ absent au lieu de poursuivre avec un PDF incomplet", async () => {
    const brokenTemplate = await PDFDocument.create();
    const form = brokenTemplate.getForm();
    form.createTextField("candidat_nom");
    const brokenBytes = await brokenTemplate.save();

    await assert.rejects(
        () => createOfficialBm4Pdf(report, { PDFLib, templateBytes: brokenBytes, flatten: false }),
        /Champ PDF BM4 introuvable ou incompatible/
    );
});

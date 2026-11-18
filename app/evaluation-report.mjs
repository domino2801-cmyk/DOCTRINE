const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const COLORS = {
    ink: "#1d2922",
    green: "#1d4a33",
    paleGreen: "#edf3e9",
    muted: "#5c685f",
    line: "#cbd4cc",
    white: "#ffffff"
};
const CP1252 = {
    "’": 0x92, "‘": 0x91, "–": 0x96, "—": 0x97, "…": 0x85,
    "œ": 0x9c, "Œ": 0x8c, "€": 0x80, "“": 0x93, "”": 0x94
};

function encodePdfText(value) {
    let output = "";
    for (const character of String(value ?? "")) {
        let code = character.charCodeAt(0);
        if (character.length > 1 || (code > 255 && !CP1252[character])) {
            output += "?";
            continue;
        }
        if (CP1252[character]) code = CP1252[character];
        else if (code === 0x202f || code === 0xa0 || code < 32) code = 32;
        output += String.fromCharCode(code);
    }
    return output.replace(/[\\()]/g, "\\$&");
}

function colorValue(hex) {
    return [1, 3, 5].map((index) =>
        (parseInt(hex.slice(index, index + 2), 16) / 255).toFixed(3)
    ).join(" ");
}

function wrapText(value, fontSize, width) {
    const maxLength = Math.max(8, Math.floor(width / (fontSize * 0.52)));
    const lines = [];
    String(value ?? "").split(/\r?\n/).forEach((paragraph) => {
        let line = "";
        paragraph.split(/\s+/).forEach((word) => {
            while (word.length > maxLength) {
                if (line) {
                    lines.push(line);
                    line = "";
                }
                lines.push(word.slice(0, maxLength));
                word = word.slice(maxLength);
            }
            if ((line + " " + word).trim().length > maxLength) {
                if (line) lines.push(line);
                line = word;
            } else {
                line = (line + " " + word).trim();
            }
        });
        lines.push(line);
    });
    return lines;
}

export function createEvaluationPdf(report) {
    const pages = [];
    let operations;
    let cursor;

    function newPage() {
        operations = [];
        pages.push(operations);
        cursor = MARGIN;
    }

    function text(x, top, size, value, bold = false, color = COLORS.ink) {
        operations.push(
            `BT ${colorValue(color)} rg /F${bold ? 2 : 1} ${size} Tf ` +
            `${x.toFixed(1)} ${(PAGE_HEIGHT - top - size).toFixed(1)} Td ` +
            `(${encodePdfText(value)}) Tj ET`
        );
    }

    function rectangle(x, top, width, height, color) {
        operations.push(
            `${colorValue(color)} rg ${x.toFixed(1)} ` +
            `${(PAGE_HEIGHT - top - height).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re f`
        );
    }

    function line(x1, top, x2, color = COLORS.line) {
        const y = PAGE_HEIGHT - top;
        operations.push(`${colorValue(color)} RG 0.7 w ${x1} ${y} m ${x2} ${y} l S`);
    }

    function ensureRoom(height) {
        if (cursor + height > PAGE_HEIGHT - MARGIN) newPage();
    }

    function sectionHeading(label) {
        ensureRoom(30);
        text(MARGIN, cursor, 12, label, true, COLORS.green);
        cursor += 22;
    }

    function paragraph(value, size = 10) {
        const lines = wrapText(value || "Aucun commentaire.", size, PAGE_WIDTH - MARGIN * 2);
        lines.forEach((content) => {
            ensureRoom(size + 6);
            text(MARGIN, cursor, size, content, false, COLORS.ink);
            cursor += size + 6;
        });
    }

    newPage();
    rectangle(0, 0, PAGE_WIDTH, 112, COLORS.green);
    text(MARGIN, 26, 19, "COMPTE RENDU D’ÉVALUATION", true, COLORS.white);
    text(MARGIN, 58, 11, "Fiche de proposition — BM4", false, COLORS.white);
    text(MARGIN, 82, 9, `Édité le ${report.exportedAt}`, false, COLORS.white);
    cursor = 136;

    sectionHeading("IDENTIFICATION");
    const identityRows = [
        ["Candidat", report.candidateName],
        ["Dossier", report.dossier],
        ["Officier guide", report.guideName]
    ];
    identityRows.forEach(([label, value]) => {
        ensureRoom(24);
        text(MARGIN, cursor, 9, label.toUpperCase(), true, COLORS.muted);
        text(170, cursor, 11, value || "Non renseigné");
        cursor += 24;
    });
    cursor += 8;
    line(MARGIN, cursor, PAGE_WIDTH - MARGIN);
    cursor += 22;

    sectionHeading("RÉSULTAT DE L’ÉVALUATION");
    rectangle(MARGIN, cursor, PAGE_WIDTH - MARGIN * 2, 62, COLORS.paleGreen);
    text(MARGIN + 14, cursor + 10, 9, "NOTE DE LA FICHE (HORS SUPPORT ORAL)", true, COLORS.green);
    text(MARGIN + 14, cursor + 28, 17, `${report.finalGrade} / 20`, true, COLORS.green);
    text(310, cursor + 20, 11, report.decision, true, COLORS.ink);
    cursor += 78;

    [
        ["Forme", `${report.formGrade} / 6`],
        ["Fond", `${report.contentGrade} / 14`]
    ].forEach(([label, value]) => {
        ensureRoom(25);
        text(MARGIN, cursor, 10, label, true);
        text(210, cursor, 10, value);
        cursor += 25;
    });
    cursor += 8;

    sectionHeading("COMMENTAIRES DE L’OFFICIER GUIDE");
    paragraph(report.comment);
    cursor += 12;

    ensureRoom(42);
    line(MARGIN, cursor, PAGE_WIDTH - MARGIN);
    cursor += 12;
    paragraph(`Évaluation enregistrée le ${report.reviewedAt}. La note présentée porte uniquement sur la fiche de proposition.`, 8);

    pages.forEach((page, index) => {
        page.push(
            `BT ${colorValue(COLORS.muted)} rg /F1 8 Tf ` +
            `${MARGIN} 26 Td (DOCTRINE — Dossier ${encodePdfText(report.dossier)} — Page ${index + 1}/${pages.length}) Tj ET`
        );
    });

    const objects = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = "<< /Type /Pages /Kids [" +
        pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ") +
        `] /Count ${pages.length} >>`;
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    pages.forEach((page, index) => {
        const content = page.join("\n");
        const pageObject = 5 + index * 2;
        objects[pageObject] =
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
            `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageObject + 1} 0 R >>`;
        objects[pageObject + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    });

    let pdf = "%PDF-1.4\n";
    const offsets = [];
    for (let index = 1; index < objects.length; index += 1) {
        offsets[index] = pdf.length;
        pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let index = 1; index < objects.length; index += 1) {
        pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const bytes = new Uint8Array(pdf.length);
    for (let index = 0; index < pdf.length; index += 1) bytes[index] = pdf.charCodeAt(index) & 255;
    return new Blob([bytes], { type: "application/pdf" });
}

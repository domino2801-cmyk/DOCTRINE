const TEMPLATE_URL = new URL('./grille-evaluation-synthese-bm4-interactive.pdf', import.meta.url);

/**
 * Calcule une taille de police qui tient dans un champ AcroForm.
 * Le calcul utilise les métriques de la même police que celle employée
 * ensuite pour générer les apparences PDF.
 */
export function calculateBm4FontSize(text, options) {
    const {
        font,
        width,
        height,
        baseSize,
        multiline = false,
        minSize = Math.min(5, baseSize),
        lineHeight = 1.2
    } = options;

    const content = multiline
        ? String(text ?? '')
        : String(text ?? '').replace(/\r?\n/g, ' ');

    if (!content.trim()) return baseSize;
    if (!font || !(width > 0) || !(height > 0) || !(baseSize > 0)) {
        return baseSize;
    }

    function fits(size) {
        const paragraphs = content.split(/\r?\n/);
        let lineCount = 0;

        for (const paragraph of paragraphs) {
            if (!paragraph) {
                lineCount += 1;
                continue;
            }

            let line = '';
            for (const word of paragraph.split(/\s+/)) {
                if (!word) continue;

                const candidate = line ? line + ' ' + word : word;
                if (font.widthOfTextAtSize(candidate, size) <= width) {
                    line = candidate;
                    continue;
                }

                if (line) {
                    lineCount += 1;
                    line = '';
                }

                // Coupe aussi les mots très longs, sans les supprimer.
                for (const character of word) {
                    const next = line + character;
                    if (line && font.widthOfTextAtSize(next, size) > width) {
                        lineCount += 1;
                        line = character;
                    } else {
                        line = next;
                    }
                }
            }

            if (line) lineCount += 1;
        }

        return lineCount * size * lineHeight <= height;
    }

    const floor = Math.max(1, Math.min(minSize, baseSize));
    for (let size = baseSize; size >= floor; size = Math.round((size - 0.25) * 100) / 100) {
        if (fits(size)) return size;
    }

    return floor;
}

function safeText(form, name, value, measureFont) {
    try {
        const field = form.getTextField(name);
        let text = String(value ?? '');

        const max = field.getMaxLength();
        if (Number.isFinite(max) && max > 0 && text.length > max) {
            // Le PDF officiel peut limiter la longueur d'un champ.
            // On augmente cette limite plutôt que de supprimer la fin du commentaire.
            field.setMaxLength(text.length);
        }

        const originalSize = field.getFontSize();
        const widgets = field.acroField.getWidgets();
        const rectangle = widgets[0]?.getRectangle();

        field.setText(text);

        if (rectangle) {
            // Marges internes prudentes pour éviter que le texte touche les bordures.
            const width = Math.max(1, rectangle.width - 6);
            const height = Math.max(1, rectangle.height - 4);
            const multiline = field.isMultiline();
            const baseSize = Number.isFinite(originalSize) && originalSize > 0
                ? originalSize
                : Math.max(5, Math.min(10, height / 1.2));

            const fontSize = calculateBm4FontSize(text, {
                font: measureFont,
                width,
                height,
                baseSize,
                multiline,
                minSize: Math.min(5, baseSize)
            });

            field.setFontSize(fontSize);
        } else if (Number.isFinite(originalSize) && originalSize > 0) {
            field.setFontSize(originalSize);
        }
    } catch (error) {
        console.warn('Champ PDF BM4 ignoré : ' + name, error);
    }
}

function formatGrade(value) {
    return value === null || value === undefined || value === ''
        ? ''
        : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function observationFor(comment, label) {
    const line = String(comment || '').split(/\r?\n/).find((item) =>
        item.trim().toLowerCase().startsWith(String(label || '').trim().toLowerCase() + ' :')
    );
    if (!line) return '';
    const separator = line.indexOf(' — ');
    return separator >= 0 ? line.slice(separator + 3).trim() : '';
}

function evaluationByType(report, type) {
    return (report.evaluations || []).find((evaluation) => evaluation.type === type) || null;
}

export async function createOfficialBm4Pdf(report) {
    if (!globalThis.PDFLib?.PDFDocument) {
        throw new Error('La bibliothèque PDF n’est pas chargée. Vérifiez votre connexion puis réessayez.');
    }
    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) throw new Error('La grille PDF BM4 vierge est introuvable.');
    const templateBytes = await response.arrayBuffer();
    const pdfDoc = await globalThis.PDFLib.PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();
    // Helvetica est également utilisée pour dessiner les apparences AcroForm :
    // les mesures et le rendu utilisent donc exactement les mêmes métriques.
    const measureFont = await pdfDoc.embedFont(globalThis.PDFLib.StandardFonts.Helvetica);
    const setFieldText = (name, value) => safeText(form, name, value, measureFont);
    const proposition = evaluationByType(report, 'proposition');
    const oral = evaluationByType(report, 'support_oral');

    setFieldText('candidat_nom', report.candidateName);
    setFieldText('specialite_ds', report.specialty);
    setFieldText('date_devoir', new Date().toLocaleDateString('fr-FR'));
    setFieldText('sujet_traite', report.subject || ('Dossier BM4 ' + report.dossier));
    setFieldText('officier_guide', report.guideName);

    if (proposition) {
        proposition.criteria.forEach((criterion, index) => {
            const number = index + 1;
            setFieldText('note_em_' + number, formatGrade(proposition.rubricScores?.[criterion.key]));
            setFieldText('obs_em_' + number, observationFor(proposition.comment, criterion.label));
        });
        setFieldText('total_em', formatGrade(proposition.grade) + ' / 20');
        setFieldText('bilan_em', proposition.comment);
    } else {
        setFieldText('bilan_em', 'Fiche de proposition non encore validée.');
    }

    if (oral) {
        oral.criteria.forEach((criterion, index) => {
            const number = index + 1;
            setFieldText('note_oral_' + number, formatGrade(oral.rubricScores?.[criterion.key]));
            setFieldText('obs_oral_' + number, observationFor(oral.comment, criterion.label));
        });
        setFieldText('total_oral', formatGrade(oral.grade) + ' / 20');
        setFieldText('bilan_oral', oral.comment);
    } else {
        setFieldText('bilan_oral', 'Fichette orale non encore validée.');
    }

    setFieldText('moyenne_globale', report.weightedGrade === null
        ? 'En attente de la validation des deux fiches'
        : formatGrade(report.weightedGrade) + ' / 20 (70 % écrit / 30 % oral)');
    setFieldText('points_forts', report.strengths || 'Non renseignés dans les observations validées.');
    setFieldText('axes_amelioration', report.improvements || 'Non renseignés dans les observations validées.');

    form.updateFieldAppearances(measureFont);
    form.flatten();
    const bytes = await pdfDoc.save({ useObjectStreams: false });
    return new Blob([bytes], { type: 'application/pdf' });
}

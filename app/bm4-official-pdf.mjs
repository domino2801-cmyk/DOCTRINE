const TEMPLATE_URL = new URL('./grille-evaluation-synthese-bm4-interactive.pdf', import.meta.url);

function safeText(form, name, value) {
    try {
        const field = form.getTextField(name);
        let text = String(value ?? '');

        const max = field.getMaxLength();
        if (Number.isFinite(max) && max > 0) {
            text = text.slice(0, max);
        }

        const modelFontSize = field.getFontSize();

        field.setText(text);

        if (Number.isFinite(modelFontSize) && modelFontSize > 0) {
            field.setFontSize(modelFontSize);
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
    const proposition = evaluationByType(report, 'proposition');
    const oral = evaluationByType(report, 'support_oral');

    safeText(form, 'candidat_nom', report.candidateName);
    safeText(form, 'specialite_ds', report.specialty);
    safeText(form, 'date_devoir', new Date().toLocaleDateString('fr-FR'));
    safeText(form, 'sujet_traite', report.subject || ('Dossier BM4 ' + report.dossier));
    safeText(form, 'officier_guide', report.guideName);

    if (proposition) {
        proposition.criteria.forEach((criterion, index) => {
            const number = index + 1;
            safeText(form, 'note_em_' + number, formatGrade(proposition.rubricScores?.[criterion.key]));
            safeText(form, 'obs_em_' + number, observationFor(proposition.comment, criterion.label));
        });
        safeText(form, 'total_em', formatGrade(proposition.grade) + ' / 20');
        safeText(form, 'bilan_em', proposition.comment);
    } else {
        safeText(form, 'bilan_em', 'Fiche de proposition non encore validée.');
    }

    if (oral) {
        oral.criteria.forEach((criterion, index) => {
            const number = index + 1;
            safeText(form, 'note_oral_' + number, formatGrade(oral.rubricScores?.[criterion.key]));
            safeText(form, 'obs_oral_' + number, observationFor(oral.comment, criterion.label));
        });
        safeText(form, 'total_oral', formatGrade(oral.grade) + ' / 20');
        safeText(form, 'bilan_oral', oral.comment);
    } else {
        safeText(form, 'bilan_oral', 'Fichette orale non encore validée.');
    }

    safeText(form, 'moyenne_globale', report.weightedGrade === null
        ? 'En attente de la validation des deux fiches'
        : formatGrade(report.weightedGrade) + ' / 20 (70 % écrit / 30 % oral)');
    safeText(form, 'points_forts', report.strengths || 'Non renseignés dans les observations validées.');
    safeText(form, 'axes_amelioration', report.improvements || 'Non renseignés dans les observations validées.');

    form.updateFieldAppearances();
    form.flatten();
    const bytes = await pdfDoc.save({ useObjectStreams: false });
    return new Blob([bytes], { type: 'application/pdf' });
}

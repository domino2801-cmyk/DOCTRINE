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
    let field;
    try {
        field = form.getTextField(name);
    } catch (error) {
        throw new Error(`Champ PDF BM4 introuvable ou incompatible « ${name} » : ${error.message}`);
    }
    try {
        let text = String(value ?? '');

        const max = field.getMaxLength();
        if (Number.isFinite(max) && max > 0 && text.length > max) {
            // Le PDF officiel peut limiter la longueur d'un champ.
            // On augmente cette limite plutôt que de supprimer la fin du commentaire.
            field.setMaxLength(text.length);
        }

        // pdf-lib expose setFontSize(), mais pas getFontSize() sur PDFTextField.
        // On récupère donc la taille initiale dans l'entrée PDF /DA (Default Appearance).
        let defaultAppearance = '';
        try {
            if (typeof field.acroField.getDefaultAppearance === 'function') {
                defaultAppearance = field.acroField.getDefaultAppearance();
            }
        } catch {
            // Certains champs du formulaire officiel n'ont pas de /DA exploitable.
            // La hauteur du widget sert alors à estimer une taille de police adaptée.
        }
        const appearanceMatch = String(defaultAppearance || '').match(/(?:^|\\s)([0-9]+(?:\\.[0-9]+)?)\\s+Tf\\b/);
        const originalSize = appearanceMatch ? Number(appearanceMatch[1]) : NaN;
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

            // Le formulaire officiel contient des champs dont /DA existe
            // mais ne comporte aucun opérateur Tf. pdf-lib ne peut pas
            // appliquer setFontSize() dans ce cas : on initialise explicitement
            // l'apparence avec la police intégrée avant de fixer la taille.
            if (!appearanceMatch) {
                if (typeof field.acroField.setDefaultAppearance !== 'function') {
                    throw new Error('Impossible d’initialiser l’apparence typographique du champ (méthode setDefaultAppearance indisponible).');
                }
                field.acroField.setDefaultAppearance(`/${measureFont.name} ${baseSize} Tf 0 g`);
            }
            field.setFontSize(fontSize);
        } else if (Number.isFinite(originalSize) && originalSize > 0) {
            field.setFontSize(originalSize);
        }
    } catch (error) {
        throw new Error(`Impossible de renseigner le champ PDF BM4 « ${name} » : ${error.message}`);
    }
}

function formatGrade(value) {
    return value === null || value === undefined || value === ''
        ? ''
        : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function normalizeObservationLabel(value) {
    return String(value || '')
        .trim()
        .replace(/^\\d+\\s*[.)-]\\s*/, '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function observationFor(comment, label, fallback = '') {
    const expectedLabel = normalizeObservationLabel(label);
    const fallbackText = String(fallback || '').trim();
    if (!expectedLabel) return fallbackText;

    const lines = String(comment || '').split(/\\r?\\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        const colon = line.indexOf(':');
        if (colon < 0) continue;

        const actualLabel = normalizeObservationLabel(line.slice(0, colon));
        if (actualLabel !== expectedLabel) continue;

        let observation = line.slice(colon + 1).trim();
        // Accepte les formats issus des commentaires du guide et de la synthèse IA :
        // « : observation », « : — observation » ou « : note / 6 — observation ».
        observation = observation.replace(/^(?:—|–|-)\\s*/, '');
        observation = observation.replace(/^\\d+(?:[,.]\\d+)?\\s*\\/\\s*\\d+(?:[,.]\\d+)?\\s*(?:—|–|-)\\s*/, '');
        observation = observation.replace(/\\s+(?:—|–|-)\\s*Indice\\s*:.*/i, '').trim();
        if (observation) return observation;
    }

    return fallbackText;
}

function formatDebriefSection(value) {
    return String(value ?? '')
        // Convertit les séquences de caractères « \n » en vrais retours à la ligne.
        .replace(/\\r\\n|\\n|\\r/g, '\n')
        // Le PDF possède déjà son propre intitulé : on retire le préfixe redondant.
        .split('\n')
        .map((line) => line.replace(/^\s*FICHE DR\s*—\s*/i, '').trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function evaluationByType(report, type) {
    return (report.evaluations || []).find((evaluation) => evaluation.type === type) || null;
}

const JURY_CHECKLIST_PDF_FIELDS = {
    proposition: [
        'cb_em_1_1', 'cb_em_1_2', 'cb_em_1_3', 'cb_em_1_4',
        'cb_em_2_1', 'cb_em_2_2', 'cb_em_2_3',
        'cb_em_3_1', 'cb_em_3_2', 'cb_em_3_3',
        'cb_em_4_1', 'cb_em_4_2', 'cb_em_4_3',
        'cb_em_5_1', 'cb_em_5_2', 'cb_em_5_3'
    ],
    support_oral: [
        'cb_oral_1_1', 'cb_oral_1_2', 'cb_oral_1_3', 'cb_oral_1_4',
        'cb_oral_2_1', 'cb_oral_2_2', 'cb_oral_2_3', 'cb_oral_2_4', 'cb_oral_2_5',
        'cb_oral_3_1', 'cb_oral_3_2', 'cb_oral_3_3', 'cb_oral_3_4', 'cb_oral_3_5',
        'cb_oral_4_1', 'cb_oral_4_2', 'cb_oral_4_3'
    ]
};

function applyJuryChecklist(form, evaluation, type) {
    if (!evaluation || !Array.isArray(evaluation.juryChecklist)) return;
    const fieldNames = JURY_CHECKLIST_PDF_FIELDS[type] || [];
    evaluation.juryChecklist.forEach((item, index) => {
        const fieldName = fieldNames[index];
        if (!fieldName) return;
        const checkbox = form.getCheckBox(fieldName);
        if (item.checked) checkbox.check();
        else checkbox.uncheck();
    });
}

export async function createOfficialBm4Pdf(report, options = {}) {
    const PDFLib = options.PDFLib || globalThis.PDFLib;
    if (!PDFLib?.PDFDocument) {
        throw new Error('La bibliothèque PDF n’est pas chargée. Vérifiez le chargement de pdf-lib puis réessayez.');
    }
    let templateBytes = options.templateBytes;
    if (!templateBytes) {
        let response;
        try {
            response = await fetch(TEMPLATE_URL);
        } catch (error) {
            throw new Error(`Impossible de télécharger la grille PDF BM4 vierge : ${error.message}`);
        }
        if (!response.ok) throw new Error(`Téléchargement de la grille PDF BM4 impossible (HTTP ${response.status}).`);
        templateBytes = await response.arrayBuffer();
    }
    const pdfDoc = await PDFLib.PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();
    // Helvetica est également utilisée pour dessiner les apparences AcroForm :
    // les mesures et le rendu utilisent donc exactement les mêmes métriques.
    const measureFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
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
            const observation = observationFor(proposition.comment, criterion.label, criterion.key === 'form'
                ? proposition.formObservations
                : '');
            if (criterion.key === 'form' && !observation) {
                throw new Error('Export PDF impossible : l’observation obligatoire du critère « Forme, Présentation & Langue » (/6) est absente. Relancez la correction IA ou renseignez cette observation dans les commentaires, puis enregistrez.');
            }
            setFieldText('obs_em_' + number, observation);
        });
        setFieldText('total_em', formatGrade(proposition.grade));
        // Dans le débriefing, bilan_em est la case de note (70 %), pas le commentaire.
        setFieldText('bilan_em', formatGrade(proposition.grade));
    } else {
        setFieldText('bilan_em', 'Fiche de proposition non encore validée.');
    }

    if (oral) {
        oral.criteria.forEach((criterion, index) => {
            const number = index + 1;
            setFieldText('note_oral_' + number, formatGrade(oral.rubricScores?.[criterion.key]));
            setFieldText('obs_oral_' + number, observationFor(oral.comment, criterion.label));
        });
        setFieldText('total_oral', formatGrade(oral.grade));
        // Dans le débriefing, bilan_oral est la case de note (30 %), pas le commentaire.
        setFieldText('bilan_oral', formatGrade(oral.grade));
    } else {
        setFieldText('bilan_oral', 'Fichette orale non encore validée.');
    }

    // Le modèle PDF porte déjà les libellés, les pondérations 70/30 et le suffixe /20.
    // Le champ ne reçoit que la valeur numérique pour éviter les doublons visuels.
    setFieldText('moyenne_globale', report.weightedGrade === null
        ? 'En attente de la validation des deux fiches'
        : formatGrade(report.weightedGrade));
    setFieldText('points_forts', formatDebriefSection(report.strengths) || 'Non renseignés dans les observations validées.');
    setFieldText('axes_amelioration', formatDebriefSection(report.improvements) || 'Non renseignés dans les observations validées.');

    // Coche les cases AcroForm déjà présentes dans la grille, sans ajouter de page.
    applyJuryChecklist(form, proposition, 'proposition');
    applyJuryChecklist(form, oral, 'support_oral');

    form.updateFieldAppearances(measureFont);
    if (options.flatten !== false) form.flatten();
    const bytes = await pdfDoc.save({ useObjectStreams: false });
    return new Blob([bytes], { type: 'application/pdf' });
}

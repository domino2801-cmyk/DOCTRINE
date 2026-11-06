import { Buffer } from "node:buffer";
import { PDFiumLibrary, type PDFiumDocument } from "npm:@hyzyla/pdfium@3.0.0";
import pixelmatch from "npm:pixelmatch@8.0.0";

const RENDER_SCALE = 150 / 72;
const MAX_PAGE_PIXELS = 10_000_000;

async function compareDocuments(model: PDFiumDocument, candidate: PDFiumDocument) {
    const modelCount = model.getPageCount();
    const candidateCount = candidate.getPageCount();
    if (modelCount !== 2) throw new Error(`Le modèle de référence comporte ${modelCount} pages au lieu de 2.`);
    if (candidateCount !== 2) {
        return { conforme: false, error: `Le document doit faire strictement 2 pages. (Reçu: ${candidateCount})` };
    }

    let totalPixels = 0;
    let differentPixels = 0;
    for (let i = 0; i < 2; i++) {
        const modelPage = model.getPage(i);
        try {
            const candidatePage = candidate.getPage(i);
            try {
                const modelSize = modelPage.getOriginalSize();
                const candidateSize = candidatePage.getOriginalSize();
                const width = Math.floor(Math.floor(modelSize.originalWidth) * RENDER_SCALE);
                const height = Math.floor(Math.floor(modelSize.originalHeight) * RENDER_SCALE);
                const candidateWidth = Math.floor(Math.floor(candidateSize.originalWidth) * RENDER_SCALE);
                const candidateHeight = Math.floor(Math.floor(candidateSize.originalHeight) * RENDER_SCALE);
                if (width !== candidateWidth || height !== candidateHeight) {
                    return { conforme: false, error: "Les dimensions des pages ne correspondent pas au modèle" };
                }
                if (width < 1 || height < 1 || width * height > MAX_PAGE_PIXELS) {
                    return { conforme: false, error: "Les dimensions des pages dépassent la limite autorisée" };
                }
                const modelImage = await modelPage.render({ scale: RENDER_SCALE, render: "bitmap" });
                const candidateImage = await candidatePage.render({ scale: RENDER_SCALE, render: "bitmap" });
                if (modelImage.width !== candidateImage.width || modelImage.height !== candidateImage.height) {
                    return { conforme: false, error: "Les dimensions des pages ne correspondent pas au modèle" };
                }
                differentPixels += pixelmatch(
                    modelImage.data,
                    candidateImage.data,
                    null,
                    modelImage.width,
                    modelImage.height,
                    { threshold: 0.1, includeAA: false }
                );
                totalPixels += modelImage.width * modelImage.height;
            } finally {
                candidatePage.close();
            }
        } finally {
            modelPage.close();
        }
    }

    const score = 100 - (differentPixels / totalPixels) * 100;
    const conforme = score >= 88;
    return {
        conforme,
        score: score.toFixed(2),
        message: conforme ? "Gabarit officiel validé" : "Gabarit non conforme ou mauvaise fiche"
    };
}

export async function comparePdf(modelBytes: Uint8Array, candidateBytes: Uint8Array) {
    const library = await PDFiumLibrary.init();
    try {
        const model = await library.loadDocument(Buffer.from(modelBytes));
        try {
            const candidate = await library.loadDocument(Buffer.from(candidateBytes));
            try {
                return await compareDocuments(model, candidate);
            } finally {
                candidate.destroy();
            }
        } finally {
            model.destroy();
        }
    } finally {
        library.destroy();
    }
}

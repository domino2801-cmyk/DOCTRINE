import pixelmatch from './vendor/pixelmatch.mjs';

const SCALE = 150 / 72;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PAGE_PIXELS = 10_000_000;

async function renderPage(page, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Rendu PDF indisponible sur cet appareil.');
        await page.render({
            canvasContext: context,
            viewport: page.getViewport({ scale: SCALE }),
            background: 'rgb(255,255,255)'
        }).promise;
        return context.getImageData(0, 0, width, height).data;
    } finally {
        canvas.width = 0;
        canvas.height = 0;
    }
}

export async function comparePdf(pdfjs, modelBytes, candidateBytes, onProgress = () => {}) {
    const modelTask = pdfjs.getDocument({ data: modelBytes });
    const candidateTask = pdfjs.getDocument({ data: candidateBytes });
    try {
        const [model, candidate] = await Promise.all([modelTask.promise, candidateTask.promise]);
        if (model.numPages !== 2) throw new Error('Le modèle de référence doit comporter 2 pages.');
        if (candidate.numPages !== 2) {
            return { conforme: false, error: 'Le document doit faire strictement 2 pages.' };
        }

        onProgress(20);
        let totalPixels = 0;
        let differentPixels = 0;
        for (let i = 1; i <= 2; i++) {
            const modelPage = await model.getPage(i);
            try {
                const candidatePage = await candidate.getPage(i);
                try {
                    const modelView = modelPage.getViewport({ scale: 1 });
                    const candidateView = candidatePage.getViewport({ scale: 1 });
                    const width = Math.floor(Math.floor(modelView.width) * SCALE);
                    const height = Math.floor(Math.floor(modelView.height) * SCALE);
                    const candidateWidth = Math.floor(Math.floor(candidateView.width) * SCALE);
                    const candidateHeight = Math.floor(Math.floor(candidateView.height) * SCALE);
                    if (width !== candidateWidth || height !== candidateHeight) {
                        return { conforme: false, error: 'utiliser la fiche du module 3.2. Fiche Outil de Rédaction comme gabarit' };
                    }
                    if (width < 1 || height < 1 || width * height > MAX_PAGE_PIXELS) {
                        return { conforme: false, error: 'Les dimensions des pages dépassent la limite autorisée.' };
                    }
                    const modelPixels = await renderPage(modelPage, width, height);
                    onProgress(i === 1 ? 30 : 70);
                    const candidatePixels = await renderPage(candidatePage, width, height);
                    onProgress(i === 1 ? 40 : 80);
                    await new Promise(resolve => setTimeout(resolve, 0));
                    differentPixels += pixelmatch(modelPixels, candidatePixels, null, width, height, {
                        threshold: 0.1, includeAA: false
                    });
                    totalPixels += width * height;
                    if (i === 1) onProgress(60);
                } finally {
                    candidatePage.cleanup();
                }
            } finally {
                modelPage.cleanup();
            }
        }

        const score = 100 - differentPixels / totalPixels * 100;
        onProgress(100);
        return {
            conforme: score >= 88,
            score: score.toFixed(2),
            message: score >= 88 ? 'Gabarit officiel validé' : 'Gabarit non conforme ou mauvaise fiche'
        };
    } finally {
        await Promise.all([modelTask.destroy(), candidateTask.destroy()]);
    }
}

export async function validateGabarit(file, auth, token, pdfjs, onProgress = () => {}) {
    if (!file || file.size === 0 || file.size > MAX_FILE_BYTES) {
        throw new Error('Le fichier PDF doit faire 10 Mo maximum.');
    }
    const response = await fetch(auth.url + '/storage/v1/object/authenticated/gabarits/modele_officiel.pdf', {
        headers: { apikey: auth.key, Authorization: 'Bearer ' + token }
    });
    if (!response.ok) throw new Error('Impossible de charger le modèle de référence (HTTP ' + response.status + ').');
    const modelBytes = new Uint8Array(await response.arrayBuffer());
    const candidateBytes = new Uint8Array(await file.arrayBuffer());
    onProgress(10);
    return comparePdf(pdfjs, modelBytes, candidateBytes, onProgress);
}

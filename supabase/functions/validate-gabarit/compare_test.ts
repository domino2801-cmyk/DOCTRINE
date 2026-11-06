import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import { comparePdf } from "./compare.ts";

async function makePdf(options: { pages?: number; width?: number; blackFraction?: number } = {}) {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < (options.pages ?? 2); i++) {
        const width = options.width ?? 595;
        const page = pdf.addPage([width, 842]);
        if (options.blackFraction) {
            page.drawRectangle({
                x: 0,
                y: 0,
                width: width * options.blackFraction,
                height: 842,
                color: rgb(0, 0, 0)
            });
        }
    }
    return await pdf.save();
}

Deno.test("comparePdf validates identical two-page documents", async () => {
    const pdf = await makePdf();
    const result = await comparePdf(pdf, pdf);
    if (!result.conforme || result.score !== "100.00") throw new Error(JSON.stringify(result));
});

Deno.test("comparePdf enforces the 88 percent score threshold", async () => {
    const model = await makePdf();
    const above = await comparePdf(model, await makePdf({ blackFraction: 0.119 }));
    const below = await comparePdf(model, await makePdf({ blackFraction: 0.121 }));
    if (!above.conforme || Number(above.score) < 88) throw new Error(JSON.stringify(above));
    if (below.conforme || Number(below.score) >= 88) throw new Error(JSON.stringify(below));
});

Deno.test("comparePdf rejects wrong page count and dimensions", async () => {
    const model = await makePdf();
    const wrongCount = await comparePdf(model, await makePdf({ pages: 1 }));
    const tooManyPages = await comparePdf(model, await makePdf({ pages: 3 }));
    const wrongSize = await comparePdf(model, await makePdf({ width: 500 }));
    if (wrongCount.conforme || !wrongCount.error?.includes("2 pages")) throw new Error(JSON.stringify(wrongCount));
    if (tooManyPages.conforme || !tooManyPages.error?.includes("Reçu: 3")) throw new Error(JSON.stringify(tooManyPages));
    if (wrongSize.conforme || !wrongSize.error?.includes("dimensions")) throw new Error(JSON.stringify(wrongSize));
});

Deno.test("comparePdf uses PDFium's rounding for fractional page dimensions", async () => {
    const model = await makePdf({ width: 595.1 });
    const candidate = await makePdf({ width: 595.9 });
    const result = await comparePdf(model, candidate);
    if (!result.conforme) throw new Error(JSON.stringify(result));
});

Deno.test("comparePdf rejects oversized pages before rendering", async () => {
    const pdf = await makePdf({ width: 3000 });
    const result = await comparePdf(pdf, pdf);
    if (result.conforme || !result.error?.includes("limite")) throw new Error(JSON.stringify(result));
});

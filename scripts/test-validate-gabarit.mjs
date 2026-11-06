import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { comparePdf, validateGabarit } from '../app/validate-gabarit.mjs';

const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;
after(() => {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
});

globalThis.document = {
    createElement() {
        const canvas = {
            width: 0,
            height: 0,
            getContext() {
                return {
                    getImageData() { return { data: canvas.pixels }; },
                    canvas
                };
            }
        };
        return canvas;
    }
};

function pdfjsFor(model, candidate) {
    const docs = [model, candidate];
    return {
        getDocument() {
            const fixture = docs.shift();
            return {
                promise: Promise.resolve({
                    numPages: fixture.pages ?? 2,
                    getPage: async () => ({
                        getViewport: ({ scale }) => ({ width: (fixture.width ?? 72) * scale, height: 72 * scale }),
                        render: ({ canvasContext }) => {
                            const { canvas } = canvasContext;
                            canvas.pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255);
                            for (let y = 0; y < canvas.height; y++) {
                                for (let x = 0; x < (fixture.blackColumns ?? 0); x++) {
                                    const index = (y * canvas.width + x) * 4;
                                    canvas.pixels[index] = canvas.pixels[index + 1] = canvas.pixels[index + 2] = 0;
                                }
                            }
                            return { promise: Promise.resolve() };
                        },
                        cleanup() {}
                    })
                }),
                destroy: async () => {}
            };
        }
    };
}

test('comparison validates identical pages and exact 88 percent boundary', async () => {
    const compare = (columns) => comparePdf(pdfjsFor({}, { blackColumns: columns }), new Uint8Array(), new Uint8Array());
    assert.deepEqual(await compare(0), { conforme: true, score: '100.00', message: 'Gabarit officiel validé' });
    const boundary = await compare(18);
    assert.equal(boundary.conforme, true);
    assert.equal(boundary.score, '88.00');
    const below = await compare(19);
    assert.equal(below.conforme, false);
    assert.ok(Number(below.score) < 88);
});

test('comparison rejects incorrect page count and dimensions', async () => {
    const count = await comparePdf(pdfjsFor({}, { pages: 1 }), new Uint8Array(), new Uint8Array());
    assert.match(count.error, /Reçu: 1/);
    const dimensions = await comparePdf(pdfjsFor({}, { width: 73 }), new Uint8Array(), new Uint8Array());
    assert.match(dimensions.error, /dimensions/);
});

test('reference download sends authentication and reports failures', async () => {
    const file = new File([new Uint8Array([1])], 'fiche.pdf', { type: 'application/pdf' });
    globalThis.fetch = async (url, options) => {
        assert.equal(url, 'https://example.test/storage/v1/object/authenticated/gabarits/modele_officiel.pdf');
        assert.equal(options.headers.Authorization, 'Bearer token');
        return new Response('error', { status: 403 });
    };
    await assert.rejects(validateGabarit(file, { url: 'https://example.test', key: 'public' }, 'token', {}), /HTTP 403/);
});

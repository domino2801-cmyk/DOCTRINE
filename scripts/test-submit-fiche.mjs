import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const source = (await readFile(new URL('../supabase/functions/doctrine-submit-fiche/index.ts', import.meta.url), 'utf8'))
    .replace(/^import .*;\s*/m, '');

function setup(validation, options = {}) {
    let handler;
    const calls = [];
    const env = {
        SUPABASE_URL: 'https://supabase.example',
        SUPABASE_SERVICE_ROLE_KEY: 'service',
        DOCTRINE_SCAN_VALIDATOR_URL: 'https://validator.example/validate',
        DOCTRINE_SCAN_VALIDATOR_SECRET: 's'.repeat(40),
        RESEND_API_KEY: 'mail',
        ...options,
    };
    const database = {
        auth: { getUser: async () => ({ data: { user: { id: 'user', email: 'user@example.test' } } }) },
        from(table) {
            if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'test' } }) }) }) };
            return { upsert: async () => { calls.push('record'); return { error: null }; } };
        },
    };
    const context = {
        createClient: () => database, Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
        fetch: async (url, init) => {
            if (String(url) === env.DOCTRINE_SCAN_VALIDATOR_URL) {
                calls.push('validate');
                assert.equal(init.redirect, 'error');
                assert.equal(init.headers.Authorization, 'Bearer ' + env.DOCTRINE_SCAN_VALIDATOR_SECRET);
                assert.deepEqual([...init.body], [...new TextEncoder().encode('%PDF test')]);
                if (validation instanceof Error) throw validation;
                return validation;
            }
            calls.push('mail');
            return new Response('{}', { status: 200 });
        },
        Request, Response, FormData, File, URL, AbortSignal, Uint8Array, Object, String, Number, btoa,
        console: { error() {} },
    };
    vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'strip' }), context);
    return { handler, calls };
}

function request(filename = 'fiche.pdf') {
    const form = new FormData();
    form.append('file', new File(['%PDF test'], filename, { type: 'application/pdf' }));
    form.append('dossier', '1');
    return new Request('https://function.example', { method: 'POST', headers: { Authorization: 'Bearer session' }, body: form });
}

test('la validation valide précède le mail et le déverrouillage', async () => {
    const { handler, calls } = setup(Response.json({ valide: true, status: 'SUCCESS' }));
    const response = await handler(request());
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ['validate', 'mail', 'record']);
});

for (const status of ['NOT_A_SCAN', 'INVALID_TEMPLATE', 'PDF_ERROR']) {
    test(`${status} bloque l’envoi et le déverrouillage`, async () => {
        const { handler, calls } = setup(Response.json({ valide: false, status }));
        const response = await handler(request());
        assert.equal(response.status, 422);
        assert.equal((await response.json()).code, status);
        assert.deepEqual(calls, ['validate']);
    });
}

for (const validation of [
    new Error('offline'),
    Response.json({ valide: true, status: 'FAIL' }),
    Response.json({ valide: false, status: 'PROCESSING_ERROR' }),
    new Response('invalid json'),
]) {
    test('une erreur de validation bloque l’envoi', async () => {
        const { handler, calls } = setup(validation);
        const response = await handler(request());
        assert.equal(response.status, 503);
        assert.deepEqual(calls, ['validate']);
    });
}

test('une configuration absente bloque tout envoi', async () => {
    const { handler, calls } = setup(null, { DOCTRINE_SCAN_VALIDATOR_URL: '' });
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.deepEqual(calls, []);
});

test('un fichier DOC est refusé avant validation', async () => {
    const { handler, calls } = setup(null);
    const response = await handler(request('fiche.doc'));
    assert.equal(response.status, 400);
    assert.deepEqual(calls, []);
});

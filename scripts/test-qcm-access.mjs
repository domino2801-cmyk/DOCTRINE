import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const authSource = await readFile(new URL('../auth/auth.js', import.meta.url), 'utf8');
const splashSource = await readFile(new URL('../splash/splash.js', import.meta.url), 'utf8');

function fixture({ confirmed = true, reply = true } = {}) {
    const handlers = new Map();
    const events = [];
    const requests = [];
    const classes = new Set();
    const elements = new Map();
    let now = 1000000;
    let tokenExpiry = now / 1000 + 3600;
    const element = () => ({
        hidden: false, textContent: '', value: '', disabled: false,
        classList: { add() {}, remove() {} },
        addEventListener() {}, setAttribute() {}, focus() {}, remove() {},
        querySelector(selector) {
            if (!elements.has(selector)) elements.set(selector, element());
            return elements.get(selector);
        }
    });
    const gate = element();
    const opener = {
        closed: false,
        postMessage(data, origin) {
            requests.push({ data, origin });
            if (reply && origin === 'https://qcm-major.fr') {
                queueMicrotask(() => dispatch('message', {
                    source: opener, origin,
                    data: { type: 'doctrine-session-response', id: data.id, access_token: 'access', expires_at: tokenExpiry }
                }));
            }
        }
    };
    function dispatch(type, event) {
        for (const callback of [...(handlers.get(type) || [])]) callback(event);
    }
    const window = {
        opener, location: { search: '?from=qcm-major' },
        addEventListener(type, cb) { handlers.set(type, [...(handlers.get(type) || []), cb]); },
        removeEventListener(type, cb) { handlers.set(type, (handlers.get(type) || []).filter(fn => fn !== cb)); },
        matchMedia: () => ({ matches: false })
    };
    const document = {
        readyState: 'complete',
        documentElement: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
        createElement: () => gate,
        body: { appendChild() {} },
        getElementById: () => null,
        querySelectorAll: () => [],
        dispatchEvent: event => events.push(event.type)
    };
    const storage = new Map();
    const fetches = [];
    class Clock extends Date { static now() { return now; } }
    vm.runInNewContext(authSource, {
        window, document, URLSearchParams, Date: Clock, Promise, Number, console, setTimeout, clearTimeout,
        CustomEvent: class { constructor(type) { this.type = type; } },
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        fetch: async (url, options) => {
            fetches.push({ url, options });
            return { ok: true, json: async () => ({ id: 'user', email: 'user@example.test', email_confirmed_at: confirmed ? 'yes' : null }) };
        }
    });
    return {
        window, document, classes, elements, events, requests, fetches, storage, opener, dispatch,
        advance(ms) { now += ms; },
        renewExpiry() { tokenExpiry = now / 1000 + 3600; }
    };
}

async function settle() {
    await new Promise(resolve => setTimeout(resolve, 0));
}

test('accès direct vérifié auprès de Supabase et jeton conservé uniquement en mémoire', async () => {
    const f = fixture();
    await settle();
    assert.equal(f.classes.has('auth-locked'), false);
    assert.deepEqual(f.events, ['doctrine:login']);
    assert.equal(f.window.DoctrineAuth.email(), 'user@example.test');
    assert.equal(f.storage.size, 0);
    assert.equal(f.fetches.length, 1);
    assert.match(f.fetches[0].url, /\/auth\/v1\/user$/);
    assert.equal(f.fetches[0].options.headers.Authorization, 'Bearer access');
    assert.equal(await f.window.DoctrineAuth.jeton(), 'access');
    f.advance(3550000);
    f.renewExpiry();
    assert.equal(await f.window.DoctrineAuth.jeton(), 'access');
    assert.equal(f.fetches.length, 2);
    assert.equal(f.requests.length, 4);
});

test('la perte de l’onglet QCM verrouille l’armoire au renouvellement', async () => {
    const f = fixture();
    await settle();
    f.opener.closed = true;
    f.advance(3550000);
    assert.equal(await f.window.DoctrineAuth.jeton(), null);
    assert.equal(f.classes.has('auth-locked'), true);
    assert.match(f.elements.get('#auth-message').textContent, /Session QCM-MAJOR indisponible/);
    assert.equal(await f.window.DoctrineAuth.jeton(), null);
});

test('un compte non confirmé ne déverrouille pas l’armoire', async () => {
    const f = fixture({ confirmed: false });
    await settle();
    assert.equal(f.classes.has('auth-locked'), true);
    assert.match(f.elements.get('#auth-message').textContent, /Connexion automatique indisponible/);
});

test('les messages non autorisés ne peuvent pas fournir de session', async () => {
    const f = fixture({ reply: false });
    const response = { type: 'doctrine-session-response', id: '1', access_token: 'forged', expires_at: 4600 };
    f.dispatch('message', { source: f.opener, origin: 'https://evil.example', data: response });
    f.dispatch('message', { source: {}, origin: 'https://qcm-major.fr', data: response });
    await settle();
    assert.equal(f.classes.has('auth-locked'), true);
    assert.equal(f.fetches.length, 0);
    f.dispatch('message', {
        source: f.opener, origin: 'https://qcm-major.fr',
        data: { ...response, access_token: 'valid' }
    });
    await settle();
    assert.equal(f.classes.has('auth-locked'), false);
    assert.equal(await f.window.DoctrineAuth.jeton(), 'valid');
});

test('le splash est supprimé pour une ouverture depuis QCM avec opener', () => {
    let removed = false;
    const splash = { remove() { removed = true; } };
    vm.runInNewContext(splashSource, {
        document: { getElementById: () => splash },
        window: { location: { search: '?from=qcm-major' }, opener: {}, matchMedia: () => ({ matches: false }) },
        sessionStorage: { getItem: () => null, removeItem() {} }, URLSearchParams
    });
    assert.equal(removed, true);
});

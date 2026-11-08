import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const authSource = await readFile(new URL('../auth/auth.js', import.meta.url), 'utf8');
const splashSource = await readFile(new URL('../splash/splash.js', import.meta.url), 'utf8');
const splashCss = await readFile(new URL('../splash/splash.css', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../app/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function fixture({ confirmed = true, reply = true, relay = true, loadApp = false, closeWorks = true } = {}) {
    const handlers = new Map();
    const documentHandlers = new Map();
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
    const modals = Array.from({ length: 7 }, (_, index) => ({
        id: 'modal-module' + (index + 1), style: { display: 'none' }, scrollTop: 0,
        querySelectorAll: () => [], querySelector: () => null
    }));
    const buttons = Array.from({ length: 7 }, () => ({
        style: {}, disabled: false, classList: { toggle() {} }, setAttribute() {}, focus() {}
    }));
    const warning = { style: {} };
    let gateHiddenOnAppend;
    const opener = {
        closed: false,
        focused: false,
        focus() { this.focused = true; },
        postMessage(data, origin) {
            requests.push({ data, origin });
            if (reply && origin === 'https://qcm-major.fr' && data.type === 'doctrine-session-request') {
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
        opener: relay ? opener : null,
        closed: false,
        location: { search: relay ? '?from=qcm-major' : '', assign(url) { this.navigated = url; } },
        close() { if (closeWorks) this.closed = true; },
        addEventListener(type, cb) { handlers.set(type, [...(handlers.get(type) || []), cb]); },
        removeEventListener(type, cb) { handlers.set(type, (handlers.get(type) || []).filter(fn => fn !== cb)); },
        matchMedia: () => ({ matches: false })
    };
    const document = {
        readyState: 'complete',
        documentElement: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
        createElement: () => gate,
        body: { appendChild(node) { if (node === gate) gateHiddenOnAppend = node.hidden; } },
        getElementById(id) {
            if (!loadApp) return null;
            if (id === 'lockWarning') return warning;
            const modal = modals.find(item => item.id === id);
            if (modal) return modal;
            const match = id.match(/^btn-mod([1-7])$/);
            return match ? buttons[Number(match[1]) - 1] : null;
        },
        querySelector: () => null,
        querySelectorAll: selector => loadApp && selector === '.modal' ? modals : [],
        addEventListener(type, cb) { documentHandlers.set(type, [...(documentHandlers.get(type) || []), cb]); },
        dispatchEvent(event) {
            events.push(event.type);
            for (const callback of documentHandlers.get(event.type) || []) callback(event);
        }
    };
    const storage = new Map();
    const fetches = [];
    const alerts = [];
    class Clock extends Date { static now() { return now; } }
    const context = vm.createContext({
        window, document, URLSearchParams, Date: Clock, Promise, Number, console, setTimeout, clearTimeout,
        alert: message => alerts.push(message),
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        fetch: async (url, options) => {
            fetches.push({ url, options });
            return { ok: true, json: async () => ({ id: 'user', email: 'user@example.test', email_confirmed_at: confirmed ? 'yes' : null }) };
        }
    });
    vm.runInContext(authSource, context);
    if (loadApp) vm.runInContext(appSource, context);
    return {
        window, document, classes, elements, events, requests, fetches, storage, opener, dispatch, gate,
        modal: modals[0], modals, buttons, warning, context, alerts,
        get gateHiddenOnAppend() { return gateHiddenOnAppend; },
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

test('le retour réutilise uniquement la session QCM vérifiée et son onglet', async () => {
    const f = fixture();
    assert.equal(f.window.DoctrineAuth.retourQcm(), false);
    await settle();
    assert.equal(f.window.DoctrineAuth.retourQcm(), true);
    const messages = f.requests.filter(request => request.data.type === 'doctrine-return-to-qcm');
    assert.equal(messages.length, 2);
    assert.deepEqual(messages.map(message => message.data.user_id), ['user', 'user']);
    assert.equal(messages.some(message => 'access_token' in message.data), false);
    f.dispatch('message', {
        source: f.opener, origin: 'https://qcm-major.fr',
        data: { type: 'doctrine-return-response', id: messages[0].data.id, ok: true }
    });
    assert.equal(f.window.closed, true);
    f.opener.closed = true;
    assert.equal(f.window.DoctrineAuth.retourQcm(), false);
    const ordinary = fixture({ relay: false });
    await settle();
    assert.equal(ordinary.window.DoctrineAuth.retourQcm(), false);
});

test('si la fermeture est bloquée, le retour confirmé ouvre QCM dans l’onglet courant', async () => {
    const f = fixture({ closeWorks: false });
    await settle();
    const timers = [];
    f.context.setTimeout = callback => { timers.push(callback); return timers.length; };
    f.context.clearTimeout = () => {};
    assert.equal(f.window.DoctrineAuth.retourQcm(), true);
    const request = f.requests.find(item => item.data.type === 'doctrine-return-to-qcm');
    f.dispatch('message', {
        source: f.opener, origin: 'https://qcm-major.fr',
        data: { type: 'doctrine-return-response', id: request.data.id, ok: true }
    });
    timers.at(-1)();
    assert.equal(f.window.location.navigated, 'https://qcm-major.fr');
});

test('un refus ou une absence de réponse ouvre QCM dans l’onglet courant', async () => {
    for (const response of ['refus', 'timeout']) {
        const f = fixture();
        await settle();
        const timers = [];
        f.context.setTimeout = callback => { timers.push(callback); return timers.length; };
        f.context.clearTimeout = () => {};
        assert.equal(f.window.DoctrineAuth.retourQcm(), true);
        const request = f.requests.find(item => item.data.type === 'doctrine-return-to-qcm');
        if (response === 'refus') {
            f.dispatch('message', {
                source: f.opener, origin: 'https://qcm-major.fr',
                data: { type: 'doctrine-return-response', id: request.data.id, ok: false }
            });
        } else {
            timers[0]();
        }
        assert.equal(f.window.location.navigated, 'https://qcm-major.fr');
    }
});

test('le lien du module 5 conserve la navigation normale si le retour ne peut être utilisé', () => {
    assert.match(html, /id="qcm-return-link" href="https:\/\/qcm-major\.fr" class="btn-link">/);
    const start = appSource.indexOf('    function setupQcmReturnLink()');
    const end = appSource.indexOf("    document.addEventListener('DOMContentLoaded'", start);
    assert.ok(start >= 0 && end > start);
    let handler;
    let allowed = true;
    const context = vm.createContext({
        document: { addEventListener: (_type, callback) => { handler = callback; } },
        window: { DoctrineAuth: { retourQcm: () => allowed } }
    });
    vm.runInContext(appSource.slice(start, end) + '\nsetupQcmReturnLink();', context);
    let prevented = false;
    const link = { protocol: 'https:', hostname: 'qcm-major.fr', target: '_blank' };
    const event = { button: 0, target: { closest: () => link }, preventDefault() { prevented = true; } };
    handler(event);
    assert.equal(prevented, true);
    prevented = false;
    allowed = false;
    handler(event);
    assert.equal(prevented, false);
    assert.equal(link.target, '_self');
    allowed = true;
    handler({ ...event, ctrlKey: true });
    assert.equal(prevented, false);
    link.hostname = 'example.test';
    handler(event);
    assert.equal(prevented, false);
});

test('un compte non confirmé ne déverrouille pas l’armoire', async () => {
    const f = fixture({ confirmed: false });
    assert.equal(f.gateHiddenOnAppend, true);
    await settle();
    assert.equal(f.classes.has('auth-locked'), true);
    assert.equal(f.gate.hidden, false);
    assert.match(f.elements.get('#auth-message').textContent, /Connexion automatique indisponible/);
});

test('la session QCM vérifiée donne accès aux sept modules sans valider la progression', async () => {
    const f = fixture({ loadApp: true });
    f.storage.set('bm4-last-module', 'module6');
    assert.equal(f.gateHiddenOnAppend, true);
    assert.equal(f.modal.style.display, 'none');
    await settle();
    assert.equal(f.modal.style.display, 'none');
    assert.equal(f.gate.hidden, true);
    assert.equal(f.storage.get('bm4-last-module'), 'module6');
    assert.equal(f.warning.style.display, 'none');
    assert.ok(f.buttons.every(button => !button.disabled));
    assert.equal(f.storage.has('module1_validated'), false);
    for (let i = 1; i <= 7; i++) {
        vm.runInContext(`openModal('module${i}')`, f.context);
        assert.equal(f.modals[i - 1].style.display, 'block');
    }
    vm.runInContext("navigateModule('module4')", f.context);
    assert.equal(f.modals[3].style.display, 'block');
    f.document.dispatchEvent({ type: 'doctrine:logout' });
    assert.equal(f.modals[3].style.display, 'none');
    assert.ok(f.buttons.slice(1).every(button => button.disabled));
    assert.equal(f.warning.style.display, 'block');
    assert.equal(f.storage.has('module1_validated'), false);
    f.document.dispatchEvent({ type: 'doctrine:login', detail: { accesQcm: false } });
    vm.runInContext("openModal('module2')", f.context);
    assert.equal(f.modals[1].style.display, 'none');
    assert.equal(f.alerts.length, 1);
});

test('un échec du relais et une connexion ordinaire ne déclenchent pas l’ouverture du module 1', async () => {
    const failed = fixture({ confirmed: false, loadApp: true });
    await settle();
    assert.equal(failed.modal.style.display, 'none');
    assert.equal(failed.gate.hidden, false);

    const ordinary = fixture({ relay: false, loadApp: true });
    await settle();
    assert.equal(ordinary.gateHiddenOnAppend, false);
    ordinary.document.dispatchEvent({ type: 'doctrine:login', detail: { accesQcm: false } });
    assert.equal(ordinary.modal.style.display, 'none');
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
    assert.match(splashCss, /html\.auth-acces-qcm\s+#splash\s*\{\s*display:\s*none/);
});

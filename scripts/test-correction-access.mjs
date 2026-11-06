import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = await readFile(new URL('../app/app.js', import.meta.url), 'utf8');
const boundary = source.indexOf('    function updateCorrectionDossierOptions()');
if (boundary < 0) throw new Error('Correction access functions not found');

function createFixture() {
    const statuses = new Map([['1', 'todo'], ['2', 'todo']]);
    const rows = ['1', '2'].map(id => ({
        hidden: false,
        querySelector() { return { getAttribute: () => id }; }
    }));
    const list = {
        hidden: false,
        querySelectorAll: () => rows
    };
    const body = { classList: { toggle() {} } };
    const auth = {
        url: 'https://example.test',
        key: 'public',
        jeton: async () => 'token',
        estAdmin: () => false
    };
    let submissions = [];
    const document = {
        querySelector(selector) {
            const match = selector.match(/input\[data-dossier="([^"]+)"\]/);
            if (match) return {
                closest: () => ({
                    querySelector: () => ({ value: statuses.get(match[1]) })
                })
            };
            if (selector === '.mod-body[data-mod="4"]') return body;
            throw new Error(`Unexpected selector: ${selector}`);
        },
        querySelectorAll(selector) {
            if (selector === '#corrigeList .dossier-item input[data-corrige]') {
                return rows.map(row => row.querySelector());
            }
            throw new Error(`Unexpected selector: ${selector}`);
        },
        getElementById(id) { return id === 'corrigeList' ? list : null; }
    };
    const context = vm.createContext({
        document,
        window: { DoctrineAuth: auth },
        fetch: async () => ({ ok: true, json: async () => ({ dossiers: submissions }) })
    });
    vm.runInContext(source.slice(0, boundary) + '\nglobalThis.testAccess = { updateCorrectionAccess, loadTransmittedDossiers };', context);
    return { statuses, rows, list, auth, access: context.testAccess, setSubmissions: values => { submissions = values; } };
}

test('a candidate sees only corrections both completed and transmitted', async () => {
    const fixture = createFixture();
    fixture.statuses.set('1', 'mastered');
    fixture.access.updateCorrectionAccess();
    assert.equal(fixture.list.hidden, true);

    fixture.setSubmissions([2]);
    await fixture.access.loadTransmittedDossiers();
    assert.equal(fixture.list.hidden, true);
    assert.equal(fixture.rows[0].hidden, true);
    assert.equal(fixture.rows[1].hidden, true);

    fixture.setSubmissions([1, 2]);
    await fixture.access.loadTransmittedDossiers();
    assert.equal(fixture.list.hidden, false);
    assert.equal(fixture.rows[0].hidden, false);
    assert.equal(fixture.rows[1].hidden, true);

    fixture.statuses.set('1', 'todo');
    fixture.access.updateCorrectionAccess();
    assert.equal(fixture.rows[0].hidden, true);
    assert.equal(fixture.list.hidden, true);

    fixture.statuses.set('1', 'mastered');
    fixture.access.updateCorrectionAccess();
    assert.equal(fixture.rows[0].hidden, false);
});

test('administrators retain access to all corrections', () => {
    const fixture = createFixture();
    fixture.auth.estAdmin = () => true;
    fixture.access.updateCorrectionAccess();
    assert.equal(fixture.list.hidden, false);
    assert.deepEqual(fixture.rows.map(row => row.hidden), [false, false]);
});

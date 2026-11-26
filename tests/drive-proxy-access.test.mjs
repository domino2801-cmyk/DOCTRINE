import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const proxy = await readFile(new URL('../supabase/functions/drive-proxy/index.ts', import.meta.url), 'utf8');

test('drive-proxy identifie un Officier Guide depuis le rôle sécurisé et la spécialité OG', () => {
    assert.match(proxy, /type Candidat = \{ id: string; admin: boolean; officierGuide: boolean \}/);
    assert.match(proxy, /const role = String\(meta\.role \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
    assert.match(proxy, /role === 'guide' \|\| role === 'officier_guide'/);
    assert.match(proxy, /profiles\?id=eq\.\$\{encodeURIComponent\(u\.id\)\}&select=speciality/);
    assert.match(proxy, /String\(p\.speciality \|\| ''\)\.trim\(\)\.toUpperCase\(\) === 'OG'/);
    assert.match(proxy, /return \{ id: u\.id, admin, officierGuide \}/);
});

test('un Officier Guide peut consulter les corrigés sans soumission préalable', () => {
    assert.match(proxy, /!candidat\.admin && !candidat\.officierGuide && requis !== null/);
    assert.match(proxy, /La règle de transmission préalable ne concerne que les candidats/);
});

test('les contrôles de publication restent obligatoires pour les Officiers Guides', () => {
    assert.match(proxy, /if \(!candidat\.admin\)\s*\{\s*const chemin = await chaineParentsDrive/);
    assert.match(proxy, /const accesBibliotheque = await accesBibliothequePubliee\(chemin, false\)/);
    assert.match(proxy, /if \(accesBibliotheque === false\)/);
});

test('les candidats conservent la restriction de transmission préalable des fiches', () => {
    assert.match(proxy, /const requis = await dossierRequis\(id, fichier\.parents \|\| \[\], jeton\)/);
    assert.match(proxy, /fichesTransmises\(candidat\.id\)/);
    assert.match(proxy, /Transmettez votre fiche du dossier/);
});

test('le proxy refuse par défaut les ressources Drive non enregistrées', () => {
    assert.match(proxy, /async function supportsHistoriquesAutorises\(ids: string\[\]\)/);
    assert.match(proxy, /if \(!supportHistorique && accesBibliotheque !== true && requis === null\)/);
    assert.match(proxy, /Ressource Drive non autorisée/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const proxy = await readFile(new URL('../supabase/functions/drive-proxy/index.ts', import.meta.url), 'utf8');
test('identité Officier Guide sécurisée', () => {
  for (const fragment of ['type Candidat = { id: string; admin: boolean; officierGuide: boolean }',"const role = String(meta.role || '').trim().toLowerCase()","role === 'guide' || role === 'officier_guide'",'profiles?id=eq.','&select=speciality',"String(p.speciality || '').trim().toUpperCase() === 'OG'",'return { id: u.id, admin, officierGuide }']) assert.ok(proxy.includes(fragment), fragment);
});
test('Officier Guide conserve l’accès aux corrigés sans soumission', () => {
  assert.ok(proxy.includes('!candidat.admin && !candidat.officierGuide && requis !== null'));
  assert.ok(proxy.includes('Les corrigés conservent leur contrôle dédié'));
});
test('les chemins parents et publications sont contrôlés pour tous les profils', () => {
  for (const fragment of ['const chemin = await chaineParentsDrive','const accesBibliotheque = await accesBibliothequePubliee(chemin, false)','if (accesBibliotheque === false)','const supportHistorique = await supportsHistoriquesAutorises(chemin)']) assert.ok(proxy.includes(fragment), fragment);
});
test('les candidats conservent le contrôle de transmission préalable', () => {
  for (const fragment of ['const requis = await dossierRequis(id, fichier.parents || [], jeton)','fichesTransmises(candidat.id)','Transmettez votre fiche du dossier']) assert.ok(proxy.includes(fragment), fragment);
});
test('le proxy refuse les ressources Drive non enregistrées', () => {
  assert.ok(proxy.includes('if (!supportHistorique && accesBibliotheque !== true && requis === null)'));
  assert.ok(proxy.includes("return erreur(403, 'Ressource Drive non autorisée')"));
});

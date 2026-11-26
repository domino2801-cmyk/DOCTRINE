import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [proxy, migration, adminUi] = await Promise.all([
  readFile(new URL('../supabase/functions/drive-proxy/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/patches/2026-11-26-drive-resource-allowlist.sql', import.meta.url), 'utf8'),
  readFile(new URL('../admin/drive-resources.js', import.meta.url), 'utf8')
]);

test('les supports historiques sont explicitement déclarés et accessibles aux comptes authentifiés', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.doctrine_drive_resources/);
  assert.match(migration, /USING \(is_active OR public\.doctrine_is_admin\(\)\)/);
  assert.match(migration, /INSERT INTO public\.doctrine_drive_resources/);
  assert.equal((migration.match(/\('[A-Za-z0-9_-]{10,80}', '/g) || []).length, 16);
  assert.match(proxy, /async function supportsHistoriquesAutorises\(ids: string\[\]\)/);
  assert.match(proxy, /doctrine_drive_resources\?drive_folder_id=in\.\(/);
});

test('un identifiant Drive non répertorié est refusé par défaut', () => {
  assert.match(proxy, /if \(!supportHistorique && accesBibliotheque !== true && requis === null\) return erreur\(403, 'Ressource Drive non autorisée'\)/);
  assert.doesNotMatch(proxy, /null = document historique : conserver ses contrôles d'accès existants/);
});

test('la règle de transmission préalable reste limitée aux corrigés des candidats', () => {
  assert.match(proxy, /if \(!candidat\.admin && !candidat\.officierGuide && requis !== null\)/);
  assert.match(proxy, /fichesTransmises\(candidat\.id\)/);
  assert.match(proxy, /Transmettez votre fiche du dossier/);
});

test('l’administration permet d’ajouter et de désactiver un dossier Drive', () => {
  assert.match(adminUi, /Gestion des supports documentaires autorisés/);
  assert.match(adminUi, /drive\.google\.com/);
  assert.match(adminUi, /'POST'/);
  assert.match(adminUi, /'PATCH'/);
  assert.match(adminUi, /function admin\(\)/);
});

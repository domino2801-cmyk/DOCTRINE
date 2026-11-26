import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const [proxy, migration, adminUi, html] = await Promise.all([
 readFile(new URL('../supabase/functions/drive-proxy/index.ts', import.meta.url), 'utf8'),
 readFile(new URL('../supabase/patches/2026-11-26-drive-resource-allowlist.sql', import.meta.url), 'utf8'),
 readFile(new URL('../admin/drive-resources.js', import.meta.url), 'utf8'),
 readFile(new URL('../index.html', import.meta.url), 'utf8')
]);
test('les 16 supports historiques sont explicitement déclarés', () => {
 assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS public.doctrine_drive_resources'));
 assert.ok(migration.includes('USING (is_active OR public.doctrine_is_admin())'));
 assert.ok(migration.includes('INSERT INTO public.doctrine_drive_resources'));
 assert.equal(migration.split("  ('").length - 1, 16);
 assert.ok(proxy.includes('async function supportsHistoriquesAutorises(ids: string[])'));
 assert.ok(proxy.includes('doctrine_drive_resources?drive_folder_id=in.('));
});
test('un identifiant Drive non répertorié est refusé par défaut', () => {
 assert.ok(proxy.includes('if (!supportHistorique && accesBibliotheque !== true && requis === null)'));
 assert.ok(proxy.includes("return erreur(403, 'Ressource Drive non autorisée')"));
 assert.ok(!proxy.includes('null = document historique : conserver ses contrôles d’accès existants'));
});
test('la règle de transmission préalable reste limitée aux corrigés des candidats', () => {
 for (const fragment of ['if (!candidat.admin && !candidat.officierGuide && requis !== null)','fichesTransmises(candidat.id)','Transmettez votre fiche du dossier']) assert.ok(proxy.includes(fragment), fragment);
});
test('l’administration permet d’ajouter, modifier et désactiver un dossier Drive', () => {
 for (const fragment of ['Gestion des supports documentaires autorisés','drive.google.com',"'POST'","'PATCH'",'function admin()','Nouvel intitulé du support']) assert.ok(adminUi.includes(fragment), fragment);
 assert.ok(html.includes('admin/drive-resources.js'));
});

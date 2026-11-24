import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, script, css] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../admin/general-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin/general-admin.css', import.meta.url), 'utf8')
]);

test('l’espace Administrateur général est chargé séparément', () => {
  assert.match(html, /admin\/general-admin\.css/);
  assert.match(html, /admin\/general-admin\.js/);
  assert.match(script, /adminGeneralButton/);
  assert.match(script, /ADMINISTRATEUR GÉNÉRAL/);
  assert.match(script, /estAdmin\(\)/);
});

test('les six rubriques de pilotage sont présentes et repliables', () => {
  for (const label of ['COMPTES', 'QUESTIONS', 'SIGNALEMENTS', 'RETEX', 'SUIVI OFFICIER GUIDE', 'MODIFICATION APPLICATION']) {
    assert.ok(script.includes(label), 'Rubrique manquante : ' + label);
  }
  assert.equal((script.match(/<details class="ag-card"/g) || []).length, 1, 'Les cartes doivent être construites par le composant carte()');
  assert.match(script, /<details class="ag-card"/);
});

test('les signalements, RETEX et alertes réutilisent le gestionnaire existant', () => {
  for (const action of ['candidate-signals', 'guide-signals', 'candidate-retex', 'guide-retex', 'notifications']) {
    assert.ok(script.includes(action), 'Action manquante : ' + action);
  }
  assert.match(script, /doctrine:admin-fiches/);
});

test('les outils transversaux disposent d’une ouverture directe protégée par le rôle admin', async () => {
  const [cohort, course, admin, module2] = await Promise.all([
    readFile(new URL('../admin/cohort-dashboard.js', import.meta.url), 'utf8'),
    readFile(new URL('../admin/course-catalog.js', import.meta.url), 'utf8'),
    readFile(new URL('../admin/admin.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/module2-documents.js', import.meta.url), 'utf8')
  ]);
  assert.match(script, /doctrine:open-cohort-dashboard/);
  assert.match(script, /doctrine:open-document-views/);
  assert.match(script, /doctrine:open-course-catalog/);
  assert.match(script, /doctrine:open-module2-documents-admin/);
  assert.match(cohort, /doctrine:open-cohort-dashboard/);
  assert.match(cohort, /if \(!isAdmin\(\)\) return/);
  assert.match(course, /doctrine:open-course-catalog/);
  assert.match(course, /function openPanel\(\)[\s\S]*?if \(!isAdmin\(\)\) return/);
  assert.match(admin, /doctrine:open-document-views/);
  assert.match(admin, /if \(!auth\(\) \|\| !auth\(\)\.estAdmin\(\)\) return/);
  assert.match(module2, /doctrine:open-module2-documents-admin/);
  assert.match(module2, /if \(!isAdmin\(\)\) return/);
});

test('le bouton reste caché sans rôle administrateur et visible avec ce rôle', () => {
  assert.match(script, /button\.hidden=!estAutorise\(\)/);
  assert.match(css, /#adminGeneralButton\{display:flex/);
  assert.match(css, /#adminGeneralButton\[hidden\]\{display:none\}/);
});

test('l’interface est responsive sans imposer de largeur fixe aux cartes', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /grid-template-columns:1fr/);
  assert.match(css, /min-width:0/);
});

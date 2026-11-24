import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('le parcours documentaire Module 2 est chargé dans les deux interfaces', () => {
    const index = read('index.html');
    const guide = read('app/guide-module8.html');
    assert.match(index, /app\/module2-documents\.js/);
    assert.match(index, /app\/module2-documents\.css/);
    assert.match(guide, /module2-documents\.js/);
    assert.match(guide, /module2-documents\.css/);
});

test('la carte de proposition est placée sous les deux bibliothèques sans afficher les ressources validées', () => {
    const index = read('index.html');
    const guide = read('app/guide-dashboard.js');
    assert.match(index, /app\/guide-dashboard\.js/);
    assert.match(guide, /libraryGrid\.append\(courseSection, exerciseSection\)/);
    assert.match(guide, /libraryGrid\.append\(proposalEntry\)/);
    assert.match(guide, /PROPOSITION DE DOCUMENTS À AJOUTER POUR LES CANDIDATS/);
    assert.match(guide, /Titre du document/);
    assert.match(guide, /Catégorie/);
    assert.match(guide, /Suivi de mes propositions/);
    assert.match(guide, /guide_document_proposals/);
    assert.doesNotMatch(guide, /loadModule2GuideContent|Ressources disponibles pour les candidats|status=eq\.approved/);
    assert.doesNotMatch(guide, /drive_url\s*:/);
});
test('seuls les documents approuvés sont ajoutés à la rubrique 2.1', () => {
    const source = read('app/module2-documents.js');
    assert.match(source, /status=eq\.approved/);
    assert.match(source, /findModule2Anchor/);
    assert.match(source, /list\.after\(extra\)/);
    assert.match(source, /drive\.google\.com/);
    assert.match(source, /docs\.google\.com/);
});

test('les administrateurs peuvent publier directement et traiter les propositions', () => {
    const source = read('app/module2-documents.js');
    assert.match(source, /Ajouter et publier la carte/);
    assert.match(source, /Ajouter le lien et valider/);
    assert.match(source, /Refuser/);
    assert.match(source, /status: 'approved'/);
    assert.match(source, /status: 'rejected'/);
});

test('les cartes dynamiques restent hors du HTML sauvegardé du Module 2', () => {
    const admin = read('admin/admin.js');
    assert.match(admin, /\.adm-ui, \.module2-approved-documents/);
    assert.match(admin, /n === '2'/);
});

test('la migration protège les propositions et masque les propositions non validées', () => {
    const sql = read('supabase/module2-document-proposals.sql');
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /status = 'pending'/i);
    assert.match(sql, /status = 'approved'/i);
    assert.match(sql, /public\.doctrine_is_guide\(\)/i);
    assert.match(sql, /public\.doctrine_is_admin\(\)/i);
    assert.match(sql, /drive_url is not null/i);
});

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

test('la carte de proposition est placée sous la bibliothèque d’exercices sans afficher les ressources validées', () => {
    const index = read('index.html');
    const guide = read('app/guide-dashboard.js');
    const cardStart = guide.indexOf('// Carte de proposition documentaire');
    const cardEnd = guide.indexOf('libraryGrid.append(proposalEntry)', cardStart);
    const card = guide.slice(cardStart, cardEnd);
    assert.ok(cardStart >= 0 && cardEnd > cardStart, 'la carte doit être insérée sous les deux bibliothèques');
    assert.match(index, /app\/guide-dashboard\.js/);
    assert.match(guide, /if \(dashboardMode === 'admin'\) libraryGrid\.append\(courseSection\)/);
    assert.match(guide, /libraryGrid\.append\(exerciseSection\)/);
    assert.doesNotMatch(guide, /libraryGrid\.append\(courseSection, exerciseSection\)/);
    assert.match(guide, /libraryGrid\.append\(proposalEntry\)/);
    assert.match(guide, /PROPOSITION DE DOCUMENTS À AJOUTER POUR LES CANDIDATS/);
    assert.match(guide, /Titre du document/);
    assert.match(guide, /Suivi de mes propositions/);
    assert.match(guide, /guide_document_proposals/);
    const proposalFormStart = card.indexOf("var proposalForm = node('form'");
    const proposalFormEnd = card.indexOf("var ownProposals =", proposalFormStart);
    const proposalForm = card.slice(proposalFormStart, proposalFormEnd);
    assert.ok(proposalFormStart >= 0 && proposalFormEnd > proposalFormStart);
    assert.doesNotMatch(proposalForm, /proposalCategory|proposalDescription|Catégorie|Description \(facultatif\)/);
    assert.match(card, /function loadApprovedModule2Documents\(\)/);
    assert.match(card, /status=eq\.approved/);
    assert.match(guide, /if \(dashboardMode !== 'admin'\) libraryGrid\.append\(proposalEntry\)/);
    assert.doesNotMatch(guide, /function loadAdminDocumentProposals\(\)|function loadAdminApprovedDocuments\(\)/);
});
test('les Officiers Guides peuvent joindre un PDF, TXT ou PPT à leur proposition', () => {
    const guide = read('app/guide-dashboard.js');
    const sql = read('supabase/patches/2026-11-24-guide-document-proposal-attachments.sql');
    const admin = read('app/module2-documents.js');
    assert.match(guide, /accept = '\.pdf,\.txt,\.ppt/);
    assert.match(guide, /pdf: 'application\/pdf'/);
    assert.match(guide, /txt: 'text\/plain'/);
    assert.match(guide, /ppt: 'application\/vnd\.ms-powerpoint'/);
    assert.match(guide, /20 \* 1024 \* 1024/);
    assert.match(guide, /uploaded_file_path/);
    assert.match(sql, /guide-document-proposals/);
    assert.match(sql, /20971520/);
    assert.match(sql, /doctrine_is_guide\(\)/);
    assert.match(sql, /doctrine_is_admin\(\)/);
    assert.match(guide, /proposalFile\.accept = '\.pdf,\.txt,\.ppt/);
    assert.match(guide, /function uploadProposalAttachment\(file\)/);
    assert.match(guide, /storageApi\('object\/sign\/guide-document-proposals/);
    assert.doesNotMatch(admin, /Propositions des Officiers Guides|Télécharger la pièce jointe/);
});

test('seuls les documents approuvés sont ajoutés à la rubrique 2.1', () => {
    const source = read('app/module2-documents.js');
    assert.match(source, /status=eq\.approved/);
    assert.match(source, /findModule2Anchor/);
    assert.match(source, /list\.after\(extra\)/);
    assert.match(source, /drive\.google\.com/);
    assert.match(source, /docs\.google\.com/);
});

test('l’espace Admin conserve la publication directe sans afficher la file de propositions OG', () => {
    const source = read('app/module2-documents.js');
    const adminPanel = source.slice(source.indexOf('function adminPanel()'), source.indexOf('function init()'));
    assert.match(adminPanel, /Ajouter et publier la carte/);
    assert.match(adminPanel, /status: 'approved'/);
    assert.doesNotMatch(adminPanel, /Propositions des Officiers Guides|Aucune proposition en attente|loadProposals/);
    assert.doesNotMatch(source, /function loadProposals\(/);
    assert.match(source, /if \(isAdmin\(\)\) adminPanel\(\)/);
});

test('les documents validés du Module 2.1 restent visibles dans l’espace OG sans file Admin dupliquée', () => {
    const guide = read('app/guide-dashboard.js');
    const admin = read('app/module2-documents.js');
    const adminPanel = admin.slice(admin.indexOf('function adminPanel()'), admin.indexOf('function init()'));
    assert.match(guide, /function loadApprovedModule2Documents\(\)/);
    assert.match(guide, /status=eq\.approved/);
    assert.match(guide, /row\.drive_url/);
    assert.match(guide, /Documents validés et disponibles/);
    assert.match(guide, /if \(dashboardMode !== 'admin'\) libraryGrid\.append\(proposalEntry\)/);
    assert.doesNotMatch(guide, /function loadAdminApprovedDocuments\(\)|Documents déjà validés — Module 2\.1/);
    assert.doesNotMatch(adminPanel, /Propositions des Officiers Guides|Aucune proposition en attente|loadProposals|Session expirée\. Reconnectez-vous\./);
    assert.match(adminPanel, /Ajouter et publier la carte/);
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

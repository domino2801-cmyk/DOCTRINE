import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../app/guide-dashboard.js', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../admin/fiches-admin.js', import.meta.url), 'utf8');
const adminToolbar = readFileSync(new URL('../admin/admin.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/guide-officer-feedback.sql', import.meta.url), 'utf8');

test('les formulaires Officier Guide sont séparés du Module 7', () => {
  assert.match(dashboard, /RETOUR D’EXPÉRIENCE OFFICIER GUIDE/);
  assert.match(dashboard, /SIGNALEMENT OFFICIER GUIDE/);
  assert.match(dashboard, /function openGuideFeedback\(kind\)/);
  assert.doesNotMatch(dashboard, /openModule7Form|selectedGuideModule7Card/);
  assert.match(dashboard, /guide_retex_reports/);
  assert.match(dashboard, /guide_signalements/);
});

test('les historiques Officier Guide sont personnels et affichent les réponses administratives', () => {
  assert.match(dashboard, /Mon historique/);
  assert.match(dashboard, /admin_response/);
  assert.match(dashboard, /order=created_at.desc/);
  assert.match(dashboard, /Réponse administration/);
});

test('l’administration peut consulter et traiter les deux files indépendantes', () => {
  assert.match(admin, /chargerFichesGuide/);
  assert.match(admin, /guide_retex_reports/);
  assert.match(admin, /guide_signalements/);
  assert.match(admin, /admin_response:response\.value\.trim\(\)/);
  assert.match(adminToolbar, /guide-signalements/);
  assert.match(adminToolbar, /guide-retex/);
});

test('les deux tables ont des règles RLS guide et admin distinctes', () => {
  for (const [table, policy] of [['guide_retex_reports', 'guide_retex'], ['guide_signalements', 'guide_signalements']]) {
    assert.ok(migration.includes('create table if not exists public.' + table));
    assert.match(migration, new RegExp(policy + '_insert_own'));
    assert.match(migration, new RegExp(policy + '_read_own'));
    assert.match(migration, new RegExp(policy + '_admin_read'));
    assert.match(migration, new RegExp(policy + '_admin_update'));
  }
  assert.match(migration, /public\.doctrine_is_guide\(\)/);
  assert.match(migration, /public\.doctrine_is_admin\(\)/);
});

#!/usr/bin/env node
/**
 * Captures non-destructive screenshots of the Officier Guide user journeys.
 *
 * First run (interactive login):
 *   npm run screenshots:officier-guide -- --headed
 *
 * Later runs (reuses .playwright/officier-guide-auth.json):
 *   npm run screenshots:officier-guide
 *
 * Optional:
 *   DOCTRINE_BASE_URL=https://qcm-major.fr
 *   DOCTRINE_STORAGE_STATE=C:/secure/officier-guide-state.json
 */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const BASE_URL = (process.env.DOCTRINE_BASE_URL || 'https://qcm-major.fr').replace(/\/$/, '');
const AUTH_FILE = process.env.DOCTRINE_STORAGE_STATE ||
  path.join(ROOT, '.playwright', 'officier-guide-auth.json');
const OUTPUT_DIR = path.join(ROOT, 'artifacts', 'officier-guide');
const HEADLESS = !process.argv.includes('--headed');
const LOGIN_TIMEOUT = 5 * 60 * 1000;

await mkdir(OUTPUT_DIR, { recursive: true });
await mkdir(path.dirname(AUTH_FILE), { recursive: true });

const browser = await chromium.launch({ headless: HEADLESS });
let context;
try {
  const contextOptions = { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 };
  if (existsSync(AUTH_FILE)) contextOptions.storageState = AUTH_FILE;
  else if (HEADLESS) {
    throw new Error(
      'Aucune session enregistrée. Lancez une première fois avec --headed, connectez-vous avec un compte Officier Guide, puis relancez le script.'
    );
  }

  context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => console.warn('[console pageerror]', error.message));

  const counter = { saved: 0, skipped: 0 };
  const safeName = value => value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  async function shot(name, locator = null) {
    const target = locator || page;
    try {
      if (locator) await locator.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(700);
      const file = path.join(OUTPUT_DIR, String(++counter.saved).padStart(2, '0') + '-' + safeName(name) + '.png');
      if (locator) {
        await locator.screenshot({ path: file, animations: 'disabled' });
      } else {
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
      }
      console.log('CAPTURE', path.relative(ROOT, file));
      return true;
    } catch (error) {
      counter.skipped++;
      console.warn('IGNORÉ', name, '-', error.message.split('\n')[0]);
      return false;
    }
  }

  async function clickFirst(locator) {
    try {
      const first = locator.first();
      if (await first.isVisible()) {
        await first.click();
        await page.waitForTimeout(900);
        return true;
      }
    } catch (_) {}
    return false;
  }

  async function clickText(text, scope = page) {
    return clickFirst(scope.getByText(text, { exact: true }));
  }

  async function closeDialog() {
    const close = page.getByRole('button', { name: /^(Fermer|Retour|×)$/ }).last();
    if (await close.isVisible().catch(() => false)) {
      await close.click().catch(() => {});
      await page.waitForTimeout(300);
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  console.log('Ouverture de', BASE_URL);
  await page.goto(BASE_URL + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  const guideEntry = page.getByRole('button', { name: /Espace Officier Guide/i }).first();
  if (!existsSync(AUTH_FILE)) {
    console.log('\nConnectez-vous dans le navigateur avec le compte Officier Guide.');
    console.log('Le script démarre les captures dès que l’entrée « Espace Officier Guide » est accessible.\n');
  }
  await guideEntry.waitFor({ state: 'visible', timeout: LOGIN_TIMEOUT });
  await context.storageState({ path: AUTH_FILE });
  console.log('Session enregistrée localement dans', path.relative(ROOT, AUTH_FILE));

  await guideEntry.click();
  await page.locator('#guideDashboard').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1800);
  await shot('01-espace-officier-guide-accueil');

  // Bibliothèque des supports pédagogiques.
  const courseToggle = page.getByRole('button', { name: /BIBLIOTHÈQUE DES SUPPORTS OFFICIER GUIDE/i });
  if (await clickFirst(courseToggle)) {
    await shot('bibliotheque-supports-officier-guide');
    const groups = page.locator('#guideDashboard .og-dashboard-course-group > summary');
    const groupCount = await groups.count();
    for (let i = 0; i < Math.min(groupCount, 12); i++) {
      await groups.nth(i).click().catch(() => {});
      await shot('supports-categorie-' + (i + 1));
      await groups.nth(i).click().catch(() => {});
    }
    await courseToggle.click().catch(() => {});
  }

  // Bibliothèque des exercices et corrections : capture du catalogue et de chaque niveau.
  const exerciseToggle = page.getByRole('button', { name: /BIBLIOTHÈQUE DES DOSSIERS D’EXERCICES ET CORRECTIONS/i });
  if (await clickFirst(exerciseToggle)) {
    await shot('bibliotheque-exercices-et-corrections');
    const levels = page.locator('#guideDashboard .og-dashboard-exercise-library details > summary');
    const levelCount = await levels.count();
    for (let i = 0; i < Math.min(levelCount, 8); i++) {
      await levels.nth(i).click().catch(() => {});
      await shot('exercices-corrections-niveau-' + (i + 1));
      await levels.nth(i).click().catch(() => {});
    }
    await exerciseToggle.click().catch(() => {});
  }

  // Proposition documentaire : formulaire et historique, sans envoi.
  const proposalToggle = page.getByRole('button', { name: /PROPOSITION DE DOCUMENTS À AJOUTER POUR LES CANDIDATS/i });
  if (await clickFirst(proposalToggle)) {
    await shot('proposer-un-document-aux-candidats');
    await proposalToggle.click().catch(() => {});
  }

  // Rattachement d'un candidat : ouverture uniquement, aucun code n'est saisi.
  const assignCard = page.locator('#guideDashboard [data-guide-action]').filter({ hasText: /RATTACHER UN CANDIDAT/i });
  if (await clickFirst(assignCard)) {
    await shot('rattacher-un-candidat');
    await closeDialog();
  } else if (await clickText('RATTACHER UN CANDIDAT')) {
    await shot('rattacher-un-candidat');
    await closeDialog();
  }

  // Liste des candidats et fiche individuelle (aucune donnée modifiée).
  const candidatesCard = page.locator('#guideDashboard [data-guide-action="candidates-tracking"]');
  if (await clickFirst(candidatesCard)) {
    const candidateDialog = page.locator('dialog.og-candidate-list-dialog');
    await shot('cohorte-liste-des-candidats', candidateDialog);
    const candidateName = candidateDialog.locator('.og-candidate-stepper-name');
    await shot('cohorte-fiche-du-premier-candidat', candidateDialog);
    const next = candidateDialog.getByRole('button', { name: 'Candidat suivant' });
    if (await next.isVisible().catch(() => false) && await next.isEnabled().catch(() => false)) {
      await next.click();
      await shot('cohorte-fiche-candidat-suivant', candidateDialog);
    }
    await candidateName.count();
    await closeDialog();
  }

  // Suivi QCM-MAJOR : vue cohorte, puis fiche d'un candidat si disponible.
  const qcmCard = page.locator('#guideDashboard [data-guide-action="qcm-major-tracking"]');
  if (await clickFirst(qcmCard)) {
    const qcmDialog = page.locator('dialog.og-qcm-tracking-dialog').last();
    await shot('suivi-qcm-major-cohorte', qcmDialog);
    const qcmCandidate = qcmDialog.locator('.og-qcm-candidate-button');
    if (await qcmCandidate.count()) {
      await qcmCandidate.first().click();
      await shot('suivi-qcm-major-fiche-candidat', qcmDialog);
      const history = qcmDialog.getByText('Historique complet des résultats enregistrés', { exact: true });
      if (await history.isVisible().catch(() => false)) {
        await history.click().catch(() => {});
        await shot('suivi-qcm-major-historique-detaille', qcmDialog);
      }
    }
    await closeDialog();
  }

  // RETEX et signalement : formulaire + historique. Ne jamais transmettre.
  for (const [kind, title] of [
    ['retex', 'RETOUR D’EXPÉRIENCE OFFICIER GUIDE'],
    ['signalement', 'SIGNALEMENT OFFICIER GUIDE']
  ]) {
    const card = page.locator('#guideDashboard [data-guide-feedback="' + kind + '"]');
    if (await clickFirst(card)) {
      const dialog = page.locator('dialog.og-dashboard-feedback-dialog').last();
      await shot(kind + '-formulaire', dialog);
      const history = dialog.getByRole('button', { name: /Mon historique/i });
      if (await clickFirst(history)) await shot(kind + '-mon-historique', dialog);
      await closeDialog();
    } else {
      console.warn('Carte non trouvée :', title);
    }
  }

  await shot('espace-guide-apres-parcours');

  // Page Module 8 : cohorte, vue candidat, onglets QCM et admission.
  const moduleUrl = BASE_URL + '/app/guide-module8.html';
  await page.goto(moduleUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const guideApp = page.locator('#guideModule8App');
  try {
    await guideApp.waitFor({ state: 'visible', timeout: 12000 });
    await shot('module-8-synthese-cohorte');
    const candidateSelect = page.locator('#guideCandidateFilter');
    const candidateOptions = await candidateSelect.locator('option').evaluateAll(options =>
      options.map(option => ({ value: option.value, label: option.textContent.trim() }))
        .filter(option => option.value)
    );
    if (candidateOptions.length) {
      await candidateSelect.selectOption(candidateOptions[0].value);
      await page.waitForTimeout(1000);
      await shot('module-8-cohorte-filtre-candidat');
      await shot('module-8-dossier-candidat-vue-complete');
      for (const [id, name] of [
        ['guideTabQcm', 'module-8-historique-qcm-par-theme'],
        ['guideTabAdmission', 'module-8-journal-oral-et-sport'],
        ['guideTabComplete', 'module-8-vue-complete-productions']
      ]) {
        const tab = page.locator('#' + id);
        if (await tab.isVisible().catch(() => false)) {
          await tab.click();
          await shot(name);
        }
      }

      // Ouvre l'outil d'évaluation si une fiche est disponible, sans lancer l'IA ni valider.
      await page.locator('#guideTabComplete').click().catch(() => {});
      const reviewButton = page.getByRole('button', { name: /Évaluer avec la grille BM4|Ouvrir la grille d’évaluation/i }).first();
      if (await clickFirst(reviewButton)) {
        const reviewDialog = page.locator('#guideReviewDialog');
        await shot('module-8-grille-evaluation-fiche', reviewDialog);
        await closeDialog();
      }
    } else {
      console.warn('Aucun candidat disponible dans le filtre Module 8 : vues de détail ignorées.');
    }
  } catch (error) {
    console.warn('Module 8 non capturé :', error.message.split('\n')[0]);
    await shot('module-8-etat-acces');
  }

  // Variante mobile du tableau de bord d'entrée pour vérifier le responsive.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const mobileEntry = page.getByRole('button', { name: /Espace Officier Guide/i }).first();
  if (await mobileEntry.isVisible().catch(() => false)) {
    await mobileEntry.click();
    await page.locator('#guideDashboard').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await shot('mobile-espace-officier-guide');
  }

  console.log('\nTerminé :', counter.saved, 'capture(s),', counter.skipped, 'étape(s) ignorée(s).');
  console.log('Dossier :', path.relative(ROOT, OUTPUT_DIR));
  console.log('Les captures reflètent les données réellement accessibles au compte connecté.');
} finally {
  if (context) await context.close();
  await browser.close();
}

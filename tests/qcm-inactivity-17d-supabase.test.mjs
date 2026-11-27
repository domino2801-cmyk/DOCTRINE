import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/tests/verify-qcm-inactivity-17d.sql', import.meta.url), 'utf8');
const cohort = await readFile(new URL('../admin/cohort-dashboard.js', import.meta.url), 'utf8');
const guide = await readFile(new URL('../app/guide-dashboard.js', import.meta.url), 'utf8');

test('le contrôle Supabase cible uniquement le compte test et reste strictement en lecture seule', () => {
    assert.match(sql, /test@yopmail\.fr/);
    assert.match(sql, /from auth\.users/i);
    assert.match(sql, /from public\.qcm_inactivity_emails/i);
    assert.match(sql, /order by q\.user_id, q\.activity_at desc/i);
    assert.doesNotMatch(sql, /\b(insert|update|delete|truncate)\s+(into\s+)?(public\.)?qcm_inactivity_emails\b/i);
});

test('le pseudo ne devient rouge que si le dernier rappel est envoyé depuis au moins 17 jours sans reprise', () => {
    assert.match(cohort, /reminder\.status === 'sent'/);
    assert.match(cohort, /reminder\.sent_at/);
    assert.match(cohort, /last <= activity/);
    assert.match(cohort, /Date\.now\(\) - activity >= 17 \* 86400000/);
    assert.match(cohort, /anc-cohort-name-inactive-17d/);
    assert.match(guide, /lastActivityTimestamp <= notificationActivityTimestamp/);
    assert.match(guide, /dashboardMode === 'admin' && inactiveFor17Days/);
    assert.match(guide, /pseudoNode\.classList\.add\('is-inactive-17-days'\)/);
});

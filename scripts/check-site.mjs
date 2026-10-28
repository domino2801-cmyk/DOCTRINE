import { statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries
        .filter(entry => entry.name !== '.git' && entry.name !== 'node_modules')
        .map(async entry => {
            const entryPath = path.join(directory, entry.name);
            return entry.isDirectory() ? walk(entryPath) : [entryPath];
        }));
    return nested.flat();
}

function checkLocalReference(reference, sourcePath) {
    if (!reference || reference.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) {
        return;
    }

    let targetPath;
    try {
        const targetUrl = new URL(reference, pathToFileURL(sourcePath));
        if (targetUrl.protocol !== 'file:') return;
        targetPath = fileURLToPath(targetUrl);
    } catch {
        errors.push(`${path.relative(root, sourcePath)}: invalid local URL "${reference}"`);
        return;
    }

    if (!targetPath.startsWith(`${root}${path.sep}`) && targetPath !== root) {
        errors.push(`${path.relative(root, sourcePath)}: URL escapes the site root ("${reference}")`);
        return;
    }

    try {
        if (!statSync(targetPath).isFile()) {
            errors.push(`${path.relative(root, sourcePath)}: local resource is not a file ("${reference}")`);
        }
    } catch {
        errors.push(`${path.relative(root, sourcePath)}: missing local resource "${reference}"`);
    }
}

const files = await walk(root);
const javascriptFiles = files.filter(file => file.endsWith('.js'));

for (const file of javascriptFiles) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
        errors.push(`${path.relative(root, file)}: ${result.stderr.trim() || result.stdout.trim()}`);
    }
}

for (const htmlPath of files.filter(file => file.endsWith('.html'))) {
    const html = await readFile(htmlPath, 'utf8');
    const references = /\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi;
    for (const match of html.matchAll(references)) {
        checkLocalReference(match[2], htmlPath);
    }

    const inlineScripts = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi;
    for (const match of html.matchAll(inlineScripts)) {
        try {
            new vm.Script(match[1], { filename: path.relative(root, htmlPath) });
        } catch (error) {
            errors.push(`${path.relative(root, htmlPath)}: ${error.message}`);
        }
    }
}

for (const cssPath of files.filter(file => file.endsWith('.css'))) {
    const css = await readFile(cssPath, 'utf8');
    const references = /url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/gi;
    for (const match of css.matchAll(references)) {
        checkLocalReference((match[2] ?? match[3]).trim(), cssPath);
    }
}

const manifestPath = path.join(root, 'manifest.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const icon of manifest.icons ?? []) {
    checkLocalReference(icon.src, manifestPath);
}

const serviceWorkerPath = path.join(root, 'sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
for (const match of serviceWorker.matchAll(/new URL\(['"](\.[^'"]+)['"]/g)) {
    checkLocalReference(match[1], serviceWorkerPath);
}

const consultationsSql = await readFile(path.join(root, 'supabase/documentation-consultations.sql'), 'utf8');
for (const requiredSql of [
    'doctrine_document_views_retention',
    "'17 3 * * *'",
    "interval '12 months'"
]) {
    if (!consultationsSql.includes(requiredSql)) {
        errors.push(`supabase/documentation-consultations.sql: missing retention setting ${requiredSql}`);
    }
}

if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
} else {
    console.log(`Site checks passed: ${javascriptFiles.length} JavaScript files, HTML/CSS assets, PWA references, and retention settings.`);
}

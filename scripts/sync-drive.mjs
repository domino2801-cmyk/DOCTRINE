import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SUPABASE_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const MIGRATION = new URL('../QCM-MAJOR/supabase/migrations/20261028230000_create_drive_documents.sql', import.meta.url);
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_CONTENT = 500_000;
const BATCH_SIZE = 25;

for (const [name, value] of Object.entries({ DRIVE_ROOT_FOLDER_ID: ROOT_FOLDER_ID, SUPABASE_PROJECT_REF: PROJECT_REF, SUPABASE_ACCESS_TOKEN: SUPABASE_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT })) {
  if (!value) throw new Error(`Variable manquante : ${name}`);
}

const b64url = (input) => Buffer.from(input).toString('base64url');

async function getGoogleToken() {
  const key = JSON.parse(SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`Jeton Google refusé (${res.status}) : ${await res.text()}`);
  return (await res.json()).access_token;
}

const googleToken = await getGoogleToken();
const drive = (url) => fetch(url, { headers: { Authorization: `Bearer ${googleToken}` } });

async function listChildren(folderId) {
  const files = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await drive(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (!res.ok) throw new Error(`Liste Drive en échec (${res.status}) : ${await res.text()}`);
    const data = await res.json();
    files.push(...data.files);
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return files;
}

async function readContent(file) {
  let url;
  if (file.mimeType === 'application/vnd.google-apps.document') {
    url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
  } else if (file.mimeType.startsWith('text/') || file.mimeType === 'application/json') {
    url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`;
  } else {
    return null;
  }
  const res = await drive(url);
  if (!res.ok) {
    console.warn(`Contenu illisible : ${file.name} (${res.status})`);
    return null;
  }
  // PostgreSQL refuse les caractères NUL
  return (await res.text()).replaceAll('\u0000', '').slice(0, MAX_CONTENT);
}

async function crawl(folderId, path, out) {
  for (const file of await listChildren(folderId)) {
    if (file.mimeType === FOLDER_MIME) {
      await crawl(file.id, `${path}${file.name}/`, out);
    } else {
      out.push({
        drive_id: file.id,
        name: file.name,
        mime_type: file.mimeType,
        path,
        parent_id: folderId,
        modified_time: file.modifiedTime,
        content: await readContent(file),
      });
    }
  }
  return out;
}

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Requête Supabase en échec (${res.status}) : ${await res.text()}`);
}

const dollarQuote = (text) => {
  let tag = 'drv';
  while (text.includes(`$${tag}$`)) tag += 'x';
  return `$${tag}$${text}$${tag}$`;
};

const documents = await crawl(ROOT_FOLDER_ID, '', []);
console.log(`${documents.length} document(s) trouvé(s) dans Drive.`);

await runSql(await readFile(MIGRATION, 'utf8'));

for (let i = 0; i < documents.length; i += BATCH_SIZE) {
  const batch = JSON.stringify(documents.slice(i, i + BATCH_SIZE));
  await runSql(`
    insert into public.drive_documents (drive_id, name, mime_type, path, parent_id, modified_time, content, synced_at)
    select drive_id, name, mime_type, path, parent_id, modified_time, content, now()
    from jsonb_to_recordset(${dollarQuote(batch)}::jsonb)
      as d(drive_id text, name text, mime_type text, path text, parent_id text, modified_time timestamptz, content text)
    on conflict (drive_id) do update set
      name = excluded.name, mime_type = excluded.mime_type, path = excluded.path, parent_id = excluded.parent_id,
      modified_time = excluded.modified_time, content = excluded.content, synced_at = excluded.synced_at;
  `);
}

// Retire les documents supprimés ou déplacés hors du dossier racine
await runSql(`
  delete from public.drive_documents
  where drive_id not in (select jsonb_array_elements_text(${dollarQuote(JSON.stringify(documents.map((d) => d.drive_id)))}::jsonb));
`);
console.log('Synchronisation terminée.');

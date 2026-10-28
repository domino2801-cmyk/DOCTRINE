// DOCTRINE : proxy Google Drive. Vérifie la session Supabase du candidat, lit le fichier
// avec un compte de service (Drive privé) et le renvoie à l'application.
// Secret requis : GOOGLE_SERVICE_ACCOUNT_JSON (clé JSON complète du compte de service).
// GET ?action=file&id=ID   -> contenu du fichier (Google Docs/Sheets/Slides exportés en PDF)
// GET ?action=list&id=ID   -> JSON { files: [{ id, name, mimeType }] } d'un dossier

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Doctrine-Proxy, X-File-Name, Content-Type',
};
const DRIVE = 'https://www.googleapis.com/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
let jetonGoogle: { valeur: string; expire: number } | null = null;

function reponse(corps: BodyInit | null, status: number, extra: Record<string, string> = {}) {
  return new Response(corps, {
    status,
    headers: { ...CORS, 'X-Doctrine-Proxy': '1', 'Cache-Control': 'private, no-store', ...extra },
  });
}

function erreur(status: number, message: string) {
  return reponse(JSON.stringify({ error: message }), status, { 'Content-Type': 'application/json' });
}

function b64url(donnees: string | Uint8Array) {
  const octets = typeof donnees === 'string' ? new TextEncoder().encode(donnees) : donnees;
  let s = '';
  octets.forEach((o) => { s += String.fromCharCode(o); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function candidatValide(jeton: string) {
  const url = Deno.env.get('SUPABASE_URL');
  const cle = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !cle || !jeton) return false;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: cle, Authorization: `Bearer ${jeton}` } });
  if (!r.ok) return false;
  const u = await r.json();
  return !!(u && u.id && (u.email_confirmed_at || u.confirmed_at));
}

async function jetonDrive() {
  if (jetonGoogle && jetonGoogle.expire > Date.now() + 60_000) return jetonGoogle.valeur;
  const sa = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') || '{}');
  if (!sa.client_email || !sa.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON manquant ou invalide');
  const now = Math.floor(Date.now() / 1000);
  const aSigner = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))}`;
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cle = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, new TextEncoder().encode(aSigner)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${aSigner}.${b64url(signature)}`,
    }),
  });
  if (!r.ok) throw new Error('Authentification Google refusée');
  const d = await r.json();
  jetonGoogle = { valeur: d.access_token, expire: Date.now() + (d.expires_in || 3600) * 1000 };
  return jetonGoogle.valeur;
}

async function drive(chemin: string, jeton: string) {
  return await fetch(`${DRIVE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reponse(null, 204);
  if (req.method !== 'GET') return erreur(405, 'Méthode non autorisée');

  const jetonCandidat = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!(await candidatValide(jetonCandidat))) return erreur(401, 'Connexion requise');

  const params = new URL(req.url).searchParams;
  const id = params.get('id') || '';
  const action = params.get('action') || 'file';
  if (!/^[\w-]{10,80}$/.test(id) || (action !== 'file' && action !== 'list')) return erreur(400, 'Requête invalide');

  try {
    const jeton = await jetonDrive();
    const meta = await drive(`/files/${id}?fields=id,name,mimeType&supportsAllDrives=true`, jeton);
    if (meta.status === 404 || meta.status === 403) return erreur(404, 'Document introuvable');
    if (!meta.ok) return erreur(502, 'Erreur Google Drive');
    const fichier = await meta.json();

    if (action === 'list') {
      if (fichier.mimeType !== FOLDER) return erreur(400, 'Ce n\'est pas un dossier');
      const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
      const liste = await drive(
        `/files?q=${q}&fields=files(id,name,mimeType)&orderBy=folder,name&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        jeton,
      );
      if (!liste.ok) return erreur(502, 'Erreur Google Drive');
      const d = await liste.json();
      return reponse(JSON.stringify({ name: fichier.name, files: d.files || [] }), 200, { 'Content-Type': 'application/json' });
    }

    if (fichier.mimeType === FOLDER) return erreur(400, 'Ce document est un dossier');
    const natif = String(fichier.mimeType).startsWith('application/vnd.google-apps.');
    const contenu = await drive(
      natif ? `/files/${id}/export?mimeType=application%2Fpdf` : `/files/${id}?alt=media&supportsAllDrives=true`,
      jeton,
    );
    if (!contenu.ok || !contenu.body) return erreur(502, 'Lecture du document impossible');
    const nom = natif ? `${fichier.name}.pdf` : fichier.name;
    return reponse(contenu.body, 200, {
      'Content-Type': natif ? 'application/pdf' : (fichier.mimeType || 'application/octet-stream'),
      'X-File-Name': encodeURIComponent(nom),
      'X-Content-Type-Options': 'nosniff',
    });
  } catch (e) {
    console.error(e);
    return erreur(500, 'Erreur du proxy');
  }
});

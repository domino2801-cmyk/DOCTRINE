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

// Dossiers Drive des corrigés (module 4) -> numéro du dossier à avoir transmis.
const CORRIGES: Record<string, number> = {
  '1qVSqztGmalVB2-dLgHwa2x0pOtW4ZjuE': 1,
  '12G0BtVz5PA0qGhL6xPFJjpKSZw5-jTgG': 2,
  '12fz3jUIgvYDV89GdQDG7QBAhHSF510Dp': 3,
  '11IOmzhi7ksqTLOqNKtfLG4j-qH3CcHn6': 4,
  '1BoVpi3Ke4I1d0hBz6vL7rjh6sxy4fvvD': 5,
  '1Ss-0YwPBDZsN9rmitZRVkprUh75jqsAK': 6,
  '1iZudP3gqUMFzGOkxLThgrVxgj21udSlE': 7,
  '1_MAX1scMW8CTk-d2knB6dSOCSlggZOgM': 8,
  '1AH8-e-vwolrrjUCG1Gn183YjeY-HyKQy': 9,
  '1UYK0aho1K7z2wOXmqUXF2TPvj6TInvFM': 10,
  '1H9402lu3QuepL6KbC2yAMkJcL8-syh9G': 11,
  '1QZx00qTM5qfAYu9r7ocxqmZ0B0G1qBaY': 12,
  '1GzEw2urNP5JOgL7HclorpVBmhj5MVhPS': 13,
  '1jZ9GYoiqI60tq8ysbwcVXFVbY-TzDvv8': 14,
  '136f9XIU1BRSEOFmTqsbpPX3U_toLA0dm': 15,
  '1JkJHooL7jbmHRf9a3l3gwrZw-BeP83zV': 16,
};
const MAX_PROFONDEUR = 8;

type Candidat = { id: string; admin: boolean; officierGuide: boolean };

async function candidatValide(jeton: string): Promise<Candidat | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const cle = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !cle || !jeton) return null;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: cle, Authorization: `Bearer ${jeton}` } });
  if (!r.ok) return null;
  const u = await r.json();
  if (!(u && u.id && (u.email_confirmed_at || u.confirmed_at))) return null;
  const meta = u.app_metadata || {};
  const role = String(meta.role || '').trim().toLowerCase();
  const admin = role === 'admin' || meta.bm4_admin === true || meta.bm4_admin === 'true' || meta.bm4_admin === '1';

  // Même règle que doctrine_is_guide() : rôle sécurisé + spécialité profiles.speciality = OG.
  // La lecture utilise la clé service_role pour ne pas dépendre des politiques RLS du profil.
  let officierGuide = false;
  if (!admin && (role === 'guide' || role === 'officier_guide')) {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (serviceKey) {
      try {
        const profil = await fetch(
          `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(u.id)}&select=speciality`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
        );
        if (profil.ok) {
          const profils: { speciality?: string | null }[] = await profil.json();
          officierGuide = profils.some((p) => String(p.speciality || '').trim().toUpperCase() === 'OG');
        }
      } catch (e) {
        console.error('Vérification de la spécialité Officier Guide impossible', e);
      }
    }
  }
  return { id: u.id, admin, officierGuide };
}

async function fichesTransmises(candidatId: string): Promise<Set<number>> {
  const url = Deno.env.get('SUPABASE_URL');
  const cle = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cle) throw new Error('Configuration Supabase manquante');
  const r = await fetch(
    `${url}/rest/v1/doctrine_fiche_submissions?user_id=eq.${encodeURIComponent(candidatId)}&submission_type=eq.proposition&select=dossier`,
    { headers: { apikey: cle, Authorization: `Bearer ${cle}` } },
  );
  if (!r.ok) throw new Error('Lecture des fiches transmises impossible');
  const lignes: { dossier: number }[] = await r.json();
  return new Set(lignes.map((l) => l.dossier));
}

// Numéro de dossier exigé si l'élément est (ou se trouve dans) un dossier de corrigés.
async function dossierRequis(id: string, parents: string[], jeton: string): Promise<number | null> {
  if (CORRIGES[id]) return CORRIGES[id];
  let courants = parents;
  for (let niveau = 0; niveau < MAX_PROFONDEUR && courants.length; niveau++) {
    const suivants: string[] = [];
    for (const parent of courants) {
      if (CORRIGES[parent]) return CORRIGES[parent];
      const r = await drive(`/files/${parent}?fields=parents&supportsAllDrives=true`, jeton);
      if (!r.ok) throw new Error('Lecture des dossiers parents impossible');
      suivants.push(...((await r.json()).parents || []));
    }
    courants = suivants;
  }
  return null;
}

async function chaineParentsDrive(id: string, parents: string[], jeton: string): Promise<string[]> {
  const trouves = new Set<string>([id]);
  let courants = parents;
  for (let niveau = 0; niveau < MAX_PROFONDEUR && courants.length; niveau++) {
    const suivants: string[] = [];
    for (const parent of courants) {
      if (trouves.has(parent)) continue;
      trouves.add(parent);
      const r = await drive(`/files/${parent}?fields=parents&supportsAllDrives=true`, jeton);
      if (!r.ok) throw new Error('Lecture des dossiers parents impossible');
      suivants.push(...((await r.json()).parents || []));
    }
    courants = suivants;
  }
  return [...trouves];
}

// Les dossiers de la nouvelle bibliothèque suivent la publication Supabase,
// y compris lorsque l'utilisateur demande directement un sous-dossier ou un fichier.
async function accesBibliothequePubliee(ids: string[], admin: boolean): Promise<boolean | null> {
  if (admin) return true;
  const url = Deno.env.get('SUPABASE_URL');
  const cle = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cle) throw new Error('Configuration Supabase manquante');
  const headers = { apikey: cle, Authorization: `Bearer ${cle}` };
  for (const id of ids) {
    const driveIdFilter = encodeURIComponent(`*${id}*`);
    const ex = await fetch(`${url}/rest/v1/guide_exercise_library?drive_url=like.${driveIdFilter}&select=id,is_published`, { headers });
    if (!ex.ok) throw new Error('Vérification de publication des exercices impossible');
    const exercices: { id: string; is_published: boolean }[] = await ex.json();
    if (exercices.length) return exercices.some((e) => e.is_published);

    const co = await fetch(`${url}/rest/v1/guide_correction_library?drive_url=like.${driveIdFilter}&select=id,exercise_id,is_published`, { headers });
    if (!co.ok) throw new Error('Vérification de publication des corrections impossible');
    const corrections: { id: string; exercise_id: string; is_published: boolean }[] = await co.json();
    if (corrections.length) {
      if (!corrections.some((c) => c.is_published)) return false;
      const exerciseIds = [...new Set(corrections.map((c) => c.exercise_id))];
      for (const exerciseId of exerciseIds) {
        const parent = await fetch(`${url}/rest/v1/guide_exercise_library?id=eq.${encodeURIComponent(exerciseId)}&select=is_published`, { headers });
        if (!parent.ok) throw new Error('Vérification de publication de l’exercice associé impossible');
        const parents: { is_published: boolean }[] = await parent.json();
        if (!parents.length || !parents.every((e) => e.is_published)) return false;
      }
      return true;
    }
  }
  // null = document historique : conserver ses contrôles d'accès existants.
  return null;
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
  const candidat = await candidatValide(jetonCandidat);
  if (!candidat) return erreur(401, 'Connexion requise');

  const params = new URL(req.url).searchParams;
  const id = params.get('id') || '';
  const action = params.get('action') || 'file';
  if (!/^[\w-]{10,80}$/.test(id) || (action !== 'file' && action !== 'list')) return erreur(400, 'Requête invalide');

  try {
    const jeton = await jetonDrive();
    const meta = await drive(`/files/${id}?fields=id,name,mimeType,parents&supportsAllDrives=true`, jeton);
    if (meta.status === 404 || meta.status === 403) return erreur(404, 'Document introuvable');
    if (!meta.ok) return erreur(502, 'Erreur Google Drive');
    const fichier = await meta.json();

    let accesBibliotheque: boolean | null = null;
    if (!candidat.admin) {
      const chemin = await chaineParentsDrive(id, fichier.parents || [], jeton);
      accesBibliotheque = await accesBibliothequePubliee(chemin, false);
      if (accesBibliotheque === false) return erreur(403, 'Ce dossier ou document n’est pas publié pour les Officiers Guides');
    }

    // La règle de transmission préalable ne concerne que les candidats.
    // Un Officier Guide OG consulte les corrigés sans soumettre de fiche,
    // tout en restant soumis au contrôle de publication de la bibliothèque.
    if (!candidat.admin && !candidat.officierGuide && accesBibliotheque === null) {
      const requis = await dossierRequis(id, fichier.parents || [], jeton);
      if (requis !== null && !(await fichesTransmises(candidat.id)).has(requis)) {
        return erreur(403, 'Transmettez votre fiche du dossier ' + requis + ' pour ouvrir ce corrigé');
      }
    }
    if (action === 'list') {
      if (fichier.mimeType !== FOLDER) return erreur(400, 'Ce n\'est pas un dossier');
      const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
      const fichiers: { id: string; name: string; mimeType: string }[] = [];
      let pageToken = '';
      do {
        const pagination = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
        const liste = await drive(
          `/files?q=${q}&fields=nextPageToken,files(id,name,mimeType)&orderBy=folder,name&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pagination}`,
          jeton,
        );
        if (!liste.ok) return erreur(502, 'Erreur Google Drive');
        const page = await liste.json();
        fichiers.push(...(page.files || []));
        pageToken = page.nextPageToken || '';
      } while (pageToken);
      return reponse(JSON.stringify({ name: fichier.name, files: fichiers }), 200, { 'Content-Type': 'application/json' });
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

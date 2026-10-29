# DOCTRINE

## Structure du dépôt

```
index.html               application BM4 (entrée unique du site et de la PWA)
INDEX BM4V2.HTML         ancienne URL conservée par redirection
manifest.webmanifest     manifeste PWA
sw.js                    service worker (doit rester à la racine : portée)
favicon.ico
icons/                   icônes PWA (192, 512, maskable, apple-touch)
viewer/                  visionneuse intégrée des documents Google Drive
supabase/functions/      fonction drive-proxy (accès privé à Drive)
splash/                  splash animé (CSS, JS, images, police)
auth/                    écran de connexion (Supabase, comptes QCM-MAJOR.FR)
admin/                   interface administrateur (édition des modules)
supabase/                scripts SQL pour le contenu et le suivi des consultations
.github/workflows/       déploiement GitHub Pages
```

## Interface administrateur

Un compte administrateur voit le bouton **« ✏️ Mode admin »** (en bas à gauche). Il permet, dans les 6 modules : modifier les textes, changer le libellé et l’URL de chaque lien (🔗), supprimer, déplacer, dupliquer, et ajouter rubriques, sous-rubriques et liens. Dans le module 6, une liste déroulante permet de choisir la spécialité à gérer ; **« + Ressource »** permet d’ajouter un lien web à celles sans document. Le candidat ne voit que la ligne correspondant à sa spécialité, avec le bouton **« Ouvrir »** dès qu’une ressource est renseignée. « Enregistrer » publie pour tous les utilisateurs ; « Valeurs d’origine » restaure le module.

Mise en place (une seule fois) :
1. exécuter `supabase/doctrine-content.sql` dans Supabase > SQL Editor ;
2. exécuter `supabase/documentation-consultations.sql` dans Supabase > SQL Editor pour activer le journal des ouvertures et sa purge automatique ;
3. donner le rôle au compte : `app_metadata` = `{"role": "admin"}` (ou `{"bm4_admin": true}`), comme sur QCM-MAJOR.FR.

Le rôle lu côté navigateur n’affiche que l’interface : les écritures sont autorisées ou refusées par les règles RLS de la table. Le contenu enregistré est assaini (scripts, `on*`, URL `javascript:` retirés). Sans table ou hors ligne, le contenu d’origine du HTML est affiché.

Le bouton **« 📊 Suivi des consultations »** du compte administrateur affiche d’abord la liste des candidats (nombre d’ouvertures, de téléchargements, dernière activité) ; un clic sur le nom d’un candidat ouvre le détail de ses consultations (module, document, action, date et heure), avec un bouton pour revenir à la liste. Les liens dont le libellé indique « télécharger »/« download », ou qui ont l’attribut HTML `download`, sont identifiés comme des téléchargements ; les autres sont des ouvertures. Pour les fichiers externes (notamment Google Drive), seul le clic sur le lien est mesurable : le site ne peut pas savoir si le téléchargement a abouti ou si le document a été lu. Les lignes sont enregistrées dans Supabase ; chaque candidat ne peut ajouter que ses propres événements et seuls les administrateurs peuvent lire l’historique. Une tâche Supabase supprime quotidiennement les événements datant de plus de 12 mois ; elle est créée par le script SQL ci-dessus.

Les contrôles automatiques s’exécutent sur les pull requests vers `main` et avant chaque déploiement : ils vérifient la syntaxe JavaScript ainsi que la présence des ressources locales référencées par les pages, le manifeste PWA et le service worker.


## Proxy Google Drive (visionneuse sécurisée)

La fonction `supabase/functions/drive-proxy` vérifie la session du candidat, lit le fichier avec un compte de service Google et le renvoie à l'application : les fichiers Drive peuvent alors rester **privés**. Google Docs/Sheets/Slides sont convertis en PDF ; les dossiers sont listés dans la visionneuse.

Mise en place (une seule fois) :
1. Google Cloud : créer un projet, activer **Google Drive API**, créer un **compte de service** et télécharger sa clé JSON ;
2. dans Drive, partager en lecture le dossier racine des documents avec l'adresse e-mail du compte de service, puis repasser les fichiers publics en accès « Restreint » ;
3. `supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat cle.json)"` ;
4. `supabase functions deploy drive-proxy`.

Tant que la fonction n'est pas déployée, la visionneuse se rabat sur l'aperçu Drive (fichiers publics requis, pas de téléchargement, dossiers non pris en charge). Les identifiants Drive restent présents dans le HTML : ils ne donnent accès à rien une fois les fichiers privés.

## Connexion

L’accès à l’application demande une connexion avec les identifiants QCM-MAJOR.FR, vérifiés auprès du même projet Supabase.

- compte valide et email confirmé : accès immédiat, sans nouvelle inscription, et session conservée (jeton de rafraîchissement) ;
- compte inexistant ou mot de passe incorrect : accès refusé avec un lien pour créer le compte sur QCM-MAJOR.FR ;
- l’écran permet d’afficher ou de masquer le mot de passe saisi ;
- la clé Supabase « publishable » est publique par conception ; le filtre protège l’interface, mais ne chiffre pas les fichiers d’un site statique (les liens Drive publics restent accessibles à qui les connaît) ;
- pour un autre projet Supabase, modifier `SUPABASE_URL` et `SUPABASE_KEY` dans `auth/auth.js`.

## PWA

La page `index.html` est l’entrée unique du site et de la PWA. Après le splash et la connexion, l’application BM4 s’affiche directement. L’ancienne URL `INDEX BM4V2.HTML` redirige vers cette page.

La page d’application affiche le dernier module consulté et le suivi détaillé des dossiers et corrigés, conservé localement sur l’appareil. Le journal des clics sur les liens de documents, y compris les clics identifiés comme téléchargements, est centralisé dans Supabase pour l’administration. Chaque module propose le même retour à la liste des modules.

Dans le module 4, le menu d’accès reprend les dossiers du module 3. Après avoir choisi un dossier, le candidat sélectionne sa fiche en PDF, DOC ou DOCX puis la transmet : seul le corrigé du dossier choisi est alors affiché. La sélection est locale et temporaire ; les liens Drive accessibles directement restent soumis à leurs propres autorisations.

- la PWA démarre sur `index.html` et reste installable sur un hébergement statique compatible HTTPS, y compris GitHub Pages pour ce dépôt
- le manifeste `manifest.webmanifest` utilise des chemins relatifs pour fonctionner à la racine ou sous `/DOCTRINE/`
- le service worker `sw.js` met en cache dès l’installation le shell local (HTML, manifeste), les icônes du dossier `icons/` et `favicon.ico`
- ces icônes locales servent à l’onglet du navigateur, à l’installation PWA et au raccourci mobile
- les liens Google Drive (fichiers et dossiers) des modules s'ouvrent dans une visionneuse intégrée avec bouton **⬇ Télécharger** (le téléchargement est enregistré dans le suivi admin) ; le candidat n'ouvre jamais Drive (Ctrl/⌘/Maj+clic mis à part). Voir « Proxy Google Drive » ci-dessous
- les liens externes Google Drive et `https://Qcm-major.fr` restent des ressources réseau et ne sont pas préchargés ni mis en cache
- en cas de mise à jour du service worker, un message indique qu’il faut fermer puis rouvrir l’application pour récupérer la nouvelle version
- au démarrage, `index.html` affiche un splash animé « Couteau Suisse BM4 » (dossier `splash/`, précaché par le service worker) : environ 6 s, une fois par session, fermable d’un toucher et désactivé si `prefers-reduced-motion` est actif

## Installation GitHub Pages

URL attendue : **https://domino2801-cmyk.github.io/DOCTRINE/**

1. dans **Settings > Pages**, vérifier que la **Source** est définie sur **GitHub Actions** (si GitHub Pages n’est pas encore activé)
2. pousser sur la branche `main` pour déclencher le workflow de déploiement
3. ouvrir l’URL HTTPS publiée du site ; l’application démarre après la connexion
4. laisser le navigateur charger une première fois la page en ligne
5. utiliser le bouton **Installer l’application** quand le navigateur le propose

## Limites hors ligne

Hors ligne, le shell local continue de se charger après la première visite connectée, mais les documents Drive, feuilles Google et liens externes nécessitent toujours une connexion Internet.
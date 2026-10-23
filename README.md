# DOCTRINE

## Structure du dépôt

```
index.html               page d’accueil
INDEX BM4V2.HTML         application (start_url de la PWA)
manifest.webmanifest     manifeste PWA
sw.js                    service worker (doit rester à la racine : portée)
favicon.ico
icons/                   icônes PWA (192, 512, maskable, apple-touch)
splash/                  splash animé (CSS, JS, images, police)
auth/                    écran de connexion (Supabase, comptes QCM-MAJOR.FR)
admin/                   interface administrateur (édition des modules)
supabase/                script SQL de la table doctrine_content
.github/workflows/       déploiement GitHub Pages
```

## Interface administrateur

Un compte administrateur voit le bouton **« ✏️ Mode admin »** (en bas à gauche). Il permet, dans les 6 modules : modifier les textes, changer le libellé et l’URL de chaque lien (🔗), supprimer, déplacer, dupliquer, et ajouter rubriques, sous-rubriques et liens. « Enregistrer » publie pour tous les utilisateurs ; « Valeurs d’origine » restaure le module.

Mise en place (une seule fois) :
1. exécuter `supabase/doctrine-content.sql` dans Supabase > SQL Editor ;
2. donner le rôle au compte : `app_metadata` = `{"role": "admin"}` (ou `{"bm4_admin": true}`), comme sur QCM-MAJOR.FR.

Le rôle lu côté navigateur n’affiche que l’interface : les écritures sont autorisées ou refusées par les règles RLS de la table. Le contenu enregistré est assaini (scripts, `on*`, URL `javascript:` retirés). Sans table ou hors ligne, le contenu d’origine du HTML est affiché.


## Connexion

L’accès à l’accueil et à l’application demande une connexion avec les **identifiants « Questions pour un major »** (compte QCM-MAJOR.FR, vérifié auprès du même projet Supabase).

- compte valide et email confirmé : accès immédiat, sans nouvelle inscription, et session conservée (jeton de rafraîchissement) ;
- compte inexistant ou mot de passe incorrect : accès refusé avec un lien pour créer le compte sur QCM-MAJOR.FR ;
- la clé Supabase « publishable » est publique par conception ; le filtre protège l’interface, mais ne chiffre pas les fichiers d’un site statique (les liens Drive publics restent accessibles à qui les connaît) ;
- pour un autre projet Supabase, modifier `SUPABASE_URL` et `SUPABASE_KEY` dans `auth/auth.js`.

## PWA

L’application HTML `INDEX BM4V2.HTML` est désormais installable comme Progressive Web App sur un hébergement statique compatible HTTPS, y compris GitHub Pages pour ce dépôt.

- le manifeste `manifest.webmanifest` utilise des chemins relatifs pour fonctionner à la racine ou sous `/DOCTRINE/`
- le service worker `sw.js` met en cache dès l’installation le shell local (HTML, manifeste), les icônes du dossier `icons/` et `favicon.ico`
- ces icônes locales servent à l’onglet du navigateur, à l’installation PWA et au raccourci mobile
- les liens externes Google Drive et `https://Qcm-major.fr` restent des ressources réseau et ne sont pas préchargés ni mis en cache
- en cas de mise à jour du service worker, un message indique qu’il faut fermer puis rouvrir l’application pour récupérer la nouvelle version
- au démarrage, `INDEX BM4V2.HTML` affiche un splash animé « Couteau Suisse BM4 » (dossier `splash/`, précaché par le service worker) : environ 6 s, une fois par session, fermable d’un toucher et désactivé si `prefers-reduced-motion` est actif

## Installation GitHub Pages

URL attendue : **https://domino2801-cmyk.github.io/DOCTRINE/**

1. dans **Settings > Pages**, vérifier que la **Source** est définie sur **GitHub Actions** (si GitHub Pages n’est pas encore activé)
2. pousser sur la branche `main` pour déclencher le workflow de déploiement
3. ouvrir l’URL HTTPS publiée de `INDEX BM4V2.HTML`
4. laisser le navigateur charger une première fois la page en ligne
5. utiliser le bouton **Installer l’application** quand le navigateur le propose

## Limites hors ligne

Hors ligne, le shell local continue de se charger après la première visite connectée, mais les documents Drive, feuilles Google et liens externes nécessitent toujours une connexion Internet.
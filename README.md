# DOCTRINE

## Structure du dépôt

```
index.html               application BM4 (entrée unique du site et de la PWA)
INDEX BM4V2.HTML         ancienne URL conservée par redirection
manifest.webmanifest     manifeste PWA
sw.js                    service worker (doit rester à la racine : portée)
favicon.ico
icons/                   icônes PWA (192, 512, maskable, apple-touch)
splash/                  splash animé (CSS, JS, images, police)
auth/                    écran de connexion (Supabase, comptes QCM-MAJOR.FR)
admin/                   interface administrateur (édition des modules)
supabase/                scripts SQL pour le contenu et le suivi des consultations
.github/workflows/       déploiement GitHub Pages
```

## Interface administrateur

Un compte administrateur voit le bouton **« ✏️ Mode admin »** (en bas à gauche). Il permet, dans les 6 modules : modifier les textes, changer le libellé et l’URL de chaque lien (🔗), supprimer, déplacer, dupliquer, et ajouter rubriques, sous-rubriques et liens. « Enregistrer » publie pour tous les utilisateurs ; « Valeurs d’origine » restaure le module.

Mise en place (une seule fois) :
1. exécuter `supabase/doctrine-content.sql` dans Supabase > SQL Editor ;
2. exécuter `supabase/documentation-consultations.sql` dans Supabase > SQL Editor pour activer le journal des ouvertures et sa purge automatique ;
3. donner le rôle au compte : `app_metadata` = `{"role": "admin"}` (ou `{"bm4_admin": true}`), comme sur QCM-MAJOR.FR.

Le rôle lu côté navigateur n’affiche que l’interface : les écritures sont autorisées ou refusées par les règles RLS de la table. Le contenu enregistré est assaini (scripts, `on*`, URL `javascript:` retirés). Sans table ou hors ligne, le contenu d’origine du HTML est affiché.

Le bouton **« 📊 Suivi des consultations »** du compte administrateur affiche l’historique des clics sur les liens externes des modules, avec le candidat connecté, le module, le document et la date/heure. Les lignes sont enregistrées dans Supabase ; chaque candidat ne peut ajouter que ses propres événements et seuls les administrateurs peuvent lire l’historique. Il s’agit d’un suivi des ouvertures de liens, pas d’une preuve que le document a été lu. Une tâche Supabase supprime quotidiennement les événements datant de plus de 12 mois ; elle est créée par le script SQL ci-dessus.

Les contrôles automatiques s’exécutent sur les pull requests vers `main` et avant chaque déploiement : ils vérifient la syntaxe JavaScript ainsi que la présence des ressources locales référencées par les pages, le manifeste PWA et le service worker.


## Connexion

L’accès à l’application demande une connexion avec les identifiants QCM-MAJOR.FR, vérifiés auprès du même projet Supabase.

- compte valide et email confirmé : accès immédiat, sans nouvelle inscription, et session conservée (jeton de rafraîchissement) ;
- compte inexistant ou mot de passe incorrect : accès refusé avec un lien pour créer le compte sur QCM-MAJOR.FR ;
- l’écran permet d’afficher ou de masquer le mot de passe saisi ;
- la clé Supabase « publishable » est publique par conception ; le filtre protège l’interface, mais ne chiffre pas les fichiers d’un site statique (les liens Drive publics restent accessibles à qui les connaît) ;
- pour un autre projet Supabase, modifier `SUPABASE_URL` et `SUPABASE_KEY` dans `auth/auth.js`.

## PWA

La page `index.html` est l’entrée unique du site et de la PWA. Après le splash et la connexion, l’application BM4 s’affiche directement. L’ancienne URL `INDEX BM4V2.HTML` redirige vers cette page.

La page d’application affiche le dernier module consulté et le suivi détaillé des dossiers et corrigés, conservé localement sur l’appareil. Le journal des ouvertures de documents est, lui, centralisé dans Supabase pour l’administration. Chaque module propose le même retour à la liste des modules.

- la PWA démarre sur `index.html` et reste installable sur un hébergement statique compatible HTTPS, y compris GitHub Pages pour ce dépôt
- le manifeste `manifest.webmanifest` utilise des chemins relatifs pour fonctionner à la racine ou sous `/DOCTRINE/`
- le service worker `sw.js` met en cache dès l’installation le shell local (HTML, manifeste), les icônes du dossier `icons/` et `favicon.ico`
- ces icônes locales servent à l’onglet du navigateur, à l’installation PWA et au raccourci mobile
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
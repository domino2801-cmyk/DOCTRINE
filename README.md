# DOCTRINE

## Structure du dépôt

```
index.html               application BM4 (entrée unique du site et de la PWA)
app/                     styles.css (styles), app.js (logique des modules), effets.js (animations)
INDEX BM4V2.HTML         ancienne URL conservée par redirection (ne pas supprimer : anciens liens)
manifest.webmanifest     manifeste PWA
sw.js                    service worker (doit rester à la racine : portée)
favicon.ico
icons/                   icônes PWA (192, 512, maskable, apple-touch)
viewer/                  visionneuse intégrée des documents Google Drive
supabase/functions/      fonctions drive-proxy (Drive) et doctrine-report-push (alertes)
splash/                  splash animé et cadre de connexion (CSS, JS, images, police)
auth/                    écran de connexion (Supabase, comptes QCM-MAJOR.FR)
admin/                   interface administrateur (édition des modules)
supabase/                scripts SQL pour le contenu et le suivi des consultations
.github/workflows/       déploiement GitHub Pages
```

## Interface administrateur

Un compte administrateur voit le bouton **« ✏️ Mode admin »** (dans la barre de chaque module). Il permet, dans les 7 modules : modifier les textes, changer le libellé et l’URL de chaque lien (🔗), supprimer, déplacer, dupliquer, et ajouter rubriques, sous-rubriques et liens. Dans le module 6, le sélecteur de spécialité est visible dès qu’un administrateur est connecté et permet de consulter une ressource ; les commandes d’édition restent disponibles après activation du mode admin. **« + Ressource »** permet d’ajouter un lien web à celles sans document. Le candidat connecté ne voit que la ligne correspondant à sa spécialité, avec le bouton **« Ouvrir »** dès qu’une ressource est renseignée. « Enregistrer » publie pour tous les utilisateurs ; « Valeurs d’origine » restaure le module. **« ⬇ Sauvegarde »** télécharge un fichier JSON avec tout le contenu personnalisé (à faire avant une grosse modification) ; **« ⬆ Restaurer »** recharge un tel fichier après confirmation (fichier `doctrine-content`, 2 Mo maximum, modules 1 à 7 uniquement).

Mise en place (une seule fois) :
1. exécuter `supabase/doctrine-content.sql` dans Supabase > SQL Editor ;
2. exécuter `supabase/documentation-consultations.sql` dans Supabase > SQL Editor pour activer le journal des ouvertures et sa purge automatique ;
3. exécuter `supabase/retex-signalements.sql` dans Supabase > SQL Editor pour activer les fiches du module 7 (RETEX : une par compte ; signalements : plusieurs, avec priorité et statut `pending`/`resolved`) ; chaque candidat n’y ajoute que ses propres fiches et seuls les administrateurs les lisent (consultation dans Supabase > Table Editor) ;
4. activer les notifications push : exécuter `supabase/retex-notifications.sql`, générer une paire de clés VAPID (`npx web-push generate-vapid-keys`), puis renseigner dans les secrets Edge Functions `DOCTRINE_VAPID_PUBLIC_KEY`, `DOCTRINE_VAPID_PRIVATE_KEY` et un secret aléatoire `DOCTRINE_REPORT_PUSH_WEBHOOK_SECRET` ;
5. ajouter dans Supabase Vault les secrets `doctrine_report_push_url` (URL complète de la fonction `doctrine-report-push`) et `doctrine_report_push_webhook_secret` (la même valeur que `DOCTRINE_REPORT_PUSH_WEBHOOK_SECRET`), puis déployer avec `supabase functions deploy doctrine-report-push --no-verify-jwt` ;
6. donner le rôle au compte : `app_metadata` = `{"role": "admin"}` (ou `{"bm4_admin": true}`), comme sur QCM-MAJOR.FR.

Le rôle lu côté navigateur n’affiche que l’interface : les écritures sont autorisées ou refusées par les règles RLS de la table. Le contenu enregistré est assaini (scripts, `on*`, URL `javascript:` retirés). Sans table ou hors ligne, le contenu d’origine du HTML est affiché.

Le bouton **« 🔔 Alertes »** de l’administration active ou désactive les notifications sur l’appareil, et permet d’en envoyer une notification de test. Chaque nouveau signalement avertit les administrateurs abonnés et met à jour le badge numérique de l’icône lorsque le navigateur et le système le prennent en charge. Ces notifications utilisent une fonction et une table propres à DOCTRINE afin de ne pas interférer avec celles de QCM-MAJOR.FR. Le clic sur une notification ouvre les signalements dans l’administration. La configuration Supabase et le déploiement de la fonction sont nécessaires ; les permissions de notification sont accordées par appareil et navigateur.

Le bouton **« 📊 Suivi »** du compte administrateur (à droite de « Mode admin », dans la barre de chaque module) affiche d’abord la liste des candidats ; un clic sur le nom d’un candidat affiche son nombre d’ouvertures, de téléchargements, sa dernière activité et le détail de ses consultations (module, document, action, date et heure), avec un bouton pour revenir à la liste. Les liens dont le libellé indique « télécharger »/« download », ou qui ont l’attribut HTML `download`, sont identifiés comme des téléchargements ; les autres sont des ouvertures. Pour les fichiers externes (notamment Google Drive), seul le clic sur le lien est mesurable : le site ne peut pas savoir si le téléchargement a abouti ou si le document a été lu. Les lignes sont enregistrées dans Supabase ; chaque candidat ne peut ajouter et relire que ses propres événements, et seuls les administrateurs peuvent lire tout l’historique. Pour valider le module 1, le candidat doit avoir ouvert la présentation du BM4 (rubrique 1.1) : la case « J’ai lu l’ensemble de ce module » vérifie cette ouverture dans Supabase, sinon elle affiche un message et se décoche (les administrateurs ne sont pas concernés). Une tâche Supabase supprime quotidiennement les événements datant de plus de 12 mois ; elle est créée par le script SQL ci-dessus.

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

Dans le module 4, le menu d’accès reprend les dossiers du module 3. Pour afficher un corrigé, le candidat doit avoir marqué le dossier correspondant « Fait » dans le module 3 et transmis sa fiche en PDF, DOC ou DOCX. Si le dossier repasse à « À faire », son corrigé est masqué jusqu’à ce qu’il soit de nouveau marqué « Fait ». Les administrateurs conservent l’accès aux corrigés. Les PDF sont comparés dans le navigateur à `gabarits/modele_officiel.pdf` avant transmission : deux pages aux dimensions du modèle et un score de pixels d’au moins 88 % sont requis. Le bucket doit autoriser la lecture de ce fichier aux utilisateurs authentifiés. Le statut « Fait » est local à l’appareil ; il contrôle l’affichage, tandis que le proxy Drive vérifie la transmission côté serveur et que les liens Drive accessibles directement restent soumis à leurs propres autorisations.

La comparaison est effectuée à 150 DPI sur les pixels bruts, page par page, avec PDF.js et Pixelmatch 8.0.0 (licence MIT dans `app/vendor/pixelmatch-LICENSE.txt`). Elle dépend des ressources de l’appareil et d’un accès au modèle et à PDF.js ; elle ne sollicite pas la fonction Edge `validate-gabarit`. Le score inclut les zones blanches et ne garantit pas la présence du bon gabarit. La vérification est déclenchée par le navigateur uniquement pour les PDF : elle ne contrôle ni les fichiers DOC/DOCX, ni les appels directs à la fonction de transmission.

Une barre indique la progression des étapes de vérification du PDF ; elle est distincte du score de conformité et de la transmission de la fiche.

Les tests de cette comparaison se lancent avec `node --test scripts/test-validate-gabarit.mjs`.

- la PWA démarre sur `index.html` et reste installable sur un hébergement statique compatible HTTPS, y compris GitHub Pages pour ce dépôt
- le manifeste `manifest.webmanifest` utilise des chemins relatifs pour fonctionner à la racine ou sous `/DOCTRINE/`
- le service worker `sw.js` met en cache dès l’installation le shell local (HTML, CSS et JS de `app/`, manifeste), les icônes du dossier `icons/` et `favicon.ico`
- pour les administrateurs abonnés, il affiche les notifications push de signalement et actualise le badge de l’application quand l’API de badge est prise en charge
- au déploiement, le workflow remplace automatiquement le nom du cache (`CACHE_NAME`) par l’identifiant du commit : plus besoin d’incrémenter `bm4-shell-vN` à la main pour publier
- ces icônes locales servent à l’onglet du navigateur, à l’installation PWA et au raccourci mobile
- les liens Google Drive (fichiers et dossiers) des modules s'ouvrent dans une visionneuse intégrée avec bouton **⬇ Télécharger** (le téléchargement est enregistré dans le suivi admin) ; le candidat n'ouvre jamais Drive (Ctrl/⌘/Maj+clic mis à part). Voir « Proxy Google Drive » ci-dessous
- les liens externes Google Drive et `https://Qcm-major.fr` restent des ressources réseau et ne sont pas préchargés ni mis en cache
- en cas de mise à jour du service worker, un message indique qu’il faut fermer puis rouvrir l’application pour récupérer la nouvelle version
- au démarrage, `index.html` affiche à chaque chargement un splash animé « Couteau Suisse BM4 » (dossier `splash/`, précaché par le service worker) : environ 6 s, fermable d’un toucher et désactivé si `prefers-reduced-motion` est actif
- l’écran de connexion est entouré par `splash/connexion-cadre.png` ; le fond latéral reprend les couleurs des bords du cadre pour se fondre avec lui. Les deux images sont précachées pour rester disponibles hors ligne

## Installation GitHub Pages

URL attendue : **https://domino2801-cmyk.github.io/DOCTRINE/**

1. dans **Settings > Pages**, vérifier que la **Source** est définie sur **GitHub Actions** (si GitHub Pages n’est pas encore activé)
2. pousser sur la branche `main` pour déclencher le workflow de déploiement
3. ouvrir l’URL HTTPS publiée du site ; l’application démarre après la connexion
4. laisser le navigateur charger une première fois la page en ligne
5. utiliser le bouton **Installer l’application** quand le navigateur le propose

## Limites hors ligne

Hors ligne, le shell local continue de se charger après la première visite connectée, mais les documents Drive, feuilles Google et liens externes nécessitent toujours une connexion Internet.
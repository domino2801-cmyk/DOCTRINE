# DOCTRINE

DOCTRINE, l’Armoire numérique de campagne, rassemble les ressources de préparation au Brevet militaire de 4e niveau (BM4). Elle complète QCM-MAJOR : les deux applications utilisent les mêmes comptes candidats.

## Accéder à l’Armoire

Depuis le centre de QCM-MAJOR, connectez-vous puis choisissez **« Armoire numérique de campagne »** : l’Armoire reprend automatiquement la session active, sans ressaisir vos identifiants. Gardez QCM-MAJOR ouvert pour permettre le renouvellement de la session. Un accès direct par favori ou adresse ne transporte pas la session QCM-MAJOR.

Vous pouvez aussi ouvrir directement [DOCTRINE sur GitHub Pages](https://domino2801-cmyk.github.io/DOCTRINE/), puis vous connecter avec votre compte QCM-MAJOR. Depuis le parcours lancé par QCM-MAJOR, le module 5 propose un retour à l’application d’origine sans interrompre une partie en cours.

## Les modules

L’Armoire propose sept modules aux candidats et un espace réservé aux officiers guides et aux administrateurs :

1. **Cadre institutionnel et RETEX**
2. **Base documentaire et cadre doctrinal**
3. **Exercices de rédaction**
4. **Propositions de correction**
5. **Entraînement intensif au QCM doctrinal**
6. **Préparation à l’admission : oral et sport**
7. **RETEX et signalements**
8. **Poste de commandement Officier Guide BM4** — suivi des candidats rattachés, évaluations des fiches et suivi admission. Cette entrée est visible pour les comptes de spécialité `OG` ainsi que pour les rôles `guide`, `officier_guide` ou `admin`.

Validez le module 1 pour poursuivre. Sa section 1.5 affiche un code candidat de 8 caractères à transmettre à l’Officier Guide pour le rattachement. Dans le module 3, la barre de progression atteint 100 % lorsque la moitié des dossiers (8 sur 16) est marquée **« Fait »** ; les autres exercices restent accessibles. Le suivi indique le module entièrement terminé quand les 16 dossiers sont faits. Dans le module 4, les candidats accèdent au corrigé d’un dossier après l’avoir marqué **« Fait »** dans le module 3 et transmis sa fiche ; les comptes de spécialité **OG** y accèdent directement. Les liens Google Drive s’ouvrent dans une visionneuse intégrée ; leur accès et le téléchargement dépendent des autorisations disponibles.

Les états détaillés des dossiers restent conservés sur l’appareil. À partir de l’installation du journal Supabase, les démarrages de modules, la validation du module 1, le passage d’un dossier à « Fait » et l’accès à un corrigé sont aussi enregistrés comme événements associés au compte. Le module 3 est indiqué terminé lorsque tous ses dossiers sont marqués « Fait ». Les transmissions de fiches proviennent de leur enregistrement serveur. Les consultations de documents sont des clics enregistrés, pas une preuve de lecture. Ces événements de progression sont des déclarations d’activité, pas une validation inviolable du travail ; ils sont conservés au maximum 12 mois. Les événements antérieurs à l’installation ne sont pas reconstitués à partir du stockage local.

Pour activer le journal, exécutez en entier `supabase/progression-events.sql` dans **Supabase > SQL Editor**, sur le même projet partagé que QCM-MAJOR, après `supabase/fiche-submissions.sql`. Le script crée `public.doctrine_progress_events` dans le schéma `public` (ce n’est pas un dossier). Vérifiez ensuite dans **Database > Tables** que `doctrine_progress_events` apparaît sous le schéma `public`. QCM-MAJOR doit également avoir reçu sa migration `20261110120000_admin_candidate_tracking.sql` pour afficher ces événements dans la chronologie administrateur. Les événements sont envoyés lorsque l’application est connectée ; le statut indique si une étape n’a pas pu être synchronisée.

### Validation de fin des modules

Pour activer la validation automatique du module 5, exécutez aussi en entier `supabase/module5-qcm-auto-validation.sql` dans **Supabase > SQL Editor**, après `supabase/progression-events.sql`, sur le projet partagé avec QCM-MAJOR. La fonction vérifie la moyenne des notes QCM du compte connecté (identifiant utilisateur ou identifiant candidat) et crée une seule fois l’événement de fin du module 5 lorsque la moyenne atteint 13/20.

Les modules 2, 4, 6 et 7 proposent une action explicite « Valider la fin du module ». Le module 5 est validé automatiquement dès que la moyenne des résultats QCM-MAJOR du candidat atteint le statut « Prêt », soit au moins 13/20 ; aucune action ni validation manuelle n’est demandée. La vérification est effectuée par une fonction Supabase qui lit les résultats du compte authentifié et inscrit l’événement `module_completed` dans `doctrine_progress_events`. Le module 1 conserve sa validation après lecture de la présentation ; le module 3 est validé lorsque tous ses dossiers sont marqués « Fait ». Les modules 1 à 7 sont ainsi pris en compte dans le tableau de bord Admin de QCM-MAJOR. Cette validation automatique atteste du seuil QCM atteint, pas de la maîtrise de l’ensemble des contenus.

## Compte administrateur

Les administrateurs disposent, dans les modules, de commandes pour modifier le contenu, gérer les liens et organiser les rubriques. Les changements enregistrés sont publiés pour les utilisateurs. Les options de sauvegarde et de restauration permettent d’exporter ou de réimporter le contenu personnalisé.

Selon les services configurés, l’administration permet aussi de consulter le suivi des consultations, de traiter les signalements et d’activer des notifications. Le rôle administrateur est attribué dans Supabase ; l’interface seule ne contrôle pas les autorisations, qui reposent sur les règles RLS.

## Configuration des services

Le site est développé en HTML, CSS et JavaScript sans étape de compilation. Supabase fournit l’authentification, les données et les fonctions serveur. Les scripts SQL ci-dessous s’exécutent dans Supabase **SQL Editor** ; les fonctions Edge se déploient avec la CLI Supabase.

| Fonction | Configuration requise |
| --- | --- |
| Contenu administrable | Exécuter `supabase/doctrine-content.sql`. |
| Suivi des consultations | Exécuter `supabase/documentation-consultations.sql`. Le script configure aussi la purge des événements de plus de 12 mois. |
| RETEX et signalements | Exécuter `supabase/retex-signalements.sql`. Les candidats peuvent consulter leur propre RETEX ; les administrateurs traitent les signalements. |
| Envoi des fiches et accès aux corrigés | Exécuter `supabase/fiche-submissions.sql` avant de publier le nouveau formulaire, configurer `RESEND_API_KEY`, vérifier `DESTINATAIRE` dans `supabase/functions/doctrine-submit-fiche/index.ts`, puis déployer `doctrine-submit-fiche` avant la mise en ligne du frontend. La clé de soumission distingue la fiche de proposition du support oral ; seule une proposition transmise ouvre l’accès aux corrigés. |
| Poste de commandement Officier Guide | Après `fiche-submissions.sql`, `documentation-consultations.sql`, `progression-events.sql` et les migrations QCM-MAJOR, exécuter `supabase/guide_module8.sql` dans le SQL Editor, puis déployer `doctrine-submit-fiche` pour activer l’archivage PDF. Pour une installation existante, réexécuter ce script afin d’activer l’évaluation détaillée des deux fiches et la moyenne pondérée 70/30 ; exécuter aussi `supabase/guide_module8-og-access.sql` et `supabase/guide_module8-short-code.sql` si nécessaire. Les comptes avec la spécialité sécurisée `OG` sont autorisés ; les autres guides peuvent conserver les rôles `guide` ou `officier_guide`. Le rattachement se fait en saisissant le code de 8 caractères fourni par le candidat. Après modification de la spécialité, reconnecter le compte pour renouveler son jeton. |
| Correction assistée Gemini | Configurer `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`) et `GOOGLE_SERVICE_ACCOUNT_JSON`. Partager chacun des 16 dossiers Drive du tableau ci-dessous en lecture avec le `client_email` du compte de service. Déployer `correct-fiche-ai`. La fonction utilise directement l’identifiant du dossier correspondant au numéro transmis par l’application et parcourt ses sous-dossiers pour transmettre à Gemini les documents de référence admissibles avec la fiche du candidat. Les corrigés sont exclus. Pour la fichette orale, la fiche de proposition archivée du même candidat et du même sujet est aussi comparée si elle existe. L’analyse s’interrompt si le dossier dépasse 20 pièces, 15 Mo ou cinq niveaux de sous-dossiers. Gemini propose l’analyse et les notes ; l’Officier Guide vérifie, ajuste et enregistre la correction finale. |
| Notifications de signalement | Exécuter `supabase/retex-notifications.sql`, configurer les secrets VAPID et `DOCTRINE_REPORT_PUSH_WEBHOOK_SECRET`, puis déployer `doctrine-report-push` et renseigner les secrets correspondants dans Supabase Vault. |
| Documents Drive privés | Déployer `drive-proxy` avec `GOOGLE_SERVICE_ACCOUNT_JSON`, après avoir accordé au compte de service Google l’accès en lecture au dossier documentaire. |

### Correspondance des 16 dossiers de référence Google Drive

Les numéros ci-dessous sont ceux affichés dans le parcours candidat et utilisés par l’Officier Guide. **Le numéro est la clé de correspondance** : ne pas renuméroter les dossiers Drive indépendamment de l’application. Chaque dossier doit être partagé en lecture avec le compte de service Google.

| N° dans l’application | Sujet affiché | Identifiant du dossier Drive |
| ---: | --- | --- |
| 1 | Vie et lumières | `1l6qZIdK6QVPHfVoGuCrkoJV5QGkVGcI_` |
| 2 | Poste de Cdt 7e BB | `1N2a49fE6JNu-59Hxa15Be99vr5BavI8E` |
| 3 | Armes Salle d’Honneur | `11dhk9Y611V1i3ChYOWRvx09-9SLilVnJ` |
| 4 | Thémis | `1qGUmuf4JsK-9TNmD7tAXyO2QEKDiE2ZW` |
| 5 | PMS Opérationnel | `12IBiJtiry-On0pON_0iuoJ59Pt_6AYS1` |
| 6 | SMA / Tir SMA | `1tBRI8hjbNM-eVAgjVb9LjNK3hSuyQyAA` |
| 7 | Toulaud Air Sport | `1vGE8GLEFHoX3_DjozDBR3x8ujArRV2a5` |
| 8 | Opération Sentinelle | `1drUZgFsAX7tRadB-FaxuDJ1EKXC9AonL` |
| 9 | ARMADA | `1Fn6pmTs981S3VrTwLtNCAj2j5_d7pDtH` |
| 10 | Infrastructures | `1_w3RI1xmAN0FCZeCEeVRXcRqvFi7ek_6` |
| 11 | Camp du Ruchard | `1-m1qvnV4JvY6gm-dIPYno5xA-Qfc04IG` |
| 12 | Service national | `1cSmdKJJnmXXekUfSfeZZQ_OqZ-L5stbB` |
| 13 | Désinformation / Complotisme | `1iNMbYPCNSgiVVr2kS1y6tufkgogeucIw` |
| 14 | Bègles-Moissac | `1l0UcOA2jECtTlVzTKjsolP_CFRw_dkSA` |
| 15 | MCO SCORPION / BITD | `1GVRpJ3TnpXSxBD9PLoUtaZ1A5BRsN-d_` |
| 16 | Sécurisation face à la menace drone | `13VVCZiKzxgW8Rldm1i2addC868scJELl` |

Les dossiers 7 à 10 suivent l’ordre réel de l’application : **7 Toulaud, 8 Sentinelle, 9 ARMADA, 10 Infrastructures**. Le test `tests/guide-module8.test.mjs` compare automatiquement les 16 identifiants de la fonction Edge aux liens de dossiers de `index.html` et échoue en cas de décalage.

Les notifications push et le badge de l’application dépendent du navigateur et des autorisations de l’appareil. Sans le proxy Drive, la visionneuse utilise l’aperçu Drive : les fichiers doivent alors être accessibles publiquement.

## Développement et déploiement

Démarrer un serveur local à la racine du dépôt :

```bash
python -m http.server 8000
```

Ouvrir ensuite <http://localhost:8000>. Pour tester la validation des fiches PDF :

```bash
node --test scripts/test-validate-gabarit.mjs
```

Le déploiement GitHub Pages est déclenché par les changements sur `main` ou manuellement depuis GitHub Actions. L’URL publiée est [domino2801-cmyk.github.io/DOCTRINE](https://domino2801-cmyk.github.io/DOCTRINE/). Le site est installable comme PWA ; le shell local peut rester disponible après une première visite, mais l’authentification, les documents Drive et les autres services externes nécessitent une connexion.

L’ancienne adresse `INDEX BM4V2.HTML` redirige vers `index.html` : ne la supprimez pas, car d’anciens liens peuvent encore l’utiliser.

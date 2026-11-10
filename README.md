# DOCTRINE

DOCTRINE, l’Armoire numérique de campagne, rassemble les ressources de préparation au Brevet militaire de 4e niveau (BM4). Elle complète QCM-MAJOR : les deux applications utilisent les mêmes comptes candidats.

## Accéder à l’Armoire

Depuis le centre de QCM-MAJOR, choisissez **« Armoire numérique de campagne »**. L’Armoire s’ouvre dans un nouvel onglet et peut récupérer temporairement la session active pour vous connecter automatiquement. Gardez QCM-MAJOR ouvert pour permettre le renouvellement de la session. Si la connexion automatique ne fonctionne pas, utilisez vos identifiants QCM-MAJOR.

Vous pouvez aussi ouvrir directement [DOCTRINE sur GitHub Pages](https://domino2801-cmyk.github.io/DOCTRINE/), puis vous connecter avec votre compte QCM-MAJOR. Depuis le parcours lancé par QCM-MAJOR, le module 5 propose un retour à l’application d’origine sans interrompre une partie en cours.

## Les modules

L’Armoire propose sept modules :

1. **Cadre institutionnel et RETEX**
2. **Base documentaire et cadre doctrinal**
3. **Exercices de rédaction**
4. **Propositions de correction**
5. **Entraînement intensif au QCM doctrinal**
6. **Préparation à l’admission : oral et sport**
7. **RETEX et signalements**

Validez le module 1 pour poursuivre. Le module 4 est conditionné à la progression dans le module 3 : marquez le dossier correspondant **« Fait »** et transmettez sa fiche pour accéder à son corrigé. Les liens Google Drive s’ouvrent dans une visionneuse intégrée ; leur accès et le téléchargement dépendent des autorisations disponibles.

Les états détaillés des dossiers restent conservés sur l’appareil. À partir de l’installation du journal Supabase, les démarrages de modules, la validation du module 1, le passage d’un dossier à « Fait » et l’accès à un corrigé sont aussi enregistrés comme événements associés au compte. Le module 3 est indiqué terminé lorsque tous ses dossiers sont marqués « Fait ». Les transmissions de fiches proviennent de leur enregistrement serveur. Les consultations de documents sont des clics enregistrés, pas une preuve de lecture. Ces événements de progression sont des déclarations d’activité, pas une validation inviolable du travail ; ils sont conservés au maximum 12 mois. Les événements antérieurs à l’installation ne sont pas reconstitués à partir du stockage local.

Pour activer le journal, exécutez `supabase/progression-events.sql` dans le même projet Supabase après `supabase/fiche-submissions.sql`. QCM-MAJOR doit également avoir reçu sa migration `20261110120000_admin_candidate_tracking.sql` pour afficher ces événements dans la chronologie administrateur. Les événements sont envoyés lorsque l’application est connectée ; le statut indique si une étape n’a pas pu être synchronisée.

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
| Envoi des fiches et accès aux corrigés | Exécuter `supabase/fiche-submissions.sql`, configurer `RESEND_API_KEY`, vérifier `DESTINATAIRE` dans `supabase/functions/doctrine-submit-fiche/index.ts`, puis déployer `doctrine-submit-fiche`. |
| Notifications de signalement | Exécuter `supabase/retex-notifications.sql`, configurer les secrets VAPID et `DOCTRINE_REPORT_PUSH_WEBHOOK_SECRET`, puis déployer `doctrine-report-push` et renseigner les secrets correspondants dans Supabase Vault. |
| Documents Drive privés | Déployer `drive-proxy` avec `GOOGLE_SERVICE_ACCOUNT_JSON`, après avoir accordé au compte de service Google l’accès en lecture au dossier documentaire. |

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

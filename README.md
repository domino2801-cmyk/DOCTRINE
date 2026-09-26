# DOCTRINE

## PWA

L’application HTML `INDEX BM4V2.HTML` est désormais installable comme Progressive Web App sur un hébergement statique compatible HTTPS, y compris GitHub Pages pour ce dépôt.

- le manifeste `manifest.webmanifest` utilise des chemins relatifs pour fonctionner à la racine ou sous `/DOCTRINE/`
- le service worker `sw.js` met en cache le shell local (HTML, manifeste et icônes PWA) après une première visite en ligne
- les icônes locales (`favicon.ico`, `android-icon-144x144.png`, `android-icon-192x192.png`, `apple-icon-144x144.png`, `apple-icon-152x152.png`, `icon-512.png`) servent à l’onglet du navigateur, à l’installation PWA et au raccourci mobile
- les liens externes Google Drive et `https://Qcm-major.fr` restent des ressources réseau et ne sont pas préchargés ni mis en cache
- en cas de mise à jour du service worker, un message indique qu’il faut fermer puis rouvrir l’application pour récupérer la nouvelle version

## Installation GitHub Pages

URL attendue : **https://domino2801-cmyk.github.io/DOCTRINE/**

1. dans **Settings > Pages**, vérifier que la **Source** est définie sur **GitHub Actions** (si GitHub Pages n’est pas encore activé)
2. pousser sur la branche `main` pour déclencher le workflow de déploiement
3. ouvrir l’URL HTTPS publiée de `INDEX BM4V2.HTML`
4. laisser le navigateur charger une première fois la page en ligne
5. utiliser le bouton **Installer l’application** quand le navigateur le propose

## Limites hors ligne

Hors ligne, le shell local continue de se charger après la première visite connectée, mais les documents Drive, feuilles Google et liens externes nécessitent toujours une connexion Internet.
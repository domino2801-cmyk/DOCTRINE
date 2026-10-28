/*
 * Visionneuse intégrée : les liens Google Drive des modules s'ouvrent dans l'application
 * (aperçu en iframe) au lieu de quitter le site. Les autres liens restent inchangés.
 */
(function () {
    'use strict';

    var panneau;
    var cadre;
    var titre;
    var dernierFocus;

    function urlApercu(href) {
        var url;
        try { url = new URL(href); } catch (e) { return null; }
        if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') return null;
        var fichier = url.pathname.match(/^\/file\/d\/([\w-]+)/);
        if (fichier) return 'https://drive.google.com/file/d/' + fichier[1] + '/preview';
        var dossier = url.pathname.match(/^\/drive\/folders\/([\w-]+)/);
        if (dossier) return 'https://drive.google.com/embeddedfolderview?id=' + dossier[1] + '#list';
        return null;
    }

    function construire() {
        if (panneau) return;
        panneau = document.createElement('div');
        panneau.id = 'doc-viewer';
        panneau.hidden = true;
        panneau.setAttribute('role', 'dialog');
        panneau.setAttribute('aria-modal', 'true');
        panneau.setAttribute('aria-label', 'Visionneuse de document');

        var barre = document.createElement('div');
        barre.className = 'dv-bar';
        titre = document.createElement('span');
        titre.className = 'dv-title';
        var fermer = document.createElement('button');
        fermer.type = 'button';
        fermer.className = 'dv-close';
        fermer.textContent = 'Fermer';
        fermer.addEventListener('click', fermerVisionneuse);
        barre.append(titre, fermer);

        var zone = document.createElement('div');
        zone.className = 'dv-frame';
        cadre = document.createElement('iframe');
        cadre.title = 'Document';
        cadre.setAttribute('allow', 'fullscreen');
        cadre.setAttribute('referrerpolicy', 'no-referrer');
        var ecran = document.createElement('div');
        ecran.className = 'dv-shield';
        zone.append(cadre, ecran);

        panneau.append(barre, zone);
        document.body.appendChild(panneau);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !panneau.hidden) fermerVisionneuse();
        });
    }

    function ouvrirVisionneuse(src, libelle) {
        construire();
        dernierFocus = document.activeElement;
        titre.textContent = libelle;
        cadre.src = src;
        panneau.hidden = false;
        panneau.querySelector('.dv-close').focus();
    }

    function fermerVisionneuse() {
        if (!panneau) return;
        panneau.hidden = true;
        cadre.src = 'about:blank';
        if (dernierFocus && typeof dernierFocus.focus === 'function') dernierFocus.focus();
    }

    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (document.body.classList.contains('adm-on')) return;
        var cible = e.target;
        if (!cible || typeof cible.closest !== 'function') return;
        var lien = cible.closest('.mod-body a[href]');
        if (!lien) return;
        var src = urlApercu(lien.href);
        if (!src) return;
        e.preventDefault();
        var ligne = lien.closest('.dossier-item');
        var libelle = ligne && ligne.querySelector('label span:last-child');
        ouvrirVisionneuse(src, (libelle && libelle.textContent.trim()) || lien.textContent.trim() || 'Document');
    });

    document.addEventListener('doctrine:logout', fermerVisionneuse);
})();

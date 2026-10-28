/*
 * Visionneuse intégrée : les liens Google Drive des modules s'ouvrent dans l'application.
 * Le contenu transite par la fonction Supabase « drive-proxy » (compte de service) : l'adresse
 * Drive n'est jamais ouverte par le candidat. Si la fonction n'est pas déployée, repli sur
 * l'aperçu Drive intégré. Le bouton « Télécharger » enregistre un événement de suivi.
 */
(function () {
    'use strict';

    var panneau;
    var titre;
    var corps;
    var retour;
    var telecharger;
    var dernierFocus;
    var urlObjet = null;
    var courant = null;
    var dossierCourant = null;
    var requete = 0;

    function auth() { return window.DoctrineAuth; }

    function identifier(href) {
        var url;
        try { url = new URL(href); } catch (e) { return null; }
        if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') return null;
        var f = url.pathname.match(/^\/file\/d\/([\w-]+)/);
        if (f) return { type: 'file', id: f[1] };
        var d = url.pathname.match(/^\/drive\/folders\/([\w-]+)/);
        if (d) return { type: 'folder', id: d[1] };
        return null;
    }

    function proxy(action, id) {
        return auth().jeton().then(function (jeton) {
            if (!jeton) throw new Error('Session expirée');
            return fetch(auth().url + '/functions/v1/drive-proxy?action=' + action + '&id=' + encodeURIComponent(id), {
                headers: { apikey: auth().key, Authorization: 'Bearer ' + jeton }
            });
        });
    }

    function element(tag, classe, texte) {
        var n = document.createElement(tag);
        if (classe) n.className = classe;
        if (texte) n.textContent = texte;
        return n;
    }

    function bouton(classe, texte, action) {
        var b = element('button', classe, texte);
        b.type = 'button';
        b.addEventListener('click', action);
        return b;
    }

    function construire() {
        if (panneau) return;
        panneau = element('div');
        panneau.id = 'doc-viewer';
        panneau.hidden = true;
        panneau.setAttribute('role', 'dialog');
        panneau.setAttribute('aria-modal', 'true');
        panneau.setAttribute('aria-label', 'Visionneuse de document');

        var barre = element('div', 'dv-bar');
        retour = bouton('dv-btn', '← Dossier', function () { if (dossierCourant) afficherDossier(dossierCourant); });
        retour.hidden = true;
        titre = element('span', 'dv-title');
        telecharger = bouton('dv-btn dv-download', '⬇ Télécharger', telechargerCourant);
        telecharger.hidden = true;
        barre.append(retour, titre, telecharger, bouton('dv-btn', 'Fermer', fermer));

        corps = element('div', 'dv-body');
        panneau.append(barre, corps);
        document.body.appendChild(panneau);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !panneau.hidden) fermer();
        });
    }

    function libererObjet() {
        if (urlObjet) { URL.revokeObjectURL(urlObjet); urlObjet = null; }
        courant = null;
        telecharger.hidden = true;
    }

    function message(texte, erreur) {
        corps.replaceChildren(element('p', 'dv-msg' + (erreur ? ' dv-err' : ''), texte));
    }

    function messageErreur(r) {
        if (r.status === 401) return 'Session expirée : reconnectez-vous.';
        if (r.status === 404) return 'Document introuvable ou non partagé avec l\u2019application.';
        return 'Impossible d\u2019ouvrir ce document pour le moment.';
    }

    function afficherFichier(id, nom, contexte) {
        var numero = ++requete;
        libererObjet();
        titre.textContent = nom;
        retour.hidden = !dossierCourant;
        message('Chargement du document…');
        return proxy('file', id).then(function (r) {
            if (numero !== requete) return;
            if (!r.headers.get('X-Doctrine-Proxy')) return repliApercu(id);
            if (!r.ok) return message(messageErreur(r), true);
            var fichier = r.headers.get('X-File-Name');
            var type = (r.headers.get('Content-Type') || '').split(';')[0];
            return r.blob().then(function (blob) {
                if (numero !== requete) return;
                var nomFichier = fichier ? decodeURIComponent(fichier) : nom;
                titre.textContent = nomFichier;
                urlObjet = URL.createObjectURL(blob);
                courant = { nom: nomFichier, url: contexte && contexte.url || '', module: contexte && contexte.module || '' };
                telecharger.hidden = false;
                montrer(type, urlObjet);
            });
        }).catch(function () {
            if (numero === requete) repliApercu(id);
        });
    }

    function montrer(type, src) {
        var noeud;
        if (type === 'application/pdf') {
            noeud = element('iframe', 'dv-frame');
            noeud.title = 'Document';
        } else if (type.indexOf('image/') === 0) {
            noeud = element('img', 'dv-img');
            noeud.alt = titre.textContent;
        } else if (type.indexOf('video/') === 0) {
            noeud = element('video', 'dv-video');
            noeud.controls = true;
            noeud.setAttribute('controlsList', 'nodownload');
        } else {
            return message('Aperçu indisponible pour ce format : utilisez « Télécharger ».');
        }
        noeud.src = src;
        corps.replaceChildren(noeud);
    }

    // Fonction non déployée : aperçu Drive intégré (sans téléchargement).
    function repliApercu(id) {
        libererObjet();
        var noeud = element('iframe', 'dv-frame');
        noeud.title = 'Document';
        noeud.setAttribute('allow', 'fullscreen');
        noeud.setAttribute('referrerpolicy', 'no-referrer');
        noeud.src = 'https://drive.google.com/file/d/' + id + '/preview';
        corps.replaceChildren(noeud);
    }

    function afficherDossier(id, nom) {
        var numero = ++requete;
        libererObjet();
        dossierCourant = id;
        retour.hidden = true;
        if (nom) titre.textContent = nom;
        message('Chargement du dossier…');
        proxy('list', id).then(function (r) {
            if (numero !== requete) return;
            if (!r.headers.get('X-Doctrine-Proxy')) return message('Ce dossier nécessite le proxy sécurisé (voir README).', true);
            if (!r.ok) return message(messageErreur(r), true);
            return r.json().then(function (d) {
                if (numero !== requete) return;
                titre.textContent = d.name || 'Dossier';
                var liste = element('ul', 'dv-list');
                (d.files || []).forEach(function (f) {
                    var li = document.createElement('li');
                    var dossier = f.mimeType === 'application/vnd.google-apps.folder';
                    li.appendChild(bouton('dv-item', (dossier ? '📁 ' : '📄 ') + f.name, function () {
                        if (dossier) afficherDossier(f.id, f.name);
                        else afficherFichier(f.id, f.name, { module: contexteModule, url: 'https://drive.google.com/file/d/' + f.id });
                    }));
                    liste.appendChild(li);
                });
                if (!liste.children.length) return message('Dossier vide.');
                corps.replaceChildren(liste);
            });
        }).catch(function () {
            if (numero === requete) message('Impossible d\u2019ouvrir ce dossier pour le moment.', true);
        });
    }

    var contexteModule = '';

    function telechargerCourant() {
        if (!urlObjet || !courant) return;
        var a = document.createElement('a');
        a.href = urlObjet;
        a.download = courant.nom || 'document';
        document.body.appendChild(a);
        a.click();
        a.remove();
        document.dispatchEvent(new CustomEvent('doctrine:download', {
            detail: { module: courant.module, title: courant.nom, url: courant.url }
        }));
    }

    function ouvrir(cible, libelle, module, urlOrigine) {
        construire();
        dernierFocus = document.activeElement;
        contexteModule = module;
        dossierCourant = null;
        panneau.hidden = false;
        document.body.classList.add('dv-open');
        panneau.querySelector('.dv-btn:last-child').focus();
        if (cible.type === 'folder') afficherDossier(cible.id, libelle);
        else afficherFichier(cible.id, libelle, { module: module, url: urlOrigine });
    }

    function fermer() {
        if (!panneau) return;
        requete++;
        panneau.hidden = true;
        document.body.classList.remove('dv-open');
        libererObjet();
        corps.replaceChildren();
        dossierCourant = null;
        if (dernierFocus && typeof dernierFocus.focus === 'function') dernierFocus.focus();
    }

    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (document.body.classList.contains('adm-on') || !auth()) return;
        var cible = e.target;
        if (!cible || typeof cible.closest !== 'function') return;
        var lien = cible.closest('.mod-body a[href]');
        if (!lien) return;
        var drive = identifier(lien.href);
        if (!drive) return;
        e.preventDefault();
        var ligne = lien.closest('.dossier-item');
        var libelle = ligne && ligne.querySelector('label span:last-child');
        var module = lien.closest('.mod-body[data-mod]');
        var url = new URL(lien.href);
        ouvrir(drive, (libelle && libelle.textContent.trim()) || lien.textContent.trim() || 'Document',
            module ? module.getAttribute('data-mod') : '', url.origin + url.pathname);
    });

    document.addEventListener('doctrine:logout', fermer);
})();

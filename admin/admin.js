/*
 * Interface administrateur DOCTRINE.
 * Le contenu des modules (.mod-body) est stocké dans la table Supabase « doctrine_content ».
 * Le rôle admin lu dans le JWT n'affiche que l'interface : la RLS Supabase décide des écritures.
 */
(function () {
    'use strict';

    var CACHE_KEY = 'doctrine-content';
    var MODULES = ['1', '2', '3', '4', '5', '6'];
    var defauts = {};
    var courant = {};
    var adminActif = false;
    var bouton;
    var suiviBouton;
    var suiviDialogue;
    var suiviBody;
    var suiviEtat;
    var suiviRecherche;
    var suiviActualiser;
    var suiviPlus;
    var consultations = [];
    var consultationsOffset = 0;
    var consultationsCompletes = false;
    var TAILLE_PAGE_CONSULTATIONS = 500;
    var dialogue;

    var TAGS_INTERDITS = 'script,iframe,object,embed,link,meta,base,form,style,svg,math,frame,frameset,applet';

    function auth() { return window.DoctrineAuth; }

    function urlSure(valeur, image) {
        var v = String(valeur || '').trim().replace(/[\u0000-\u001f\u007f\s]/g, '');
        if (/^(https?:|mailto:|tel:)/i.test(v)) return true;
        if (image && /^data:image\/(png|jpe?g|gif|webp);/i.test(v)) return true;
        return !/^[a-z][a-z0-9+.-]*:/i.test(v);
    }

    function assainir(html) {
        var t = document.createElement('template');
        t.innerHTML = String(html || '');
        t.content.querySelectorAll(TAGS_INTERDITS).forEach(function (n) { n.remove(); });
        t.content.querySelectorAll('*').forEach(function (el) {
            Array.prototype.slice.call(el.attributes).forEach(function (a) {
                var nom = a.name.toLowerCase();
                if (nom.indexOf('on') === 0 || nom === 'srcdoc' || nom === 'contenteditable') {
                    el.removeAttribute(a.name);
                } else if ((nom === 'href' || nom === 'xlink:href' || nom === 'action' || nom === 'formaction') && !urlSure(a.value)) {
                    el.removeAttribute(a.name);
                } else if (nom === 'src' && !urlSure(a.value, true)) {
                    el.removeAttribute(a.name);
                } else if (nom === 'style' && /url\s*\(|expression|@import/i.test(a.value)) {
                    el.removeAttribute(a.name);
                }
            });
            if (el.tagName === 'A' && el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener noreferrer');
        });
        return t.innerHTML;
    }

    function corps(n) { return document.querySelector('.mod-body[data-mod="' + n + '"]'); }

    function nettoye(el) {
        var c = el.cloneNode(true);
        c.querySelectorAll('.adm-ui').forEach(function (n) { n.remove(); });
        c.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
        return assainir(c.innerHTML);
    }

    function appliquer(n, html) {
        var el = corps(n);
        if (!el) return;
        el.innerHTML = assainir(html);
        courant[n] = nettoye(el);
    }

    function rafraichirProgression() {
        if (typeof window.bm4RefreshProgress === 'function') window.bm4RefreshProgress();
    }

    function appliquerTout(lignes) {
        MODULES.forEach(function (n) {
            var l = lignes.filter(function (x) { return String(x.module_id) === n; })[0];
            appliquer(n, l ? l.html : defauts[n]);
        });
        rafraichirProgression();
    }

    function lireCache() {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || []; } catch (e) { return []; }
    }

    function api(chemin, options) {
        return auth().jeton().then(function (jeton) {
            if (!jeton) throw Object.assign(new Error('Session expirée'), { status: 401 });
            var h = { apikey: auth().key, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' };
            if (options && options.prefer) h.Prefer = options.prefer;
            return fetch(auth().url + '/rest/v1/' + chemin, {
                method: (options && options.methode) || 'GET',
                headers: h,
                body: options && options.corps ? JSON.stringify(options.corps) : undefined,
                keepalive: !!(options && options.keepalive)
            });
        }).then(function (r) {
            if (r.ok) return r.status === 204 ? [] : r.json().catch(function () { return []; });
            return r.json().catch(function () { return {}; }).then(function (d) {
                throw Object.assign(new Error(d.message || 'HTTP ' + r.status), { status: r.status, code: d.code || '' });
            });
        });
    }

    function charger() {
        api('doctrine_content?select=module_id,html').then(function (lignes) {
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(lignes)); } catch (e) {}
            if (!adminActif) appliquerTout(lignes);
        }).catch(function () { /* table absente ou hors ligne : cache puis contenu d'origine */ });
    }

    function messageErreur(err, table) {
        if (err.code === 'PGRST205' || err.status === 404) {
            var script = table === 'doctrine_document_views'
                ? 'documentation-consultations.sql'
                : 'doctrine-content.sql';
            return 'Table absente : exécutez supabase/' + script + ' dans Supabase.';
        }
        if (err.status === 401 || err.status === 403 || err.code === '42501') return 'Droits insuffisants : compte non administrateur.';
        if (!navigator.onLine || err instanceof TypeError) return 'Hors ligne : enregistrement impossible.';
        return 'Erreur : ' + err.message;
    }

    /* ---------- Boîte de dialogue ---------- */
    function construireDialogue() {
        dialogue = document.createElement('div');
        dialogue.id = 'adm-dialog';
        dialogue.hidden = true;
        dialogue.innerHTML = '<form><strong>Modifier le lien</strong>' +
            '<label for="adm-d-texte">Texte</label><input id="adm-d-texte" type="text" autocomplete="off">' +
            '<label for="adm-d-url">Adresse (URL)</label><input id="adm-d-url" type="url" placeholder="https://" autocomplete="off">' +
            '<div class="adm-state err" id="adm-d-err"></div>' +
            '<div class="adm-actions"><button type="button" id="adm-d-annuler">Annuler</button><button type="submit">Valider</button></div></form>';
        document.body.appendChild(dialogue);
    }

    function editerLien(a) {
        var texte = dialogue.querySelector('#adm-d-texte');
        var url = dialogue.querySelector('#adm-d-url');
        var err = dialogue.querySelector('#adm-d-err');
        var form = dialogue.querySelector('form');
        texte.value = a.textContent.trim();
        url.value = a.getAttribute('href') || '';
        err.textContent = '';
        dialogue.hidden = false;
        url.focus();
        function fermer() { dialogue.hidden = true; form.onsubmit = null; dialogue.querySelector('#adm-d-annuler').onclick = null; }
        dialogue.querySelector('#adm-d-annuler').onclick = fermer;
        form.onsubmit = function (e) {
            e.preventDefault();
            var v = url.value.trim();
            if (!v || !urlSure(v)) { err.textContent = 'Adresse invalide (http, https, mailto ou tel).'; return; }
            a.setAttribute('href', v);
            if (/^https?:/i.test(v)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
            if (texte.value.trim()) a.textContent = texte.value.trim();
            fermer();
        };
    }

    /* ---------- Édition ---------- */
    function outil(libelle, titre, action, danger) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = libelle;
        b.title = titre;
        b.setAttribute('aria-label', titre);
        if (danger) b.className = 'adm-danger';
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); action(); });
        return b;
    }

    function conteneurOutils(enfants) {
        var s = document.createElement('span');
        s.className = 'adm-ui adm-row-tools';
        s.contentEditable = 'false';
        enfants.forEach(function (b) { s.appendChild(b); });
        return s;
    }

    function prochainId(corpsEl, attr) {
        var max = 0;
        document.querySelectorAll('input[' + attr + ']').forEach(function (i) {
            max = Math.max(max, parseInt(i.getAttribute(attr), 10) || 0);
        });
        return String(max + 1);
    }

    function dupliquer(ligne, corpsEl) {
        var copie = ligne.cloneNode(true);
        copie.querySelectorAll('.adm-ui').forEach(function (n) { n.remove(); });
        copie.classList.remove('completed');
        ['data-dossier', 'data-corrige'].forEach(function (attr) {
            copie.querySelectorAll('input[' + attr + ']').forEach(function (i) {
                i.setAttribute(attr, prochainId(corpsEl, attr));
                i.checked = false;
            });
        });
        ligne.parentNode.insertBefore(copie, ligne.nextSibling);
        decorer(corpsEl);
    }

    function sousElement(li, corpsEl) {
        var ul = li.querySelector(':scope > ul');
        if (!ul) { ul = document.createElement('ul'); li.appendChild(ul); }
        var n = document.createElement('li');
        n.innerHTML = '<span>Nouvel élément</span> <a href="https://" class="doc-link" target="_blank" rel="noopener noreferrer">Ouvrir</a>';
        ul.appendChild(n);
        decorer(corpsEl);
    }

    function decorer(corpsEl) {
        corpsEl.contentEditable = 'true';
        corpsEl.querySelectorAll('li, .align-row, .dossier-item').forEach(function (ligne) {
            if (ligne.querySelector(':scope > .adm-row-tools')) return;
            var b = [
                outil('↑', 'Monter', function () {
                    var p = ligne.previousElementSibling;
                    while (p && p.classList.contains('adm-ui')) p = p.previousElementSibling;
                    if (p) ligne.parentNode.insertBefore(ligne, p);
                }),
                outil('↓', 'Descendre', function () {
                    var n = ligne.nextElementSibling;
                    while (n && n.classList.contains('adm-ui')) n = n.nextElementSibling;
                    if (n) ligne.parentNode.insertBefore(n, ligne);
                }),
                outil('⧉', 'Dupliquer', function () { dupliquer(ligne, corpsEl); })
            ];
            if (ligne.tagName === 'LI') b.push(outil('＋', 'Ajouter un sous-élément', function () { sousElement(ligne, corpsEl); }));
            b.push(outil('✕', 'Supprimer', function () {
                if (window.confirm('Supprimer cet élément ?')) { ligne.remove(); rafraichirProgression(); }
            }, true));
            var outils = conteneurOutils(b);
            var sousListe = ligne.querySelector(':scope > ul');
            ligne.insertBefore(outils, sousListe);
        });
        corpsEl.querySelectorAll('a[href]').forEach(function (a) {
            if (a.nextElementSibling && a.nextElementSibling.classList.contains('adm-link-tool')) return;
            var o = conteneurOutils([outil('🔗', 'Modifier le lien', function () { editerLien(a); })]);
            o.classList.add('adm-link-tool');
            a.parentNode.insertBefore(o, a.nextSibling);
        });
    }

    function barre(n, corpsEl) {
        var bar = document.createElement('div');
        bar.className = 'adm-ui adm-bar';
        var etat = document.createElement('div');
        etat.className = 'adm-state';
        etat.textContent = 'Mode administrateur : cliquez dans le texte pour le modifier.';
        function ajouter(html) {
            corpsEl.insertAdjacentHTML('beforeend', html);
            decorer(corpsEl);
        }
        function b(txt, cls, fn) {
            var x = document.createElement('button');
            x.type = 'button';
            x.textContent = txt;
            if (cls) x.className = cls;
            x.addEventListener('click', fn);
            bar.appendChild(x);
        }
        b('+ Rubrique', '', function () {
            ajouter('<p><strong>Nouvelle rubrique</strong></p><ul class="dossier-list"></ul>');
        });
        b('+ Sous-rubrique', '', function () {
            ajouter('<ul><li><strong>Nouvelle sous-rubrique</strong><ul><li><span>Nouvel élément</span> <a href="https://" class="doc-link" target="_blank" rel="noopener noreferrer">Ouvrir</a></li></ul></li></ul>');
        });
        b('+ Lien', '', function () {
            ajouter('<ul><li><span>Nouveau lien</span> <a href="https://" class="doc-link" target="_blank" rel="noopener noreferrer">Ouvrir</a></li></ul>');
        });
        b('Enregistrer', 'adm-save', function () { enregistrer(etat); });
        b('Annuler', '', function () { quitter(true); });
        b('Valeurs d\'origine', 'adm-danger', function () { reinitialiser(n, etat); });
        bar.appendChild(etat);
        return bar;
    }

    function entrer() {
        adminActif = true;
        document.body.classList.add('adm-on');
        bouton.textContent = '✏️ Quitter l\'admin';
        MODULES.forEach(function (n) {
            var c = corps(n);
            if (!c) return;
            c.insertAdjacentElement('beforebegin', barre(n, c));
            decorer(c);
        });
    }

    function quitter(restaurer) {
        adminActif = false;
        document.body.classList.remove('adm-on');
        if (bouton) bouton.textContent = '✏️ Mode admin';
        document.querySelectorAll('.adm-bar').forEach(function (n) { n.remove(); });
        MODULES.forEach(function (n) {
            var c = corps(n);
            if (!c) return;
            c.removeAttribute('contenteditable');
            if (restaurer) appliquer(n, courant[n]);
            else c.querySelectorAll('.adm-ui').forEach(function (x) { x.remove(); });
        });
        rafraichirProgression();
    }

    function enregistrer(etat) {
        var lignes = [];
        MODULES.forEach(function (n) {
            var c = corps(n);
            if (!c) return;
            var html = nettoye(c);
            if (html !== courant[n]) lignes.push({ module_id: n, html: html });
        });
        if (!lignes.length) { etat.className = 'adm-state'; etat.textContent = 'Aucune modification.'; return; }
        etat.className = 'adm-state';
        etat.textContent = 'Enregistrement…';
        api('doctrine_content?on_conflict=module_id', {
            methode: 'POST', corps: lignes, prefer: 'resolution=merge-duplicates,return=minimal'
        }).then(function () {
            var cache = lireCache().filter(function (x) { return !lignes.some(function (l) { return l.module_id === String(x.module_id); }); });
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache.concat(lignes))); } catch (e) {}
            lignes.forEach(function (l) { courant[l.module_id] = l.html; });
            quitter(false);
        }).catch(function (err) {
            etat.className = 'adm-state err';
            etat.textContent = messageErreur(err);
        });
    }

    function reinitialiser(n, etat) {
        if (!window.confirm('Rétablir le contenu d\'origine du module ' + n + ' pour tous les utilisateurs ?')) return;
        api('doctrine_content?module_id=eq.' + n, { methode: 'DELETE', prefer: 'return=minimal' }).then(function () {
            var cache = lireCache().filter(function (x) { return String(x.module_id) !== n; });
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
            quitter(false);
            appliquer(n, defauts[n]);
            rafraichirProgression();
        }).catch(function (err) {
            etat.className = 'adm-state err';
            etat.textContent = messageErreur(err);
        });
    }

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function construireSuivi() {
        if (suiviDialogue) return;
        suiviDialogue = element('section', 'adm-views');
        suiviDialogue.id = 'adm-views';
        suiviDialogue.hidden = true;
        suiviDialogue.setAttribute('role', 'dialog');
        suiviDialogue.setAttribute('aria-modal', 'true');
        suiviDialogue.setAttribute('aria-labelledby', 'adm-views-title');

        var carte = element('div', 'adm-views-card');
        var entete = element('header', 'adm-views-header');
        var titres = element('div');
        titres.appendChild(element('h2', '', 'Historique des ouvertures'));
        titres.lastChild.id = 'adm-views-title';
        titres.appendChild(element('p', '', 'Chaque ligne correspond à un clic sur un document externe, pas à une preuve de lecture.'));
        var actions = element('div', 'adm-views-actions');
        suiviActualiser = element('button', 'adm-views-close', 'Actualiser');
        suiviActualiser.type = 'button';
        suiviActualiser.addEventListener('click', function() {
            consultations = [];
            consultationsOffset = 0;
            consultationsCompletes = false;
            suiviPlus.hidden = true;
            chargerConsultations();
        });
        var fermer = element('button', 'adm-views-close', 'Fermer');
        fermer.type = 'button';
        fermer.addEventListener('click', fermerSuivi);
        actions.append(suiviActualiser, fermer);
        entete.append(titres, actions);

        suiviRecherche = document.createElement('input');
        suiviRecherche.type = 'search';
        suiviRecherche.placeholder = 'Filtrer les événements chargés par candidat, module ou document';
        suiviRecherche.setAttribute('aria-label', 'Filtrer les consultations affichées');
        suiviRecherche.addEventListener('input', afficherConsultations);
        suiviEtat = element('p', 'adm-views-status', 'Chargement de l’historique…');
        suiviEtat.setAttribute('role', 'status');

        var tableauWrap = element('div', 'adm-views-table-wrap');
        var tableau = document.createElement('table');
        var thead = document.createElement('thead');
        var ligneEntete = document.createElement('tr');
        ['Candidat', 'Module', 'Document', 'Ouverture'].forEach(function(titre) {
            ligneEntete.appendChild(element('th', '', titre));
        });
        thead.appendChild(ligneEntete);
        suiviBody = document.createElement('tbody');
        tableau.append(thead, suiviBody);
        tableauWrap.appendChild(tableau);

        suiviPlus = element('button', 'adm-views-more', 'Charger les ouvertures précédentes');
        suiviPlus.type = 'button';
        suiviPlus.hidden = true;
        suiviPlus.addEventListener('click', chargerConsultations);

        carte.append(entete, suiviRecherche, suiviEtat, tableauWrap, suiviPlus);
        suiviDialogue.appendChild(carte);
        suiviDialogue.addEventListener('click', function(event) {
            if (event.target === suiviDialogue) fermerSuivi();
        });
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && !suiviDialogue.hidden) fermerSuivi();
        });
        document.body.appendChild(suiviDialogue);
    }

    function afficherConsultations() {
        if (!suiviBody) return;
        var terme = suiviRecherche.value.trim().toLocaleLowerCase();
        var lignes = consultations.filter(function(ligne) {
            return [ligne.candidate_email, 'module ' + ligne.module_id, ligne.document_title, ligne.document_url]
                .join(' ').toLocaleLowerCase().indexOf(terme) !== -1;
        });
        suiviBody.replaceChildren();
        lignes.forEach(function(ligne) {
            var tr = document.createElement('tr');
            tr.appendChild(element('td', '', ligne.candidate_email));
            tr.appendChild(element('td', '', 'Module ' + ligne.module_id));
            var documentCell = document.createElement('td');
            var link = element('a', '', ligne.document_title);
            try {
                var url = new URL(ligne.document_url);
                if (url.protocol === 'https:' || url.protocol === 'http:') {
                    link.href = url.href;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                } else {
                    documentCell.textContent = ligne.document_title;
                }
            } catch (error) {
                documentCell.textContent = ligne.document_title;
            }
            if (link.href) documentCell.appendChild(link);
            tr.appendChild(documentCell);
            var date = new Date(ligne.opened_at);
            tr.appendChild(element('td', '', isNaN(date.getTime()) ? '' : date.toLocaleString('fr-FR')));
            suiviBody.appendChild(tr);
        });
        suiviEtat.textContent = lignes.length + ' événement(s) affiché(s), parmi ' + consultations.length +
            ' chargé(s). Le filtre porte sur les événements chargés.';
    }

    function chargerConsultations() {
        if (!auth() || !auth().estAdmin() || consultationsCompletes) return;
        suiviPlus.disabled = true;
        if (suiviActualiser) suiviActualiser.disabled = true;
        suiviEtat.textContent = 'Chargement des ouvertures…';
        var chemin = 'doctrine_document_views?select=candidate_email,module_id,document_title,document_url,opened_at' +
            '&order=opened_at.desc&limit=' + TAILLE_PAGE_CONSULTATIONS + '&offset=' + consultationsOffset;
        api(chemin).then(function(lignes) {
            consultations = consultations.concat(lignes);
            consultationsOffset += lignes.length;
            consultationsCompletes = lignes.length < TAILLE_PAGE_CONSULTATIONS;
            suiviPlus.hidden = consultationsCompletes;
            suiviPlus.disabled = false;
            if (suiviActualiser) suiviActualiser.disabled = false;
            afficherConsultations();
            if (!consultations.length) suiviEtat.textContent = 'Aucune ouverture enregistrée pour le moment.';
        }).catch(function(err) {
            suiviPlus.disabled = false;
            if (suiviActualiser) suiviActualiser.disabled = false;
            suiviEtat.textContent = 'Impossible de charger l’historique : ' + messageErreur(err, 'doctrine_document_views');
        });
    }

    function ouvrirSuivi() {
        construireSuivi();
        suiviDialogue.hidden = false;
        suiviRecherche.focus();
        if (!consultations.length && !consultationsCompletes) chargerConsultations();
    }

    function fermerSuivi() {
        if (suiviDialogue) suiviDialogue.hidden = true;
        if (suiviBouton) suiviBouton.focus();
    }

    function montrerSuiviBouton() {
        if (!auth() || !auth().estAdmin()) return;
        if (!suiviBouton) {
            suiviBouton = element('button', '', '📊 Suivi des consultations');
            suiviBouton.id = 'adm-views-toggle';
            suiviBouton.type = 'button';
            suiviBouton.addEventListener('click', ouvrirSuivi);
            document.body.appendChild(suiviBouton);
        }
        suiviBouton.hidden = false;
    }

    function afficherErreurSuivi(message) {
        var statut = document.getElementById('document-view-status');
        if (!statut) {
            statut = element('p', 'document-view-status');
            statut.id = 'document-view-status';
            statut.setAttribute('role', 'status');
            statut.setAttribute('aria-live', 'polite');
            document.body.appendChild(statut);
        }
        statut.textContent = message;
        statut.hidden = false;
        window.clearTimeout(statut.timer);
        statut.timer = window.setTimeout(function() { statut.hidden = true; }, 8000);
    }

    function enregistrerOuverture(event) {
        if (document.body.classList.contains('adm-on') || (auth() && auth().estAdmin())) return;
        var target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        var link = target.closest('.mod-body a[href]');
        if (!link) return;
        var module = link.closest('.mod-body[data-mod]');
        if (!module) return;
        var url;
        try {
            url = new URL(link.href);
            if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin === window.location.origin) return;
        } catch (error) {
            return;
        }
        var ligne = link.closest('.dossier-item');
        var libelle = ligne && ligne.querySelector('label span:last-child');
        var titre = (libelle && libelle.textContent.trim()) || link.textContent.trim() || url.hostname;
        api('doctrine_document_views', {
            methode: 'POST',
            corps: [{
                module_id: module.getAttribute('data-mod'),
                document_title: titre.slice(0, 300),
                document_url: url.origin + url.pathname
            }],
            prefer: 'return=minimal',
            keepalive: true
        }).catch(function(err) {
            console.error('Échec de l’enregistrement de cette ouverture de document.', err);
            afficherErreurSuivi('Ouverture non enregistrée dans le suivi : ' + messageErreur(err, 'doctrine_document_views'));
        });
    }

    function montrerBouton() {
        if (!auth() || !auth().estAdmin()) return;
        if (!bouton) {
            bouton = document.createElement('button');
            bouton.id = 'adm-toggle';
            bouton.type = 'button';
            bouton.textContent = '✏️ Mode admin';
            bouton.addEventListener('click', function () {
                if (adminActif) quitter(true); else entrer();
            });
            document.body.appendChild(bouton);
        }
        bouton.hidden = false;
        montrerSuiviBouton();
    }

    function init() {
        MODULES.forEach(function (n) {
            var c = corps(n);
            if (c) defauts[n] = c.innerHTML;
        });
        construireDialogue();
        appliquerTout(lireCache());
        document.addEventListener('doctrine:login', function () {
            montrerBouton();
            charger();
        });
        document.addEventListener('doctrine:logout', function () {
            if (adminActif) quitter(true);
            if (bouton) bouton.hidden = true;
            if (suiviBouton) suiviBouton.hidden = true;
            if (suiviDialogue) fermerSuivi();
        });
        document.addEventListener('click', enregistrerOuverture);
        if (auth() && auth().estAdmin() && !document.documentElement.classList.contains('auth-locked')) {
            montrerBouton();
            charger();
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

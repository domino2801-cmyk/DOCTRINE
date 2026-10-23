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
                body: options && options.corps ? JSON.stringify(options.corps) : undefined
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

    function messageErreur(err) {
        if (err.code === 'PGRST205' || err.status === 404) return 'Table absente : exécutez supabase/doctrine-content.sql dans Supabase.';
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
        });
        if (auth() && auth().estAdmin() && !document.documentElement.classList.contains('auth-locked')) {
            montrerBouton();
            charger();
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

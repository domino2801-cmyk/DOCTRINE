/*
 * Interface administrateur DOCTRINE.
 * Le contenu des modules (.mod-body) est stocké dans la table Supabase « doctrine_content ».
 * Le rôle admin lu dans le JWT n'affiche que l'interface : la RLS Supabase décide des écritures.
 */
(function () {
    'use strict';

    var CACHE_KEY = 'doctrine-content';
    var MODULES = ['1', '2', '3', '4', '5', '6', '7'];
    var defauts = {};
    var blocsEtude = [];
    var SELECTEUR_ETUDE = '.dossier-difficulty-filter, .difficulty-scale, .dossier-recommendation';
    var courant = {};
    var referenceEdition = {};
    var adminActif = false;
    var filtreAvantAdmin = null;
    var suiviDialogue;
    var suiviBody;
    var suiviEtat;
    var suiviRecherche;
    var suiviActualiser;
    var suiviPlus;
    var suiviRetour;
    var suiviTitre;
    var suiviEntete;
    var suiviCandidat = null;
    var suiviCandidatNom = '';
    var suiviDeclencheur;
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
        c.querySelectorAll(SELECTEUR_ETUDE).forEach(function (n) { n.remove(); });
        c.querySelectorAll('.dossier-item[hidden]').forEach(function (n) { n.removeAttribute('hidden'); });
        // État recalculé par la page à chaque chargement : il ne doit pas être publié
        c.querySelectorAll('.dossier-item').forEach(function (ligne) {
            Array.prototype.slice.call(ligne.classList).forEach(function (nom) {
                if (nom === 'study-tracked-item' || nom === 'completed' || nom.indexOf('study-status-') === 0) ligne.classList.remove(nom);
            });
            if (!ligne.getAttribute('class')) ligne.removeAttribute('class');
            var label = ligne.querySelector(':scope > label');
            ligne.querySelectorAll(':scope > input[data-dossier], :scope > input[data-corrige]').forEach(function (box) {
                box.removeAttribute('hidden');
                if (label) label.insertBefore(box, label.firstChild);
            });
        });
        c.querySelectorAll('.progress-bar').forEach(function (barre) {
            barre.style.removeProperty('width');
            if (!barre.getAttribute('style')) barre.removeAttribute('style');
        });
        return assainir(c.innerHTML);
    }

    function specialtyCode(label) {
        var normalized = String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .trim().toLocaleUpperCase();
        var aliases = {
            'MATERIEL': 'MAI',
            'GENIE': 'GEN',
            'EPMS': 'EPS',
            'RENSEIGNEMENT': 'RENS'
        };
        var code = normalized.match(/^([A-Z]+)(?:\s*[-(]|\s|$)/);
        var prefix = code ? code[1] : normalized;
        if (aliases[prefix]) return aliases[prefix];
        return ['INF', 'BLD', 'ART', 'GEN', 'AER', 'EMP', 'SIC', 'CYB', 'RENS', 'ADM', 'GRH', 'PBF', 'MVT', 'MAI', 'COM', 'RHL', 'EPS', 'SAN', 'FSP', 'EMIA'].indexOf(prefix) !== -1
            ? prefix
            : '';
    }

    function assurerSpecialitesModule6(html) {
        var contenu = document.createElement('template');
        contenu.innerHTML = html;
        if (contenu.content.querySelector('[data-specialty-row]')) return contenu.innerHTML;

        var cible = Array.from(contenu.content.querySelectorAll('.section-title'))
            .find(function (titre) { return titre.textContent.trim().startsWith('6.3.'); });
        var modele = document.createElement('template');
        modele.innerHTML = defauts['6'] || '';
        var modeleTitre = Array.from(modele.content.querySelectorAll('.section-title'))
            .find(function (titre) { return titre.textContent.trim().startsWith('6.3.'); });
        if (!cible || !modeleTitre) return contenu.innerHTML;

        var ancienneSection = cible.closest('li');
        var nouvelleSection = modeleTitre.closest('li');
        if (!ancienneSection || !nouvelleSection) return contenu.innerHTML;

        var ressources = new Map();
        ancienneSection.querySelectorAll('.align-row').forEach(function (ligne) {
            var libelle = ligne.querySelector('.row-text');
            var lien = ligne.querySelector('a[href]');
            var code = specialtyCode(libelle && libelle.textContent);
            if (code && lien) ressources.set(code, lien.cloneNode(true));
        });

        var sectionCandidate = nouvelleSection.cloneNode(true);
        sectionCandidate.querySelectorAll('[data-specialty-row]').forEach(function (ligne) {
            var code = ligne.getAttribute('data-specialty');
            var ressource = ressources.get(code);
            if (!ressource) return;
            ressource.className = 'doc-link';
            ressource.target = '_blank';
            ressource.rel = 'noopener noreferrer';
            var enAttente = ligne.querySelector('.resource-pending');
            if (enAttente) enAttente.replaceWith(ressource);
            else {
                var ancienLien = ligne.querySelector('a.doc-link');
                if (ancienLien) ancienLien.replaceWith(ressource);
            }
        });

        ancienneSection.replaceWith(sectionCandidate);
        return contenu.innerHTML;
    }

    function appliquer(n, html) {
        var el = corps(n);
        if (!el) return;
        var correctionGate = n === '4' && el.querySelector('#correctionGate');
        if (correctionGate) correctionGate.remove();
        el.innerHTML = assainir(n === '6' ? assurerSpecialitesModule6(html) : html);
        if (n === '4') {
            el.querySelectorAll('li').forEach(function (ligne) {
                var texte = ligne.querySelector(':scope > span');
                if (texte && texte.textContent.trim() === 'Décryptage de la commande et extraction des faits (Dossiers 1 à 16).') {
                    var liste = ligne.parentElement;
                    ligne.remove();
                    if (liste && !liste.querySelector('li')) liste.remove();
                }
            });
        }
        if (n === '3') assurerOutilsEtude(el);
        if (correctionGate) {
            var storedGate = el.querySelector('#correctionGate');
            if (storedGate) storedGate.remove();
            var heading = Array.from(el.querySelectorAll('p > strong')).find(function (element) {
                return element.textContent.trim().startsWith('4.2.');
            });
            if (heading) heading.closest('p').after(correctionGate);
            else el.appendChild(correctionGate);
        }
        courant[n] = nettoye(el);
        if (n === '1' || n === '4' || n === '6') {
            document.dispatchEvent(new CustomEvent('doctrine:content-updated', { detail: { moduleId: n } }));
        }
    }

    function assurerOutilsEtude(el) {
        var liste = el.querySelector('.dossier-list');
        if (liste && !liste.id) liste.id = 'studyDossierList';
        var titreOutil = Array.from(el.querySelectorAll('p > strong')).find(function (s) {
            return s.textContent.trim().indexOf('3.2.') === 0;
        });
        var depart = titreOutil && titreOutil.parentElement;
        var lienOutil = null;
        for (var voisin = depart && depart.nextElementSibling; voisin && !lienOutil; voisin = voisin.nextElementSibling) {
            lienOutil = voisin.matches('a.doc-link') ? voisin : voisin.querySelector('a.doc-link');
        }
        if (lienOutil && !lienOutil.closest('.outil-redaction')) {
            var noeuds;
            var conteneur = lienOutil.parentElement;
            if (conteneur === el) {
                noeuds = [];
                for (var m = depart.nextSibling; m; m = m.nextSibling) {
                    noeuds.push(m);
                    if (m === lienOutil) break;
                }
            } else {
                while (conteneur.parentElement !== el && /^(LI|UL|OL)$/.test(conteneur.parentElement.tagName)) conteneur = conteneur.parentElement;
                noeuds = [conteneur];
            }
            var libelle = noeuds.filter(function (nd) { return nd !== lienOutil; }).map(function (nd) {
                var copie = nd.cloneNode(true);
                if (copie.querySelectorAll) copie.querySelectorAll('a.doc-link').forEach(function (a) { a.remove(); });
                return copie.textContent;
            }).join(' ').replace(/\s+/g, ' ').trim();
            var carteOutil = document.createElement('div');
            carteOutil.className = 'outil-redaction';
            var texteOutil = document.createElement('span');
            texteOutil.textContent = libelle;
            noeuds[0].parentNode.insertBefore(carteOutil, noeuds[0]);
            carteOutil.appendChild(texteOutil);
            carteOutil.appendChild(lienOutil);
            noeuds.forEach(function (nd) { if (nd !== lienOutil) nd.remove(); });
        }
        if (!blocsEtude.length || el.querySelector('#dossierDifficultyFilter')) return;
        var ancre = el.querySelector('.progress-container') || liste;
        blocsEtude.forEach(function (bloc) {
            var copie = bloc.cloneNode(true);
            if (ancre) ancre.parentNode.insertBefore(copie, ancre);
            else el.appendChild(copie);
        });
    }

    function rafraichirProgression() {
        if (typeof window.bm4RefreshProgress === 'function') window.bm4RefreshProgress();
    }

    function appliquerTout(lignes) {
        if (!Array.isArray(lignes)) {
            console.error('Cache administrateur invalide : une liste de contenus était attendue.');
            lignes = [];
        }
        MODULES.forEach(function (n) {
            var l = lignes.filter(function (x) { return x && String(x.module_id) === n; })[0];
            appliquer(n, l ? l.html : defauts[n]);
        });
        rafraichirProgression();
    }

    function lireCache() {
        var contenu;
        try {
            contenu = localStorage.getItem(CACHE_KEY);
        } catch (e) {
            console.error('Impossible de lire le cache administrateur.', e);
            return [];
        }
        if (contenu === null) return [];
        try {
            var lignes = JSON.parse(contenu);
            if (Array.isArray(lignes)) return lignes;
            console.error('Cache administrateur invalide : une liste de contenus était attendue.');
        } catch (e) {
            console.error('Cache administrateur illisible : le JSON est invalide.', e);
        }
        return [];
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
            if (!Array.isArray(lignes)) {
                console.error('Réponse invalide de doctrine_content : une liste de contenus était attendue.');
                return;
            }
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

    function ajouterRessourceSpecialite(ligne) {
        var placeholder = ligne.querySelector('.resource-pending');
        if (!placeholder) return;

        var texte = dialogue.querySelector('#adm-d-texte');
        var url = dialogue.querySelector('#adm-d-url');
        var err = dialogue.querySelector('#adm-d-err');
        var form = dialogue.querySelector('form');
        texte.value = 'Ouvrir';
        url.value = '';
        err.textContent = '';
        dialogue.hidden = false;
        url.focus();

        function fermer() {
            dialogue.hidden = true;
            form.onsubmit = null;
            dialogue.querySelector('#adm-d-annuler').onclick = null;
        }

        dialogue.querySelector('#adm-d-annuler').onclick = fermer;
        form.onsubmit = function (event) {
            event.preventDefault();
            var adresse = url.value.trim();
            var parsed;
            try { parsed = new URL(adresse); } catch (e) { parsed = null; }
            if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
                err.textContent = 'Saisissez une adresse complète commençant par https:// ou http://.';
                return;
            }

            var lien = document.createElement('a');
            lien.className = 'doc-link';
            lien.href = parsed.href;
            lien.target = '_blank';
            lien.rel = 'noopener noreferrer';
            lien.textContent = texte.value.trim() || 'Ouvrir';
            placeholder.replaceWith(lien);
            fermer();
            decorer(corps('6'));
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

    function outilDifficulte(ligne) {
        var etoiles = ligne.querySelector('.stars');
        var actuel = etoiles ? (etoiles.textContent.match(/★/g) || []).length : 0;
        var select = document.createElement('select');
        select.title = 'Difficulté (étoiles)';
        select.setAttribute('aria-label', 'Difficulté (étoiles)');
        if (!actuel) select.add(new Option('Difficulté…', ''));
        [1, 2, 3, 4].forEach(function (n) { select.add(new Option(new Array(n + 1).join('★'), String(n))); });
        select.value = actuel ? String(actuel) : '';
        select.addEventListener('change', function () {
            var n = parseInt(select.value, 10);
            if (!n) return;
            var cible = ligne.querySelector('.stars');
            if (!cible) {
                cible = document.createElement('span');
                cible.className = 'stars';
                var zone = ligne.querySelector(':scope > div') || ligne;
                zone.insertBefore(cible, zone.firstChild);
            }
            cible.textContent = new Array(n + 1).join('★');
            rafraichirProgression();
        });
        return select;
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
        var correctionGate = corpsEl.querySelector('#correctionGate');
        if (correctionGate) correctionGate.contentEditable = 'false';
        corpsEl.querySelectorAll('li, .align-row, .dossier-item').forEach(function (ligne) {
            if (ligne.closest('.difficulty-scale')) return;
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
            if (corpsEl.dataset.mod === '6' && ligne.matches('[data-specialty-row]') &&
                ligne.querySelector('.resource-pending')) {
                b.push(outil('+ Ressource', 'Ajouter une ressource à cette spécialité', function () {
                    ajouterRessourceSpecialite(ligne);
                }));
            }
            if (ligne.tagName === 'LI') b.push(outil('＋', 'Ajouter un sous-élément', function () { sousElement(ligne, corpsEl); }));
            if (ligne.classList.contains('dossier-item') && ligne.querySelector('input[data-dossier]')) b.push(outilDifficulte(ligne));
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
        etat.textContent = 'Admin : cliquez dans le texte pour le modifier.';
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
        b('⬇ Sauvegarde', '', function () { exporterSauvegarde(etat); });
        b('⬆ Restaurer', '', function () { choisirSauvegarde(etat); });
        bar.appendChild(etat);
        return bar;
    }

    function entrer() {
        adminActif = true;
        document.body.classList.add('adm-on');
        document.dispatchEvent(new CustomEvent('doctrine:admin-mode', { detail: { active: true } }));
        var filtre =  document.getElementById('dossierDifficultyFilter');
        filtreAvantAdmin = filtre ? filtre.value : null;
        if (filtre && filtre.value) {
            filtre.value = '';
            filtre.dispatchEvent(new Event('change', { bubbles: true }));
        }
        MODULES.forEach(function (n) {
            var c = corps(n);
            if (!c) return;
            referenceEdition[n] = nettoye(c);
            c.insertAdjacentElement('beforebegin', barre(n, c));
            decorer(c);
        });
        majVisibiliteOutils();
    }

    function quitter(restaurer) {
        adminActif = false;
        document.body.classList.remove('adm-on');
        document.dispatchEvent(new CustomEvent('doctrine:admin-mode', { detail: { active: false } }));
        document.querySelectorAll('.adm-bar').forEach(function (n) { n.remove(); });
        MODULES.forEach(function (n) {
            var c = corps(n);
            if (!c) return;
            c.removeAttribute('contenteditable');
            if (restaurer) appliquer(n, courant[n]);
            else c.querySelectorAll('.adm-ui:not(#correctionGate)').forEach(function (x) { x.remove(); });
        });
        rafraichirProgression();
        var filtreSortie = document.getElementById('dossierDifficultyFilter');
        if (filtreSortie && filtreAvantAdmin !== null) {
            filtreSortie.value = filtreAvantAdmin;
            filtreSortie.dispatchEvent(new Event('change', { bubbles: true }));
        }
        filtreAvantAdmin = null;
        majVisibiliteOutils();
    }

    function enregistrer(etat) {
        var lignes = [];
        MODULES.forEach(function (n) {
            var c = corps(n);
            if (!c) return;
            var html = nettoye(c);
            if (html !== referenceEdition[n]) lignes.push({ module_id: n, html: html });
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

    var TAILLE_MAX_SAUVEGARDE = 2 * 1024 * 1024;

    function telechargerFichier(nom, texte) {
        var url = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
        var a = document.createElement('a');
        a.href = url;
        a.download = nom;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function exporterSauvegarde(etat) {
        etat.className = 'adm-state';
        etat.textContent = 'Préparation de la sauvegarde…';
        api('doctrine_content?select=module_id,html').then(function (lignes) {
            if (!Array.isArray(lignes)) throw new Error('Réponse invalide du serveur.');
            var modules = lignes.filter(function (l) { return l && MODULES.indexOf(String(l.module_id)) !== -1; })
                .map(function (l) { return { module_id: String(l.module_id), html: String(l.html || '') }; });
            var contenu = { format: 'doctrine-content', version: 1, exporte_le: new Date().toISOString(), modules: modules };
            telechargerFichier('doctrine-sauvegarde-' + contenu.exporte_le.slice(0, 10) + '.json', JSON.stringify(contenu, null, 2));
            etat.textContent = modules.length
                ? 'Sauvegarde téléchargée (' + modules.length + ' module(s) personnalisé(s)).'
                : 'Aucun module personnalisé : le fichier téléchargé est vide.';
        }).catch(function (err) {
            etat.className = 'adm-state err';
            etat.textContent = messageErreur(err);
        });
    }

    function lireSauvegarde(texte) {
        var donnees;
        try { donnees = JSON.parse(texte); } catch (e) { throw new Error('Fichier illisible : JSON invalide.'); }
        if (!donnees || donnees.format !== 'doctrine-content' || !Array.isArray(donnees.modules)) {
            throw new Error('Ce fichier n\'est pas une sauvegarde DOCTRINE.');
        }
        var vus = {};
        return donnees.modules.map(function (l) {
            var id = l && String(l.module_id);
            if (MODULES.indexOf(id) === -1 || typeof l.html !== 'string' || vus[id]) {
                throw new Error('Sauvegarde invalide : module ou contenu incorrect.');
            }
            vus[id] = true;
            return { module_id: id, html: l.html };
        });
    }

    function restaurerSauvegarde(lignes, etat) {
        if (!lignes.length) { etat.textContent = 'La sauvegarde ne contient aucun module.'; return; }
        var liste = lignes.map(function (l) { return l.module_id; }).join(', ');
        if (!window.confirm('Remplacer pour tous les utilisateurs le contenu des modules ' + liste + ' par cette sauvegarde ?\nLes modifications non enregistrées seront perdues.')) return;
        etat.textContent = 'Restauration…';
        api('doctrine_content?on_conflict=module_id', {
            methode: 'POST', corps: lignes, prefer: 'resolution=merge-duplicates,return=minimal'
        }).then(function () {
            var cache = lireCache().filter(function (x) { return !lignes.some(function (l) { return l.module_id === String(x.module_id); }); });
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache.concat(lignes))); } catch (e) {}
            quitter(false);
            lignes.forEach(function (l) { appliquer(l.module_id, l.html); });
            rafraichirProgression();
        }).catch(function (err) {
            etat.className = 'adm-state err';
            etat.textContent = messageErreur(err);
        });
    }

    function choisirSauvegarde(etat) {
        var champ = document.createElement('input');
        champ.type = 'file';
        champ.accept = '.json,application/json';
        champ.addEventListener('change', function () {
            var fichier = champ.files && champ.files[0];
            if (!fichier) return;
            etat.className = 'adm-state';
            if (fichier.size > TAILLE_MAX_SAUVEGARDE) {
                etat.className = 'adm-state err';
                etat.textContent = 'Fichier trop volumineux (2 Mo maximum).';
                return;
            }
            fichier.text().then(function (texte) {
                restaurerSauvegarde(lireSauvegarde(texte), etat);
            }).catch(function (err) {
                etat.className = 'adm-state err';
                etat.textContent = err.message;
            });
        });
        champ.click();
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
        suiviTitre = element('h2', '', 'Historique des consultations et téléchargements');
        suiviTitre.id = 'adm-views-title';
        titres.appendChild(suiviTitre);
        titres.appendChild(element('p', '', 'Les téléchargements correspondent à un clic sur un lien identifié comme téléchargement ; leur réussite ne peut pas être confirmée.'));
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

        suiviRetour = element('button', 'adm-views-close', '← Tous les candidats');
        suiviRetour.type = 'button';
        suiviRetour.hidden = true;
        suiviRetour.addEventListener('click', function() {
            suiviCandidat = null;
            suiviCandidatNom = '';
            suiviRecherche.value = '';
            afficherConsultations();
        });
        suiviRecherche = document.createElement('input');
        suiviRecherche.type = 'search';
        suiviRecherche.placeholder = 'Filtrer les candidats chargés';
        suiviRecherche.setAttribute('aria-label', 'Filtrer les événements affichés');
        suiviRecherche.addEventListener('input', afficherConsultations);
        suiviEtat = element('p', 'adm-views-status', 'Chargement de l’historique…');
        suiviEtat.setAttribute('role', 'status');

        var tableauWrap = element('div', 'adm-views-table-wrap');
        var tableau = document.createElement('table');
        var thead = document.createElement('thead');
        suiviEntete = document.createElement('tr');
        thead.appendChild(suiviEntete);
        suiviBody = document.createElement('tbody');
        tableau.append(thead, suiviBody);
        tableauWrap.appendChild(tableau);

        suiviPlus = element('button', 'adm-views-more', 'Charger les ouvertures précédentes');
        suiviPlus.type = 'button';
        suiviPlus.hidden = true;
        suiviPlus.addEventListener('click', chargerConsultations);

        carte.append(entete, suiviRetour, suiviRecherche, suiviEtat, tableauWrap, suiviPlus);
        suiviDialogue.appendChild(carte);
        suiviDialogue.addEventListener('click', function(event) {
            if (event.target === suiviDialogue) fermerSuivi();
        });
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && !suiviDialogue.hidden) fermerSuivi();
        });
        document.body.appendChild(suiviDialogue);
    }

    function formaterDate(valeur) {
        var date = new Date(valeur);
        return isNaN(date.getTime()) ? '' : date.toLocaleString('fr-FR');
    }

    function definirEntetes(titres) {
        suiviEntete.replaceChildren();
        titres.forEach(function(titre) { suiviEntete.appendChild(element('th', '', titre)); });
        suiviEntete.closest('table').classList.toggle('adm-views-candidates', suiviCandidat === null);
    }

    function identifiantCandidat(ligne) {
        if (ligne.user_id) return 'id:' + ligne.user_id;
        var email = String(ligne.candidate_email || '').trim().toLocaleLowerCase();
        return email ? 'email:' + email : 'email:(inconnu)';
    }

    function afficherCandidats() {
        var terme = suiviRecherche.value.trim().toLocaleLowerCase();
        var parCandidat = Object.create(null);
        consultations.forEach(function(ligne) {
            var email = ligne.candidate_email || '(inconnu)';
            var cle = identifiantCandidat(ligne);
            var c = parCandidat[cle] || (parCandidat[cle] = {
                key: cle, email: email, ouvertures: 0, telechargements: 0, derniere: ligne.opened_at
            });
            if (c.email === '(inconnu)' && email !== '(inconnu)') c.email = email;
            if (ligne.event_type === 'download') c.telechargements++; else c.ouvertures++;
            if (new Date(ligne.opened_at) > new Date(c.derniere)) c.derniere = ligne.opened_at;
        });
        var candidats = Object.keys(parCandidat).map(function(k) { return parCandidat[k]; })
            .filter(function(c) { return c.email.toLocaleLowerCase().indexOf(terme) !== -1; })
            .sort(function(a, b) { return new Date(b.derniere) - new Date(a.derniere); });

        suiviRetour.hidden = true;
        suiviTitre.textContent = 'Historique des consultations et téléchargements';
        suiviRecherche.placeholder = 'Filtrer les candidats chargés';
        definirEntetes(['Candidat']);
        suiviBody.replaceChildren();
        candidats.forEach(function(c) {
            var tr = document.createElement('tr');
            var cellule = document.createElement('td');
            var bouton = element('button', 'adm-views-name', c.email);
            bouton.type = 'button';
            bouton.title = 'Voir les consultations de ce candidat';
            bouton.addEventListener('click', function() {
                suiviCandidat = c.key;
                suiviCandidatNom = c.email;
                suiviRecherche.value = '';
                afficherConsultations();
            });
            cellule.appendChild(bouton);
            cellule.setAttribute('data-label', 'Candidat');
            tr.appendChild(cellule);
            suiviBody.appendChild(tr);
        });
        suiviEtat.textContent = candidats.length + ' candidat(s) affiché(s) (' + consultations.length +
            ' événement(s) chargé(s)). Cliquez sur un nom pour voir ses ouvertures et téléchargements.';
    }

    function afficherConsultations() {
        if (!suiviBody) return;
        if (suiviCandidat === null) return afficherCandidats();
        var terme = suiviRecherche.value.trim().toLocaleLowerCase();
        var lignes = consultations.filter(function(ligne) {
            if (identifiantCandidat(ligne) !== suiviCandidat) return false;
            return ['module ' + ligne.module_id, ligne.document_title, ligne.document_url, ligne.event_type]
                .join(' ').toLocaleLowerCase().indexOf(terme) !== -1;
        });
        suiviRetour.hidden = false;
        suiviTitre.textContent = 'Consultations de ' + suiviCandidatNom;
        suiviRecherche.placeholder = 'Filtrer par module ou document';
        definirEntetes(['Module', 'Document', 'Action', 'Date']);
        suiviBody.replaceChildren();
        lignes.forEach(function(ligne) {
            var tr = document.createElement('tr');
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
            tr.appendChild(element('td', '', ligne.event_type === 'download' ? 'Téléchargement (clic)' : 'Ouverture'));
            tr.appendChild(element('td', '', formaterDate(ligne.opened_at)));
            suiviBody.appendChild(tr);
        });
        var resume = { ouvertures: 0, telechargements: 0, derniere: null };
        consultations.forEach(function(ligne) {
            if (identifiantCandidat(ligne) !== suiviCandidat) return;
            if (ligne.event_type === 'download') resume.telechargements++; else resume.ouvertures++;
            if (!resume.derniere || new Date(ligne.opened_at) > new Date(resume.derniere)) resume.derniere = ligne.opened_at;
        });
        suiviEtat.textContent = 'Ouvertures : ' + resume.ouvertures + ' · Téléchargements : ' + resume.telechargements +
            ' · Dernière activité : ' + (resume.derniere ? formaterDate(resume.derniere) : '—') + '. ' +
            lignes.length + ' événement(s) affiché(s) parmi ' + consultations.length + ' chargé(s).';
    }

    function chargerConsultations() {
        if (!auth() || !auth().estAdmin() || consultationsCompletes) return;
        suiviPlus.disabled = true;
        if (suiviActualiser) suiviActualiser.disabled = true;
        suiviEtat.textContent = 'Chargement de l’historique…';
        var chemin = 'doctrine_document_views?select=user_id,candidate_email,module_id,document_title,document_url,event_type,opened_at' +
            '&order=opened_at.desc&limit=' + TAILLE_PAGE_CONSULTATIONS + '&offset=' + consultationsOffset;
        api(chemin).then(function(lignes) {
            consultations = consultations.concat(lignes);
            consultationsOffset += lignes.length;
            consultationsCompletes = lignes.length < TAILLE_PAGE_CONSULTATIONS;
            suiviPlus.hidden = consultationsCompletes;
            suiviPlus.disabled = false;
            if (suiviActualiser) suiviActualiser.disabled = false;
            afficherConsultations();
            if (!consultations.length) suiviEtat.textContent = 'Aucun événement enregistré pour le moment.';
        }).catch(function(err) {
            suiviPlus.disabled = false;
            if (suiviActualiser) suiviActualiser.disabled = false;
            suiviEtat.textContent = 'Impossible de charger l’historique : ' + messageErreur(err, 'doctrine_document_views');
        });
    }

    function ouvrirSuivi(event) {
        suiviDeclencheur = event && event.currentTarget;
        construireSuivi();
        suiviCandidat = null;
        suiviCandidatNom = '';
        suiviRecherche.value = '';
        afficherConsultations();
        suiviDialogue.hidden = false;
        suiviRecherche.focus();
        if (!consultations.length && !consultationsCompletes) chargerConsultations();
    }

    function fermerSuivi() {
        if (suiviDialogue) suiviDialogue.hidden = true;
        if (suiviDeclencheur && suiviDeclencheur.isConnected && !suiviDeclencheur.hidden) suiviDeclencheur.focus();
        suiviDeclencheur = null;
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

    function estLienTelechargement(link) {
        var libelle = [
            link.textContent,
            link.getAttribute('aria-label'),
            link.getAttribute('title')
        ].join(' ').toLowerCase();
        if (typeof libelle.normalize === 'function') {
            libelle = libelle.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }
        return link.hasAttribute('download') || /telecharg|download/.test(libelle);
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
        enregistrerEvenement(module.getAttribute('data-mod'), titre, url.origin + url.pathname,
            estLienTelechargement(link) ? 'download' : 'open');
    }

    function enregistrerEvenement(moduleId, titre, adresse, typeEvenement) {
        api('doctrine_document_views', {
            methode: 'POST',
            corps: [{
                module_id: moduleId,
                document_title: String(titre).slice(0, 300),
                document_url: adresse,
                event_type: typeEvenement
            }],
            prefer: 'return=minimal',
            keepalive: true
        }).catch(function(err) {
            console.error('Échec de l’enregistrement de cette ouverture de document.', err);
            afficherErreurSuivi('Ouverture non enregistrée dans le suivi : ' + messageErreur(err, 'doctrine_document_views'));
        });
    }

    function enregistrerTelechargement(event) {
        var d = event.detail || {};
        if (document.body.classList.contains('adm-on') || (auth() && auth().estAdmin())) return;
        if (!/^[1-7]$/.test(d.module || '') || !/^https?:\/\//.test(d.url || '') || !d.title) return;
        enregistrerEvenement(d.module, d.title, d.url, 'download');
    }

    // Les boutons admin ne sont proposés que sur l'accueil (aucun module ouvert), ou tant que le mode admin est actif.
    function moduleOuvert() {
        return Array.prototype.some.call(document.querySelectorAll('.modal'), function (m) {
            return m.style.display === 'block';
        });
    }

    function libelleAdmin() { return adminActif ? '✏️ Quitter l\'admin' : '✏️ Admin'; }

    function majBoutonsToolbar() {
        var visible = !!(auth() && auth().estAdmin());
        document.querySelectorAll('.module-nav-controls').forEach(function (zone) {
            var b = zone.querySelector('.adm-toolbar-toggle');
            var suivi = zone.querySelector('.adm-views-toolbar-toggle');
            if (!b && visible) {
                b = document.createElement('button');
                b.type = 'button';
                b.className = 'module-nav-button adm-toolbar-toggle';
                b.addEventListener('click', function () {
                    if (adminActif) quitter(true); else entrer();
                });
                zone.appendChild(b);
            }
            if (!suivi && visible) {
                suivi = document.createElement('button');
                suivi.type = 'button';
                suivi.className = 'module-nav-button adm-views-toolbar-toggle';
                suivi.textContent = '📊 Suivi';
                suivi.title = 'Suivi des consultations';
                suivi.setAttribute('aria-label', 'Suivi des consultations');
                suivi.addEventListener('click', ouvrirSuivi);
                zone.appendChild(suivi);
            }
            [['signalements', '🚩 Signal'], ['retex', '📝 RETEX']].forEach(function (def) {
                var classe = 'adm-fiches-toolbar-' + def[0];
                var bouton = zone.querySelector('.' + classe);
                if (!bouton && visible) {
                    bouton = document.createElement('button');
                    bouton.type = 'button';
                    bouton.className = 'module-nav-button ' + classe;
                    bouton.textContent = def[1];
                    bouton.title = def[0] === 'retex' ? 'Synthèse des RETEX' : 'Signalements des candidats';
                    bouton.addEventListener('click', function () {
                        document.dispatchEvent(new CustomEvent('doctrine:admin-fiches', { detail: def[0] }));
                    });
                    zone.appendChild(bouton);
                }
                if (bouton) bouton.hidden = !visible;
            });
            if (b) {
                b.hidden = !visible;
                b.textContent = libelleAdmin();
            }
            if (suivi) suivi.hidden = !visible;
        });
    }

    function majVisibiliteOutils() {
        var estAdmin = !!(auth() && auth().estAdmin());
        majBoutonsToolbar();
        if (!estAdmin && suiviDialogue && !suiviDialogue.hidden) fermerSuivi();
    }

    function surveillerModales() {
        document.querySelectorAll('.modal').forEach(function (modale) {
            if (modale.dataset.admSurveille) return;
            modale.dataset.admSurveille = '1';
            new MutationObserver(majVisibiliteOutils).observe(modale, { attributes: true, attributeFilter: ['style'] });
        });
    }

    function montrerBouton() {
        if (!auth() || !auth().estAdmin()) return;
        surveillerModales();
        majVisibiliteOutils();
    }

    function init() {
        MODULES.forEach(function (n) {
            var c = corps(n);
            if (c) defauts[n] = c.innerHTML;
        });
        construireDialogue();
        if (defauts['3']) {
            var modele = document.createElement('template');
            modele.innerHTML = defauts['3'];
            blocsEtude = Array.prototype.slice.call(modele.content.querySelectorAll(SELECTEUR_ETUDE));
        }
        appliquerTout(lireCache());
        document.addEventListener('doctrine:login', function () {
            montrerBouton();
            charger();
        });
        document.addEventListener('doctrine:logout', function () {
            if (adminActif) quitter(true);
            majBoutonsToolbar();
            if (suiviDialogue) fermerSuivi();
        });
        document.addEventListener('click', enregistrerOuverture);
        document.addEventListener('doctrine:download', enregistrerTelechargement);
        if (auth() && auth().estAdmin() && !document.documentElement.classList.contains('auth-locked')) {
            montrerBouton();
            charger();
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

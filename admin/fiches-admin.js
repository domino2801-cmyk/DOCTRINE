(function () {
    'use strict';

    var COULEURS = ['#4f7a4f', '#c9a227', '#2f6fa3', '#a33a3a', '#7b5ea7', '#3a9a8f', '#d9822b', '#777777'];
    var NOMS_MODULES = {
        '1': 'Module 1', '2': 'Module 2', '3': 'Module 3', '4': 'Module 4',
        '5': 'Module 5', '6': 'Module 6', '7': 'Module 7', general: 'Application'
    };
    var TAILLE_PAGE = 1000;

    var dialogue, titre, sousTitre, corps, etat, actions, mode = null;
    var signalements = [], synthese = null;
    var filtreStatut = 'pending';

    function auth() { return window.DoctrineAuth; }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function api(chemin, options) {
        return auth().jeton().then(function (jeton) {
            if (!jeton) throw Object.assign(new Error('Session expirée'), { status: 401 });
            return fetch(auth().url + '/rest/v1/' + chemin, {
                method: (options && options.methode) || 'GET',
                headers: {
                    apikey: auth().key,
                    Authorization: 'Bearer ' + jeton,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                },
                body: options && options.corps ? JSON.stringify(options.corps) : undefined
            });
        }).then(function (r) {
            if (r.ok) return r.status === 204 ? [] : r.json().catch(function () { return []; });
            return r.json().catch(function () { return {}; }).then(function (d) {
                throw Object.assign(new Error(d.message || 'HTTP ' + r.status), { status: r.status, code: d.code || '' });
            });
        });
    }

    function messageErreur(err) {
        if (err.code === 'PGRST205' || err.status === 404) return 'Table absente : exécutez supabase/retex-signalements.sql dans Supabase.';
        if (err.status === 401 || err.status === 403 || err.code === '42501') return 'Droits insuffisants : compte non administrateur.';
        if (!navigator.onLine || err instanceof TypeError) return 'Hors ligne : chargement impossible.';
        return 'Erreur : ' + err.message;
    }

    function formaterDate(valeur) {
        var date = new Date(valeur);
        return isNaN(date.getTime()) ? '' : date.toLocaleString('fr-FR');
    }

    function formaterJour(date) {
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function construire() {
        if (dialogue) return;
        dialogue = el('section', 'adm-views adm-fiches');
        dialogue.id = 'adm-fiches';
        dialogue.hidden = true;
        dialogue.setAttribute('role', 'dialog');
        dialogue.setAttribute('aria-modal', 'true');
        dialogue.setAttribute('aria-labelledby', 'adm-fiches-title');

        var carte = el('div', 'adm-views-card');
        var entete = el('header', 'adm-views-header');
        var bloc = el('div');
        titre = el('h2');
        titre.id = 'adm-fiches-title';
        sousTitre = el('p');
        bloc.append(titre, sousTitre);
        actions = el('div', 'adm-views-actions adm-fiches-noprint');
        entete.append(bloc, actions);

        etat = el('p', 'adm-views-status adm-fiches-noprint');
        etat.setAttribute('role', 'status');
        corps = el('div', 'adm-fiches-body');

        carte.append(entete, etat, corps);
        dialogue.appendChild(carte);
        dialogue.addEventListener('click', function (event) {
            if (event.target === dialogue) fermer();
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && !dialogue.hidden) fermer();
        });
        document.body.appendChild(dialogue);
    }

    function bouton(libelle, action) {
        var b = el('button', 'adm-views-close', libelle);
        b.type = 'button';
        b.addEventListener('click', action);
        return b;
    }

    function fermer() {
        if (dialogue) dialogue.hidden = true;
        mode = null;
    }

    function ouvrir(quel) {
        if (!auth() || !auth().estAdmin()) return;
        construire();
        mode = quel;
        dialogue.hidden = false;
        if (quel === 'signalements') chargerSignalements();
        else chargerRetex();
    }

    /* ---------- Signalements ---------- */
    function chargerSignalements() {
        titre.textContent = 'Signalements';
        sousTitre.textContent = 'Anomalies remontées par les candidats depuis la fiche 7.2.';
        actions.replaceChildren(bouton('Actualiser', chargerSignalements), bouton('Fermer', fermer));
        corps.replaceChildren();
        etat.textContent = 'Chargement des signalements…';
        api('doctrine_signalements?select=id,candidate_email,incident_type,module_id,resource,details,priority,status,created_at' +
            '&order=created_at.desc&limit=' + TAILLE_PAGE).then(function (lignes) {
            signalements = Array.isArray(lignes) ? lignes : [];
            afficherSignalements();
        }).catch(function (err) {
            etat.textContent = messageErreur(err);
        });
    }

    function afficherSignalements() {
        if (mode !== 'signalements') return;
        corps.replaceChildren();

        var barre = el('div', 'adm-fiches-filtre');
        var label = el('label', '', 'Statut');
        label.setAttribute('for', 'adm-fiches-statut');
        var select = document.createElement('select');
        select.id = 'adm-fiches-statut';
        [['pending', 'À traiter'], ['resolved', 'Traités'], ['all', 'Tous']].forEach(function (o) {
            var opt = el('option', '', o[1]);
            opt.value = o[0];
            select.appendChild(opt);
        });
        select.value = filtreStatut;
        select.addEventListener('change', function () {
            filtreStatut = select.value;
            afficherSignalements();
        });
        barre.append(label, select);

        var lignes = signalements.filter(function (s) { return filtreStatut === 'all' || s.status === filtreStatut; });
        var enAttente = signalements.filter(function (s) { return s.status === 'pending'; }).length;
        etat.textContent = lignes.length + ' signalement(s) affiché(s) — ' + enAttente + ' à traiter.';

        var wrap = el('div', 'adm-views-table-wrap');
        var table = document.createElement('table');
        var thead = document.createElement('thead');
        var tr = document.createElement('tr');
        ['Éléments signalés', 'Détail', 'Candidat', 'Date', 'Statut', 'Action'].forEach(function (t) { tr.appendChild(el('th', '', t)); });
        thead.appendChild(tr);
        var tbody = document.createElement('tbody');

        lignes.forEach(function (s) {
            var row = document.createElement('tr');
            var element = el('td');
            element.appendChild(el('strong', '', NOMS_MODULES[s.module_id] || 'Module ' + s.module_id));
            if (s.resource) element.appendChild(el('div', '', s.resource));
            element.appendChild(el('div', 'adm-fiches-discret', s.incident_type));

            var detail = el('td');
            detail.appendChild(el('div', '', s.details));
            detail.appendChild(el('span', 'adm-fiches-priorite adm-fiches-priorite-' + (s.priority === 'Bloquant' ? 'bloquant' :
                s.priority === 'Correction requise' ? 'correction' : 'info'), s.priority));

            var statut = el('td', '', s.status === 'resolved' ? 'Traité' : 'À traiter');
            var action = el('td');
            var b = el('button', 'adm-views-more', s.status === 'resolved' ? 'Rouvrir' : 'Marquer traité');
            b.type = 'button';
            b.addEventListener('click', function () {
                b.disabled = true;
                var suivant = s.status === 'resolved' ? 'pending' : 'resolved';
                api('doctrine_signalements?id=eq.' + encodeURIComponent(s.id), { methode: 'PATCH', corps: { status: suivant } })
                    .then(function () {
                        s.status = suivant;
                        afficherSignalements();
                    }).catch(function (err) {
                        b.disabled = false;
                        etat.textContent = messageErreur(err);
                    });
            });
            action.appendChild(b);

            row.append(element, detail, el('td', '', s.candidate_email || '(inconnu)'), el('td', '', formaterDate(s.created_at)), statut, action);
            tbody.appendChild(row);
        });
        table.append(thead, tbody);
        wrap.appendChild(table);
        corps.append(barre, wrap);
    }

    /* ---------- Synthèse RETEX ---------- */
    function chargerRetex() {
        titre.textContent = 'Synthèse RETEX';
        sousTitre.textContent = '';
        actions.replaceChildren(bouton('Exporter en PDF', exporterPdf), bouton('Actualiser', chargerRetex), bouton('Fermer', fermer));
        corps.replaceChildren();
        etat.textContent = 'Chargement des RETEX…';
        api('doctrine_retex?select=candidate_email,specialty,modules,navigation,design,resources,viewer,used_report,recommendation,comment,created_at' +
            '&order=created_at.desc&limit=' + TAILLE_PAGE).then(function (lignes) {
            afficherRetex(Array.isArray(lignes) ? lignes : []);
        }).catch(function (err) {
            etat.textContent = messageErreur(err);
        });
    }

    function compter(lignes, lire) {
        var totaux = Object.create(null);
        lignes.forEach(function (l) {
            [].concat(lire(l)).forEach(function (v) {
                if (v) totaux[v] = (totaux[v] || 0) + 1;
            });
        });
        return Object.keys(totaux).map(function (k) { return { label: k, n: totaux[k] }; })
            .sort(function (a, b) { return b.n - a.n; });
    }

    function carteCamembert(titreCarte, donnees) {
        var carte = el('section', 'adm-fiches-stat');
        carte.appendChild(el('h3', '', titreCarte));
        var total = donnees.reduce(function (s, d) { return s + d.n; }, 0);
        if (!total) {
            carte.appendChild(el('p', 'adm-fiches-discret', 'Aucune réponse.'));
            return carte;
        }
        var cumul = 0;
        var segments = donnees.map(function (d, i) {
            var debut = cumul / total * 100;
            cumul += d.n;
            return COULEURS[i % COULEURS.length] + ' ' + debut + '% ' + (cumul / total * 100) + '%';
        });
        var corpsCarte = el('div', 'adm-fiches-stat-corps');
        var pie = el('div', 'adm-pie');
        pie.style.background = 'conic-gradient(' + segments.join(',') + ')';
        pie.setAttribute('role', 'img');
        pie.setAttribute('aria-label', titreCarte);
        var legende = el('ul', 'adm-fiches-legende');
        donnees.forEach(function (d, i) {
            var li = el('li');
            var pastille = el('span', 'adm-fiches-pastille');
            pastille.style.background = COULEURS[i % COULEURS.length];
            li.append(pastille, document.createTextNode(d.label + ' : ' + d.n + ' (' + Math.round(d.n / total * 100) + ' %)'));
            legende.appendChild(li);
        });
        corpsCarte.append(pie, legende);
        carte.appendChild(corpsCarte);
        return carte;
    }

    function afficherRetex(lignes) {
        if (mode !== 'retex') return;
        corps.replaceChildren();
        if (!lignes.length) {
            etat.textContent = 'Aucun RETEX reçu pour le moment.';
            return;
        }
        etat.textContent = '';
        var dates = lignes.map(function (l) { return new Date(l.created_at); }).filter(function (d) { return !isNaN(d.getTime()); });
        var debut = new Date(Math.min.apply(null, dates));
        var fin = new Date(Math.max.apply(null, dates));
        titre.textContent = 'RETEX DOCTRINE – Synthèse pour le commandement';
        sousTitre.textContent = lignes.length + ' retour(s) analysé(s) – édité le ' + formaterJour(new Date()) +
            ' – période du ' + formaterJour(debut) + ' au ' + formaterJour(fin) + '.';

        var cartes = [
            ['Spécialité BM4', compter(lignes, function (l) { return l.specialty || 'Non renseignée'; })],
            ['Modules les plus consultés', compter(lignes, function (l) { return l.modules || []; })],
            ['Navigation dans l’application', compter(lignes, function (l) { return l.navigation; })],
            ['Design visuel', compter(lignes, function (l) { return l.design; })],
            ['Ressources documentaires', compter(lignes, function (l) { return l.resources; })],
            ['Visionneuse de documents', compter(lignes, function (l) { return l.viewer; })],
            ['Fiche de signalement utilisée', compter(lignes, function (l) { return l.used_report; })],
            ['Recommandation', compter(lignes, function (l) { return l.recommendation; })]
        ].map(function (c) { return { titre: c[0], donnees: c[1] }; });
        var commentaires = lignes.filter(function (l) { return l.comment; });
        synthese = {
            titre: titre.textContent,
            sousTitre: sousTitre.textContent,
            cartes: cartes.filter(function (c) { return c.donnees.length; }),
            commentaires: commentaires.map(function (l) {
                return { texte: l.comment, auteur: (l.candidate_email || '(inconnu)') + ' – ' + formaterDate(l.created_at) };
            })
        };

        var grille = el('div', 'adm-fiches-grille');
        cartes.forEach(function (c) { grille.appendChild(carteCamembert(c.titre, c.donnees)); });
        corps.appendChild(grille);

        var carte = el('section', 'adm-fiches-stat adm-fiches-commentaires');
        carte.appendChild(el('h3', '', 'Observations terrain (' + commentaires.length + ')'));
        if (!commentaires.length) carte.appendChild(el('p', 'adm-fiches-discret', 'Aucune observation.'));
        commentaires.forEach(function (l) {
            var bloc = el('blockquote');
            bloc.appendChild(el('p', '', l.comment));
            bloc.appendChild(el('footer', 'adm-fiches-discret', (l.candidate_email || '(inconnu)') + ' – ' + formaterDate(l.created_at)));
            carte.appendChild(bloc);
        });
        corps.appendChild(carte);
    }

    /* ---------- Export PDF (généré localement, sans bibliothèque) ---------- */
    var CP1252 = { '’': 0x92, '‘': 0x91, '–': 0x96, '—': 0x97, '…': 0x85, 'œ': 0x9c, 'Œ': 0x8c, '€': 0x80, '“': 0x93, '”': 0x94 };

    function encoder(texte) {
        var sortie = '';
        Array.from(String(texte)).forEach(function (c) {
            var code = c.charCodeAt(0);
            if (c.length > 1 || code > 255 && !CP1252[c]) { sortie += '?'; return; }
            if (CP1252[c]) code = CP1252[c];
            else if (code === 0x202f || code === 0xa0) code = 32;
            else if (code < 32) code = 32;
            sortie += String.fromCharCode(code);
        });
        return sortie.replace(/[\\()]/g, '\\$&');
    }

    function couleur(hex) {
        return [1, 3, 5].map(function (i) { return (parseInt(hex.substr(i, 2), 16) / 255).toFixed(3); }).join(' ');
    }

    function decouper(texte, taille, largeur) {
        var max = Math.max(5, Math.floor(largeur / (taille * 0.52)));
        var lignes = [];
        String(texte).split(/\r?\n/).forEach(function (para) {
            var courant = '';
            para.split(/\s+/).forEach(function (mot) {
                while (mot.length > max) {
                    if (courant) { lignes.push(courant); courant = ''; }
                    lignes.push(mot.slice(0, max));
                    mot = mot.slice(max);
                }
                if ((courant + ' ' + mot).trim().length > max) { lignes.push(courant); courant = mot; }
                else courant = (courant + ' ' + mot).trim();
            });
            lignes.push(courant);
        });
        return lignes;
    }

    function genererPdf(s) {
        var L = 595, H = 842, M = 40, pages = [], flux, y;
        function nouvellePage() { flux = []; pages.push(flux); y = M; }
        function texte(x, haut, taille, chaine, gras, rgb) {
            flux.push('BT ' + couleur(rgb || '#111111') + ' rg /F' + (gras ? 2 : 1) + ' ' + taille + ' Tf ' +
                x.toFixed(1) + ' ' + (H - haut).toFixed(1) + ' Td (' + encoder(chaine) + ') Tj ET');
        }
        function bloc(x, haut, taille, chaine, largeur, gras, rgb) {
            decouper(chaine, taille, largeur).forEach(function (ligne, i) {
                texte(x, haut + taille + i * (taille + 3), taille, ligne, gras, rgb);
            });
            return decouper(chaine, taille, largeur).length * (taille + 3);
        }
        function part(cx, cy, r, a0, a1, hex) {
            var pts = ['' + cx.toFixed(1) + ' ' + (H - cy).toFixed(1) + ' m'];
            var pas = Math.max(1, Math.ceil((a1 - a0) / 0.1));
            for (var i = 0; i <= pas; i++) {
                var a = a0 + (a1 - a0) * i / pas;
                pts.push((cx + r * Math.sin(a)).toFixed(1) + ' ' + (H - (cy - r * Math.cos(a))).toFixed(1) + ' l');
            }
            flux.push(couleur(hex) + ' rg 1 1 1 RG 0.6 w ' + pts.join(' ') + ' h B');
        }

        nouvellePage();
        flux.push(couleur('#1d4a33') + ' rg 0 ' + (H - 78) + ' ' + L + ' 78 re f');
        y = 22;
        y += bloc(M, y, 16, s.titre, L - 2 * M, true, '#ffffff');
        y += 2 + bloc(M, y, 9, s.sousTitre, L - 2 * M, false, '#e8f2ea');
        y = 78 + 14;

        var largeurCarte = (L - 2 * M - 14) / 2;
        for (var i = 0; i < s.cartes.length; i += 2) {
            var ligne = s.cartes.slice(i, i + 2).map(function (c) {
                var total = c.donnees.reduce(function (a, d) { return a + d.n; }, 0);
                var tx = largeurCarte - 24 - 80 - 14;
                var libelles = c.donnees.map(function (d) {
                    return decouper(d.label + ' : ' + d.n + ' (' + Math.round(d.n / total * 100) + ' %)', 8, tx);
                });
                var nb = libelles.reduce(function (a, l) { return a + l.length; }, 0);
                return { c: c, total: total, libelles: libelles, h: 34 + Math.max(90, nb * 11 + 4) };
            });
            var hLigne = Math.max.apply(null, ligne.map(function (l) { return l.h; }));
            if (y + hLigne > H - M) nouvellePage();
            ligne.forEach(function (item, col) {
                var x = M + col * (largeurCarte + 14);
                flux.push('0.75 0.75 0.75 RG 0.8 w ' + x + ' ' + (H - y - hLigne) + ' ' + largeurCarte + ' ' + hLigne + ' re S');
                texte(x + 10, y + 18, 11, item.c.titre, true, '#1d3a2a');
                var cx = x + 10 + 40, cy = y + 34 + 45, a = 0;
                item.c.donnees.forEach(function (d, k) {
                    var a1 = a + d.n / item.total * 2 * Math.PI;
                    part(cx, cy, 40, a, a1, COULEURS[k % COULEURS.length]);
                    a = a1;
                });
                var ly = y + 34;
                item.c.donnees.forEach(function (d, k) {
                    flux.push(couleur(COULEURS[k % COULEURS.length]) + ' rg ' + (x + 100).toFixed(1) + ' ' + (H - ly - 8).toFixed(1) + ' 7 7 re f');
                    item.libelles[k].forEach(function (t, n) { texte(x + 112, ly + 8 + n * 11, 8, t, false); });
                    ly += item.libelles[k].length * 11;
                });
            });
            y += hLigne + 12;
        }

        if (y + 40 > H - M) nouvellePage();
        texte(M, y + 14, 12, 'Observations terrain (' + s.commentaires.length + ')', true, '#1d3a2a');
        y += 24;
        s.commentaires.forEach(function (c) {
            var lignes = decouper(c.texte, 9, L - 2 * M - 12).length;
            if (y + lignes * 12 + 24 > H - M) nouvellePage();
            flux.push('0.9 0.76 0.35 rg ' + M + ' ' + (H - y - lignes * 12 - 12) + ' 2 ' + (lignes * 12 + 14) + ' re f');
            y += bloc(M + 8, y, 9, c.texte, L - 2 * M - 12, false) + 2;
            y += bloc(M + 8, y, 7, c.auteur, L - 2 * M - 12, false, '#666666') + 6;
        });

        var objets = [];
        var nbPages = pages.length;
        objets[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        objets[2] = '<< /Type /Pages /Kids [' + pages.map(function (p, i) { return (5 + i * 2) + ' 0 R'; }).join(' ') + '] /Count ' + nbPages + ' >>';
        objets[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        objets[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
        pages.forEach(function (p, i) {
            var contenu = p.join('\n');
            objets[5 + i * 2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + L + ' ' + H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (6 + i * 2) + ' 0 R >>';
            objets[6 + i * 2] = '<< /Length ' + contenu.length + ' >>\nstream\n' + contenu + '\nendstream';
        });
        var pdf = '%PDF-1.4\n', offsets = [];
        for (var n = 1; n < objets.length; n++) {
            offsets[n] = pdf.length;
            pdf += n + ' 0 obj\n' + objets[n] + '\nendobj\n';
        }
        var xref = pdf.length;
        pdf += 'xref\n0 ' + objets.length + '\n0000000000 65535 f \n';
        for (var k = 1; k < objets.length; k++) pdf += ('0000000000' + offsets[k]).slice(-10) + ' 00000 n \n';
        pdf += 'trailer\n<< /Size ' + objets.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
        var octets = new Uint8Array(pdf.length);
        for (var j = 0; j < pdf.length; j++) octets[j] = pdf.charCodeAt(j) & 255;
        return new Blob([octets], { type: 'application/pdf' });
    }

    function exporterPdf() {
        if (!synthese) return;
        var lien = document.createElement('a');
        var url = URL.createObjectURL(genererPdf(synthese));
        lien.href = url;
        lien.download = 'RETEX-DOCTRINE-' + new Date().toISOString().slice(0, 10) + '.pdf';
        document.body.appendChild(lien);
        lien.click();
        lien.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }

    document.addEventListener('doctrine:admin-fiches', function (event) { ouvrir(event.detail); });
    document.addEventListener('doctrine:logout', fermer);
})();

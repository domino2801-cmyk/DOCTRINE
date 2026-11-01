(function () {
    'use strict';

    var COULEURS = ['#4f7a4f', '#c9a227', '#2f6fa3', '#a33a3a', '#7b5ea7', '#3a9a8f', '#d9822b', '#777777'];
    var NOMS_MODULES = {
        '1': 'Module 1', '2': 'Module 2', '3': 'Module 3', '4': 'Module 4',
        '5': 'Module 5', '6': 'Module 6', '7': 'Module 7', general: 'Application'
    };
    var TAILLE_PAGE = 1000;

    var dialogue, titre, sousTitre, corps, etat, actions, mode = null;
    var signalements = [];
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

        var grille = el('div', 'adm-fiches-grille');
        grille.append(
            carteCamembert('Spécialité BM4', compter(lignes, function (l) { return l.specialty || 'Non renseignée'; })),
            carteCamembert('Modules les plus consultés', compter(lignes, function (l) { return l.modules || []; })),
            carteCamembert('Navigation dans l’application', compter(lignes, function (l) { return l.navigation; })),
            carteCamembert('Design visuel', compter(lignes, function (l) { return l.design; })),
            carteCamembert('Ressources documentaires', compter(lignes, function (l) { return l.resources; })),
            carteCamembert('Visionneuse de documents', compter(lignes, function (l) { return l.viewer; })),
            carteCamembert('Fiche de signalement utilisée', compter(lignes, function (l) { return l.used_report; })),
            carteCamembert('Recommandation', compter(lignes, function (l) { return l.recommendation; }))
        );
        corps.appendChild(grille);

        var commentaires = lignes.filter(function (l) { return l.comment; });
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

    function exporterPdf() {
        document.body.classList.add('adm-fiches-print');
        var nettoyer = function () {
            document.body.classList.remove('adm-fiches-print');
            window.removeEventListener('afterprint', nettoyer);
        };
        window.addEventListener('afterprint', nettoyer);
        window.print();
    }

    document.addEventListener('doctrine:admin-fiches', function (event) { ouvrir(event.detail); });
    document.addEventListener('doctrine:logout', fermer);
})();

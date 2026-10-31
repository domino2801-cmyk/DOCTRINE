(function () {
    'use strict';

    var PARTIE_1 = [
        'POINTS CLÉS TRANSVERSES',
        '',
        '1. MÉTHODOLOGIE DE LA FICHE D’ÉTAT-MAJOR (ADMISSIBILITÉ)',
        '• Introduction en 3 points concrets :',
        '  - Préambule : expliquer clairement pourquoi la fiche est rédigée (contexte).',
        '  - Idée maîtresse (IM) : réponse directe, claire, argumentée et engagée.',
        '  - Annonce de plan spécifique : doit mentionner les aspects clés du dossier.',
        '• Première partie : problématique et critères d’analyse :',
        '  - Poser la situation, les enjeux et dégager au moins 3 critères de choix clairs',
        '    (ex : coût, délais, conformité réglementaire, efficacité).',
        '• Deuxième partie : solutions réalisables (SR) :',
        '  - Proposer 3 solutions distinctes, réalistes et réalisables (pas de « SR fantaisiste »).',
        '  - Analyser chaque option selon le triptyque : AVANTAGES - INCONVÉNIENTS - RISQUES.',
        '• Troisième partie : avis du rédacteur (solution préconisée) :',
        '  - Démontrer pourquoi la solution choisie est le meilleur compromis.',
        '  - Expliquer comment limiter les risques et compenser les inconvénients identifiés.',
        '• Relecture indispensable :',
        '  - Conserver impérativement 10 minutes avant de rendre la copie pour chasser les fautes',
        '    (accords singulier/pluriel, participes passés et infinitifs).',
        '',
        '2. CARACTÉRISTIQUES DE LA FICHE SUPPORT DE L’ORAL',
        '• Un outil opératoire : ce n’est pas un résumé condensé de la fiche d’état-major.',
        '• Structure type requise :',
        '  - Introduction : accroche (anecdote/fait historique), problématique, limites, IM, plan.',
        '  - Développement : exposé de la solution retenue, puis 2 ou 3 arguments majeurs et étayés.',
        '  - Conclusion : rappel de l’IM et ouverture prospective.',
        '• Graphisme et style : utiliser des puces, des tableaux, des mots-clés.',
        '  Éviter les paragraphes denses. Interdiction d’ajouter des en-têtes sur le support oral.',
        '• Gestion du temps : s’entraîner à tenir entre 8 et 10 minutes sans déborder.',
        '',
        '3. LE CURRICULUM VITAE (CV) ET LE COMPORTEMENT À L’ORAL',
        '• Ancrage des données : le CV est le seul document disponible pour le jury.',
        '  Mettre impérativement des données chiffrées : budgets gérés, effectifs commandés,',
        '  résultats concrets obtenus, mentions claires des MCD, OPEX et niveaux PLS.',
        '• Posture physique : choisir la position DEBOUT devant le jury est vivement valorisé',
        '  car cela permet d’imposer une présence plus dynamique, affirmative et conquérante.',
        '• Exclusion du « je » et du « nous » : la fiche et les développements doivent rester',
        '  impersonnels. Le candidat s’exprime au nom du bureau.',
        '',
        '4. ÉPREUVES SPORTIVES ET RECOMMANDATIONS QCM',
        '• Le QCM : 50 questions à barème sévère (+4 / -1 / 0). Demande une veille sur l’actualité',
        '  militaire (OTAN comprise) et la maîtrise des documents d’orientation : Grand Rapport',
        '  de l’AdT, Charte de fonctionnement, Vision du CEMAT, LPM.',
        '• Le sport : désormais OBLIGATOIRE pour tout personnel médicalement apte. Les points',
        '  au-dessus de la moyenne divisés par deux s’ajoutent au total admission. C’est un',
        '  facteur déterminant pour gagner des places au classement final.'
    ].join('\n');

    var COMBAT = {
        titre: 'FICHE 06 : COMBAT (INFANTERIE / ARTILLERIE / BLINDÉS / EMPLOI DES FORCES / GÉNIE)',
        texte: [
            '- AXE DE L’ÉPREUVE ÉCRITE :',
            '  • Niveau d’expression écrite inquiétant. Ratures trop fréquentes, copies illisibles.',
            '  • Erreur récurrente : confondre solution d’avenir et mesure d’urgence immédiate (attente).',
            '- ATTENDUS DE L’ÉPREUVE ORALE :',
            '  • Manque de profondeur sur le contexte interarmes de combat de haute intensité.',
            '  • Justifications des solutions trop brèves, n’emportant pas la conviction du jury.',
            '  • Difficultés pour insérer les problématiques tactiques dans la vision de la',
            '    transformation globale de l’armée de Terre (ex : briques SCORPION).',
            '  • Nécessité de réaliser plusieurs oraux blancs en unité pour dominer le stress.'
        ].join('\n')
    };

    var FICHES = {
        ADM: {
            titre: 'FICHE 01 : ADMINISTRATION (ADM)',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Bonne application générale du canevas mais manque de caractérisation des solutions.',
                '  • Attention aux conclusions laconiques ou partielles sans ouverture sur l’avenir.',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Structure de l’exposé à dérouler strictement comme une dissertation.',
                '  • Sortir des sentiers battus sur les motivations (éviter les banalités).',
                '  • Maîtrise indispensable de TOUT le spectre ADM (ne pas se limiter au poste actuel).',
                '  • L’usage du paperboard est indispensable pour structurer la ligne directrice.'
            ].join('\n')
        },
        GRH: {
            titre: 'FICHE 02 : GESTION DES RESSOURCES HUMAINES (GRH / GRH-BSPP)',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Manque de précision et oubli fréquent des critères d’analyse réglementaires.',
                '  • Impératif de chiffrer précisément les propositions de la fiche.',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Combativité exigée sur la durée de l’oral. Honnêteté intellectuelle de mise face à la DRHAT.',
                '  • Sujets majeurs à maîtriser sur l’aspect chancellerie :',
                '    - Discipline : groupes, catégories et faits d’un bulletin de sanction.',
                '    - Enquêtes de commandement : motifs de déclenchement, niveaux, documents obligatoires.',
                '    - Violences sexuelles et sexistes (VSS) : baromètre, acteurs ressources, protection.',
                '    - Notation et avancement : circuits, formulaires par catégories, particularités PEVAT.',
                '    - Conditions de sélection du DAEOS, admission SOC et échelons exceptionnels.',
                '  • Élargir le spectre RH au-delà des fonctions quotidiennes tenues (accès EMIA, COA, etc.).'
            ].join('\n')
        },
        PBF: {
            titre: 'FICHE 03 : PILOTAGE - COMPTABILITÉ - BUDGET - FINANCES (PBF)',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Résultats d’écrit souvent décevants. Oubli impardonnable du critère financier.',
                '  • Syntaxe lourde (à proscrire). Privilégier le style direct et percutant.',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Réponses trop souvent lapidaires, sans relief, manquant d’exemples et de chiffres clés.',
                '  • Lacunes fortes sur la filière APC (Appui au Pilotage et Commandement) : contrôle',
                '    interne comptable/budgétaire, contrôle de gestion, audit.',
                '  • Approximations à corriger sur la filière MCA (Marchés-Achats / Commande publique).',
                '  • Maîtrise attendue de la Loi de Programmation Militaire (LPM 2024-2030) : effort',
                '    budgétaire global (413 Md€), modernisation de la dissuasion, cyberdéfense, défense sol-air.'
            ].join('\n')
        },
        RHL: {
            titre: 'FICHE 04 : RESTAURATION HÔTELLERIE LOISIRS (RHL)',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Fiches trop vagues ne permettant pas une prise de décision rapide de l’autorité.',
                '  • Progrès notables notés sur le respect de la méthode en 2025 (taux d’élimination bas).',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Le grade de major préparant à des postes d’adjoint ou directeur de cercle, les items',
                '    suivants sont JUGÉS INDISPENSABLES à la connaissance du candidat :',
                '    - Composition, organisation, désignation du président du Conseil d’Administration (CA).',
                '    - Mécanismes de gestion des bâtiments cadres célibataires (BCC).',
                '    - Taux de marge sur les repas régaliens.',
                '    - Autorités de tutelle, budget SC04 et investissements cercle.',
                '    - Applications concrètes de la loi EGALIM (politique d’achats alimentaires).',
                '  • Effort requis sur les filières Hébergement et Hôtellerie (trop souvent sacrifiées).'
            ].join('\n')
        },
        MAI: {
            titre: 'FICHE 05 : MAINTENANCE (MAI / MMA)',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Méthode maîtrisée mais solutions parfois caricaturales (ex : tout détruire, tout refaire).',
                '  • Sélectionner impérativement une pièce « pivot » du dossier pour discriminer',
                '    rigoureusement les solutions.',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Pour la filière MAI : éviter la stricte recopie textuelle de la fiche d’état-major.',
                '  • Pour la filière MMA : point d’effort requis sur les sujets communs du domaine,',
                '    notamment la sécurité aéronautique, les fonctions de l’unité élémentaire et la CI3D.'
            ].join('\n')
        },
        INF: COMBAT,
        BLD: COMBAT,
        ART: COMBAT,
        EMP: COMBAT,
        GEN: COMBAT
    };

    var CODES = Object.keys(FICHES);
    var LIBELLES = {
        INF: 'infanterie',
        BLD: 'combat des blindes',
        ART: 'artillerie',
        EMP: 'emploi des forces',
        GEN: 'genie',
        ADM: 'administration',
        GRH: 'gestion des ressources humaines',
        PBF: 'pilotage budget et finances',
        RHL: 'restauration hotellerie et loisirs',
        MAI: 'maintenance',
        MMA: 'maintenance'
    };

    var etat = { specialite: '', chargement: true, erreur: false };
    var choixAdmin = '';

    function normaliser(valeur) {
        return String(valeur || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function codePour(valeur) {
        var n = normaliser(valeur);
        if (!n) return '';
        var i, code;
        for (i = 0; i < CODES.length; i++) {
            code = CODES[i];
            if (n === code.toLowerCase() || n.indexOf(code.toLowerCase() + ' ') === 0) return code;
        }
        if (n === 'mma' || n.indexOf('mma ') === 0) return 'MAI';
        if (n.indexOf('grh') === 0) return 'GRH';
        for (i = 0; i < CODES.length; i++) {
            code = CODES[i];
            if (n.indexOf(LIBELLES[code]) !== -1) return code;
        }
        return '';
    }

    function estAdmin() {
        return !!(window.DoctrineAuth && window.DoctrineAuth.estAdmin());
    }

    function racine() {
        return document.getElementById('jury-specialite');
    }

    function assurerSelecteur(zone) {
        var select = zone.querySelector('#jury-specialite-select');
        if (select) return select;
        var libelle = document.createElement('label');
        libelle.htmlFor = 'jury-specialite-select';
        libelle.textContent = 'Choisir la spécialité à consulter';
        select = document.createElement('select');
        select.id = 'jury-specialite-select';
        select.appendChild(new Option('Sélectionner une spécialité', ''));
        [['INF', 'INF - Infanterie'], ['BLD', 'BLD - Combat des blindés'], ['ART', 'ART - Artillerie'],
            ['GEN', 'GEN - Génie'], ['EMP', 'EMP - Emploi des forces'], ['ADM', 'ADM - Administration'],
            ['GRH', 'GRH - Gestion des ressources humaines'], ['PBF', 'PBF - Pilotage, budget et finances'],
            ['MAI', 'MAI - Maintenance'], ['RHL', 'RHL - Restauration, hôtellerie et loisirs']]
            .forEach(function (o) { select.appendChild(new Option(o[1], o[0])); });
        select.addEventListener('change', function () {
            choixAdmin = select.value;
            afficher();
        });
        zone.insertBefore(select, zone.firstChild);
        zone.insertBefore(libelle, select);
        return select;
    }

    function afficher() {
        var zone = racine();
        if (!zone) return;
        var statut = zone.querySelector('#jury-specialite-statut');
        var titre = zone.querySelector('#jury-specialite-titre');
        var contenu = zone.querySelector('#jury-specialite-contenu');
        var admin = estAdmin();
        var selecteur = zone.querySelector('.jury-specialite-admin');
        if (admin) assurerSelecteur(selecteur);
        selecteur.hidden = !admin;

        var specialite = admin ? choixAdmin : etat.specialite;
        var code = codePour(specialite);
        var fiche = code ? FICHES[code] : null;

        titre.hidden = !fiche;
        contenu.hidden = !fiche;
        if (fiche) {
            titre.textContent = fiche.titre;
            contenu.textContent = fiche.texte;
            statut.textContent = admin ? '' : 'Spécialité déclarée : ' + etat.specialite + '.';
            return;
        }
        if (admin) {
            statut.textContent = 'Choisissez une spécialité pour consulter sa fiche.';
        } else if (etat.chargement) {
            statut.textContent = 'Chargement de votre spécialité…';
        } else if (etat.erreur) {
            statut.textContent = 'Impossible de charger votre spécialité. Réessayez en vous reconnectant.';
        } else if (etat.specialite) {
            statut.textContent = 'Aucune fiche d’analyse du jury n’est encore disponible pour la spécialité « ' +
                etat.specialite + ' ».';
        } else {
            statut.textContent = 'Aucune spécialité candidate n’est renseignée sur votre profil QCM-MAJOR.FR.';
        }
    }

    function charger() {
        etat = { specialite: '', chargement: true, erreur: false };
        afficher();
        if (!window.DoctrineAuth || estAdmin()) {
            etat.chargement = false;
            afficher();
            return;
        }
        window.DoctrineAuth.specialite().then(function (valeur) {
            etat = { specialite: String(valeur || '').trim(), chargement: false, erreur: false };
            afficher();
        }).catch(function (erreur) {
            etat = { specialite: '', chargement: false, erreur: true };
            console.error('Échec du chargement de la spécialité du candidat :', erreur);
            afficher();
        });
    }

    function init() {
        var zone = racine();
        if (!zone) return;
        var partie1 = zone.querySelector('#jury-partie1');
        if (partie1) partie1.textContent = PARTIE_1;
        afficher();
        document.addEventListener('doctrine:login', charger);
        document.addEventListener('doctrine:admin-mode', afficher);
        document.addEventListener('doctrine:logout', function () {
            choixAdmin = '';
            etat = { specialite: '', chargement: false, erreur: false };
            afficher();
        });
        if (document.documentElement.classList.contains('auth-locked') === false) charger();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());

(function () {
    'use strict';

    var PARTIE_1 = [
        '1. MÉTHODOLOGIE DE LA FICHE D’ÉTAT-MAJOR (ADMISSIBILITÉ)',
        '• INTRODUCTION EN 3 POINTS CONCRETS :',
        '  - Préambule : expliquer clairement pourquoi la fiche est rédigée (contexte).',
        '  - Idée maîtresse (IM) : réponse directe, claire, argumentée et engagée.',
        '  - Annonce de plan spécifique : doit mentionner les aspects clés du dossier.',
        '• PREMIÈRE PARTIE : PROBLÉMATIQUE ET CRITÈRES D’ANALYSE :',
        '  - Poser la situation, les enjeux et dégager au moins 3 critères de choix clairs',
        '    (ex : coût, délais, conformité réglementaire, efficacité).',
        '• DEUXIÈME PARTIE : SOLUTIONS RÉALISABLES (SR) :',
        '  - Proposer 3 solutions distinctes, réalistes et réalisables (pas de « SR fantaisiste »).',
        '  - Analyser chaque option selon le triptyque : AVANTAGES - INCONVÉNIENTS - RISQUES.',
        '• TROISIÈME PARTIE : AVIS DU RÉDACTEUR (SOLUTION PRÉCONISÉE) :',
        '  - Démontrer pourquoi la solution choisie est le meilleur compromis.',
        '  - Expliquer comment limiter les risques et compenser les inconvénients identifiés.',
        '• RELECTURE INDISPENSABLE :',
        '  - Conserver impérativement 10 minutes avant de rendre la copie pour chasser',
        '    les fautes (accords singulier/pluriel, participes passés et infinitifs).',
        '',
        '2. CARACTÉRISTIQUES DE LA FICHE SUPPORT DE L’ORAL',
        '• UN OUTIL OPÉRATOIRE : ce n’est pas un résumé condensé de la fiche d’état-major.',
        '• STRUCTURE TYPE REQUISE :',
        '  - Introduction : accroche (anecdote/fait historique), problématique, limites, IM, plan.',
        '  - Développement : exposé de la solution retenue, puis 2 ou 3 arguments majeurs et étayés.',
        '  - Conclusion : rappel de l’IM et ouverture prospective.',
        '• GRAPHISME ET STYLE : utiliser des puces (bullet points), des tableaux, des mots-clés.',
        '  Éviter les paragraphes denses. Interdiction d’ajouter des en-têtes sur le support oral.',
        '• GESTION DU TEMPS : s’entraîner à tenir entre 8 et 10 minutes sans déborder.',
        '',
        '3. LE CURRICULUM VITAE (CV) ET LE COMPORTEMENT À L’ORAL',
        '• ANCRAGE DES DONNÉES : le CV est le seul document disponible pour le jury.',
        '  Mettre impérativement des données chiffrées : budgets gérés, effectifs commandés,',
        '  résultats concrets obtenus, mentions claires des MCD, OPEX et niveaux PLS.',
        '• POSTURE PHYSIQUE : choisir la position DEBOUT devant le jury est vivement valorisé',
        '  car cela permet d’imposer une présence plus dynamique, affirmative et conquérante.',
        '• EXCLUSION DU « JE » ET DU « NOUS » : la fiche et les développements doivent rester',
        '  impersonnels. Le candidat s’exprime au nom du bureau.',
        '',
        '4. ÉPREUVES SPORTIVES ET RECOMMANDATIONS QCM',
        '• LE QCM : 50 questions à barème sévère (+4 / -1 / 0). Demande une veille sur',
        '  l’actualité militaire (OTAN comprise) et la maîtrise des documents d’orientation :',
        '  Grand Rapport de l’AdT, Charte de fonctionnement, Vision du CEMAT, LPM.',
        '• LE SPORT : désormais OBLIGATOIRE pour tout personnel médicalement apte. Les points',
        '  au-dessus de la moyenne divisés par deux s’ajoutent au total admission. C’est un',
        '  facteur déterminant pour gagner des places au classement final.'
    ].join('\n');

    // codes : codes de spécialité QCM-MAJOR.FR couverts par la fiche ; libelles : variantes de texte libre
    var FICHES = [
        {
            codes: ['ADM'],
            libelles: ['administration'],
            titre: 'ADM - Administration',
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
        {
            codes: ['GRH'],
            libelles: ['gestion des ressources humaines', 'ressources humaines'],
            titre: 'GRH - Gestion des ressources humaines (GRH / GRH-BSPP)',
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
        {
            codes: ['PBF'],
            libelles: ['pilotage budget et finances', 'pilotage comptabilite budget finances'],
            titre: 'PBF - Pilotage, comptabilité, budget, finances',
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
        {
            codes: ['RHL'],
            libelles: ['restauration hotellerie et loisirs', 'restauration hotellerie loisirs'],
            titre: 'RHL - Restauration, hôtellerie, loisirs',
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
        {
            codes: ['MAI', 'MMA'],
            libelles: ['maintenance', 'materiel'],
            titre: 'MAI / MMA - Maintenance',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Méthode maîtrisée mais solutions parfois caricaturales (ex : tout détruire, tout refaire).',
                '  • Sélectionner impérativement une pièce « pivot » du dossier pour discriminer rigoureusement',
                '    les solutions.',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Pour la filière MAI : éviter la stricte recopie textuelle de la fiche d’état-major.',
                '  • Pour la filière MMA : point d’effort requis sur les sujets communs du domaine,',
                '    notamment la sécurité aéronautique, les fonctions de l’unité élémentaire et la CI3D.'
            ].join('\n')
        },
        {
            codes: ['INF', 'ART', 'BLD', 'EMP'],
            libelles: ['infanterie', 'artillerie', 'combat des blindes', 'blindes', 'emploi des forces', 'combat'],
            titre: 'INF / ART / BLD / EMP - Combat',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Niveau général faible par manque de maîtrise des travaux d’état-major. Les copies sont très inégales.',
                '  • Qualité de l’expression écrite inquiétante : fautes de grammaire et d’orthographe élémentaires,',
                '    nombreuses ratures et copies parfois illisibles.',
                '  • Erreurs méthodologiques majeures : omission fréquente du prisme des risques dans l’analyse des',
                '    solutions. Tendance à confondre une solution pérenne avec une simple mesure d’urgence temporaire',
                '    (ex : « mettre les armes à l’armurerie » ou « placer une garde 24/7 » sont des mesures d’attente',
                '    qui doivent uniquement figurer dans les suites à donner).',
                '  • L’emploi de la première personne (« Je », « Nous ») est strictement interdit ; le candidat doit',
                '    rédiger au nom du bureau.',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Objectif de la fiche support non compris : trop de candidats se contentent de recopier la fiche de',
                '    propositions en réduisant la police au format A5 au lieu de bâtir un outil de conviction dynamique.',
                '  • Le canevas « e-Form » doit être rigoureusement respecté (introduction avec idée maîtresse, énoncé',
                '    de la solution, puis développement de deux arguments majeurs et étayés).',
                '  • Connaissances générales sur l’armée de Terre correctes (l’exercice ORION est globalement maîtrisé),',
                '    mais approximations flagrantes sur les chiffres clés de l’institution (les estimations des effectifs',
                '    globaux de l’AdT varient de façon aberrante entre 90 000 et 500 000 militaires selon les candidats).'
            ].join('\n')
        },
        {
            codes: ['SIC'],
            libelles: ['systemes d information et de communication', 'systemes d information et de communications'],
            titre: 'SIC - Systèmes d’information et de communication (SIC / SIC/BSPP)',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Méthode globalement connue concernant la structure de la fiche, mais la prise en compte des critères',
                '    imposés par le commandement reste très perfectible.',
                '  • Les candidats priorisent l’aspect réglementaire mais négligent complètement la notion de coût.',
                '    Les analyses financières sont trop superficielles et manquent de faits concrets (absence de chiffrage',
                '    des coûts de neutralisation ou de destruction du matériel).',
                '  • Sanction systématique des copies floues ou qui proposent des solutions techniques totalement irréalistes.',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • La fiche support est mal maîtrisée : le jury pénalise sévèrement les documents trop denses ou, à',
                '    l’inverse, trop squelettiques (réduits à un plan sec sans contenu exploitable).',
                '  • Le candidat doit être capable de défendre le caractère opérationnel, réaliste et progressif de sa',
                '    solution face à des problématiques concrètes et actuelles (cybersécurité, compromission, risques',
                '    informatiques et vol de matériel).',
                '  • Connaissances indispensables à maîtriser : les directives de la directive de sécurité 45/ARM/SECUR,',
                '    les recommandations de l’ANSSI, et l’impact RH/financier de ces mesures au sein du régiment.'
            ].join('\n')
        },
        {
            codes: ['SAN'],
            libelles: ['sante'],
            titre: 'SAN - Santé (SAN / SAN/BSPP)',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Niveau général de l’épreuve en baisse. La méthode de la fiche de propositions et la démarche de',
                '    raisonnement général qu’elle sous-tend ne sont pas maîtrisées.',
                '  • Difficulté récurrente à rédiger une Idée Maîtresse (IM) argumentée, précise et percutante.',
                '    De nombreuses copies oublient l’annonce du plan ou la conclusion.',
                '  • Manque de profondeur dans l’argumentation : les pièces du dossier sont trop souvent paraphrasées ou',
                '    simplement recopiées in extenso (pratique à bannir).',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Plus de 50 % des fiches supports sont non conformes aux attendus de l’oral par méconnaissance des',
                '    techniques d’état-major.',
                '  • L’expertise doit être globale : le candidat ne doit pas se cantonner à sa « zone de confort »',
                '    technique ou à son employabilité quotidienne en antenne médicale. Il doit démontrer une vision',
                '    d’ensemble de la filière santé.',
                '  • Thématiques clés de l’AdT à maîtriser : la chaîne de prise en charge et d’accompagnement des blessés,',
                '    les leviers de soutien aux conjoints survivants, l’attribution des lycées militaires et le rôle de l’ONaCVG.'
            ].join('\n')
        },
        {
            codes: ['COM'],
            libelles: ['communication'],
            titre: 'COM - Communication',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Le sujet ne présente généralement pas de difficulté technique majeure, mais près de 70 % des copies',
                '    sont pénalisées par des fautes d’orthographe, de grammaire et de graphie récurrente qui font perdre',
                '    de précieux points.',
                '  • La problématique doit être appréhendée sous l’angle d’un major servant au sein d’un bureau',
                '    opérations-instruction (BOI).',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Le jury exige un Curriculum Vitae (CV) d’une présentation irréprochable, structuré et agréable à lire,',
                '    mettant en valeur les compétences acquises au cours de la carrière.',
                '  • Si les compétences techniques (notamment dans le domaine de l’image) sont généralement solides, les',
                '    candidats manquent de prise de hauteur et de connaissances générales sur l’organisation, la politique',
                '    et l’actualité de l’armée de Terre. Plusieurs imprécisions structurelles affaiblissent la démonstration orale.'
            ].join('\n')
        },
        {
            codes: ['GEN', 'CGEN', 'TOI', 'SDC'],
            libelles: ['genie', 'genie et infrastructure'],
            titre: 'GEN / CGEN / TOI / SDC - Génie et infrastructure',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Résultats très décevants, tant sur la forme que sur le fond. Trois candidats sur quatre ne saisissent',
                '    pas la finalité opérationnelle d’une fiche d’état-major.',
                '  • Manque de rigueur structurelle : présence de copies rédigées sous forme de texte monobloc, sans titres,',
                '    sans sous-titres et sans en-tête.',
                '  • Style à épurer : proscrire les phrases longues à la syntaxe approximative et les envolées lyriques sur',
                '    la mémoire des anciens. Privilégier des phrases courtes (Sujet + Verbe + Complément).',
                '  • Analyse du fond insuffisante : oubli fréquent des critères financiers et budgétaires du dossier. Face à un',
                '    sujet touchant à la responsabilité pénale du chef de corps (non-conformité réglementaire de sécurité),',
                '    il est inadmissible de proposer des solutions irresponsables (ex : « cacher le matériel » ou « ne rien faire »).',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Impréparation totale constatée : 95 % des fiches supports ne sont qu’une réduction brute de la copie',
                '    d’écrit. 50 % des documents sont beaucoup trop rédigés pour être exploitables à l’oral.',
                '  • Le candidat doit se mettre dans la peau d’un avocat plaidant pour son client afin de valoriser les',
                '    bénéfices de sa solution préconisée et en relativiser les risques.'
            ].join('\n')
        },
        {
            codes: ['LEG'],
            libelles: ['legion etrangere'],
            titre: 'LEG - Légion étrangère',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Niveau général de l’épreuve très faible et en baisse. La fiche d’état-major et sa méthodologie ne sont',
                '    pas assimilées.',
                '  • Rupture systématique du style : la paraphrase et le plagiat des textes du dossier camouflent difficilement',
                '    l’absence de réflexion personnelle.',
                '  • Point de rupture majeur : la défaillance générale de la langue française écrite (syntaxe, orthographe,',
                '    accords singulier/pluriel, confusion participe passé/infinitif) qui fait perdre de nombreux points et',
                '    pénalise lourdement la crédibilité du propos.',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Plus de la moitié des copies orales sont non conformes. L’argumentaire de la solution retenue reste',
                '    trop succinct car les candidats développent à nouveau inutilement les 3 solutions réalisables au lieu',
                '    de valoriser leur choix préférentiel.',
                '  • Volonté de s’investir requise : le candidat doit enrichir sa culture générale et militaire (histoire,',
                '    géographie, économie) par des lectures régulières pour être capable d’étayer ses arguments par des',
                '    exemples d’ouverture pertinents.'
            ].join('\n')
        },
        {
            codes: ['AER', 'MGF', 'MTN', 'NBC'],
            libelles: ['aeromobilite', 'aeromobilite alat', 'montagne'],
            titre: 'AER / MGF / MTN / NBC - Aéromobilité, montagne, NBC',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Niveau de maîtrise hétérogène. L’épreuve de synthèse exige une rédaction structurée, ce qui exclut le',
                '    recours exclusif aux énumérations brutes ou aux groupes nominaux isolés.',
                '  • Démarche intellectuelle erronée : de nombreux candidats arrêtent d’emblée leur choix de solution, puis',
                '    élaborent de façon artificielle et mécanique deux solutions supplémentaires volontairement irréalistes',
                '    pour satisfaire la forme. Toute solution doit répondre triplement aux critères : délais (résultats sous',
                '    60 jours), conformité réglementaire, et maîtrise des coûts.',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Si les connaissances de la spécialité propre sont satisfaisantes (ex : météo, pompier aéro), les',
                '    connaissances techniques liées aux autres branches du domaine sont trop moyennes. Un effort doit être',
                '    fourni sur les sujets communs (sécurité aéronautique, organisation de l’unité élémentaire, chaîne CI3D).',
                '  • Valorisation linguistique : l’obtention préalable d’un PLS en langue anglaise (ex : PLS 3333) apporte',
                '    des points de majoration précieux et constitue un excellent levier de progression dans le classement',
                '    final d’admission.'
            ].join('\n')
        },
        {
            codes: ['SEC', 'SCI'],
            libelles: ['securite'],
            titre: 'SEC / SCI - Sécurité (SEC / SEC/BSPP / SCI/BSPP)',
            texte: [
                '- AXE DE L’ÉPREUVE ÉCRITE :',
                '  • Niveau global satisfaisant et en nette progression. Très bon retex sur les thèmes liant la protection',
                '    patrimoniale et les impératifs de sécurité physique.',
                '  • Lacunes constatées : confusion fréquente dans la partie 2 entre les inconvénients (fragilités internes',
                '    intrinsèques) et les risques (menaces externes induites).',
                '  • L’argument budgétaire doit cesser d’être une simple liste passive de coûts pour devenir une étude de',
                '    faisabilité dynamique.',
                '- ATTENDUS DE L’ÉPREUVE ORALE :',
                '  • Effort exigé sur la dimension stratégique (articulation fine entre les mesures d’urgence immédiates et',
                '    la planification à long terme).',
                '  • Le candidat doit démontrer la crédibilité opérationnelle directe de sa solution pour garantir la',
                '    continuité du commandement.'
            ].join('\n')
        }
    ];

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

    function fichePour(valeur) {
        var n = normaliser(valeur);
        if (!n) return null;
        var i, j, fiche, code;
        for (i = 0; i < FICHES.length; i++) {
            fiche = FICHES[i];
            for (j = 0; j < fiche.codes.length; j++) {
                code = fiche.codes[j].toLowerCase();
                if (n === code || n.indexOf(code + ' ') === 0) return fiche;
            }
        }
        for (i = 0; i < FICHES.length; i++) {
            fiche = FICHES[i];
            for (j = 0; j < fiche.libelles.length; j++) {
                if (n.indexOf(fiche.libelles[j]) !== -1) return fiche;
            }
        }
        return null;
    }

    var SPECS = [
        ['INF', 'INF - Infanterie'], ['BLD', 'BLD - Combat des blindés'], ['ART', 'ART - Artillerie'],
        ['GEN', 'GEN - Génie', ['genie']], ['AER', 'AER - Aéromobilité (ALAT)'], ['EMP', 'EMP - Emploi des forces'],
        ['SIC', 'SIC - Systèmes d\'information et de communication'], ['CYB', 'CYB - Cybersécurité et cyberdéfense'],
        ['RENS', 'RENS - Renseignement', ['renseignement']], ['ADM', 'ADM - Administration et gestion de soutien'],
        ['GRH', 'GRH - Gestion des ressources humaines'], ['PBF', 'PBF - Pilotage, budget et finances'],
        ['MVT', 'MVT - Logistique et transport'], ['MAI', 'MAI - Maintenance', ['materiel']],
        ['COM', 'COM - Communication'], ['RHL', 'RHL - Restauration, hôtellerie et loisirs'],
        ['EPS', 'EPMS - Éducation physique militaire et sportive', ['epms']], ['SAN', 'SAN - Santé', ['sante']],
        ['FSP', 'FSP - Forces spéciales'], ['EMIA', 'EMIA - École militaire interarmes'], ['OTHER', 'Autre (à préciser)'],
        ['LEG', 'LEG - Légion étrangère', ['legion']], ['SEC', 'SEC - Sécurité civile']
    ];

    function codePour(valeur) {
        var n = normaliser(valeur), i, j, alias;
        if (!n) return '';
        for (i = 0; i < SPECS.length; i++) {
            alias = [SPECS[i][0].toLowerCase()].concat(SPECS[i][2] || []);
            for (j = 0; j < alias.length; j++) {
                if (n === alias[j] || n.indexOf(alias[j] + ' ') === 0) return SPECS[i][0];
            }
        }
        var fiche = fichePour(valeur);
        return fiche ? fiche.codes[0] : '';
    }

    function source(creer) {
        var zone = racine();
        if (!zone) return null;
        var src = zone.querySelector('[data-jury-source]');
        if (!src && creer) {
            src = document.createElement('div');
            src.setAttribute('data-jury-source', '');
            src.hidden = true;
            zone.appendChild(src);
        }
        return src;
    }

    function recordPour(code, src) {
        var liste = src ? src.querySelectorAll('[data-jury-record]') : [];
        for (var i = 0; i < liste.length; i++) {
            if (liste[i].getAttribute('data-jury-record') === code) return liste[i];
        }
        return null;
    }

    // Fiche publiée par l'admin pour ce code, sinon fiche par défaut du guide
    function ficheFinale(code) {
        var rec = recordPour(code, source(false));
        if (rec) {
            var t = rec.querySelector('[data-jury-title]');
            var x = rec.querySelector('[data-jury-text]');
            return { titre: t ? t.textContent : '', texte: x ? x.textContent : '', perso: true };
        }
        var d = fichePour(code);
        return d ? { titre: d.titre, texte: d.texte, perso: false } : null;
    }

    function estAdmin() {
        return !!(window.DoctrineAuth && window.DoctrineAuth.estAdmin());
    }

    function racine() {
        return document.getElementById('jury-specialite');
    }

    function assurerSelecteur(zone) {
        var panneau = zone.querySelector('.jury-admin-panel');
        if (panneau) return panneau;
        panneau = document.createElement('div');
        panneau.className = 'adm-ui fiche-dossier-admin jury-admin-panel';
        panneau.innerHTML = '<h3>Édition des fiches par spécialité</h3>' +
            '<label for="jury-admin-select">Spécialité</label>' +
            '<select id="jury-admin-select"></select>' +
            '<label for="jury-admin-titre">Titre de la fiche</label>' +
            '<input id="jury-admin-titre" type="text">' +
            '<label for="jury-admin-texte">Contenu de la fiche</label>' +
            '<textarea id="jury-admin-texte" rows="14"></textarea>' +
            '<p><button type="button" data-jury-save>Appliquer</button> ' +
            '<button type="button" data-jury-publish>Enregistrer</button> ' +
            '<button type="button" data-jury-reset>Rétablir</button></p>' +
            '<p data-jury-msg role="status"></p>';
        var select = panneau.querySelector('#jury-admin-select');
        select.appendChild(new Option('Sélectionner une spécialité', ''));
        SPECS.forEach(function (s) {
            var d = fichePour(s[0]);
            var perso = recordPour(s[0], source(false));
            var affiche = s[0] === 'EPS' ? 'EPMS' : s[0] === 'OTHER' ? 'Autre' : s[0];
            select.appendChild(new Option(affiche + (d || perso ? '' : ' (sans fiche)') + (perso ? ' ✎' : ''), s[0]));
        });
        var titre = panneau.querySelector('#jury-admin-titre');
        var texte = panneau.querySelector('#jury-admin-texte');
        var msg = panneau.querySelector('[data-jury-msg]');
        select.addEventListener('change', function () {
            choixAdmin = select.value;
            var f = choixAdmin ? ficheFinale(choixAdmin) : null;
            titre.value = f ? f.titre : '';
            texte.value = f ? f.texte : '';
            msg.textContent = '';
            afficher(true);
        });
        panneau.querySelector('[data-jury-publish]').addEventListener('click', function () {
            panneau.querySelector('[data-jury-save]').click();
            var corps = zone.closest('.mod-body');
            var bar = corps && corps.previousElementSibling;
            var save = bar && bar.querySelector('.adm-save');
            if (save) {
                save.click();
                msg.textContent = 'Fiche publiée (voir le message de la barre du module 1 en haut).';
            } else {
                msg.textContent = 'Barre d’administration introuvable : activez le mode admin.';
            }
        });
        panneau.querySelector('[data-jury-save]').addEventListener('click', function () {
            if (!choixAdmin) { msg.textContent = 'Choisissez d’abord une spécialité.'; return; }
            var src = source(true);
            var rec = recordPour(choixAdmin, src);
            if (!rec) {
                rec = document.createElement('div');
                rec.setAttribute('data-jury-record', choixAdmin);
                rec.innerHTML = '<span data-jury-title></span><pre data-jury-text></pre>';
                src.appendChild(rec);
            }
            rec.querySelector('[data-jury-title]').textContent = titre.value.trim();
            rec.querySelector('[data-jury-text]').textContent = texte.value;
            msg.textContent = 'Fiche appliquée. Cliquez sur « Enregistrer » pour la publier.';
            afficher(true);
        });
        panneau.querySelector('[data-jury-reset]').addEventListener('click', function () {
            var rec = choixAdmin ? recordPour(choixAdmin, source(false)) : null;
            if (rec) rec.remove();
            var f = choixAdmin ? ficheFinale(choixAdmin) : null;
            titre.value = f ? f.titre : '';
            texte.value = f ? f.texte : '';
            msg.textContent = 'Fiche d’origine rétablie. Cliquez sur « Enregistrer » pour publier.';
            afficher(true);
        });
        zone.appendChild(panneau);
        return panneau;
    }

    function ajouterTexte(el, texte) {
        var m = /^([^:]{2,80}?) ?: (.+)$/.exec(texte);
        if (/^[^:]{2,80}:$/.test(texte)) {
            var s0 = document.createElement('strong');
            s0.textContent = texte;
            el.appendChild(s0);
        } else if (m) {
            var s = document.createElement('strong');
            s.textContent = m[1] + ' : ';
            el.appendChild(s);
            el.appendChild(document.createTextNode(m[2]));
        } else {
            el.appendChild(document.createTextNode(texte));
        }
    }

    // Transforme le texte brut d'une fiche (puces indentées) en blocs lisibles
    function rendre(conteneur, texte) {
        conteneur.textContent = '';
        var lignes = String(texte || '').split('\n');
        var numerote = lignes.some(function (l) { return /^\d+\.\s/.test(l); });
        var carte = null, ulRacine = null, ulImbrique = null, dernier = null, niveau1 = null;

        function nouvelleCarte(titre, balise) {
            carte = document.createElement('section');
            carte.className = 'jury-bloc';
            var h = document.createElement(balise);
            h.textContent = titre;
            carte.appendChild(h);
            conteneur.appendChild(carte);
            ulRacine = ulImbrique = niveau1 = null;
            dernier = h;
        }
        function racine() {
            if (!carte) nouvelleCarte('', 'h4');
            if (!ulRacine) {
                ulRacine = document.createElement('ul');
                carte.appendChild(ulRacine);
            }
            return ulRacine;
        }

        lignes.forEach(function (brut) {
            if (!brut.trim()) return;
            var m = /^(\s*)(?:[•-]|\d+\.)\s+(.*)$/.exec(brut);
            if (!m) {
                if (dernier) dernier.appendChild(document.createTextNode(' ' + brut.trim()));
                return;
            }
            var niveau = Math.floor(m[1].length / 2);
            var texteLigne = m[2].trim();
            if (/^\d+\.\s/.test(brut)) {
                nouvelleCarte(brut.trim(), 'h4');
                return;
            }
            if (niveau === 0 && /:$/.test(texteLigne)) {
                if (!numerote || !carte) nouvelleCarte(texteLigne.replace(/\s*:$/, ''), numerote ? 'h5' : 'h4');
                else {
                    var h5 = document.createElement('h5');
                    h5.textContent = texteLigne.replace(/\s*:$/, '');
                    carte.appendChild(h5);
                    ulRacine = ulImbrique = niveau1 = null;
                    dernier = h5;
                }
                return;
            }
            var li = document.createElement('li');
            ajouterTexte(li, texteLigne);
            if (niveau >= 2 && niveau1) {
                if (!ulImbrique) {
                    ulImbrique = document.createElement('ul');
                    niveau1.appendChild(ulImbrique);
                }
                ulImbrique.appendChild(li);
            } else {
                racine().appendChild(li);
                ulImbrique = null;
                niveau1 = li;
            }
            dernier = li;
        });
    }

    function afficher(garder) {
        var zone = racine();
        if (!zone) return;
        var statut = zone.querySelector('#jury-specialite-statut');
        var titre = zone.querySelector('#jury-specialite-titre');
        var contenu = zone.querySelector('#jury-specialite-contenu');
        var selecteur = zone.querySelector('.jury-specialite-admin');
        var admin = estAdmin();
        if (admin) assurerSelecteur(selecteur);
        selecteur.hidden = !admin;
        var code = admin ? choixAdmin : codePour(etat.specialite);
        var fiche = code ? ficheFinale(code) : null;
        if (fiche && !fiche.texte.trim()) fiche = null;
        titre.hidden = !fiche;
        contenu.hidden = !fiche;
        if (fiche) {
            titre.textContent = fiche.titre;
            rendre(contenu, fiche.texte);
            statut.textContent = admin ? '' : 'Spécialité déclarée : ' + etat.specialite + '.';
            return;
        }
        if (admin) {
            statut.textContent = choixAdmin ? 'Aucune fiche pour cette spécialité : saisissez-la ci-dessus.' :
                'Choisissez une spécialité pour la consulter ou la modifier.';
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
        if (partie1) rendre(partie1, PARTIE_1);
        afficher();
        document.addEventListener('doctrine:login', charger);
        document.addEventListener('doctrine:admin-mode', function () { afficher(); });
        document.addEventListener('doctrine:content-updated', function (e) {
            if (!e.detail || e.detail.moduleId !== '1') return;
            var z = racine();
            var p1 = z && z.querySelector('#jury-partie1');
            if (p1) rendre(p1, PARTIE_1);
            afficher();
        });
        document.addEventListener('doctrine:logout', function () {
            choixAdmin = '';
            etat = { specialite: '', chargement: false, erreur: false };
            afficher();
        });
        if (!document.documentElement.classList.contains('auth-locked')) charger();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());

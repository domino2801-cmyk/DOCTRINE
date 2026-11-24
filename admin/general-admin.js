/* Administrateur général DOCTRINE — centralise les outils existants sans les dupliquer. */
(function () {
    'use strict';
    var root, button;

    function auth() { return window.DoctrineAuth; }
    function estAutorise() { return !!(auth() && typeof auth().estAdmin === 'function' && auth().estAdmin()); }

    function action(label, name, primary) {
        return '<button type="button" class="ag-btn' + (primary ? ' ag-btn-primary' : '') +
            '" data-ag-action="' + name + '">' + label + '</button>';
    }

    function carte(id, titre, description, actions, note) {
        return '<details class="ag-card" data-ag-card="' + id + '">' +
            '<summary>' + titre + '</summary><div class="ag-card-body"><p>' + description +
            '</p><div class="ag-subtabs">' + (actions || '') + '</div>' +
            '<p class="ag-note" data-ag-status="' + id + '" aria-live="polite">' + (note || '') +
            '</p></div></details>';
    }

    function construire() {
        if (document.getElementById('adminGeneralButton')) {
            button = document.getElementById('adminGeneralButton');
            root = document.getElementById('adminGeneral');
            return;
        }
        button = document.createElement('button');
        button.id = 'adminGeneralButton';
        button.type = 'button';
        button.textContent = '▦ Administrateur général';
        button.hidden = true;
        var bar = document.querySelector('.app-utility-bar');
        (bar || document.body).appendChild(button);
        button.addEventListener('click', ouvrir);

        root = document.createElement('section');
        root.id = 'adminGeneral';
        root.hidden = true;
        root.setAttribute('aria-label', 'Interface Administrateur général');
        root.innerHTML = '<div class="ag-shell"><header class="ag-head"><div>' +
            '<h1>ADMINISTRATEUR GÉNÉRAL</h1><p>Accès centralisé aux fonctions d’administration existantes de DOCTRINE</p>' +
            '</div><div class="ag-actions"><button class="ag-close" type="button" data-ag-close>Fermer</button></div></header><div class="ag-grid">' +
            carte('accounts', '1. COMPTES', 'DOCTRINE utilise les comptes partagés avec QCM-MAJOR. Le suivi existant permet de modifier la spécialité d’un candidat. Aucune console complète de création, suppression ou blocage des comptes n’a été repérée dans DOCTRINE.', action('Ouvrir le suivi global des candidats', 'global-tracking'), 'Gestion complète des comptes : non disponible dans cette application.') +
            carte('questions', '2. QUESTIONS', 'La banque de questions et sa gestion relèvent de QCM-MAJOR. DOCTRINE ne possède pas de console de gestion de cette banque. L’édition des contenus pédagogiques de DOCTRINE est accessible dans la rubrique Modification application.', '', 'Banque QCM-MAJOR : pas de fonction locale à DOCTRINE à ouvrir.') +
            carte('signals', '3. SIGNALEMENTS', 'Accès direct aux espaces existants de traitement des signalements candidats et des Officiers Guides.', action('Signalements candidats', 'candidate-signals', true) + action('Signalements Officiers Guides', 'guide-signals') + action('Notifications et alertes', 'notifications')) +
            carte('retex', '4. RETEX', 'Consultation des RETEX candidats, des rapports autonomes des Officiers Guides et de la synthèse existante.', action('RETEX candidats et synthèse', 'candidate-retex', true) + action('RETEX Officiers Guides', 'guide-retex')) +
            carte('guide', '5. SUIVI OFFICIER GUIDE', 'Suivi global des candidats, suivi des consultations documentaires et accès aux outils de ressources Officier Guide.', action('Suivi global des candidats', 'global-tracking', true) + action('Suivi des consultations', 'document-views') + action('Catalogue des cours OG', 'course-catalog') + action('Exercices et corrections', 'guide-library')) +
            carte('application', '6. MODIFICATION APPLICATION', 'Édition du contenu des modules, gestion des documents complémentaires du module 2 et administration des ressources pédagogiques.', action('Mode édition des contenus', 'admin-edit', true) + action('Documents complémentaires — module 2', 'module2-documents') + action('Catalogue des cours OG', 'course-catalog') + action('Exercices et corrections', 'guide-library'), 'La gestion de la structure globale et des paramètres techniques n’est pas exposée ici.') +
            '</div></div>';
        root.addEventListener('click', function (event) {
            if (event.target.matches('[data-ag-close]')) { fermer(); return; }
            var control = event.target.closest('[data-ag-action]');
            if (control) executerAction(control.getAttribute('data-ag-action'));
        });
        document.body.appendChild(root);
    }

    function statut(id, message) {
        var node = root && root.querySelector('[data-ag-status="' + id + '"]');
        if (node) node.textContent = message || '';
    }

    function cliquer(selecteur, section, indisponible) {
        var cible = document.querySelector(selecteur + ':not([hidden])');
        if (cible) { cible.click(); statut(section, ''); return true; }
        statut(section, indisponible);
        return false;
    }

    function executerAction(name) {
        if (!estAutorise()) return;
        if (name === 'candidate-signals') {
            document.dispatchEvent(new CustomEvent('doctrine:admin-fiches', { detail: 'signalements' }));
        } else if (name === 'guide-signals') {
            document.dispatchEvent(new CustomEvent('doctrine:admin-fiches', { detail: 'guide-signalements' }));
        } else if (name === 'notifications') {
            document.dispatchEvent(new CustomEvent('doctrine:admin-fiches', { detail: 'notifications' }));
        } else if (name === 'candidate-retex') {
            document.dispatchEvent(new CustomEvent('doctrine:admin-fiches', { detail: 'retex' }));
        } else if (name === 'guide-retex') {
            document.dispatchEvent(new CustomEvent('doctrine:admin-fiches', { detail: 'guide-retex' }));
        } else if (name === 'global-tracking') {
            document.dispatchEvent(new CustomEvent('doctrine:open-cohort-dashboard'));
            statut('guide', '');
        } else if (name === 'document-views') {
            document.dispatchEvent(new CustomEvent('doctrine:open-document-views'));
            statut('guide', '');
        } else if (name === 'course-catalog') {
            document.dispatchEvent(new CustomEvent('doctrine:open-course-catalog'));
            statut('guide', '');
        } else if (name === 'guide-library') {
            if (!cliquer('.adm-guide-library-home-toggle', 'guide', 'La bibliothèque est indisponible : vérifiez le chargement de l’outil Exercices et corrections.')) {
                cliquer('.adm-guide-library-toggle', 'guide', 'La bibliothèque est indisponible : vérifiez le chargement de l’outil Exercices et corrections.');
            }
        } else if (name === 'admin-edit') {
            document.dispatchEvent(new CustomEvent('doctrine:open-module-editor'));
            statut('application', 'Mode édition activé. Les commandes Enregistrer, Annuler, Valeurs d’origine et sauvegarde/restauration sont disponibles dans les barres des modules.');
        } else if (name === 'module2-documents') {
            document.dispatchEvent(new CustomEvent('doctrine:open-module2-documents-admin'));
            statut('application', '');
        }
    }

    function ouvrir() {
        if (!estAutorise()) return;
        root.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function fermer() {
        if (!root) return;
        root.hidden = true;
        document.body.style.overflow = '';
    }

    function actualiser() {
        if (button) button.hidden = !estAutorise();
        if (!estAutorise()) fermer();
    }

    function init() {
        construire();
        actualiser();
        document.addEventListener('doctrine:login', actualiser);
        document.addEventListener('doctrine:logout', actualiser);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

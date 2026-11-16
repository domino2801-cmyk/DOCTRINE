/* Accès direct aux corrigés pour les comptes dont la spécialité est OG. */
(function () {
    'use strict';

    var accesOG = false;
    var liste = null;

    function afficherCorriges() {
        if (!accesOG) return;
        liste = liste || document.getElementById('corrigeList');
        if (liste) {
            liste.hidden = false;
            liste.querySelectorAll('.dossier-item').forEach(function (ligne) {
                ligne.hidden = false;
            });
        }
        var module = document.querySelector('.mod-body[data-mod="4"]');
        if (module) module.classList.remove('corrections-locked');
    }

    function verifierSpecialite() {
        var auth = window.DoctrineAuth;
        if (!auth || typeof auth.specialite !== 'function') return;
        auth.specialite().then(function (specialite) {
            accesOG = String(specialite || '').trim().toLocaleUpperCase('fr') === 'OG';
            if (!accesOG) return;
            afficherCorriges();
            if (!window.__doctrineOGCorrectionObserver && document.body) {
                window.__doctrineOGCorrectionObserver = new MutationObserver(afficherCorriges);
                window.__doctrineOGCorrectionObserver.observe(document.body, {
                    subtree: true,
                    childList: true,
                    attributes: true,
                    attributeFilter: ['hidden', 'class']
                });
            }
        }).catch(function (error) {
            console.warn('Impossible de vérifier la spécialité OG.', error);
        });
    }

    document.addEventListener('doctrine:login', verifierSpecialite);
    document.addEventListener('doctrine:logout', function () {
        accesOG = false;
        liste = null;
        if (window.__doctrineOGCorrectionObserver) {
            window.__doctrineOGCorrectionObserver.disconnect();
            delete window.__doctrineOGCorrectionObserver;
        }
    });

    // Le script peut être chargé après l'événement de connexion initiale.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', verifierSpecialite, { once: true });
    } else {
        verifierSpecialite();
    }

    // Autorise l'ouverture des liens OG sans laisser le contrôle de blocage candidat l'intercepter.
    document.addEventListener('click', function (event) {
        if (!accesOG || !(event.target instanceof Element)) return;
        var lien = event.target.closest('#corrigeList a[href]');
        if (!lien) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.open(lien.href, lien.target || '_blank', 'noopener');
    }, true);
})();

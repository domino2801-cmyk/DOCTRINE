/* Carte unique des raccourcis administrateur du module 8. */
(function () {
    'use strict';
    var hub;
    var observer;

    function auth() { return window.DoctrineAuth; }
    function isAdmin() {
        return !!(auth() && typeof auth().estAdmin === 'function' && auth().estAdmin());
    }
    var targets = {
        admin: '.adm-toolbar-toggle',
        suivi: '.adm-views-toolbar-toggle',
        signal: '.adm-fiches-toolbar-signalements',
        retex: '.adm-fiches-toolbar-retex',
        alertes: '.adm-fiches-toolbar-notifications',
        cours: '.adm-course-catalog-toggle',
        cohorte: '.adm-cohort-toolbar'
    };

    function sync() {
        if (!hub) return;
        var allowed = isAdmin();
        hub.hidden = !allowed;
        Object.keys(targets).forEach(function (key) {
            var shortcut = hub.querySelector('[data-admin-shortcut="' + key + '"]');
            var original = document.querySelector('#modal-module8 .module-nav-controls ' + targets[key]);
            if (shortcut) {
                shortcut.disabled = !allowed || !original || original.hidden;
                shortcut.setAttribute('aria-disabled', String(shortcut.disabled));
                shortcut.title = original ? original.title || shortcut.textContent.trim() : 'Fonction indisponible';
            }
        });
    }

    function init() {
        hub = document.getElementById('module8AdminHub');
        if (!hub) return;
        hub.querySelectorAll('[data-admin-shortcut]').forEach(function (shortcut) {
            shortcut.addEventListener('click', function () {
                if (!isAdmin()) return;
                var original = document.querySelector('#modal-module8 .module-nav-controls ' + targets[shortcut.dataset.adminShortcut]);
                if (original && !original.hidden) original.click();
                sync();
            });
        });
        document.addEventListener('doctrine:login', sync);
        document.addEventListener('doctrine:logout', sync);
        observer = new MutationObserver(sync);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
        sync();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

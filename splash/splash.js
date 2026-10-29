(function () {
    var splash = document.getElementById('splash');
    if (!splash) return;

    var DUREE_MS = 5800;
    var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dejaVu = false;
    try { dejaVu = sessionStorage.getItem('anc-splash') === '1'; } catch (e) {}

    function fermer() {
        if (!splash.parentNode) return;
        splash.classList.add('splash-fin');
        setTimeout(function () {
            if (splash.parentNode) splash.parentNode.removeChild(splash);
        }, 700);
        document.documentElement.style.overflow = '';
    }

    if (dejaVu || reduit) {
        splash.remove();
        return;
    }

    try { sessionStorage.setItem('anc-splash', '1'); } catch (e) {}
    document.documentElement.style.overflow = 'hidden';
    splash.addEventListener('click', fermer, { once: true });
    setTimeout(fermer, DUREE_MS);
})();

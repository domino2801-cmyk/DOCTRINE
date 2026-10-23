(function () {
    var splash = document.getElementById('splash');
    if (!splash) return;

    var DUREE_MS = 5800;
    var reduit = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dejaVu = false;
    try { dejaVu = sessionStorage.getItem('bm4-splash') === '1'; } catch (e) {}

    function fermer() {
        if (!splash.parentNode) return;
        splash.classList.add('splash-fin');
        setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 700);
        document.documentElement.style.overflow = '';
    }

    if (dejaVu || reduit) {
        splash.parentNode.removeChild(splash);
        return;
    }
    try { sessionStorage.setItem('bm4-splash', '1'); } catch (e) {}
    document.documentElement.style.overflow = 'hidden';

    var stage = splash.querySelector('.stage');
    function fit() {
        stage.style.setProperty('--s', Math.min(innerWidth / 500, innerHeight / 800));
    }
    fit();
    addEventListener('resize', fit);

    var SVG = 'http://www.w3.org/2000/svg';
    var grad = splash.querySelector('.graduations');
    for (var i = 0; i < 72; i++) {
        var l = document.createElementNS(SVG, 'line');
        l.setAttribute('y1', -90);
        l.setAttribute('y2', i % 6 === 0 ? -80 : -85);
        l.setAttribute('transform', 'rotate(' + i * 5 + ')');
        grad.appendChild(l);
    }

    var PIVOT = { x: 250, y: 340 };
    var outils = [
        { a: 42, len: 285, t: 0.6 },
        { a: 120, len: 229, t: 1.3 },
        { a: 76, len: 239, t: 2.0 },
        { a: -42, len: 252, t: 2.7 },
        { a: -86, len: 239, t: 3.4 }
    ];
    var zone = splash.querySelector('.etincelles');
    function etincelles(x, y) {
        if (!splash.parentNode) return;
        for (var i = 0; i < 16; i++) {
            var p = document.createElement('i');
            zone.appendChild(p);
            p.style.left = x + 'px';
            p.style.top = y + 'px';
            var ang = Math.random() * Math.PI * 2;
            var d = 20 + Math.random() * 45;
            var taille = 2 + Math.random() * 3;
            p.style.width = p.style.height = taille + 'px';
            p.animate([
                { transform: 'translate(0,0) scale(1)', opacity: 1 },
                { transform: 'translate(' + Math.cos(ang) * d + 'px,' + (Math.sin(ang) * d + 14) + 'px) scale(0)', opacity: 0 }
            ], { duration: 600 + Math.random() * 500, easing: 'cubic-bezier(0.2,0.7,0.3,1)' })
                .onfinish = (function (el) { return function () { el.remove(); }; })(p);
        }
    }
    outils.forEach(function (o) {
        var r = o.a * Math.PI / 180;
        var x = PIVOT.x - Math.sin(r) * o.len;
        var y = PIVOT.y + Math.cos(r) * o.len;
        setTimeout(function () { etincelles(x, y); }, (o.t + 0.55) * 1000);
    });

    splash.addEventListener('click', fermer);
    setTimeout(fermer, DUREE_MS);
})();

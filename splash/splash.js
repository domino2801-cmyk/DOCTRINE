(function () {
    var splash = document.getElementById('splash');
    if (!splash) return;

    var DUREE_MS = 5800;
    var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dejaVu = false;
    var canvas = document.getElementById('matrix');
    var progressBar = document.getElementById('progressBar');
    var loadingText = document.getElementById('loadingText');
    var progressTrack = splash.querySelector('[role="progressbar"]');
    var progress = 0;
    var animationFrame;
    var progressTimer;
    var fermee = false;
    try { dejaVu = sessionStorage.getItem('anc-splash') === '1'; } catch (e) {}

    function fermer() {
        if (fermee || !splash.parentNode) return;
        fermee = true;
        splash.classList.add('splash-fin');
        clearInterval(progressTimer);
        if (animationFrame) cancelAnimationFrame(animationFrame);
        window.removeEventListener('resize', redimensionnerMatrix);
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

    var contexte = canvas && canvas.getContext('2d');
    var taillePolice = 17;
    var colonnes = [];

    function redimensionnerMatrix() {
        if (!contexte) return;

        var ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = window.innerWidth * ratio;
        canvas.height = window.innerHeight * ratio;
        contexte.setTransform(ratio, 0, 0, ratio, 0, 0);
        colonnes = Array.from(
            { length: Math.ceil(window.innerWidth / taillePolice) },
            function () { return -Math.random() * 60; }
        );
    }

    function dessinerMatrix() {
        if (!contexte || fermee) return;

        contexte.fillStyle = 'rgba(16, 27, 20, 0.10)';
        contexte.fillRect(0, 0, window.innerWidth, window.innerHeight);
        contexte.font = 'bold ' + taillePolice + 'px monospace';

        colonnes.forEach(function (y, index) {
            contexte.fillStyle = Math.random() > 0.85 ? '#fff' : '#55ffad';
            contexte.shadowBlur = 8;
            contexte.shadowColor = '#00ff9d';
            contexte.fillText(Math.random() > 0.5 ? '1' : '0', index * taillePolice, y * taillePolice);
            contexte.shadowBlur = 0;

            colonnes[index] += 0.35 + Math.random() * 0.7;
            if (y * taillePolice > window.innerHeight && Math.random() > 0.975) {
                colonnes[index] = -Math.random() * 30;
            }
        });

        animationFrame = requestAnimationFrame(dessinerMatrix);
    }

    redimensionnerMatrix();
    dessinerMatrix();
    window.addEventListener('resize', redimensionnerMatrix);

    var messages = [
        'INITIALISATION DU SYSTÈME...',
        'CHARGEMENT DES DONNÉES...',
        'SÉCURISATION DES ACCÈS...',
        'PRÉPARATION DE L’ARMOIRE...',
        'ACCÈS AUTORISÉ'
    ];

    progressTimer = setInterval(function () {
        progress = Math.min(progress + 1, 100);
        progressBar.style.width = progress + '%';
        progressTrack.setAttribute('aria-valuenow', progress);
        loadingText.textContent = messages[Math.min(Math.floor(progress / 25), messages.length - 1)];

        if (progress === 100) fermer();
    }, DUREE_MS / 100);

    splash.addEventListener('click', fermer, { once: true });
    window.addEventListener('app-ready', fermer, { once: true });
})();

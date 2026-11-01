(function () {
    var splash = document.getElementById('splash');
    if (!splash) return;

    var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dejaVu = false;
    try { dejaVu = sessionStorage.getItem('anc-splash-matrix') === '1'; } catch (e) {}

    if (dejaVu || reduit) {
        splash.remove();
        return;
    }
    try { sessionStorage.setItem('anc-splash-matrix', '1'); } catch (e) {}
    document.documentElement.style.overflow = 'hidden';

    var canvas = document.getElementById('matrix');
    var ctx = canvas.getContext('2d');
    var closedImage = document.getElementById('closed');
    var openedImage = document.getElementById('opened');
    var blueScan = document.getElementById('blue-scan');
    var loading = document.getElementById('loading');
    var progressBar = document.getElementById('loading-progress');
    var progressPercent = document.getElementById('loading-percent');

    var width, height, drops;
    var fontSize = 14;
    var characters = '010101010101';
    var fini = false;
    var timers = [];

    function resizeMatrix() {
        var dpr = window.devicePixelRatio || 1;
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drops = Array(Math.ceil(width / fontSize)).fill(1);
    }

    function drawMatrix() {
        ctx.fillStyle = 'rgba(10, 20, 12, 0.12)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#00ff66';
        ctx.font = fontSize + 'px monospace';

        for (var i = 0; i < drops.length; i++) {
            var char = characters[Math.floor(Math.random() * characters.length)];
            ctx.fillText(char, i * fontSize, drops[i] * fontSize);
            if (drops[i] * fontSize > height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
        }
    }

    resizeMatrix();
    window.addEventListener('resize', resizeMatrix);
    var matrixTimer = setInterval(drawMatrix, 45);

    var progress = 0;
    var loadingTimer = setInterval(function () {
        if (progress < 100) {
            progress++;
            progressBar.style.width = progress + '%';
            progressPercent.textContent = progress + '%';
        }
        if (progress >= 100) clearInterval(loadingTimer);
    }, 65);

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

    function fermer() {
        if (fini || !splash.parentNode) return;
        fini = true;
        timers.forEach(clearTimeout);
        clearInterval(matrixTimer);
        clearInterval(loadingTimer);
        window.removeEventListener('resize', resizeMatrix);
        canvas.classList.add('hide');
        loading.classList.add('hide');
        splash.classList.add('splash-fin');
        document.documentElement.style.overflow = '';
        setTimeout(function () {
            if (splash.parentNode) splash.parentNode.removeChild(splash);
        }, 800);
    }

    function demarrer() {
        later(function () { blueScan.classList.add('animate'); }, 2500);
        later(function () { openedImage.classList.add('show'); }, 3300);
        later(function () { closedImage.classList.add('slide-up'); }, 3800);
        later(fermer, 6500);
    }

    if (document.readyState === 'complete') demarrer();
    else window.addEventListener('load', demarrer, { once: true });

    splash.addEventListener('click', fermer, { once: true });
    window.addEventListener('app-ready', fermer, { once: true });
})();

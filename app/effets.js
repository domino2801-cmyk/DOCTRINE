(function () {
    var startAnimations = new WeakMap();
    function prepareLink(a) {
        var fill = a.querySelector('.dl-fill');
        var label = a.querySelector('.dl-label');
        var original = a.textContent.trim();
        if (!fill || !label) {
            a.innerHTML = '<span class="dl-fill"></span><span class="dl-label"></span>';
            fill = a.querySelector('.dl-fill');
            label = a.querySelector('.dl-label');
            label.textContent = '⬇ ' + original;
        } else {
            original = label.textContent.replace(/^⬇\s*/, '');
        }
        var timer = null;
        startAnimations.set(a, function () {
            if (timer) return;
            a.classList.remove('dl-done');
            var p = 0;
            fill.style.width = '0%';
            label.textContent = '0%';
            timer = setInterval(function () {
                p += 5;
                fill.style.width = p + '%';
                label.textContent = p + '%';
                if (p >= 100) {
                    clearInterval(timer);
                    setTimeout(function () {
                        a.classList.add('dl-done');
                        label.textContent = '✓ Ouvert';
                        setTimeout(function () {
                            a.classList.remove('dl-done');
                            fill.style.width = '0%';
                            label.textContent = '⬇ ' + original;
                            timer = null;
                        }, 2000);
                    }, 200);
                }
            }, 35);
        });
    }
    document.querySelectorAll('a.doc-link').forEach(prepareLink);
    document.addEventListener('click', function (event) {
        if (!(event.target instanceof Element)) return;
        var link = event.target.closest('a.doc-link');
        if (link && !startAnimations.has(link)) prepareLink(link);
        var startAnimation = link && startAnimations.get(link);
        if (startAnimation) startAnimation();
    }, true);
})();

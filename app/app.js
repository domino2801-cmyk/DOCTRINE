const module1Key = 'module1_validated';
    const lastModuleKey = 'bm4-last-module';
    const modulesToLock = ['btn-mod2', 'btn-mod3', 'btn-mod4', 'btn-mod5', 'btn-mod6', 'btn-mod7'];
    const moduleButtonMap = {
        module1: 'btn-mod1',
        module2: 'btn-mod2',
        module3: 'btn-mod3',
        module4: 'btn-mod4',
        module5: 'btn-mod5',
        module6: 'btn-mod6',
        module7: 'btn-mod7',
        'module-og': 'btn-mod-og'
    };
    const moduleOrder = Object.keys(moduleButtonMap);
    const moduleScrollPositions = new Map();
    let deferredInstallPrompt = null;
    let networkStatusTimer = null;
    let transmittedDossiers = new Set();
    let correctionAccessEventsLogged = new Set();
    let correctionGateElement = null;
    let correctionVerificationGeneration = 0;
    let qcmModuleAccess = false;
    let ogCorrectionAccess = false;

    function isDossierDone(id) {
        const dossier = document.querySelector('.mod-body[data-mod="3"] input[data-dossier="' + id + '"]');
        return dossier?.closest('.dossier-item')?.querySelector('[data-study-status]')?.value === 'mastered';
    }

    function isAdminUser() {
        return !!(window.DoctrineAuth && window.DoctrineAuth.estAdmin && window.DoctrineAuth.estAdmin());
    }

    function isOgCorrectionAllowed() {
        return ogCorrectionAccess || window.__doctrineOgCorrectionAccess === true;
    }

    function afficherStatutSynchronisationProgression(message, erreur) {
        const status = document.getElementById('progressionSyncStatus');
        if (!status) return;
        status.textContent = message;
        status.hidden = !message;
        status.classList.toggle('progression-sync-error', Boolean(erreur));
    }

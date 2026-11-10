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
        module7: 'btn-mod7'
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

    function isDossierDone(id) {
        const dossier = document.querySelector('.mod-body[data-mod="3"] input[data-dossier="' + id + '"]');
        return dossier?.closest('.dossier-item')?.querySelector('[data-study-status]')?.value === 'mastered';
    }

    function isAdminUser() {
        return !!(window.DoctrineAuth && window.DoctrineAuth.estAdmin && window.DoctrineAuth.estAdmin());
    }

    function afficherStatutSynchronisationProgression(message, erreur) {
        const status = document.getElementById('progressionSyncStatus');
        if (!status) return;
        status.textContent = message;
        status.hidden = !message;
        status.classList.toggle('progression-sync-error', Boolean(erreur));
    }

    function enregistrerEvenementProgression(typeEvenement, moduleId, dossierId) {
        const auth = window.DoctrineAuth;
        if (!auth || isAdminUser()) return;

        auth.jeton().then(function(token) {
            if (!token) throw new Error('Session authentifiée indisponible.');
            const event = { event_type: typeEvenement, module_id: moduleId };
            if (dossierId !== undefined && dossierId !== null) event.dossier = Number(dossierId);
            return fetch(auth.url + '/rest/v1/doctrine_progress_events', {
                method: 'POST',
                headers: {
                    apikey: auth.key,
                    Authorization: 'Bearer ' + token,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify(event),
                keepalive: true
            }).then(function(response) {
                if (!response.ok) {
                    return response.text().then(function(detail) {
                        throw new Error('HTTP ' + response.status + (detail ? ' : ' + detail : ''));
                    });
                }
            });
        }).then(function() {
            afficherStatutSynchronisationProgression('Étape synchronisée avec votre compte.', false);
        }).catch(function(error) {
            console.error('Échec de l’enregistrement de la progression DOCTRINE.', error);
            afficherStatutSynchronisationProgression('Étape non synchronisée. Vérifiez votre connexion puis réessayez.', true);
        });
    }

    // Un dossier du module 4 n'est consultable que s'il est marqué « Fait » dans le module 3 (sauf admin).
    function isDossierAvailable(id) {
        return isAdminUser() || isDossierDone(id);
    }

    window.bm4IsDossierAvailable = isDossierAvailable;

    function isModule4Unlocked() {
        if (isAdminUser()) return true;
        return Array.from(document.querySelectorAll('.mod-body[data-mod="3"] input[data-dossier]')).some(function(box) {
            return isDossierDone(box.getAttribute('data-dossier'));
        });
    }

    function canOpenModule(id) {
        if (qcmModuleAccess) return true;
        if (id === 'module1') return true;
        if (!isModule1Unlocked()) return false;
        return id !== 'module4' || isModule4Unlocked();
    }

    function canViewCorrige(id) {
        return !!id && (isAdminUser() || (isDossierDone(id) && transmittedDossiers.has(String(id))));
    }

    function hasCorrectionAccess() {
        const rows = document.querySelectorAll('#corrigeList .dossier-item input[data-corrige]');
        return Array.from(rows).some(function(box) {
            return canViewCorrige(box.getAttribute('data-corrige'));
        });
    }

    function loadTransmittedDossiers() {
        const auth = window.DoctrineAuth;
        if (!auth || typeof auth.jeton !== 'function') return Promise.resolve();
        return auth.jeton().then(function(jeton) {
            if (!jeton) return null;
            return fetch(auth.url + '/functions/v1/doctrine-submit-fiche', {
                headers: { apikey: auth.key, Authorization: 'Bearer ' + jeton }
            });
        }).then(function(response) {
            if (!response || !response.ok) return null;
            return response.json();
        }).then(function(data) {
            if (!data || !Array.isArray(data.dossiers)) return;
            transmittedDossiers = new Set(data.dossiers.map(String));
            updateCorrectionAccess();
        }).catch(function() {});
    }

    function updateCorrectionAccess() {
        const list = document.getElementById('corrigeList');
        const accessAllowed = hasCorrectionAccess();
        if (list) {
            list.hidden = !accessAllowed;
            list.querySelectorAll('.dossier-item').forEach(function(row) {
                const box = row.querySelector('input[data-corrige]');
                row.hidden = !box || !canViewCorrige(box.getAttribute('data-corrige'));
                if (!row.hidden && box) {
                    const dossier = String(box.getAttribute('data-corrige'));
                    if (!correctionAccessEventsLogged.has(dossier)) {
                        correctionAccessEventsLogged.add(dossier);
                        enregistrerEvenementProgression('correction_accessible', '4', dossier);
                    }
                }
            });
        }
        const moduleBody = document.querySelector('.mod-body[data-mod="4"]');
        if (moduleBody) moduleBody.classList.toggle('corrections-locked', !accessAllowed);
    }

    function updateCorrectionDossierOptions() {
        const gate = correctionGateElement;
        const moduleBody = document.querySelector('.mod-body[data-mod="4"]');
        const dossierSelect = gate && gate.querySelector('#correctionDossier');
        if (!gate || !moduleBody || !dossierSelect) return;

        const currentValue = dossierSelect.value;
        const heading = Array.from(moduleBody.querySelectorAll('p > strong')).find(function(element) {
            return element.textContent.trim().startsWith('4.2.');
        });
        const progress = moduleBody.querySelector('#progBarMod4')?.closest('.progress-container');
        if (heading) heading.closest('p').after(gate);
        else if (progress) progress.before(gate);

        const dossiers = document.querySelectorAll('.mod-body[data-mod="3"] input[data-dossier]');
        dossierSelect.replaceChildren(new Option('Dossier rédigé dans le module 3…', ''));
        dossiers.forEach(function(box) {
            const name = box.closest('.dossier-item')?.querySelector(':scope > label > span')?.textContent.trim();
            const id = box.getAttribute('data-dossier');
            if (!name || !id || !isDossierAvailable(id)) return;
            dossierSelect.add(new Option(name, id));
        });
        dossierSelect.value = Array.from(dossierSelect.options).some(function(option) {
            return option.value === currentValue;
        }) ? currentValue : '';
        dossierSelect.disabled = dossierSelect.options.length <= 1;
        updateCorrectionAccess();
    }

    function resetCorrectionGate() {
        const dossierSelect = document.getElementById('correctionDossier');
        const fileInput = document.getElementById('correctionFile');
        const fileName = document.getElementById('correctionFileName');
        const status = document.getElementById('correctionGateStatus');
        if (dossierSelect) dossierSelect.value = '';
        if (fileInput) fileInput.value = '';
        if (fileName) fileName.textContent = 'Aucun fichier sélectionné.';
        if (status) status.textContent = '';
        resetCorrectionVerification();
        updateCorrectionAccess();
    }

    function resetCorrectionVerification() {
        correctionVerificationGeneration++;
        const container = document.getElementById('correctionVerification');
        if (container) container.hidden = true;
    }

    function updateCorrectionVerification(value, label) {
        const container = document.getElementById('correctionVerification');
        const progress = document.getElementById('correctionVerificationProgress');
        const text = document.getElementById('correctionVerificationLabel');
        if (!container || !progress || !text) return;
        container.hidden = false;
        progress.value = value;
        text.textContent = label + ' : ' + value + ' %';
    }

    function setActiveModuleButton(id) {
        Object.entries(moduleButtonMap).forEach(([moduleId, buttonId]) => {
            const button = document.getElementById(buttonId);
            if (!button) return;
            const isActive = moduleId === id;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-expanded', String(isActive));
        });
    }

    function getModule1State() {
        try {
            return localStorage.getItem(module1Key) === 'true';
        } catch (error) {
            return false;
        }
    }

    function enregistrerDossierTermine(id) {
        enregistrerEvenementProgression('dossier_completed', '3', id);
        const dossiers = Array.from(document.querySelectorAll('.mod-body[data-mod="3"] input[data-dossier]'));
        if (dossiers.length > 0 && dossiers.every(function(box) {
            return box.closest('.dossier-item')?.querySelector('[data-study-status]')?.value === 'mastered';
        })) {
            enregistrerEvenementProgression('module_completed', '3');
        }
    }

    function setModule1State(value) {
        try {
            localStorage.setItem(module1Key, String(value));
        } catch (error) {
            // localStorage may be unavailable in some contexts; ignore safely
        }
    }

    function isModule1Unlocked() {
        const checkbox = document.getElementById('chkModule1Valid');
        return Boolean((checkbox && checkbox.checked) || getModule1State());
    }

    function updateModuleLockUI() {
        const checkbox = document.getElementById('chkModule1Valid');
        const lockWarning = document.getElementById('lockWarning');
        const isUnlocked = isModule1Unlocked();

        if (checkbox) {
            checkbox.checked = isUnlocked;
        }

        modulesToLock.forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const moduleId = Object.keys(moduleButtonMap).find(key => moduleButtonMap[key] === id);
            const isOpenable = canOpenModule(moduleId);
            btn.disabled = !isOpenable;
            btn.style.opacity = isOpenable ? '1' : '0.5';
            btn.style.cursor = isOpenable ? 'pointer' : 'not-allowed';
            btn.style.backgroundColor = isOpenable ? '' : '#e2e8f0';
            btn.style.color = isOpenable ? '' : '#94a3b8';
            if (moduleId === 'module4') {
                btn.title = isOpenable || !isUnlocked ? '' : 'Marquez au moins un dossier « Fait » dans le module 3 pour accéder au module 4.';
            }
        });

        if (lockWarning) {
            lockWarning.style.display = isUnlocked || qcmModuleAccess ? 'none' : 'block';
        }
        updateModuleNavigation();
        updateResumeModule(getLastModule());
    }

    // Tant que le module 4 est verrouillé, la navigation le saute (3 ↔ 5).
    function neighborModule(index, step) {
        let target = index + step;
        while (target >= 0 && target < moduleOrder.length && moduleOrder[target] === 'module4' && !canOpenModule('module4')) {
            target += step;
        }
        return target >= 0 && target < moduleOrder.length ? moduleOrder[target] : null;
    }

    function updateModuleNavigation(activeModule) {
        moduleOrder.forEach(function(moduleId, index) {
            const modal = document.getElementById('modal-' + moduleId);
            if (!modal) return;
            const previous = modal.querySelector('.module-nav-previous');
            const next = modal.querySelector('.module-nav-next');
            const previousId = neighborModule(index, -1);
            const nextId = neighborModule(index, 1);
            if (previous) previous.disabled = !previousId || !canOpenModule(previousId);
            if (next) next.disabled = !nextId || !canOpenModule(nextId);
        });
    }

    function navigateModule(id) {
        if (id === 'module4' && isModule1Unlocked() && !canOpenModule(id)) {
            const currentModal = Array.from(document.querySelectorAll('.modal')).find(function(item) {
                return item.style.display === 'block';
            });
            id = currentModal && currentModal.id === 'modal-module5' ? 'module3' : 'module5';
        }
        openModal(id);
    }

    function openModal(id) {
        if (!Object.prototype.hasOwnProperty.call(moduleButtonMap, id)) return;
        if (id === 'module4' && isModule1Unlocked() && !canOpenModule(id)) {
            alert('Marquez au moins un dossier « Fait » dans le module 3 pour accéder au module 4.');
            return;
        }
        if (canOpenModule(id)) {
            const modal = document.getElementById('modal-' + id);
            if (!modal) return;
            const currentModal = Array.from(document.querySelectorAll('.modal')).find(function(item) {
                return item.style.display === 'block';
            });
            if (currentModal && currentModal !== modal) {
                const currentContent = currentModal.querySelector('.modal-content');
                moduleScrollPositions.set(currentModal.id, {
                    modal: currentModal.scrollTop,
                    content: currentContent ? currentContent.scrollTop : 0
                });
            }
            document.querySelectorAll('.modal').forEach(function(item) {
                if (item !== modal) item.style.display = 'none';
            });
            if (id === 'module4') { resetCorrectionGate(); loadTransmittedDossiers(); }
            if (id === 'module1') {
                modal.querySelectorAll('.jury-accordeon').forEach(function(accordeon) {
                    accordeon.open = false;
                });
            }
            modal.style.display = 'block';
            const position = moduleScrollPositions.get(modal.id);
            const content = modal.querySelector('.modal-content');
            modal.scrollTop = position ? position.modal : 0;
            if (content) content.scrollTop = position ? position.content : 0;
            setActiveModuleButton(id);
            updateModuleNavigation(id);
            const heading = modal.querySelector('h2');
            if (heading) {
                heading.setAttribute('tabindex', '-1');
                heading.focus({ preventScroll: true });
            }
            enregistrerEvenementProgression('module_started', id.replace('module', ''));
            try {
                localStorage.setItem(lastModuleKey, id);
            } catch (error) {
                console.warn('La reprise du dernier module ne peut pas être mémorisée.', error);
            }
            updateResumeModule(id);
        } else {
            alert("Veuillez cocher « J'ai lu l'ensemble du module » pour accéder aux suivants.");
        }
    }

    document.addEventListener('doctrine:login', function(event) {
        qcmModuleAccess = Boolean(event.detail && event.detail.accesQcm);
        correctionAccessEventsLogged = new Set();
        updateModuleLockUI();
    });

    document.addEventListener('doctrine:logout', function() {
        qcmModuleAccess = false;
        correctionAccessEventsLogged = new Set();
        transmittedDossiers = new Set();
        document.querySelectorAll('.modal').forEach(function(modal) {
            if (!canOpenModule(modal.id.replace('modal-', ''))) modal.style.display = 'none';
        });
        setActiveModuleButton(null);
        updateModuleLockUI();
    });

    function getLastModule() {
        try {
            const id = localStorage.getItem(lastModuleKey);
            return Object.prototype.hasOwnProperty.call(moduleButtonMap, id) ? id : 'module1';
        } catch (error) {
            return 'module1';
        }
    }

    function updateResumeModule(id) {
        const button = document.getElementById('resumeModuleButton');
        const description = document.getElementById('resumeModuleDescription');
        if (!button || !description) return;
        const number = id.replace('module', '');
        button.textContent = id === 'module1' && !getModule1State()
            ? 'Commencer le module 1'
            : 'Reprendre le module ' + number;
        description.textContent = id === 'module1' && !getModule1State() && !qcmModuleAccess
            ? 'Commencez par le module 1 pour débloquer la suite.'
            : 'Votre dernier module consulté : module ' + number + '.';
    }

    function resumeLastModule() {
        let id = getLastModule();
        if (!canOpenModule(id)) id = id === 'module4' && isModule1Unlocked() ? 'module3' : 'module1';
        openModal(id);
    }

    function closeModal(id) {
        const modal = document.getElementById('modal-' + id);
        if (modal) {
            const content = modal.querySelector('.modal-content');
            moduleScrollPositions.set(modal.id, {
                modal: modal.scrollTop,
                content: content ? content.scrollTop : 0
            });
            modal.style.display = 'none';
        }
        setActiveModuleButton(null);
        const opener = document.getElementById(moduleButtonMap[id]);
        if (opener) opener.focus();
    }

    window.onclick = function (event) {
        if (event.target.classList.contains('modal')) {
            closeModal(event.target.id.replace('modal-', ''));
        }
    };

    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        const modal = Array.from(document.querySelectorAll('.modal')).find(function (item) {
            return item.style.display === 'block';
        });
        if (modal) closeModal(modal.id.replace('modal-', ''));
    });

    function showStatusChip(element, message, options = {}) {
        if (!element) return;

        element.textContent = message;
        element.hidden = false;
        element.classList.add('is-visible');
        element.classList.toggle('is-offline', Boolean(options.offline));
    }

    function hideStatusChip(element) {
        if (!element) return;

        element.hidden = true;
        element.textContent = '';
        element.classList.remove('is-visible', 'is-offline');
    }

    function isStandaloneMode() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    function updateInstallButtonVisibility() {
        const installButton = document.getElementById('installAppButton');
        if (!installButton) return;

        const shouldShow = Boolean(deferredInstallPrompt) && !isStandaloneMode();
        installButton.hidden = !shouldShow;
        installButton.classList.toggle('is-visible', shouldShow);
    }

    function updateNetworkStatus(announceOnline = false) {
        const networkStatus = document.getElementById('networkStatus');
        if (!networkStatus) return;

        window.clearTimeout(networkStatusTimer);

        if (navigator.onLine === false) {
            showStatusChip(networkStatus, 'Mode hors ligne : les liens externes nécessitent Internet.', { offline: true });
            return;
        }

        if (announceOnline) {
            showStatusChip(networkStatus, 'Connexion rétablie.', { offline: false });
            networkStatusTimer = window.setTimeout(() => hideStatusChip(networkStatus), 3000);
            return;
        }

        hideStatusChip(networkStatus);
    }

    function canRegisterServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            return false;
        }

        if (window.isSecureContext) {
            return true;
        }

        return /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/.test(window.location.hostname);
    }

    function bindInstallPromptHandlers() {
        const installButton = document.getElementById('installAppButton');
        const appUpdateStatus = document.getElementById('appUpdateStatus');

        window.addEventListener('beforeinstallprompt', function(event) {
            event.preventDefault();
            deferredInstallPrompt = event;
            updateInstallButtonVisibility();
        });

        window.addEventListener('appinstalled', function() {
            deferredInstallPrompt = null;
            updateInstallButtonVisibility();
            showStatusChip(appUpdateStatus, 'Application installée avec succès.');
            window.setTimeout(() => hideStatusChip(appUpdateStatus), 3500);
        });

        if (!installButton) return;

        installButton.addEventListener('click', async function() {
            if (!deferredInstallPrompt) {
                return;
            }

            deferredInstallPrompt.prompt();

            try {
                await deferredInstallPrompt.userChoice;
            } finally {
                deferredInstallPrompt = null;
                updateInstallButtonVisibility();
            }
        });

        updateInstallButtonVisibility();
    }

    async function registerAppServiceWorker() {
        const appUpdateStatus = document.getElementById('appUpdateStatus');

        if (!canRegisterServiceWorker()) {
            return;
        }

        try {
            const serviceWorkerUrl = new URL('sw.js', window.location.href);
            const serviceWorkerScope = new URL('./', window.location.href).pathname;
            const registration = await navigator.serviceWorker.register(serviceWorkerUrl.href, { scope: serviceWorkerScope });
            const notifyUpdateReady = function() {
                showStatusChip(appUpdateStatus, 'Une mise à jour locale est prête. Fermez puis rouvrez l’application.');
            };

            if (navigator.serviceWorker.controller) {
                let reloadedForUpdate = false;
                navigator.serviceWorker.addEventListener('controllerchange', function() {
                    if (reloadedForUpdate) return;
                    reloadedForUpdate = true;
                    window.location.reload();
                });
            }

            if (registration.waiting) {
                notifyUpdateReady();
            }

            registration.addEventListener('updatefound', function() {
                const installingWorker = registration.installing;
                if (!installingWorker) return;

                installingWorker.addEventListener('statechange', function() {
                    if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        notifyUpdateReady();
                    }
                });
            });

            navigator.serviceWorker.ready.then(function(readyRegistration) {
                readyRegistration.update().catch(function() {
                    // Ignore update polling errors safely
                });
            });
        } catch (error) {
            console.warn('Service worker non enregistré :', error);
        }
    }

    // Présente chaque partie / sous-partie des modules sous forme de carte, y compris pour le contenu publié par l'admin.
    // Rapport du jury sans document publié (lien vide) : message au lieu d'un rechargement de la page.
    document.addEventListener('click', function(event) {
        if (document.body.classList.contains('adm-on')) return;
        const link = event.target instanceof Element ? event.target.closest('.annees-jury a') : null;
        if (!link || (link.getAttribute('href') || '').trim() !== '') return;
        event.preventDefault();
        const year = link.textContent.trim();
        const container = link.closest('.annees-jury');
        const anchor = container.closest('.dossier-item') || container;
        let message = anchor.parentElement.querySelector('.jury-year-message');
        if (!message) {
            message = document.createElement('p');
            message.className = 'jury-year-message adm-ui';
            message.setAttribute('role', 'status');
            message.setAttribute('aria-live', 'polite');
            anchor.after(message);
        }
        message.textContent = 'Le rapport du jury ' + year + ' n’est pas encore publié.';
        message.hidden = false;
        clearTimeout(message.hideTimer);
        message.hideTimer = setTimeout(function() { message.hidden = true; }, 6000);
    });

    function isPartHeading(element) {
        if (element.matches('p')) {
            const first = element.firstElementChild;
            return !!first && first.tagName === 'STRONG' && /^\d\.\d\./.test(first.textContent.trim());
        }
        if (element.matches('ul')) {
            const items = element.children;
            const first = items.length === 1 ? items[0].firstElementChild : null;
            return !!first && first.tagName === 'STRONG' && /^\d\.\d\./.test(first.textContent.trim());
        }
        return false;
    }

    // Ancien contenu publié du module 5 : cartes .qcm-carte converties vers le format partie / sous-partie.
    function convertLegacyQcmCards() {
        document.querySelectorAll('.mod-body[data-mod="5"] .qcm-carte').forEach(function(card) {
            const head = card.querySelector('.qcm-carte-tete');
            const number = head && head.querySelector('.qcm-num')?.textContent.trim();
            const title = head && head.querySelector('h3')?.textContent.trim();
            const section = document.createElement('section');
            section.className = 'part-card';
            if (head && title) {
                const heading = document.createElement('p');
                const strong = document.createElement('strong');
                strong.textContent = (number ? number + '. ' : '') + title;
                heading.appendChild(strong);
                section.appendChild(heading);
                head.remove();
            }
            while (card.firstChild) section.appendChild(card.firstChild);
            card.replaceWith(section);
        });
        document.querySelectorAll('.mod-body[data-mod="5"] .qcm-cartes').forEach(function(wrapper) {
            if (!wrapper.children.length) wrapper.remove();
        });
    }

    function harmonizePartCards() {
        document.querySelectorAll('.mod-body[data-mod="1"] > ul > li, .mod-body[data-mod="2"] > div, #modal-module6 .modal-list > li')
            .forEach(function(card) { card.classList.add('part-card'); });

        convertLegacyQcmCards();

        ['3', '4', '5', '7'].forEach(function(id) {
            const body = document.querySelector('.mod-body[data-mod="' + id + '"]');
            if (!body) return;
            let card = null;
            Array.from(body.children).forEach(function(child) {
                if (child.classList.contains('part-card')) { card = null; return; }
                if (isPartHeading(child)) {
                    card = document.createElement('section');
                    card.className = 'part-card';
                    child.before(card);
                }
                if (card) card.appendChild(child);
            });
        });
    }

    function setupQcmReturnLink() {
        document.addEventListener('click', function(event) {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            const link = event.target?.closest?.('#modal-module5 .qcm-acces a[href]');
            if (!link) return;
            if (link.protocol !== 'https:' || !['qcm-major.fr', 'www.qcm-major.fr'].includes(link.hostname)) return;
            if (window.DoctrineAuth && window.DoctrineAuth.retourQcm()) {
                event.preventDefault();
            } else {
                link.target = '_self';
            }
        });
    }

    document.addEventListener('DOMContentLoaded', function() {
        setupQcmReturnLink();
        harmonizePartCards();
        document.addEventListener('doctrine:content-updated', harmonizePartCards);
        let specialtyRows =  [...document.querySelectorAll('#modal-module6 [data-specialty-row]')];
        let specialtyMessage = document.getElementById('candidate-specialty-message');
        let specialtyPicker;
        let specialtySelect;
        let specialtyRequestId = 0;
        let candidateSpecialty = '';
        let adminSelectedSpecialty = '';

        function ensureSpecialtyPicker() {
            specialtyRows = [...document.querySelectorAll('#modal-module6 [data-specialty-row]')];
            specialtyMessage = document.getElementById('candidate-specialty-message');
            if (!specialtyMessage) return;

            const previousValue = specialtySelect?.value || adminSelectedSpecialty;
            specialtyPicker = document.getElementById('admin-specialty-picker');
            if (!specialtyPicker) {
                specialtyPicker = document.createElement('label');
                specialtyPicker.id = 'admin-specialty-picker';
                specialtyPicker.className = 'adm-ui specialty-admin-picker';
                specialtyPicker.htmlFor = 'admin-specialty-select';
                const caption = document.createElement('span');
                caption.textContent = 'Choisir la spécialité à gérer';
                specialtySelect = document.createElement('select');
                specialtySelect.id = 'admin-specialty-select';
                specialtySelect.setAttribute('aria-label', 'Choisir la spécialité à gérer');
                specialtySelect.addEventListener('change', function() {
                    adminSelectedSpecialty = specialtySelect.value;
                    refreshSpecialtyRows();
                });
                specialtyPicker.append(caption, specialtySelect);
                specialtyMessage.before(specialtyPicker);
            } else {
                specialtySelect = specialtyPicker.querySelector('select');
            }

            specialtySelect.replaceChildren(new Option('Sélectionner une spécialité', ''));
            specialtyRows.forEach(function(row) {
                const option = new Option(row.querySelector('.row-text').textContent.trim(), row.dataset.specialty);
                specialtySelect.appendChild(option);
            });
            specialtySelect.value = specialtyRows.some(function(row) {
                return row.dataset.specialty === previousValue;
            }) ? previousValue : '';
            adminSelectedSpecialty = specialtySelect.value;
        }

        function rowForSpecialty(value) {
            const aliases = { EPMS: 'EPS', MATERIEL: 'MAI', RENSEIGNEMENT: 'RENS', GENIE: 'GEN' };
            const prefix = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleUpperCase().split(/[\s\-(]/)[0];
            if (aliases[prefix]) value = aliases[prefix];
            const normalized = value.toLocaleLowerCase('fr');
            const exact = specialtyRows.find(function(row) {
                return row.dataset.specialty.toLocaleLowerCase('fr') === normalized;
            }) || specialtyRows.find(function(row) {
                const label = row.querySelector('.row-text').textContent.trim().toLocaleLowerCase('fr');
                return label === normalized || label.replace(/^[a-z]+\s*-\s*/, '') === normalized;
            });
            if (exact) return exact;

            const other = specialtyRows.find(function(row) {
                return row.dataset.specialty === 'OTHER';
            });
            if (other && value) other.querySelector('.row-text').textContent = 'Autre - ' + value;
            return other && value ? other : null;
        }

        function isAdminAccount() {
            return !!(window.DoctrineAuth && window.DoctrineAuth.estAdmin());
        }

        function refreshSpecialtyRows() {
            ensureSpecialtyPicker();
            if (!specialtyMessage) return;
            const adminMode = document.body.classList.contains('adm-on');
            const administrator = adminMode || isAdminAccount();
            const matchingRow = rowForSpecialty(administrator ? adminSelectedSpecialty : candidateSpecialty);
            specialtyRows.forEach(function(row) {
                row.hidden = row !== matchingRow;
            });
            specialtyMessage.textContent = adminMode
                ? matchingRow
                    ? ''
                    : 'Sélectionnez une spécialité pour gérer sa ressource.'
                : administrator
                    ? matchingRow
                        ? ''
                        : 'Choisissez une spécialité pour consulter ou gérer sa ressource.'
                    : matchingRow
                    ? ''
                    : candidateSpecialty
                        ? 'Aucune ressource de spécialité ne correspond à votre profil.'
                        : 'Aucune spécialité candidate n’est renseignée sur votre profil.';
        }

        function setCandidateSpecialty(specialty) {
            candidateSpecialty = String(specialty || '').trim();
            refreshSpecialtyRows();
        }

        function loadCandidateSpecialty() {
            const requestId = ++specialtyRequestId;
            if (isAdminAccount()) {
                candidateSpecialty = '';
                refreshSpecialtyRows();
                return;
            }
            candidateSpecialty = '';
            specialtyRows.forEach(function(row) { row.hidden = true; });
            specialtyMessage.textContent = 'Chargement de votre spécialité…';
            window.DoctrineAuth.specialite().then(function(specialty) {
                if (requestId === specialtyRequestId) setCandidateSpecialty(specialty);
            }).catch(function(error) {
                if (requestId !== specialtyRequestId) return;
                if (isAdminAccount()) {
                    refreshSpecialtyRows();
                } else {
                    specialtyMessage.textContent = 'Impossible de charger votre spécialité. Réessayez en vous reconnectant.';
                }
                console.error('Échec du chargement de la spécialité du candidat :', error);
            });
        }

        specialtyRows.forEach(function(row) { row.hidden = true; });
        ensureSpecialtyPicker();
        document.addEventListener('doctrine:admin-mode', refreshSpecialtyRows);
        document.addEventListener('doctrine:content-updated', function(event) {
            if (event.detail?.moduleId !== '6') return;
            refreshSpecialtyRows();
        });
        document.addEventListener('doctrine:login', function() {
            document.body.classList.toggle('admin-account', isAdminAccount());
            loadCandidateSpecialty();
        });
        document.addEventListener('doctrine:logout', function() {
            specialtyRequestId++;
            candidateSpecialty = '';
            document.body.classList.remove('admin-account');
            specialtyRows.forEach(function(row) { row.hidden = true; });
            specialtyMessage.textContent = 'Connectez-vous pour afficher votre spécialité.';
        });

        const checkbox = document.getElementById('chkModule1Valid');
        const presentationError = document.createElement('p');
        presentationError.id = 'module1PresentationError';
        presentationError.setAttribute('role', 'alert');
        presentationError.hidden = true;
        presentationError.style.cssText = 'margin:8px 0 0;color:#c0392b;font-weight:bold;';
        if (checkbox) checkbox.closest('div').after(presentationError);

        // Lien « Ouvrir » de la rubrique 1.1 (adresse lue dans le contenu courant, éventuellement modifié par l'admin).
        function presentationDriveId() {
            const heading = Array.from(document.querySelectorAll('.mod-body[data-mod="1"] strong'))
                .find(function(el) { return el.textContent.trim().startsWith('1.1.'); });
            const link = heading && heading.closest('li')?.querySelector('a[href]');
            const match = link && link.href.match(/\/(?:file|folders)\/d?\/?([\w-]{10,})/);
            return match ? match[1] : '';
        }

        // Retourne true seulement si une ouverture de la présentation est enregistrée pour ce candidat.
        function hasOpenedPresentation() {
            const auth = window.DoctrineAuth;
            if (!auth || auth.estAdmin()) return Promise.resolve(true);
            const id = presentationDriveId();
            if (!id) return Promise.resolve(true);
            return auth.jeton().then(function(token) {
                if (!token) return false;
                const query = 'doctrine_document_views?select=id&module_id=eq.1&event_type=eq.open&limit=1&document_url=like.' +
                    encodeURIComponent('*' + id + '*');
                return fetch(auth.url + '/rest/v1/' + query, {
                    headers: { apikey: auth.key, Authorization: 'Bearer ' + token }
                }).then(function(response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.json();
                }).then(function(rows) { return rows.length > 0; });
            });
        }

        if (checkbox) {
            checkbox.checked = getModule1State();
            checkbox.addEventListener('change', function() {
                presentationError.hidden = true;
                if (!this.checked) {
                    setModule1State(false);
                    updateModuleLockUI();
                    return;
                }
                const box = this;
                box.disabled = true;
                hasOpenedPresentation().then(function(opened) {
                    box.disabled = false;
                    if (!opened) {
                        box.checked = false;
                        presentationError.textContent = 'Vous n’avez même pas ouvert la présentation du BM4 (rubrique 1.1). Ouvrez-la avant de valider le module.';
                        presentationError.hidden = false;
                        return;
                    }
                    setModule1State(true);
                    enregistrerEvenementProgression('module_completed', '1');
                    updateModuleLockUI();
                }).catch(function() {
                    box.disabled = false;
                    box.checked = false;
                    presentationError.textContent = 'Vérification impossible pour le moment (connexion ou droits). Réessayez.';
                    presentationError.hidden = false;
                });
            });
        }

        modulesToLock.forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', function(e) {
                if (this.disabled) {
                    alert("Veuillez cocher j'ai lu l'ensemble du module pour accéder au suivant");
                    e.stopPropagation();
                }
            });
        });

        updateModuleLockUI();
        correctionGateElement = document.getElementById('correctionGate');
        updateCorrectionAccess();
        updateCorrectionDossierOptions();

        const correctionUploadForm = document.getElementById('correctionUploadForm');
        if (correctionUploadForm) {
            const dossierSelect = document.getElementById('correctionDossier');
            const fileInput = document.getElementById('correctionFile');
            const fileName = document.getElementById('correctionFileName');
            const openUploadButton = document.getElementById('openCorrectionUpload');
            if (openUploadButton && fileInput && dossierSelect) {
                openUploadButton.addEventListener('click', function() {
                    const status = document.getElementById('correctionGateStatus');
                    if (!dossierSelect.value) {
                        if (status) status.textContent = 'Choisissez d’abord un dossier du module 3.';
                        dossierSelect.focus();
                        return;
                    }
                    if (status) status.textContent = '';
                    fileInput.click();
                });
            }
            document.querySelector('.mod-body[data-mod="3"]')?.addEventListener('change', updateCorrectionDossierOptions);
            if (dossierSelect && fileInput && fileName) {
                dossierSelect.addEventListener('change', function() {
                    fileInput.value = '';
                    fileName.textContent = 'Aucun fichier sélectionné.';
                    resetCorrectionVerification();
                    updateCorrectionAccess();
                });
                fileInput.addEventListener('change', function() {
                    fileName.textContent = fileInput.files && fileInput.files[0]
                        ? fileInput.files[0].name
                        : 'Aucun fichier sélectionné.';
                    resetCorrectionVerification();
                    updateCorrectionAccess();
                });
            }
            correctionUploadForm.addEventListener('submit', function(event) {
                event.preventDefault();
                const status = document.getElementById('correctionGateStatus');
                const file = fileInput && fileInput.files && fileInput.files[0];
                if (!dossierSelect || !dossierSelect.value) {
                    if (status) status.textContent = 'Choisissez le dossier correspondant dans le module 3.';
                    dossierSelect?.focus();
                    return;
                }
                if (!isDossierAvailable(dossierSelect.value)) {
                    updateCorrectionAccess();
                    if (status) status.textContent = 'Ce dossier n’est pas marqué « Fait » dans le module 3 : terminez-le avant d’ouvrir son corrigé.';
                    return;
                }
                if (!file || !/\.(pdf|docx?)$/i.test(file.name)) {
                    if (status) status.textContent = 'Ouvrez le téléversement et choisissez un fichier PDF, DOC ou DOCX.';
                    return;
                }

                const auth = window.DoctrineAuth;
                const submitButton = correctionUploadForm.querySelector('button[type="submit"]');
                if (!auth || typeof auth.jeton !== 'function') {
                    if (status) status.textContent = 'Connexion indisponible : impossible de transmettre la fiche.';
                    return;
                }
                if (submitButton) submitButton.disabled = true;
                dossierSelect.disabled = true;
                if (openUploadButton) openUploadButton.disabled = true;
                resetCorrectionVerification();
                const verificationGeneration = correctionVerificationGeneration;
                if (status) status.textContent = 'Envoi de la fiche en cours…';
                const dossierId = dossierSelect.value;
                let verificationProgress = null;
                if (/\.pdf$/i.test(file.name)) {
                    verificationProgress = 0;
                    updateCorrectionVerification(0, 'Vérification en cours');
                }

                auth.jeton().then(function(jeton) {
                    if (!jeton) throw new Error('Session expirée : reconnectez-vous.');
                    const validation = /\.pdf$/i.test(file.name)
                        ? (function() {
                            if (status) status.textContent = 'Vérification du gabarit PDF…';
                            if (typeof window.DoctrinePdfLoader !== 'function') {
                                throw new Error('Le lecteur PDF est indisponible. Rechargez la page.');
                            }
                            return Promise.all([import('./validate-gabarit.mjs'), window.DoctrinePdfLoader().catch(function(error) {
                                console.error('Chargement du lecteur PDF impossible', error);
                                throw new Error('Impossible de charger le lecteur PDF. Vérifiez votre connexion puis réessayez.');
                            })])
                                .then(function(values) {
                                    return values[0].validateGabarit(file, auth, jeton, values[1], function(value) {
                                        verificationProgress = value;
                                        if (verificationGeneration === correctionVerificationGeneration) {
                                            updateCorrectionVerification(value, value === 100 ? 'Vérification terminée' : 'Vérification en cours');
                                        }
                                    });
                                }).then(function(data) {
                                if (!data.conforme) {
                                    throw new Error('Fiche non conforme : ' + (data.error || data.message || 'utilisez le gabarit officiel.'));
                                }
                                if (status) status.textContent = 'Gabarit officiel validé (' + data.score + '%). Transmission de la fiche en cours…';
                            });
                        })()
                        : Promise.resolve();
                    return validation.then(function() {
                        const body = new FormData();
                        body.append('file', file);
                        body.append('dossier', dossierId);
                        return fetch(auth.url + '/functions/v1/doctrine-submit-fiche', {
                            method: 'POST',
                            headers: { apikey: auth.key, Authorization: 'Bearer ' + jeton },
                            body: body
                        });
                    });
                }).then(function(response) {
                    return response.json().catch(function() { return {}; }).then(function(data) {
                        if (!response.ok) throw new Error(data.error || 'Envoi impossible (HTTP ' + response.status + ').');
                        transmittedDossiers.add(String(dossierId));
                        updateCorrectionAccess();
                        if (status) status.textContent = canViewCorrige(dossierId)
                            ? 'Fiche transmise : le corrigé du dossier est désormais disponible.'
                            : 'Fiche transmise. Marquez ce dossier « Fait » dans le module 3 pour afficher son corrigé.';
                        document.querySelector('#corrigeList .dossier-item:not([hidden])')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    });
                }).catch(function(error) {
                    console.error('Erreur de validation ou de transmission de la fiche', error);
                    if (verificationGeneration === correctionVerificationGeneration && verificationProgress !== null && verificationProgress < 100) {
                        updateCorrectionVerification(verificationProgress, 'Vérification interrompue');
                    }
                    updateCorrectionAccess();
                    if (status) status.textContent = error.message || 'Envoi impossible. Réessayez.';
                }).finally(function() {
                    if (submitButton) submitButton.disabled = false;
                    dossierSelect.disabled = dossierSelect.options.length <= 1;
                    if (openUploadButton) openUploadButton.disabled = false;
                });
            });
        }

        const module4 = document.getElementById('modal-module4');
        if (module4) {
            module4.addEventListener('click', function(event) {
                const target = event.target;
                if (!(target instanceof Element)) return;
                const link = target.closest('#corrigeList a');
                if (!link) return;
                const corrigeId = link.closest('.dossier-item')?.querySelector('input[data-corrige]')?.getAttribute('data-corrige');
                if (canViewCorrige(corrigeId)) return;
                event.preventDefault();
                const status = document.getElementById('correctionGateStatus');
                if (status) status.textContent = 'Marquez ce dossier « Fait » dans le module 3 et transmettez sa fiche pour ouvrir son corrigé.';
                document.getElementById('correctionFile')?.focus();
            });
        }
        loadTransmittedDossiers();
        document.addEventListener('doctrine:login', loadTransmittedDossiers);
        document.addEventListener('doctrine:logout', function() {
            transmittedDossiers = new Set();
            correctionAccessEventsLogged = new Set();
            updateCorrectionAccess();
        });

        const studyStatuses = [
            ['todo', 'À faire'],
            ['mastered', 'Fait']
        ];
        const corrigeStatuses = [
            ['todo', 'Non lu'],
            ['mastered', 'Lu']
        ];
        const studyGroups = [
            { attr: 'data-dossier', kind: 'dossier', legacyPrefix: 'dossier-', statuses: studyStatuses, checkedStatus: 'mastered', bar: 'progBar', text: 'progText', label: 'Avancement exercices : ' },
            { attr: 'data-corrige', kind: 'corrige', legacyPrefix: 'corrige-', statuses: corrigeStatuses, checkedStatus: 'mastered', bar: 'progBarMod4', text: 'progTextMod4', label: 'Avancement corrigés : ' }
        ];

        function studyStorageKey(kind, id, field) {
            return 'bm4-study-' + kind + '-' + id + '-' + field;
        }

        function readStudyValue(key) {
            try {
                return localStorage.getItem(key);
            } catch (error) {
                console.warn('Le suivi des révisions ne peut pas être lu.', error);
                return null;
            }
        }

        function saveStudyValue(key, value) {
            try {
                localStorage.setItem(key, value);
            } catch (error) {
                console.warn('Le suivi des révisions ne peut pas être enregistré.', error);
            }
        }

        function filterDossiersByDifficulty() {
            const list = document.getElementById('studyDossierList');
            const filter = document.getElementById('dossierDifficultyFilter');
            const count = document.getElementById('dossierFilterCount');
            if (!list || !filter || !count) return;

            let visible = 0;
            list.querySelectorAll(':scope > .dossier-item').forEach(function(row) {
                const stars = row.querySelector('.stars')?.textContent.match(/★/g)?.length || 0;
                const matches = !filter.value || stars === Number(filter.value);
                row.hidden = !matches;
                if (matches) visible++;
            });
            count.textContent = visible + (visible === 1 ? ' dossier affiché' : ' dossiers affichés');
        }

        function updateRecommendedDossier() {
            const list = document.getElementById('studyDossierList');
            const text = document.getElementById('recommendedDossierText');
            if (!list || !text) return;

            const next = Array.from(list.querySelectorAll(':scope > .dossier-item'))
                .map(function(row, order) {
                    return {
                        row: row,
                        order: order,
                        stars: row.querySelector('.stars')?.textContent.match(/★/g)?.length || 0
                    };
                })
                .filter(function(item) {
                    return item.row.querySelector('[data-study-status]')?.value !== 'mastered';
                })
                .sort(function(a, b) {
                    return a.stars - b.stars || a.order - b.order;
                });
            const nextItem = next[0];
            if (!nextItem) {
                text.textContent = 'Parcours conseillé terminé : tous les dossiers sont marqués « Fait ».';
                return;
            }

            const name = nextItem.row.querySelector('label > span')?.textContent.trim() || 'Dossier';
            const stars = nextItem.stars;
            text.textContent = 'Prochain dossier conseillé : ' + name + ' — ' +
                stars + (stars === 1 ? ' étoile.' : ' étoiles.');
        }

        function addTrackingField(container, labelText, control, resourceName) {
            const label = document.createElement('label');
            const caption = document.createElement('span');
            label.className = 'dossier-tracking-field';
            caption.textContent = labelText;
            control.setAttribute('aria-label', labelText + ' — ' + resourceName);
            label.append(caption, control);
            container.appendChild(label);
        }

        function ensureStudyControls(box, group) {
            const row = box.closest('.dossier-item');
            if (!row) return null;
            const id = box.getAttribute(group.attr);
            const statusKey = studyStorageKey(group.kind, id, 'status');
            let status = readStudyValue(statusKey);
            if (!group.statuses.some(function(option) { return option[0] === status; })) {
                const wasStarted = status ? status !== 'todo' : readStudyValue(group.legacyPrefix + id) === 'true';
                status = wasStarted ? group.checkedStatus : 'todo';
                saveStudyValue(statusKey, status);
            }

            const resourceName = row.querySelector('label')?.textContent.trim() || group.kind + ' ' + id;
            row.classList.add('study-tracked-item');
            row.classList.remove('study-status-todo', 'study-status-in-progress', 'study-status-review', 'study-status-mastered');
            row.classList.add('study-status-' + status);
            row.classList.toggle('completed', status === 'mastered');
            box.checked = status !== 'todo';
            box.hidden = true;
            if (box.parentElement !== row) row.appendChild(box);

            let controls = row.querySelector('.dossier-tracking-controls');
            if (!controls) {
                controls = document.createElement('div');
                controls.className = 'dossier-tracking-controls adm-ui';

                const statusSelect = document.createElement('select');
                statusSelect.dataset.studyStatus = '';
                group.statuses.forEach(function(option) {
                    const element = document.createElement('option');
                    element.value = option[0];
                    element.textContent = option[1];
                    statusSelect.appendChild(element);
                });
                addTrackingField(controls, 'État', statusSelect, resourceName);

                row.appendChild(controls);
            }

            const statusSelect = controls.querySelector('[data-study-status]');
            if (statusSelect) statusSelect.value = status;
            return { status: status, id: id, group: group };
        }

        function refreshProgress() {
            const allItems = [];
            studyGroups.forEach(function(group) {
                const boxes = document.querySelectorAll('.dossier-item input[' + group.attr + ']');
                let done = 0;
                boxes.forEach(function(box) {
                    const item = ensureStudyControls(box, group);
                    if (!item) return;
                    if (group.kind === 'dossier') allItems.push(item);
                    if (item.status !== 'todo') done++;
                });
                const pct = Math.round((done / boxes.length) * 100) || 0;
                const bar = document.getElementById(group.bar);
                const txt = document.getElementById(group.text);
                if (bar) bar.style.width = pct + '%';
                if (txt) txt.innerText = group.label + pct + '%';
            });
            updateCorrectionAccess();
            updateCorrectionDossierOptions();
            const consultes = allItems.filter(function(item) { return item.status !== 'todo'; }).length;
            const faits = allItems.filter(function(item) { return item.status === 'mastered'; }).length;
            const aFaire = allItems.length - faits;
            const progress = document.getElementById('overallProgress');
            const progressText = document.getElementById('overallProgressText');
            if (progress) {
                progress.max = allItems.length || 1;
                progress.value = consultes;
            }
            if (progressText) {
                progressText.textContent = consultes + ' / ' + allItems.length + ' commencés · ' +
                    faits + ' fait · ' + aFaire + ' à faire';
            }
            updateRecommendedDossier();
            filterDossiersByDifficulty();
            updateModuleLockUI();
            document.dispatchEvent(new CustomEvent('doctrine:dossiers-updated'));
            updateResumeModule(getLastModule());
        }
        window.bm4RefreshProgress = refreshProgress;
        ['doctrine:login', 'doctrine:logout'].forEach(function(name) {
            document.addEventListener(name, refreshProgress);
        });

        document.addEventListener('change', function(e) {
            if (e.target && e.target.id === 'dossierDifficultyFilter') filterDossiersByDifficulty();
        });
        filterDossiersByDifficulty();
        document.addEventListener('change', function(e) {
            const target = e.target;
            if (!target.matches) return;
            const row = target.closest('.dossier-item');
            if (!row) return;
            const box = row.querySelector('input[data-dossier], input[data-corrige]');
            if (!box) return;
            const group = studyGroups.find(function(candidate) { return box.hasAttribute(candidate.attr); });
            if (!group) return;
            const id = box.getAttribute(group.attr);

            if (target.matches('[data-study-status]')) {
                const status = group.statuses.some(function(option) { return option[0] === target.value; }) ? target.value : 'todo';
                saveStudyValue(studyStorageKey(group.kind, id, 'status'), status);
                box.checked = status !== 'todo';
                saveStudyValue(group.legacyPrefix + id, String(box.checked));
                if (group.kind === 'dossier' && status === 'mastered') enregistrerDossierTermine(id);
                refreshProgress();
            } else if (target === box) {
                const status = box.checked ? group.checkedStatus : 'todo';
                saveStudyValue(studyStorageKey(group.kind, id, 'status'), status);
                saveStudyValue(group.legacyPrefix + id, String(box.checked));
                if (group.kind === 'dossier' && status === 'mastered') enregistrerDossierTermine(id);
                refreshProgress();
            }
        });

        refreshProgress();
        bindInstallPromptHandlers();
        updateNetworkStatus();
        window.addEventListener('offline', function() {
            updateNetworkStatus(false);
        });
        window.addEventListener('online', function() {
            updateNetworkStatus(true);
        });
        registerAppServiceWorker();
    });

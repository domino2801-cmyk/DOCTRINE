const module1Key = 'module1_validated';
    const lastModuleKey = 'bm4-last-module';
    const modulesToLock = ['btn-mod2', 'btn-mod3', 'btn-mod4', 'btn-mod5', 'btn-mod6'];
    const moduleButtonMap = {
        module1: 'btn-mod1',
        module2: 'btn-mod2',
        module3: 'btn-mod3',
        module4: 'btn-mod4',
        module5: 'btn-mod5',
        module6: 'btn-mod6'
    };
    const moduleOrder = Object.keys(moduleButtonMap);
    const moduleScrollPositions = new Map();
    let deferredInstallPrompt = null;
    let networkStatusTimer = null;
    let correctionsUnlocked = false;
    let correctionGateElement = null;

    function isDossierDone(id) {
        const dossier = document.querySelector('.mod-body[data-mod="3"] input[data-dossier="' + id + '"]');
        return dossier?.closest('.dossier-item')?.querySelector('[data-study-status]')?.value === 'mastered';
    }

    function hasCorrectionAccess() {
        const selectedDossier = document.getElementById('correctionDossier')?.value;
        return correctionsUnlocked && !!selectedDossier && isDossierDone(selectedDossier);
    }

    function updateCorrectionAccess() {
        const list = document.getElementById('corrigeList');
        if (correctionsUnlocked && !hasCorrectionAccess()) correctionsUnlocked = false;
        const accessAllowed = hasCorrectionAccess();
        if (list) list.hidden = !accessAllowed;
        const selectedDossier = document.getElementById('correctionDossier')?.value;
        if (list) {
            list.querySelectorAll('.dossier-item').forEach(function(row) {
                const box = row.querySelector('input[data-corrige]');
                row.hidden = !accessAllowed || !box || box.getAttribute('data-corrige') !== selectedDossier;
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
        dossierSelect.replaceChildren(new Option('Choisissez un dossier…', ''));
        dossiers.forEach(function(box) {
            const name = box.closest('.dossier-item')?.querySelector(':scope > label > span')?.textContent.trim();
            const id = box.getAttribute('data-dossier');
            if (!name || !id) return;
            dossierSelect.add(new Option(name, id));
        });
        dossierSelect.value = Array.from(dossierSelect.options).some(function(option) {
            return option.value === currentValue;
        }) ? currentValue : '';
        dossierSelect.disabled = dossiers.length === 0;
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
        correctionsUnlocked = false;
        updateCorrectionAccess();
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
            btn.disabled = !isUnlocked;
            btn.style.opacity = isUnlocked ? '1' : '0.5';
            btn.style.cursor = isUnlocked ? 'pointer' : 'not-allowed';
            btn.style.backgroundColor = isUnlocked ? '' : '#e2e8f0';
            btn.style.color = isUnlocked ? '' : '#94a3b8';
        });

        if (lockWarning) {
            lockWarning.style.display = isUnlocked ? 'none' : 'block';
        }
        updateModuleNavigation();
        updateResumeModule(getLastModule());
    }

    function updateModuleNavigation(activeModule) {
        moduleOrder.forEach(function(moduleId, index) {
            const modal = document.getElementById('modal-' + moduleId);
            if (!modal) return;
            const previous = modal.querySelector('.module-nav-previous');
            const next = modal.querySelector('.module-nav-next');
            if (previous) previous.disabled = index === 0;
            if (next) next.disabled = index === moduleOrder.length - 1 || (index === 0 && !isModule1Unlocked());
        });
    }

    function navigateModule(id) {
        openModal(id);
    }

    function openModal(id) {
        if (!Object.prototype.hasOwnProperty.call(moduleButtonMap, id)) return;
        if (id === 'module1' || isModule1Unlocked()) {
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
            if (id === 'module4') resetCorrectionGate();
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
        description.textContent = id === 'module1' && !getModule1State()
            ? 'Commencez par le module 1 pour débloquer la suite.'
            : 'Votre dernier module consulté : module ' + number + '.';
    }

    function resumeLastModule() {
        let id = getLastModule();
        if (id !== 'module1' && !isModule1Unlocked()) id = 'module1';
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

    function harmonizePartCards() {
        document.querySelectorAll('.mod-body[data-mod="1"] > ul > li, .mod-body[data-mod="2"] > div, #modal-module6 .modal-list > li')
            .forEach(function(card) { card.classList.add('part-card'); });

        ['3', '4'].forEach(function(id) {
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

    document.addEventListener('DOMContentLoaded', function() {
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
        if (checkbox) {
            checkbox.checked = getModule1State();
            checkbox.addEventListener('change', function() {
                setModule1State(this.checked);
                updateModuleLockUI();
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
                    correctionsUnlocked = false;
                    updateCorrectionAccess();
                });
                fileInput.addEventListener('change', function() {
                    fileName.textContent = fileInput.files && fileInput.files[0]
                        ? fileInput.files[0].name
                        : 'Aucun fichier sélectionné.';
                    correctionsUnlocked = false;
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
                if (!isDossierDone(dossierSelect.value)) {
                    correctionsUnlocked = false;
                    updateCorrectionAccess();
                    if (status) status.textContent = 'Ce dossier n’est pas marqué « Fait » dans le module 3 : terminez-le avant d’ouvrir son corrigé.';
                    return;
                }
                if (!file || !/\.(pdf|docx?)$/i.test(file.name)) {
                    if (status) status.textContent = 'Ouvrez le téléversement et choisissez un fichier PDF, DOC ou DOCX.';
                    return;
                }

                correctionsUnlocked = true;
                updateCorrectionAccess();
                if (status) status.textContent = 'Fiche sélectionnée : le corrigé du dossier choisi est ouvert.';
                document.querySelector('#corrigeList .dossier-item:not([hidden])')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        }

        const module4 = document.getElementById('modal-module4');
        if (module4) {
            module4.addEventListener('click', function(event) {
                const target = event.target;
                if (!(target instanceof Element)) return;
                const link = target.closest('#corrigeList a');
                if (!link || hasCorrectionAccess()) return;
                event.preventDefault();
                const status = document.getElementById('correctionGateStatus');
                const selectedDossier = document.getElementById('correctionDossier')?.value;
                if (status) {
                    status.textContent = selectedDossier && !isDossierDone(selectedDossier)
                        ? 'Ce dossier n’est pas marqué « Fait » dans le module 3 : terminez-le avant d’ouvrir son corrigé.'
                        : 'Sélectionnez d’abord votre fiche rédigée pour ouvrir les corrigés.';
                }
                document.getElementById('correctionFile')?.focus();
            });
        }

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
            updateCorrectionAccess();
            updateCorrectionDossierOptions();
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
            updateResumeModule(getLastModule());
        }
        window.bm4RefreshProgress = refreshProgress;

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
                refreshProgress();
            } else if (target === box) {
                const status = box.checked ? group.checkedStatus : 'todo';
                saveStudyValue(studyStorageKey(group.kind, id, 'status'), status);
                saveStudyValue(group.legacyPrefix + id, String(box.checked));
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

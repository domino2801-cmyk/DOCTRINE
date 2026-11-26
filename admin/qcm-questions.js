/* Gestion de la banque de questions QCM-MAJOR depuis l'administration ANC. */
(function () {
    'use strict';

    var THEMES = [
        ['0', '1. Organisation et Commandement'],
        ['1', '2. Matériels, Armements et Technologies'],
        ['2', '3. Lois de Programmation Militaire'],
        ['3', '4. Opérations Extérieures'],
        ['4', '5. Histoire & Traditions'],
        ['5', '6. Implantation des unités']
    ];
    var questions = [];
    var dialog = null;
    var listNode = null;
    var statusNode = null;
    var searchNode = null;
    var filterNode = null;
    var formNode = null;
    var editingId = null;

    function auth() { return window.DoctrineAuth; }
    function make(tag, className, value) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (value !== undefined) el.textContent = value;
        return el;
    }
    function themeName(id) {
        var found = THEMES.find(function (theme) { return theme[0] === String(id); });
        return found ? found[1] : 'Thème ' + id;
    }
    function api(path, options) {
        return auth().jeton().then(function (token) {
            if (!token) throw new Error('Session expirée. Reconnectez-vous.');
            return fetch(auth().url.replace(/\/$/, '') + '/rest/v1/' + path, {
                method: options && options.method || 'GET',
                headers: {
                    apikey: auth().key,
                    Authorization: 'Bearer ' + token,
                    'Content-Type': 'application/json',
                    Prefer: options && options.prefer || 'return=representation'
                },
                body: options && options.body !== undefined ? JSON.stringify(options.body) : undefined
            });
        }).then(function (response) {
            return response.json().catch(function () { return []; }).then(function (payload) {
                if (!response.ok) throw new Error((payload && (payload.message || payload.details || payload.hint)) || 'Erreur HTTP ' + response.status);
                return payload;
            });
        });
    }
    function loadQuestions() {
        statusNode.textContent = 'Chargement de la banque QCM-MAJOR…';
        listNode.replaceChildren();
        return api('rpc/get_admin_question_bank', {
            method: 'POST',
            body: { p_limit: 1000, p_offset: 0 },
            prefer: 'return=representation'
        }).then(function (rows) {
            if (!Array.isArray(rows)) throw new Error('La banque de questions a renvoyé un format invalide.');
            questions = rows.map(function (row) {
                return {
                    id: String(row.id),
                    themeId: String(row.theme_id),
                    q: String(row.question || ''),
                    r: [row.answer_1, row.answer_2, row.answer_3, row.answer_4].map(function (answer) { return String(answer || ''); }),
                    correct: Number.isInteger(row.correct_index) ? row.correct_index : 0,
                    active: row.active !== false
                };
            });
            renderList();
            statusNode.textContent = questions.length + ' question(s) dans la banque partagée QCM-MAJOR.';
        }).catch(function (error) {
            statusNode.textContent = 'Chargement impossible : ' + error.message;
            throw error;
        });
    }
    function field(labelText, control) {
        var label = make('label', 'anc-qcm-field', labelText);
        label.appendChild(control);
        return label;
    }
    function buildForm() {
        formNode = make('form', 'anc-qcm-form');
        formNode.hidden = true;
        var heading = make('h3', '', 'Ajouter une question');
        heading.id = 'anc-qcm-form-title';
        formNode.appendChild(heading);

        var theme = make('select', 'anc-qcm-control');
        theme.name = 'theme';
        THEMES.forEach(function (item) {
            var option = make('option', '', item[1]);
            option.value = item[0];
            theme.appendChild(option);
        });
        formNode.appendChild(field('Thème', theme));

        var question = make('textarea', 'anc-qcm-control');
        question.name = 'question';
        question.rows = 3;
        question.required = true;
        question.maxLength = 5000;
        formNode.appendChild(field('Question', question));

        var answers = [];
        for (var i = 0; i < 4; i++) {
            var answer = make('input', 'anc-qcm-control');
            answer.type = 'text';
            answer.name = 'answer' + i;
            answer.required = true;
            answer.maxLength = 1000;
            answers.push(answer);
            formNode.appendChild(field('Réponse ' + (i + 1), answer));
        }

        var correct = make('select', 'anc-qcm-control');
        correct.name = 'correct';
        for (var c = 0; c < 4; c++) {
            var option = make('option', '', 'Réponse ' + (c + 1));
            option.value = String(c);
            correct.appendChild(option);
        }
        formNode.appendChild(field('Bonne réponse', correct));

        var actions = make('div', 'anc-qcm-form-actions');
        var save = make('button', 'anc-qcm-primary', 'Enregistrer');
        save.type = 'submit';
        var cancel = make('button', 'anc-qcm-secondary', 'Annuler');
        cancel.type = 'button';
        cancel.addEventListener('click', resetForm);
        actions.append(save, cancel);
        formNode.appendChild(actions);
        formNode.addEventListener('submit', submitForm);
        return formNode;
    }
    function resetForm() {
        editingId = null;
        if (!formNode) return;
        formNode.reset();
        formNode.hidden = true;
        formNode.querySelector('h3').textContent = 'Ajouter une question';
        dialog.querySelector('.anc-qcm-add').disabled = false;
    }
    function editQuestion(question) {
        editingId = question.id;
        formNode.hidden = false;
        formNode.querySelector('h3').textContent = 'Modifier la question';
        formNode.elements.theme.value = question.themeId;
        formNode.elements.question.value = question.q;
        question.r.forEach(function (answer, index) { formNode.elements['answer' + index].value = answer; });
        formNode.elements.correct.value = String(question.correct);
        dialog.querySelector('.anc-qcm-add').disabled = true;
        formNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function submitForm(event) {
        event.preventDefault();
        var button = formNode.querySelector('[type="submit"]');
        var question = {
            themeId: formNode.elements.theme.value,
            q: formNode.elements.question.value.trim(),
            r: [0, 1, 2, 3].map(function (index) { return formNode.elements['answer' + index].value.trim(); }),
            correct: Number(formNode.elements.correct.value)
        };
        if (!question.q || question.r.some(function (answer) { return !answer; })) {
            statusNode.textContent = 'La question et les quatre réponses sont obligatoires.';
            return;
        }
        button.disabled = true;
        var isEditing = editingId !== null;
        var currentEditingId = editingId;
        statusNode.textContent = isEditing ? 'Modification en cours…' : 'Ajout en cours…';
        var path = isEditing ? 'question_bank?id=eq.' + encodeURIComponent(currentEditingId) : 'question_bank';
        var payload = {
            theme_id: question.themeId,
            question: question.q,
            answer_1: question.r[0],
            answer_2: question.r[1],
            answer_3: question.r[2],
            answer_4: question.r[3],
            correct_answer: question.r[question.correct]
        };
        api(path, {
            method: isEditing ? 'PATCH' : 'POST',
            body: isEditing ? payload : [payload],
            prefer: 'return=representation'
        }).then(function (rows) {
            if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Supabase n’a pas confirmé l’enregistrement.');
            resetForm();
            return loadQuestions().then(function () {
                statusNode.textContent = isEditing ? 'Question modifiée.' : 'Question ajoutée.';
            });
        }).catch(function (error) {
            statusNode.textContent = 'Enregistrement impossible : ' + error.message;
        }).finally(function () { button.disabled = false; });
    }
    function renderList() {
        if (!listNode) return;
        listNode.replaceChildren();
        var theme = filterNode.value;
        var query = searchNode.value.trim().toLocaleLowerCase('fr');
        var matches = questions.filter(function (question) {
            if (theme !== 'all' && question.themeId !== theme) return false;
            var searchable = [question.q].concat(question.r).join(' ').toLocaleLowerCase('fr');
            return !query || searchable.indexOf(query) !== -1;
        });
        matches.forEach(function (question) {
            var card = make('article', 'anc-qcm-question');
            var heading = make('div', 'anc-qcm-question-heading');
            heading.append(make('strong', '', question.q), make('span', 'anc-qcm-theme', themeName(question.themeId)));
            card.appendChild(heading);
            var answers = make('ol', 'anc-qcm-answers');
            question.r.forEach(function (answer, index) {
                var line = make('li', index === question.correct ? 'is-correct' : '', answer);
                if (index === question.correct) line.appendChild(make('strong', '', ' — Bonne réponse'));
                answers.appendChild(line);
            });
            card.appendChild(answers);
            var actions = make('div', 'anc-qcm-question-actions');
            var edit = make('button', 'anc-qcm-secondary', 'Modifier');
            edit.type = 'button';
            edit.addEventListener('click', function () { editQuestion(question); });
            var move = make('select', 'anc-qcm-control anc-qcm-move-theme');
            move.setAttribute('aria-label', 'Changer le thème de la question');
            THEMES.forEach(function (item) {
                var option = make('option', '', item[1]);
                option.value = item[0];
                option.selected = item[0] === question.themeId;
                move.appendChild(option);
            });
            move.addEventListener('change', function () { moveQuestion(question, move.value, move); });
            var remove = make('button', 'anc-qcm-danger', 'Supprimer');
            remove.type = 'button';
            remove.addEventListener('click', function () { deleteQuestion(question, remove); });
            actions.append(edit, move, remove);
            card.appendChild(actions);
            if (!question.active) card.appendChild(make('p', 'anc-qcm-inactive', 'Question inactive dans QCM-MAJOR'));
            listNode.appendChild(card);
        });
        if (!matches.length) listNode.appendChild(make('p', 'anc-qcm-empty', 'Aucune question ne correspond à ces critères.'));
        statusNode.textContent = matches.length + ' / ' + questions.length + ' question(s) affichée(s).';
    }
    function moveQuestion(question, themeId, control) {
        if (themeId === question.themeId) return;
        control.disabled = true;
        api('question_bank?id=eq.' + encodeURIComponent(question.id), {
            method: 'PATCH',
            body: { theme_id: themeId },
            prefer: 'return=representation'
        }).then(function (rows) {
            if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Le changement de thème n’a pas été confirmé.');
            question.themeId = themeId;
            renderList();
            statusNode.textContent = 'Thème de la question modifié.';
        }).catch(function (error) {
            control.value = question.themeId;
            statusNode.textContent = 'Changement de thème impossible : ' + error.message;
        }).finally(function () { control.disabled = false; });
    }
    function deleteQuestion(question, button) {
        if (!window.confirm('Supprimer définitivement cette question de la banque QCM-MAJOR ?')) return;
        button.disabled = true;
        api('question_bank?id=eq.' + encodeURIComponent(question.id), {
            method: 'DELETE',
            prefer: 'return=minimal'
        }).then(function () {
            questions = questions.filter(function (item) { return item.id !== question.id; });
            renderList();
            statusNode.textContent = 'Question supprimée de la banque QCM-MAJOR.';
        }).catch(function (error) {
            statusNode.textContent = 'Suppression impossible : ' + error.message;
            button.disabled = false;
        });
    }
    function open() {
        if (!auth() || !auth().estAdmin()) {
            window.alert('Accès réservé à l’administration ANC.');
            return;
        }
        if (!dialog) buildDialog();
        dialog.hidden = false;
        loadQuestions().catch(function () {});
    }
    function buildDialog() {
        dialog = make('div', 'anc-qcm-overlay');
        dialog.id = 'ancQcmQuestionsManager';
        var panel = make('section', 'anc-qcm-panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'anc-qcm-title');
        var header = make('header', 'anc-qcm-header');
        var title = make('div');
        title.append(make('p', 'anc-qcm-kicker', 'ADMINISTRATION ANC / BANQUE PARTAGÉE QCM-MAJOR'));
        var h2 = make('h2', '', 'Suivi des questions QCM-MAJOR');
        h2.id = 'anc-qcm-title';
        title.appendChild(h2);
        title.appendChild(make('p', 'anc-qcm-subtitle', 'Gérez directement les questions de la banque utilisée par QCM-MAJOR.'));
        var close = make('button', 'anc-qcm-secondary', 'Fermer');
        close.type = 'button';
        close.addEventListener('click', function () { dialog.hidden = true; });
        header.append(title, close);
        panel.appendChild(header);

        var toolbar = make('div', 'anc-qcm-toolbar');
        var add = make('button', 'anc-qcm-primary anc-qcm-add', '+ Ajouter une question');
        add.type = 'button';
        add.addEventListener('click', function () {
            resetForm();
            formNode.hidden = false;
            formNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        var search = make('input', 'anc-qcm-control');
        search.type = 'search';
        search.placeholder = 'Rechercher une question ou un mot-clé…';
        search.setAttribute('aria-label', 'Rechercher une question par mot-clé');
        search.addEventListener('input', renderList);
        var filter = make('select', 'anc-qcm-control');
        filter.setAttribute('aria-label', 'Filtrer les questions par thème');
        var all = make('option', '', 'Tous les thèmes');
        all.value = 'all';
        filter.appendChild(all);
        THEMES.forEach(function (item) {
            var option = make('option', '', item[1]);
            option.value = item[0];
            filter.appendChild(option);
        });
        filter.addEventListener('change', renderList);
        toolbar.append(add, search, filter);
        panel.appendChild(toolbar);

        searchNode = search;
        filterNode = filter;
        listNode = make('div', 'anc-qcm-list');
        statusNode = make('p', 'anc-qcm-status');
        statusNode.setAttribute('role', 'status');
        statusNode.setAttribute('aria-live', 'polite');
        formNode = buildForm();
        panel.append(formNode, statusNode, listNode);
        dialog.appendChild(panel);
        dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.hidden = true; });
        document.body.appendChild(dialog);
    }

    window.DoctrineQcmQuestions = { open: open };
})();

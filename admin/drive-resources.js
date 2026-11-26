/* Gestion administrateur de la liste blanche des supports documentaires historiques. */
(function () {
  'use strict';
  var TABLE = 'doctrine_drive_resources';
  var STYLE_ID = 'doctrine-drive-resources-style';
  var DIALOG_ID = 'doctrine-drive-resources-dialog';
  var started = false;

  function auth() { return window.DoctrineAuth; }
  function admin() { return !!(auth() && typeof auth().estAdmin === 'function' && auth().estAdmin()); }
  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function api(path, method, body) {
    return auth().jeton().then(function (token) {
      if (!token) throw new Error('Session expirée');
      return fetch(auth().url + '/rest/v1/' + path, {
        method: method || 'GET',
        headers: { apikey: auth().key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json',
          Prefer: method === 'POST' ? 'return=representation' : 'return=minimal' },
        body: body ? JSON.stringify(body) : undefined
      });
    }).then(function (response) {
      if (!response.ok) return response.json().catch(function () { return {}; }).then(function (data) {
        throw new Error(data.message || 'Erreur HTTP ' + response.status);
      });
      return response.status === 204 ? [] : response.json().catch(function () { return []; });
    });
  }
  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = el('style', { id: STYLE_ID });
    style.textContent = '#doctrine-drive-admin{display:none!important;position:fixed;right:18px;bottom:18px;z-index:9998;background:#173b5c;color:#fff;border:0;border-radius:9px;padding:11px 15px;font-weight:700;box-shadow:0 3px 14px #0003;cursor:pointer}#' + DIALOG_ID + '{position:fixed;inset:0;z-index:9999;background:#071827b8;display:flex;align-items:center;justify-content:center;padding:16px}#' + DIALOG_ID + '[hidden]{display:none}#' + DIALOG_ID + ' .ddr-panel{background:#fff;color:#182433;width:min(720px,100%);max-height:90vh;overflow:auto;border-radius:12px;padding:20px;box-shadow:0 10px 40px #0005}#' + DIALOG_ID + ' label{display:block;font-weight:600;margin:12px 0 5px}#' + DIALOG_ID + ' input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #aab5c0;border-radius:6px}#' + DIALOG_ID + ' button{padding:8px 12px;border-radius:6px;border:1px solid #9aa8b5;cursor:pointer;margin:4px}#' + DIALOG_ID + ' .ddr-row{display:flex;gap:8px;align-items:center;justify-content:space-between;border-bottom:1px solid #e4e8ec;padding:10px 0}#' + DIALOG_ID + ' .ddr-muted{color:#64748b;font-size:.9em}#' + DIALOG_ID + ' .ddr-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}#' + DIALOG_ID + ' .ddr-error{color:#a21d1d}';
    document.head.appendChild(style);
  }
  function createDialog() {
    if (document.getElementById(DIALOG_ID)) return;
    var overlay = el('div', { id: DIALOG_ID, hidden: '' });
    var panel = el('section', { class: 'ddr-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ddr-title' });
    panel.appendChild(el('h2', { id: 'ddr-title' }, 'Gestion des supports documentaires autorisés'));
    panel.appendChild(el('p', { class: 'ddr-muted' }, 'Les dossiers actifs sont consultables par les candidats, les Officiers Guides et les administrateurs.'));
    var form = el('form', { id: 'ddr-form' });
    form.appendChild(el('label', { for: 'ddr-title-input' }, 'Intitulé du support'));
    form.appendChild(el('input', { id: 'ddr-title-input', required: '', maxlength: '160', placeholder: 'Ex. Nouveau support documentaire' }));
    form.appendChild(el('label', { for: 'ddr-url-input' }, 'Lien du dossier Google Drive'));
    form.appendChild(el('input', { id: 'ddr-url-input', required: '', placeholder: 'https://drive.google.com/drive/folders/…' }));
    form.appendChild(el('p', { class: 'ddr-muted' }, 'Le compte de service Google doit également avoir accès au dossier.'));
    var error = el('p', { class: 'ddr-error', id: 'ddr-error', role: 'status' });
    form.appendChild(error);
    var submit = el('button', { type: 'submit' }, 'Ajouter le dossier');
    form.appendChild(submit);
    panel.appendChild(form);
    panel.appendChild(el('h3', {}, 'Dossiers autorisés'));
    panel.appendChild(el('div', { id: 'ddr-list', 'aria-live': 'polite' }));
    var actions = el('div', { class: 'ddr-actions' });
    var close = el('button', { type: 'button' }, 'Fermer');
    close.addEventListener('click', function () { overlay.hidden = true; });
    actions.appendChild(close);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) overlay.hidden = true; });
    form.addEventListener('submit', save);
    document.body.appendChild(overlay);
  }
  function folderId(value) {
    var raw = String(value || '').trim();
    var match = raw.match(/^https:\/\/drive\.google\.com\/(?:drive\/folders\/|open\?id=)([A-Za-z0-9_-]{10,80})(?:[/?#&].*)?$/i);
    if (match) return match[1];
    if (/^[A-Za-z0-9_-]{10,80}$/.test(raw)) return raw;
    return '';
  }
  function load() {
    var list = document.getElementById('ddr-list');
    list.textContent = 'Chargement…';
    api(TABLE + '?select=id,title,drive_folder_id,is_active,created_at&order=title.asc').then(function (rows) {
      list.replaceChildren();
      if (!rows.length) list.appendChild(el('p', {}, 'Aucun dossier enregistré.'));
      rows.forEach(function (item) {
        var row = el('div', { class: 'ddr-row' });
        var details = el('div');
        details.appendChild(el('strong', {}, item.title));
        details.appendChild(el('div', { class: 'ddr-muted' }, item.drive_folder_id + (item.is_active ? ' · Actif' : ' · Désactivé')));
        row.appendChild(details);
        var actions = el('div');
        var edit = el('button', { type: 'button' }, 'Modifier');
        edit.addEventListener('click', function () {
          var title = window.prompt('Nouvel intitulé du support :', item.title);
          if (title === null) return;
          title = title.trim();
          if (title.length < 2 || title.length > 160) { showError(new Error('L’intitulé doit contenir entre 2 et 160 caractères.')); return; }
          api(TABLE + '?id=eq.' + encodeURIComponent(item.id), 'PATCH', { title: title, updated_at: new Date().toISOString() })
            .then(load).catch(showError);
        });
        actions.appendChild(edit);
        var toggle = el('button', { type: 'button' }, item.is_active ? 'Désactiver' : 'Réactiver');
        toggle.addEventListener('click', function () {
          api(TABLE + '?id=eq.' + encodeURIComponent(item.id), 'PATCH', { is_active: !item.is_active, updated_at: new Date().toISOString() })
            .then(load).catch(showError);
        });
        actions.appendChild(toggle);
        row.appendChild(actions);
        list.appendChild(row);
      });
    }).catch(showError);
  }
  function showError(error) {
    var target = document.getElementById('ddr-error');
    if (target) target.textContent = error.message || 'Opération impossible.';
    var list = document.getElementById('ddr-list');
    if (list && !list.textContent) list.textContent = 'Impossible de charger la liste.';
  }
  function save(event) {
    event.preventDefault();
    var title = document.getElementById('ddr-title-input').value.trim();
    var id = folderId(document.getElementById('ddr-url-input').value);
    var error = document.getElementById('ddr-error');
    error.textContent = '';
    if (title.length < 2 || !id) { error.textContent = 'Indiquez un intitulé et un lien de dossier Google Drive valide.'; return; }
    api(TABLE, 'POST', { title: title, drive_folder_id: id, is_active: true, created_by: null })
      .then(function () {
        document.getElementById('ddr-form').reset();
        load();
      }).catch(showError);
  }
  function open() {
    createDialog();
    var overlay = document.getElementById(DIALOG_ID);
    overlay.hidden = false;
    document.getElementById('ddr-error').textContent = '';
    load();
  }
  function init() {
    if (started || !admin()) return;
    started = true;
    addStyles();
    var button = el('button', { id: 'doctrine-drive-admin', type: 'button' }, 'Supports Drive');
    button.addEventListener('click', open);
    document.body.appendChild(button);
  }
  document.addEventListener('doctrine:login', init);
  document.addEventListener('doctrine:logout', function () {
    var button = document.getElementById('doctrine-drive-admin');
    var dialog = document.getElementById(DIALOG_ID);
    if (button) button.remove();
    if (dialog) dialog.remove();
    started = false;
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

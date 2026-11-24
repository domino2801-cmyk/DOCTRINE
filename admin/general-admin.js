/* Espace Administrateur général — indépendant des outils Admin ANC existants. */
(function(){
'use strict';
var root,button;
function auth(){return window.DoctrineAuth;}
function estAutorise(){return !!(auth()&&auth().estAdmin());}
function construire(){
 if(document.getElementById('adminGeneralButton')) return;
 button=document.createElement('button');button.id='adminGeneralButton';button.type='button';button.textContent='▦ Administrateur général';button.hidden=true;
 var bar=document.querySelector('.app-utility-bar');
 if(bar) bar.appendChild(button); else document.body.appendChild(button);
 button.addEventListener('click',ouvrir);
 root=document.createElement('section');root.id='adminGeneral';root.hidden=true;root.setAttribute('aria-label','Interface Administrateur général');
 root.innerHTML='<div class="ag-shell"><header class="ag-head"><div><h1>ADMINISTRATEUR GÉNÉRAL</h1><p>Pilotage global de l’application DOCTRINE</p></div><div class="ag-actions"><button class="ag-close" type="button" data-ag-close>Fermer l’administration</button></div></header><div class="ag-grid">'+
 carte('accounts','1. COMPTES','Gestion séparée des candidats et des Officiers Guides. Les actions sensibles nécessitent un service serveur sécurisé ; aucune clé privilégiée ne sera exposée dans le navigateur.','Candidats · Officiers Guides · Actifs · Bloqués',action('Outils administrateur','admin-edit'))+
 carte('questions','2. QUESTIONS','Accès au mode administrateur existant pour modifier les contenus publiés. La banque QCM-MAJOR est un service distinct à raccorder à son API dédiée.','Banque de questions · Thèmes · Recherche',action('Éditer les contenus','admin-edit'))+
 carte('signals','3. SIGNALEMENTS','Signalements candidats et Officiers Guides dans deux espaces distincts, avec auteur, date, motif et état de traitement.','Signalements candidats · Signalements OG',action('Signalements candidats','candidate-signals')+action('Signalements Officiers Guides','guide-signals'))+
 carte('retex','4. RETEX','Synthèse des RETEX candidats et rapports Officiers Guides. Les vues existantes incluent les statistiques et l’export PDF pour les RETEX candidats.','RETEX candidats · RETEX OG · Synthèse globale · Export PDF',action('RETEX candidats','candidate-retex')+action('RETEX Officiers Guides','guide-retex'))+
 carte('guide','5. SUIVI OFFICIER GUIDE','Vue globale existante de tous les candidats, indépendamment de leur Officier Guide, avec recherche et suivi individuel.','Tous les candidats · Toutes cohortes · Toutes spécialités',action('Ouvrir le suivi global','global-tracking'))+
 carte('application','6. MODIFICATION APPLICATION','Accès au mode d’édition existant pour modifier les contenus des modules. Les opérations de structure globale seront ajoutées dans une prochaine étape sécurisée.','Cartes · Liens · Rubriques · Ressources',action('Ouvrir le mode édition','admin-edit'))+
 '</div></div>';
 root.addEventListener('click',function(e){if(e.target.matches('[data-ag-close]')){fermer();return;}var control=e.target.closest('[data-ag-action]');if(control)executerAction(control.getAttribute('data-ag-action'));});
 document.body.appendChild(root);
}
function action(label, name){return '<button type="button" class="ag-btn" data-ag-action="'+name+'">'+label+'</button>';}
function carte(id,titre,desc,pills,actions){return '<details class="ag-card" data-ag-card="'+id+'"><summary>'+titre+'</summary><div class="ag-card-body"><p>'+desc+'</p><div class="ag-pills">'+pills.split(' · ').map(function(x){return '<span class="ag-pill">'+x+'</span>';}).join('')+'</div><div class="ag-subtabs">'+(actions||'')+'</div><p class="ag-note" data-ag-status="'+id+'" aria-live="polite"></p></div></details>';}
function executerAction(name){if(!estAutorise())return;var section=(name.indexOf('signal')!==-1?'signals':name.indexOf('retex')!==-1?'retex':name==='global-tracking'?'guide':name==='admin-edit'?'questions':'');var status=section&&root.querySelector('[data-ag-status="'+section+'"]');if(name==='candidate-signals')document.dispatchEvent(new CustomEvent('doctrine:admin-fiches',{detail:'signalements'}));else if(name==='guide-signals')document.dispatchEvent(new CustomEvent('doctrine:admin-fiches',{detail:'guide-signalements'}));else if(name==='candidate-retex')document.dispatchEvent(new CustomEvent('doctrine:admin-fiches',{detail:'retex'}));else if(name==='guide-retex')document.dispatchEvent(new CustomEvent('doctrine:admin-fiches',{detail:'guide-retex'}));else if(name==='global-tracking'){var cohort=document.querySelector('.adm-cohort-toolbar:not([hidden])');if(cohort)cohort.click();else if(status)status.textContent='Ouvrez un module : le bouton Cohorte donne accès au suivi global.';}else if(name==='admin-edit'){var edit=document.querySelector('.adm-toolbar-toggle:not([hidden])');if(edit)edit.click();else if(status)status.textContent='Ouvrez un module pour accéder à la commande Admin existante.';}}
function ouvrir(){if(!estAutorise()){alert('Accès réservé à un compte administrateur.');return;}root.hidden=false;document.body.style.overflow='hidden';}
function fermer(){root.hidden=true;document.body.style.overflow='';}
function actualiser(){if(!button)return;button.hidden=!estAutorise();}
function init(){construire();actualiser();document.addEventListener('doctrine:login',actualiser);document.addEventListener('doctrine:logout',function(){actualiser();fermer();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

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
 carte('accounts','1. COMPTES','Gestion séparée des candidats et des Officiers Guides. Tri du plus récent au plus ancien, recherche, spécialité, blocage, déblocage et suppression avec confirmation.','Candidats · Officiers Guides · Actifs · Bloqués')+
 carte('questions','2. QUESTIONS','Gestion complète des questions : ajout, modification, suppression, changement de thème et recherche par mot-clé.','Banque de questions · Thèmes · Recherche')+
 carte('signals','3. SIGNALEMENTS','Signalements candidats et signalements Officiers Guides dans deux listes distinctes, avec auteur, date, motif et état de traitement.','Signalements candidats · Signalements OG')+
 carte('retex','4. RETEX','RETEX candidats et OG séparés, statistiques globales en camembert et commentaires regroupés en fin de rapport. Export PDF prévu.','RETEX candidats · RETEX OG · Synthèse globale · Export PDF')+
 carte('guide','5. SUIVI OFFICIER GUIDE','Vue administrateur de tous les candidats, sans limitation de cohorte, avec filtre par spécialité et accès aux suivis individuels, QCM, progression et fiches.','Tous les candidats · Toutes cohortes · Toutes spécialités')+
 carte('application','6. MODIFICATION APPLICATION','Gestion des cartes et rubriques : ajouter une carte, modifier les intitulés et liens, retirer des éléments et organiser l’affichage.','Cartes · Liens · Rubriques · Ressources')+
 '</div></div>';
 root.addEventListener('click',function(e){if(e.target.matches('[data-ag-close]'))fermer();});
 document.body.appendChild(root);
}
function carte(id,titre,desc,pills){return '<details class="ag-card" data-ag-card="'+id+'"><summary>'+titre+'</summary><div class="ag-card-body"><p>'+desc+'</p><div class="ag-pills">'+pills.split(' · ').map(function(x){return '<span class="ag-pill">'+x+'</span>';}).join('')+'</div><div class="ag-placeholder" data-ag-content="'+id+'">Espace prêt à recevoir les données et commandes sécurisées de cette rubrique.</div></div></details>';}
function ouvrir(){if(!estAutorise()){alert('Accès réservé à un compte administrateur.');return;}root.hidden=false;document.body.style.overflow='hidden';}
function fermer(){root.hidden=true;document.body.style.overflow='';}
function actualiser(){if(!button)return;button.hidden=!estAutorise();}
function init(){construire();actualiser();document.addEventListener('doctrine:login',actualiser);document.addEventListener('doctrine:logout',function(){actualiser();fermer();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

-- 01 — DIAGNOSTIC EN LECTURE SEULE
-- Compte cible : test@yopmail.fr
-- À exécuter dans Supabase > SQL Editor. Aucune donnée n'est modifiée.

with target as (
    select id, email, created_at, last_sign_in_at
    from auth.users
    where lower(email) = lower('test@yopmail.fr')
),
activity as (
    select
        t.id as user_id,
        greatest(
            (select max(a.last_seen_at) from public.qcm_candidate_activity a where a.user_id = t.id),
            (select max(e.created_at) from public.doctrine_progress_events e where e.user_id = t.id),
            (select max(v.opened_at) from public.doctrine_document_views v where v.user_id = t.id),
            (select max(s.created_at) from public.doctrine_fiche_submissions s where s.user_id = t.id)
        ) as last_activity
    from target t
),
reminder as (
    select distinct on (q.user_id)
        q.user_id, q.id as reminder_id, q.recipient, q.activity_at,
        q.status, q.attempted_at, q.sent_at, q.error
    from public.qcm_inactivity_emails q
    join target t on t.id = q.user_id
    order by q.user_id, q.activity_at desc, q.attempted_at desc nulls last
)
select
    t.email, t.id as user_id, t.created_at, t.last_sign_in_at,
    a.last_activity,
    r.reminder_id, r.recipient, r.status as latest_reminder_status,
    r.activity_at as reminder_activity_at, r.attempted_at, r.sent_at, r.error,
    floor(extract(epoch from (now() - r.activity_at)) / 86400)::int as days_since_reminder,
    coalesce(
        r.status = 'sent'
        and r.sent_at is not null
        and r.activity_at is not null
        and a.last_activity is not null
        and a.last_activity <= r.activity_at
        and now() - r.activity_at >= interval '17 days',
        false
    ) as red_condition_met,
    case
        when t.id is null then 'COMPTE TEST INTROUVABLE'
        when r.reminder_id is null then 'AUCUN RAPPEL : préparer le scénario avec le script 02'
        when r.status <> 'sent' or r.sent_at is null then 'RAPPEL NON ENVOYÉ'
        when a.last_activity > r.activity_at then 'ACTIVITÉ POSTÉRIEURE AU RAPPEL : le rouge est correctement désactivé'
        when now() - r.activity_at < interval '17 days' then 'MOINS DE 17 JOURS'
        when a.last_activity is null then 'AUCUNE ACTIVITÉ MESURÉE : vérifier la règle du tableau de bord'
        else 'CONDITIONS DE ROUGISSEMENT RÉUNIES'
    end as diagnostic
from (select 1) seed
left join target t on true
left join activity a on a.user_id = t.id
left join reminder r on r.user_id = t.id;

-- Vérification en lecture seule du compte de test pour l'alerte d'inactivité à 17 jours.
-- À exécuter dans Supabase > SQL Editor.
-- Aucun INSERT, UPDATE ou DELETE : ce script ne modifie aucune donnée.

with test_user as (
    select id, email, created_at
    from auth.users
    where lower(email) = lower('test@yopmail.fr')
),
latest_reminder as (
    select distinct on (q.user_id)
        q.user_id,
        q.recipient,
        q.activity_at,
        q.status,
        q.attempted_at,
        q.sent_at,
        q.error
    from public.qcm_inactivity_emails q
    join test_user u on u.id = q.user_id
    order by q.user_id, q.activity_at desc, q.attempted_at desc nulls last
)
select
    u.email,
    u.id as user_id,
    r.recipient,
    r.status as latest_reminder_status,
    r.activity_at as reminder_activity_at,
    r.attempted_at,
    r.sent_at,
    floor(extract(epoch from (now() - r.activity_at)) / 86400)::int as days_since_reminder_activity,
    coalesce(
        r.status = 'sent'
        and r.sent_at is not null
        and r.activity_at is not null
        and now() - r.activity_at >= interval '17 days',
        false
    ) as reminder_condition_17_days_met,
    r.error,
    case
        when u.id is null then 'COMPTE TEST INTROUVABLE DANS auth.users'
        when r.user_id is null then 'AUCUN RAPPEL QCM ENREGISTRÉ'
        when r.status <> 'sent' or r.sent_at is null then 'RAPPEL NON ENVOYÉ : LE PSEUDO NE DOIT PAS ÊTRE ROUGE'
        when r.activity_at is null or now() - r.activity_at < interval '17 days' then 'ATTENDRE 17 JOURS RÉVOLUS'
        else 'RAPPEL ENVOYÉ DEPUIS AU MOINS 17 JOURS : vérifier aussi last_activity côté tableau de bord'
    end as diagnostic
from (select 1) seed
left join test_user u on true
left join latest_reminder r on r.user_id = u.id;

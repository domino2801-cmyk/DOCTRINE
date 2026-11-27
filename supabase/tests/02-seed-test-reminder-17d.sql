-- 02 — PRÉPARER UN RAPPEL FICTIF POUR LE TEST VISUEL
-- Cible exclusivement test@yopmail.fr.
-- ATTENTION : cette ligne simule un rappel envoyé. Aucun e-mail n'est envoyé.
-- Exécuter uniquement après avoir confirmé que ce compte est un compte de test.
-- Conserver la valeur reminder_id retournée pour le nettoyage (script 03).

begin;

do $$
declare
    v_user_id uuid;
begin
    select id into v_user_id
    from auth.users
    where lower(email) = lower('test@yopmail.fr');

    if v_user_id is null then
        raise exception 'Compte test@yopmail.fr introuvable dans auth.users';
    end if;

    if exists (
        select 1 from public.qcm_inactivity_emails
        where user_id = v_user_id
          and recipient = 'test@yopmail.fr'
          and status = 'sent'
          and sent_at is not null
          and activity_at >= now() - interval '19 days'
    ) then
        raise exception 'Un rappel récent existe déjà pour ce compte : arrêter pour éviter un doublon';
    end if;

    insert into public.qcm_inactivity_emails
        (user_id, activity_at, recipient, status, attempted_at, sent_at, error)
    values
        (v_user_id, now() - interval '18 days', 'test@yopmail.fr',
         'sent', now() - interval '18 days', now() - interval '18 days', null)
    returning id into strict v_user_id;
end $$;

-- IMPORTANT : la transaction est volontairement annulée par défaut.
-- Pour conserver le scénario de test, remplacer ROLLBACK par COMMIT,
-- puis noter l'identifiant retourné par la requête INSERT.
rollback;

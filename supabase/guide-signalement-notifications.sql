-- Notification push des signalements transmis depuis l'espace Officier Guide.
-- À exécuter après supabase/guide-officer-feedback.sql et supabase/retex-notifications.sql.
-- Réutilise les abonnements administrateur et les secrets Vault du dispositif DOCTRINE.

create or replace function public.notify_doctrine_guide_signalement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    webhook_url text;
    webhook_secret text;
begin
    select decrypted_secret into webhook_url
    from vault.decrypted_secrets
    where name = 'doctrine_report_push_url';

    select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
    where name = 'doctrine_report_push_webhook_secret';

    if webhook_url is null or webhook_secret is null then
        raise warning 'DOCTRINE guide report push: Vault configuration missing';
        return new;
    end if;

    perform net.http_post(
        url := webhook_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-doctrine-webhook-secret', webhook_secret
        ),
        body := jsonb_build_object(
            'type', 'INSERT',
            'schema', 'public',
            'table', 'guide_signalements',
            'record', jsonb_build_object('id', new.id)
        ),
        timeout_milliseconds := 10000
    );
    return new;
end;
$$;

revoke all on function public.notify_doctrine_guide_signalement() from public, anon, authenticated;

drop trigger if exists notify_doctrine_guide_signalement on public.guide_signalements;
create trigger notify_doctrine_guide_signalement
after insert on public.guide_signalements
for each row execute function public.notify_doctrine_guide_signalement();

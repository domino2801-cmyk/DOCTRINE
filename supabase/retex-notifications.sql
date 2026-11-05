-- DOCTRINE: notifications push pour les nouveaux signalements.
-- À exécuter après supabase/retex-signalements.sql dans Supabase > SQL Editor.
-- Créer dans Vault les secrets doctrine_report_push_url (URL complète de la
-- fonction) et doctrine_report_push_webhook_secret (même secret que dans la fonction).

create extension if not exists pg_net with schema extensions;

create table if not exists public.doctrine_admin_push_subscriptions (
    user_id uuid not null references auth.users(id) on delete cascade,
    endpoint text not null check (char_length(endpoint) between 1 and 2048),
    p256dh text not null check (char_length(p256dh) between 80 and 200),
    auth text not null check (char_length(auth) between 20 and 100),
    created_at timestamptz not null default now(),
    primary key (user_id, endpoint)
);

alter table public.doctrine_admin_push_subscriptions enable row level security;
revoke all on public.doctrine_admin_push_subscriptions from anon, authenticated;
grant all on public.doctrine_admin_push_subscriptions to service_role;

create or replace function public.notify_doctrine_signalement()
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
        raise warning 'DOCTRINE report push: Vault configuration missing';
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
            'table', 'doctrine_signalements',
            'record', jsonb_build_object('id', new.id)
        ),
        timeout_milliseconds := 10000
    );
    return new;
end;
$$;

revoke all on function public.notify_doctrine_signalement() from public, anon, authenticated;
drop trigger if exists notify_doctrine_signalement on public.doctrine_signalements;
create trigger notify_doctrine_signalement
after insert on public.doctrine_signalements
for each row execute function public.notify_doctrine_signalement();

-- Notifications Web Push DOCTRINE pour RETEX, fiches à corriger et validations.
-- À exécuter après retex-notifications.sql, guide_module8.sql et guide-officer-feedback.sql.
-- Réutilise les secrets Vault doctrine_event_push_url / doctrine_event_push_webhook_secret
-- et les secrets Edge DOCTRINE_VAPID_PUBLIC_KEY / DOCTRINE_VAPID_PRIVATE_KEY / DOCTRINE_EVENT_PUSH_WEBHOOK_SECRET.

create table if not exists public.doctrine_push_subscriptions (
    user_id uuid not null references auth.users(id) on delete cascade,
    endpoint text not null check (char_length(endpoint) between 1 and 2048),
    p256dh text not null check (char_length(p256dh) between 80 and 200),
    auth text not null check (char_length(auth) between 20 and 100),
    created_at timestamptz not null default now(),
    primary key (user_id, endpoint)
);
alter table public.doctrine_push_subscriptions enable row level security;
revoke all on public.doctrine_push_subscriptions from public, anon, authenticated;
grant all on public.doctrine_push_subscriptions to service_role;

create or replace function public.doctrine_emit_push_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    webhook_url text;
    webhook_secret text;
    event_record jsonb;
    event_name text;
begin
    select decrypted_secret into webhook_url from vault.decrypted_secrets
      where name = 'doctrine_report_push_url';
    select decrypted_secret into webhook_secret from vault.decrypted_secrets
      where name = 'doctrine_report_push_webhook_secret';
    if webhook_url is null or webhook_secret is null then
        raise warning 'DOCTRINE push: Vault configuration missing';
        return new;
    end if;

    if tg_table_name = 'doctrine_fiche_submissions' then
        event_name := 'fiche-submitted';
        event_record := jsonb_build_object(
            'id', new.id, 'user_id', new.user_id, 'dossier', new.dossier,
            'submission_type', new.submission_type
        );
    elsif tg_table_name = 'fiche_reviews' then
        if new.status <> 'valide' or (tg_op = 'UPDATE' and old.status = 'valide') then
            return new;
        end if;
        event_name := 'fiche-validated';
        event_record := jsonb_build_object('submission_id', new.submission_id, 'guide_id', new.guide_id);
    else
        event_name := 'retex-submitted';
        event_record := jsonb_build_object('id', new.id, 'user_id', new.user_id, 'source', tg_table_name);
    end if;

    perform net.http_post(
        url := webhook_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-doctrine-webhook-secret', webhook_secret
        ),
        body := jsonb_build_object('event', event_name, 'table', tg_table_name, 'record', event_record),
        timeout_milliseconds := 10000
    );
    return new;
end;
$$;
revoke all on function public.doctrine_emit_push_event() from public, anon, authenticated;

drop trigger if exists doctrine_push_retex_candidate on public.doctrine_retex;
create trigger doctrine_push_retex_candidate after insert on public.doctrine_retex
for each row execute function public.doctrine_emit_push_event();

drop trigger if exists doctrine_push_retex_guide on public.guide_retex_reports;
create trigger doctrine_push_retex_guide after insert on public.guide_retex_reports
for each row execute function public.doctrine_emit_push_event();

drop trigger if exists doctrine_push_fiche_submission on public.doctrine_fiche_submissions;
create trigger doctrine_push_fiche_submission after insert or update on public.doctrine_fiche_submissions
for each row execute function public.doctrine_emit_push_event();

drop trigger if exists doctrine_push_fiche_validated on public.fiche_reviews;
create trigger doctrine_push_fiche_validated after insert or update on public.fiche_reviews
for each row execute function public.doctrine_emit_push_event();

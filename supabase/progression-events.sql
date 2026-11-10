-- Journal des étapes de progression DOCTRINE visibles par l'administration QCM-MAJOR.
-- À exécuter après fiche-submissions.sql dans le projet Supabase partagé.

create table if not exists public.doctrine_progress_events (
    id              bigint generated always as identity primary key,
    user_id         uuid not null references auth.users(id) on delete cascade,
    event_type      text not null check (event_type in (
        'module_started',
        'module_completed',
        'dossier_completed',
        'correction_accessible'
    )),
    module_id       text not null check (module_id ~ '^[1-7]$'),
    dossier         smallint check (dossier is null or dossier between 1 and 999),
    created_at      timestamptz not null default now(),
    check (
        (event_type in ('dossier_completed', 'correction_accessible') and dossier is not null)
        or (event_type in ('module_started', 'module_completed') and dossier is null)
    ),
    check (event_type <> 'correction_accessible' or module_id = '4')
);

create index if not exists doctrine_progress_events_user_created_idx
    on public.doctrine_progress_events (user_id, created_at desc);

alter table public.doctrine_progress_events enable row level security;
revoke all on public.doctrine_progress_events from anon, authenticated;
grant insert on public.doctrine_progress_events to authenticated;

drop policy if exists doctrine_progress_events_candidate_insert
    on public.doctrine_progress_events;
create policy doctrine_progress_events_candidate_insert
    on public.doctrine_progress_events
    for insert to authenticated
    with check (
        user_id = auth.uid()
        and not coalesce((
            (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
            or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
        ), false)
    );

create or replace function public.doctrine_progress_events_set_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.user_id := auth.uid();
    new.created_at := now();
    return new;
end;
$$;

drop trigger if exists doctrine_progress_events_set_identity
    on public.doctrine_progress_events;
create trigger doctrine_progress_events_set_identity
    before insert on public.doctrine_progress_events
    for each row execute function public.doctrine_progress_events_set_identity();

select cron.unschedule(jobid)
from cron.job
where jobname = 'doctrine_progress_events_retention';

select cron.schedule(
    'doctrine_progress_events_retention',
    '23 3 * * *',
    $job$delete from public.doctrine_progress_events
         where created_at < now() - interval '12 months'$job$
);

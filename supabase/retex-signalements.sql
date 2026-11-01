-- DOCTRINE : fiches RETEX (une par candidat) et signalements du module 7.
-- À exécuter une fois dans Supabase > SQL Editor (projet de QCM-MAJOR.FR).
-- Les candidats ne peuvent qu'ajouter leurs fiches ; seuls les admins lisent
-- tout et traitent les signalements. L'identité, le statut et la date sont fixés côté base.

create table if not exists public.doctrine_retex (
    id              bigint generated always as identity primary key,
    user_id         uuid not null unique references auth.users(id) on delete cascade,
    candidate_email text not null default '',
    specialty       text check (specialty is null or char_length(specialty) <= 120),
    modules         text[] not null default '{}' check (cardinality(modules) <= 7),
    navigation      text check (navigation is null or char_length(navigation) <= 200),
    design          text check (design is null or char_length(design) <= 200),
    resources       text check (resources is null or char_length(resources) <= 200),
    viewer          text check (viewer is null or char_length(viewer) <= 200),
    used_report     text check (used_report is null or char_length(used_report) <= 200),
    recommendation  text check (recommendation is null or char_length(recommendation) <= 200),
    comment         text check (comment is null or char_length(comment) <= 2000),
    created_at      timestamptz not null default now()
);

create table if not exists public.doctrine_signalements (
    id              bigint generated always as identity primary key,
    user_id         uuid not null references auth.users(id) on delete cascade,
    candidate_email text not null default '',
    incident_type   text not null check (char_length(incident_type) between 1 and 120),
    module_id       text not null check (module_id ~ '^([1-7]|general)$'),
    resource        text check (resource is null or char_length(resource) <= 200),
    details         text not null check (char_length(details) between 1 and 500),
    priority        text not null check (priority in ('Information', 'Correction requise', 'Bloquant')),
    status          text not null default 'pending' check (status in ('pending', 'resolved')),
    created_at      timestamptz not null default now()
);

create index if not exists doctrine_signalements_created_at_idx
    on public.doctrine_signalements (created_at desc);

alter table public.doctrine_retex enable row level security;
alter table public.doctrine_signalements enable row level security;

drop policy if exists doctrine_retex_candidate_insert on public.doctrine_retex;
create policy doctrine_retex_candidate_insert on public.doctrine_retex
    for insert to authenticated
    with check (user_id = auth.uid());

drop policy if exists doctrine_retex_candidate_read_own on public.doctrine_retex;
create policy doctrine_retex_candidate_read_own on public.doctrine_retex
    for select to authenticated
    using (user_id = auth.uid());

drop policy if exists doctrine_retex_admin_read on public.doctrine_retex;
create policy doctrine_retex_admin_read on public.doctrine_retex
    for select to authenticated
    using (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
    );

drop policy if exists doctrine_signalements_candidate_insert on public.doctrine_signalements;
create policy doctrine_signalements_candidate_insert on public.doctrine_signalements
    for insert to authenticated
    with check (user_id = auth.uid() and status = 'pending');

drop policy if exists doctrine_signalements_admin_read on public.doctrine_signalements;
create policy doctrine_signalements_admin_read on public.doctrine_signalements
    for select to authenticated
    using (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
    );

drop policy if exists doctrine_signalements_admin_update on public.doctrine_signalements;
create policy doctrine_signalements_admin_update on public.doctrine_signalements
    for update to authenticated
    using (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
    )
    with check (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
    );

create or replace function public.doctrine_fiche_set_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.user_id := auth.uid();
    new.candidate_email := coalesce(auth.jwt() ->> 'email', '');
    new.created_at := now();
    return new;
end;
$$;

drop trigger if exists doctrine_retex_set_identity on public.doctrine_retex;
create trigger doctrine_retex_set_identity
    before insert on public.doctrine_retex
    for each row execute function public.doctrine_fiche_set_identity();

drop trigger if exists doctrine_signalements_set_identity on public.doctrine_signalements;
create trigger doctrine_signalements_set_identity
    before insert on public.doctrine_signalements
    for each row execute function public.doctrine_fiche_set_identity();

grant select, insert on public.doctrine_retex to authenticated;
grant select, insert, update on public.doctrine_signalements to authenticated;
grant usage, select on sequence public.doctrine_retex_id_seq to authenticated;
grant usage, select on sequence public.doctrine_signalements_id_seq to authenticated;

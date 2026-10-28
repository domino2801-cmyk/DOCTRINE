-- DOCTRINE : journal des ouvertures de documents par candidat.
-- À exécuter une fois dans Supabase > SQL Editor (projet de QCM-MAJOR.FR).
-- Les candidats peuvent ajouter leurs propres événements ; seuls les admins
-- peuvent lire le journal. L'identité et la date sont fixées côté base.

create table if not exists public.doctrine_document_views (
    id              bigint generated always as identity primary key,
    user_id         uuid not null references auth.users(id) on delete cascade,
    candidate_email text not null,
    module_id       text not null check (module_id ~ '^[1-6]$'),
    document_title  text not null check (length(document_title) between 1 and 300),
    document_url    text not null check (length(document_url) <= 2048 and document_url ~ '^https?://'),
    opened_at       timestamptz not null default now()
);

create index if not exists doctrine_document_views_opened_at_idx
    on public.doctrine_document_views (opened_at desc);
create index if not exists doctrine_document_views_user_opened_at_idx
    on public.doctrine_document_views (user_id, opened_at desc);

alter table public.doctrine_document_views enable row level security;

drop policy if exists doctrine_document_views_candidate_insert
    on public.doctrine_document_views;
create policy doctrine_document_views_candidate_insert
    on public.doctrine_document_views
    for insert to authenticated
    with check (user_id = auth.uid());

drop policy if exists doctrine_document_views_admin_read
    on public.doctrine_document_views;
create policy doctrine_document_views_admin_read
    on public.doctrine_document_views
    for select to authenticated
    using (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
    );

create or replace function public.doctrine_document_views_set_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.user_id := auth.uid();
    new.candidate_email := coalesce(auth.jwt() ->> 'email', '');
    new.opened_at := now();
    return new;
end;
$$;

drop trigger if exists doctrine_document_views_set_identity
    on public.doctrine_document_views;
create trigger doctrine_document_views_set_identity
    before insert on public.doctrine_document_views
    for each row execute function public.doctrine_document_views_set_identity();

grant insert, select on public.doctrine_document_views to authenticated;
grant usage, select on sequence public.doctrine_document_views_id_seq to authenticated;

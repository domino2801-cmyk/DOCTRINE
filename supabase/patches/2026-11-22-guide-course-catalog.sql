-- Catalogue de cours de l’Officier Guide — Module 8.
-- Exécuter une seule fois dans Supabase > SQL Editor.
begin;

create table if not exists public.guide_course_catalog (
    id uuid primary key default gen_random_uuid(),
    guide_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    title text not null check (char_length(trim(title)) between 1 and 160),
    category text not null check (char_length(trim(category)) between 1 and 100),
    description text not null default '' check (char_length(description) <= 1200),
    drive_url text not null check (
        drive_url ~ '^https://(drive[.]google[.]com|docs[.]google[.]com)/'
        and char_length(drive_url) <= 1000
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists guide_course_catalog_owner_category_idx
    on public.guide_course_catalog (guide_id, category, title);

alter table public.guide_course_catalog enable row level security;
revoke all on public.guide_course_catalog from public, anon;
grant select, insert, update, delete on public.guide_course_catalog to authenticated;

drop policy if exists guide_course_catalog_select_own on public.guide_course_catalog;
create policy guide_course_catalog_select_own
    on public.guide_course_catalog for select to authenticated
    using (guide_id = auth.uid() and public.doctrine_is_guide());

drop policy if exists guide_course_catalog_insert_own on public.guide_course_catalog;
create policy guide_course_catalog_insert_own
    on public.guide_course_catalog for insert to authenticated
    with check (guide_id = auth.uid() and public.doctrine_is_guide());

drop policy if exists guide_course_catalog_update_own on public.guide_course_catalog;
create policy guide_course_catalog_update_own
    on public.guide_course_catalog for update to authenticated
    using (guide_id = auth.uid() and public.doctrine_is_guide())
    with check (guide_id = auth.uid() and public.doctrine_is_guide());

drop policy if exists guide_course_catalog_delete_own on public.guide_course_catalog;
create policy guide_course_catalog_delete_own
    on public.guide_course_catalog for delete to authenticated
    using (guide_id = auth.uid() and public.doctrine_is_guide());

create or replace function public.guide_course_catalog_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists guide_course_catalog_updated_at on public.guide_course_catalog;
create trigger guide_course_catalog_updated_at
    before update on public.guide_course_catalog
    for each row execute function public.guide_course_catalog_set_updated_at();

commit;

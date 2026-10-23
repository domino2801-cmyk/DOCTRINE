-- DOCTRINE : contenu éditable des modules (interface administrateur).
-- À exécuter une fois dans Supabase > SQL Editor (projet de QCM-MAJOR.FR).
-- Lecture : tout compte connecté. Écriture : administrateurs uniquement,
-- avec la même règle que QCM-MAJOR (app_metadata.role = 'admin' ou bm4_admin = true).

create table if not exists public.doctrine_content (
    module_id   text primary key check (module_id ~ '^[1-6]$'),
    html        text not null check (length(html) < 500000),
    updated_at  timestamptz not null default now(),
    updated_by  text
);

alter table public.doctrine_content enable row level security;

drop policy if exists doctrine_content_read on public.doctrine_content;
create policy doctrine_content_read on public.doctrine_content
    for select to authenticated
    using (true);

drop policy if exists doctrine_content_admin_write on public.doctrine_content;
create policy doctrine_content_admin_write on public.doctrine_content
    for all to authenticated
    using (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
    )
    with check (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
    );

create or replace function public.doctrine_content_touch() returns trigger
language plpgsql as $$
begin
    new.updated_at := now();
    new.updated_by := auth.jwt() ->> 'email';
    return new;
end $$;

drop trigger if exists doctrine_content_touch on public.doctrine_content;
create trigger doctrine_content_touch
    before insert or update on public.doctrine_content
    for each row execute function public.doctrine_content_touch();

-- Suivi persistant des RETEX lus par chaque administrateur.
-- À exécuter dans le SQL Editor Supabase après guide_module8.sql.
begin;

create table if not exists public.doctrine_retex_reads (
    admin_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    source text not null check (source in ('qcm', 'guide')),
    retex_id text not null check (length(retex_id) between 1 and 128),
    read_at timestamptz not null default now(),
    constraint doctrine_retex_reads_pkey primary key (admin_id, source, retex_id)
);

create index if not exists doctrine_retex_reads_admin_read_idx
    on public.doctrine_retex_reads (admin_id, read_at desc);

alter table public.doctrine_retex_reads enable row level security;
revoke all on public.doctrine_retex_reads from public, anon;
grant select, insert on public.doctrine_retex_reads to authenticated;

drop policy if exists doctrine_retex_reads_admin_select on public.doctrine_retex_reads;
create policy doctrine_retex_reads_admin_select
    on public.doctrine_retex_reads for select to authenticated
    using (admin_id = auth.uid() and public.doctrine_is_admin());

drop policy if exists doctrine_retex_reads_admin_insert on public.doctrine_retex_reads;
create policy doctrine_retex_reads_admin_insert
    on public.doctrine_retex_reads for insert to authenticated
    with check (admin_id = auth.uid() and public.doctrine_is_admin());

commit;

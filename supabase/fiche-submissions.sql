-- DOCTRINE: fiches transmises (module 4). Le proxy Drive n'ouvre le corrigé N
-- qu'aux candidats ayant transmis leur fiche du dossier N (ou aux admins).
-- À exécuter dans Supabase > SQL Editor ou avec `supabase db query --linked --file`.

create table if not exists public.doctrine_fiche_submissions (
    user_id uuid not null references auth.users(id) on delete cascade,
    dossier smallint not null check (dossier between 1 and 999),
    created_at timestamptz not null default now(),
    primary key (user_id, dossier)
);

-- RLS actif sans policy : seul service_role (fonctions Edge) y accède.
alter table public.doctrine_fiche_submissions enable row level security;
revoke all on public.doctrine_fiche_submissions from anon, authenticated;

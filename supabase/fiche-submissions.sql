-- DOCTRINE: fiches transmises (module 4). Le proxy Drive n'ouvre le corrigé N
-- qu'aux candidats ayant transmis leur fiche de proposition du dossier N (ou aux admins).
-- À exécuter dans Supabase > SQL Editor ou avec `supabase db query --linked --file`.

begin;

create table if not exists public.doctrine_fiche_submissions (
    user_id uuid not null references auth.users(id) on delete cascade,
    dossier smallint not null check (dossier between 1 and 999),
    submission_type text not null default 'proposition'
        constraint doctrine_fiche_submissions_submission_type_check
        check (submission_type in ('proposition', 'support_oral')),
    created_at timestamptz not null default now(),
    primary key (user_id, dossier, submission_type)
);

alter table public.doctrine_fiche_submissions
    add column if not exists submission_type text;
update public.doctrine_fiche_submissions
    set submission_type = 'proposition'
    where submission_type is null;
alter table public.doctrine_fiche_submissions
    alter column submission_type set default 'proposition';
alter table public.doctrine_fiche_submissions
    alter column submission_type set not null;

do $$
declare
    existing_primary_key text;
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.doctrine_fiche_submissions'::regclass
          and contype = 'p'
          and pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, dossier, submission_type)'
    ) then
        select conname into existing_primary_key
        from pg_constraint
        where conrelid = 'public.doctrine_fiche_submissions'::regclass
          and contype = 'p';
        if existing_primary_key is not null then
            execute format(
                'alter table public.doctrine_fiche_submissions drop constraint %I',
                existing_primary_key
            );
        end if;
        alter table public.doctrine_fiche_submissions
            add constraint doctrine_fiche_submissions_pkey
            primary key (user_id, dossier, submission_type);
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.doctrine_fiche_submissions'::regclass
          and conname = 'doctrine_fiche_submissions_submission_type_check'
    ) then
        alter table public.doctrine_fiche_submissions
            add constraint doctrine_fiche_submissions_submission_type_check
            check (submission_type in ('proposition', 'support_oral'));
    end if;
end;
$$;

-- RLS actif sans policy : seul service_role (fonctions Edge) y accède.
alter table public.doctrine_fiche_submissions enable row level security;
revoke all on public.doctrine_fiche_submissions from anon, authenticated;

commit;

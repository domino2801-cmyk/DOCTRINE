-- Harmonisation préalable des droits Officier Guide.
-- Ne jamais autoriser un compte sur la seule base d'une spécialité déclarée :
-- le rôle doit provenir de app_metadata et le profil connecté doit être OG.
do $$
begin
    if to_regprocedure('public.doctrine_is_admin()') is null then
        raise exception 'Fonction doctrine_is_admin() absente : exécuter guide_module8.sql avant guide-officer-feedback.sql.';
    end if;
    if to_regclass('public.profiles') is null then
        raise exception 'Table public.profiles absente : migration interrompue.';
    end if;
end;
$$;

create or replace function public.doctrine_is_guide()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        (auth.jwt() -> 'app_metadata' ->> 'role') in ('guide', 'officier_guide')
        and exists (
            select 1
            from public.profiles profile
            where profile.id = auth.uid()
              and upper(trim(coalesce(to_jsonb(profile) ->> 'speciality', ''))) = 'OG'
        ),
        false
    );
$$;

revoke all on function public.doctrine_is_guide() from public, anon;
grant execute on function public.doctrine_is_guide() to authenticated;

-- Fiches autonomes de l'espace Officier Guide : RETEX et signalement.
-- Migration additive : ne modifie ni les fiches candidats ni le Module 7.

create table if not exists public.guide_retex_reports (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    guide_email text not null default '',
    payload jsonb not null default '{}'::jsonb,
    priority text not null default 'normal' check (priority in ('low','normal','high')),
    status text not null default 'submitted'
        check (status in ('submitted','in_review','action_required','resolved','closed')),
    admin_response text,
    processed_by uuid references auth.users(id) on delete set null,
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.guide_signalements (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    guide_email text not null default '',
    payload jsonb not null default '{}'::jsonb,
    priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
    status text not null default 'submitted'
        check (status in ('submitted','in_review','action_required','resolved','closed')),
    admin_response text,
    processed_by uuid references auth.users(id) on delete set null,
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.guide_retex_reports add column if not exists guide_email text not null default '';
alter table public.guide_retex_reports add column if not exists priority text not null default 'normal';
alter table public.guide_signalements add column if not exists guide_email text not null default '';

create or replace function public.guide_feedback_set_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.user_id := auth.uid();
    new.guide_email := coalesce(auth.jwt() ->> 'email', '');
    if tg_op = 'INSERT' then
        new.created_at := now();
    end if;
    return new;
end;
$$;

drop trigger if exists guide_retex_reports_set_identity on public.guide_retex_reports;
create trigger guide_retex_reports_set_identity
    before insert on public.guide_retex_reports
    for each row execute function public.guide_feedback_set_identity();

drop trigger if exists guide_signalements_set_identity on public.guide_signalements;
create trigger guide_signalements_set_identity
    before insert on public.guide_signalements
    for each row execute function public.guide_feedback_set_identity();

create index if not exists guide_retex_reports_user_created_idx
    on public.guide_retex_reports(user_id, created_at desc);
create index if not exists guide_signalements_user_created_idx
    on public.guide_signalements(user_id, created_at desc);
create index if not exists guide_signalements_status_created_idx
    on public.guide_signalements(status, created_at desc);

alter table public.guide_retex_reports enable row level security;
alter table public.guide_signalements enable row level security;

drop policy if exists guide_retex_insert_own on public.guide_retex_reports;
create policy guide_retex_insert_own on public.guide_retex_reports
    for insert to authenticated
    with check (user_id = auth.uid() and public.doctrine_is_guide());

drop policy if exists guide_retex_read_own on public.guide_retex_reports;
create policy guide_retex_read_own on public.guide_retex_reports
    for select to authenticated
    using (user_id = auth.uid() and public.doctrine_is_guide());

drop policy if exists guide_retex_admin_read on public.guide_retex_reports;
create policy guide_retex_admin_read on public.guide_retex_reports
    for select to authenticated using (public.doctrine_is_admin());

drop policy if exists guide_retex_admin_update on public.guide_retex_reports;
create policy guide_retex_admin_update on public.guide_retex_reports
    for update to authenticated
    using (public.doctrine_is_admin())
    with check (public.doctrine_is_admin());

drop policy if exists guide_signalements_insert_own on public.guide_signalements;
create policy guide_signalements_insert_own on public.guide_signalements
    for insert to authenticated
    with check (user_id = auth.uid() and public.doctrine_is_guide());

drop policy if exists guide_signalements_read_own on public.guide_signalements;
create policy guide_signalements_read_own on public.guide_signalements
    for select to authenticated
    using (user_id = auth.uid() and public.doctrine_is_guide());

drop policy if exists guide_signalements_admin_read on public.guide_signalements;
create policy guide_signalements_admin_read on public.guide_signalements
    for select to authenticated using (public.doctrine_is_admin());

drop policy if exists guide_signalements_admin_update on public.guide_signalements;
create policy guide_signalements_admin_update on public.guide_signalements
    for update to authenticated
    using (public.doctrine_is_admin())
    with check (public.doctrine_is_admin());

grant select, insert, update on public.guide_retex_reports to authenticated;
grant select, insert, update on public.guide_signalements to authenticated;

-- Les tables peuvent préexister avec un id sans séquence (migration historique).
-- Accorder les droits uniquement si PostgreSQL trouve la séquence réelle.
do $$
declare
    report_seq text;
    signalement_seq text;
begin
    report_seq := pg_get_serial_sequence('public.guide_retex_reports', 'id');
    if report_seq is not null then
        execute format('grant usage, select on sequence %s to authenticated', report_seq);
    else
        raise notice 'Aucune séquence liée à guide_retex_reports.id : aucun droit de séquence à accorder.';
    end if;

    signalement_seq := pg_get_serial_sequence('public.guide_signalements', 'id');
    if signalement_seq is not null then
        execute format('grant usage, select on sequence %s to authenticated', signalement_seq);
    else
        raise notice 'Aucune séquence liée à guide_signalements.id : aucun droit de séquence à accorder.';
    end if;
end;
$$;

create or replace function public.guide_feedback_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists guide_retex_reports_touch_updated_at on public.guide_retex_reports;
create trigger guide_retex_reports_touch_updated_at
    before update on public.guide_retex_reports
    for each row execute function public.guide_feedback_touch_updated_at();

drop trigger if exists guide_signalements_touch_updated_at on public.guide_signalements;
create trigger guide_signalements_touch_updated_at
    before update on public.guide_signalements
    for each row execute function public.guide_feedback_touch_updated_at();

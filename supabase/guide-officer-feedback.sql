-- Fiches autonomes de l'espace Officier Guide : RETEX et signalement.
-- Migration additive : ne modifie ni les fiches candidats ni le Module 7.

create table if not exists public.guide_retex_reports (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    payload jsonb not null default '{}'::jsonb,
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

create index if not exists guide_retex_reports_user_created_idx
    on public.guide_retex_reports(user_id, created_at desc);
create index if not exists guide_signalements_user_created_idx
    on public.guide_signalements(user_id, created_at desc);
create index if not exists guide_signalements_status_created_idx
    on public.guide_signalements(status, created_at desc);

create or replace function public.guide_feedback_is_admin()
returns boolean
language sql stable security invoker
set search_path = ''
as $$
    select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false)
        or coalesce(auth.jwt() -> 'app_metadata' ->> 'bm4_admin' in ('true','1'), false);
$$;

create or replace function public.guide_feedback_is_guide()
returns boolean
language sql stable security invoker
set search_path = ''
as $$
    select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' in ('guide','officier_guide'), false)
        or exists (
            select 1 from public.user_roles ur
            where ur.user_id = auth.uid()
              and lower(ur.role) in ('guide','officier_guide')
        );
$$;

alter table public.guide_retex_reports enable row level security;
alter table public.guide_signalements enable row level security;

drop policy if exists guide_retex_insert_own on public.guide_retex_reports;
create policy guide_retex_insert_own on public.guide_retex_reports
    for insert to authenticated
    with check (user_id = auth.uid() and public.guide_feedback_is_guide());

drop policy if exists guide_retex_read_own on public.guide_retex_reports;
create policy guide_retex_read_own on public.guide_retex_reports
    for select to authenticated
    using (user_id = auth.uid() and public.guide_feedback_is_guide());

drop policy if exists guide_retex_admin_read on public.guide_retex_reports;
create policy guide_retex_admin_read on public.guide_retex_reports
    for select to authenticated using (public.guide_feedback_is_admin());

drop policy if exists guide_retex_admin_update on public.guide_retex_reports;
create policy guide_retex_admin_update on public.guide_retex_reports
    for update to authenticated
    using (public.guide_feedback_is_admin())
    with check (public.guide_feedback_is_admin());

drop policy if exists guide_signalements_insert_own on public.guide_signalements;
create policy guide_signalements_insert_own on public.guide_signalements
    for insert to authenticated
    with check (user_id = auth.uid() and public.guide_feedback_is_guide());

drop policy if exists guide_signalements_read_own on public.guide_signalements;
create policy guide_signalements_read_own on public.guide_signalements
    for select to authenticated
    using (user_id = auth.uid() and public.guide_feedback_is_guide());

drop policy if exists guide_signalements_admin_read on public.guide_signalements;
create policy guide_signalements_admin_read on public.guide_signalements
    for select to authenticated using (public.guide_feedback_is_admin());

drop policy if exists guide_signalements_admin_update on public.guide_signalements;
create policy guide_signalements_admin_update on public.guide_signalements
    for update to authenticated
    using (public.guide_feedback_is_admin())
    with check (public.guide_feedback_is_admin());

grant select, insert, update on public.guide_retex_reports to authenticated;
grant select, insert, update on public.guide_signalements to authenticated;
grant usage, select on sequence public.guide_retex_reports_id_seq to authenticated;
grant usage, select on sequence public.guide_signalements_id_seq to authenticated;

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

-- Module 8 — Poste de commandement Officier Guide BM4.
-- Les rôles d'autorisation sont stockés dans auth.users.raw_app_meta_data,
-- jamais dans un champ de profil modifiable par l'utilisateur.
-- À exécuter dans le SQL Editor du projet Supabase partagé.
-- Un administrateur authentifié peut attribuer un rôle avec
-- public.set_doctrine_user_role(user_uuid, 'guide'); le compte doit ensuite
-- se reconnecter pour recevoir le nouveau claim JWT.

begin;

create or replace function public.doctrine_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce(
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1'),
        false
    );
$$;

create or replace function public.doctrine_is_guide()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce(
        (auth.jwt() -> 'app_metadata' ->> 'role') in ('guide', 'officier_guide')
        or upper(trim(coalesce(auth.jwt() -> 'app_metadata' ->> 'specialty', ''))) = 'OG',
        false
    );
$$;

create table if not exists public.guide_candidates (
    id uuid primary key default gen_random_uuid(),
    guide_id uuid not null references auth.users (id) on delete cascade,
    candidate_id uuid not null references auth.users (id) on delete cascade,
    assigned_at timestamptz not null default now(),
    constraint guide_candidates_guide_candidate_key unique (guide_id, candidate_id),
    constraint guide_candidates_not_self check (guide_id <> candidate_id)
);

create index if not exists guide_candidates_candidate_idx
    on public.guide_candidates (candidate_id, guide_id);

create table if not exists public.doctrine_candidate_guide_codes (
    candidate_id uuid primary key references auth.users (id) on delete cascade,
    code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
    created_at timestamptz not null default now()
);

alter table public.doctrine_candidate_guide_codes enable row level security;
revoke all on public.doctrine_candidate_guide_codes from public, anon, authenticated;

alter table public.guide_candidates enable row level security;
revoke all on public.guide_candidates from public, anon, authenticated;
grant select on public.guide_candidates to authenticated;

create or replace function public.doctrine_can_access_candidate(p_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        public.doctrine_is_admin()
        or (
            public.doctrine_is_guide()
            and exists (
                select 1
                from public.guide_candidates assignment
                where assignment.guide_id = auth.uid()
                  and assignment.candidate_id = p_candidate_id
            )
        ),
        false
    );
$$;

create or replace function public.doctrine_can_access_candidate_path(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    candidate_folder text;
begin
    candidate_folder := split_part(coalesce(p_object_name, ''), '/', 1);
    if array_length(string_to_array(coalesce(p_object_name, ''), '/'), 1) <> 2 then
        return false;
    end if;
    if candidate_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return false;
    end if;
    return public.doctrine_can_access_candidate(candidate_folder::uuid);
end;
$$;

revoke all on function public.doctrine_is_admin() from public, anon;
revoke all on function public.doctrine_is_guide() from public, anon;
revoke all on function public.doctrine_can_access_candidate(uuid) from public, anon;
revoke all on function public.doctrine_can_access_candidate_path(text) from public, anon;
grant execute on function public.doctrine_is_admin() to authenticated;
grant execute on function public.doctrine_is_guide() to authenticated;
grant execute on function public.doctrine_can_access_candidate(uuid) to authenticated;
grant execute on function public.doctrine_can_access_candidate_path(text) to authenticated;

drop policy if exists guide_candidates_read_own on public.guide_candidates;
create policy guide_candidates_read_own
    on public.guide_candidates for select to authenticated
    using (guide_id = auth.uid() or public.doctrine_is_admin());

drop policy if exists guide_candidates_insert_own on public.guide_candidates;
drop policy if exists guide_candidates_delete_own on public.guide_candidates;

-- Chaque type de fiche est une soumission distincte ; l'identifiant UUID
-- permet d'attacher une évaluation détaillée à chaque fiche.
alter table public.doctrine_fiche_submissions
    add column if not exists id uuid default gen_random_uuid();
alter table public.doctrine_fiche_submissions
    add column if not exists storage_path text;
update public.doctrine_fiche_submissions
    set id = gen_random_uuid()
    where id is null;
alter table public.doctrine_fiche_submissions
    alter column id set default gen_random_uuid();
alter table public.doctrine_fiche_submissions
    alter column id set not null;
create unique index if not exists doctrine_fiche_submissions_id_uidx
    on public.doctrine_fiche_submissions (id);

create table if not exists public.fiche_reviews (
    id uuid primary key default gen_random_uuid(),
    submission_id uuid not null references public.doctrine_fiche_submissions (id) on delete cascade,
    guide_id uuid not null references auth.users (id) on delete cascade,
    form_grade numeric(4, 2) check (form_grade is null or form_grade between 0 and 6),
    content_grade numeric(4, 2) check (content_grade is null or content_grade between 0 and 14),
    grade numeric(4, 2) check (grade is null or grade between 0 and 20),
    rubric_scores jsonb not null default '{}'::jsonb,
    jury_checklist jsonb not null default '{}'::jsonb,
    status text not null default 'en_attente'
        check (status in ('en_attente', 'a_reprendre', 'valide')),
    comment text not null default '',
    reviewed_at timestamptz not null default now(),
    constraint fiche_reviews_submission_guide_key unique (submission_id, guide_id)
);

alter table public.fiche_reviews
    add column if not exists rubric_scores jsonb not null default '{}'::jsonb;
alter table public.fiche_reviews
    add column if not exists jury_checklist jsonb not null default '{}'::jsonb;
alter table public.fiche_reviews
    add column if not exists form_observations text,
    add column if not exists form_evidence text,\n    add column if not exists rubric_observations jsonb not null default '{}'::jsonb,\n    add column if not exists rubric_evidence jsonb not null default '{}'::jsonb;

create index if not exists fiche_reviews_guide_reviewed_idx
    on public.fiche_reviews (guide_id, reviewed_at desc);
create index if not exists fiche_reviews_submission_idx
    on public.fiche_reviews (submission_id, reviewed_at desc);

create or replace function public.fiche_reviews_set_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    submission_type text;
    required_keys text[];
    allowed_checklist_keys text[];
begin
    if auth.uid() is not null then
        new.guide_id := auth.uid();
    end if;
    select submission.submission_type
    into submission_type
    from public.doctrine_fiche_submissions submission
    where submission.id = new.submission_id;

    if submission_type is null then
        raise exception 'La fiche à évaluer est introuvable.'
            using errcode = '22023';
    end if;
    if jsonb_typeof(new.rubric_scores) is distinct from 'object' then
        raise exception 'Le détail des critères doit être un objet JSON.'
            using errcode = '22023';
    end if;

    if jsonb_typeof(new.jury_checklist) is distinct from 'object' then
        raise exception 'La liste des points clés du jury doit être un objet JSON.'
            using errcode = '22023';
    end if;
    if exists (
        select 1
        from jsonb_each(new.jury_checklist) item
        where jsonb_typeof(item.value) is distinct from 'boolean'
    ) then
        raise exception 'Chaque point clé du jury doit être coché ou décoché.'
            using errcode = '22023';
    end if;
    if submission_type = 'proposition' then
        allowed_checklist_keys := array[
            'p_form_pages', 'p_form_header', 'p_form_references', 'p_form_style',
            'p_intro_context', 'p_intro_solution', 'p_intro_plan',
            'p_problem_facts', 'p_problem_level', 'p_problem_criteria',
            'p_solutions_three', 'p_solutions_details', 'p_solutions_risks',
            'p_opinion', 'p_risk_mitigation', 'p_conclusion'
        ];
    elsif submission_type = 'support_oral' then
        allowed_checklist_keys := array[
            'oral_operatoire',
            'oral_introduction',
            'oral_argumentaire',
            'oral_conclusion'
        ];
    else
        raise exception 'Type de fiche non évaluable.'
            using errcode = '22023';
    end if;
    if exists (
        select 1
        from jsonb_each(new.jury_checklist) item
        where not (item.key = any(allowed_checklist_keys))
    ) then
        raise exception 'La liste des points clés ne correspond pas au type de fiche.'
            using errcode = '22023';
    end if;

    if new.rubric_scores <> '{}'::jsonb then
        if submission_type = 'proposition' then
            required_keys := array['form', 'introduction', 'problematique_donnees', 'solutions', 'avis_conclusion'];
            if not (new.rubric_scores ?& required_keys) or exists (
                select 1
                from jsonb_each(new.rubric_scores) score
                where not (score.key = any(required_keys))
                   or jsonb_typeof(score.value) is distinct from 'number'
            ) then
                raise exception 'Les critères de la fiche de proposition sont incomplets ou invalides.'
                    using errcode = '22023';
            end if;
            if (new.rubric_scores ->> 'form')::numeric not between 0 and 6
               or (new.rubric_scores ->> 'introduction')::numeric not between 0 and 3
               or (new.rubric_scores ->> 'problematique_donnees')::numeric not between 0 and 3
               or (new.rubric_scores ->> 'solutions')::numeric not between 0 and 4
               or (new.rubric_scores ->> 'avis_conclusion')::numeric not between 0 and 4 then
                raise exception 'Une note de la fiche de proposition dépasse le barème.'
                    using errcode = '22023';
            end if;
            new.form_grade := round((new.rubric_scores ->> 'form')::numeric, 2);
            new.content_grade := round(
                (new.rubric_scores ->> 'introduction')::numeric
                + (new.rubric_scores ->> 'problematique_donnees')::numeric
                + (new.rubric_scores ->> 'solutions')::numeric
                + (new.rubric_scores ->> 'avis_conclusion')::numeric,
                2
            );
        elsif submission_type = 'support_oral' then
            required_keys := array['operatoire_forme', 'introduction', 'argumentaire', 'conclusion'];
            if not (new.rubric_scores ?& required_keys) or exists (
                select 1
                from jsonb_each(new.rubric_scores) score
                where not (score.key = any(required_keys))
                   or jsonb_typeof(score.value) is distinct from 'number'
            ) then
                raise exception 'Les critères du support oral sont incomplets ou invalides.'
                    using errcode = '22023';
            end if;
            if (new.rubric_scores ->> 'operatoire_forme')::numeric not between 0 and 6
               or (new.rubric_scores ->> 'introduction')::numeric not between 0 and 4
               or (new.rubric_scores ->> 'argumentaire')::numeric not between 0 and 7
               or (new.rubric_scores ->> 'conclusion')::numeric not between 0 and 3 then
                raise exception 'Une note du support oral dépasse le barème.'
                    using errcode = '22023';
            end if;
            new.form_grade := round((new.rubric_scores ->> 'operatoire_forme')::numeric, 2);
            new.content_grade := round(
                (new.rubric_scores ->> 'introduction')::numeric
                + (new.rubric_scores ->> 'argumentaire')::numeric
                + (new.rubric_scores ->> 'conclusion')::numeric,
                2
            );
        else
            raise exception 'Type de fiche non évaluable.'
                using errcode = '22023';
        end if;
    end if;

    if new.form_grade is not null and new.content_grade is not null then
        new.grade := round(new.form_grade + new.content_grade, 2);
    elsif new.status <> 'en_attente' then
        raise exception 'Une note de forme et une note de fond sont requises pour clôturer une évaluation.'
            using errcode = '22023';
    else
        new.grade := null;
    end if;
    new.reviewed_at := now();
    return new;
end;
$$;

drop trigger if exists fiche_reviews_set_identity on public.fiche_reviews;
create trigger fiche_reviews_set_identity
    before insert or update on public.fiche_reviews
    for each row execute function public.fiche_reviews_set_identity();
revoke all on function public.fiche_reviews_set_identity() from public, anon, authenticated;

alter table public.fiche_reviews enable row level security;
revoke all on public.fiche_reviews from public, anon, authenticated;
grant select, insert, update on public.fiche_reviews to authenticated;

drop policy if exists fiche_reviews_candidate_read_own on public.fiche_reviews;
create policy fiche_reviews_candidate_read_own
    on public.fiche_reviews for select to authenticated
    using (
        exists (
            select 1
            from public.doctrine_fiche_submissions submission
            where submission.id = submission_id
              and submission.submission_type in ('proposition', 'support_oral')
              and submission.user_id = auth.uid()
        )
    );

drop policy if exists fiche_reviews_guide_read_assigned on public.fiche_reviews;
create policy fiche_reviews_guide_read_assigned
    on public.fiche_reviews for select to authenticated
    using (
        (public.doctrine_is_admin() or guide_id = auth.uid())
        and exists (
            select 1
            from public.doctrine_fiche_submissions submission
            where submission.id = submission_id
              and submission.submission_type in ('proposition', 'support_oral')
              and public.doctrine_can_access_candidate(submission.user_id)
        )
    );

drop policy if exists fiche_reviews_guide_insert_assigned on public.fiche_reviews;
create policy fiche_reviews_guide_insert_assigned
    on public.fiche_reviews for insert to authenticated
    with check (
        (public.doctrine_is_admin() or public.doctrine_is_guide())
        and guide_id = auth.uid()
        and exists (
            select 1
            from public.doctrine_fiche_submissions submission
            where submission.id = submission_id
              and submission.submission_type in ('proposition', 'support_oral')
              and public.doctrine_can_access_candidate(submission.user_id)
        )
    );

drop policy if exists fiche_reviews_guide_update_assigned on public.fiche_reviews;
create policy fiche_reviews_guide_update_assigned
    on public.fiche_reviews for update to authenticated
    using (
        (public.doctrine_is_admin() or guide_id = auth.uid())
        and exists (
            select 1
            from public.doctrine_fiche_submissions submission
            where submission.id = submission_id
              and submission.submission_type in ('proposition', 'support_oral')
              and public.doctrine_can_access_candidate(submission.user_id)
        )
    )
    with check (
        (public.doctrine_is_admin() or public.doctrine_is_guide())
        and guide_id = auth.uid()
        and exists (
            select 1
            from public.doctrine_fiche_submissions submission
            where submission.id = submission_id
              and submission.submission_type in ('proposition', 'support_oral')
              and public.doctrine_can_access_candidate(submission.user_id)
        )
    );

create table if not exists public.candidate_admission_tracking (
    id uuid primary key default gen_random_uuid(),
    candidate_id uuid not null unique references auth.users (id) on delete cascade,
    ccpm_date date,
    ccpm_score numeric(7, 2),
    ccpm_validated boolean not null default false,
    mock_orals_done integer not null default 0 check (mock_orals_done between 0 and 100),
    mock_orals_target integer not null default 4 check (mock_orals_target between 1 and 100),
    next_oral_date timestamptz,
    guide_notes text not null default '',
    updated_at timestamptz not null default now()
);

create index if not exists candidate_admission_tracking_updated_idx
    on public.candidate_admission_tracking (updated_at desc);

create or replace function public.candidate_admission_tracking_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists candidate_admission_tracking_touch on public.candidate_admission_tracking;
create trigger candidate_admission_tracking_touch
    before update on public.candidate_admission_tracking
    for each row execute function public.candidate_admission_tracking_touch();

alter table public.candidate_admission_tracking enable row level security;
revoke all on public.candidate_admission_tracking from public, anon, authenticated;
grant select, insert, update on public.candidate_admission_tracking to authenticated;

drop policy if exists candidate_admission_tracking_candidate_read_own
    on public.candidate_admission_tracking;
create policy candidate_admission_tracking_candidate_read_own
    on public.candidate_admission_tracking for select to authenticated
    using (candidate_id = auth.uid());

drop policy if exists candidate_admission_tracking_guide_read_assigned
    on public.candidate_admission_tracking;
create policy candidate_admission_tracking_guide_read_assigned
    on public.candidate_admission_tracking for select to authenticated
    using (public.doctrine_can_access_candidate(candidate_id));

drop policy if exists candidate_admission_tracking_guide_insert_assigned
    on public.candidate_admission_tracking;
create policy candidate_admission_tracking_guide_insert_assigned
    on public.candidate_admission_tracking for insert to authenticated
    with check (
        (public.doctrine_is_admin() or public.doctrine_is_guide())
        and public.doctrine_can_access_candidate(candidate_id)
    );

drop policy if exists candidate_admission_tracking_guide_update_assigned
    on public.candidate_admission_tracking;
create policy candidate_admission_tracking_guide_update_assigned
    on public.candidate_admission_tracking for update to authenticated
    using (public.doctrine_can_access_candidate(candidate_id))
    with check (
        (public.doctrine_is_admin() or public.doctrine_is_guide())
        and public.doctrine_can_access_candidate(candidate_id)
    );

-- Lectures des données déjà présentes : accès guide limité au rattachement.
alter table public.profiles enable row level security;
alter table public.doctrine_progress_events enable row level security;
alter table public.doctrine_fiche_submissions enable row level security;
alter table public.doctrine_document_views enable row level security;
alter table public.user_progress enable row level security;
alter table public.quiz_results enable row level security;

grant select on public.profiles to authenticated;
drop policy if exists doctrine_guides_read_assigned_profiles on public.profiles;
create policy doctrine_guides_read_assigned_profiles
    on public.profiles for select to authenticated
    using (public.doctrine_can_access_candidate(id));

grant select on public.doctrine_progress_events to authenticated;
drop policy if exists doctrine_guides_read_assigned_progress_events
    on public.doctrine_progress_events;
create policy doctrine_guides_read_assigned_progress_events
    on public.doctrine_progress_events for select to authenticated
    using (public.doctrine_can_access_candidate(user_id));

grant select on public.doctrine_fiche_submissions to authenticated;
drop policy if exists doctrine_fiche_submissions_candidate_read_own
    on public.doctrine_fiche_submissions;
create policy doctrine_fiche_submissions_candidate_read_own
    on public.doctrine_fiche_submissions for select to authenticated
    using (user_id = auth.uid());
drop policy if exists doctrine_guides_read_assigned_submissions
    on public.doctrine_fiche_submissions;
create policy doctrine_guides_read_assigned_submissions
    on public.doctrine_fiche_submissions for select to authenticated
    using (public.doctrine_can_access_candidate(user_id));

grant select on public.doctrine_document_views to authenticated;
drop policy if exists doctrine_guides_read_assigned_document_views
    on public.doctrine_document_views;
create policy doctrine_guides_read_assigned_document_views
    on public.doctrine_document_views for select to authenticated
    using (public.doctrine_can_access_candidate(user_id));

grant select on public.user_progress to authenticated;
drop policy if exists doctrine_guides_read_assigned_qcm_progress on public.user_progress;
create policy doctrine_guides_read_assigned_qcm_progress
    on public.user_progress for select to authenticated
    using (public.doctrine_can_access_candidate(user_id));

grant select on public.quiz_results to authenticated;
do $$
declare
    candidate_expression text;
begin
    select case count(*)
        when 2 then 'coalesce('
            || string_agg(format('(%I)::text', column_name), ', '
                          order by case column_name when 'candidate_id' then 1 else 2 end)
            || ')::uuid'
        when 1 then format('(%I)::text::uuid', min(column_name))
    end
    into candidate_expression
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'quiz_results'
      and column_name in ('candidate_id', 'user_id');

    if candidate_expression is null then
        raise exception 'public.quiz_results must contain candidate_id or user_id';
    end if;

    execute 'drop policy if exists doctrine_guides_read_assigned_quiz_results on public.quiz_results';
    execute format(
        'create policy doctrine_guides_read_assigned_quiz_results on public.quiz_results '
        || 'for select to authenticated using (public.doctrine_can_access_candidate(%s))',
        candidate_expression
    );
end;
$$;

-- Vue invoker : les politiques RLS des tables sous-jacentes restent actives.
create or replace view public.guide_cohort_candidates
with (security_invoker = true)
as
select
    assignment.id as assignment_id,
    assignment.guide_id,
    assignment.candidate_id,
    assignment.assigned_at,
    coalesce(
        nullif(to_jsonb(profile) ->> 'name', ''),
        'Candidat'
    ) as candidate_name
from public.guide_candidates assignment
left join public.profiles profile on profile.id = assignment.candidate_id
where public.doctrine_can_access_candidate(assignment.candidate_id);

grant select on public.guide_cohort_candidates to authenticated;

create or replace function public.set_doctrine_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not (
        (auth.uid() is not null and public.doctrine_is_admin())
        or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'))
    ) then
        raise exception 'Administrator access required' using errcode = '42501';
    end if;
    if p_user_id is null or p_role is null
       or p_role not in ('candidat', 'guide', 'officier_guide', 'admin') then
        raise exception 'Identifiant ou rôle invalide' using errcode = '22023';
    end if;
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
            || jsonb_build_object('role', p_role),
        updated_at = now()
    where id = p_user_id;
    if not found then
        raise exception 'Utilisateur introuvable' using errcode = '22023';
    end if;
end;
$$;

revoke all on function public.set_doctrine_user_role(uuid, text) from public, anon;
grant execute on function public.set_doctrine_user_role(uuid, text) to authenticated;

create or replace function public.search_guide_candidates(p_query text)
returns table (
    candidate_id uuid,
    email text,
    display_name text,
    grade text,
    unit text,
    specialty text,
    matricule text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    search_text text;
begin
    if auth.uid() is null or not (public.doctrine_is_admin() or public.doctrine_is_guide()) then
        raise exception 'Guide access required' using errcode = '42501';
    end if;
    search_text := left(regexp_replace(trim(coalesce(p_query, '')), '[%_]', '', 'g'), 120);
    if length(search_text) < 3 then
        raise exception 'Saisissez au moins 3 caractères' using errcode = '22023';
    end if;

    return query
    with candidate_profiles as (
        select
            user_account.id,
            user_account.email,
            user_account.raw_app_meta_data,
            user_account.raw_user_meta_data,
            to_jsonb(profile) as profile_data
        from auth.users user_account
        left join public.profiles profile on profile.id = user_account.id
        where user_account.email_confirmed_at is not null
          and coalesce(user_account.raw_app_meta_data ->> 'role', 'candidat')
                not in ('admin', 'guide', 'officier_guide')
          and not coalesce(
                lower(user_account.raw_app_meta_data ->> 'bm4_admin') in ('true', '1'),
                false
          )
    ),
    candidate_labels as (
        select
            cp.*,
            coalesce(
                nullif(cp.profile_data ->> 'name', ''),
                nullif(cp.raw_user_meta_data ->> 'name', ''),
                nullif(cp.raw_user_meta_data ->> 'full_name', ''),
                cp.email
            ) as label,
            coalesce(cp.profile_data ->> 'grade', cp.profile_data ->> 'rank',
                     cp.raw_app_meta_data ->> 'grade', cp.raw_app_meta_data ->> 'rank',
                     cp.raw_user_meta_data ->> 'grade', cp.raw_user_meta_data ->> 'rank') as grade_value,
            coalesce(cp.profile_data ->> 'unit', cp.profile_data ->> 'unite',
                     cp.raw_app_meta_data ->> 'unit', cp.raw_app_meta_data ->> 'unite',
                     cp.raw_user_meta_data ->> 'unit', cp.raw_user_meta_data ->> 'unite') as unit_value,
            coalesce(cp.profile_data ->> 'specialty', cp.profile_data ->> 'speciality',
                     cp.profile_data ->> 'specialite',
                     cp.raw_app_meta_data ->> 'specialty', cp.raw_app_meta_data ->> 'speciality',
                     cp.raw_app_meta_data ->> 'specialite',
                     cp.raw_user_meta_data ->> 'specialty', cp.raw_user_meta_data ->> 'speciality',
                     cp.raw_user_meta_data ->> 'specialite') as specialty_value,
            coalesce(cp.profile_data ->> 'matricule', cp.profile_data ->> 'service_number',
                     cp.raw_app_meta_data ->> 'matricule',
                     cp.raw_user_meta_data ->> 'matricule') as matricule_value
        from candidate_profiles cp
    )
    select
        cp.id as candidate_id,
        cp.email::text as email,
        cp.label as display_name,
        cp.grade_value as grade,
        cp.unit_value as unit,
        cp.specialty_value as specialty,
        cp.matricule_value as matricule
    from candidate_labels cp
    where (
            cp.email ilike '%' || search_text || '%'
            or cp.label ilike '%' || search_text || '%'
            or coalesce(cp.matricule_value, '') ilike '%' || search_text || '%'
       )
      and not exists (
          select 1
          from public.guide_candidates existing_assignment
          where existing_assignment.guide_id = auth.uid()
            and existing_assignment.candidate_id = cp.id
      )
    order by cp.label
    limit 20;
end;
$$;

revoke all on function public.search_guide_candidates(text) from public, anon;
grant execute on function public.search_guide_candidates(text) to authenticated;

create or replace function public.assign_guide_candidate(p_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    assignment_id uuid;
begin
    if auth.uid() is null or not (public.doctrine_is_admin() or public.doctrine_is_guide()) then
        raise exception 'Guide access required' using errcode = '42501';
    end if;
    if p_candidate_id is null or p_candidate_id = auth.uid()
       or not exists (
            select 1 from auth.users candidate
            where candidate.id = p_candidate_id
              and candidate.email_confirmed_at is not null
              and coalesce(candidate.raw_app_meta_data ->> 'role', 'candidat')
                    not in ('admin', 'guide', 'officier_guide')
              and not coalesce(
                    lower(candidate.raw_app_meta_data ->> 'bm4_admin') in ('true', '1'),
                    false
              )
       ) then
        raise exception 'Candidat introuvable ou non éligible' using errcode = '22023';
    end if;

    insert into public.guide_candidates (guide_id, candidate_id)
    values (auth.uid(), p_candidate_id)
    on conflict (guide_id, candidate_id) do nothing
    returning id into assignment_id;
    if assignment_id is null then
        select assignment.id into assignment_id
        from public.guide_candidates assignment
        where assignment.guide_id = auth.uid()
          and assignment.candidate_id = p_candidate_id;
    end if;
    return assignment_id;
end;
$$;

revoke all on function public.assign_guide_candidate(uuid) from public, anon;
grant execute on function public.assign_guide_candidate(uuid) to authenticated;

create or replace function public.get_doctrine_candidate_guide_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    candidate_code text;
    generated_code text;
    random_value bytea;
    attempt integer;
    character_index integer;
    bit_index integer;
    symbol_index integer;
begin
    if auth.uid() is null or not exists (
        select 1
        from auth.users candidate
        where candidate.id = auth.uid()
          and candidate.email_confirmed_at is not null
          and coalesce(candidate.raw_app_meta_data ->> 'role', 'candidat')
                not in ('admin', 'guide', 'officier_guide')
          and not coalesce(
                lower(candidate.raw_app_meta_data ->> 'bm4_admin') in ('true', '1'),
                false
          )
    ) then
        raise exception 'Compte candidat confirmé requis' using errcode = '42501';
    end if;

    select candidate_code_row.code
    into candidate_code
    from public.doctrine_candidate_guide_codes candidate_code_row
    where candidate_code_row.candidate_id = auth.uid();
    if found then
        return candidate_code;
    end if;

    for attempt in 1..8 loop
        random_value := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
        generated_code := '';
        for character_index in 0..7 loop
            symbol_index := 0;
            for bit_index in 0..4 loop
                symbol_index := symbol_index * 2
                    + pg_catalog.get_bit(random_value, character_index * 5 + bit_index);
            end loop;
            generated_code := generated_code
                || pg_catalog.substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', symbol_index + 1, 1);
        end loop;

        insert into public.doctrine_candidate_guide_codes (candidate_id, code)
        values (auth.uid(), generated_code)
        on conflict do nothing;

        select candidate_code_row.code
        into candidate_code
        from public.doctrine_candidate_guide_codes candidate_code_row
        where candidate_code_row.candidate_id = auth.uid();
        if found then
            return candidate_code;
        end if;
    end loop;

    raise exception 'Génération du code candidat impossible' using errcode = '40001';
end;
$$;

revoke all on function public.get_doctrine_candidate_guide_code() from public, anon;
grant execute on function public.get_doctrine_candidate_guide_code() to authenticated;

create or replace function public.assign_guide_candidate_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    candidate_code text;
    candidate_id uuid;
begin
    if auth.uid() is null or not (public.doctrine_is_admin() or public.doctrine_is_guide()) then
        raise exception 'Guide access required' using errcode = '42501';
    end if;

    candidate_code := upper(trim(coalesce(p_code, '')));
    if candidate_code !~ '^[A-HJ-NP-Z2-9]{8}$' then
        raise exception 'Code candidat invalide ou non éligible' using errcode = '22023';
    end if;

    select code_row.candidate_id
    into candidate_id
    from public.doctrine_candidate_guide_codes code_row
    join auth.users candidate on candidate.id = code_row.candidate_id
    where code_row.code = candidate_code
      and candidate.email_confirmed_at is not null
      and coalesce(candidate.raw_app_meta_data ->> 'role', 'candidat')
            not in ('admin', 'guide', 'officier_guide')
      and not coalesce(
            lower(candidate.raw_app_meta_data ->> 'bm4_admin') in ('true', '1'),
            false
      );

    if candidate_id is null or candidate_id = auth.uid() then
        raise exception 'Code candidat invalide ou non éligible' using errcode = '22023';
    end if;

    perform public.assign_guide_candidate(candidate_id);
    return candidate_id;
end;
$$;

revoke all on function public.assign_guide_candidate_by_code(text) from public, anon;
grant execute on function public.assign_guide_candidate_by_code(text) to authenticated;

create or replace function public.get_guide_candidate_dashboard(p_candidate_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    candidates jsonb;
begin
    if auth.uid() is null or not (public.doctrine_is_admin() or public.doctrine_is_guide()) then
        raise exception 'Guide access required' using errcode = '42501';
    end if;
    if p_candidate_id is not null
       and not public.doctrine_can_access_candidate(p_candidate_id) then
        raise exception 'Candidat non rattaché à cet officier guide' using errcode = '42501';
    end if;

    select coalesce(jsonb_agg(candidate_payload.payload order by candidate_payload.candidate_name), '[]'::jsonb)
    into candidates
    from (
        select
            coalesce(
                nullif(to_jsonb(profile) ->> 'name', ''),
                nullif(user_account.raw_user_meta_data ->> 'name', ''),
                nullif(user_account.raw_user_meta_data ->> 'full_name', ''),
                user_account.email
            ) as candidate_name,
            jsonb_build_object(
                'candidate', jsonb_build_object(
                    'id', user_account.id,
                    'email', user_account.email,
                    'name', coalesce(
                        nullif(to_jsonb(profile) ->> 'name', ''),
                        nullif(user_account.raw_user_meta_data ->> 'name', ''),
                        nullif(user_account.raw_user_meta_data ->> 'full_name', ''),
                        user_account.email
                    ),
                    'grade', coalesce(to_jsonb(profile) ->> 'grade', to_jsonb(profile) ->> 'rank',
                                      user_account.raw_app_meta_data ->> 'grade',
                                      user_account.raw_app_meta_data ->> 'rank',
                                      user_account.raw_user_meta_data ->> 'grade',
                                      user_account.raw_user_meta_data ->> 'rank'),
                    'unit', coalesce(to_jsonb(profile) ->> 'unit', to_jsonb(profile) ->> 'unite',
                                     user_account.raw_app_meta_data ->> 'unit',
                                     user_account.raw_app_meta_data ->> 'unite',
                                     user_account.raw_user_meta_data ->> 'unit',
                                     user_account.raw_user_meta_data ->> 'unite'),
                    'specialty', coalesce(to_jsonb(profile) ->> 'specialty',
                                          to_jsonb(profile) ->> 'speciality',
                                          to_jsonb(profile) ->> 'specialite',
                                          user_account.raw_app_meta_data ->> 'specialty',
                                          user_account.raw_app_meta_data ->> 'speciality',
                                          user_account.raw_app_meta_data ->> 'specialite',
                                          user_account.raw_user_meta_data ->> 'specialty',
                                          user_account.raw_user_meta_data ->> 'speciality',
                                          user_account.raw_user_meta_data ->> 'specialite'),
                    'matricule', coalesce(to_jsonb(profile) ->> 'matricule',
                                          to_jsonb(profile) ->> 'service_number',
                                          user_account.raw_app_meta_data ->> 'matricule',
                                          user_account.raw_user_meta_data ->> 'matricule'),
                    'assigned_at', assignment.assigned_at
                ),
                'qcm', jsonb_build_object(
                    'progress', (
                        select to_jsonb(progress)
                        from public.user_progress progress
                        where progress.user_id = user_account.id
                    ),
                    'results', coalesce((
                        select jsonb_agg(
                            jsonb_build_object(
                                'id', result.data ->> 'id',
                                'score', case
                                    when coalesce(result.data ->> 'score', '') ~ '^-?[0-9]+([.][0-9]+)?$'
                                    then (result.data ->> 'score')::numeric
                                    else null
                                end,
                                'theme', coalesce(result.data ->> 'theme',
                                                  result.data ->> 'theme_name',
                                                  result.data ->> 'category'),
                                'total', case
                                    when coalesce(result.data ->> 'total', '') ~ '^[0-9]+$'
                                    then (result.data ->> 'total')::integer else null
                                end,
                                'correct', case
                                    when coalesce(result.data ->> 'correct', '') ~ '^[0-9]+$'
                                    then (result.data ->> 'correct')::integer else null
                                end,
                                'created_at', result.data ->> 'created_at'
                            )
                            order by result.data ->> 'created_at' desc nulls last
                        )
                        from (
                            select to_jsonb(quiz_result) as data
                            from public.quiz_results quiz_result
                            where coalesce(to_jsonb(quiz_result) ->> 'user_id',
                                           to_jsonb(quiz_result) ->> 'candidate_id')
                                  = user_account.id::text
                            order by to_jsonb(quiz_result) ->> 'created_at' desc nulls last
                            limit 1000
                        ) result
                    ), '[]'::jsonb)
                ),
                'doctrine', jsonb_build_object(
                    'progress_events', coalesce((
                        select jsonb_agg(jsonb_build_object(
                            'event_type', event.event_type,
                            'module_id', event.module_id,
                            'dossier', event.dossier,
                            'created_at', event.created_at
                        ) order by event.created_at desc)
                        from public.doctrine_progress_events event
                        where event.user_id = user_account.id
                          and event.module_id in ('1', '2', '3', '4')
                    ), '[]'::jsonb),
                    'documents', coalesce((
                        select jsonb_agg(jsonb_build_object(
                            'document_title', document_view.document_title,
                            'opened_at', document_view.opened_at
                        ) order by document_view.opened_at desc)
                        from public.doctrine_document_views document_view
                        where document_view.user_id = user_account.id
                          and document_view.module_id = '2'
                    ), '[]'::jsonb),
                    'submissions', coalesce((
                        select jsonb_agg(jsonb_build_object(
                            'id', submission.id,
                            'dossier', submission.dossier,
                            'submission_type', submission.submission_type,
                            'created_at', submission.created_at,
                            'storage_path', submission.storage_path,
                            'reviews', coalesce((
                                select jsonb_agg(jsonb_build_object(
                                    'guide_id', review.guide_id,
                                    'grade', review.grade,
                                    'form_grade', review.form_grade,
                                    'content_grade', review.content_grade,
                                    'rubric_scores', review.rubric_scores,\n                                    'rubric_observations', review.rubric_observations,\n                                    'rubric_evidence', review.rubric_evidence,\n                                    'rubric_observations', review.rubric_observations,\n                                    'rubric_evidence', review.rubric_evidence,
                                    'jury_checklist', review.jury_checklist,
                                    'status', review.status,
                                    'comment', review.comment,
                                    'reviewed_at', review.reviewed_at
                                ) order by review.reviewed_at desc)
                                from public.fiche_reviews review
                                where review.submission_id = submission.id
                                  and (public.doctrine_is_admin() or review.guide_id = auth.uid())
                            ), '[]'::jsonb)
                        ) order by submission.created_at desc)
                        from public.doctrine_fiche_submissions submission
                        where submission.user_id = user_account.id
                    ), '[]'::jsonb),
                    'last_activity', greatest(
                        (select max(activity.last_seen_at)
                         from public.qcm_candidate_activity activity
                         where activity.user_id = user_account.id),
                        (select max(event.created_at)
                         from public.doctrine_progress_events event
                         where event.user_id = user_account.id),
                        (select max(document_view.opened_at)
                         from public.doctrine_document_views document_view
                         where document_view.user_id = user_account.id),
                        (select max(submission.created_at)
                         from public.doctrine_fiche_submissions submission
                         where submission.user_id = user_account.id)
                    )
                ),
                'admission', (
                    select to_jsonb(admission)
                    from public.candidate_admission_tracking admission
                    where admission.candidate_id = user_account.id
                )
            ) as payload
        from auth.users user_account
        left join lateral (
            select candidate_assignment.assigned_at
            from public.guide_candidates candidate_assignment
            where candidate_assignment.candidate_id = user_account.id
              and (public.doctrine_is_admin() or candidate_assignment.guide_id = auth.uid())
            order by candidate_assignment.assigned_at desc
            limit 1
        ) assignment on true
        left join public.profiles profile on profile.id = user_account.id
        where (public.doctrine_is_admin() or assignment.assigned_at is not null)
              and user_account.email_confirmed_at is not null
          and coalesce(user_account.raw_app_meta_data ->> 'role', 'candidat')
                not in ('admin', 'guide', 'officier_guide')
          and not coalesce(
                lower(user_account.raw_app_meta_data ->> 'bm4_admin') in ('true', '1'),
                false
          )
          and (p_candidate_id is null or user_account.id = p_candidate_id)
    ) candidate_payload;

    return jsonb_build_object(
        'candidates', candidates,
        'guide', (
            select jsonb_build_object(
                'id', current_account.id,
                'name', coalesce(
                    nullif(to_jsonb(profile) ->> 'name', ''),
                    nullif(current_account.raw_user_meta_data ->> 'name', ''),
                    nullif(current_account.raw_user_meta_data ->> 'full_name', ''),
                    current_account.email
                ),
                'grade', coalesce(to_jsonb(profile) ->> 'grade', to_jsonb(profile) ->> 'rank',
                                  current_account.raw_app_meta_data ->> 'grade',
                                  current_account.raw_app_meta_data ->> 'rank',
                                  current_account.raw_user_meta_data ->> 'grade',
                                  current_account.raw_user_meta_data ->> 'rank')
            )
            from auth.users current_account
            left join public.profiles profile on profile.id = current_account.id
            where current_account.id = auth.uid()
        )
    );
end;
$$;

revoke all on function public.get_guide_candidate_dashboard(uuid) from public, anon;
grant execute on function public.get_guide_candidate_dashboard(uuid) to authenticated;

-- Bucket privé. L'Edge Function utilise service_role; ces règles permettent
-- également l'upload candidat et les URL signées des guides rattachés.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidate-fiches', 'candidate-fiches', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

grant select, insert on storage.objects to authenticated;
drop policy if exists candidate_fiches_upload_own_folder on storage.objects;
create policy candidate_fiches_upload_own_folder
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'candidate-fiches'
        and split_part(name, '/', 1) = auth.uid()::text
        and array_length(string_to_array(name, '/'), 1) = 2
        and right(lower(name), 4) = '.pdf'
    );

drop policy if exists candidate_fiches_read_owner_or_assigned_guide on storage.objects;
create policy candidate_fiches_read_owner_or_assigned_guide
    on storage.objects for select to authenticated
    using (
        bucket_id = 'candidate-fiches'
        and (
            split_part(name, '/', 1) = auth.uid()::text
            or public.doctrine_can_access_candidate_path(name)
        )
    );

notify pgrst, 'reload schema';
commit;


-- Catalogue de cours de l’Officier Guide — Module 8.
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

create index if not exists guide_course_catalog_category_title_idx
    on public.guide_course_catalog (category, title);

alter table public.guide_course_catalog enable row level security;
revoke all on public.guide_course_catalog from public, anon;
grant select, insert, update, delete on public.guide_course_catalog to authenticated;

-- Catalogue commun : lecture Officier Guide, gestion réservée aux administrateurs.
alter table public.guide_course_catalog
    alter column guide_id set default auth.uid();

drop policy if exists guide_course_catalog_select_own on public.guide_course_catalog;
drop policy if exists guide_course_catalog_insert_own on public.guide_course_catalog;
drop policy if exists guide_course_catalog_update_own on public.guide_course_catalog;
drop policy if exists guide_course_catalog_delete_own on public.guide_course_catalog;
drop policy if exists guide_course_catalog_read_guides on public.guide_course_catalog;
drop policy if exists guide_course_catalog_admin_insert on public.guide_course_catalog;
drop policy if exists guide_course_catalog_admin_update on public.guide_course_catalog;
drop policy if exists guide_course_catalog_admin_delete on public.guide_course_catalog;

create policy guide_course_catalog_read_guides
    on public.guide_course_catalog for select to authenticated
    using (public.doctrine_is_guide() or public.doctrine_is_admin());

create policy guide_course_catalog_admin_insert
    on public.guide_course_catalog for insert to authenticated
    with check (public.doctrine_is_admin());

create policy guide_course_catalog_admin_update
    on public.guide_course_catalog for update to authenticated
    using (public.doctrine_is_admin())
    with check (public.doctrine_is_admin());

create policy guide_course_catalog_admin_delete
    on public.guide_course_catalog for delete to authenticated
    using (public.doctrine_is_admin());

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

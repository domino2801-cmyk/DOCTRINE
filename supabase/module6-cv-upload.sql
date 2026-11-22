-- Module 6 — dépôt sécurisé du CV candidat.
-- Prérequis : supabase/progression-events.sql et supabase/guide_module8.sql.
-- Le bucket est privé ; seul le candidat, son Officier Guide rattaché et l'administration
-- peuvent accéder au PDF. Le dépôt déclenche la validation du module 6.

begin;

do $$
begin
    if to_regprocedure('public.doctrine_can_access_candidate(uuid)') is null
       or to_regprocedure('public.doctrine_can_access_candidate_path(text)') is null then
        raise exception 'Exécutez d’abord supabase/guide_module8.sql pour activer les droits Officier Guide.';
    end if;
    if to_regclass('public.doctrine_progress_events') is null then
        raise exception 'Exécutez d’abord supabase/progression-events.sql.';
    end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('doctrine-candidate-cv', 'doctrine-candidate-cv', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf'];

create table if not exists public.doctrine_candidate_cvs (
    candidate_id uuid primary key references auth.users(id) on delete cascade,
    storage_path text not null unique,
    original_filename text not null check (char_length(original_filename) between 1 and 255),
    file_size bigint not null check (file_size between 1 and 10485760),
    mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
    uploaded_at timestamptz not null default now(),
    constraint doctrine_candidate_cvs_path_check
        check (storage_path = candidate_id::text || '/cv.pdf')
);

alter table public.doctrine_candidate_cvs enable row level security;
revoke all on public.doctrine_candidate_cvs from public, anon, authenticated;
grant select, insert, update on public.doctrine_candidate_cvs to authenticated;

drop policy if exists doctrine_candidate_cvs_candidate_read on public.doctrine_candidate_cvs;
create policy doctrine_candidate_cvs_candidate_read
    on public.doctrine_candidate_cvs for select to authenticated
    using (candidate_id = auth.uid());

drop policy if exists doctrine_candidate_cvs_guide_admin_read on public.doctrine_candidate_cvs;
create policy doctrine_candidate_cvs_guide_admin_read
    on public.doctrine_candidate_cvs for select to authenticated
    using (public.doctrine_can_access_candidate(candidate_id));

drop policy if exists doctrine_candidate_cvs_candidate_insert on public.doctrine_candidate_cvs;
create policy doctrine_candidate_cvs_candidate_insert
    on public.doctrine_candidate_cvs for insert to authenticated
    with check (candidate_id = auth.uid());

drop policy if exists doctrine_candidate_cvs_candidate_update on public.doctrine_candidate_cvs;
create policy doctrine_candidate_cvs_candidate_update
    on public.doctrine_candidate_cvs for update to authenticated
    using (candidate_id = auth.uid())
    with check (candidate_id = auth.uid());

create or replace function public.doctrine_candidate_cv_set_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Une session candidat est requise.' using errcode = '42501';
    end if;
    new.candidate_id := auth.uid();
    new.uploaded_at := now();
    if new.storage_path <> auth.uid()::text || '/cv.pdf' then
        raise exception 'Chemin de stockage CV invalide.' using errcode = '42501';
    end if;
    if not exists (
        select 1 from storage.objects object
        where object.bucket_id = 'doctrine-candidate-cv'
          and object.name = new.storage_path
          and object.owner_id = auth.uid()::text
    ) then
        raise exception 'Le fichier CV doit être téléversé dans votre espace privé avant son enregistrement.'
            using errcode = '22023';
    end if;
    return new;
end;
$$;

drop trigger if exists doctrine_candidate_cv_set_identity on public.doctrine_candidate_cvs;
create trigger doctrine_candidate_cv_set_identity
    before insert or update on public.doctrine_candidate_cvs
    for each row execute function public.doctrine_candidate_cv_set_identity();

create or replace function public.doctrine_candidate_cv_complete_module6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not exists (
        select 1 from public.doctrine_progress_events event
        where event.user_id = new.candidate_id
          and event.event_type = 'module_completed'
          and event.module_id = '6'
    ) then
        insert into public.doctrine_progress_events (user_id, event_type, module_id)
        values (new.candidate_id, 'module_completed', '6');
    end if;
    return new;
end;
$$;

drop trigger if exists doctrine_candidate_cv_complete_module6 on public.doctrine_candidate_cvs;
create trigger doctrine_candidate_cv_complete_module6
    after insert or update of storage_path on public.doctrine_candidate_cvs
    for each row execute function public.doctrine_candidate_cv_complete_module6();

drop policy if exists doctrine_candidate_cv_storage_insert on storage.objects;
create policy doctrine_candidate_cv_storage_insert
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'doctrine-candidate-cv'
        and name = auth.uid()::text || '/cv.pdf'
    );

drop policy if exists doctrine_candidate_cv_storage_update on storage.objects;
create policy doctrine_candidate_cv_storage_update
    on storage.objects for update to authenticated
    using (
        bucket_id = 'doctrine-candidate-cv'
        and name = auth.uid()::text || '/cv.pdf'
    )
    with check (
        bucket_id = 'doctrine-candidate-cv'
        and name = auth.uid()::text || '/cv.pdf'
    );

drop policy if exists doctrine_candidate_cv_storage_read on storage.objects;
create policy doctrine_candidate_cv_storage_read
    on storage.objects for select to authenticated
    using (
        bucket_id = 'doctrine-candidate-cv'
        and (
            name = auth.uid()::text || '/cv.pdf'
            or public.doctrine_can_access_candidate_path(name)
        )
    );

notify pgrst, 'reload schema';
commit;


-- Synchronisation sécurisée du suivi Officier Guide.
--
-- Prérequis :
--   progression-events.sql
--   guide_module8.sql
--   module6-cv-upload.sql
--   retex-signalements.sql
--   module4-two-dossiers-auto-validation.sql
--   module5-qcm-auto-validation.sql
--
-- Cette migration :
--   - conserve les règles de validation des modules ;
--   - synchronise les validations historiques des modules 3 à 7 ;
--   - autorise la lecture des événements et RETEX par le candidat,
--     son Officier Guide rattaché ou un administrateur ;
--   - ne supprime aucune politique RLS existante ;
--   - ne désactive jamais la RLS.

begin;

-- ============================================================
-- 1. Vérification préalable des tables, colonnes et protections
-- ============================================================

do $$
declare
    table_name text;
begin
    if to_regclass('public.doctrine_progress_events') is null
       or to_regclass('public.doctrine_retex') is null
       or to_regclass('public.doctrine_candidate_cvs') is null
       or to_regclass('public.doctrine_fiche_submissions') is null
       or to_regclass('public.quiz_results') is null then
        raise exception
            'Migration interrompue : une table source est absente.';
    end if;

    foreach table_name in array array[
        'doctrine_progress_events',
        'doctrine_retex',
        'doctrine_candidate_cvs',
        'doctrine_fiche_submissions',
        'quiz_results'
    ]
    loop
        if not exists (
            select 1
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n
              on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = table_name
              and c.relrowsecurity = true
        ) then
            raise exception
                'Migration interrompue : RLS absente sur public.%.',
                table_name;
        end if;
    end loop;

    if to_regprocedure(
        'public.doctrine_can_access_candidate(uuid)'
    ) is null then
        raise exception
            'Fonction doctrine_can_access_candidate(uuid) absente.';
    end if;

    if to_regprocedure(
        'public.doctrine_progress_events_set_identity()'
    ) is null then
        raise exception
            'Fonction doctrine_progress_events_set_identity() absente.';
    end if;

    -- Vérification du schéma réellement utilisé par DOCTRINE.
    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'quiz_results'
          and column_name = 'user_id'
          and data_type = 'uuid'
    ) then
        raise exception
            'Colonne quiz_results.user_id UUID absente ou incompatible.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'quiz_results'
          and column_name = 'score'
          and data_type = 'numeric'
    ) then
        raise exception
            'Colonne quiz_results.score NUMERIC absente ou incompatible.';
    end if;
end;
$$;


-- ============================================================
-- 2. Lecture sécurisée des événements de progression
-- ============================================================

grant select on public.doctrine_progress_events to authenticated;

do $$
declare
    existing_qual text;
    existing_roles name[];
    existing_cmd text;
    existing_permissive text;
    normalized_qual text;
begin
    select qual, roles, cmd, permissive
      into existing_qual, existing_roles, existing_cmd, existing_permissive
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'doctrine_progress_events'
      and policyname =
          'doctrine_progress_events_candidate_or_assigned_guide_read';

    if not found then
        execute $policy$
            create policy doctrine_progress_events_candidate_or_assigned_guide_read
            on public.doctrine_progress_events
            as permissive
            for select
            to authenticated
            using (
                user_id = auth.uid()
                or public.doctrine_can_access_candidate(user_id)
            )
        $policy$;
    else
        normalized_qual := lower(
            regexp_replace(
                coalesce(existing_qual, ''),
                '[[:space:]]',
                '',
                'g'
            )
        );

        if existing_cmd <> 'SELECT'
           or existing_permissive <> 'PERMISSIVE'
           or cardinality(existing_roles) <> 1
           or existing_roles[1] <> 'authenticated'
           or position(
                'user_id=auth.uid()'
                in normalized_qual
           ) = 0
           or position(
                'doctrine_can_access_candidate(user_id)'
                in normalized_qual
           ) = 0 then
            raise exception
                'Politique de lecture des événements existante avec un périmètre inattendu. Vérification manuelle requise.';
        end if;
    end if;
end;
$$;


-- ============================================================
-- 3. Sécurisation du trigger d'identité des événements
-- ============================================================

-- Session authentifiée :
--   l'identité est toujours imposée par auth.uid().
--
-- Session SQL privilégiée sans auth.uid() :
--   l'identifiant candidat explicitement fourni est conservé.
--
-- Cela permet le rattrapage historique sans permettre à un
-- candidat connecté de choisir l'identité d'un événement.

create or replace function public.doctrine_progress_events_set_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if auth.uid() is not null then
        new.user_id := auth.uid();
        new.created_at := now();
    elsif new.user_id is null then
        raise exception
            'Identifiant candidat requis pour une insertion administrative.';
    end if;

    return new;
end;
$$;


-- ============================================================
-- 4. Lecture sécurisée des fiches RETEX par l'Officier Guide
-- ============================================================

grant select on public.doctrine_retex to authenticated;

do $$
declare
    existing_qual text;
    existing_roles name[];
    existing_cmd text;
    existing_permissive text;
    normalized_qual text;
begin
    select qual, roles, cmd, permissive
      into existing_qual, existing_roles, existing_cmd, existing_permissive
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'doctrine_retex'
      and policyname = 'doctrine_retex_assigned_guide_read';

    if not found then
        execute $policy$
            create policy doctrine_retex_assigned_guide_read
            on public.doctrine_retex
            as permissive
            for select
            to authenticated
            using (
                user_id = auth.uid()
                or public.doctrine_can_access_candidate(user_id)
            )
        $policy$;
    else
        normalized_qual := lower(
            regexp_replace(
                coalesce(existing_qual, ''),
                '[[:space:]]',
                '',
                'g'
            )
        );

        if existing_cmd <> 'SELECT'
           or existing_permissive <> 'PERMISSIVE'
           or cardinality(existing_roles) <> 1
           or existing_roles[1] <> 'authenticated'
           or position(
                'user_id=auth.uid()'
                in normalized_qual
           ) = 0
           or position(
                'doctrine_can_access_candidate(user_id)'
                in normalized_qual
           ) = 0 then
            raise exception
                'Politique RETEX existante avec un périmètre inattendu. Vérification manuelle requise.';
        end if;
    end if;
end;
$$;


-- ============================================================
-- 5. Module 3 : première ouverture = module terminé
-- ============================================================

insert into public.doctrine_progress_events (
    user_id,
    event_type,
    module_id
)
select distinct
    started.user_id,
    'module_completed',
    '3'
from public.doctrine_progress_events started
where started.module_id = '3'
  and started.event_type = 'module_started'
  and not exists (
      select 1
      from public.doctrine_progress_events completed
      where completed.user_id = started.user_id
        and completed.module_id = '3'
        and completed.event_type = 'module_completed'
  );


-- ============================================================
-- 6. Module 4 : deux dossiers distincts transmis
-- ============================================================

-- Même règle que verify_doctrine_module4_completion() :
-- au moins deux valeurs dossier distinctes.

insert into public.doctrine_progress_events (
    user_id,
    event_type,
    module_id
)
select
    submission.user_id,
    'module_completed',
    '4'
from public.doctrine_fiche_submissions submission
group by submission.user_id
having count(distinct submission.dossier) >= 2
   and not exists (
       select 1
       from public.doctrine_progress_events event
       where event.user_id = submission.user_id
         and event.module_id = '4'
         and event.event_type = 'module_completed'
   );


-- ============================================================
-- 7. Module 5 : moyenne générale QCM >= 13/20
-- ============================================================

-- Schéma confirmé :
-- quiz_results.user_id UUID
-- quiz_results.score NUMERIC
--
-- Le calcul utilise les mêmes résultats et le même seuil
-- que verify_qcm_module5_completion().

insert into public.doctrine_progress_events (
    user_id,
    event_type,
    module_id
)
select
    result.user_id,
    'module_completed',
    '5'
from public.quiz_results result
where result.user_id is not null
group by result.user_id
having avg(result.score) >= 13
   and not exists (
       select 1
       from public.doctrine_progress_events event
       where event.user_id = result.user_id
         and event.module_id = '5'
         and event.event_type = 'module_completed'
   );


-- ============================================================
-- 8. Module 6 : CV effectivement déposé
-- ============================================================

-- Le dépôt du CV dans doctrine_candidate_cvs constitue
-- la preuve de validation du module 6.

insert into public.doctrine_progress_events (
    user_id,
    event_type,
    module_id
)
select
    cv.candidate_id,
    'module_completed',
    '6'
from public.doctrine_candidate_cvs cv
where not exists (
    select 1
    from public.doctrine_progress_events event
    where event.user_id = cv.candidate_id
      and event.module_id = '6'
      and event.event_type = 'module_completed'
);


-- ============================================================
-- 9. Module 7 : RETEX effectivement transmis
-- ============================================================

-- Un signalement ne valide jamais le module 7.
-- Seule une fiche présente dans doctrine_retex est prise en compte.

insert into public.doctrine_progress_events (
    user_id,
    event_type,
    module_id
)
select
    retex.user_id,
    'module_completed',
    '7'
from public.doctrine_retex retex
where not exists (
    select 1
    from public.doctrine_progress_events event
    where event.user_id = retex.user_id
      and event.module_id = '7'
      and event.event_type = 'module_completed'
);


-- ============================================================
-- 10. Actualisation du schéma Supabase et validation
-- ============================================================

notify pgrst, 'reload schema';

commit;

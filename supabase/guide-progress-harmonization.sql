-- Synchronisation sécurisée du suivi Officier Guide.
-- Prérequis : progression-events.sql, guide_module8.sql, module6-cv-upload.sql,
-- retex-signalements.sql, module4-two-dossiers-auto-validation.sql et
-- module5-qcm-auto-validation.sql déjà appliqués.
-- Cette migration ne crée ni ne supprime de table et ne désactive jamais la RLS.

begin;

-- Arrêt immédiat si les protections ou objets attendus ne sont pas en place.
do $$
begin
    if to_regclass('public.doctrine_progress_events') is null
       or to_regclass('public.doctrine_retex') is null
       or to_regclass('public.doctrine_candidate_cvs') is null
       or to_regclass('public.doctrine_fiche_submissions') is null
       or to_regclass('public.quiz_results') is null then
        raise exception 'Migration interrompue : une table source manque. Vérifiez les migrations prérequises.';
    end if;

    if not coalesce((
        select relrowsecurity
        from pg_catalog.pg_class
        where oid = 'public.doctrine_progress_events'::regclass
    ), false) then
        raise exception 'Migration interrompue : RLS doit être activée sur doctrine_progress_events.';
    end if;

    if not coalesce((
        select relrowsecurity
        from pg_catalog.pg_class
        where oid = 'public.doctrine_retex'::regclass
    ), false) then
        raise exception 'Migration interrompue : RLS doit être activée sur doctrine_retex.';
    end if;

    if to_regprocedure('public.doctrine_can_access_candidate(uuid)') is null
       or to_regprocedure('public.doctrine_progress_events_set_identity()') is null then
        raise exception 'Migration interrompue : fonctions de sécurité manquantes. Exécutez les migrations prérequises.';
    end if;

    if not exists (
        select 1 from pg_catalog.pg_policies
        where schemaname = 'public'
          and tablename = 'doctrine_progress_events'
          and policyname = 'doctrine_guides_read_assigned_progress_events'
          and cmd = 'SELECT'
    ) then
        raise exception 'Migration interrompue : politique de lecture des événements pour les guides absente.';
    end if;
end;
$$;

-- Autoriser la lecture des événements uniquement au candidat concerné,
-- à son Officier Guide rattaché ou à un administrateur.
-- Ne supprimer aucune politique existante : si une politique de même nom existe,
-- le contrôle ci-dessous impose une vérification manuelle en cas de périmètre différent.
grant select on public.doctrine_progress_events to authenticated;
do $policy_check$
declare
    existing_qual text;
begin
    select qual into existing_qual
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'doctrine_progress_events'
      and policyname = 'doctrine_progress_events_candidate_or_assigned_guide_read'
      and cmd = 'SELECT';

    if existing_qual is null then
        if exists (
            select 1 from pg_catalog.pg_policies
            where schemaname = 'public'
              and tablename = 'doctrine_progress_events'
              and policyname = 'doctrine_progress_events_candidate_or_assigned_guide_read'
        ) then
            raise exception 'Politique de lecture des événements existante avec une commande inattendue ; vérification manuelle requise.';
        end if;
        execute $create_policy$
            create policy doctrine_progress_events_candidate_or_assigned_guide_read
            on public.doctrine_progress_events
            for select to authenticated
            using (
                user_id = auth.uid()
                or public.doctrine_can_access_candidate(user_id)
            )
        $create_policy$;
    elsif replace(replace(existing_qual, ' ', ''), E'\\n', '') not ilike
          '%user_id=auth.uid()%public.doctrine_can_access_candidate(user_id)%' then
        raise exception 'La politique de lecture des événements existe avec une règle différente ; aucune modification automatique effectuée.';
    end if;
end;
$policy_check$;

-- Préserver le trigger d'identité : un utilisateur connecté ne peut jamais
-- choisir l'identité d'un événement. Depuis une migration SQL privilégiée,
-- auth.uid() est NULL ; l'identité explicite du candidat est alors conservée.
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
        raise exception 'Identifiant candidat requis pour une insertion administrative.';
    end if;
    return new;
end;
$$;

-- Ajouter la politique de lecture RETEX uniquement si son nom est libre.
-- Si elle existe déjà, vérifier qu'elle a exactement le périmètre attendu ;
-- ne jamais la supprimer/remplacer silencieusement.
do $
declare
    existing_qual text;
begin
    select qual into existing_qual
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'doctrine_retex'
      and policyname = 'doctrine_retex_assigned_guide_read'
      and cmd = 'SELECT';

    if existing_qual is null then
        if exists (
            select 1 from pg_catalog.pg_policies
            where schemaname = 'public'
              and tablename = 'doctrine_retex'
              and policyname = 'doctrine_retex_assigned_guide_read'
        ) then
            raise exception 'Politique doctrine_retex_assigned_guide_read existante avec une commande inattendue ; vérification manuelle requise.';
        end if;

        execute $policy$
            create policy doctrine_retex_assigned_guide_read
            on public.doctrine_retex
            for select to authenticated
            using (
                user_id = auth.uid()
                or public.doctrine_can_access_candidate(user_id)
            )
        $policy$;
    elsif replace(replace(existing_qual, ' ', ''), E'\\n', '') not ilike
          '%user_id=auth.uid()%public.doctrine_can_access_candidate(user_id)%' then
        raise exception 'La politique doctrine_retex_assigned_guide_read existe avec une règle différente ; aucune modification automatique effectuée.';
    end if;
end;
$;

-- Module 3 : l'événement module_started constitue la preuve de première ouverture.
insert into public.doctrine_progress_events (user_id, event_type, module_id)
select distinct started.user_id, 'module_completed', '3'
from public.doctrine_progress_events started
where started.module_id = '3'
  and started.event_type = 'module_started'
  and not exists (
      select 1 from public.doctrine_progress_events completed
      where completed.user_id = started.user_id
        and completed.module_id = '3'
        and completed.event_type = 'module_completed'
  );

-- Module 4 : même seuil que verify_doctrine_module4_completion().
insert into public.doctrine_progress_events (user_id, event_type, module_id)
select submission.user_id, 'module_completed', '4'
from public.doctrine_fiche_submissions submission
group by submission.user_id
having count(distinct submission.dossier) >= 2
   and not exists (
       select 1 from public.doctrine_progress_events event
       where event.user_id = submission.user_id
         and event.module_id = '4'
         and event.event_type = 'module_completed'
   );

-- Module 5 : même moyenne et même seuil que verify_qcm_module5_completion().
with candidate_averages as (
    select
        coalesce(data ->> 'user_id', data ->> 'candidate_id') as candidate_id,
        avg((data ->> 'score')::numeric) as average_score
    from (
        select pg_catalog.to_jsonb(result) as data
        from public.quiz_results result
    ) results
    where (
        coalesce(data ->> 'user_id', data ->> 'candidate_id')
        ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    )
      and coalesce(data ->> 'score', '') ~ '^-?[0-9]+([.][0-9]+)?$'
    group by coalesce(data ->> 'user_id', data ->> 'candidate_id')
)
insert into public.doctrine_progress_events (user_id, event_type, module_id)
select average.candidate_id::uuid, 'module_completed', '5'
from candidate_averages average
where average.average_score >= 13
  and not exists (
      select 1 from public.doctrine_progress_events event
      where event.user_id = average.candidate_id::uuid
        and event.module_id = '5'
        and event.event_type = 'module_completed'
  );

-- Module 6 : uniquement les CV présents dans la table de dépôt sécurisé.
insert into public.doctrine_progress_events (user_id, event_type, module_id)
select cv.candidate_id, 'module_completed', '6'
from public.doctrine_candidate_cvs cv
where not exists (
    select 1 from public.doctrine_progress_events event
    where event.user_id = cv.candidate_id
      and event.module_id = '6'
      and event.event_type = 'module_completed'
);

-- Module 7 : RETEX effectivement transmis ; aucun signalement ne valide le module.
insert into public.doctrine_progress_events (user_id, event_type, module_id)
select retex.user_id, 'module_completed', '7'
from public.doctrine_retex retex
where not exists (
    select 1 from public.doctrine_progress_events event
    where event.user_id = retex.user_id
      and event.module_id = '7'
      and event.event_type = 'module_completed'
);

notify pgrst, 'reload schema';
commit;

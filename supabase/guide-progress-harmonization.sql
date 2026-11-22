-- Harmonisation du suivi Officier Guide et rattrapage des validations déjà acquises.
-- À exécuter une fois dans Supabase SQL Editor après les migrations DOCTRINE
-- progression-events.sql, guide_module8.sql, module6-cv-upload.sql et
-- retex-signalements.sql. Cette migration ne modifie aucune règle de validation.

begin;

-- Les Officiers Guides rattachés peuvent lire le RETEX du candidat qu'ils suivent.
grant select on public.doctrine_retex to authenticated;
drop policy if exists doctrine_retex_assigned_guide_read on public.doctrine_retex;
create policy doctrine_retex_assigned_guide_read
    on public.doctrine_retex
    for select to authenticated
    using (public.doctrine_can_access_candidate(user_id));

-- Rattrapage idempotent du Module 3 : son ouverture initiale est déjà journalisée
-- par module_started et constitue sa règle de validation existante.
insert into public.doctrine_progress_events (user_id, event_type, module_id)
select distinct event.user_id, 'module_completed', '3'
from public.doctrine_progress_events event
where event.module_id = '3'
  and event.event_type = 'module_started'
  and not exists (
      select 1 from public.doctrine_progress_events completed
      where completed.user_id = event.user_id
        and completed.module_id = '3'
        and completed.event_type = 'module_completed'
  );

-- Module 4 : deux dossiers distincts comportant au moins une fiche transmise.
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

-- Module 5 : moyenne des résultats QCM-MAJOR >= 13/20, même règle que la fonction existante.
with candidate_averages as (
    select
        coalesce(data ->> 'user_id', data ->> 'candidate_id') as candidate_id,
        avg((data ->> 'score')::numeric) as average_score
    from (
        select pg_catalog.to_jsonb(result) as data
        from public.quiz_results result
    ) results
    where coalesce(data ->> 'user_id', data ->> 'candidate_id') ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
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

-- Module 6 : CV déjà enregistré dans le dépôt sécurisé.
insert into public.doctrine_progress_events (user_id, event_type, module_id)
select cv.candidate_id, 'module_completed', '6'
from public.doctrine_candidate_cvs cv
where not exists (
    select 1 from public.doctrine_progress_events event
    where event.user_id = cv.candidate_id
      and event.module_id = '6'
      and event.event_type = 'module_completed'
);

-- Module 7 : RETEX déjà transmis. Un signalement seul ne valide jamais le module.
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

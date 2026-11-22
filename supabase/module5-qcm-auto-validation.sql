-- Validation automatique du module 5 à partir du classement QCM-MAJOR.
-- À exécuter dans le SQL Editor du projet Supabase partagé par DOCTRINE et QCM-MAJOR.
-- Le statut « Prêt » correspond à une moyenne générale >= 13/20.

create or replace function public.verify_qcm_module5_completion()
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    average_score numeric;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':doctrine-module5', 0));

    select avg((data ->> 'score')::numeric)
      into average_score
      from (select to_jsonb(result) as data from public.quiz_results result) candidate_results
     where (
         data ->> 'user_id' = auth.uid()::text
         or data ->> 'candidate_id' = auth.uid()::text
     )
       and coalesce(data ->> 'score', '') ~ '^-?[0-9]+([.][0-9]+)?$';

    if coalesce(average_score, 0) < 13 then
        return false;
    end if;

    if not exists (
        select 1 from public.doctrine_progress_events
         where user_id = auth.uid()
           and event_type = 'module_completed'
           and module_id = '5'
    ) then
        insert into public.doctrine_progress_events (event_type, module_id)
        values ('module_completed', '5');
    end if;

    return true;
end;
$$;

revoke all on function public.verify_qcm_module5_completion() from public, anon;
grant execute on function public.verify_qcm_module5_completion() to authenticated;

notify pgrst, 'reload schema';

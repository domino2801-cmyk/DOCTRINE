-- Validation automatique du module 4 après des transmissions sur deux dossiers distincts.
-- À exécuter dans Supabase SQL Editor après fiche-submissions.sql et progression-events.sql.

create or replace function public.verify_doctrine_module4_completion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    submission_count integer;
    is_completed boolean;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(auth.uid()::text || ':doctrine-module4', 0)
    );

    select count(distinct dossier)::integer
      into submission_count
      from public.doctrine_fiche_submissions
     where user_id = auth.uid();

    is_completed := coalesce(submission_count, 0) >= 2;

    if is_completed and not exists (
        select 1
          from public.doctrine_progress_events
         where user_id = auth.uid()
           and event_type = 'module_completed'
           and module_id = '4'
    ) then
        insert into public.doctrine_progress_events (event_type, module_id)
        values ('module_completed', '4');
    end if;

    return jsonb_build_object(
        'completed', is_completed,
        'submission_count', coalesce(submission_count, 0)
    );
end;
$$;

revoke all on function public.verify_doctrine_module4_completion() from public, anon;
grant execute on function public.verify_doctrine_module4_completion() to authenticated;

notify pgrst, 'reload schema';

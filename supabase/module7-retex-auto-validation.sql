-- Validation automatique du module 7 dès l'enregistrement d'un RETEX.
-- À exécuter après supabase/retex-signalements.sql et supabase/progression-events.sql.
-- Le déclencheur garantit que le RETEX et l'événement de validation sont atomiques.

create or replace function public.doctrine_retex_complete_module7()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.user_id is not null and not exists (
        select 1
          from public.doctrine_progress_events
         where user_id = new.user_id
           and event_type = 'module_completed'
           and module_id = '7'
    ) then
        insert into public.doctrine_progress_events (user_id, event_type, module_id)
        values (new.user_id, 'module_completed', '7');
    end if;
    return new;
end;
$$;

drop trigger if exists doctrine_retex_complete_module7
    on public.doctrine_retex;
create trigger doctrine_retex_complete_module7
    after insert on public.doctrine_retex
    for each row execute function public.doctrine_retex_complete_module7();

-- Rattrapage des candidats ayant transmis leur RETEX avant l'installation.
insert into public.doctrine_progress_events (user_id, event_type, module_id)
select r.user_id, 'module_completed', '7'
  from public.doctrine_retex r
 where r.user_id is not null
   and not exists (
       select 1
         from public.doctrine_progress_events e
        where e.user_id = r.user_id
          and e.event_type = 'module_completed'
          and e.module_id = '7'
   );

notify pgrst, 'reload schema';

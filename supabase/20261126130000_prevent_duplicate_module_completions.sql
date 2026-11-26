-- Empêche l'enregistrement répété d'une validation de module pour un même candidat.
-- Les événements historiques ne sont ni supprimés ni modifiés.
-- À exécuter dans Supabase SQL Editor après progression-events.sql.

create or replace function public.doctrine_progress_events_set_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.user_id := auth.uid();
    new.created_at := now();

    if new.event_type = 'module_completed' then
        perform pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(
                new.user_id::text || ':doctrine-module:' || new.module_id,
                0
            )
        );

        if exists (
            select 1
              from public.doctrine_progress_events as existing
             where existing.user_id = new.user_id
               and existing.event_type = 'module_completed'
               and existing.module_id = new.module_id
        ) then
            return null;
        end if;
    end if;

    return new;
end;
$$;

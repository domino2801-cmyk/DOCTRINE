-- Autorise les comptes dont la spécialité sécurisée est OG au Module 8.
-- À exécuter dans le SQL Editor après le déploiement initial de guide_module8.sql.
begin;

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

commit;

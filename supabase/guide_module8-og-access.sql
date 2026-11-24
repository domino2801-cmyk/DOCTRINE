-- Autorise les comptes dont la spécialité sécurisée est OG au Module 8.
-- À exécuter dans le SQL Editor après le déploiement initial de guide_module8.sql.
begin;

create or replace function public.doctrine_is_guide()
returns boolean
language sql
stable
security definer
set search_path = ''
as $
    select coalesce(
        (auth.jwt() -> 'app_metadata' ->> 'role') in ('guide', 'officier_guide')
        and exists (
            select 1
            from public.profiles profile
            where profile.id = auth.uid()
              and upper(trim(coalesce(to_jsonb(profile) ->> 'speciality', ''))) = 'OG'
        ),
        false
    );
$;

revoke all on function public.doctrine_is_guide() from public, anon;
grant execute on function public.doctrine_is_guide() to authenticated;
commit;

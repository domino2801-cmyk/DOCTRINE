-- Harmonisation sécurisée de l'accès Officier Guide.
-- La règle est identique à celle de l'interface :
--   1) rôle sécurisé app_metadata.role = guide/officier_guide ;
--   2) profil public correspondant à auth.uid() avec speciality = OG.
-- Le contrôle du profil est encapsulé dans une fonction SECURITY DEFINER
-- strictement limitée à la ligne du compte connecté.

begin;

create or replace function public.doctrine_is_guide()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.doctrine_is_guide() from public, anon;
grant execute on function public.doctrine_is_guide() to authenticated;

-- Contrôle préalable : les deux fonctions doivent être présentes avant
-- d'installer les politiques des fiches autonomes RETEX / signalements.
do $$
begin
    if to_regprocedure('public.doctrine_is_admin()') is null then
        raise exception 'Fonction doctrine_is_admin() absente : exécuter guide_module8.sql avant cette migration.';
    end if;
    if to_regclass('public.profiles') is null then
        raise exception 'Table public.profiles absente : migration interrompue.';
    end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Compatibilité du rôle administrateur QCM-MAJOR / DOCTRINE.
-- À exécuter une seule fois dans Supabase SQL Editor du projet beodiemzrunqjkvylffn.
create or replace function public.doctrine_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce(
        (auth.jwt() ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1'),
        false
    );
$$;

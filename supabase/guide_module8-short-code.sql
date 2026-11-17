-- Active les codes courts de rattachement pour un module 8 déjà installé.
-- À exécuter dans le SQL Editor après guide_module8.sql.

begin;

create table if not exists public.doctrine_candidate_guide_codes (
    candidate_id uuid primary key references auth.users (id) on delete cascade,
    code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
    created_at timestamptz not null default now()
);

alter table public.doctrine_candidate_guide_codes enable row level security;
revoke all on public.doctrine_candidate_guide_codes from public, anon, authenticated;

create or replace function public.get_doctrine_candidate_guide_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    candidate_code text;
    generated_code text;
    random_value bytea;
    attempt integer;
    character_index integer;
    bit_index integer;
    symbol_index integer;
begin
    if auth.uid() is null or not exists (
        select 1
        from auth.users candidate
        where candidate.id = auth.uid()
          and candidate.email_confirmed_at is not null
          and coalesce(candidate.raw_app_meta_data ->> 'role', 'candidat')
                not in ('admin', 'guide', 'officier_guide')
          and not coalesce(
                lower(candidate.raw_app_meta_data ->> 'bm4_admin') in ('true', '1'),
                false
          )
    ) then
        raise exception 'Compte candidat confirmé requis' using errcode = '42501';
    end if;

    select candidate_code_row.code
    into candidate_code
    from public.doctrine_candidate_guide_codes candidate_code_row
    where candidate_code_row.candidate_id = auth.uid();
    if found then
        return candidate_code;
    end if;

    for attempt in 1..8 loop
        random_value := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
        generated_code := '';
        for character_index in 0..7 loop
            symbol_index := 0;
            for bit_index in 0..4 loop
                symbol_index := symbol_index * 2
                    + pg_catalog.get_bit(random_value, character_index * 5 + bit_index);
            end loop;
            generated_code := generated_code
                || pg_catalog.substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', symbol_index + 1, 1);
        end loop;

        insert into public.doctrine_candidate_guide_codes (candidate_id, code)
        values (auth.uid(), generated_code)
        on conflict do nothing;

        select candidate_code_row.code
        into candidate_code
        from public.doctrine_candidate_guide_codes candidate_code_row
        where candidate_code_row.candidate_id = auth.uid();
        if found then
            return candidate_code;
        end if;
    end loop;

    raise exception 'Génération du code candidat impossible' using errcode = '40001';
end;
$$;

revoke all on function public.get_doctrine_candidate_guide_code() from public, anon;
grant execute on function public.get_doctrine_candidate_guide_code() to authenticated;

create or replace function public.assign_guide_candidate_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    candidate_code text;
    candidate_id uuid;
begin
    if auth.uid() is null or not (public.doctrine_is_admin() or public.doctrine_is_guide()) then
        raise exception 'Guide access required' using errcode = '42501';
    end if;

    candidate_code := upper(trim(coalesce(p_code, '')));
    if candidate_code !~ '^[A-HJ-NP-Z2-9]{8}$' then
        raise exception 'Code candidat invalide ou non éligible' using errcode = '22023';
    end if;

    select code_row.candidate_id
    into candidate_id
    from public.doctrine_candidate_guide_codes code_row
    join auth.users candidate on candidate.id = code_row.candidate_id
    where code_row.code = candidate_code
      and candidate.email_confirmed_at is not null
      and coalesce(candidate.raw_app_meta_data ->> 'role', 'candidat')
            not in ('admin', 'guide', 'officier_guide')
      and not coalesce(
            lower(candidate.raw_app_meta_data ->> 'bm4_admin') in ('true', '1'),
            false
      );

    if candidate_id is null or candidate_id = auth.uid() then
        raise exception 'Code candidat invalide ou non éligible' using errcode = '22023';
    end if;

    perform public.assign_guide_candidate(candidate_id);
    return candidate_id;
end;
$$;

revoke all on function public.assign_guide_candidate_by_code(text) from public, anon;
grant execute on function public.assign_guide_candidate_by_code(text) to authenticated;

notify pgrst, 'reload schema';
commit;

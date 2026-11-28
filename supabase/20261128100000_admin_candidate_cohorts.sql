-- Suivi global administrateur : rattachement des candidats à leur Officier Guide.
-- Lecture strictement réservée aux administrateurs via doctrine_is_admin() et SECURITY DEFINER.
create or replace function public.get_admin_candidate_cohorts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    cohort_rows jsonb;
begin
    if auth.uid() is null or not public.doctrine_is_admin() then
        raise exception 'Administrator access required' using errcode = '42501';
    end if;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'candidate_id', assignment.candidate_id,
            'guide_id', assignment.guide_id,
            'assigned_at', assignment.assigned_at,
            'guide_pseudo', coalesce(
                nullif(to_jsonb(guide_profile) ->> 'pseudo', ''),
                nullif(to_jsonb(guide_profile) ->> 'name', ''),
                nullif(guide_account.raw_user_meta_data ->> 'pseudo', ''),
                nullif(guide_account.raw_user_meta_data ->> 'name', ''),
                nullif(guide_account.raw_user_meta_data ->> 'full_name', ''),
                guide_account.email
            ),
            'guide_email', guide_account.email
        )
        order by lower(coalesce(
            nullif(to_jsonb(guide_profile) ->> 'pseudo', ''),
            nullif(to_jsonb(guide_profile) ->> 'name', ''),
            nullif(guide_account.raw_user_meta_data ->> 'pseudo', ''),
            nullif(guide_account.raw_user_meta_data ->> 'name', ''),
            guide_account.email
        ))
    ), '[]'::jsonb)
    into cohort_rows
    from public.guide_candidates assignment
    join auth.users guide_account on guide_account.id = assignment.guide_id
    left join public.profiles guide_profile on guide_profile.id = guide_account.id
    where upper(trim(coalesce(
        to_jsonb(guide_profile) ->> 'specialty',
        to_jsonb(guide_profile) ->> 'speciality',
        to_jsonb(guide_profile) ->> 'specialite',
        guide_account.raw_app_meta_data ->> 'specialty',
        guide_account.raw_app_meta_data ->> 'speciality',
        guide_account.raw_user_meta_data ->> 'specialty',
        guide_account.raw_user_meta_data ->> 'speciality',
        ''
    ))) = 'OG';

    return cohort_rows;
end;
$$;

revoke all on function public.get_admin_candidate_cohorts() from public, anon;
grant execute on function public.get_admin_candidate_cohorts() to authenticated;

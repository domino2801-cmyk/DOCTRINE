-- Correctif cible pour le tableau de bord Officier Guide.
-- Aucun rôle, droit d'accès ou rattachement n'est modifié.
-- Exécuter uniquement ce script dans Supabase SQL Editor.

create or replace function public.get_guide_candidate_dashboard(p_candidate_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    candidates jsonb;
begin
    if auth.uid() is null or not (public.doctrine_is_admin() or public.doctrine_is_guide()) then
        raise exception 'Guide access required' using errcode = '42501';
    end if;
    if p_candidate_id is not null
       and not public.doctrine_can_access_candidate(p_candidate_id) then
        raise exception 'Candidat non rattaché à cet officier guide' using errcode = '42501';
    end if;

    select coalesce(jsonb_agg(candidate_payload.payload order by candidate_payload.candidate_name), '[]'::jsonb)
    into candidates
    from (
        select
            coalesce(
                nullif(to_jsonb(profile) ->> 'name', ''),
                nullif(user_account.raw_user_meta_data ->> 'name', ''),
                nullif(user_account.raw_user_meta_data ->> 'full_name', ''),
                user_account.email
            ) as candidate_name,
            jsonb_build_object(
                'candidate', jsonb_build_object(
                    'id', user_account.id,
                    'email', user_account.email,
                    'name', coalesce(
                        nullif(to_jsonb(profile) ->> 'name', ''),
                        nullif(user_account.raw_user_meta_data ->> 'name', ''),
                        nullif(user_account.raw_user_meta_data ->> 'full_name', ''),
                        user_account.email
                    ),
                    'grade', coalesce(to_jsonb(profile) ->> 'grade', to_jsonb(profile) ->> 'rank',
                                      user_account.raw_app_meta_data ->> 'grade',
                                      user_account.raw_app_meta_data ->> 'rank',
                                      user_account.raw_user_meta_data ->> 'grade',
                                      user_account.raw_user_meta_data ->> 'rank'),
                    'unit', coalesce(to_jsonb(profile) ->> 'unit', to_jsonb(profile) ->> 'unite',
                                     user_account.raw_app_meta_data ->> 'unit',
                                     user_account.raw_app_meta_data ->> 'unite',
                                     user_account.raw_user_meta_data ->> 'unit',
                                     user_account.raw_user_meta_data ->> 'unite'),
                    'specialty', coalesce(to_jsonb(profile) ->> 'specialty',
                                          to_jsonb(profile) ->> 'speciality',
                                          to_jsonb(profile) ->> 'specialite',
                                          user_account.raw_app_meta_data ->> 'specialty',
                                          user_account.raw_app_meta_data ->> 'speciality',
                                          user_account.raw_app_meta_data ->> 'specialite',
                                          user_account.raw_user_meta_data ->> 'specialty',
                                          user_account.raw_user_meta_data ->> 'speciality',
                                          user_account.raw_user_meta_data ->> 'specialite'),
                    'matricule', coalesce(to_jsonb(profile) ->> 'matricule',
                                          to_jsonb(profile) ->> 'service_number',
                                          user_account.raw_app_meta_data ->> 'matricule',
                                          user_account.raw_user_meta_data ->> 'matricule'),
                    'assigned_at', assignment.assigned_at
                ),
                'qcm', jsonb_build_object(
                    'progress', (
                        select to_jsonb(progress)
                        from public.user_progress progress
                        where progress.user_id = user_account.id
                    ),
                    'results', coalesce((
                        select jsonb_agg(
                            jsonb_build_object(
                                'id', result.data ->> 'id',
                                'score', case
                                    when coalesce(result.data ->> 'score', '') ~ '^-?[0-9]+([.][0-9]+)?$'
                                    then (result.data ->> 'score')::numeric
                                    else null
                                end,
                                'theme', coalesce(result.data ->> 'theme',
                                                  result.data ->> 'theme_name',
                                                  result.data ->> 'category'),
                                'total', case
                                    when coalesce(result.data ->> 'total', '') ~ '^[0-9]+$'
                                    then (result.data ->> 'total')::integer else null
                                end,
                                'correct', case
                                    when coalesce(result.data ->> 'correct', '') ~ '^[0-9]+$'
                                    then (result.data ->> 'correct')::integer else null
                                end,
                                'created_at', result.data ->> 'created_at'
                            )
                            order by result.data ->> 'created_at' desc nulls last
                        )
                        from (
                            select to_jsonb(quiz_result) as data
                            from public.quiz_results quiz_result
                            where coalesce(to_jsonb(quiz_result) ->> 'user_id',
                                           to_jsonb(quiz_result) ->> 'candidate_id')
                                  = user_account.id::text
                            order by to_jsonb(quiz_result) ->> 'created_at' desc nulls last
                            limit 1000
                        ) result
                    ), '[]'::jsonb)
                ),
                'doctrine', jsonb_build_object(
                    'progress_events', coalesce((
                        select jsonb_agg(jsonb_build_object(
                            'event_type', event.event_type,
                            'module_id', event.module_id,
                            'dossier', event.dossier,
                            'created_at', event.created_at
                        ) order by event.created_at desc)
                        from public.doctrine_progress_events event
                        where event.user_id = user_account.id
                          and event.module_id in ('1', '2', '3', '4')
                    ), '[]'::jsonb),
                    'documents', coalesce((
                        select jsonb_agg(jsonb_build_object(
                            'document_title', document_view.document_title,
                            'opened_at', document_view.opened_at
                        ) order by document_view.opened_at desc)
                        from public.doctrine_document_views document_view
                        where document_view.user_id = user_account.id
                          and document_view.module_id = '2'
                    ), '[]'::jsonb),
                    'submissions', coalesce((
                        select jsonb_agg(jsonb_build_object(
                            'id', submission.id,
                            'dossier', submission.dossier,
                            'submission_type', submission.submission_type,
                            'created_at', submission.created_at,
                            'storage_path', submission.storage_path,
                            'reviews', coalesce((
                                select jsonb_agg(jsonb_build_object(
                                    'guide_id', review.guide_id,
                                    'grade', review.grade,
                                    'form_grade', review.form_grade,
                                    'content_grade', review.content_grade,
                                    'rubric_scores', review.rubric_scores,
                                    'rubric_observations', review.rubric_observations,
                                    'rubric_evidence', review.rubric_evidence,
                                    'jury_checklist', review.jury_checklist,
                                    'status', review.status,
                                    'comment', review.comment,
                                    'reviewed_at', review.reviewed_at
                                ) order by review.reviewed_at desc)
                                from public.fiche_reviews review
                                where review.submission_id = submission.id
                                  and (public.doctrine_is_admin() or review.guide_id = auth.uid())
                            ), '[]'::jsonb)
                        ) order by submission.created_at desc)
                        from public.doctrine_fiche_submissions submission
                        where submission.user_id = user_account.id
                    ), '[]'::jsonb),
                    'last_activity', greatest(
                        (select max(activity.last_seen_at)
                         from public.qcm_candidate_activity activity
                         where activity.user_id = user_account.id),
                        (select max(event.created_at)
                         from public.doctrine_progress_events event
                         where event.user_id = user_account.id),
                        (select max(document_view.opened_at)
                         from public.doctrine_document_views document_view
                         where document_view.user_id = user_account.id),
                        (select max(submission.created_at)
                         from public.doctrine_fiche_submissions submission
                         where submission.user_id = user_account.id)
                    )
                ),
                'admission', (
                    select to_jsonb(admission)
                    from public.candidate_admission_tracking admission
                    where admission.candidate_id = user_account.id
                )
            ) as payload
        from auth.users user_account
        left join lateral (
            select candidate_assignment.assigned_at
            from public.guide_candidates candidate_assignment
            where candidate_assignment.candidate_id = user_account.id
              and (public.doctrine_is_admin() or candidate_assignment.guide_id = auth.uid())
            order by candidate_assignment.assigned_at desc
            limit 1
        ) assignment on true
        left join public.profiles profile on profile.id = user_account.id
        where (public.doctrine_is_admin() or assignment.assigned_at is not null)
              and user_account.email_confirmed_at is not null
          and (
                coalesce(user_account.raw_app_meta_data ->> 'role', 'candidat')
                    not in ('admin', 'guide', 'officier_guide')
                or upper(trim(coalesce(
                    to_jsonb(profile) ->> 'specialty',
                    to_jsonb(profile) ->> 'speciality',
                    to_jsonb(profile) ->> 'specialite',
                    user_account.raw_app_meta_data ->> 'specialty',
                    user_account.raw_app_meta_data ->> 'speciality',
                    user_account.raw_app_meta_data ->> 'specialite',
                    user_account.raw_user_meta_data ->> 'specialty',
                    user_account.raw_user_meta_data ->> 'speciality',
                    user_account.raw_user_meta_data ->> 'specialite',
                    ''
                ))) = 'OG'
          )
          and not coalesce(
                lower(user_account.raw_app_meta_data ->> 'bm4_admin') in ('true', '1'),
                false
          )
          and (p_candidate_id is null or user_account.id = p_candidate_id)
    ) candidate_payload;

    return jsonb_build_object(
        'candidates', candidates,
        'guide', (
            select jsonb_build_object(
                'id', current_account.id,
                'name', coalesce(
                    nullif(to_jsonb(profile) ->> 'name', ''),
                    nullif(current_account.raw_user_meta_data ->> 'name', ''),
                    nullif(current_account.raw_user_meta_data ->> 'full_name', ''),
                    current_account.email
                ),
                'grade', coalesce(to_jsonb(profile) ->> 'grade', to_jsonb(profile) ->> 'rank',
                                  current_account.raw_app_meta_data ->> 'grade',
                                  current_account.raw_app_meta_data ->> 'rank',
                                  current_account.raw_user_meta_data ->> 'grade',
                                  current_account.raw_user_meta_data ->> 'rank')
            )
            from auth.users current_account
            left join public.profiles profile on profile.id = current_account.id
            where current_account.id = auth.uid()
        )
    );
end;
$$;

revoke all on function public.get_guide_candidate_dashboard(uuid) from public, anon;
grant execute on function public.get_guide_candidate_dashboard(uuid) to authenticated;

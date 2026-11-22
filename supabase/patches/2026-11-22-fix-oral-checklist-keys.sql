-- Module 8: aligner les points clés de la fichette orale avec l'interface.
-- À exécuter une seule fois dans Supabase > SQL Editor.
create or replace function public.fiche_reviews_set_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    submission_type text;
    required_keys text[];
    allowed_checklist_keys text[];
begin
    if auth.uid() is not null then
        new.guide_id := auth.uid();
    end if;
    select submission.submission_type
    into submission_type
    from public.doctrine_fiche_submissions submission
    where submission.id = new.submission_id;

    if submission_type is null then
        raise exception 'La fiche à évaluer est introuvable.'
            using errcode = '22023';
    end if;
    if jsonb_typeof(new.rubric_scores) is distinct from 'object' then
        raise exception 'Le détail des critères doit être un objet JSON.'
            using errcode = '22023';
    end if;

    if jsonb_typeof(new.jury_checklist) is distinct from 'object' then
        raise exception 'La liste des points clés du jury doit être un objet JSON.'
            using errcode = '22023';
    end if;
    if exists (
        select 1
        from jsonb_each(new.jury_checklist) item
        where jsonb_typeof(item.value) is distinct from 'boolean'
    ) then
        raise exception 'Chaque point clé du jury doit être coché ou décoché.'
            using errcode = '22023';
    end if;
    if submission_type = 'proposition' then
        allowed_checklist_keys := array[
            'p_form_pages', 'p_form_header', 'p_form_references', 'p_form_style',
            'p_intro_context', 'p_intro_solution', 'p_intro_plan',
            'p_problem_facts', 'p_problem_level', 'p_problem_criteria',
            'p_solutions_three', 'p_solutions_details', 'p_solutions_risks',
            'p_opinion', 'p_risk_mitigation', 'p_conclusion'
        ];
    elsif submission_type = 'support_oral' then
        allowed_checklist_keys := array[
            'oral_operatoire',
            'oral_introduction',
            'oral_argumentaire',
            'oral_conclusion'
        ];
    else
        raise exception 'Type de fiche non évaluable.'
            using errcode = '22023';
    end if;
    if exists (
        select 1
        from jsonb_each(new.jury_checklist) item
        where not (item.key = any(allowed_checklist_keys))
    ) then
        raise exception 'La liste des points clés ne correspond pas au type de fiche.'
            using errcode = '22023';
    end if;

    if new.rubric_scores <> '{}'::jsonb then
        if submission_type = 'proposition' then
            required_keys := array['form', 'introduction', 'problematique_donnees', 'solutions', 'avis_conclusion'];
            if not (new.rubric_scores ?& required_keys) or exists (
                select 1
                from jsonb_each(new.rubric_scores) score
                where not (score.key = any(required_keys))
                   or jsonb_typeof(score.value) is distinct from 'number'
            ) then
                raise exception 'Les critères de la fiche de proposition sont incomplets ou invalides.'
                    using errcode = '22023';
            end if;
            if (new.rubric_scores ->> 'form')::numeric not between 0 and 6
               or (new.rubric_scores ->> 'introduction')::numeric not between 0 and 3
               or (new.rubric_scores ->> 'problematique_donnees')::numeric not between 0 and 3
               or (new.rubric_scores ->> 'solutions')::numeric not between 0 and 4
               or (new.rubric_scores ->> 'avis_conclusion')::numeric not between 0 and 4 then
                raise exception 'Une note de la fiche de proposition dépasse le barème.'
                    using errcode = '22023';
            end if;
            new.form_grade := round((new.rubric_scores ->> 'form')::numeric, 2);
            new.content_grade := round(
                (new.rubric_scores ->> 'introduction')::numeric
                + (new.rubric_scores ->> 'problematique_donnees')::numeric
                + (new.rubric_scores ->> 'solutions')::numeric
                + (new.rubric_scores ->> 'avis_conclusion')::numeric,
                2
            );
        elsif submission_type = 'support_oral' then
            required_keys := array['operatoire_forme', 'introduction', 'argumentaire', 'conclusion'];
            if not (new.rubric_scores ?& required_keys) or exists (
                select 1
                from jsonb_each(new.rubric_scores) score
                where not (score.key = any(required_keys))
                   or jsonb_typeof(score.value) is distinct from 'number'
            ) then
                raise exception 'Les critères du support oral sont incomplets ou invalides.'
                    using errcode = '22023';
            end if;
            if (new.rubric_scores ->> 'operatoire_forme')::numeric not between 0 and 6
               or (new.rubric_scores ->> 'introduction')::numeric not between 0 and 4
               or (new.rubric_scores ->> 'argumentaire')::numeric not between 0 and 7
               or (new.rubric_scores ->> 'conclusion')::numeric not between 0 and 3 then
                raise exception 'Une note du support oral dépasse le barème.'
                    using errcode = '22023';
            end if;
            new.form_grade := round((new.rubric_scores ->> 'operatoire_forme')::numeric, 2);
            new.content_grade := round(
                (new.rubric_scores ->> 'introduction')::numeric
                + (new.rubric_scores ->> 'argumentaire')::numeric
                + (new.rubric_scores ->> 'conclusion')::numeric,
                2
            );
        else
            raise exception 'Type de fiche non évaluable.'
                using errcode = '22023';
        end if;
    end if;

    if new.form_grade is not null and new.content_grade is not null then
        new.grade := round(new.form_grade + new.content_grade, 2);
    elsif new.status <> 'en_attente' then
        raise exception 'Une note de forme et une note de fond sont requises pour clôturer une évaluation.'
            using errcode = '22023';
    else
        new.grade := null;
    end if;
    new.reviewed_at := now();
    return new;
end;
$$;

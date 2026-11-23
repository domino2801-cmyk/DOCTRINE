-- BM4 — Stockage structuré des observations et indices des neuf critères.
-- Migration autonome et idempotente : fonctionne même si l'ancienne migration Forme n'a pas été appliquée.
-- Migration rétrocompatible : conserve les anciennes colonnes Forme et les commentaires historiques.

begin;

alter table public.fiche_reviews
    add column if not exists form_observations text,
    add column if not exists form_evidence text,
    add column if not exists rubric_observations jsonb not null default '{}'::jsonb,
    add column if not exists rubric_evidence jsonb not null default '{}'::jsonb;

comment on column public.fiche_reviews.rubric_observations is
    'Observations indépendantes par clé de critère BM4 : cinq critères écrits ou quatre critères oraux.';
comment on column public.fiche_reviews.rubric_evidence is
    'Indices documentaires indépendants par clé de critère BM4 : cinq critères écrits ou quatre critères oraux.';

-- Reprise des champs Forme dédiés créés par la migration précédente.
update public.fiche_reviews review
set rubric_observations = coalesce(review.rubric_observations, '{}'::jsonb) ||
        jsonb_build_object(
            case submission.submission_type when 'support_oral' then 'operatoire_forme' else 'form' end,
            review.form_observations
        ),
    rubric_evidence = coalesce(review.rubric_evidence, '{}'::jsonb) ||
        jsonb_build_object(
            case submission.submission_type when 'support_oral' then 'operatoire_forme' else 'form' end,
            review.form_evidence
        )
from public.doctrine_fiche_submissions submission
where submission.id = review.submission_id
  and (nullif(trim(coalesce(review.form_observations, '')), '') is not null
       or nullif(trim(coalesce(review.form_evidence, '')), '') is not null);

notify pgrst, 'reload schema';
commit;

-- BM4 — Stockage structuré de toutes les observations et preuves des neuf critères.
-- À appliquer sur le projet Supabase partagé avant le déploiement de l'interface.

begin;

alter table public.fiche_reviews
    add column if not exists form_observations text,
    add column if not exists form_evidence text,\n    add column if not exists rubric_observations jsonb not null default '{}'::jsonb,\n    add column if not exists rubric_evidence jsonb not null default '{}'::jsonb;

comment on column public.fiche_reviews.form_observations is
    'Observation dédiée au critère Forme de la fiche de proposition BM4, indépendante du commentaire libre.';
comment on column public.fiche_reviews.form_evidence is
    'Indice documentaire associé à l''observation du critère Forme BM4.';

commit;

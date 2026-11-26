-- Ajoute les champs de traitement administratif aux signalements de questions QCM-MAJOR.
-- Migration additive : conserve les questions, réponses, signalants et statuts existants.
alter table public.question_reports
    add column if not exists admin_response text,
    add column if not exists processed_by uuid references auth.users(id) on delete set null,
    add column if not exists processed_at timestamptz,
    add column if not exists updated_at timestamptz not null default now();

create index if not exists question_reports_status_created_at_idx
    on public.question_reports(status, created_at desc);

-- Le statut de question_reports reste volontairement limité à pending / resolved
-- conformément à la contrainte question_reports_status_check déjà en place.
-- Les politiques RLS existantes restent inchangées : les mises à jour doivent
-- rester réservées aux administrateurs par la politique Supabase déjà configurée.

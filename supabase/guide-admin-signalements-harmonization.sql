-- Harmonisation des signalements candidats et Officiers Guides dans l'administration ANC.
-- Migration additive : conserve les signalements existants et les règles RLS en place.

alter table public.doctrine_signalements
    add column if not exists admin_response text,
    add column if not exists processed_by uuid references auth.users(id) on delete set null,
    add column if not exists processed_at timestamptz,
    add column if not exists updated_at timestamptz not null default now();

alter table public.doctrine_signalements
    drop constraint if exists doctrine_signalements_status_check;

update public.doctrine_signalements
set status = case status when 'pending' then 'submitted' else status end
where status = 'pending';

alter table public.doctrine_signalements
    alter column status set default 'submitted';

alter table public.doctrine_signalements
    add constraint doctrine_signalements_status_check
    check (status in ('submitted','in_review','action_required','resolved','closed'));

create index if not exists doctrine_signalements_status_created_at_idx
    on public.doctrine_signalements(status, created_at desc);

-- La politique doctrine_signalements_admin_update existante continue de protéger
-- les modifications : seuls les comptes reconnus administrateurs peuvent traiter.

-- Les candidats conservent uniquement le droit de créer leur propre signalement.
-- Compatibilité temporaire avec les clients encore configurés sur l'ancien statut pending.
drop policy if exists doctrine_signalements_candidate_insert on public.doctrine_signalements;
create policy doctrine_signalements_candidate_insert on public.doctrine_signalements
    for insert to authenticated
    with check (user_id = auth.uid() and status in ('submitted','pending'));

-- Relais de connexion QCM-MAJOR -> ANC : codes à usage unique, durée 90 secondes.
create table if not exists public.doctrine_auth_handoffs (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists doctrine_auth_handoffs_expires_at_idx
  on public.doctrine_auth_handoffs (expires_at);

alter table public.doctrine_auth_handoffs enable row level security;
revoke all on table public.doctrine_auth_handoffs from public, anon, authenticated;
grant all on table public.doctrine_auth_handoffs to service_role;

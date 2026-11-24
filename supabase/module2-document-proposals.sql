-- Documents complémentaires du Module 2.1 : propositions Officier Guide et publication administrateur.
begin;

create table if not exists public.guide_document_proposals (
    id uuid primary key default gen_random_uuid(),
    guide_id uuid references auth.users(id) on delete set null,
    title text not null check (char_length(trim(title)) between 1 and 160),
    category text not null check (char_length(trim(category)) between 1 and 100),
    description text not null default '' check (char_length(description) <= 1200),
    drive_url text,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    admin_id uuid references auth.users(id) on delete set null,
    admin_note text not null default '' check (char_length(admin_note) <= 1000),
    created_at timestamptz not null default now(),
    reviewed_at timestamptz,
    constraint guide_document_proposals_url_check check (
        drive_url is null or (drive_url ~* '^https://(drive|docs)\.google\.com/')
    ),
    constraint guide_document_proposals_approved_url_check check (
        status <> 'approved' or drive_url is not null
    )
);

create index if not exists guide_document_proposals_status_created_idx
    on public.guide_document_proposals(status, created_at);

alter table public.guide_document_proposals enable row level security;
revoke all on public.guide_document_proposals from public, anon;
revoke all on public.guide_document_proposals from authenticated;
grant select, insert, update on public.guide_document_proposals to authenticated;

create or replace function public.guide_document_proposals_set_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if public.doctrine_is_admin() then
        new.admin_id := auth.uid();
        if new.status = 'approved' then
            new.reviewed_at := now();
        end if;
    elsif public.doctrine_is_guide() then
        if tg_op = 'INSERT' then
            new.guide_id := auth.uid();
            new.admin_id := null;
            new.drive_url := null;
            new.status := 'pending';
            new.admin_note := '';
            new.reviewed_at := null;
        else
            raise exception 'Seul un administrateur peut modifier une proposition.'
                using errcode = '42501';
        end if;
    else
        raise exception 'Accès non autorisé.'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists guide_document_proposals_identity on public.guide_document_proposals;
create trigger guide_document_proposals_identity
    before insert or update on public.guide_document_proposals
    for each row execute function public.guide_document_proposals_set_identity();

drop policy if exists guide_document_proposals_read on public.guide_document_proposals;
create policy guide_document_proposals_read
    on public.guide_document_proposals for select to authenticated
    using (
        public.doctrine_is_admin()
        or (public.doctrine_is_guide() and guide_id = auth.uid())
        or status = 'approved'
    );

drop policy if exists guide_document_proposals_insert on public.guide_document_proposals;
create policy guide_document_proposals_insert
    on public.guide_document_proposals for insert to authenticated
    with check (
        (public.doctrine_is_guide() and guide_id = auth.uid() and status = 'pending' and drive_url is null)
        or (public.doctrine_is_admin() and status = 'approved' and drive_url is not null and admin_id = auth.uid())
    );

drop policy if exists guide_document_proposals_update on public.guide_document_proposals;
create policy guide_document_proposals_update
    on public.guide_document_proposals for update to authenticated
    using (public.doctrine_is_admin())
    with check (public.doctrine_is_admin() and admin_id = auth.uid());

revoke all on function public.guide_document_proposals_set_identity() from public, anon, authenticated;

commit;

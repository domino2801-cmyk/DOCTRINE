-- Pièces jointes aux propositions documentaires Officier Guide.
-- Migration additive : les propositions existantes restent inchangées.
begin;

alter table public.guide_document_proposals
    add column if not exists uploaded_file_path text,
    add column if not exists original_filename text,
    add column if not exists file_size bigint,
    add column if not exists mime_type text;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'guide_document_proposals_attachment_metadata_check'
          and conrelid = 'public.guide_document_proposals'::regclass
    ) then
        alter table public.guide_document_proposals
            add constraint guide_document_proposals_attachment_metadata_check check (
                (uploaded_file_path is null and original_filename is null and file_size is null and mime_type is null)
                or
                (uploaded_file_path is not null
                 and original_filename is not null
                 and char_length(original_filename) between 1 and 255
                 and file_size between 1 and 20971520
                 and mime_type in ('application/pdf', 'text/plain', 'application/vnd.ms-powerpoint')
                 and uploaded_file_path ~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9._-]{1,140}$'
                 and lower(original_filename) ~ '\\.(pdf|txt|ppt)$')
            );
    end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guide-document-proposals', 'guide-document-proposals', false, 20971520,
        array['application/pdf', 'text/plain', 'application/vnd.ms-powerpoint'])
on conflict (id) do update
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array['application/pdf', 'text/plain', 'application/vnd.ms-powerpoint'];

create or replace function public.guide_document_proposals_validate_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.uploaded_file_path is null then
        return new;
    end if;
    if not public.doctrine_is_guide()
       or new.guide_id is distinct from auth.uid()
       or split_part(new.uploaded_file_path, '/', 1) <> auth.uid()::text then
        raise exception 'Pièce jointe non autorisée pour ce compte.'
            using errcode = '42501';
    end if;
    if not exists (
        select 1 from storage.objects object
        where object.bucket_id = 'guide-document-proposals'
          and object.name = new.uploaded_file_path
    ) then
        raise exception 'Le fichier doit être téléversé avant l’envoi de la proposition.'
            using errcode = '22023';
    end if;
    return new;
end;
$$;

drop trigger if exists guide_document_proposals_validate_attachment on public.guide_document_proposals;
create trigger guide_document_proposals_validate_attachment
    before insert on public.guide_document_proposals
    for each row execute function public.guide_document_proposals_validate_attachment();

drop policy if exists guide_document_proposals_files_insert on storage.objects;
create policy guide_document_proposals_files_insert
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'guide-document-proposals'
        and public.doctrine_is_guide()
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists guide_document_proposals_files_read on storage.objects;
create policy guide_document_proposals_files_read
    on storage.objects for select to authenticated
    using (
        bucket_id = 'guide-document-proposals'
        and (
            public.doctrine_is_admin()
            or (public.doctrine_is_guide() and (storage.foldername(name))[1] = auth.uid()::text)
        )
    );

drop policy if exists guide_document_proposals_files_delete on storage.objects;
create policy guide_document_proposals_files_delete
    on storage.objects for delete to authenticated
    using (bucket_id = 'guide-document-proposals' and public.doctrine_is_admin());

revoke all on function public.guide_document_proposals_validate_attachment() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;

-- Passage du catalogue individuel au catalogue commun fourni par l’administrateur.
begin;
-- Catalogue commun : lecture Officier Guide, gestion réservée aux administrateurs.
alter table public.guide_course_catalog
    alter column guide_id set default auth.uid();

drop policy if exists guide_course_catalog_select_own on public.guide_course_catalog;
drop policy if exists guide_course_catalog_insert_own on public.guide_course_catalog;
drop policy if exists guide_course_catalog_update_own on public.guide_course_catalog;
drop policy if exists guide_course_catalog_delete_own on public.guide_course_catalog;
drop policy if exists guide_course_catalog_read_guides on public.guide_course_catalog;
drop policy if exists guide_course_catalog_admin_insert on public.guide_course_catalog;
drop policy if exists guide_course_catalog_admin_update on public.guide_course_catalog;
drop policy if exists guide_course_catalog_admin_delete on public.guide_course_catalog;

create policy guide_course_catalog_read_guides
    on public.guide_course_catalog for select to authenticated
    using (public.doctrine_is_guide() or public.doctrine_is_admin());

create policy guide_course_catalog_admin_insert
    on public.guide_course_catalog for insert to authenticated
    with check (public.doctrine_is_admin());

create policy guide_course_catalog_admin_update
    on public.guide_course_catalog for update to authenticated
    using (public.doctrine_is_admin())
    with check (public.doctrine_is_admin());

create policy guide_course_catalog_admin_delete
    on public.guide_course_catalog for delete to authenticated
    using (public.doctrine_is_admin());

commit;

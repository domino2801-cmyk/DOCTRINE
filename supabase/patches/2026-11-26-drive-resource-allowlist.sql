-- Liste blanche des supports documentaires historiques Google Drive.
-- Les 16 dossiers initiaux sont partagés aux candidats, Officiers Guides et administrateurs.
-- Les administrateurs peuvent ajouter, modifier et désactiver des dossiers depuis l'interface.
BEGIN;

CREATE TABLE IF NOT EXISTS public.doctrine_drive_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_folder_id text NOT NULL UNIQUE
    CHECK (drive_folder_id ~ '^[A-Za-z0-9_-]{10,80}$'),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 160),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doctrine_drive_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctrine_drive_resources_read_active ON public.doctrine_drive_resources;
CREATE POLICY doctrine_drive_resources_read_active
  ON public.doctrine_drive_resources FOR SELECT TO authenticated
  USING (is_active OR public.doctrine_is_admin());

DROP POLICY IF EXISTS doctrine_drive_resources_admin_write ON public.doctrine_drive_resources;
CREATE POLICY doctrine_drive_resources_admin_write
  ON public.doctrine_drive_resources FOR ALL TO authenticated
  USING (public.doctrine_is_admin())
  WITH CHECK (public.doctrine_is_admin());

REVOKE ALL ON public.doctrine_drive_resources FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctrine_drive_resources TO authenticated;

CREATE INDEX IF NOT EXISTS doctrine_drive_resources_active_idx
  ON public.doctrine_drive_resources (drive_folder_id) WHERE is_active;

INSERT INTO public.doctrine_drive_resources (drive_folder_id, title)
VALUES
  ('1l6qZIdK6QVPHfVoGuCrkoJV5QGkVGcI_', 'Vie et lumières'),
  ('1N2a49fE6JNu-59Hxa15Be99vr5BavI8E', 'Poste de Cdt 7e BB'),
  ('11dhk9Y611V1i3ChYOWRvx09-9SLilVnJ', 'Armes Salle d’Honneur'),
  ('1qGUmuf4JsK-9TNmD7tAXyO2QEKDiE2ZW', 'Thémis'),
  ('12IBiJtiry-On0pON_0iuoJ59Pt_6AYS1', 'PMS Opérationnel'),
  ('1tBRI8hjbNM-eVAgjVb9LjNK3hSuyQyAA', 'SMA / Tir SMA'),
  ('1vGE8GLEFHoX3_DjozDBR3x8ujArRV2a5', 'Toulaud Air Sport'),
  ('1drUZgFsAX7tRadB-FaxuDJ1EKXC9AonL', 'Opération Sentinelle'),
  ('1Fn6pmTs981S3VrTwLtNCAj2j5_d7pDtH', 'ARMADA'),
  ('1_w3RI1xmAN0FCZeCEeVRXcRqvFi7ek_6', 'Infrastructures'),
  ('1-m1qvnV4JvY6gm-dIPYno5xA-Qfc04IG', 'Camp du Ruchard'),
  ('1cSmdKJJnmXXekUfSfeZZQ_OqZ-L5stbB', 'Service national'),
  ('1iNMbYPCNSgiVVr2kS1y6tufkgogeucIw', 'Désinformation / Complotisme'),
  ('1l0UcOA2jECtTlVzTKjsolP_CFRw_dkSA', 'Bègles-Moissac'),
  ('1GVRpJ3TnpXSxBD9PLoUtaZ1A5BRsN-d_', 'MCO SCORPION / BITD'),
  ('13VVCZiKzxgW8Rldm1i2addC868scJELl', 'Sécurisation face à la menace drone')
ON CONFLICT (drive_folder_id) DO NOTHING;

COMMIT;

-- Bibliothèques indépendantes des 30 supports Officier Guide existants.
-- Migration additive : aucune table, donnée, politique ou progression existante n'est modifiée.
BEGIN;

CREATE TABLE IF NOT EXISTS public.guide_exercise_library (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
    category text NOT NULL DEFAULT 'Général' CHECK (length(btrim(category)) BETWEEN 1 AND 100),
    description text NOT NULL DEFAULT '',
    drive_url text NOT NULL CHECK (drive_url ~* '^https://(drive[.]google[.]com|docs[.]google[.]com)/'),
    difficulty_level smallint NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 4),
    is_published boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guide_correction_library (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exercise_id uuid NOT NULL REFERENCES public.guide_exercise_library(id) ON DELETE RESTRICT,
    title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
    description text NOT NULL DEFAULT '',
    drive_url text NOT NULL CHECK (drive_url ~* '^https://(drive[.]google[.]com|docs[.]google[.]com)/'),
    difficulty_level smallint NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 4),
    is_published boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guide_exercise_library_publication_idx
    ON public.guide_exercise_library (is_published, difficulty_level, sort_order, title);

CREATE INDEX IF NOT EXISTS guide_correction_library_exercise_idx
    ON public.guide_correction_library (exercise_id, is_published, difficulty_level, sort_order, title);

ALTER TABLE public.guide_exercise_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_correction_library ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.guide_exercise_library,
    public.guide_correction_library
TO authenticated;

DROP POLICY IF EXISTS guide_exercise_library_read ON public.guide_exercise_library;
CREATE POLICY guide_exercise_library_read
    ON public.guide_exercise_library
    FOR SELECT TO authenticated
    USING (doctrine_is_admin() OR (doctrine_is_guide() AND is_published));

DROP POLICY IF EXISTS guide_exercise_library_admin_insert ON public.guide_exercise_library;
CREATE POLICY guide_exercise_library_admin_insert
    ON public.guide_exercise_library
    FOR INSERT TO authenticated
    WITH CHECK (doctrine_is_admin());

DROP POLICY IF EXISTS guide_exercise_library_admin_update ON public.guide_exercise_library;
CREATE POLICY guide_exercise_library_admin_update
    ON public.guide_exercise_library
    FOR UPDATE TO authenticated
    USING (doctrine_is_admin())
    WITH CHECK (doctrine_is_admin());

DROP POLICY IF EXISTS guide_exercise_library_admin_delete ON public.guide_exercise_library;
CREATE POLICY guide_exercise_library_admin_delete
    ON public.guide_exercise_library
    FOR DELETE TO authenticated
    USING (doctrine_is_admin());

DROP POLICY IF EXISTS guide_correction_library_read ON public.guide_correction_library;
CREATE POLICY guide_correction_library_read
    ON public.guide_correction_library
    FOR SELECT TO authenticated
    USING (
        doctrine_is_admin()
        OR (
            doctrine_is_guide()
            AND is_published
            AND EXISTS (
                SELECT 1
                FROM public.guide_exercise_library exercise
                WHERE exercise.id = exercise_id
                  AND exercise.is_published
            )
        )
    );

DROP POLICY IF EXISTS guide_correction_library_admin_insert ON public.guide_correction_library;
CREATE POLICY guide_correction_library_admin_insert
    ON public.guide_correction_library
    FOR INSERT TO authenticated
    WITH CHECK (doctrine_is_admin());

DROP POLICY IF EXISTS guide_correction_library_admin_update ON public.guide_correction_library;
CREATE POLICY guide_correction_library_admin_update
    ON public.guide_correction_library
    FOR UPDATE TO authenticated
    USING (doctrine_is_admin())
    WITH CHECK (doctrine_is_admin());

DROP POLICY IF EXISTS guide_correction_library_admin_delete ON public.guide_correction_library;
CREATE POLICY guide_correction_library_admin_delete
    ON public.guide_correction_library
    FOR DELETE TO authenticated
    USING (doctrine_is_admin());

COMMENT ON TABLE public.guide_exercise_library IS
    'Bibliothèque indépendante des dossiers d’exercices Officier Guide ; visibilité OG réservée aux contenus publiés.';
COMMENT ON TABLE public.guide_correction_library IS
    'Corrections Google Drive rattachées aux exercices ; visibilité OG conditionnée à la publication de la correction et de son exercice.';
COMMENT ON COLUMN public.guide_exercise_library.difficulty_level IS
    '1 Fondamentaux, 2 Application, 3 Maîtrise, 4 Expertise.';
COMMENT ON COLUMN public.guide_correction_library.difficulty_level IS
    '1 Fondamentaux, 2 Application, 3 Maîtrise, 4 Expertise.';

COMMIT;

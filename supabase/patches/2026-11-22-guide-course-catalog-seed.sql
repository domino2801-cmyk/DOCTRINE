-- Catalogue commun des supports pédagogiques Officier Guide.
-- 30 ressources fournies par l'administrateur ANC.
-- Ce catalogue est indépendant des modules de progression 1 à 7 :
-- aucun Module 8 n'est créé et aucune progression candidat n'est modifiée.
-- Exécuter une seule fois dans Supabase > SQL Editor.
begin;

insert into public.guide_course_catalog (title, category, description, drive_url)
select
    seed.title,
    seed.category,
    seed.description,
    'https://drive.google.com/open?id=' || seed.drive_id
from (values
    ('Technique d’expression orale', 'Expression orale', 'Techniques et méthodes de préparation à l’expression orale.', '1JRRL0Z_eTaR0qvR5P5-34KqWCtzldfAF'),
    ('SMA – SMV – SNU', 'Armée de Terre et engagement', 'Présentation des dispositifs SMA, SMV et SNU.', '1_JeSbQ2KKIs15veTiQlJZkrUk1s1NSIv'),
    ('Présentation de la mission de l’Armée de Terre', 'Armée de Terre et engagement', 'Présentation de la mission de l’Armée de Terre.', '1kQ2Ql1oZ-iGpqmjrQzdZJSTRTzO-ZLW8'),
    ('Présentation de la fichette orale', 'Préparation Major et dossiers', 'Support de présentation de la fichette orale.', '1KVGDa829SW7MsuLH1wU2Bjd_2eqI3S3W'),
    ('Présentation de la fiche de proposition', 'Préparation Major et dossiers', 'Support de présentation de la fiche de proposition.', '16tfBO25-1GdvX6GTPITn5VNWcJ48Eu0i'),
    ('Présentation du CV', 'Préparation Major et dossiers', 'Support de présentation du CV candidat.', '1B6vO-GswqhauKAotETNyLCWNqlViUiPI'),
    ('Présentation du Commandement Alpha', 'Organisation et commandement', 'Présentation des commandements Alpha.', '1irOlMK0mvzH-RFZH7FHpWgjgyy6qSCEG'),
    ('Objectif Major', 'Préparation Major et dossiers', 'Présentation générale de l’objectif de préparation Major.', '1pal2by7HFbNQYYhluKyv9Atm-cSTZAdz'),
    ('Mission de l’Armée de Terre', 'Armée de Terre et engagement', 'Support complémentaire sur les missions de l’Armée de Terre.', '1BBF4zOTWA2Ls4INEfdDUkJisdEmx3HDq'),
    ('Corps d’armée', 'Organisation et commandement', 'Présentation des corps d’armée.', '1ez8PXTZcPIUUs763Mormgczs-za7fK6f'),
    ('Commandement Alpha', 'Organisation et commandement', 'Support complémentaire sur le Commandement Alpha.', '1s-irRItFzk5FOyMDcTbXvFRr6drG_hy6'),
    ('Chiffres clés de l’Armée de Terre 2025', 'Armée de Terre et engagement', 'Repères chiffrés de l’Armée de Terre – édition 2025.', '1cWPmDHj8Sl9RrWRQmnYeTUZ66EWiTYld'),
    ('Exercice MRG – CDEC / EEM / FEMO', 'Méthode de raisonnement général', 'Support d’exercice de mise en œuvre du MRG.', '1jwWgEyq0iYa-ssF5Rcey274ojpiZtesI'),
    ('Méthode de raisonnement général (MRG)', 'Méthode de raisonnement général', 'Présentation de la méthode de raisonnement général.', '1gW498B90YMGRlIa0bEjooU9BCrruRifn'),
    ('Synthèse globale de la LPM', 'Loi de programmation militaire', 'Document Word de synthèse globale de la loi de programmation militaire.', '1-ChVQB3RfrmZQVCFmOl7SMpyGdjEQO17'),
    ('Loi de programmation militaire', 'Loi de programmation militaire', 'Présentation de la loi de programmation militaire.', '1GT_vJkz0guu8ntadKR2YrEcafoHAylPO'),
    ('Les brigades', 'Organisation et commandement', 'Présentation des brigades de l’Armée de Terre.', '1yogxVGDmgq1PhBY1Uvhs_KeRW8aUxS3G'),
    ('Les brigades – document de synthèse', 'Organisation et commandement', 'Document Word complémentaire sur les brigades.', '12_IMr9SjCDd0oxP2SeXM6XeRsgVBS8Sb'),
    ('Matériels majeurs de l’Armée de Terre', 'Armée de Terre et engagement', 'Présentation des matériels majeurs de l’Armée de Terre.', '1OX0NgLKwAB0Wm780aAQVyvqX_2A35wTN'),
    ('Matériels majeurs de l’Armée de Terre – document', 'Armée de Terre et engagement', 'Document Word complémentaire sur les matériels majeurs.', '11Pnj5v_MxaFlbYu0TVOJgVltImlXBzmv'),
    ('L’Armée de Terre de combat', 'Armée de Terre et engagement', 'Présentation de l’Armée de Terre de combat.', '1SuuM_xFhm2LPbqCS38_ZOx8vKL5nZoNM'),
    ('L’Armée de Terre de combat – document', 'Armée de Terre et engagement', 'Document Word complémentaire sur l’Armée de Terre de combat.', '19L2KR6MOTyDf1kp1Ou-Q-mezrL3ZxiB_'),
    ('Présentation de la loi de programmation militaire', 'Loi de programmation militaire', 'Support de présentation de la LPM.', '1flppziRXXhwDSk5YgLsRIdNAl3qG4p6D'),
    ('Présentation de la loi de programmation militaire – document', 'Loi de programmation militaire', 'Document Word complémentaire sur la LPM.', '1y6VJiKt4JXaC2_rvEJIiSVwrHfsVcNsF'),
    ('Présentation des brigades – document', 'Organisation et commandement', 'Document Word de présentation des brigades.', '15dqPNSyeVz82Z0uVOxoEoGuHcJ3ikTwN'),
    ('Présentation des brigades – PowerPoint', 'Organisation et commandement', 'Support PowerPoint de présentation des brigades.', '1VpgirnGniVVYNprnfGljKG1cm2sORKPR'),
    ('Présentation des matériels majeurs de l’Armée de Terre – document', 'Armée de Terre et engagement', 'Document Word de présentation des matériels majeurs.', '1SMyY7qbaP-0MIB2l--nCR-ZlypqxPjd7'),
    ('Présentation des matériels majeurs de l’Armée de Terre – PowerPoint', 'Armée de Terre et engagement', 'Support PowerPoint de présentation des matériels majeurs.', '1uyQEgwxJYvOycgxcG4XaD0tE5pl6Mg9B'),
    ('Présentation de l’Armée de Terre de combat', 'Armée de Terre et engagement', 'Support PowerPoint de présentation de l’Armée de Terre de combat.', '1OUhbkmbS2986TkOTpI-baYKstdVzl37g'),
    ('Présentation de l’Armée de Terre de combat – document', 'Armée de Terre et engagement', 'Document Word de présentation de l’Armée de Terre de combat.', '1ErtkPlnaxwx75AaXGsIBzorWtha3nbBX')
) as seed(title, category, description, drive_id)
where not exists (
    select 1
    from public.guide_course_catalog existing
    where existing.drive_url = 'https://drive.google.com/open?id=' || seed.drive_id
);

commit;

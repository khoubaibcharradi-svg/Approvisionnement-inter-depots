-- Nouveau rôle : administrateur IT, tous les droits de l'administrateur plus l'exploitation (sauvegardes, journaux, tableau de bord IT).
INSERT INTO `role` (`code`, `libelle`, `ordre`, `isActif`, `isDeleted`, `dateCreation`, `creePar`, `dateModification`)
SELECT 'ADMIN_FULL', 'Administrateur IT', COALESCE(MAX(`ordre`), 0) + 1, true, false, CURRENT_TIMESTAMP(3), 'migration', CURRENT_TIMESTAMP(3)
FROM `role`
WHERE NOT EXISTS (SELECT 1 FROM `role` WHERE `code` = 'ADMIN_FULL');

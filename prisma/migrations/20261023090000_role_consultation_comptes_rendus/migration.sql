-- Nouveau rôle : consultation des comptes rendus des dépôts, en lecture seule.
INSERT INTO `role` (`code`, `libelle`, `ordre`, `isActif`, `isDeleted`, `dateCreation`, `creePar`, `dateModification`)
SELECT 'CONSULTANT_CR', 'Consultation comptes rendus', COALESCE(MAX(`ordre`), 0) + 1, true, false, CURRENT_TIMESTAMP(3), 'migration', CURRENT_TIMESTAMP(3)
FROM `role`
WHERE NOT EXISTS (SELECT 1 FROM `role` WHERE `code` = 'CONSULTANT_CR');

-- Jours sans compte rendu attendu (0 = dimanche … 6 = samedi, séparés par des virgules ; vide = tous les jours).
INSERT INTO `parametre` (`cle`, `valeur`, `description`, `creePar`, `dateModification`)
SELECT 'CR_JOURS_NON_OUVRES', '', 'Jours sans compte rendu attendu : 0 = dimanche … 6 = samedi, séparés par des virgules (vide = tous les jours)', 'migration', CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `parametre` WHERE `cle` = 'CR_JOURS_NON_OUVRES');

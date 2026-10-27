-- Chaque société a son propre prix de revient : le prix passe de l'article au couple (article, société).

-- CreateTable
CREATE TABLE `prix_revient` (
    `codeArticle` VARCHAR(30) NOT NULL,
    `codeSociete` VARCHAR(30) NOT NULL,
    `prixRevient` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `dateMajPrix` DATETIME(3) NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `prix_revient_codeSociete_idx`(`codeSociete`),
    PRIMARY KEY (`codeArticle`, `codeSociete`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `prix_revient` ADD CONSTRAINT `prix_revient_codeArticle_fkey` FOREIGN KEY (`codeArticle`) REFERENCES `article`(`codeArticle`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prix_revient` ADD CONSTRAINT `prix_revient_codeSociete_fkey` FOREIGN KEY (`codeSociete`) REFERENCES `societe`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reprise : le prix unique déjà saisi est recopié pour chaque société, en attendant les prix propres à chacune
-- (rien n'est valorisé à 0 du jour au lendemain). Les lignes d'inventaire gardent le prix figé à leur saisie.
INSERT INTO `prix_revient` (`codeArticle`, `codeSociete`, `prixRevient`, `dateMajPrix`, `creePar`, `dateModification`)
SELECT a.`codeArticle`, s.`code`, a.`prixRevient`, a.`dateMajPrix`, 'migration', CURRENT_TIMESTAMP(3)
FROM `article` a CROSS JOIN `societe` s
WHERE a.`prixRevient` > 0 AND s.`isDeleted` = false;

-- AlterTable
ALTER TABLE `article` DROP COLUMN `dateMajPrix`,
    DROP COLUMN `prixRevient`;

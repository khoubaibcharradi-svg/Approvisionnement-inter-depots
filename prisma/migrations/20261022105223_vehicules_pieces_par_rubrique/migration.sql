-- AlterTable
ALTER TABLE `compte_rendu_piece` ADD COLUMN `rubrique` ENUM('STOCK', 'RECETTES', 'DEPENSES') NOT NULL DEFAULT 'STOCK';

-- AlterTable
ALTER TABLE `compte_rendu_vehicule` ADD COLUMN `codeMagasin` VARCHAR(30) NULL;

-- CreateTable
CREATE TABLE `vehicule` (
    `matricule` VARCHAR(30) NOT NULL,
    `codeMagasin` VARCHAR(30) NOT NULL,
    `codeDepot` VARCHAR(30) NOT NULL,
    `chauffeurHabituel` VARCHAR(100) NULL,
    `description` VARCHAR(100) NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `vehicule_codeDepot_idx`(`codeDepot`),
    INDEX `vehicule_codeMagasin_idx`(`codeMagasin`),
    PRIMARY KEY (`matricule`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `vehicule` ADD CONSTRAINT `vehicule_codeMagasin_fkey` FOREIGN KEY (`codeMagasin`) REFERENCES `magasin`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicule` ADD CONSTRAINT `vehicule_codeDepot_fkey` FOREIGN KEY (`codeDepot`) REFERENCES `depot`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

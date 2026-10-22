-- AlterTable
ALTER TABLE `article` ADD COLUMN `dateMajPrix` DATETIME(3) NULL,
    ADD COLUMN `prixRevient` DECIMAL(14, 3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `inventaire_ligne` (
    `codeMagasin` VARCHAR(30) NOT NULL,
    `dateJournee` DATE NOT NULL,
    `codeArticle` VARCHAR(30) NOT NULL,
    `codeDepot` VARCHAR(30) NOT NULL,
    `codeSociete` VARCHAR(30) NOT NULL,
    `stockInitial` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `receptions` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `ventes` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `retours` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `stockFinalTheorique` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `stockFinalReel` DECIMAL(14, 3) NULL,
    `ecart` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `prixRevient` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `loginAgent` VARCHAR(50) NOT NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `inventaire_ligne_codeDepot_dateJournee_idx`(`codeDepot`, `dateJournee`),
    INDEX `inventaire_ligne_codeArticle_idx`(`codeArticle`),
    PRIMARY KEY (`codeMagasin`, `dateJournee`, `codeArticle`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `inventaire_ligne` ADD CONSTRAINT `inventaire_ligne_codeMagasin_fkey` FOREIGN KEY (`codeMagasin`) REFERENCES `magasin`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventaire_ligne` ADD CONSTRAINT `inventaire_ligne_codeArticle_fkey` FOREIGN KEY (`codeArticle`) REFERENCES `article`(`codeArticle`) ON DELETE RESTRICT ON UPDATE CASCADE;

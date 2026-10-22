-- DropForeignKey
ALTER TABLE `inventaire_ligne` DROP FOREIGN KEY `inventaire_ligne_codeMagasin_fkey`;

-- CreateTable
CREATE TABLE `inventaire` (
    `codeMagasin` VARCHAR(30) NOT NULL,
    `dateJournee` DATE NOT NULL,
    `codeDepot` VARCHAR(30) NOT NULL,
    `statut` ENUM('EN_COURS', 'CLOTURE') NOT NULL DEFAULT 'EN_COURS',
    `dateCloture` DATETIME(3) NULL,
    `loginCloture` VARCHAR(50) NULL,
    `nbReouvertures` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 0,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `inventaire_codeDepot_dateJournee_idx`(`codeDepot`, `dateJournee`),
    INDEX `inventaire_statut_idx`(`statut`),
    PRIMARY KEY (`codeMagasin`, `dateJournee`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventaire_reouverture` (
    `codeMagasin` VARCHAR(30) NOT NULL,
    `dateJournee` DATE NOT NULL,
    `numero` INTEGER NOT NULL,
    `motif` TEXT NOT NULL,
    `loginAdmin` VARCHAR(50) NOT NULL,
    `dateReouverture` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`codeMagasin`, `dateJournee`, `numero`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `inventaire` ADD CONSTRAINT `inventaire_codeMagasin_fkey` FOREIGN KEY (`codeMagasin`) REFERENCES `magasin`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventaire_reouverture` ADD CONSTRAINT `inventaire_reouverture_codeMagasin_dateJournee_fkey` FOREIGN KEY (`codeMagasin`, `dateJournee`) REFERENCES `inventaire`(`codeMagasin`, `dateJournee`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reprise de l'existant : un en-tête « en cours » pour chaque inventaire déjà saisi
INSERT INTO `inventaire` (`codeMagasin`, `dateJournee`, `codeDepot`, `statut`, `creePar`, `dateModification`, `modifiePar`)
SELECT `codeMagasin`, `dateJournee`, MIN(`codeDepot`), 'EN_COURS', 'migration', CURRENT_TIMESTAMP(3), 'migration'
FROM `inventaire_ligne`
GROUP BY `codeMagasin`, `dateJournee`;

-- AddForeignKey
ALTER TABLE `inventaire_ligne` ADD CONSTRAINT `inventaire_ligne_codeMagasin_dateJournee_fkey` FOREIGN KEY (`codeMagasin`, `dateJournee`) REFERENCES `inventaire`(`codeMagasin`, `dateJournee`) ON DELETE RESTRICT ON UPDATE CASCADE;

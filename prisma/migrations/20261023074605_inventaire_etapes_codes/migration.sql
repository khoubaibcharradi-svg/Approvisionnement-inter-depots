-- CreateTable
CREATE TABLE `inventaire_etape` (
    `codeMagasin` VARCHAR(30) NOT NULL,
    `dateJournee` DATE NOT NULL,
    `etape` ENUM('RECEPTIONS', 'VENTES', 'RETOURS') NOT NULL,
    `dateValidation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `loginValidation` VARCHAR(50) NOT NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    PRIMARY KEY (`codeMagasin`, `dateJournee`, `etape`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventaire_code` (
    `codeMagasin` VARCHAR(30) NOT NULL,
    `dateJournee` DATE NOT NULL,
    `etape` ENUM('RECEPTIONS', 'VENTES', 'RETOURS') NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `inventaire_code_code_idx`(`code`),
    PRIMARY KEY (`codeMagasin`, `dateJournee`, `etape`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `inventaire_etape` ADD CONSTRAINT `inventaire_etape_codeMagasin_dateJournee_fkey` FOREIGN KEY (`codeMagasin`, `dateJournee`) REFERENCES `inventaire`(`codeMagasin`, `dateJournee`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventaire_code` ADD CONSTRAINT `inventaire_code_codeMagasin_dateJournee_fkey` FOREIGN KEY (`codeMagasin`, `dateJournee`) REFERENCES `inventaire`(`codeMagasin`, `dateJournee`) ON DELETE RESTRICT ON UPDATE CASCADE;

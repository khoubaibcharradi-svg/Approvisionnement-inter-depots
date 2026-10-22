-- AlterTable
ALTER TABLE `utilisateur` ADD COLUMN `codeDepotAgent` VARCHAR(30) NULL;

-- CreateTable
CREATE TABLE `societe` (
    `code` VARCHAR(30) NOT NULL,
    `libelle` VARCHAR(100) NOT NULL,
    `ordre` INTEGER NOT NULL DEFAULT 0,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `magasin` (
    `code` VARCHAR(30) NOT NULL,
    `libelle` VARCHAR(100) NOT NULL,
    `codeDepot` VARCHAR(30) NOT NULL,
    `codeSociete` VARCHAR(30) NOT NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `magasin_codeDepot_idx`(`codeDepot`),
    INDEX `magasin_codeSociete_idx`(`codeSociete`),
    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compte_rendu` (
    `numero` VARCHAR(20) NOT NULL,
    `codeDepot` VARCHAR(30) NOT NULL,
    `dateJournee` DATE NOT NULL,
    `loginAgent` VARCHAR(50) NOT NULL,
    `statut` ENUM('BROUILLON', 'SOUMIS') NOT NULL DEFAULT 'BROUILLON',
    `justificationEcarts` TEXT NULL,
    `aucunVehicule` BOOLEAN NOT NULL DEFAULT false,
    `observationsRecettes` TEXT NULL,
    `observationsCaisse` TEXT NULL,
    `soldeVeilleDepenses` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `soldeFinalDepenses` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `observationsDepenses` TEXT NULL,
    `etatCameras` TEXT NULL,
    `ressourcesHumaines` TEXT NULL,
    `remarques` TEXT NULL,
    `dateSoumission` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `compte_rendu_dateJournee_idx`(`dateJournee`),
    INDEX `compte_rendu_loginAgent_idx`(`loginAgent`),
    UNIQUE INDEX `compte_rendu_codeDepot_dateJournee_key`(`codeDepot`, `dateJournee`),
    PRIMARY KEY (`numero`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compte_rendu_stock` (
    `numeroCompteRendu` VARCHAR(20) NOT NULL,
    `codeMagasin` VARCHAR(30) NOT NULL,
    `codeSociete` VARCHAR(30) NOT NULL,
    `stockInitial` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `receptions` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `ventes` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `retours` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `stockFinalTheorique` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `stockFinalReel` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `ecart` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `compte_rendu_stock_codeMagasin_idx`(`codeMagasin`),
    PRIMARY KEY (`numeroCompteRendu`, `codeMagasin`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compte_rendu_vehicule` (
    `numeroCompteRendu` VARCHAR(20) NOT NULL,
    `numeroLigne` INTEGER NOT NULL,
    `codeSociete` VARCHAR(30) NOT NULL,
    `vendeurChauffeur` VARCHAR(100) NOT NULL,
    `matricule` VARCHAR(30) NOT NULL,
    `heureEntree` VARCHAR(5) NOT NULL,
    `heureSortie` VARCHAR(5) NULL,
    `observations` VARCHAR(500) NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    PRIMARY KEY (`numeroCompteRendu`, `numeroLigne`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compte_rendu_recette` (
    `numeroCompteRendu` VARCHAR(20) NOT NULL,
    `numeroLigne` INTEGER NOT NULL,
    `agent` VARCHAR(100) NOT NULL,
    `codeSociete` VARCHAR(30) NOT NULL,
    `caComptant` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `recouvrement` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `caCredit` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `recette` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `ecart` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    PRIMARY KEY (`numeroCompteRendu`, `numeroLigne`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compte_rendu_caisse` (
    `numeroCompteRendu` VARCHAR(20) NOT NULL,
    `nature` ENUM('ESPECES', 'CHEQUES', 'TRAITES', 'AUTRES') NOT NULL,
    `precision` VARCHAR(100) NULL,
    `soldeVeille` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `encaissements` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `transferts` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `soldeTheorique` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `soldeReel` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `ecart` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `observations` VARCHAR(500) NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    PRIMARY KEY (`numeroCompteRendu`, `nature`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compte_rendu_depense` (
    `numeroCompteRendu` VARCHAR(20) NOT NULL,
    `numeroLigne` INTEGER NOT NULL,
    `libelle` VARCHAR(200) NOT NULL,
    `debit` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `credit` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `solde` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `validePar` VARCHAR(100) NOT NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    PRIMARY KEY (`numeroCompteRendu`, `numeroLigne`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compte_rendu_piece` (
    `numeroCompteRendu` VARCHAR(20) NOT NULL,
    `numeroPiece` INTEGER NOT NULL,
    `nomFichier` VARCHAR(255) NOT NULL,
    `typeMime` VARCHAR(100) NOT NULL,
    `taille` INTEGER NOT NULL,
    `fichierStocke` VARCHAR(255) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    PRIMARY KEY (`numeroCompteRendu`, `numeroPiece`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `utilisateur_codeDepotAgent_idx` ON `utilisateur`(`codeDepotAgent`);

-- AddForeignKey
ALTER TABLE `utilisateur` ADD CONSTRAINT `utilisateur_codeDepotAgent_fkey` FOREIGN KEY (`codeDepotAgent`) REFERENCES `depot`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `magasin` ADD CONSTRAINT `magasin_codeDepot_fkey` FOREIGN KEY (`codeDepot`) REFERENCES `depot`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `magasin` ADD CONSTRAINT `magasin_codeSociete_fkey` FOREIGN KEY (`codeSociete`) REFERENCES `societe`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compte_rendu` ADD CONSTRAINT `compte_rendu_codeDepot_fkey` FOREIGN KEY (`codeDepot`) REFERENCES `depot`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compte_rendu` ADD CONSTRAINT `compte_rendu_loginAgent_fkey` FOREIGN KEY (`loginAgent`) REFERENCES `utilisateur`(`login`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compte_rendu_stock` ADD CONSTRAINT `compte_rendu_stock_numeroCompteRendu_fkey` FOREIGN KEY (`numeroCompteRendu`) REFERENCES `compte_rendu`(`numero`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compte_rendu_stock` ADD CONSTRAINT `compte_rendu_stock_codeMagasin_fkey` FOREIGN KEY (`codeMagasin`) REFERENCES `magasin`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compte_rendu_vehicule` ADD CONSTRAINT `compte_rendu_vehicule_numeroCompteRendu_fkey` FOREIGN KEY (`numeroCompteRendu`) REFERENCES `compte_rendu`(`numero`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compte_rendu_recette` ADD CONSTRAINT `compte_rendu_recette_numeroCompteRendu_fkey` FOREIGN KEY (`numeroCompteRendu`) REFERENCES `compte_rendu`(`numero`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compte_rendu_caisse` ADD CONSTRAINT `compte_rendu_caisse_numeroCompteRendu_fkey` FOREIGN KEY (`numeroCompteRendu`) REFERENCES `compte_rendu`(`numero`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compte_rendu_depense` ADD CONSTRAINT `compte_rendu_depense_numeroCompteRendu_fkey` FOREIGN KEY (`numeroCompteRendu`) REFERENCES `compte_rendu`(`numero`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compte_rendu_piece` ADD CONSTRAINT `compte_rendu_piece_numeroCompteRendu_fkey` FOREIGN KEY (`numeroCompteRendu`) REFERENCES `compte_rendu`(`numero`) ON DELETE RESTRICT ON UPDATE CASCADE;

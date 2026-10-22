-- CreateTable
CREATE TABLE `role` (
    `code` VARCHAR(30) NOT NULL,
    `libelle` VARCHAR(80) NOT NULL,
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
CREATE TABLE `canal` (
    `code` VARCHAR(30) NOT NULL,
    `libelle` VARCHAR(80) NOT NULL,
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
CREATE TABLE `depot` (
    `code` VARCHAR(30) NOT NULL,
    `libelle` VARCHAR(80) NOT NULL,
    `type` ENUM('CENTRAL', 'REGIONAL') NOT NULL,
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
CREATE TABLE `famille` (
    `code` VARCHAR(60) NOT NULL,
    `libelle` VARCHAR(100) NOT NULL,
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
CREATE TABLE `article` (
    `codeArticle` VARCHAR(30) NOT NULL,
    `designation` VARCHAR(200) NOT NULL,
    `codeFamille` VARCHAR(60) NOT NULL,
    `pcb` INTEGER NULL,
    `ean` VARCHAR(20) NULL,
    `stockPieces` INTEGER NOT NULL DEFAULT 0,
    `quotaPieces` INTEGER NOT NULL DEFAULT 0,
    `rotationCartons` DECIMAL(12, 2) NULL,
    `dateMajStock` DATETIME(3) NULL,
    `sourceStock` VARCHAR(150) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `article_codeFamille_idx`(`codeFamille`),
    INDEX `article_designation_idx`(`designation`),
    INDEX `article_isDeleted_isActif_idx`(`isDeleted`, `isActif`),
    PRIMARY KEY (`codeArticle`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `utilisateur` (
    `login` VARCHAR(50) NOT NULL,
    `nomComplet` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) NULL,
    `codeRole` VARCHAR(30) NOT NULL,
    `motDePasseHash` VARCHAR(100) NOT NULL,
    `doitChangerMotDePasse` BOOLEAN NOT NULL DEFAULT true,
    `dateChangementMotDePasse` DATETIME(3) NULL,
    `nbEchecsConnexion` INTEGER NOT NULL DEFAULT 0,
    `verrouilleJusqua` DATETIME(3) NULL,
    `derniereConnexion` DATETIME(3) NULL,
    `versionSession` INTEGER NOT NULL DEFAULT 0,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `utilisateur_codeRole_idx`(`codeRole`),
    PRIMARY KEY (`login`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affectation` (
    `login` VARCHAR(50) NOT NULL,
    `codeCanal` VARCHAR(30) NOT NULL,
    `codeDepot` VARCHAR(30) NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `affectation_codeCanal_idx`(`codeCanal`),
    INDEX `affectation_codeDepot_idx`(`codeDepot`),
    PRIMARY KEY (`login`, `codeCanal`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demande` (
    `numero` VARCHAR(20) NOT NULL,
    `codeCanal` VARCHAR(30) NOT NULL,
    `codeDepot` VARCHAR(30) NOT NULL,
    `loginSaisie` VARCHAR(50) NOT NULL,
    `statut` ENUM('A_VALIDER', 'A_APPROUVER', 'APPROUVEE', 'EN_PREPARATION', 'EXPEDIEE', 'REJETEE') NOT NULL DEFAULT 'A_VALIDER',
    `etapeRejet` INTEGER NULL,
    `motif` TEXT NULL,
    `dateSaisie` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `version` INTEGER NOT NULL DEFAULT 0,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `demande_statut_dateSaisie_idx`(`statut`, `dateSaisie`),
    INDEX `demande_codeCanal_statut_idx`(`codeCanal`, `statut`),
    INDEX `demande_codeDepot_idx`(`codeDepot`),
    INDEX `demande_loginSaisie_idx`(`loginSaisie`),
    INDEX `demande_dateSaisie_idx`(`dateSaisie`),
    PRIMARY KEY (`numero`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ligne_demande` (
    `numeroDemande` VARCHAR(20) NOT NULL,
    `numeroLigne` INTEGER NOT NULL,
    `codeArticle` VARCHAR(30) NOT NULL,
    `unite` ENUM('PIECE', 'CARTON') NOT NULL,
    `quantiteInitiale` INTEGER NOT NULL,
    `quantite` INTEGER NOT NULL,
    `dateLivraisonSouhaitee` DATE NOT NULL,
    `dateExpeditionPrevue` DATE NULL,
    `decisionDepot` ENUM('ACCORD', 'REFUS', 'MODIFICATION') NULL,
    `motifDecision` VARCHAR(500) NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `ligne_demande_codeArticle_idx`(`codeArticle`),
    PRIMARY KEY (`numeroDemande`, `numeroLigne`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `historique_demande` (
    `numeroDemande` VARCHAR(20) NOT NULL,
    `numeroEvenement` INTEGER NOT NULL,
    `horodatage` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `login` VARCHAR(50) NOT NULL,
    `libelle` TEXT NOT NULL,

    PRIMARY KEY (`numeroDemande`, `numeroEvenement`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demande_modification` (
    `numeroDemande` VARCHAR(20) NOT NULL,
    `numeroModification` INTEGER NOT NULL,
    `loginDemandeur` VARCHAR(50) NOT NULL,
    `codeRoleDemandeur` VARCHAR(30) NOT NULL,
    `statut` ENUM('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE', 'RETIREE', 'ANNULEE') NOT NULL DEFAULT 'EN_ATTENTE',
    `motif` TEXT NOT NULL,
    `resume` TEXT NOT NULL,
    `contenu` JSON NOT NULL,
    `loginDecision` VARCHAR(50) NULL,
    `dateDecision` DATETIME(3) NULL,
    `motifDecision` TEXT NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    INDEX `demande_modification_statut_idx`(`statut`),
    PRIMARY KEY (`numeroDemande`, `numeroModification`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compteur` (
    `cle` VARCHAR(30) NOT NULL,
    `valeur` INTEGER NOT NULL DEFAULT 0,
    `dateModification` DATETIME(3) NOT NULL,

    PRIMARY KEY (`cle`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_fichier` (
    `numero` VARCHAR(20) NOT NULL,
    `type` ENUM('CATALOGUE', 'STOCK') NOT NULL,
    `nomFichier` VARCHAR(255) NOT NULL,
    `login` VARCHAR(50) NOT NULL,
    `nbLignes` INTEGER NOT NULL DEFAULT 0,
    `nbAjoutes` INTEGER NOT NULL DEFAULT 0,
    `nbMisAJour` INTEGER NOT NULL DEFAULT 0,
    `nbIgnores` INTEGER NOT NULL DEFAULT 0,
    `nbQuotasAjustes` INTEGER NOT NULL DEFAULT 0,
    `detail` JSON NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    PRIMARY KEY (`numero`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parametre` (
    `cle` VARCHAR(60) NOT NULL,
    `valeur` VARCHAR(255) NOT NULL,
    `description` VARCHAR(255) NULL,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    PRIMARY KEY (`cle`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_audit` (
    `reference` CHAR(26) NOT NULL,
    `horodatage` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `login` VARCHAR(50) NULL,
    `codeRole` VARCHAR(30) NULL,
    `action` VARCHAR(60) NOT NULL,
    `entite` VARCHAR(40) NULL,
    `cleEntite` VARCHAR(80) NULL,
    `avant` JSON NULL,
    `apres` JSON NULL,
    `detail` TEXT NULL,
    `succes` BOOLEAN NOT NULL DEFAULT true,
    `adresseIp` VARCHAR(45) NULL,
    `userAgent` VARCHAR(255) NULL,

    INDEX `journal_audit_horodatage_idx`(`horodatage`),
    INDEX `journal_audit_login_horodatage_idx`(`login`, `horodatage`),
    INDEX `journal_audit_entite_cleEntite_idx`(`entite`, `cleEntite`),
    INDEX `journal_audit_action_idx`(`action`),
    PRIMARY KEY (`reference`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `article` ADD CONSTRAINT `article_codeFamille_fkey` FOREIGN KEY (`codeFamille`) REFERENCES `famille`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `utilisateur` ADD CONSTRAINT `utilisateur_codeRole_fkey` FOREIGN KEY (`codeRole`) REFERENCES `role`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affectation` ADD CONSTRAINT `affectation_login_fkey` FOREIGN KEY (`login`) REFERENCES `utilisateur`(`login`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affectation` ADD CONSTRAINT `affectation_codeCanal_fkey` FOREIGN KEY (`codeCanal`) REFERENCES `canal`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affectation` ADD CONSTRAINT `affectation_codeDepot_fkey` FOREIGN KEY (`codeDepot`) REFERENCES `depot`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demande` ADD CONSTRAINT `demande_codeCanal_fkey` FOREIGN KEY (`codeCanal`) REFERENCES `canal`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demande` ADD CONSTRAINT `demande_codeDepot_fkey` FOREIGN KEY (`codeDepot`) REFERENCES `depot`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demande` ADD CONSTRAINT `demande_loginSaisie_fkey` FOREIGN KEY (`loginSaisie`) REFERENCES `utilisateur`(`login`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ligne_demande` ADD CONSTRAINT `ligne_demande_numeroDemande_fkey` FOREIGN KEY (`numeroDemande`) REFERENCES `demande`(`numero`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ligne_demande` ADD CONSTRAINT `ligne_demande_codeArticle_fkey` FOREIGN KEY (`codeArticle`) REFERENCES `article`(`codeArticle`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historique_demande` ADD CONSTRAINT `historique_demande_numeroDemande_fkey` FOREIGN KEY (`numeroDemande`) REFERENCES `demande`(`numero`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demande_modification` ADD CONSTRAINT `demande_modification_numeroDemande_fkey` FOREIGN KEY (`numeroDemande`) REFERENCES `demande`(`numero`) ON DELETE RESTRICT ON UPDATE CASCADE;

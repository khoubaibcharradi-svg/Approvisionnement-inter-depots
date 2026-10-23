-- CreateTable
CREATE TABLE `libelle` (
    `domaine` VARCHAR(40) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `libelle` VARCHAR(255) NOT NULL,
    `valeur` VARCHAR(255) NULL,
    `ordre` INTEGER NOT NULL DEFAULT 0,
    `isActif` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creePar` VARCHAR(50) NULL,
    `dateModification` DATETIME(3) NOT NULL,
    `modifiePar` VARCHAR(50) NULL,
    `dateSuppression` DATETIME(3) NULL,
    `supprimePar` VARCHAR(50) NULL,

    PRIMARY KEY (`domaine`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `logo` (
    `code` VARCHAR(30) NOT NULL,
    `libelle` VARCHAR(100) NOT NULL,
    `fichier` VARCHAR(100) NOT NULL,
    `hauteur` INTEGER NOT NULL DEFAULT 40,
    `ordre` INTEGER NOT NULL DEFAULT 0,
    `afficheConnexion` BOOLEAN NOT NULL DEFAULT true,
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
CREATE TABLE `zone_carte` (
    `code` VARCHAR(30) NOT NULL,
    `libelle` VARCHAR(100) NOT NULL,
    `gouvernorats` VARCHAR(255) NOT NULL,
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

-- ───────────── Données initiales (reprises des valeurs jusqu'ici écrites dans le code) ─────────────
INSERT INTO `libelle` (`domaine`, `code`, `libelle`, `valeur`, `ordre`, `creePar`, `dateModification`) VALUES
  ('STATUT_DEMANDE', 'A_VALIDER', 'À valider (Chef de Vente)', NULL, 1, 'migration', CURRENT_TIMESTAMP(3)),
  ('STATUT_DEMANDE', 'A_APPROUVER', 'À approuver (Dir. commercial)', NULL, 2, 'migration', CURRENT_TIMESTAMP(3)),
  ('STATUT_DEMANDE', 'APPROUVEE', 'Approuvée · envoi Radès', NULL, 3, 'migration', CURRENT_TIMESTAMP(3)),
  ('STATUT_DEMANDE', 'EN_PREPARATION', 'En préparation', NULL, 4, 'migration', CURRENT_TIMESTAMP(3)),
  ('STATUT_DEMANDE', 'EXPEDIEE', 'Expédiée', NULL, 5, 'migration', CURRENT_TIMESTAMP(3)),
  ('STATUT_DEMANDE', 'REJETEE', 'Rejetée', NULL, 6, 'migration', CURRENT_TIMESTAMP(3)),
  ('GROUPE_STATUT', 'A_VALIDER', 'À valider', 'A_VALIDER', 1, 'migration', CURRENT_TIMESTAMP(3)),
  ('GROUPE_STATUT', 'A_APPROUVER', 'À approuver', 'A_APPROUVER', 2, 'migration', CURRENT_TIMESTAMP(3)),
  ('GROUPE_STATUT', 'CHEZ_RADES', 'Chez Radès', 'APPROUVEE,EN_PREPARATION', 3, 'migration', CURRENT_TIMESTAMP(3)),
  ('GROUPE_STATUT', 'EXPEDIEES', 'Expédiées', 'EXPEDIEE', 4, 'migration', CURRENT_TIMESTAMP(3)),
  ('GROUPE_STATUT', 'REJETEES', 'Rejetées', 'REJETEE', 5, 'migration', CURRENT_TIMESTAMP(3)),
  ('ETAPE_DEMANDE', '1', 'Superviseur', NULL, 1, 'migration', CURRENT_TIMESTAMP(3)),
  ('ETAPE_DEMANDE', '2', 'Chef de Vente', NULL, 2, 'migration', CURRENT_TIMESTAMP(3)),
  ('ETAPE_DEMANDE', '3', 'Dir. commercial', NULL, 3, 'migration', CURRENT_TIMESTAMP(3)),
  ('ETAPE_DEMANDE', '4', 'Radès', NULL, 4, 'migration', CURRENT_TIMESTAMP(3)),
  ('DECISION_DEPOT', 'ACCORD', '✔ Accord', NULL, 1, 'migration', CURRENT_TIMESTAMP(3)),
  ('DECISION_DEPOT', 'REFUS', '✖ Refus', NULL, 2, 'migration', CURRENT_TIMESTAMP(3)),
  ('DECISION_DEPOT', 'MODIFICATION', '✎ Modifiée', NULL, 3, 'migration', CURRENT_TIMESTAMP(3)),
  ('UNITE', 'PIECE', 'pièce(s)', NULL, 1, 'migration', CURRENT_TIMESTAMP(3)),
  ('UNITE', 'CARTON', 'carton(s)', NULL, 2, 'migration', CURRENT_TIMESTAMP(3)),
  ('NATURE_CAISSE', 'ESPECES', 'Espèces', NULL, 1, 'migration', CURRENT_TIMESTAMP(3)),
  ('NATURE_CAISSE', 'CHEQUES', 'Chèques', NULL, 2, 'migration', CURRENT_TIMESTAMP(3)),
  ('NATURE_CAISSE', 'TRAITES', 'Traites', NULL, 3, 'migration', CURRENT_TIMESTAMP(3)),
  ('NATURE_CAISSE', 'AUTRES', 'Autres', NULL, 4, 'migration', CURRENT_TIMESTAMP(3)),
  ('ETAPE_INVENTAIRE', 'RECEPTIONS', 'Réceptions', NULL, 1, 'migration', CURRENT_TIMESTAMP(3)),
  ('ETAPE_INVENTAIRE', 'VENTES', 'Ventes', NULL, 2, 'migration', CURRENT_TIMESTAMP(3)),
  ('ETAPE_INVENTAIRE', 'RETOURS', 'Retours', NULL, 3, 'migration', CURRENT_TIMESTAMP(3)),
  ('TEXTE', 'NOM_PORTAIL', 'Approvisionnement', NULL, 1, 'migration', CURRENT_TIMESTAMP(3)),
  ('TEXTE', 'SOUS_TITRE_PORTAIL', 'inter-dépôts · Radès', NULL, 2, 'migration', CURRENT_TIMESTAMP(3)),
  ('TEXTE', 'SURTITRE_CONNEXION', 'Portail Promofood', NULL, 3, 'migration', CURRENT_TIMESTAMP(3)),
  ('TEXTE', 'TITRE_CONNEXION', 'Approvisionnement inter-dépôts', NULL, 4, 'migration', CURRENT_TIMESTAMP(3)),
  ('TEXTE', 'ACCROCHE_CONNEXION', 'Un seul portail pour suivre les flux entre Radès et les dépôts de nos cinq zones.', NULL, 5, 'migration', CURRENT_TIMESTAMP(3)),
  ('TEXTE', 'ACCES_CONNEXION', 'Accès réservé au personnel du groupe.', NULL, 6, 'migration', CURRENT_TIMESTAMP(3)),
  ('TEXTE', 'TITRE_LOGOS', 'Les sociétés du groupe', NULL, 7, 'migration', CURRENT_TIMESTAMP(3));

INSERT INTO `logo` (`code`, `libelle`, `fichier`, `hauteur`, `ordre`, `afficheConnexion`, `creePar`, `dateModification`) VALUES
  ('PROMOFOOD', 'Promofood', 'logo-promofood.jpg', 40, 1, true, 'migration', CURRENT_TIMESTAMP(3)),
  ('BEESKY', 'Beesky', 'logo-beesky.jpg', 36, 2, true, 'migration', CURRENT_TIMESTAMP(3)),
  ('NEOLIA', 'Neolia Logistique', 'logo-neolia.jpg', 40, 3, true, 'migration', CURRENT_TIMESTAMP(3)),
  ('PROXIM', 'Proxim Distribution', 'logo-proxim.jpg', 56, 4, true, 'migration', CURRENT_TIMESTAMP(3)),
  ('COFILL', 'COFILL', 'logo-cofill.jpg', 40, 5, true, 'migration', CURRENT_TIMESTAMP(3));

INSERT INTO `zone_carte` (`code`, `libelle`, `gouvernorats`, `ordre`, `creePar`, `dateModification`) VALUES
  ('GRAND_TUNIS', 'Grand Tunis', 'TN-11,TN-12,TN-13,TN-14', 1, 'migration', CURRENT_TIMESTAMP(3)),
  ('CAP_BON', 'Cap Bon', 'TN-21', 2, 'migration', CURRENT_TIMESTAMP(3)),
  ('SOUSSE', 'Sousse', 'TN-51', 3, 'migration', CURRENT_TIMESTAMP(3)),
  ('SFAX', 'Sfax', 'TN-61', 4, 'migration', CURRENT_TIMESTAMP(3)),
  ('JENDOUBA', 'Jendouba', 'TN-32', 5, 'migration', CURRENT_TIMESTAMP(3));

INSERT INTO `parametre` (`cle`, `valeur`, `description`, `creePar`, `dateModification`)
SELECT 'LOGO_ESPACE_DEPOTS', 'NEOLIA', 'Code du logo affiché aux agents dépôt et à la consultation des comptes rendus', 'migration', CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `parametre` WHERE `cle` = 'LOGO_ESPACE_DEPOTS');
INSERT INTO `parametre` (`cle`, `valeur`, `description`, `creePar`, `dateModification`)
SELECT 'LOGO_ESPACE_DEFAUT', 'PROMOFOOD', 'Code du logo affiché aux autres rôles', 'migration', CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `parametre` WHERE `cle` = 'LOGO_ESPACE_DEFAUT');

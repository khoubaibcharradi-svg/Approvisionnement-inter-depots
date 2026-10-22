-- ============================================================================
-- Anonymisation d'une copie de la base de PRODUCTION chargée dans la base de TEST.
-- NE JAMAIS EXÉCUTER SUR LA PRODUCTION.
-- Usage : deploy/copier-prod-vers-test.sh (qui l'exécute sur la base de test uniquement).
-- Effet :
--   - identifiants et noms des utilisateurs remplacés (sup01, cv01, agent01…), « admin » conservé ;
--   - tous les mots de passe remplacés par : Recette2026!
--   - noms des chauffeurs / vendeurs / valideurs remplacés (Chauffeur 001…) ;
--   - textes libres pouvant contenir des noms (ressources humaines, remarques) masqués ;
--   - journal d'audit vidé (il contient identifiants, adresses IP et valeurs avant/après).
-- ============================================================================
SET NAMES utf8mb4;

-- Garde-fou : sur une base dont le nom ne contient pas « test », la sous-requête renvoie 2 lignes
-- et MySQL arrête le script (erreur 1242 « Subquery returns more than 1 row ») avant toute modification.
DO (SELECT 1 FROM (SELECT 1 AS x UNION ALL SELECT 2) AS garde_base_non_test WHERE DATABASE() NOT LIKE '%test%');

START TRANSACTION;

-- 1. Correspondance des identifiants
DROP TABLE IF EXISTS zz_anon_login;
CREATE TABLE zz_anon_login (ancien VARCHAR(50) PRIMARY KEY, nouveau VARCHAR(50) NOT NULL UNIQUE, nom VARCHAR(100) NOT NULL);
INSERT INTO zz_anon_login (ancien, nouveau, nom)
SELECT login,
       CONCAT(CASE codeRole WHEN 'SUPERVISEUR' THEN 'sup' WHEN 'CHEF_VENTE' THEN 'cv' WHEN 'DIRECTEUR_COMMERCIAL' THEN 'dc'
                            WHEN 'DIRECTEUR_LOGISTIQUE' THEN 'dl' WHEN 'CHEF_DEPOT' THEN 'cdep' WHEN 'AGENT_DEPOT' THEN 'agent' ELSE 'adm' END,
              LPAD(ROW_NUMBER() OVER (PARTITION BY codeRole ORDER BY login), 2, '0')),
       CONCAT((SELECT r.libelle FROM role r WHERE r.code = u.codeRole), ' ', LPAD(ROW_NUMBER() OVER (PARTITION BY codeRole ORDER BY login), 2, '0'))
FROM utilisateur u WHERE login <> 'admin';

-- 2. Identifiants recopiés dans les colonnes de traçabilité (hors clés étrangères)
UPDATE `affectation` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `affectation` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `affectation` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `article` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `article` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `article` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `canal` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `canal` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `canal` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `compte_rendu` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `compte_rendu` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `compte_rendu` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `compte_rendu_caisse` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `compte_rendu_caisse` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `compte_rendu_caisse` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `compte_rendu_depense` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `compte_rendu_depense` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `compte_rendu_depense` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `compte_rendu_piece` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `compte_rendu_piece` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `compte_rendu_piece` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `compte_rendu_recette` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `compte_rendu_recette` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `compte_rendu_recette` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `compte_rendu_stock` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `compte_rendu_stock` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `compte_rendu_stock` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `compte_rendu_vehicule` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `compte_rendu_vehicule` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `compte_rendu_vehicule` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `demande` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `demande` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `demande` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `demande_modification` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `demande_modification` x JOIN zz_anon_login m ON x.`loginDecision` = m.ancien SET x.`loginDecision` = m.nouveau;
UPDATE `demande_modification` x JOIN zz_anon_login m ON x.`loginDemandeur` = m.ancien SET x.`loginDemandeur` = m.nouveau;
UPDATE `demande_modification` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `demande_modification` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `depot` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `depot` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `depot` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `famille` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `famille` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `famille` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `historique_demande` x JOIN zz_anon_login m ON x.`login` = m.ancien SET x.`login` = m.nouveau;
UPDATE `import_fichier` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `import_fichier` x JOIN zz_anon_login m ON x.`login` = m.ancien SET x.`login` = m.nouveau;
UPDATE `import_fichier` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `import_fichier` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `inventaire` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `inventaire` x JOIN zz_anon_login m ON x.`loginCloture` = m.ancien SET x.`loginCloture` = m.nouveau;
UPDATE `inventaire` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `inventaire` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `inventaire_ligne` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `inventaire_ligne` x JOIN zz_anon_login m ON x.`loginAgent` = m.ancien SET x.`loginAgent` = m.nouveau;
UPDATE `inventaire_ligne` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `inventaire_ligne` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `inventaire_reouverture` x JOIN zz_anon_login m ON x.`loginAdmin` = m.ancien SET x.`loginAdmin` = m.nouveau;
UPDATE `ligne_demande` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `ligne_demande` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `ligne_demande` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `magasin` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `magasin` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `magasin` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `parametre` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `parametre` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `parametre` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `role` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `role` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `role` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `societe` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `societe` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `societe` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `utilisateur` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `utilisateur` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `utilisateur` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;
UPDATE `vehicule` x JOIN zz_anon_login m ON x.`creePar` = m.ancien SET x.`creePar` = m.nouveau;
UPDATE `vehicule` x JOIN zz_anon_login m ON x.`modifiePar` = m.ancien SET x.`modifiePar` = m.nouveau;
UPDATE `vehicule` x JOIN zz_anon_login m ON x.`supprimePar` = m.ancien SET x.`supprimePar` = m.nouveau;

-- 3. Utilisateurs (les clés étrangères suivent par ON UPDATE CASCADE)
UPDATE utilisateur u JOIN zz_anon_login m ON u.login = m.ancien
   SET u.login = m.nouveau, u.nomComplet = m.nom, u.email = IF(u.email IS NULL, NULL, CONCAT(m.nouveau, '@recette.invalid'));
UPDATE utilisateur SET motDePasseHash = '$2b$12$LYbVoMMQllpw86cc5lSPDunD6uQAs7BvEJe5Lrvn/O91A9m1rB1va', doitChangerMotDePasse = 0, nbEchecsConnexion = 0, verrouilleJusqua = NULL, versionSession = versionSession + 1;

-- 4. Chauffeurs, vendeurs et valideurs
DROP TABLE IF EXISTS zz_anon_nom;
CREATE TABLE zz_anon_nom (ancien VARCHAR(100) PRIMARY KEY, nouveau VARCHAR(100) NOT NULL);
INSERT INTO zz_anon_nom (ancien, nouveau)
SELECT nom, CONCAT('Chauffeur ', LPAD(ROW_NUMBER() OVER (ORDER BY nom), 3, '0')) FROM (
  SELECT chauffeurHabituel AS nom FROM vehicule WHERE chauffeurHabituel IS NOT NULL
  UNION SELECT vendeurChauffeur FROM compte_rendu_vehicule
  UNION SELECT agent FROM compte_rendu_recette
) n WHERE nom <> '';
UPDATE vehicule v JOIN zz_anon_nom m ON v.chauffeurHabituel = m.ancien SET v.chauffeurHabituel = m.nouveau;
UPDATE compte_rendu_vehicule v JOIN zz_anon_nom m ON v.vendeurChauffeur = m.ancien SET v.vendeurChauffeur = m.nouveau;
UPDATE compte_rendu_recette r JOIN zz_anon_nom m ON r.agent = m.ancien SET r.agent = m.nouveau;
UPDATE compte_rendu_depense SET validePar = 'Valideur';

-- 5. Textes libres pouvant contenir des noms
UPDATE compte_rendu SET ressourcesHumaines = IF(ressourcesHumaines IS NULL, NULL, '[anonymisé]'), remarques = IF(remarques IS NULL, NULL, '[anonymisé]');
UPDATE historique_demande SET libelle = REGEXP_REPLACE(libelle, ' \\([^)]*\\)$', '');

-- 6. Journal d'audit
DELETE FROM journal_audit;

DROP TABLE zz_anon_login;
DROP TABLE zz_anon_nom;
COMMIT;

SELECT login, nomComplet, codeRole FROM utilisateur ORDER BY codeRole, login;

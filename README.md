# Approvisionnement inter-dépôts

Portail d'approvisionnement commercial et de traçabilité inter-dépôts (dépôt central de Radès et dépôts régionaux).
Il remplace le prototype HTML validé et applique le cahier des charges v2.0.

**Stack** : Next.js 16 (App Router, Server Actions) · TypeScript · MySQL 8 · Prisma 6 · Tailwind CSS 4 · Vitest.

## Démarrage

Prérequis : Node.js 22 et un serveur MySQL 8 (base créée en `utf8mb4`).

```bash
npm install
cp .env.example .env          # renseigner DATABASE_URL, SESSION_SECRET, SEED_MOT_DE_PASSE_INITIAL
npx prisma migrate deploy     # crée les tables
npm run db:seed               # charge le fichier de paramétrage (articles, stock, rotation, utilisateurs)
npm run dev                   # http://localhost:3000
```

Le fichier de paramétrage (`prisma/data/parametrage.xlsx` par défaut, ou `SEED_FICHIER`) contient des données internes : il n'est pas versionné et doit être déposé à la main sur le serveur. Feuilles attendues : Produits, Ventes, Stock, Famille, Responsables, Dépôts.

Production : `npm run build` puis `npm start`. Mise en ligne sur un serveur (OVH) : voir `docs/DEPLOIEMENT-OVH.md`. Branches `dev` → `test` → `prod` : voir `docs/BRANCHES.md`.

Commandes utiles :

| Commande | Rôle |
|---|---|
| `npm test` | Tests des règles de gestion (workflow, quotas, unités) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run db:migrate` | Nouvelle migration après modification de `prisma/schema.prisma` (développement) |
| `npm run db:backup` | Sauvegarde texte de la base |
| `npm run db:restore -- <fichier> --confirmer` | Restauration (une sauvegarde de l'état courant est faite avant) |

### Comptes

Le seed crée un compte par responsable de la feuille « Responsables » : identifiant `prenom.initiale` (ex. « Ali B » → `ali.b`), plus un compte `admin`.
Tous démarrent avec `SEED_MOT_DE_PASSE_INITIAL` et **doivent le changer à la première connexion**.

## Base de données

### Clés métier

Aucun identifiant technique auto-incrémenté : chaque table a pour clé primaire sa clé métier.

| Table | Clé primaire |
|---|---|
| `article` | `codeArticle` (ex. `P101001`) |
| `canal`, `depot`, `famille`, `role` | `code` (ex. `GMS`, `RADES`, `CHIPS`, `CHEF_VENTE`) |
| `utilisateur` | `login` |
| `affectation` | (`login`, `codeCanal`) |
| `demande` | `numero` (`DA-000001`, généré par la table `compteur`) |
| `ligne_demande` | (`numeroDemande`, `numeroLigne`) |
| `historique_demande` | (`numeroDemande`, `numeroEvenement`) |
| `demande_modification` | (`numeroDemande`, `numeroModification`) |
| `import_fichier` | `numero` (`IMP-000001`) |
| `parametre` | `cle` |
| `journal_audit` | `reference` (ULID horodaté : un événement n'a pas de clé métier naturelle) |

Les clés étrangères sont en `ON UPDATE CASCADE` : le Directeur commercial peut renommer un code SKU, et les lignes de demande suivent.

### Cycle de vie des lignes

Chaque table de référence ou de transaction porte :

`isActif`, `isDeleted`, `dateCreation`, `creePar`, `dateModification`, `modifiePar`, `dateSuppression`, `supprimePar`.

- **Suppression logique uniquement.** Le client Prisma (`src/lib/prisma.ts`) exclut automatiquement `isDeleted = true` de toutes les lectures et **interdit** `delete`/`deleteMany`. Pour supprimer, on fait un `update` avec `champsSuppression(login)`.
- `isActif = false` désactive sans supprimer : un article inactif n'est plus proposé à la saisie, un utilisateur inactif ne peut plus se connecter.
- Les relations chargées par `include` ne sont pas filtrées automatiquement : on y ajoute `where: { isDeleted: false }`.
- `journal_audit` et `historique_demande` sont en **ajout seul** (journal inaltérable) : ils n'ont pas de colonnes de suppression.

### Accès concurrents (≈ 60 utilisateurs)

- `demande.version` et `article.version` assurent un **verrouillage optimiste**. Si deux personnes agissent en même temps sur la même demande, la seconde reçoit « modifiée par un autre utilisateur, rechargez la page » au lieu d'écraser la première.
- Les numéros `DA-…` sont attribués dans une transaction sur la table `compteur` : pas de doublon même avec des saisies simultanées.
- Le pool de connexions se règle dans `DATABASE_URL` (`connection_limit=20`). Les index couvrent les listes par statut, canal, dépôt, saisisseur et date.

## Sécurité et droits

- Les mots de passe sont hachés avec bcrypt (coût 12). Politique : au moins 10 caractères, avec une majuscule, une minuscule et un chiffre ; ils sont modifiables via la table `parametre`.
- Le compte est verrouillé 15 minutes après 5 échecs. L'administrateur peut déverrouiller le compte ou réinitialiser le mot de passe : un mot de passe temporaire est affiché une seule fois.
- La session est un cookie `httpOnly` signé (HS256). L'utilisateur est **relu en base à chaque requête** : un compte désactivé, supprimé ou dont le mot de passe a changé perd immédiatement ses sessions.
- **Le cloisonnement est appliqué côté serveur**, pas seulement dans l'interface :
  - le superviseur ne voit que ses demandes, et le chef de vente que son circuit (filtre SQL, `src/lib/demandes/lecture.ts`) ;
  - le stock et les quotas ne sont jamais chargés pour un superviseur ou un chef de vente ;
  - chaque action revérifie les règles (`src/lib/workflow.ts`) avant d'écrire.

Les règles du cahier des charges (RG-01 à RG-08) sont regroupées dans `src/lib/workflow.ts` et testées dans `src/lib/workflow.test.ts`.

## Journalisation (obligatoire)

Deux niveaux complémentaires :

1. **Fichier de log** : `logs/app-AAAA-MM-JJ.log`, un fichier par jour, une ligne JSON par événement (connexions, actions, imports, sauvegardes, erreurs). Les erreurs sont aussi copiées dans `logs/erreurs-AAAA-MM-JJ.log`. Conservation : `LOG_RETENTION_JOURS` (5 ans par défaut, cf. §6 du cahier des charges).
2. **Journal d'audit en base** (`journal_audit`) : qui, quand, quoi, valeurs avant et après, adresse IP. Les connexions réussies ou échouées, les accès refusés et les tentatives hors droits y figurent aussi. Il est consultable dans le menu « Journal d'audit ».

Chaque événement d'audit est écrit à la fois dans la base (dans la même transaction que la modification) et dans le fichier. Les fichiers de log sont téléchargeables par l'administrateur (menu « Sauvegardes »).

## Sauvegardes (fichier texte)

- **Format** : `backups/sauvegarde-AAAAMMJJ-HHMMSS.sql.txt`. C'est un fichier texte lisible, composé d'instructions `INSERT` (une par ligne, toutes les tables). Un fichier `.sha256` l'accompagne pour contrôler son intégrité.
- **Automatique** : chaque jour à `BACKUP_HEURE` (02:00 par défaut), lancée par le serveur. Les sauvegardes de plus de `BACKUP_RETENTION_JOURS` jours sont ensuite purgées.
  - Si plusieurs instances tournent : mettre `BACKUP_AUTO=false` et planifier `npm run db:backup` par cron.
- **Manuelle** : bouton dans « Sauvegardes » (administrateur), ou `npm run db:backup`.
- **Restauration** : `npm run db:restore -- <fichier> --confirmer`. Le script vérifie l'empreinte SHA-256 et le marqueur de fin, sauvegarde l'état courant, puis rejoue le fichier dans une transaction.
- **Important** : copier régulièrement le dossier `backups/` sur un autre serveur ou un stockage externe. Une sauvegarde qui reste sur la même machine ne protège pas contre une panne de disque.

## Comptes rendus journaliers des dépôts (ENR-08)

Le module numérise le formulaire papier « Compte rendu journalier dépôt ».

- **Rôle `AGENT_DEPOT`** : l'agent est rattaché à **un dépôt**, choisi dans « Utilisateurs ». Il n'a accès qu'à « Compte rendu journalier », « Historique » et « Mon mot de passe ». Les demandes, le catalogue et l'administration lui sont refusés côté serveur, et chaque tentative est auditée.
- **Magasins** (menu « Magasins », administrateur) : chaque magasin appartient à un dépôt et à une société (Promofood, Beesky, Proxim, COFILL…). Les magasins actifs d'un dépôt forment les lignes « situation du stock » de son compte rendu.
- **Véhicules** (menu « Véhicules », administrateur) : chaque véhicule (clé : matricule) est rattaché à une agence, c'est-à-dire à un magasin, donc à un dépôt et à une société. Dans son compte rendu, l'agent choisit les véhicules traités dans la liste de son dépôt. La société, l'agence et le chauffeur habituel sont repris du référentiel, et le serveur refuse tout véhicule hors liste.
- **Véhicules gérés par l'agent** (menu « Véhicules » de l'agent) : l'agent ajoute des véhicules dans les agences de son dépôt, modifie leur description et leur chauffeur habituel, et les désactive ou les réactive. Le serveur contrôle le périmètre et audite les refus. La suppression reste réservée à l'administrateur. Un véhicule désactivé n'est plus proposé, mais il reste valable dans un compte rendu où il était déjà saisi.
- **Caisse recettes** : l'agent de chaque ligne est un **chauffeur**, choisi parmi les chauffeurs des véhicules du dépôt et ceux des véhicules traités ce jour. La société est pré-remplie, et le serveur refuse un nom hors liste.
- **Un compte rendu par dépôt et par jour** (`CR-000001`). L'agent peut saisir aujourd'hui et les `CR_JOURS_RETARD_MAX` jours précédents (3 par défaut). Il l'enregistre d'abord en **brouillon**, puis le **soumet**. Une fois soumis, le compte rendu n'est plus modifiable.
- **Complétude contrôlée à la soumission**, côté serveur (`src/lib/compte-rendu/calculs.ts`). Tous les montants et toutes les rubriques doivent être renseignés (« RAS » accepté pour les textes). Une justification est obligatoire pour tout écart. Il faut au moins un véhicule, ou cocher « aucun véhicule ». L'état de stock système doit être annexé (`CR_PIECE_OBLIGATOIRE`).
- **Calculs refaits par le serveur**, en millimes :
  - stock théorique = initial + réceptions − ventes + retours ;
  - écart de recette = recette − (comptant + recouvrement) ;
  - caisse : D = A + B − C, et écart = E − D ;
  - solde courant des dépenses.
- **Continuité** : le stock initial, les soldes veille de caisse et le solde veille des dépenses sont repris du dernier compte rendu soumis du dépôt. Ils ne sont pas modifiables.
- **Consultation réservée à l'administrateur** (« Comptes rendus dépôts ») :
  - filtres : date de début, date de fin, dépôt, magasin, agent, statut ;
  - écarts en rouge ;
  - alerte sur les dépôts sans compte rendu soumis la veille ;
  - détail complet et téléchargement des annexes.
- **Inventaire en quantités** (menu « Inventaire » de l'agent) :
  - une ligne par article de la table `article`, pour chaque magasin du dépôt, en pièces ;
  - colonnes : société et magasin (grisés), code, désignation, stock initial, réceptions, ventes, retours, stock final théorique et stock final réel (saisie libre) ;
  - le stock initial est le stock final réel du dernier inventaire du magasin, et il est verrouillé ;
  - tout article avec du stock ou un mouvement doit être compté avant de soumettre le compte rendu.
- **Clôture de l'inventaire** : l'agent enregistre, puis clique sur « Clôturer l'inventaire ». La clôture n'est possible que si tous les articles concernés sont comptés. Ensuite, tout l'inventaire est grisé, et **seuls les inventaires clôturés alimentent le compte rendu**.
- **Réouverture exceptionnelle** : seul l'administrateur peut rouvrir un inventaire, depuis le menu « Inventaires » (filtres, détail, écart valorisé), avec un motif obligatoire.
  - L'historique `inventaire_reouverture` est conservé et visible par l'agent, et chaque réouverture est auditée.
  - Si le compte rendu de la journée était soumis, il repasse en brouillon pour être resoumis.
  - Une journée rouverte reste accessible à l'agent même hors de la fenêtre normale de saisie.
- **Situation du stock calculée** : avec `CR_INVENTAIRE_OBLIGATOIRE = 1` (valeur par défaut), chaque ligne du bloc « situation du stock » vaut la somme des quantités × prix de revient (`article.prixRevient`, en dinars par pièce). Le prix est saisi dans le catalogue ou importé par le Directeur logistique ou l'administrateur, et il est figé sur la ligne d'inventaire au moment de la saisie. Le détail de l'inventaire est consultable dans la fiche du compte rendu.
- **Pièces jointes par rubrique** : états de stock (obligatoire), caisse recettes (bordereaux…) et caisse dépenses (justificatifs). Le fichier est envoyé dès qu'il est choisi. Les fichiers sont stockés dans `PIECES_DIR` (`./pieces-jointes`), avec leur empreinte SHA-256 en base. **Ce dossier doit être sauvegardé avec `backups/`** : la sauvegarde texte ne contient que la base.

## Structure

```
prisma/schema.prisma          Schéma MySQL (clés métier, cycle de vie)
prisma/seed.ts                Chargement du fichier de paramétrage
src/lib/workflow.ts           Règles de gestion (pures, testées)
src/lib/demandes/service.ts   Actions métier : transaction, contrôle de version, historique, audit
src/lib/demandes/lecture.ts   Requêtes filtrées par droits
src/lib/journal.ts            Fichiers de log
src/lib/audit.ts              Journal d'audit (base et fichier)
src/lib/sauvegarde.ts         Sauvegarde et restauration texte
src/lib/auth/                 Mots de passe, jeton, session
src/app/(portail)/            Pages : demandes, catalogue, audit, statistiques, administration
scripts/                      Sauvegarde et restauration en ligne de commande
```

## Reste à réaliser (cahier des charges §8)

- Module 7 : réception, écarts, photos de casse et avoirs.
- Notifications par e-mail, SMS ou push (aujourd'hui, une trace dans l'historique de la demande).
- Synchronisation automatique avec l'ERP par API (aujourd'hui, import Excel/CSV du stock et du catalogue).
- Mode hors-ligne (PWA) pour les superviseurs.
- Fenêtre de saisie par canal, allocation prioritaire en cas de rupture, OTIF.
- Points à valider (§10) : stock par dépôt ou stock unique, formule de rotation, unité du stock ERP, retour au Directeur commercial après modification par Radès.

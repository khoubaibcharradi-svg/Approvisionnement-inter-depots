import type { StatutDemande } from "@prisma/client";

export const ROLES = {
  SUPERVISEUR: "SUPERVISEUR",
  CHEF_VENTE: "CHEF_VENTE",
  DIRECTEUR_COMMERCIAL: "DIRECTEUR_COMMERCIAL",
  DIRECTEUR_LOGISTIQUE: "DIRECTEUR_LOGISTIQUE",
  CHEF_DEPOT: "CHEF_DEPOT",
  ADMINISTRATEUR: "ADMINISTRATEUR",
  AGENT_DEPOT: "AGENT_DEPOT",
} as const;

export type CodeRole = (typeof ROLES)[keyof typeof ROLES];

export const LIBELLES_ROLES: Record<CodeRole, string> = {
  SUPERVISEUR: "Superviseur",
  CHEF_VENTE: "Chef de Vente",
  DIRECTEUR_COMMERCIAL: "Directeur commercial",
  DIRECTEUR_LOGISTIQUE: "Directeur logistique",
  CHEF_DEPOT: "Chef dépôt Radès",
  ADMINISTRATEUR: "Administrateur (DGA)",
  AGENT_DEPOT: "Agent dépôt",
};

/** Page d'accueil selon le rôle : l'agent dépôt n'a accès qu'au compte rendu journalier. */
export const accueilDuRole = (role: CodeRole) => (role === ROLES.AGENT_DEPOT ? "/compte-rendu" : "/demandes");

export const SOCIETES_DEFAUT = [
  { code: "PROMOFOOD", libelle: "Promofood" },
  { code: "BEESKY", libelle: "Beesky" },
  { code: "PROXIM", libelle: "Proxim" },
  { code: "COFILL", libelle: "COFILL" },
];

export const LIBELLES_STATUTS: Record<StatutDemande, string> = {
  A_VALIDER: "À valider (Chef de Vente)",
  A_APPROUVER: "À approuver (Dir. commercial)",
  APPROUVEE: "Approuvée · envoi Radès",
  EN_PREPARATION: "En préparation",
  EXPEDIEE: "Expédiée",
  REJETEE: "Rejetée",
};

/** Groupes d'affichage de la liste des demandes (module 3). */
export const GROUPES_STATUTS: { titre: string; statuts: StatutDemande[] }[] = [
  { titre: "À valider", statuts: ["A_VALIDER"] },
  { titre: "À approuver", statuts: ["A_APPROUVER"] },
  { titre: "Chez Radès", statuts: ["APPROUVEE", "EN_PREPARATION"] },
  { titre: "Expédiées", statuts: ["EXPEDIEE"] },
  { titre: "Rejetées", statuts: ["REJETEE"] },
];

/** Rôles qui voient le stock et les quotas. */
export const ROLES_VOIENT_STOCK: readonly string[] = [
  ROLES.ADMINISTRATEUR,
  ROLES.DIRECTEUR_COMMERCIAL,
  ROLES.DIRECTEUR_LOGISTIQUE,
  ROLES.CHEF_DEPOT,
];

/** Rôles qui voient le bloc d'aide à la décision (rotation, stock, demandes en instance). */
export const ROLES_AIDE_DECISION = ROLES_VOIENT_STOCK;

export const PARAMETRES_DEFAUT: Record<string, { valeur: string; description: string }> = {
  MAX_ECHECS_CONNEXION: { valeur: "5", description: "Échecs de connexion consécutifs avant verrouillage du compte" },
  DUREE_VERROUILLAGE_MINUTES: { valeur: "15", description: "Durée du verrouillage après trop d'échecs" },
  MDP_LONGUEUR_MIN: { valeur: "10", description: "Longueur minimale des mots de passe" },
  CR_JOURS_RETARD_MAX: { valeur: "3", description: "Nombre de jours passés pour lesquels un agent peut encore saisir un compte rendu" },
  CR_PIECE_OBLIGATOIRE: { valeur: "1", description: "1 = l'état de stock système doit être annexé avant de soumettre un compte rendu" },
  CR_INVENTAIRE_OBLIGATOIRE: { valeur: "1", description: "1 = la situation du stock est calculée depuis l'inventaire en quantités de chaque magasin (obligatoire pour soumettre)" },
};

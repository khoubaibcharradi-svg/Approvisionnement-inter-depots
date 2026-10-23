
export const ROLES = {
  SUPERVISEUR: "SUPERVISEUR",
  CHEF_VENTE: "CHEF_VENTE",
  DIRECTEUR_COMMERCIAL: "DIRECTEUR_COMMERCIAL",
  DIRECTEUR_LOGISTIQUE: "DIRECTEUR_LOGISTIQUE",
  CHEF_DEPOT: "CHEF_DEPOT",
  ADMINISTRATEUR: "ADMINISTRATEUR",
  AGENT_DEPOT: "AGENT_DEPOT",
  CONSULTANT_CR: "CONSULTANT_CR",
} as const;

export type CodeRole = (typeof ROLES)[keyof typeof ROLES];


/** Rôles sans accès au circuit des demandes : l'agent dépôt saisit le compte rendu, le consultant le lit. */
export const ROLES_HORS_DEMANDES: readonly CodeRole[] = [ROLES.AGENT_DEPOT, ROLES.CONSULTANT_CR];

/** Rôles qui consultent les comptes rendus de tous les dépôts (lecture seule pour le consultant). */
export const ROLES_LECTURE_COMPTES_RENDUS: CodeRole[] = [ROLES.ADMINISTRATEUR, ROLES.CONSULTANT_CR];

/** Page d'accueil selon le rôle. */
export const accueilDuRole = (role: CodeRole) =>
  role === ROLES.AGENT_DEPOT ? "/compte-rendu" : role === ROLES.CONSULTANT_CR ? "/admin/comptes-rendus" : "/demandes";




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

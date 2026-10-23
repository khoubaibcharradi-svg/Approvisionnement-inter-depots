import type { StatutDemande, Unite } from "@prisma/client";
import { ROLES, ROLES_HORS_DEMANDES, estAdministrateur, type CodeRole } from "./constantes";

/**
 * Règles de gestion du workflow (cahier des charges §4), sans accès à la base :
 * elles sont appliquées côté serveur avant chaque action et testées unitairement.
 */

export type Acteur = { login: string; role: CodeRole; canaux: string[] };

export type EtatDemande = {
  loginSaisie: string;
  codeCanal: string;
  statut: StatutDemande;
  etapeRejet: number | null;
  /** Demande de modification en attente (RG-04), s'il y en a une. */
  modificationEnAttente: { loginDemandeur: string } | null;
};

/** Étapes de rejet : 1 Chef de Vente, 2 Directeur commercial, 3 Chef dépôt Radès. */
export const ETAPE_REJET = { CHEF_VENTE: 1, DIRECTEUR_COMMERCIAL: 2, RADES: 3 } as const;

/** Visibilité (§3) : le superviseur voit ses demandes, le chef de vente son circuit, les autres tout. */
export function peutVoir(a: Acteur, d: EtatDemande) {
  if (ROLES_HORS_DEMANDES.includes(a.role)) return false;
  if (a.role === ROLES.SUPERVISEUR) return d.loginSaisie === a.login;
  if (a.role === ROLES.CHEF_VENTE) return a.canaux.includes(d.codeCanal);
  return true;
}

/** Détenteur de la demande selon son statut (§4). */
export function detenteur(statut: StatutDemande): CodeRole | null {
  switch (statut) {
    case "A_VALIDER":
      return ROLES.CHEF_VENTE;
    case "A_APPROUVER":
      return ROLES.DIRECTEUR_COMMERCIAL;
    case "APPROUVEE":
      return ROLES.CHEF_DEPOT;
    default:
      return null;
  }
}

/** Valider/approuver ou rejeter à son étape. */
export function peutValiderOuRejeter(a: Acteur, d: EtatDemande) {
  if (!peutVoir(a, d)) return false;
  return (
    (a.role === ROLES.CHEF_VENTE && d.statut === "A_VALIDER") ||
    (a.role === ROLES.DIRECTEUR_COMMERCIAL && d.statut === "A_APPROUVER")
  );
}

export function statutApresValidation(statut: StatutDemande): StatutDemande {
  if (statut === "A_VALIDER") return "A_APPROUVER";
  if (statut === "A_APPROUVER") return "APPROUVEE";
  throw new Error(`Validation impossible au statut ${statut}`);
}

export function etapeDeRejet(statut: StatutDemande) {
  if (statut === "A_VALIDER") return ETAPE_REJET.CHEF_VENTE;
  if (statut === "A_APPROUVER") return ETAPE_REJET.DIRECTEUR_COMMERCIAL;
  throw new Error(`Rejet impossible au statut ${statut}`);
}

/**
 * Modification directe des quantités / dates :
 * - Superviseur : sa demande tant que le Chef de Vente ne l'a pas traitée (dates de livraison) ;
 * - Chef de Vente, Directeur commercial : à leur étape (dates d'expédition, motif obligatoire, RG-03) ;
 * - Chef dépôt Radès : pendant la préparation (dates d'expédition).
 */
export function peutModifier(a: Acteur, d: EtatDemande) {
  if (!peutVoir(a, d)) return false;
  return (
    (a.role === ROLES.SUPERVISEUR && d.statut === "A_VALIDER" && d.loginSaisie === a.login) ||
    (a.role === ROLES.CHEF_VENTE && d.statut === "A_VALIDER") ||
    (a.role === ROLES.DIRECTEUR_COMMERCIAL && d.statut === "A_APPROUVER") ||
    (a.role === ROLES.CHEF_DEPOT && d.statut === "EN_PREPARATION")
  );
}

/** RG-03 : le motif est obligatoire pour toute modification faite par un supérieur. */
export const motifObligatoirePourModification = (a: Acteur) => a.role !== ROLES.SUPERVISEUR;

/**
 * RG-02 : un responsable peut annuler sa décision tant que son supérieur n'a pas agi.
 * Retourne le statut auquel la demande revient, ou null si l'annulation est impossible.
 */
export function statutApresAnnulation(a: Acteur, d: EtatDemande): StatutDemande | null {
  if (!peutVoir(a, d)) return null;
  if (a.role === ROLES.CHEF_VENTE) {
    if (d.statut === "A_APPROUVER") return "A_VALIDER";
    if (d.statut === "REJETEE" && d.etapeRejet === ETAPE_REJET.CHEF_VENTE) return "A_VALIDER";
  }
  if (a.role === ROLES.DIRECTEUR_COMMERCIAL) {
    if (d.statut === "APPROUVEE") return "A_APPROUVER";
    if (d.statut === "REJETEE" && d.etapeRejet === ETAPE_REJET.DIRECTEUR_COMMERCIAL) return "A_APPROUVER";
  }
  return null;
}

/**
 * RG-04 : tout responsable (hors administrateur) peut émettre une demande de modification
 * tant que la demande n'est pas en préparation, s'il n'en est pas le détenteur
 * et ne peut pas la modifier directement. Une seule demande de modification à la fois.
 */
export function peutDemanderModification(a: Acteur, d: EtatDemande) {
  const det = detenteur(d.statut);
  return (
    peutVoir(a, d) &&
    !d.modificationEnAttente &&
    !estAdministrateur(a.role) &&
    det !== null &&
    det !== a.role &&
    !peutModifier(a, d)
  );
}

/** RG-04 : la demande de modification est tranchée par le détenteur courant. */
export function peutTrancherModification(a: Acteur, d: EtatDemande) {
  return !!d.modificationEnAttente && peutVoir(a, d) && detenteur(d.statut) === a.role;
}

/** RG-04 : le demandeur peut retirer sa demande de modification. */
export function peutRetirerModification(a: Acteur, d: EtatDemande) {
  return !!d.modificationEnAttente && d.modificationEnAttente.loginDemandeur === a.login;
}

/** RG-05 : décision du Chef dépôt Radès sur une demande approuvée. */
export function peutDeciderRades(a: Acteur, d: EtatDemande) {
  return a.role === ROLES.CHEF_DEPOT && d.statut === "APPROUVEE";
}

export function peutExpedier(a: Acteur, d: EtatDemande) {
  return a.role === ROLES.CHEF_DEPOT && d.statut === "EN_PREPARATION";
}

/** Conversion en pièces (RG-06, RG-08). Un PCB inconnu compte pour 1 pièce par carton. */
export function enPieces(quantite: number, unite: Unite, pcb: number | null | undefined) {
  return unite === "CARTON" ? quantite * (pcb || 1) : quantite;
}

export function enCartons(pieces: number, pcb: number | null | undefined) {
  return Math.round((10 * pieces) / (pcb || 1)) / 10;
}

/** RG-06 : un dépassement du quota (en pièces) impose un motif. */
export function depasseQuota(quantite: number, unite: Unite, pcb: number | null | undefined, quotaPieces: number) {
  return enPieces(quantite, unite, pcb) > quotaPieces;
}

/** RG-07 : un quota ne peut jamais dépasser le stock. */
export const quotaPlafonne = (quota: number, stock: number) => Math.max(0, Math.min(quota, stock));

export type ActionsDemande = {
  valider: boolean;
  modifier: boolean;
  annulerDecision: StatutDemande | null;
  demanderModification: boolean;
  trancherModification: boolean;
  retirerModification: boolean;
  deciderRades: boolean;
  expedier: boolean;
};

export function actionsPossibles(a: Acteur, d: EtatDemande): ActionsDemande {
  return {
    valider: peutValiderOuRejeter(a, d),
    modifier: peutModifier(a, d),
    annulerDecision: statutApresAnnulation(a, d),
    demanderModification: peutDemanderModification(a, d),
    trancherModification: peutTrancherModification(a, d),
    retirerModification: peutRetirerModification(a, d),
    deciderRades: peutDeciderRades(a, d),
    expedier: peutExpedier(a, d),
  };
}

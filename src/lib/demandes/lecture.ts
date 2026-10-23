import "server-only";
import type { Prisma, StatutDemande } from "@prisma/client";
import { prisma } from "../prisma";
import { ROLES, ROLES_AIDE_DECISION, ROLES_HORS_DEMANDES } from "../constantes";
import type { UtilisateurCourant } from "../auth/session";
import * as wf from "../workflow";

/** Filtre de visibilité appliqué en base (§3) : jamais seulement dans l'interface. */
export function filtreVisibilite(a: UtilisateurCourant): Prisma.DemandeWhereInput {
  if (ROLES_HORS_DEMANDES.includes(a.role)) return { numero: { in: [] } };
  if (a.role === ROLES.SUPERVISEUR) return { loginSaisie: a.login };
  if (a.role === ROLES.CHEF_VENTE) return { codeCanal: { in: a.canaux } };
  return {};
}

export async function compterParStatut(a: UtilisateurCourant) {
  const g = await prisma.demande.groupBy({ by: ["statut"], where: filtreVisibilite(a), _count: { _all: true } });
  return Object.fromEntries(g.map((x) => [x.statut, x._count._all])) as Partial<Record<StatutDemande, number>>;
}

export const TAILLE_PAGE = 50;

export async function listerDemandes(
  a: UtilisateurCourant,
  f: { statuts?: StatutDemande[]; recherche?: string; page?: number },
) {
  const where: Prisma.DemandeWhereInput = {
    AND: [
      filtreVisibilite(a),
      f.statuts?.length ? { statut: { in: f.statuts } } : {},
      f.recherche ? { numero: { contains: f.recherche.trim().toUpperCase() } } : {},
    ],
  };
  const page = Math.max(1, f.page ?? 1);
  const [total, demandes] = await Promise.all([
    prisma.demande.count({ where }),
    prisma.demande.findMany({
      where,
      orderBy: [{ dateSaisie: "desc" }, { numero: "desc" }],
      skip: (page - 1) * TAILLE_PAGE,
      take: TAILLE_PAGE,
      include: {
        canal: true,
        depot: true,
        saisiePar: { select: { nomComplet: true } },
        _count: { select: { lignes: { where: { isDeleted: false } } } },
        modifications: { where: { isDeleted: false, statut: "EN_ATTENTE" }, select: { numeroModification: true } },
      },
    }),
  ]);
  return { total, page, pages: Math.max(1, Math.ceil(total / TAILLE_PAGE)), demandes };
}

/** Quantités en instance de validation (statuts À valider / À approuver), en pièces, par article. */
export async function piecesEnInstance(codes: string[]) {
  if (!codes.length) return new Map<string, number>();
  const lignes = await prisma.ligneDemande.findMany({
    where: { codeArticle: { in: codes }, demande: { statut: { in: ["A_VALIDER", "A_APPROUVER"] }, isDeleted: false } },
    select: { codeArticle: true, quantite: true, unite: true, article: { select: { pcb: true } } },
  });
  const m = new Map<string, number>();
  for (const l of lignes) m.set(l.codeArticle, (m.get(l.codeArticle) ?? 0) + wf.enPieces(l.quantite, l.unite, l.article.pcb));
  return m;
}

export async function detailDemande(a: UtilisateurCourant, numero: string) {
  const d = await prisma.demande.findFirst({
    where: { AND: [{ numero }, filtreVisibilite(a)] },
    include: {
      canal: true,
      depot: true,
      saisiePar: { select: { nomComplet: true } },
      lignes: {
        where: { isDeleted: false },
        orderBy: { numeroLigne: "asc" },
        include: { article: { include: { famille: true } } },
      },
      historique: { orderBy: { numeroEvenement: "asc" } },
      modifications: { where: { isDeleted: false }, orderBy: { numeroModification: "desc" } },
    },
  });
  if (!d) return null;

  const enAttente = d.modifications.find((m) => m.statut === "EN_ATTENTE") ?? null;
  const etat: wf.EtatDemande = {
    loginSaisie: d.loginSaisie,
    codeCanal: d.codeCanal,
    statut: d.statut,
    etapeRejet: d.etapeRejet,
    modificationEnAttente: enAttente ? { loginDemandeur: enAttente.loginDemandeur } : null,
  };
  const voitStock = ROLES_AIDE_DECISION.includes(a.role);
  const instance = voitStock ? await piecesEnInstance(d.lignes.map((l) => l.codeArticle)) : new Map<string, number>();
  const enInstance = d.statut === "A_VALIDER" || d.statut === "A_APPROUVER";

  return {
    numero: d.numero,
    version: d.version,
    statut: d.statut,
    etapeRejet: d.etapeRejet,
    canal: d.canal.libelle,
    depot: d.depot.libelle,
    saisiePar: d.saisiePar.nomComplet,
    loginSaisie: d.loginSaisie,
    dateSaisie: d.dateSaisie,
    motif: d.motif,
    actions: wf.actionsPossibles(a, etat),
    modificationEnAttente: enAttente,
    historique: d.historique,
    voitStock,
    lignes: d.lignes.map((l) => {
      const pcb = l.article.pcb;
      return {
        numeroLigne: l.numeroLigne,
        codeArticle: l.codeArticle,
        designation: l.article.designation,
        famille: l.article.famille.libelle,
        unite: l.unite,
        quantite: l.quantite,
        quantiteInitiale: l.quantiteInitiale,
        dateLivraisonSouhaitee: l.dateLivraisonSouhaitee.toISOString().slice(0, 10),
        dateExpeditionPrevue: l.dateExpeditionPrevue?.toISOString().slice(0, 10) ?? null,
        decisionDepot: l.decisionDepot,
        motifDecision: l.motifDecision,
        // Données réservées aux rôles d'arbitrage (RG-08 : affichées en cartons)
        aide: voitStock
          ? {
              pcb,
              stockCartons: wf.enCartons(l.article.stockPieces, pcb),
              rotationCartons: l.article.rotationCartons?.toNumber() ?? null,
              instanceCartons: wf.enCartons(instance.get(l.codeArticle) ?? 0, pcb),
              dontCetteDemande: enInstance ? wf.enCartons(wf.enPieces(l.quantite, l.unite, pcb), pcb) : 0,
            }
          : null,
      };
    }),
  };
}

export type DetailDemande = NonNullable<Awaited<ReturnType<typeof detailDemande>>>;

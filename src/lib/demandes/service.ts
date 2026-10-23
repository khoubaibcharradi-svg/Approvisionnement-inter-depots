import "server-only";
import type { DecisionLigne, StatutDemande, Unite } from "@prisma/client";
import { prisma, type Transaction } from "../prisma";
import { auditer } from "../audit";
import { prochainNumero } from "../compteur";
import { ROLES } from "../constantes";
import type { UtilisateurCourant } from "../auth/session";
import * as wf from "../workflow";
import { libelles } from "../referentiels";

/** Erreur fonctionnelle affichée telle quelle à l'utilisateur. `refus` = tentative hors droits (auditée). */
export class ErreurMetier extends Error {
  constructor(
    message: string,
    public refus = false,
  ) {
    super(message);
  }
}

export type LigneSaisie = { codeArticle: string; quantite: number; unite: Unite; dateLivraisonSouhaitee: string };
export type LigneModifiee = {
  numeroLigne: number;
  quantite: number;
  dateLivraisonSouhaitee?: string | null;
  dateExpeditionPrevue?: string | null;
};

const enDate = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const jour = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

async function chargerPourAction(tx: Transaction, numero: string) {
  const d = await tx.demande.findUnique({
    where: { numero },
    include: {
      lignes: { where: { isDeleted: false }, orderBy: { numeroLigne: "asc" }, include: { article: true } },
      modifications: { where: { isDeleted: false, statut: "EN_ATTENTE" }, take: 1 },
    },
  });
  if (!d) throw new ErreurMetier(`Demande ${numero} introuvable`);
  return d;
}

type DemandeChargee = Awaited<ReturnType<typeof chargerPourAction>>;

const etat = (d: DemandeChargee): wf.EtatDemande => ({
  loginSaisie: d.loginSaisie,
  codeCanal: d.codeCanal,
  statut: d.statut,
  etapeRejet: d.etapeRejet,
  modificationEnAttente: d.modifications[0] ? { loginDemandeur: d.modifications[0].loginDemandeur } : null,
});

const instantane = (d: DemandeChargee) => ({
  statut: d.statut,
  etapeRejet: d.etapeRejet,
  lignes: d.lignes.map((l) => ({
    ligne: l.numeroLigne,
    article: l.codeArticle,
    quantite: l.quantite,
    unite: l.unite,
    livraison: jour(l.dateLivraisonSouhaitee),
    expedition: jour(l.dateExpeditionPrevue),
    decision: l.decisionDepot,
  })),
});

/** Verrouillage optimiste : échoue si un autre utilisateur a modifié la demande entre-temps. */
async function changerEtat(
  tx: Transaction,
  d: DemandeChargee,
  version: number,
  login: string,
  donnees: { statut?: StatutDemande; etapeRejet?: number | null; motif?: string | null } = {},
) {
  const r = await tx.demande.updateMany({
    where: { numero: d.numero, version },
    data: { ...donnees, version: { increment: 1 }, modifiePar: login },
  });
  if (r.count === 0) {
    throw new ErreurMetier("La demande a été modifiée par un autre utilisateur entre-temps. Rechargez la page.");
  }
}

async function historiser(tx: Transaction, numero: string, login: string, libelle: string) {
  const n = await tx.historiqueDemande.count({ where: { numeroDemande: numero } });
  await tx.historiqueDemande.create({ data: { numeroDemande: numero, numeroEvenement: n + 1, login, libelle } });
}

const motifRequis = (motif: string | null | undefined, contexte: string) => {
  const m = motif?.trim();
  if (!m) throw new ErreurMetier(`Un motif est obligatoire ${contexte}.`);
  return m.slice(0, 2000);
};

function controlerQuantite(q: number) {
  if (!Number.isInteger(q) || q < 1 || q > 1_000_000) throw new ErreurMetier("Les quantités doivent être des entiers positifs.");
}

/**
 * Exécute une action sur une demande dans une transaction : chargement, contrôle de visibilité,
 * règle spécifique, écriture, historique et audit. Les refus sont audités même si la transaction échoue.
 */
async function agir(
  acteur: UtilisateurCourant,
  numero: string,
  action: string,
  executer: (tx: Transaction, d: DemandeChargee) => Promise<string>,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const d = await chargerPourAction(tx, numero);
        if (!wf.peutVoir(acteur, etat(d))) throw new ErreurMetier("Action refusée : demande hors de votre circuit.", true);
        const avant = instantane(d);
        const resume = await executer(tx, d);
        await historiser(tx, numero, acteur.login, `${resume} (${acteur.nomComplet})`);
        const apres = instantane(await chargerPourAction(tx, numero));
        await auditer(
          { action, login: acteur.login, codeRole: acteur.role, entite: "Demande", cleEntite: numero, avant, apres, detail: resume },
          tx,
        );
        return resume;
      },
      { isolationLevel: "ReadCommitted", timeout: 15_000 },
    );
  } catch (e) {
    if (e instanceof ErreurMetier) {
      await auditer({
        action: `${action}_REFUSE`,
        login: acteur.login,
        codeRole: acteur.role,
        entite: "Demande",
        cleEntite: numero,
        detail: e.message,
        succes: false,
      });
    }
    throw e;
  }
}

// ───────────────────────────── Saisie ─────────────────────────────

export async function creerDemande(
  acteur: UtilisateurCourant,
  saisie: { codeCanal: string; motif?: string; lignes: LigneSaisie[] },
) {
  if (acteur.role !== ROLES.SUPERVISEUR) throw new ErreurMetier("Seuls les superviseurs saisissent des demandes.", true);
  if (!acteur.canaux.includes(saisie.codeCanal)) throw new ErreurMetier("Canal hors de votre affectation.", true);
  const codeDepot = acteur.depotParCanal[saisie.codeCanal];
  if (!codeDepot) throw new ErreurMetier("Aucun dépôt n'est affecté à ce canal : contactez l'administrateur.");
  if (!saisie.lignes.length) throw new ErreurMetier("Ajoutez au moins un article.");
  if (saisie.lignes.length > 100) throw new ErreurMetier("100 articles au maximum par demande.");

  const codes = saisie.lignes.map((l) => l.codeArticle);
  if (new Set(codes).size !== codes.length) throw new ErreurMetier("Un même article apparaît sur plusieurs lignes.");
  const articles = await prisma.article.findMany({ where: { codeArticle: { in: codes }, isActif: true } });
  const parCode = new Map(articles.map((a) => [a.codeArticle, a]));
  const aujourdhui = new Date().toISOString().slice(0, 10);
  let depassement = false;
  for (const l of saisie.lignes) {
    const a = parCode.get(l.codeArticle);
    if (!a) throw new ErreurMetier(`Article inconnu ou inactif : ${l.codeArticle}`);
    controlerQuantite(l.quantite);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.dateLivraisonSouhaitee)) {
      throw new ErreurMetier(`Date de livraison souhaitée manquante pour ${l.codeArticle}.`);
    }
    if (l.dateLivraisonSouhaitee < aujourdhui) throw new ErreurMetier(`Date de livraison passée pour ${l.codeArticle}.`);
    if (wf.depasseQuota(l.quantite, l.unite, a.pcb, a.quotaPieces)) depassement = true;
  }
  // RG-06 : le quota n'est pas révélé, seul le besoin d'un motif l'est.
  const motif = saisie.motif?.trim() || null;
  if (depassement && !motif) {
    throw new ErreurMetier("Motif obligatoire : la quantité demandée dépasse l'autorisation pour au moins un article.");
  }

  return prisma.$transaction(async (tx) => {
    const numero = await prochainNumero(tx, "DEMANDE", "DA");
    await tx.demande.create({
      data: {
        numero,
        codeCanal: saisie.codeCanal,
        codeDepot,
        loginSaisie: acteur.login,
        motif,
        creePar: acteur.login,
        lignes: {
          create: saisie.lignes.map((l, i) => ({
            numeroLigne: i + 1,
            codeArticle: l.codeArticle,
            unite: l.unite,
            quantiteInitiale: l.quantite,
            quantite: l.quantite,
            dateLivraisonSouhaitee: enDate(l.dateLivraisonSouhaitee)!,
            creePar: acteur.login,
          })),
        },
      },
    });
    await historiser(tx, numero, acteur.login, `Demande saisie et soumise au Chef de Vente (${acteur.nomComplet})`);
    await auditer(
      {
        action: "DEMANDE_CREEE",
        login: acteur.login,
        codeRole: acteur.role,
        entite: "Demande",
        cleEntite: numero,
        apres: { canal: saisie.codeCanal, depot: codeDepot, motif, lignes: saisie.lignes, depassementQuota: depassement },
      },
      tx,
    );
    return numero;
  });
}

// ───────────────────────────── Validation / approbation ─────────────────────────────

export function valider(acteur: UtilisateurCourant, numero: string, version: number) {
  return agir(acteur, numero, "DEMANDE_VALIDEE", async (tx, d) => {
    if (!wf.peutValiderOuRejeter(acteur, etat(d))) throw new ErreurMetier("Validation impossible à ce stade.", true);
    const statut = wf.statutApresValidation(d.statut);
    await changerEtat(tx, d, version, acteur.login, { statut, etapeRejet: null });
    return d.statut === "A_VALIDER" ? "Validée" : "Approuvée";
  });
}

export function rejeter(acteur: UtilisateurCourant, numero: string, version: number, motif: string) {
  return agir(acteur, numero, "DEMANDE_REJETEE", async (tx, d) => {
    if (!wf.peutValiderOuRejeter(acteur, etat(d))) throw new ErreurMetier("Rejet impossible à ce stade.", true);
    const m = motifRequis(motif, "pour rejeter une demande (RG-01)");
    await changerEtat(tx, d, version, acteur.login, { statut: "REJETEE", etapeRejet: wf.etapeDeRejet(d.statut) });
    return `Rejetée : ${m}`;
  });
}

/** RG-02 */
export function annulerDecision(acteur: UtilisateurCourant, numero: string, version: number) {
  return agir(acteur, numero, "DECISION_ANNULEE", async (tx, d) => {
    const statut = wf.statutApresAnnulation(acteur, etat(d));
    if (!statut) throw new ErreurMetier("Décision non modifiable : le niveau supérieur a déjà agi.", true);
    await changerEtat(tx, d, version, acteur.login, { statut, etapeRejet: null });
    return "Décision annulée, nouvelle décision attendue";
  });
}

// ───────────────────────────── Modifications ─────────────────────────────

/** Calcule les changements demandés et le résumé lisible, sans rien écrire. */
function diff(d: DemandeChargee, lignes: LigneModifiee[], superviseur: boolean) {
  const changements: string[] = [];
  const cibles = new Map(lignes.map((l) => [l.numeroLigne, l]));
  for (const l of d.lignes) {
    const c = cibles.get(l.numeroLigne);
    if (!c) continue;
    controlerQuantite(c.quantite);
    if (c.quantite !== l.quantite) changements.push(`${l.codeArticle} qté ${l.quantite}→${c.quantite}`);
    if (superviseur && c.dateLivraisonSouhaitee !== undefined && c.dateLivraisonSouhaitee !== jour(l.dateLivraisonSouhaitee)) {
      if (!c.dateLivraisonSouhaitee) throw new ErreurMetier(`Date de livraison obligatoire pour ${l.codeArticle}.`);
      changements.push(`${l.codeArticle} livraison ${jour(l.dateLivraisonSouhaitee)}→${c.dateLivraisonSouhaitee}`);
    }
    if (!superviseur && c.dateExpeditionPrevue !== undefined && (c.dateExpeditionPrevue || null) !== jour(l.dateExpeditionPrevue)) {
      changements.push(`${l.codeArticle} expédition → ${c.dateExpeditionPrevue || "—"}`);
    }
  }
  return changements;
}

async function appliquerLignes(tx: Transaction, d: DemandeChargee, lignes: LigneModifiee[], superviseur: boolean, login: string) {
  for (const c of lignes) {
    const l = d.lignes.find((x) => x.numeroLigne === c.numeroLigne);
    if (!l) continue;
    await tx.ligneDemande.update({
      where: { numeroDemande_numeroLigne: { numeroDemande: d.numero, numeroLigne: c.numeroLigne } },
      data: {
        quantite: c.quantite,
        ...(superviseur && c.dateLivraisonSouhaitee ? { dateLivraisonSouhaitee: enDate(c.dateLivraisonSouhaitee)! } : {}),
        ...(!superviseur && c.dateExpeditionPrevue !== undefined ? { dateExpeditionPrevue: enDate(c.dateExpeditionPrevue) } : {}),
        modifiePar: login,
      },
    });
  }
}

/** Modification directe (Superviseur avant traitement ; supérieurs à leur étape avec motif, RG-03). */
export function modifier(acteur: UtilisateurCourant, numero: string, version: number, lignes: LigneModifiee[], motif?: string) {
  return agir(acteur, numero, "DEMANDE_MODIFIEE", async (tx, d) => {
    if (!wf.peutModifier(acteur, etat(d))) throw new ErreurMetier("Modification impossible à ce stade.", true);
    const sup = acteur.role === ROLES.SUPERVISEUR;
    const changements = diff(d, lignes, sup);
    if (!changements.length) throw new ErreurMetier("Aucune modification saisie.");
    const m = wf.motifObligatoirePourModification(acteur) ? motifRequis(motif, "pour modifier une demande (RG-03)") : motif?.trim();
    await changerEtat(tx, d, version, acteur.login);
    await appliquerLignes(tx, d, lignes, sup, acteur.login);
    return `Modifiée : ${changements.join(", ")}${m ? ` (${m})` : ""}${sup ? "" : ` · superviseur ${d.loginSaisie} notifié`}`;
  });
}

/** RG-04 : demande de modification adressée au détenteur courant. */
export function demanderModification(
  acteur: UtilisateurCourant,
  numero: string,
  version: number,
  lignes: LigneModifiee[],
  motif: string,
) {
  return agir(acteur, numero, "MODIFICATION_DEMANDEE", async (tx, d) => {
    if (!wf.peutDemanderModification(acteur, etat(d))) throw new ErreurMetier("Demande de modification impossible.", true);
    const sup = acteur.role === ROLES.SUPERVISEUR;
    const changements = diff(d, lignes, sup);
    if (!changements.length) throw new ErreurMetier("Aucune modification saisie.");
    const m = motifRequis(motif, "pour une demande de modification");
    await changerEtat(tx, d, version, acteur.login);
    const n = await tx.demandeModification.count({ where: { numeroDemande: numero } });
    await tx.demandeModification.create({
      data: {
        numeroDemande: numero,
        numeroModification: n + 1,
        loginDemandeur: acteur.login,
        codeRoleDemandeur: acteur.role,
        motif: m,
        resume: changements.join(", "),
        contenu: lignes,
        creePar: acteur.login,
      },
    });
    return `Demande de modification émise : ${changements.join(", ")} (${m})`;
  });
}

export function trancherModification(
  acteur: UtilisateurCourant,
  numero: string,
  version: number,
  accepter: boolean,
  motif?: string,
) {
  return agir(acteur, numero, accepter ? "MODIFICATION_ACCEPTEE" : "MODIFICATION_REFUSEE", async (tx, d) => {
    if (!wf.peutTrancherModification(acteur, etat(d))) throw new ErreurMetier("Vous n'êtes pas le détenteur de la demande.", true);
    const mod = d.modifications[0];
    const m = accepter ? motif?.trim() || null : motifRequis(motif, "pour refuser une modification");
    await changerEtat(tx, d, version, acteur.login);
    if (accepter) {
      await appliquerLignes(tx, d, mod.contenu as LigneModifiee[], mod.codeRoleDemandeur === ROLES.SUPERVISEUR, acteur.login);
    }
    await tx.demandeModification.update({
      where: { numeroDemande_numeroModification: { numeroDemande: numero, numeroModification: mod.numeroModification } },
      data: {
        statut: accepter ? "ACCEPTEE" : "REFUSEE",
        loginDecision: acteur.login,
        dateDecision: new Date(),
        motifDecision: m,
        modifiePar: acteur.login,
      },
    });
    return accepter
      ? `Modification de ${mod.loginDemandeur} acceptée : ${mod.resume}`
      : `Modification de ${mod.loginDemandeur} refusée : ${m}`;
  });
}

export function retirerModification(acteur: UtilisateurCourant, numero: string, version: number) {
  return agir(acteur, numero, "MODIFICATION_RETIREE", async (tx, d) => {
    if (!wf.peutRetirerModification(acteur, etat(d))) throw new ErreurMetier("Seul le demandeur peut retirer sa demande.", true);
    const mod = d.modifications[0];
    await changerEtat(tx, d, version, acteur.login);
    await tx.demandeModification.update({
      where: { numeroDemande_numeroModification: { numeroDemande: numero, numeroModification: mod.numeroModification } },
      data: { statut: "RETIREE", modifiePar: acteur.login, dateDecision: new Date(), loginDecision: acteur.login },
    });
    return "Demande de modification retirée";
  });
}

/** RG-04 : la préparation annule automatiquement une demande de modification en attente. */
async function annulerModificationEnAttente(tx: Transaction, d: DemandeChargee, login: string) {
  const mod = d.modifications[0];
  if (!mod) return "";
  await tx.demandeModification.update({
    where: { numeroDemande_numeroModification: { numeroDemande: d.numero, numeroModification: mod.numeroModification } },
    data: { statut: "ANNULEE", motifDecision: "Préparation lancée", dateDecision: new Date(), loginDecision: login, modifiePar: login },
  });
  return " · demande de modification en attente annulée";
}

// ───────────────────────────── Radès ─────────────────────────────

export type DecisionRades =
  | { type: "TOTALITE" }
  | { type: "MODIFICATIONS"; lignes: { numeroLigne: number; quantite: number; dateExpeditionPrevue: string | null }[]; motif: string }
  | { type: "REFUS"; motif: string };

/** RG-05 : (a) accepter la totalité, (b) modifier chaque SKU avec motif, (c) refuser avec motif. */
export function deciderRades(acteur: UtilisateurCourant, numero: string, version: number, decision: DecisionRades) {
  return agir(acteur, numero, `RADES_${decision.type}`, async (tx, d) => {
    if (!wf.peutDeciderRades(acteur, etat(d))) throw new ErreurMetier("Décision Radès impossible à ce stade.", true);
    const majLigne = (numeroLigne: number, data: { decisionDepot: DecisionLigne; motifDecision?: string | null; quantite?: number; dateExpeditionPrevue?: Date | null }) =>
      tx.ligneDemande.update({
        where: { numeroDemande_numeroLigne: { numeroDemande: numero, numeroLigne } },
        data: { ...data, modifiePar: acteur.login },
      });

    if (decision.type === "REFUS") {
      const m = motifRequis(decision.motif, "pour refuser la demande");
      await changerEtat(tx, d, version, acteur.login, { statut: "REJETEE", etapeRejet: wf.ETAPE_REJET.RADES });
      for (const l of d.lignes) await majLigne(l.numeroLigne, { decisionDepot: "REFUS", motifDecision: m });
      return `Refusée par Radès : ${m}${await annulerModificationEnAttente(tx, d, acteur.login)}`;
    }

    if (decision.type === "TOTALITE") {
      await changerEtat(tx, d, version, acteur.login, { statut: "EN_PREPARATION" });
      for (const l of d.lignes) await majLigne(l.numeroLigne, { decisionDepot: "ACCORD", motifDecision: null });
      return `Acceptée en totalité · préparation lancée${await annulerModificationEnAttente(tx, d, acteur.login)}`;
    }

    const cibles = new Map(decision.lignes.map((l) => [l.numeroLigne, l]));
    const changements: string[] = [];
    const unites = await libelles("UNITE");
    for (const l of d.lignes) {
      const c = cibles.get(l.numeroLigne);
      if (!c) continue;
      controlerQuantite(c.quantite);
      if (c.quantite !== l.quantite) changements.push(`${l.codeArticle} qté ${l.quantite}→${c.quantite} ${unites[l.unite]}`);
      if ((c.dateExpeditionPrevue || null) !== jour(l.dateExpeditionPrevue)) {
        changements.push(`${l.codeArticle} expédition ${c.dateExpeditionPrevue || "—"}`);
      }
    }
    if (!changements.length) throw new ErreurMetier("Aucune modification saisie : utilisez « Accepter la totalité ».");
    const m = motifRequis(decision.motif, "pour valider avec modifications");
    await changerEtat(tx, d, version, acteur.login, { statut: "EN_PREPARATION" });
    for (const l of d.lignes) {
      const c = cibles.get(l.numeroLigne);
      const modifiee = !!c && c.quantite !== l.quantite;
      await majLigne(l.numeroLigne, {
        decisionDepot: modifiee ? "MODIFICATION" : "ACCORD",
        motifDecision: modifiee ? m : null,
        quantite: c?.quantite ?? l.quantite,
        dateExpeditionPrevue: c ? enDate(c.dateExpeditionPrevue) : l.dateExpeditionPrevue,
      });
    }
    return `Validée avec modifications : ${changements.join(", ")} (${m}) · préparation lancée${await annulerModificationEnAttente(tx, d, acteur.login)}`;
  });
}

export function expedier(acteur: UtilisateurCourant, numero: string, version: number) {
  return agir(acteur, numero, "DEMANDE_EXPEDIEE", async (tx, d) => {
    if (!wf.peutExpedier(acteur, etat(d))) throw new ErreurMetier("Expédition impossible à ce stade.", true);
    await changerEtat(tx, d, version, acteur.login, { statut: "EXPEDIEE" });
    return "Expédiée";
  });
}

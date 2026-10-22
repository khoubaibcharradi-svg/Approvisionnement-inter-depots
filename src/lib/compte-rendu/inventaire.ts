import "server-only";
import { z } from "zod";
import { prisma, champsSuppression, type Transaction } from "../prisma";
import { auditer } from "../audit";
import { ROLES } from "../constantes";
import type { UtilisateurCourant } from "../auth/session";
import { calculerLigneInventaire, controlerInventaire, ligneConcernee, valoriserInventaire, type SaisieInventaire } from "./calculs";
import { ErreurCompteRendu, journeesAutorisees } from "./service";

const enDate = (j: string) => new Date(`${j}T00:00:00.000Z`);
const jour = (d: Date) => d.toISOString().slice(0, 10);
const num = (d: { toNumber(): number } | null | undefined) => (d === null || d === undefined ? null : d.toNumber());

const quantite = z.number().finite().min(0, "Quantités négatives interdites").max(1e9).nullable();
export const schemaInventaire = z
  .array(
    z.object({
      codeArticle: z.string().max(30),
      stockInitial: quantite,
      receptions: quantite,
      ventes: quantite,
      retours: quantite,
      stockFinalReel: quantite,
    }),
  )
  .max(5000);

function depotDeLAgent(a: UtilisateurCourant) {
  if (a.role !== ROLES.AGENT_DEPOT) throw new ErreurCompteRendu("Réservé aux agents dépôt.");
  if (!a.codeDepotAgent) throw new ErreurCompteRendu("Aucun dépôt ne vous est affecté : contactez l'administrateur.");
  return a.codeDepotAgent;
}

/** Dernier inventaire du magasin avant la journée : son stock final réel devient le stock initial. */
async function inventairePrecedent(tx: Transaction | typeof prisma, codeMagasin: string, dateJournee: string) {
  const derniere = await tx.inventaireLigne.findFirst({
    where: { codeMagasin, dateJournee: { lt: enDate(dateJournee) } },
    orderBy: { dateJournee: "desc" },
    select: { dateJournee: true },
  });
  if (!derniere) return null;
  const lignes = await tx.inventaireLigne.findMany({ where: { codeMagasin, dateJournee: derniere.dateJournee } });
  return { date: jour(derniere.dateJournee), stock: new Map(lignes.map((l) => [l.codeArticle, l.stockFinalReel?.toNumber() ?? 0])) };
}

async function compteRenduSoumis(tx: Transaction | typeof prisma, codeDepot: string, dateJournee: string) {
  const cr = await tx.compteRendu.findFirst({ where: { codeDepot, dateJournee: enDate(dateJournee) }, select: { statut: true } });
  return cr?.statut === "SOUMIS";
}

export async function chargerInventaire(agent: UtilisateurCourant, dateJournee: string, codeMagasinDemande?: string) {
  const codeDepot = depotDeLAgent(agent);
  const dates = await journeesAutorisees();
  const magasins = await prisma.magasin.findMany({
    where: { codeDepot, isActif: true },
    include: { societe: true },
    orderBy: [{ codeSociete: "asc" }, { libelle: "asc" }],
  });
  const magasin = magasins.find((m) => m.code === codeMagasinDemande) ?? magasins[0];
  if (!magasin) {
    return { dateJournee, datesAutorisees: dates, magasins: [], magasin: null, lignes: [], reprise: null, modifiable: false, derniereSaisie: null };
  }
  const [articles, existantes, precedent, soumis] = await Promise.all([
    prisma.article.findMany({ include: { famille: true }, orderBy: [{ codeFamille: "asc" }, { designation: "asc" }] }),
    prisma.inventaireLigne.findMany({ where: { codeMagasin: magasin.code, dateJournee: enDate(dateJournee) } }),
    inventairePrecedent(prisma, magasin.code, dateJournee),
    compteRenduSoumis(prisma, codeDepot, dateJournee),
  ]);
  const parArticle = new Map(existantes.map((l) => [l.codeArticle, l]));
  const derniereSaisie = existantes.reduce<{ date: Date; login: string } | null>(
    (m, l) => (!m || l.dateModification > m.date ? { date: l.dateModification, login: l.modifiePar ?? l.loginAgent } : m),
    null,
  );
  // Articles actifs, plus les inactifs encore présents dans l'inventaire (stock à solder).
  const lignes = articles
    .filter((a) => a.isActif || parArticle.has(a.codeArticle) || (precedent?.stock.get(a.codeArticle) ?? 0) !== 0)
    .map((a) => {
      const l = parArticle.get(a.codeArticle);
      const initialRepris = precedent ? (precedent.stock.get(a.codeArticle) ?? 0) : null;
      return {
        codeArticle: a.codeArticle,
        designation: a.designation,
        famille: a.famille.libelle,
        stockInitial: initialRepris ?? num(l?.stockInitial) ?? null,
        receptions: num(l?.receptions),
        ventes: num(l?.ventes),
        retours: num(l?.retours),
        stockFinalReel: num(l?.stockFinalReel),
      };
    });
  return {
    dateJournee,
    datesAutorisees: dates,
    magasins: magasins.map((m) => ({ code: m.code, libelle: m.libelle, societe: m.societe.libelle })),
    magasin: { code: magasin.code, libelle: magasin.libelle, societe: magasin.societe.libelle },
    lignes,
    reprise: precedent ? { date: precedent.date } : null,
    modifiable: dates.includes(dateJournee) && !soumis,
    derniereSaisie,
  };
}

export type InventaireJournee = Awaited<ReturnType<typeof chargerInventaire>>;

export async function enregistrerInventaire(agent: UtilisateurCourant, dateJournee: string, codeMagasin: string, brut: unknown) {
  const codeDepot = depotDeLAgent(agent);
  if (!(await journeesAutorisees()).includes(dateJournee)) throw new ErreurCompteRendu("Cette journée n'est plus ouverte à la saisie.");
  const saisie = schemaInventaire.parse(brut);

  return prisma.$transaction(
    async (tx) => {
      const magasin = await tx.magasin.findFirst({ where: { code: codeMagasin, codeDepot, isActif: true } });
      if (!magasin) throw new ErreurCompteRendu("Magasin hors de votre dépôt.");
      if (await compteRenduSoumis(tx, codeDepot, dateJournee)) throw new ErreurCompteRendu("Le compte rendu de cette journée est soumis : l'inventaire n'est plus modifiable.");
      const articles = new Map((await tx.article.findMany({ where: { codeArticle: { in: saisie.map((l) => l.codeArticle) } } })).map((a) => [a.codeArticle, a]));
      const precedent = await inventairePrecedent(tx, codeMagasin, dateJournee);

      const aGarder: string[] = [];
      for (const l of saisie) {
        const a = articles.get(l.codeArticle);
        if (!a) throw new ErreurCompteRendu(`Article inconnu : ${l.codeArticle}`);
        // Continuité : le stock initial est toujours le stock final réel du dernier inventaire.
        if (precedent) l.stockInitial = precedent.stock.get(l.codeArticle) ?? 0;
        if (!ligneConcernee(l)) continue;
        aGarder.push(l.codeArticle);
        const calc = calculerLigneInventaire(l);
        const donnees = {
          codeDepot,
          codeSociete: magasin.codeSociete,
          stockInitial: l.stockInitial ?? 0,
          receptions: l.receptions ?? 0,
          ventes: l.ventes ?? 0,
          retours: l.retours ?? 0,
          stockFinalTheorique: calc.stockFinalTheorique,
          stockFinalReel: l.stockFinalReel,
          ecart: calc.ecart ?? 0,
          prixRevient: a.prixRevient,
          loginAgent: agent.login,
        };
        await tx.inventaireLigne.upsert({
          where: { codeMagasin_dateJournee_codeArticle: { codeMagasin, dateJournee: enDate(dateJournee), codeArticle: l.codeArticle } },
          create: { codeMagasin, dateJournee: enDate(dateJournee), codeArticle: l.codeArticle, ...donnees, creePar: agent.login, modifiePar: agent.login },
          update: { ...donnees, isDeleted: false, isActif: true, dateSuppression: null, supprimePar: null, modifiePar: agent.login },
        });
      }
      // Lignes vidées : suppression logique.
      await tx.inventaireLigne.updateMany({
        where: { codeMagasin, dateJournee: enDate(dateJournee), isDeleted: false, codeArticle: { notIn: aGarder } },
        data: champsSuppression(agent.login),
      });

      const valeur = (await valorisationDepot(tx, codeDepot, dateJournee)).get(codeMagasin);
      await auditer(
        {
          action: "INVENTAIRE_ENREGISTRE",
          login: agent.login,
          codeRole: agent.role,
          entite: "Inventaire",
          cleEntite: `${codeMagasin}/${dateJournee}`,
          apres: { articles: aGarder.length, nonComptes: valeur?.erreurs, valorisation: valeur?.valeur },
        },
        tx,
      );
      return { articles: aGarder.length, erreurs: valeur?.erreurs ?? [] };
    },
    { timeout: 60_000 },
  );
}

/**
 * Valorisation des inventaires d'un dépôt pour une journée, par magasin (dinars au coût de revient) :
 * c'est la source de la « situation du stock » du compte rendu.
 */
export async function valorisationDepot(tx: Transaction | typeof prisma, codeDepot: string, dateJournee: string) {
  const lignes = await tx.inventaireLigne.findMany({ where: { codeDepot, dateJournee: enDate(dateJournee) } });
  const parMagasin = new Map<string, typeof lignes>();
  for (const l of lignes) parMagasin.set(l.codeMagasin, [...(parMagasin.get(l.codeMagasin) ?? []), l]);
  const resultat = new Map<string, { valeur: ReturnType<typeof valoriserInventaire>; nbLignes: number; sansPrix: number; erreurs: string[] }>();
  for (const [codeMagasin, ls] of parMagasin) {
    const saisies: (SaisieInventaire & { prixRevient: number })[] = ls.map((l) => ({
      codeArticle: l.codeArticle,
      stockInitial: l.stockInitial.toNumber(),
      receptions: l.receptions.toNumber(),
      ventes: l.ventes.toNumber(),
      retours: l.retours.toNumber(),
      stockFinalReel: num(l.stockFinalReel),
      prixRevient: l.prixRevient.toNumber(),
    }));
    resultat.set(codeMagasin, {
      valeur: valoriserInventaire(saisies),
      nbLignes: ls.length,
      sansPrix: saisies.filter((x) => x.prixRevient === 0).length,
      erreurs: controlerInventaire(saisies),
    });
  }
  return resultat;
}

/** Détail de l'inventaire d'un compte rendu (consultation). */
export async function detailInventaire(codeDepot: string, dateJournee: string) {
  const lignes = await prisma.inventaireLigne.findMany({
    where: { codeDepot, dateJournee: enDate(dateJournee) },
    include: { article: { select: { designation: true } }, magasin: { include: { societe: true } } },
    orderBy: [{ codeMagasin: "asc" }, { codeArticle: "asc" }],
  });
  return lignes.map((l) => ({
    magasin: l.magasin.libelle,
    societe: l.magasin.societe.libelle,
    codeArticle: l.codeArticle,
    designation: l.article.designation,
    stockInitial: l.stockInitial.toNumber(),
    receptions: l.receptions.toNumber(),
    ventes: l.ventes.toNumber(),
    retours: l.retours.toNumber(),
    stockFinalTheorique: l.stockFinalTheorique.toNumber(),
    stockFinalReel: num(l.stockFinalReel),
    ecart: l.ecart.toNumber(),
    prixRevient: l.prixRevient.toNumber(),
  }));
}

import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, champsSuppression, type Transaction } from "../prisma";
import { auditer } from "../audit";
import { ROLES } from "../constantes";
import type { UtilisateurCourant } from "../auth/session";
import { calculerLigneInventaire, controlerInventaire, ligneConcernee, valoriserInventaire, type SaisieInventaire } from "./calculs";
import { ErreurCompteRendu, journeesAccessibles } from "./service";

/**
 * Inventaire journalier en quantités, par magasin.
 * Cycle de vie : EN_COURS (saisie par l'agent) → CLOTURE (plus aucune modification)
 * → réouverture motivée par l'administrateur → EN_COURS → CLOTURE…
 * Seuls les inventaires clôturés alimentent la situation du stock du compte rendu.
 */

const enDate = (j: string) => new Date(`${j}T00:00:00.000Z`);
const jour = (d: Date) => d.toISOString().slice(0, 10);
const num = (d: { toNumber(): number } | null | undefined) => (d === null || d === undefined ? null : d.toNumber());
type Client = Transaction | typeof prisma;

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
async function inventairePrecedent(tx: Client, codeMagasin: string, dateJournee: string) {
  const derniere = await tx.inventaireLigne.findFirst({
    where: { codeMagasin, dateJournee: { lt: enDate(dateJournee) } },
    orderBy: { dateJournee: "desc" },
    select: { dateJournee: true },
  });
  if (!derniere) return null;
  const lignes = await tx.inventaireLigne.findMany({ where: { codeMagasin, dateJournee: derniere.dateJournee } });
  return { date: jour(derniere.dateJournee), stock: new Map(lignes.map((l) => [l.codeArticle, l.stockFinalReel?.toNumber() ?? 0])) };
}

async function compteRenduSoumis(tx: Client, codeDepot: string, dateJournee: string) {
  const cr = await tx.compteRendu.findFirst({ where: { codeDepot, dateJournee: enDate(dateJournee) }, select: { statut: true } });
  return cr?.statut === "SOUMIS";
}

const entete = (tx: Client, codeMagasin: string, dateJournee: string) =>
  tx.inventaire.findUnique({
    where: { codeMagasin_dateJournee: { codeMagasin, dateJournee: enDate(dateJournee) } },
    include: { reouvertures: { orderBy: { numero: "asc" } } },
  });

const vueEntete = (e: Awaited<ReturnType<typeof entete>>) =>
  e
    ? {
        statut: e.statut,
        dateCloture: e.dateCloture,
        loginCloture: e.loginCloture,
        nbReouvertures: e.nbReouvertures,
        reouvertures: e.reouvertures.map((r) => ({ numero: r.numero, motif: r.motif, loginAdmin: r.loginAdmin, date: r.dateReouverture })),
      }
    : null;

// ───────────────────────────── Agent : saisie ─────────────────────────────

export async function chargerInventaire(agent: UtilisateurCourant, dateJournee: string, codeMagasinDemande?: string) {
  const codeDepot = depotDeLAgent(agent);
  const { dates, rouvertes } = await journeesAccessibles(codeDepot);
  const magasins = await prisma.magasin.findMany({
    where: { codeDepot, isActif: true },
    include: { societe: true },
    orderBy: [{ codeSociete: "asc" }, { libelle: "asc" }],
  });
  const magasin = magasins.find((m) => m.code === codeMagasinDemande) ?? magasins[0];
  const base = { dateJournee, datesAutorisees: dates, rouvertes, magasins: magasins.map((m) => ({ code: m.code, libelle: m.libelle, societe: m.societe.libelle })) };
  if (!magasin) return { ...base, magasin: null, lignes: [], reprise: null, modifiable: false, compteRenduSoumis: false, entete: null, derniereSaisie: null, statuts: {} as Record<string, "EN_COURS" | "CLOTURE"> };

  const [articles, existantes, precedent, soumis, en, statuts] = await Promise.all([
    prisma.article.findMany({ include: { famille: true }, orderBy: [{ codeFamille: "asc" }, { designation: "asc" }] }),
    prisma.inventaireLigne.findMany({ where: { codeMagasin: magasin.code, dateJournee: enDate(dateJournee) } }),
    inventairePrecedent(prisma, magasin.code, dateJournee),
    compteRenduSoumis(prisma, codeDepot, dateJournee),
    entete(prisma, magasin.code, dateJournee),
    prisma.inventaire.findMany({ where: { codeDepot, dateJournee: enDate(dateJournee) }, select: { codeMagasin: true, statut: true } }),
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
    ...base,
    magasin: { code: magasin.code, libelle: magasin.libelle, societe: magasin.societe.libelle },
    lignes,
    reprise: precedent ? { date: precedent.date } : null,
    modifiable: dates.includes(dateJournee) && !soumis && en?.statut !== "CLOTURE",
    compteRenduSoumis: soumis,
    entete: vueEntete(en),
    derniereSaisie,
    statuts: Object.fromEntries(statuts.map((s) => [s.codeMagasin, s.statut])) as Record<string, "EN_COURS" | "CLOTURE">,
  };
}

export type InventaireJournee = Awaited<ReturnType<typeof chargerInventaire>>;

/** Enregistre l'inventaire (et le clôture si demandé). Les quantités calculées sont refaites ici. */
export async function enregistrerInventaire(agent: UtilisateurCourant, dateJournee: string, codeMagasin: string, brut: unknown, cloturer = false) {
  const codeDepot = depotDeLAgent(agent);
  if (!(await journeesAccessibles(codeDepot)).dates.includes(dateJournee)) throw new ErreurCompteRendu("Cette journée n'est plus ouverte à la saisie.");
  const saisie = schemaInventaire.parse(brut);

  return prisma.$transaction(
    async (tx) => {
      const magasin = await tx.magasin.findFirst({ where: { code: codeMagasin, codeDepot, isActif: true } });
      if (!magasin) throw new ErreurCompteRendu("Magasin hors de votre dépôt.");
      if (await compteRenduSoumis(tx, codeDepot, dateJournee)) throw new ErreurCompteRendu("Le compte rendu de cette journée est soumis : l'inventaire n'est plus modifiable.");
      const cle = { codeMagasin, dateJournee: enDate(dateJournee) };
      const en = await tx.inventaire.findUnique({ where: { codeMagasin_dateJournee: cle } });
      if (en?.statut === "CLOTURE") throw new ErreurCompteRendu("Inventaire clôturé : seul l'administrateur peut le rouvrir.");
      await tx.inventaire.upsert({
        where: { codeMagasin_dateJournee: cle },
        create: { ...cle, codeDepot, creePar: agent.login, modifiePar: agent.login },
        update: { version: { increment: 1 }, modifiePar: agent.login },
      });

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
          where: { codeMagasin_dateJournee_codeArticle: { ...cle, codeArticle: l.codeArticle } },
          create: { ...cle, codeArticle: l.codeArticle, ...donnees, creePar: agent.login, modifiePar: agent.login },
          update: { ...donnees, isDeleted: false, isActif: true, dateSuppression: null, supprimePar: null, modifiePar: agent.login },
        });
      }
      await tx.inventaireLigne.updateMany({
        where: { ...cle, isDeleted: false, codeArticle: { notIn: aGarder } },
        data: champsSuppression(agent.login),
      });

      const erreurs = controlerInventaire(saisie.filter((l) => aGarder.includes(l.codeArticle)));
      if (cloturer) {
        if (!aGarder.length) throw new ErreurCompteRendu("Inventaire vide : saisissez au moins un article avant de clôturer.");
        if (erreurs.length) throw new ErreurCompteRendu(`Clôture impossible : ${erreurs.join(" ; ")}.`);
        await tx.inventaire.update({
          where: { codeMagasin_dateJournee: cle },
          data: { statut: "CLOTURE", dateCloture: new Date(), loginCloture: agent.login, modifiePar: agent.login },
        });
      }
      const valeur = (await valorisationDepot(tx, codeDepot, dateJournee, { tous: true })).get(codeMagasin);
      await auditer(
        {
          action: cloturer ? "INVENTAIRE_CLOTURE" : "INVENTAIRE_ENREGISTRE",
          login: agent.login,
          codeRole: agent.role,
          entite: "Inventaire",
          cleEntite: `${codeMagasin}/${dateJournee}`,
          apres: { articles: aGarder.length, nonComptes: erreurs, valorisation: valeur?.valeur },
        },
        tx,
      );
      return { articles: aGarder.length, erreurs, cloture: cloturer };
    },
    { timeout: 60_000 },
  );
}

// ───────────────────────────── Administrateur : réouverture ─────────────────────────────

/**
 * Réouverture exceptionnelle d'un inventaire clôturé, motif obligatoire.
 * Si le compte rendu de la journée était soumis, il repasse en brouillon pour être corrigé puis resoumis.
 */
export async function rouvrirInventaire(admin: UtilisateurCourant, codeMagasin: string, dateJournee: string, motif: string) {
  if (admin.role !== ROLES.ADMINISTRATEUR) throw new ErreurCompteRendu("Réservé à l'administrateur.");
  const m = motif.trim();
  if (m.length < 10) throw new ErreurCompteRendu("Motif obligatoire (10 caractères au moins).");
  return prisma.$transaction(async (tx) => {
    const cle = { codeMagasin, dateJournee: enDate(dateJournee) };
    const en = await tx.inventaire.findUnique({ where: { codeMagasin_dateJournee: cle } });
    if (!en) throw new ErreurCompteRendu("Inventaire introuvable.");
    if (en.statut !== "CLOTURE") throw new ErreurCompteRendu("Cet inventaire n'est pas clôturé.");
    const numero = (await tx.inventaireReouverture.count({ where: cle })) + 1;
    await tx.inventaireReouverture.create({ data: { ...cle, numero, motif: m.slice(0, 2000), loginAdmin: admin.login } });
    await tx.inventaire.update({
      where: { codeMagasin_dateJournee: cle },
      data: { statut: "EN_COURS", nbReouvertures: { increment: 1 }, version: { increment: 1 }, modifiePar: admin.login },
    });
    const cr = await tx.compteRendu.findFirst({ where: { codeDepot: en.codeDepot, dateJournee: cle.dateJournee } });
    const crRouvert = cr?.statut === "SOUMIS";
    if (cr && crRouvert) {
      await tx.compteRendu.update({
        where: { numero: cr.numero },
        data: { statut: "BROUILLON", dateSoumission: null, version: { increment: 1 }, modifiePar: admin.login },
      });
    }
    await auditer(
      {
        action: "INVENTAIRE_ROUVERT",
        login: admin.login,
        codeRole: admin.role,
        entite: "Inventaire",
        cleEntite: `${codeMagasin}/${dateJournee}`,
        avant: { statut: "CLOTURE", compteRendu: cr ? { numero: cr.numero, statut: cr.statut } : null },
        apres: { statut: "EN_COURS", reouverture: numero, compteRendu: crRouvert ? { numero: cr!.numero, statut: "BROUILLON" } : undefined },
        detail: m,
      },
      tx,
    );
    return { numero, compteRendu: crRouvert ? cr!.numero : null };
  });
}

// ───────────────────────────── Valorisation et consultation ─────────────────────────────

/**
 * Valorisation des inventaires d'un dépôt pour une journée, par magasin (dinars au coût de revient).
 * Par défaut seuls les inventaires clôturés comptent : ce sont eux qui alimentent le compte rendu.
 */
export async function valorisationDepot(tx: Client, codeDepot: string, dateJournee: string, options?: { tous?: boolean }) {
  const [entetes, lignes] = await Promise.all([
    tx.inventaire.findMany({ where: { codeDepot, dateJournee: enDate(dateJournee) } }),
    tx.inventaireLigne.findMany({ where: { codeDepot, dateJournee: enDate(dateJournee) } }),
  ]);
  const resultat = new Map<string, { statut: "EN_COURS" | "CLOTURE"; valeur: ReturnType<typeof valoriserInventaire>; nbLignes: number; sansPrix: number; erreurs: string[] }>();
  for (const e of entetes) {
    if (!options?.tous && e.statut !== "CLOTURE") {
      resultat.set(e.codeMagasin, { statut: e.statut, valeur: valoriserInventaire([]), nbLignes: 0, sansPrix: 0, erreurs: [] });
      continue;
    }
    const saisies: (SaisieInventaire & { prixRevient: number })[] = lignes
      .filter((l) => l.codeMagasin === e.codeMagasin)
      .map((l) => ({
        codeArticle: l.codeArticle,
        stockInitial: l.stockInitial.toNumber(),
        receptions: l.receptions.toNumber(),
        ventes: l.ventes.toNumber(),
        retours: l.retours.toNumber(),
        stockFinalReel: num(l.stockFinalReel),
        prixRevient: l.prixRevient.toNumber(),
      }));
    resultat.set(e.codeMagasin, {
      statut: e.statut,
      valeur: valoriserInventaire(saisies),
      nbLignes: saisies.length,
      sansPrix: saisies.filter((x) => x.prixRevient === 0).length,
      erreurs: controlerInventaire(saisies),
    });
  }
  return resultat;
}

/** Lignes d'un inventaire (lecture seule), pour le compte rendu ou la consultation administrateur. */
export async function lignesInventaire(where: Prisma.InventaireLigneWhereInput) {
  const lignes = await prisma.inventaireLigne.findMany({
    where,
    include: { article: { select: { designation: true } }, inventaire: { include: { magasin: { include: { societe: true } } } } },
    orderBy: [{ codeMagasin: "asc" }, { codeArticle: "asc" }],
  });
  return lignes.map((l) => ({
    codeMagasin: l.codeMagasin,
    magasin: l.inventaire.magasin.libelle,
    societe: l.inventaire.magasin.societe.libelle,
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

export const detailInventaire = (codeDepot: string, dateJournee: string) => lignesInventaire({ codeDepot, dateJournee: enDate(dateJournee) });

export type FiltresInventaire = { du?: string; au?: string; depot?: string; magasin?: string; statut?: string };

export async function listerInventaires(f: FiltresInventaire) {
  const date = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? enDate(s) : undefined);
  const where: Prisma.InventaireWhereInput = {
    ...(date(f.du) || date(f.au) ? { dateJournee: { ...(date(f.du) ? { gte: date(f.du) } : {}), ...(date(f.au) ? { lte: date(f.au) } : {}) } } : {}),
    ...(f.depot ? { codeDepot: f.depot } : {}),
    ...(f.magasin ? { codeMagasin: f.magasin } : {}),
    ...(f.statut === "EN_COURS" || f.statut === "CLOTURE" ? { statut: f.statut } : {}),
  };
  const entetes = await prisma.inventaire.findMany({
    where,
    orderBy: [{ dateJournee: "desc" }, { codeMagasin: "asc" }],
    take: 300,
    include: {
      magasin: { include: { societe: true, depot: true } },
      lignes: { where: { isDeleted: false }, select: { ecart: true, prixRevient: true, stockFinalReel: true, modifiePar: true } },
    },
  });
  return entetes.map((e) => ({
    codeMagasin: e.codeMagasin,
    dateJournee: jour(e.dateJournee),
    depot: e.magasin.depot.libelle,
    magasin: e.magasin.libelle,
    societe: e.magasin.societe.libelle,
    statut: e.statut,
    dateCloture: e.dateCloture,
    loginCloture: e.loginCloture,
    nbReouvertures: e.nbReouvertures,
    nbLignes: e.lignes.length,
    nonComptes: e.lignes.filter((l) => l.stockFinalReel === null).length,
    ecartValorise: e.lignes.reduce((s, l) => s + Math.round(l.ecart.toNumber() * l.prixRevient.toNumber() * 1000), 0) / 1000,
  }));
}

export async function detailInventaireAdmin(codeMagasin: string, dateJournee: string) {
  const en = await entete(prisma, codeMagasin, dateJournee);
  if (!en) return null;
  const magasin = await prisma.magasin.findUniqueOrThrow({ where: { code: codeMagasin }, include: { societe: true, depot: true } });
  const cr = await prisma.compteRendu.findFirst({ where: { codeDepot: en.codeDepot, dateJournee: en.dateJournee }, select: { numero: true, statut: true } });
  return {
    codeMagasin,
    dateJournee,
    magasin: magasin.libelle,
    societe: magasin.societe.libelle,
    depot: magasin.depot.libelle,
    entete: vueEntete(en)!,
    compteRendu: cr,
    lignes: await lignesInventaire({ codeMagasin, dateJournee: enDate(dateJournee) }),
  };
}

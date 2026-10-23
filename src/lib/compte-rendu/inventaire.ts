import "server-only";
import { z } from "zod";
import type { EtapeInventaire, Prisma } from "@prisma/client";
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

export const ETAPES = ["RECEPTIONS", "VENTES", "RETOURS"] as const satisfies readonly EtapeInventaire[];
export const ETAPES_AVEC_CODES = ["RECEPTIONS", "RETOURS"] as const;
export const LIBELLES_ETAPES: Record<EtapeInventaire, string> = { RECEPTIONS: "Réceptions", VENTES: "Ventes", RETOURS: "Retours" };
/** Accord du participe : « réceptions validées », « retours validés ». */
export const VALIDEES: Record<EtapeInventaire, string> = { RECEPTIONS: "validées", VENTES: "validées", RETOURS: "validés" };
const COLONNES_ETAPES = { RECEPTIONS: "receptions", VENTES: "ventes", RETOURS: "retours" } as const;

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
  if (!magasin) return { ...base, magasin: null, lignes: [], reprise: null, modifiable: false, compteRenduSoumis: false, entete: null, derniereSaisie: null, statuts: {} as Record<string, "EN_COURS" | "CLOTURE">, etapes: null };

  const [articles, existantes, precedent, soumis, en, statuts, etapes] = await Promise.all([
    prisma.article.findMany({ include: { famille: true }, orderBy: [{ codeFamille: "asc" }, { designation: "asc" }] }),
    prisma.inventaireLigne.findMany({ where: { codeMagasin: magasin.code, dateJournee: enDate(dateJournee) } }),
    inventairePrecedent(prisma, magasin.code, dateJournee),
    compteRenduSoumis(prisma, codeDepot, dateJournee),
    entete(prisma, magasin.code, dateJournee),
    prisma.inventaire.findMany({ where: { codeDepot, dateJournee: enDate(dateJournee) }, select: { codeMagasin: true, statut: true } }),
    etapesEtCodes(prisma, magasin.code, dateJournee),
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
        // Jamais saisi par l'agent : stock final réel du dernier inventaire (0 pour un premier inventaire).
        stockInitial: initialRepris ?? num(l?.stockInitial) ?? 0,
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
    etapes,
  };
}

export type InventaireJournee = Awaited<ReturnType<typeof chargerInventaire>>;

/** Étapes validées et codes saisis d'un inventaire. */
async function etapesEtCodes(tx: Client, codeMagasin: string, dateJournee: string) {
  const cle = { codeMagasin, dateJournee: enDate(dateJournee), isDeleted: false };
  const [etapes, codes] = await Promise.all([
    tx.inventaireEtape.findMany({ where: cle }),
    tx.inventaireCode.findMany({ where: cle, orderBy: { dateCreation: "asc" } }),
  ]);
  return Object.fromEntries(
    ETAPES.map((e) => {
      const v = etapes.find((x) => x.etape === e);
      return [e, { validee: v ? { date: v.dateValidation, login: v.loginValidation } : null, codes: codes.filter((c) => c.etape === e).map((c) => c.code) }];
    }),
  ) as Record<EtapeInventaire, { validee: { date: Date; login: string } | null; codes: string[] }>;
}

export type ActionInventaire =
  | { type: "BROUILLON" }
  | { type: "VALIDER"; etape: EtapeInventaire }
  | { type: "ANNULER_VALIDATION"; etape: EtapeInventaire }
  | { type: "CLOTURER" };

const schemaAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("BROUILLON") }),
  z.object({ type: z.literal("VALIDER"), etape: z.enum(ETAPES) }),
  z.object({ type: z.literal("ANNULER_VALIDATION"), etape: z.enum(ETAPES) }),
  z.object({ type: z.literal("CLOTURER") }),
]);
const schemaCode = z.string().trim().min(1).max(50).regex(/^[\p{L}\p{N} ._/-]+$/u, "Code invalide : lettres, chiffres, espace, point, tiret, barre oblique");
export const schemaCodes = z.object({ RECEPTIONS: z.array(schemaCode).max(50), RETOURS: z.array(schemaCode).max(50) });

/**
 * Enregistre l'inventaire selon l'action demandée :
 * - BROUILLON : quantités et codes des étapes non validées ;
 * - VALIDER une étape : enregistre puis fige sa colonne (codes obligatoires si réceptions / retours non nuls) ;
 * - ANNULER_VALIDATION : rouvre la colonne (avant clôture uniquement) ;
 * - CLOTURER : exige les trois étapes validées et le stock final réel de chaque article concerné.
 * Les colonnes des étapes validées sont toujours reprises de la base : le navigateur ne peut pas les modifier.
 */
export async function enregistrerInventaire(agent: UtilisateurCourant, dateJournee: string, codeMagasin: string, brut: unknown, actionBrute: unknown, codesBruts: unknown) {
  const codeDepot = depotDeLAgent(agent);
  if (!(await journeesAccessibles(codeDepot)).dates.includes(dateJournee)) throw new ErreurCompteRendu("Cette journée n'est plus ouverte à la saisie.");
  const saisie = schemaInventaire.parse(brut);
  const action = schemaAction.parse(actionBrute);
  const codesSaisis = schemaCodes.parse(codesBruts);
  const normaliser = (l: string[]) => [...new Set(l.map((c) => c.replace(/\s+/g, " ").toUpperCase()))];

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

      const avant = await etapesEtCodes(tx, codeMagasin, dateJournee);
      // Étapes figées pour cette action : celles validées, sauf celle dont on annule la validation.
      const figees = new Set(ETAPES.filter((e) => avant[e].validee && !(action.type === "ANNULER_VALIDATION" && action.etape === e)));
      if (action.type === "VALIDER" && figees.has(action.etape)) throw new ErreurCompteRendu(`${LIBELLES_ETAPES[action.etape]} déjà ${VALIDEES[action.etape]}.`);
      if (action.type === "ANNULER_VALIDATION" && !avant[action.etape].validee) throw new ErreurCompteRendu(`${LIBELLES_ETAPES[action.etape]} non ${VALIDEES[action.etape]}.`);

      const articles = new Map((await tx.article.findMany({ where: { codeArticle: { in: saisie.map((l) => l.codeArticle) } } })).map((a) => [a.codeArticle, a]));
      const precedent = await inventairePrecedent(tx, codeMagasin, dateJournee);
      const anciennes = new Map((await tx.inventaireLigne.findMany({ where: cle })).map((l) => [l.codeArticle, l]));
      const aGarder: string[] = [];
      for (const l of saisie) {
        const a = articles.get(l.codeArticle);
        if (!a) throw new ErreurCompteRendu(`Article inconnu : ${l.codeArticle}`);
        const o = anciennes.get(l.codeArticle);
        // Continuité : le stock initial n'est jamais saisi, c'est le stock final réel du dernier inventaire
        // (pour un premier inventaire : la valeur déjà enregistrée, sinon 0).
        l.stockInitial = precedent ? (precedent.stock.get(l.codeArticle) ?? 0) : (num(o?.stockInitial) ?? 0);
        for (const e of figees) l[COLONNES_ETAPES[e]] = num(o?.[COLONNES_ETAPES[e]]) ?? 0;
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
      // Une ligne d'une étape figée ne peut pas disparaître : elle est conservée telle quelle.
      for (const [code, o] of anciennes) {
        if (!aGarder.includes(code) && [...figees].some((e) => (num(o[COLONNES_ETAPES[e]]) ?? 0) !== 0)) aGarder.push(code);
      }
      await tx.inventaireLigne.updateMany({
        where: { ...cle, isDeleted: false, codeArticle: { notIn: aGarder } },
        data: champsSuppression(agent.login),
      });

      // Codes des étapes non figées : remplacés par la saisie.
      for (const e of ETAPES_AVEC_CODES) {
        if (figees.has(e)) continue;
        const nouveaux = normaliser(codesSaisis[e]);
        await tx.inventaireCode.updateMany({ where: { ...cle, etape: e, isDeleted: false, code: { notIn: nouveaux } }, data: champsSuppression(agent.login) });
        for (const code of nouveaux) {
          await tx.inventaireCode.upsert({
            where: { codeMagasin_dateJournee_etape_code: { ...cle, etape: e, code } },
            create: { ...cle, etape: e, code, creePar: agent.login, modifiePar: agent.login },
            update: { isDeleted: false, isActif: true, dateSuppression: null, supprimePar: null, modifiePar: agent.login },
          });
        }
      }

      const lignesGardees = saisie.filter((l) => aGarder.includes(l.codeArticle));
      if (action.type === "VALIDER") {
        const e = action.etape;
        const total = lignesGardees.reduce((s, l) => s + (l[COLONNES_ETAPES[e]] ?? 0), 0);
        if (e !== "VENTES" && total > 0 && !normaliser(codesSaisis[e]).length) {
          throw new ErreurCompteRendu(`Saisissez au moins un code de ${e === "RECEPTIONS" ? "réception" : "retour"} avant de valider.`);
        }
        await tx.inventaireEtape.upsert({
          where: { codeMagasin_dateJournee_etape: { ...cle, etape: e } },
          create: { ...cle, etape: e, loginValidation: agent.login, creePar: agent.login, modifiePar: agent.login },
          update: { dateValidation: new Date(), loginValidation: agent.login, isDeleted: false, isActif: true, dateSuppression: null, supprimePar: null, modifiePar: agent.login },
        });
      }
      if (action.type === "ANNULER_VALIDATION") {
        await tx.inventaireEtape.update({ where: { codeMagasin_dateJournee_etape: { ...cle, etape: action.etape } }, data: champsSuppression(agent.login) });
      }

      const erreurs = controlerInventaire(lignesGardees);
      if (action.type === "CLOTURER") {
        const manquantes = ETAPES.filter((e) => !avant[e].validee);
        if (manquantes.length) throw new ErreurCompteRendu(`Clôture impossible : validez d'abord ${manquantes.map((e) => LIBELLES_ETAPES[e].toLowerCase()).join(", ")}.`);
        if (!aGarder.length) throw new ErreurCompteRendu("Inventaire vide : saisissez au moins un article avant de clôturer.");
        if (erreurs.length) throw new ErreurCompteRendu(`Clôture impossible : ${erreurs.join(" ; ")}.`);
        await tx.inventaire.update({
          where: { codeMagasin_dateJournee: cle },
          data: { statut: "CLOTURE", dateCloture: new Date(), loginCloture: agent.login, modifiePar: agent.login },
        });
      }
      const valeur = (await valorisationDepot(tx, codeDepot, dateJournee, { tous: true })).get(codeMagasin);
      const apres = await etapesEtCodes(tx, codeMagasin, dateJournee);
      await auditer(
        {
          action: { BROUILLON: "INVENTAIRE_ENREGISTRE", VALIDER: "INVENTAIRE_ETAPE_VALIDEE", ANNULER_VALIDATION: "INVENTAIRE_ETAPE_ANNULEE", CLOTURER: "INVENTAIRE_CLOTURE" }[action.type],
          login: agent.login,
          codeRole: agent.role,
          entite: "Inventaire",
          cleEntite: `${codeMagasin}/${dateJournee}`,
          detail: "etape" in action ? action.etape : undefined,
          apres: {
            articles: aGarder.length,
            nonComptes: erreurs,
            valorisation: valeur?.valeur,
            etapesValidees: ETAPES.filter((e) => apres[e].validee),
            codes: { RECEPTIONS: apres.RECEPTIONS.codes, RETOURS: apres.RETOURS.codes },
          },
        },
        tx,
      );
      return { articles: aGarder.length, erreurs, action: action.type, etape: "etape" in action ? action.etape : null, magasin: magasin.code, libelleMagasin: magasin.libelle };
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
    etapes: await etapesEtCodes(prisma, codeMagasin, dateJournee),
    lignes: await lignesInventaire({ codeMagasin, dateJournee: enDate(dateJournee) }),
  };
}

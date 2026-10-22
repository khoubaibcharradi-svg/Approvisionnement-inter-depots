import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, champsSuppression, type Transaction } from "../prisma";
import { auditer } from "../audit";
import { prochainNumero } from "../compteur";
import { parametreNombre } from "../parametres";
import { ROLES } from "../constantes";
import type { UtilisateurCourant } from "../auth/session";
import {
  NATURES_CAISSE,
  calculerCaisse,
  calculerDepenses,
  calculerRecette,
  calculerStock,
  controlerCompletude,
  totaux,
  type SaisieCompteRendu,
} from "./calculs";

export class ErreurCompteRendu extends Error {}

// ───────────────────────────── Saisie (validation de forme) ─────────────────────────────

const montant = z.number().finite().min(-1e10).max(1e10).nullable();
const texte = (max: number) => z.string().max(max).transform((s) => s.trim());

export const schemaSaisie = z.object({
  stocks: z
    .array(z.object({ codeMagasin: z.string().max(30), stockInitial: montant, receptions: montant, ventes: montant, retours: montant, stockFinalReel: montant }))
    .max(100),
  justificationEcarts: texte(5000),
  aucunVehicule: z.boolean(),
  vehicules: z
    .array(
      z.object({
        codeSociete: z.string().max(30),
        vendeurChauffeur: texte(100),
        matricule: texte(30),
        heureEntree: z.string().max(5),
        heureSortie: z.string().max(5),
        observations: texte(500),
      }),
    )
    .max(200),
  recettes: z
    .array(z.object({ agent: texte(100), codeSociete: z.string().max(30), caComptant: montant, recouvrement: montant, caCredit: montant, recette: montant }))
    .max(200),
  observationsRecettes: texte(5000),
  caisses: z
    .array(
      z.object({
        nature: z.enum(NATURES_CAISSE),
        precision: texte(100),
        soldeVeille: montant,
        encaissements: montant,
        transferts: montant,
        soldeReel: montant,
        observations: texte(500),
      }),
    )
    .max(4),
  observationsCaisse: texte(5000),
  soldeVeilleDepenses: montant,
  depenses: z.array(z.object({ libelle: texte(200), debit: montant, credit: montant, validePar: texte(100) })).max(200),
  observationsDepenses: texte(5000),
  etatCameras: texte(5000),
  ressourcesHumaines: texte(5000),
  remarques: texte(5000),
}) satisfies z.ZodType<SaisieCompteRendu, unknown>;

// ───────────────────────────── Dates ─────────────────────────────

const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const enDate = (j: string) => new Date(`${j}T00:00:00.000Z`);
const jour = (d: Date) => d.toISOString().slice(0, 10);
const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : d.toNumber());

/** Journées ouvertes à la saisie pour un agent : aujourd'hui et les CR_JOURS_RETARD_MAX jours précédents. */
export async function journeesAutorisees() {
  const retard = await parametreNombre("CR_JOURS_RETARD_MAX");
  const t = enDate(aujourdhui());
  return Array.from({ length: retard + 1 }, (_, i) => jour(new Date(t.getTime() - i * 86_400_000)));
}

// ───────────────────────────── Chargement ─────────────────────────────

const inclusions = {
  depot: true,
  agent: { select: { nomComplet: true, login: true } },
  stocks: { where: { isDeleted: false }, include: { magasin: { include: { societe: true } } }, orderBy: { codeMagasin: "asc" } },
  vehicules: { where: { isDeleted: false }, orderBy: { numeroLigne: "asc" } },
  recettes: { where: { isDeleted: false }, orderBy: { numeroLigne: "asc" } },
  caisses: { where: { isDeleted: false } },
  depenses: { where: { isDeleted: false }, orderBy: { numeroLigne: "asc" } },
  pieces: { where: { isDeleted: false }, orderBy: { numeroPiece: "asc" } },
} satisfies Prisma.CompteRenduInclude;

type CompteRenduComplet = Prisma.CompteRenduGetPayload<{ include: typeof inclusions }>;

/** Convertit un compte rendu enregistré en saisie (format du formulaire). */
function versSaisie(cr: CompteRenduComplet): SaisieCompteRendu {
  return {
    stocks: cr.stocks.map((l) => ({
      codeMagasin: l.codeMagasin,
      stockInitial: num(l.stockInitial),
      receptions: num(l.receptions),
      ventes: num(l.ventes),
      retours: num(l.retours),
      stockFinalReel: num(l.stockFinalReel),
    })),
    justificationEcarts: cr.justificationEcarts ?? "",
    aucunVehicule: cr.aucunVehicule,
    vehicules: cr.vehicules.map((v) => ({
      codeSociete: v.codeSociete,
      vendeurChauffeur: v.vendeurChauffeur,
      matricule: v.matricule,
      heureEntree: v.heureEntree,
      heureSortie: v.heureSortie ?? "",
      observations: v.observations ?? "",
    })),
    recettes: cr.recettes.map((r) => ({
      agent: r.agent,
      codeSociete: r.codeSociete,
      caComptant: num(r.caComptant),
      recouvrement: num(r.recouvrement),
      caCredit: num(r.caCredit),
      recette: num(r.recette),
    })),
    observationsRecettes: cr.observationsRecettes ?? "",
    caisses: NATURES_CAISSE.map((nature) => {
      const c = cr.caisses.find((x) => x.nature === nature);
      return {
        nature,
        precision: c?.precision ?? "",
        soldeVeille: num(c?.soldeVeille),
        encaissements: num(c?.encaissements),
        transferts: num(c?.transferts),
        soldeReel: num(c?.soldeReel),
        observations: c?.observations ?? "",
      };
    }),
    observationsCaisse: cr.observationsCaisse ?? "",
    soldeVeilleDepenses: num(cr.soldeVeilleDepenses),
    depenses: cr.depenses.map((d) => ({ libelle: d.libelle, debit: num(d.debit), credit: num(d.credit), validePar: d.validePar })),
    observationsDepenses: cr.observationsDepenses ?? "",
    etatCameras: cr.etatCameras ?? "",
    ressourcesHumaines: cr.ressourcesHumaines ?? "",
    remarques: cr.remarques ?? "",
  };
}

/** Dernier compte rendu soumis du dépôt avant la journée : il fournit stock initial et soldes veille. */
async function precedent(tx: Transaction | typeof prisma, codeDepot: string, dateJournee: string) {
  return tx.compteRendu.findFirst({
    where: { codeDepot, statut: "SOUMIS", dateJournee: { lt: enDate(dateJournee) } },
    orderBy: { dateJournee: "desc" },
    include: inclusions,
  });
}

/** Valeurs reprises de la veille : elles ne sont pas modifiables par l'agent (continuité des soldes). */
function reprise(p: CompteRenduComplet | null) {
  if (!p) return null;
  return {
    numero: p.numero,
    date: jour(p.dateJournee),
    stockInitial: Object.fromEntries(p.stocks.map((l) => [l.codeMagasin, l.stockFinalReel.toNumber()])) as Record<string, number>,
    soldeVeille: Object.fromEntries(p.caisses.map((c) => [c.nature, c.soldeReel.toNumber()])) as Record<string, number>,
    soldeVeilleDepenses: p.soldeFinalDepenses.toNumber(),
  };
}

function exigerAgent(a: UtilisateurCourant) {
  if (a.role !== ROLES.AGENT_DEPOT) throw new ErreurCompteRendu("Réservé aux agents dépôt.");
  if (!a.codeDepotAgent) throw new ErreurCompteRendu("Aucun dépôt ne vous est affecté : contactez l'administrateur.");
  return a.codeDepotAgent;
}

export async function chargerJournee(agent: UtilisateurCourant, dateJournee: string) {
  const codeDepot = exigerAgent(agent);
  const dates = await journeesAutorisees();
  const [depot, magasins, societes, existant, veille] = await Promise.all([
    prisma.depot.findUniqueOrThrow({ where: { code: codeDepot } }),
    prisma.magasin.findMany({ where: { codeDepot, isActif: true }, include: { societe: true }, orderBy: [{ codeSociete: "asc" }, { libelle: "asc" }] }),
    prisma.societe.findMany({ where: { isActif: true }, orderBy: { ordre: "asc" } }),
    prisma.compteRendu.findFirst({ where: { codeDepot, dateJournee: enDate(dateJournee) }, include: inclusions }),
    precedent(prisma, codeDepot, dateJournee),
  ]);
  const r = reprise(veille);
  let saisie: SaisieCompteRendu;
  if (existant) {
    saisie = versSaisie(existant);
    // Un magasin ajouté depuis le brouillon apparaît automatiquement.
    for (const m of magasins) {
      if (!saisie.stocks.some((s) => s.codeMagasin === m.code)) {
        saisie.stocks.push({ codeMagasin: m.code, stockInitial: r?.stockInitial[m.code] ?? null, receptions: null, ventes: null, retours: null, stockFinalReel: null });
      }
    }
  } else {
    saisie = {
      stocks: magasins.map((m) => ({ codeMagasin: m.code, stockInitial: r?.stockInitial[m.code] ?? null, receptions: null, ventes: null, retours: null, stockFinalReel: null })),
      justificationEcarts: "",
      aucunVehicule: false,
      vehicules: [],
      recettes: [],
      observationsRecettes: "",
      caisses: NATURES_CAISSE.map((nature) => ({ nature, precision: "", soldeVeille: r?.soldeVeille[nature] ?? null, encaissements: null, transferts: null, soldeReel: null, observations: "" })),
      observationsCaisse: "",
      soldeVeilleDepenses: r?.soldeVeilleDepenses ?? null,
      depenses: [],
      observationsDepenses: "",
      etatCameras: "",
      ressourcesHumaines: "",
      remarques: "",
    };
  }
  return {
    dateJournee,
    datesAutorisees: dates,
    modifiable: dates.includes(dateJournee) && existant?.statut !== "SOUMIS",
    depot: { code: depot.code, libelle: depot.libelle },
    magasins: magasins.map((m) => ({ code: m.code, libelle: m.libelle, societe: m.societe.libelle, codeSociete: m.codeSociete })),
    societes: societes.map((s) => ({ code: s.code, libelle: s.libelle })),
    numero: existant?.numero ?? null,
    version: existant?.version ?? null,
    statut: existant?.statut ?? null,
    agent: existant?.agent.nomComplet ?? null,
    dateSoumission: existant?.dateSoumission ?? null,
    pieces: (existant?.pieces ?? []).map((p) => ({ numeroPiece: p.numeroPiece, nomFichier: p.nomFichier, taille: p.taille })),
    reprise: r ? { numero: r.numero, date: r.date, magasins: Object.keys(r.stockInitial), caisse: Object.keys(r.soldeVeille).length > 0 } : null,
    pieceObligatoire: (await parametreNombre("CR_PIECE_OBLIGATOIRE")) === 1,
    saisie,
  };
}

export type JourneeCompteRendu = Awaited<ReturnType<typeof chargerJournee>>;

// ───────────────────────────── Enregistrement ─────────────────────────────

type Champs = { creePar: string; modifiePar: string };
const actif = (login: string) => ({ isDeleted: false, isActif: true, dateSuppression: null, supprimePar: null, modifiePar: login });

/**
 * Enregistre le brouillon (ou le soumet). Les montants calculés sont recalculés ici :
 * les valeurs envoyées par le navigateur ne sont jamais reprises telles quelles.
 */
export async function enregistrer(agent: UtilisateurCourant, dateJournee: string, version: number | null, brut: unknown, soumettre: boolean) {
  const codeDepot = exigerAgent(agent);
  if (!(await journeesAutorisees()).includes(dateJournee)) {
    throw new ErreurCompteRendu("Cette journée n'est plus ouverte à la saisie : contactez l'administrateur.");
  }
  const saisie = schemaSaisie.parse(brut);
  const pieceObligatoire = (await parametreNombre("CR_PIECE_OBLIGATOIRE")) === 1;

  return prisma.$transaction(
    async (tx) => {
      const magasins = await tx.magasin.findMany({ where: { codeDepot, isActif: true } });
      const parCode = new Map(magasins.map((m) => [m.code, m]));
      const societes = new Set((await tx.societe.findMany({ where: { isActif: true } })).map((s) => s.code));
      for (const l of saisie.stocks) if (!parCode.has(l.codeMagasin)) throw new ErreurCompteRendu(`Magasin ${l.codeMagasin} hors de votre dépôt.`);
      for (const x of [...saisie.vehicules, ...saisie.recettes]) {
        if (x.codeSociete && !societes.has(x.codeSociete)) throw new ErreurCompteRendu(`Société inconnue : ${x.codeSociete}`);
      }

      // Continuité : stock initial et soldes veille repris du dernier compte rendu soumis.
      const r = reprise(await precedent(tx, codeDepot, dateJournee));
      if (r) {
        for (const l of saisie.stocks) if (l.codeMagasin in r.stockInitial) l.stockInitial = r.stockInitial[l.codeMagasin];
        for (const c of saisie.caisses) if (c.nature in r.soldeVeille) c.soldeVeille = r.soldeVeille[c.nature];
        saisie.soldeVeilleDepenses = r.soldeVeilleDepenses;
      }

      let cr = await tx.compteRendu.findFirst({ where: { codeDepot, dateJournee: enDate(dateJournee) }, include: { pieces: { where: { isDeleted: false } } } });
      if (cr?.statut === "SOUMIS") throw new ErreurCompteRendu("Ce compte rendu est déjà soumis : il n'est plus modifiable.");
      if (cr && cr.version !== version) throw new ErreurCompteRendu("Le compte rendu a été modifié entre-temps (autre agent du dépôt). Rechargez la page.");

      if (soumettre) {
        const manques = controlerCompletude(saisie, { nbPieces: cr?.pieces.length ?? 0, pieceObligatoire });
        if (manques.length) throw new ErreurCompteRendu(`Compte rendu incomplet :\n• ${manques.join("\n• ")}`);
      }

      const depenses = calculerDepenses(saisie.soldeVeilleDepenses, saisie.depenses);
      const entete = {
        justificationEcarts: saisie.justificationEcarts || null,
        aucunVehicule: saisie.aucunVehicule,
        observationsRecettes: saisie.observationsRecettes || null,
        observationsCaisse: saisie.observationsCaisse || null,
        soldeVeilleDepenses: saisie.soldeVeilleDepenses ?? 0,
        soldeFinalDepenses: depenses.soldeFinal,
        observationsDepenses: saisie.observationsDepenses || null,
        etatCameras: saisie.etatCameras || null,
        ressourcesHumaines: saisie.ressourcesHumaines || null,
        remarques: saisie.remarques || null,
        ...(soumettre ? { statut: "SOUMIS" as const, dateSoumission: new Date() } : {}),
      };

      let numero: string;
      if (!cr) {
        numero = await prochainNumero(tx, "COMPTE_RENDU", "CR");
        cr = await tx.compteRendu.create({
          data: { numero, codeDepot, dateJournee: enDate(dateJournee), loginAgent: agent.login, ...entete, creePar: agent.login },
          include: { pieces: { where: { isDeleted: false } } },
        });
      } else {
        numero = cr.numero;
        const maj = await tx.compteRendu.updateMany({
          where: { numero, version: cr.version, statut: "BROUILLON" },
          data: { ...entete, loginAgent: agent.login, version: { increment: 1 }, modifiePar: agent.login },
        });
        if (maj.count === 0) throw new ErreurCompteRendu("Le compte rendu a été modifié entre-temps. Rechargez la page.");
      }
      const c: Champs = { creePar: agent.login, modifiePar: agent.login };

      // Lignes : upsert sur la clé métier, puis suppression logique des lignes retirées.
      for (const l of saisie.stocks) {
        const calc = calculerStock(l);
        const data = {
          codeSociete: parCode.get(l.codeMagasin)!.codeSociete,
          stockInitial: l.stockInitial ?? 0,
          receptions: l.receptions ?? 0,
          ventes: l.ventes ?? 0,
          retours: l.retours ?? 0,
          stockFinalReel: l.stockFinalReel ?? 0,
          ...calc,
        };
        await tx.compteRenduStock.upsert({
          where: { numeroCompteRendu_codeMagasin: { numeroCompteRendu: numero, codeMagasin: l.codeMagasin } },
          create: { numeroCompteRendu: numero, codeMagasin: l.codeMagasin, ...data, ...c },
          update: { ...data, ...actif(agent.login) },
        });
      }
      await tx.compteRenduStock.updateMany({
        where: { numeroCompteRendu: numero, isDeleted: false, codeMagasin: { notIn: saisie.stocks.map((l) => l.codeMagasin) } },
        data: champsSuppression(agent.login),
      });

      const lignesNumerotees = async <T,>(
        modele: "compteRenduVehicule" | "compteRenduRecette" | "compteRenduDepense",
        lignes: T[],
        donnees: (l: T, i: number) => Record<string, unknown>,
      ) => {
        // Délégué générique : les trois tables partagent la clé (numeroCompteRendu, numeroLigne).
        const m = tx[modele] as unknown as {
          upsert: (a: unknown) => Promise<unknown>;
          updateMany: (a: unknown) => Promise<unknown>;
        };
        for (const [i, l] of lignes.entries()) {
          const cle = { numeroCompteRendu: numero, numeroLigne: i + 1 };
          await m.upsert({
            where: { numeroCompteRendu_numeroLigne: cle },
            create: { ...cle, ...donnees(l, i), ...c },
            update: { ...donnees(l, i), ...actif(agent.login) },
          });
        }
        await m.updateMany({ where: { numeroCompteRendu: numero, isDeleted: false, numeroLigne: { gt: lignes.length } }, data: champsSuppression(agent.login) });
      };

      await lignesNumerotees("compteRenduVehicule", saisie.vehicules, (v) => ({
        codeSociete: v.codeSociete,
        vendeurChauffeur: v.vendeurChauffeur,
        matricule: v.matricule.toUpperCase(),
        heureEntree: v.heureEntree,
        heureSortie: v.heureSortie || null,
        observations: v.observations || null,
      }));
      await lignesNumerotees("compteRenduRecette", saisie.recettes, (rec) => ({
        agent: rec.agent,
        codeSociete: rec.codeSociete,
        caComptant: rec.caComptant ?? 0,
        recouvrement: rec.recouvrement ?? 0,
        caCredit: rec.caCredit ?? 0,
        recette: rec.recette ?? 0,
        ...calculerRecette(rec),
      }));
      await lignesNumerotees("compteRenduDepense", saisie.depenses, (d, i) => ({
        libelle: d.libelle,
        debit: d.debit ?? 0,
        credit: d.credit ?? 0,
        solde: depenses.soldes[i],
        validePar: d.validePar,
      }));

      for (const k of saisie.caisses) {
        const data = {
          precision: k.precision || null,
          soldeVeille: k.soldeVeille ?? 0,
          encaissements: k.encaissements ?? 0,
          transferts: k.transferts ?? 0,
          soldeReel: k.soldeReel ?? 0,
          observations: k.observations || null,
          ...calculerCaisse(k),
        };
        await tx.compteRenduCaisse.upsert({
          where: { numeroCompteRendu_nature: { numeroCompteRendu: numero, nature: k.nature } },
          create: { numeroCompteRendu: numero, nature: k.nature, ...data, ...c },
          update: { ...data, ...actif(agent.login) },
        });
      }

      const t = totaux(saisie);
      await auditer(
        {
          action: soumettre ? "COMPTE_RENDU_SOUMIS" : "COMPTE_RENDU_BROUILLON",
          login: agent.login,
          codeRole: agent.role,
          entite: "CompteRendu",
          cleEntite: numero,
          apres: {
            depot: codeDepot,
            journee: dateJournee,
            ecartStock: t.stock.ecart,
            ecartRecettes: t.recettes.ecart,
            ecartCaisse: t.caisse.ecart,
            soldeFinalDepenses: t.depenses.soldeFinal,
            vehicules: saisie.vehicules.length,
            recettes: saisie.recettes.length,
            depenses: saisie.depenses.length,
          },
        },
        tx,
      );
      return numero;
    },
    { timeout: 30_000 },
  );
}

// ───────────────────────────── Pièces jointes ─────────────────────────────

export const TYPES_PIECES: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};
export const TAILLE_MAX_PIECE = 8 * 1024 * 1024;
const MAX_PIECES = 10;

export const dossierPieces = () =>
  path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.PIECES_DIR || "pieces-jointes");

async function brouillonDeLAgent(tx: Transaction, agent: UtilisateurCourant, numero: string) {
  const codeDepot = exigerAgent(agent);
  const cr = await tx.compteRendu.findUnique({ where: { numero }, include: { pieces: { where: { isDeleted: false } } } });
  if (!cr || cr.codeDepot !== codeDepot) throw new ErreurCompteRendu("Compte rendu introuvable.");
  if (cr.statut === "SOUMIS") throw new ErreurCompteRendu("Compte rendu déjà soumis : les pièces ne sont plus modifiables.");
  return cr;
}

export async function ajouterPiece(agent: UtilisateurCourant, numero: string, fichier: File) {
  const ext = fichier.name.toLowerCase().split(".").pop() ?? "";
  const typeMime = TYPES_PIECES[ext];
  if (!typeMime) throw new ErreurCompteRendu("Format accepté : PDF, Excel, CSV, JPG ou PNG.");
  if (!fichier.size || fichier.size > TAILLE_MAX_PIECE) throw new ErreurCompteRendu("Fichier vide ou trop volumineux (8 Mo maximum).");
  const contenu = Buffer.from(await fichier.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(contenu).digest("hex");

  return prisma.$transaction(async (tx) => {
    const cr = await brouillonDeLAgent(tx, agent, numero);
    if (cr.pieces.length >= MAX_PIECES) throw new ErreurCompteRendu(`${MAX_PIECES} pièces au maximum.`);
    const numeroPiece = (await tx.compteRenduPiece.count({ where: { numeroCompteRendu: numero } })) + 1;
    // Nom de stockage construit côté serveur : le nom d'origine n'est jamais utilisé comme chemin.
    const fichierStocke = `${numero}-${numeroPiece}-${sha256.slice(0, 12)}.${ext}`;
    fs.mkdirSync(dossierPieces(), { recursive: true });
    fs.writeFileSync(path.join(dossierPieces(), fichierStocke), contenu);
    await tx.compteRenduPiece.create({
      data: {
        numeroCompteRendu: numero,
        numeroPiece,
        nomFichier: fichier.name.replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 255),
        typeMime,
        taille: fichier.size,
        fichierStocke,
        sha256,
        creePar: agent.login,
      },
    });
    await auditer({ action: "COMPTE_RENDU_PIECE_AJOUTEE", login: agent.login, codeRole: agent.role, entite: "CompteRendu", cleEntite: numero, apres: { piece: numeroPiece, fichier: fichier.name, taille: fichier.size, sha256 } }, tx);
  });
}

export async function retirerPiece(agent: UtilisateurCourant, numero: string, numeroPiece: number) {
  await prisma.$transaction(async (tx) => {
    await brouillonDeLAgent(tx, agent, numero);
    await tx.compteRenduPiece.update({
      where: { numeroCompteRendu_numeroPiece: { numeroCompteRendu: numero, numeroPiece } },
      data: champsSuppression(agent.login),
    });
    await auditer({ action: "COMPTE_RENDU_PIECE_RETIREE", login: agent.login, codeRole: agent.role, entite: "CompteRendu", cleEntite: numero, avant: { piece: numeroPiece } }, tx);
  });
}

/** Pièce téléchargeable par l'administrateur ou par un agent du dépôt concerné. */
export async function pieceAutorisee(u: UtilisateurCourant, numero: string, numeroPiece: number) {
  const p = await prisma.compteRenduPiece.findUnique({
    where: { numeroCompteRendu_numeroPiece: { numeroCompteRendu: numero, numeroPiece } },
    include: { compteRendu: { select: { codeDepot: true } } },
  });
  if (!p) return null;
  const autorise = u.role === ROLES.ADMINISTRATEUR || (u.role === ROLES.AGENT_DEPOT && u.codeDepotAgent === p.compteRendu.codeDepot);
  return autorise ? { ...p, chemin: path.join(dossierPieces(), p.fichierStocke) } : null;
}

// ───────────────────────────── Consultation ─────────────────────────────

export type FiltresCompteRendu = { du?: string; au?: string; depot?: string; magasin?: string; agent?: string; statut?: string };

export function filtreCompteRendu(f: FiltresCompteRendu): Prisma.CompteRenduWhereInput {
  const date = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? enDate(s) : undefined);
  return {
    ...(date(f.du) || date(f.au) ? { dateJournee: { ...(date(f.du) ? { gte: date(f.du) } : {}), ...(date(f.au) ? { lte: date(f.au) } : {}) } } : {}),
    ...(f.depot ? { codeDepot: f.depot } : {}),
    ...(f.agent ? { loginAgent: f.agent } : {}),
    ...(f.statut === "BROUILLON" || f.statut === "SOUMIS" ? { statut: f.statut } : {}),
    ...(f.magasin ? { stocks: { some: { codeMagasin: f.magasin, isDeleted: false } } } : {}),
  };
}

export async function detailCompteRendu(numero: string) {
  const cr = await prisma.compteRendu.findUnique({ where: { numero }, include: inclusions });
  if (!cr) return null;
  const saisie = versSaisie(cr);
  return {
    numero: cr.numero,
    statut: cr.statut,
    dateJournee: jour(cr.dateJournee),
    depot: cr.depot.libelle,
    agent: `${cr.agent.nomComplet} (${cr.agent.login})`,
    dateSoumission: cr.dateSoumission,
    dateModification: cr.dateModification,
    magasins: Object.fromEntries(cr.stocks.map((l) => [l.codeMagasin, { libelle: l.magasin.libelle, societe: l.magasin.societe.libelle }])),
    pieces: cr.pieces.map((p) => ({ numeroPiece: p.numeroPiece, nomFichier: p.nomFichier, taille: p.taille })),
    saisie,
    totaux: totaux(saisie),
  };
}

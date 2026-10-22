"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditer } from "@/lib/audit";
import { journal } from "@/lib/journal";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ROLES } from "@/lib/constantes";
import { prochainNumero } from "@/lib/compteur";
import { codeMetier, lireNombre, lireTableur, sansEntete } from "@/lib/tableur";
import { quotaPlafonne } from "@/lib/workflow";

export type Resultat = { ok: boolean; message: string };

const ROLES_CODES = [ROLES.DIRECTEUR_COMMERCIAL, ROLES.ADMINISTRATEUR] as const;
const TAILLE_MAX = 5 * 1024 * 1024;

const schemaMaj = z.object({
  codeArticle: z.string().max(30),
  version: z.number().int(),
  nouveauCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,30}$/, "Code SKU invalide").optional(),
  pcb: z.number().int().min(1).max(10_000).nullable().optional(),
  stockPieces: z.number().int().min(0).max(100_000_000).optional(),
  quotaPieces: z.number().int().min(0).max(100_000_000).optional(),
  isActif: z.boolean().optional(),
});

/** Mise à jour d'un article, chaque champ n'étant modifiable que par le rôle habilité (§3, module 6). */
export async function majArticle(saisie: unknown): Promise<Resultat> {
  const u = await exigerUtilisateur();
  const p = schemaMaj.safeParse(saisie);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Saisie invalide" };
  const s = p.data;
  const refus = async (champ: string) => {
    await auditer({ action: "ARTICLE_MAJ_REFUSEE", login: u.login, codeRole: u.role, entite: "Article", cleEntite: s.codeArticle, detail: `champ ${champ} non autorisé`, succes: false });
    return { ok: false, message: `Modification du champ « ${champ} » non autorisée pour votre profil.` };
  };
  if ((s.nouveauCode !== undefined || s.isActif !== undefined) && !ROLES_CODES.includes(u.role as (typeof ROLES_CODES)[number])) return refus("code SKU");
  if ((s.pcb !== undefined || s.stockPieces !== undefined) && u.role !== ROLES.DIRECTEUR_LOGISTIQUE) return refus("PCB / stock");
  if (s.quotaPieces !== undefined && u.role !== ROLES.DIRECTEUR_COMMERCIAL) return refus("quota");

  try {
    const message = await prisma.$transaction(async (tx) => {
      const a = await tx.article.findUnique({ where: { codeArticle: s.codeArticle } });
      if (!a) throw new Error("Article introuvable");
      if (a.version !== s.version) throw new Error("Article modifié entre-temps par un autre utilisateur : rechargez la page.");
      const stock = s.stockPieces ?? a.stockPieces;
      if (s.quotaPieces !== undefined && s.quotaPieces > stock) throw new Error(`Le quota ne peut pas dépasser le stock (${stock} pièces) — RG-07.`);
      // RG-07 : si le stock baisse sous le quota, le quota est ramené au stock.
      const quota = quotaPlafonne(s.quotaPieces ?? a.quotaPieces, stock);
      const code = s.nouveauCode && s.nouveauCode !== a.codeArticle ? s.nouveauCode : undefined;
      if (code && (await tx.article.findFirst({ where: { codeArticle: code } }))) throw new Error(`Le code ${code} existe déjà.`);
      const apres = await tx.article.update({
        where: { codeArticle: a.codeArticle },
        data: {
          ...(code ? { codeArticle: code } : {}),
          ...(s.pcb !== undefined ? { pcb: s.pcb } : {}),
          ...(s.stockPieces !== undefined ? { stockPieces: stock, dateMajStock: new Date(), sourceStock: `Saisie manuelle · ${u.login}` } : {}),
          ...(s.isActif !== undefined ? { isActif: s.isActif } : {}),
          quotaPieces: quota,
          version: { increment: 1 },
          modifiePar: u.login,
        },
      });
      const champs = ["codeArticle", "pcb", "stockPieces", "quotaPieces", "isActif"] as const;
      const avant = Object.fromEntries(champs.map((c) => [c, a[c]]));
      const nouveau = Object.fromEntries(champs.map((c) => [c, apres[c]]));
      await auditer({ action: "ARTICLE_MODIFIE", login: u.login, codeRole: u.role, entite: "Article", cleEntite: a.codeArticle, avant, apres: nouveau }, tx);
      return quota < (s.quotaPieces ?? a.quotaPieces) ? `Enregistré · quota ramené au stock (${quota}).` : "Enregistré.";
    });
    revalidatePath("/catalogue");
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur" };
  }
}

async function lireFichier(form: FormData) {
  const f = form.get("fichier");
  if (!(f instanceof File) || !f.size) throw new Error("Choisissez un fichier .xlsx ou .csv.");
  if (f.size > TAILLE_MAX) throw new Error("Fichier trop volumineux (5 Mo maximum).");
  return { nom: f.name.slice(0, 255), lignes: sansEntete(await lireTableur(f.name, await f.arrayBuffer())) };
}

/** Import catalogue (module 6) : Code article, Désignation, Famille. Existants mis à jour, nouveaux ajoutés. */
export async function importerCatalogue(_: Resultat | null, form: FormData): Promise<Resultat> {
  const u = await exigerUtilisateur(ROLES_CODES);
  try {
    const { nom, lignes } = await lireFichier(form);
    const r = await prisma.$transaction(
      async (tx) => {
        let ajoutes = 0, maj = 0, ignores = 0;
        const rejets: string[] = [];
        for (const [i, [brut, designation, famille]] of lignes.entries()) {
          const code = (brut ?? "").trim().toUpperCase();
          if (!/^[A-Z0-9_-]{2,30}$/.test(code) || !designation) {
            ignores++;
            if (rejets.length < 50) rejets.push(`ligne ${i + 2} : code ou désignation manquant`);
            continue;
          }
          const codeFamille = famille ? codeMetier(famille) : "DIVERS";
          await tx.famille.upsert({
            where: { code: codeFamille },
            create: { code: codeFamille, libelle: famille?.trim() || "DIVERS", creePar: u.login },
            update: {},
          });
          const existant = await tx.article.findUnique({ where: { codeArticle: code } });
          const champs = { designation: designation.slice(0, 200), ...(famille ? { codeFamille } : {}) };
          // upsert n'est pas filtré par la suppression logique : un article supprimé portant
          // le même code métier est restauré au lieu d'être recréé.
          await tx.article.upsert({
            where: { codeArticle: code },
            create: { codeArticle: code, ...champs, codeFamille, creePar: u.login },
            update: {
              ...champs,
              ...(existant ? {} : { isDeleted: false, isActif: true, dateSuppression: null, supprimePar: null }),
              version: { increment: 1 },
              modifiePar: u.login,
            },
          });
          if (existant) maj++;
          else ajoutes++;
        }
        const numero = await prochainNumero(tx, "IMPORT", "IMP");
        await tx.importFichier.create({
          data: { numero, type: "CATALOGUE", nomFichier: nom, login: u.login, nbLignes: lignes.length, nbAjoutes: ajoutes, nbMisAJour: maj, nbIgnores: ignores, detail: rejets, creePar: u.login },
        });
        await auditer({ action: "IMPORT_CATALOGUE", login: u.login, codeRole: u.role, entite: "ImportFichier", cleEntite: numero, apres: { fichier: nom, ajoutes, maj, ignores }, detail: rejets.join(" ; ") || undefined }, tx);
        return { numero, ajoutes, maj, ignores };
      },
      { timeout: 120_000 },
    );
    revalidatePath("/catalogue");
    return { ok: true, message: `${r.numero} : ${r.ajoutes} ajoutés, ${r.maj} mis à jour, ${r.ignores} ignorés.` };
  } catch (e) {
    journal.warn("Import catalogue en échec", { erreur: e, login: u.login });
    return { ok: false, message: e instanceof Error ? e.message : "Fichier illisible." };
  }
}

/** Import du stock ERP (module 6) : Code article, Stock (pièces). Les quotas supérieurs au stock sont ramenés (RG-07). */
export async function importerStock(_: Resultat | null, form: FormData): Promise<Resultat> {
  const u = await exigerUtilisateur([ROLES.DIRECTEUR_LOGISTIQUE]);
  try {
    const { nom, lignes } = await lireFichier(form);
    const r = await prisma.$transaction(
      async (tx) => {
        let majs = 0, ignores = 0, quotas = 0;
        const rejets: string[] = [];
        const maintenant = new Date();
        for (const [i, [brut, valeur]] of lignes.entries()) {
          const code = (brut ?? "").trim().toUpperCase();
          const stock = lireNombre(valeur);
          const a = code ? await tx.article.findUnique({ where: { codeArticle: code } }) : null;
          if (!a || !Number.isFinite(stock) || stock < 0) {
            ignores++;
            if (rejets.length < 50) rejets.push(`ligne ${i + 2} : ${!a ? `article inconnu ${code}` : "stock invalide"}`);
            continue;
          }
          const nouveau = Math.floor(stock);
          const quota = quotaPlafonne(a.quotaPieces, nouveau);
          if (quota !== a.quotaPieces) quotas++;
          await tx.article.update({
            where: { codeArticle: code },
            data: { stockPieces: nouveau, quotaPieces: quota, dateMajStock: maintenant, sourceStock: `Import ERP · ${nom}`.slice(0, 150), version: { increment: 1 }, modifiePar: u.login },
          });
          majs++;
        }
        const numero = await prochainNumero(tx, "IMPORT", "IMP");
        await tx.importFichier.create({
          data: { numero, type: "STOCK", nomFichier: nom, login: u.login, nbLignes: lignes.length, nbMisAJour: majs, nbIgnores: ignores, nbQuotasAjustes: quotas, detail: rejets, creePar: u.login },
        });
        await auditer({ action: "IMPORT_STOCK", login: u.login, codeRole: u.role, entite: "ImportFichier", cleEntite: numero, apres: { fichier: nom, majs, ignores, quotas }, detail: rejets.join(" ; ") || undefined }, tx);
        return { numero, majs, ignores, quotas };
      },
      { timeout: 120_000 },
    );
    revalidatePath("/catalogue");
    return { ok: true, message: `${r.numero} : ${r.majs} articles mis à jour, ${r.ignores} ignorés, ${r.quotas} quotas ramenés au stock.` };
  } catch (e) {
    journal.warn("Import stock en échec", { erreur: e, login: u.login });
    return { ok: false, message: e instanceof Error ? e.message : "Fichier illisible." };
  }
}

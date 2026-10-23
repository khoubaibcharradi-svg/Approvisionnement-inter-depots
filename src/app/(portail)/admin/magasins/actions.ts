"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, champsSuppression } from "@/lib/prisma";
import { auditer } from "@/lib/audit";
import { exigerUtilisateur } from "@/lib/auth/session";
import { messagePublic } from "@/lib/erreurs";
import { ROLES } from "@/lib/constantes";
import { codeMetier } from "@/lib/tableur";

export type Resultat = { ok: boolean; message: string };

const code = z.string().trim().min(2).max(30).transform(codeMetier).refine((c) => c.length >= 2, "Code invalide");
const libelle = z.string().trim().min(2, "Libellé trop court").max(100);
const schemaMagasin = z.object({ code, libelle, codeDepot: z.string().min(1, "Dépôt obligatoire").max(30), codeSociete: z.string().min(1, "Société obligatoire").max(30) });
const schemaSociete = z.object({ code, libelle });

async function executer(f: () => Promise<Resultat>): Promise<Resultat> {
  try {
    const r = await f();
    revalidatePath("/admin/magasins");
    return r;
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, message: e.issues[0]?.message ?? "Saisie invalide" };
    return { ok: false, message: messagePublic(e, "Magasins") };
  }
}

export async function enregistrerMagasin(saisie: unknown, creation: boolean): Promise<Resultat> {
  const u = await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  return executer(async () => {
    const m = schemaMagasin.parse(saisie);
    if (!(await prisma.depot.findUnique({ where: { code: m.codeDepot } }))) throw new Error("Dépôt inconnu.");
    if (!(await prisma.societe.findUnique({ where: { code: m.codeSociete } }))) throw new Error("Société inconnue.");
    const avant = await prisma.magasin.findUnique({ where: { code: m.code } });
    if (creation && avant) throw new Error(`Le code ${m.code} existe déjà.`);
    if (!creation && !avant) throw new Error("Magasin introuvable.");
    // upsert : un magasin supprimé logiquement avec le même code est réactivé.
    await prisma.magasin.upsert({
      where: { code: m.code },
      create: { ...m, creePar: u.login },
      update: { libelle: m.libelle, codeDepot: m.codeDepot, codeSociete: m.codeSociete, modifiePar: u.login, ...(creation ? { isDeleted: false, isActif: true, dateSuppression: null, supprimePar: null } : {}) },
    });
    await auditer({ action: creation ? "MAGASIN_CREE" : "MAGASIN_MODIFIE", login: u.login, codeRole: u.role, entite: "Magasin", cleEntite: m.code, avant: avant ? { libelle: avant.libelle, depot: avant.codeDepot, societe: avant.codeSociete } : undefined, apres: m });
    return { ok: true, message: creation ? `Magasin ${m.code} créé.` : "Enregistré." };
  });
}

export async function basculerMagasin(codeMagasin: string): Promise<Resultat> {
  const u = await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  return executer(async () => {
    const m = await prisma.magasin.findUniqueOrThrow({ where: { code: codeMagasin } });
    await prisma.magasin.update({ where: { code: m.code }, data: { isActif: !m.isActif, modifiePar: u.login } });
    await auditer({ action: m.isActif ? "MAGASIN_DESACTIVE" : "MAGASIN_ACTIVE", login: u.login, codeRole: u.role, entite: "Magasin", cleEntite: m.code });
    return { ok: true, message: m.isActif ? "Magasin désactivé : il n'apparaît plus dans les nouveaux comptes rendus." : "Magasin réactivé." };
  });
}

export async function supprimerMagasin(codeMagasin: string): Promise<Resultat> {
  const u = await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  return executer(async () => {
    await prisma.magasin.update({ where: { code: z.string().max(30).parse(codeMagasin) }, data: champsSuppression(u.login) });
    await auditer({ action: "MAGASIN_SUPPRIME", login: u.login, codeRole: u.role, entite: "Magasin", cleEntite: codeMagasin });
    return { ok: true, message: "Magasin supprimé (les comptes rendus passés le conservent)." };
  });
}

export async function enregistrerSociete(saisie: unknown, creation: boolean): Promise<Resultat> {
  const u = await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  return executer(async () => {
    const s = schemaSociete.parse(saisie);
    const avant = await prisma.societe.findUnique({ where: { code: s.code } });
    if (creation && avant) throw new Error(`Le code ${s.code} existe déjà.`);
    await prisma.societe.upsert({
      where: { code: s.code },
      create: { ...s, ordre: (await prisma.societe.count()) + 1, creePar: u.login },
      update: { libelle: s.libelle, modifiePar: u.login, ...(creation ? { isDeleted: false, isActif: true, dateSuppression: null, supprimePar: null } : {}) },
    });
    await auditer({ action: creation ? "SOCIETE_CREEE" : "SOCIETE_MODIFIEE", login: u.login, codeRole: u.role, entite: "Societe", cleEntite: s.code, avant: avant ? { libelle: avant.libelle } : undefined, apres: s });
    return { ok: true, message: creation ? `Société ${s.code} créée.` : "Enregistré." };
  });
}

export async function basculerSociete(codeSociete: string): Promise<Resultat> {
  const u = await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  return executer(async () => {
    const s = await prisma.societe.findUniqueOrThrow({ where: { code: codeSociete } });
    await prisma.societe.update({ where: { code: s.code }, data: { isActif: !s.isActif, modifiePar: u.login } });
    await auditer({ action: s.isActif ? "SOCIETE_DESACTIVEE" : "SOCIETE_ACTIVEE", login: u.login, codeRole: u.role, entite: "Societe", cleEntite: s.code });
    return { ok: true, message: s.isActif ? "Société désactivée." : "Société réactivée." };
  });
}

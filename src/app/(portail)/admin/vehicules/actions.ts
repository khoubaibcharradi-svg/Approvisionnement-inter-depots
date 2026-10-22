"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, champsSuppression } from "@/lib/prisma";
import { auditer } from "@/lib/audit";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ROLES } from "@/lib/constantes";

export type Resultat = { ok: boolean; message: string };

/** Matricule normalisé : majuscules, espaces simples (« 123 TU 4567 »). */
const matricule = z
  .string()
  .trim()
  .transform((m) => m.toUpperCase().replace(/\s+/g, " "))
  .pipe(z.string().regex(/^[A-Z0-9 -]{3,30}$/, "Matricule invalide (lettres, chiffres, espaces, 3 à 30 caractères)"));
const schema = z.object({
  matricule,
  codeMagasin: z.string().min(1, "Agence obligatoire").max(30),
  chauffeurHabituel: z.string().trim().max(100).optional(),
  description: z.string().trim().max(100).optional(),
});

async function executer(f: () => Promise<Resultat>): Promise<Resultat> {
  try {
    const r = await f();
    revalidatePath("/admin/vehicules");
    revalidatePath("/compte-rendu/vehicules");
    return r;
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, message: e.issues[0]?.message ?? "Saisie invalide" };
    return { ok: false, message: e instanceof Error ? e.message : "Erreur" };
  }
}

/**
 * L'administrateur gère tous les véhicules ; un agent dépôt gère ceux des agences de son dépôt
 * (ajout, description, chauffeur, activation), sans pouvoir les supprimer.
 */
async function gestionnaire() {
  return exigerUtilisateur([ROLES.ADMINISTRATEUR, ROLES.AGENT_DEPOT]);
}

async function horsPerimetre(u: Awaited<ReturnType<typeof gestionnaire>>, codeDepot: string | undefined, cle: string) {
  if (u.role !== ROLES.AGENT_DEPOT || (codeDepot && codeDepot === u.codeDepotAgent)) return false;
  await auditer({ action: "VEHICULE_REFUSE", login: u.login, codeRole: u.role, entite: "Vehicule", cleEntite: cle, detail: "hors du dépôt de l'agent", succes: false });
  return true;
}

export async function enregistrerVehicule(saisie: unknown, creation: boolean): Promise<Resultat> {
  const u = await gestionnaire();
  return executer(async () => {
    const v = schema.parse(saisie);
    const magasin = await prisma.magasin.findUnique({ where: { code: v.codeMagasin } });
    if (!magasin || !magasin.isActif) throw new Error("Agence (magasin) inconnue ou inactive.");
    if (await horsPerimetre(u, magasin.codeDepot, v.matricule)) throw new Error("Agence hors de votre dépôt.");
    const avant = await prisma.vehicule.findUnique({ where: { matricule: v.matricule } });
    if (avant && (await horsPerimetre(u, avant.codeDepot, v.matricule))) throw new Error(creation ? `Le véhicule ${v.matricule} existe déjà dans un autre dépôt.` : "Véhicule hors de votre dépôt.");
    if (creation && avant) throw new Error(`Le véhicule ${v.matricule} existe déjà.`);
    const champs = {
      codeMagasin: magasin.code,
      codeDepot: magasin.codeDepot,
      chauffeurHabituel: v.chauffeurHabituel || null,
      description: v.description || null,
    };
    // upsert : un véhicule supprimé logiquement avec le même matricule est réactivé.
    await prisma.vehicule.upsert({
      where: { matricule: v.matricule },
      create: { matricule: v.matricule, ...champs, creePar: u.login },
      update: { ...champs, modifiePar: u.login, ...(creation ? { isDeleted: false, isActif: true, dateSuppression: null, supprimePar: null } : {}) },
    });
    await auditer({
      action: creation ? "VEHICULE_CREE" : "VEHICULE_MODIFIE",
      login: u.login,
      codeRole: u.role,
      entite: "Vehicule",
      cleEntite: v.matricule,
      avant: avant ? { agence: avant.codeMagasin, depot: avant.codeDepot, chauffeur: avant.chauffeurHabituel, description: avant.description } : undefined,
      apres: { agence: champs.codeMagasin, depot: champs.codeDepot, chauffeur: champs.chauffeurHabituel, description: champs.description },
    });
    return { ok: true, message: creation ? `Véhicule ${v.matricule} ajouté.` : "Enregistré." };
  });
}

export async function basculerVehicule(m: string): Promise<Resultat> {
  const u = await gestionnaire();
  return executer(async () => {
    const v = await prisma.vehicule.findUniqueOrThrow({ where: { matricule: m } });
    if (await horsPerimetre(u, v.codeDepot, v.matricule)) throw new Error("Véhicule hors de votre dépôt.");
    await prisma.vehicule.update({ where: { matricule: v.matricule }, data: { isActif: !v.isActif, modifiePar: u.login } });
    await auditer({ action: v.isActif ? "VEHICULE_DESACTIVE" : "VEHICULE_ACTIVE", login: u.login, codeRole: u.role, entite: "Vehicule", cleEntite: v.matricule });
    return { ok: true, message: v.isActif ? "Véhicule désactivé : il n'est plus proposé aux agents." : "Véhicule réactivé." };
  });
}

export async function supprimerVehicule(m: string): Promise<Resultat> {
  const u = await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  return executer(async () => {
    await prisma.vehicule.update({ where: { matricule: z.string().max(30).parse(m) }, data: champsSuppression(u.login) });
    await auditer({ action: "VEHICULE_SUPPRIME", login: u.login, codeRole: u.role, entite: "Vehicule", cleEntite: m });
    return { ok: true, message: "Véhicule supprimé (les comptes rendus passés le conservent)." };
  });
}

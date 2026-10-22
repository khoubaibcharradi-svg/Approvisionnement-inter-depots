"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, champsSuppression } from "@/lib/prisma";
import { auditer } from "@/lib/audit";
import { exigerUtilisateur } from "@/lib/auth/session";
import { genererMotDePasseTemporaire, hacherMotDePasse } from "@/lib/auth/mot-de-passe";
import { LIBELLES_ROLES, ROLES } from "@/lib/constantes";

export type Resultat = { ok: boolean; message: string; motDePasseTemporaire?: string };

const login = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,50}$/, "Identifiant : 3 à 50 caractères (lettres, chiffres, . _ -)");
const fiche = z.object({
  login,
  nomComplet: z.string().trim().min(2).max(100),
  email: z.email().max(150).or(z.literal("")).optional(),
  codeRole: z.enum(Object.keys(LIBELLES_ROLES) as [string, ...string[]]),
  codeDepotAgent: z.string().max(30).nullish(),
});

/** Un agent dépôt doit être rattaché à un dépôt ; les autres rôles n'en ont pas. */
async function depotAgent(s: z.infer<typeof fiche>) {
  if (s.codeRole !== ROLES.AGENT_DEPOT) return null;
  if (!s.codeDepotAgent) throw new Error("Un agent dépôt doit être affecté à un dépôt.");
  if (!(await prisma.depot.findUnique({ where: { code: s.codeDepotAgent } }))) throw new Error("Dépôt inconnu.");
  return s.codeDepotAgent;
}
const affectations = z.array(z.object({ codeCanal: z.string().max(30), codeDepot: z.string().max(30).nullable() })).max(10);

async function admin() {
  return exigerUtilisateur([ROLES.ADMINISTRATEUR]);
}

async function executer(f: () => Promise<Resultat>): Promise<Resultat> {
  try {
    const r = await f();
    revalidatePath("/admin/utilisateurs");
    return r;
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, message: e.issues[0]?.message ?? "Saisie invalide" };
    return { ok: false, message: e instanceof Error ? e.message : "Erreur" };
  }
}

export async function creerUtilisateur(saisie: unknown): Promise<Resultat> {
  const moi = await admin();
  return executer(async () => {
    const s = fiche.parse(saisie);
    // upsert : un compte supprimé logiquement avec le même login est recréé proprement.
    const existant = await prisma.utilisateur.findUnique({ where: { login: s.login } });
    if (existant) throw new Error(`L'identifiant ${s.login} existe déjà.`);
    const temporaire = genererMotDePasseTemporaire();
    const champs = { nomComplet: s.nomComplet, email: s.email || null, codeRole: s.codeRole, codeDepotAgent: await depotAgent(s), motDePasseHash: await hacherMotDePasse(temporaire), doitChangerMotDePasse: true };
    await prisma.utilisateur.upsert({
      where: { login: s.login },
      create: { login: s.login, ...champs, creePar: moi.login },
      update: { ...champs, isDeleted: false, isActif: true, dateSuppression: null, supprimePar: null, versionSession: { increment: 1 }, nbEchecsConnexion: 0, verrouilleJusqua: null, modifiePar: moi.login },
    });
    await auditer({ action: "UTILISATEUR_CREE", login: moi.login, codeRole: moi.role, entite: "Utilisateur", cleEntite: s.login, apres: { nomComplet: s.nomComplet, role: s.codeRole, email: s.email, depotAgent: s.codeDepotAgent ?? null } });
    return { ok: true, message: `Compte ${s.login} créé.`, motDePasseTemporaire: temporaire };
  });
}

export async function majUtilisateur(saisie: unknown, aff: unknown): Promise<Resultat> {
  const moi = await admin();
  return executer(async () => {
    const s = fiche.parse(saisie);
    const nouvelles = affectations.parse(aff);
    if (s.login === moi.login && s.codeRole !== ROLES.ADMINISTRATEUR) throw new Error("Vous ne pouvez pas retirer votre propre rôle d'administrateur.");
    if (s.codeRole === ROLES.SUPERVISEUR && nouvelles.some((a) => !a.codeDepot)) throw new Error("Un superviseur doit avoir un dépôt pour chaque canal.");
    const codeDepotAgent = await depotAgent(s);
    await prisma.$transaction(async (tx) => {
      const avant = await tx.utilisateur.findUniqueOrThrow({ where: { login: s.login }, include: { affectations: { where: { isDeleted: false } } } });
      const changementRole = avant.codeRole !== s.codeRole || avant.codeDepotAgent !== codeDepotAgent;
      await tx.utilisateur.update({
        where: { login: s.login },
        data: { nomComplet: s.nomComplet, email: s.email || null, codeRole: s.codeRole, codeDepotAgent, modifiePar: moi.login, ...(changementRole ? { versionSession: { increment: 1 } } : {}) },
      });
      // Les canaux ne concernent que les superviseurs et chefs de vente.
      if (s.codeRole !== ROLES.SUPERVISEUR && s.codeRole !== ROLES.CHEF_VENTE) nouvelles.length = 0;
      const codes = new Set(nouvelles.map((a) => a.codeCanal));
      for (const a of avant.affectations.filter((x) => !codes.has(x.codeCanal))) {
        await tx.affectation.update({ where: { login_codeCanal: { login: s.login, codeCanal: a.codeCanal } }, data: champsSuppression(moi.login) });
      }
      for (const a of nouvelles) {
        await tx.affectation.upsert({
          where: { login_codeCanal: { login: s.login, codeCanal: a.codeCanal } },
          create: { login: s.login, codeCanal: a.codeCanal, codeDepot: a.codeDepot, creePar: moi.login },
          update: { codeDepot: a.codeDepot, isDeleted: false, isActif: true, dateSuppression: null, supprimePar: null, modifiePar: moi.login },
        });
      }
      await auditer(
        {
          action: "UTILISATEUR_MODIFIE",
          login: moi.login,
          codeRole: moi.role,
          entite: "Utilisateur",
          cleEntite: s.login,
          avant: { nomComplet: avant.nomComplet, email: avant.email, role: avant.codeRole, depotAgent: avant.codeDepotAgent, affectations: avant.affectations.map((a) => ({ canal: a.codeCanal, depot: a.codeDepot })) },
          apres: { nomComplet: s.nomComplet, email: s.email, role: s.codeRole, depotAgent: codeDepotAgent, affectations: nouvelles.map((a) => ({ canal: a.codeCanal, depot: a.codeDepot })) },
        },
        tx,
      );
    });
    return { ok: true, message: "Enregistré." };
  });
}

export async function reinitialiserMotDePasse(cible: string): Promise<Resultat> {
  const moi = await admin();
  return executer(async () => {
    const l = login.parse(cible);
    const temporaire = genererMotDePasseTemporaire();
    await prisma.utilisateur.update({
      where: { login: l },
      data: { motDePasseHash: await hacherMotDePasse(temporaire), doitChangerMotDePasse: true, versionSession: { increment: 1 }, nbEchecsConnexion: 0, verrouilleJusqua: null, modifiePar: moi.login },
    });
    await auditer({ action: "MDP_REINITIALISE", login: moi.login, codeRole: moi.role, entite: "Utilisateur", cleEntite: l });
    return { ok: true, message: `Mot de passe de ${l} réinitialisé.`, motDePasseTemporaire: temporaire };
  });
}

export async function deverrouiller(cible: string): Promise<Resultat> {
  const moi = await admin();
  return executer(async () => {
    const l = login.parse(cible);
    await prisma.utilisateur.update({ where: { login: l }, data: { nbEchecsConnexion: 0, verrouilleJusqua: null, modifiePar: moi.login } });
    await auditer({ action: "COMPTE_DEVERROUILLE", login: moi.login, codeRole: moi.role, entite: "Utilisateur", cleEntite: l });
    return { ok: true, message: `Compte ${l} déverrouillé.` };
  });
}

export async function basculerActif(cible: string): Promise<Resultat> {
  const moi = await admin();
  return executer(async () => {
    const l = login.parse(cible);
    if (l === moi.login) throw new Error("Vous ne pouvez pas désactiver votre propre compte.");
    const u = await prisma.utilisateur.findUniqueOrThrow({ where: { login: l } });
    await prisma.utilisateur.update({ where: { login: l }, data: { isActif: !u.isActif, versionSession: { increment: 1 }, modifiePar: moi.login } });
    await auditer({ action: u.isActif ? "UTILISATEUR_DESACTIVE" : "UTILISATEUR_ACTIVE", login: moi.login, codeRole: moi.role, entite: "Utilisateur", cleEntite: l });
    return { ok: true, message: u.isActif ? `Compte ${l} désactivé.` : `Compte ${l} réactivé.` };
  });
}

/** Suppression logique : le compte et ses affectations restent en base pour la traçabilité. */
export async function supprimerUtilisateur(cible: string): Promise<Resultat> {
  const moi = await admin();
  return executer(async () => {
    const l = login.parse(cible);
    if (l === moi.login) throw new Error("Vous ne pouvez pas supprimer votre propre compte.");
    await prisma.$transaction(async (tx) => {
      await tx.affectation.updateMany({ where: { login: l }, data: champsSuppression(moi.login) });
      await tx.utilisateur.update({ where: { login: l }, data: { ...champsSuppression(moi.login), versionSession: { increment: 1 } } });
      await auditer({ action: "UTILISATEUR_SUPPRIME", login: moi.login, codeRole: moi.role, entite: "Utilisateur", cleEntite: l }, tx);
    });
    return { ok: true, message: `Compte ${l} supprimé.` };
  });
}

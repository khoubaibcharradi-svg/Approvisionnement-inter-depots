"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auditer } from "@/lib/audit";
import { ouvrirSession, fermerSession, utilisateurCourant } from "@/lib/auth/session";
import { verifierMotDePasse, verificationFactice } from "@/lib/auth/mot-de-passe";
import { parametreNombre } from "@/lib/parametres";
import { accueilDuRole, type CodeRole } from "@/lib/constantes";

export type EtatConnexion = { erreur?: string };

export async function seConnecter(_: EtatConnexion, form: FormData): Promise<EtatConnexion> {
  const login = String(form.get("login") ?? "").trim().toLowerCase().slice(0, 50);
  const motDePasse = String(form.get("motDePasse") ?? "");
  if (!login || !motDePasse) return { erreur: "Identifiant et mot de passe obligatoires." };

  const u = await prisma.utilisateur.findUnique({ where: { login } });
  const echec = async (detail: string, message = "Identifiant ou mot de passe incorrect.") => {
    await auditer({ action: "CONNEXION_ECHEC", login, codeRole: u?.codeRole, entite: "Utilisateur", cleEntite: login, detail, succes: false });
    return { erreur: message };
  };

  if (!u || !u.isActif) {
    await verificationFactice(motDePasse);
    return echec(u ? "compte désactivé" : "identifiant inconnu");
  }
  if (u.verrouilleJusqua && u.verrouilleJusqua > new Date()) {
    return echec("compte verrouillé", `Compte verrouillé jusqu'à ${u.verrouilleJusqua.toLocaleTimeString("fr-FR")} après plusieurs échecs.`);
  }
  if (!(await verifierMotDePasse(motDePasse, u.motDePasseHash))) {
    const max = await parametreNombre("MAX_ECHECS_CONNEXION");
    const echecs = u.nbEchecsConnexion + 1;
    const verrouiller = echecs >= max;
    await prisma.utilisateur.update({
      where: { login },
      data: verrouiller
        ? { nbEchecsConnexion: 0, verrouilleJusqua: new Date(Date.now() + (await parametreNombre("DUREE_VERROUILLAGE_MINUTES")) * 60_000) }
        : { nbEchecsConnexion: echecs },
    });
    if (verrouiller) await auditer({ action: "COMPTE_VERROUILLE", login, codeRole: u.codeRole, entite: "Utilisateur", cleEntite: login, succes: false });
    return echec(`mot de passe incorrect (${echecs}/${max})`);
  }

  await prisma.utilisateur.update({
    where: { login },
    data: { nbEchecsConnexion: 0, verrouilleJusqua: null, derniereConnexion: new Date() },
  });
  await ouvrirSession(login, u.versionSession);
  await auditer({ action: "CONNEXION", login, codeRole: u.codeRole, entite: "Utilisateur", cleEntite: login });
  redirect(u.doitChangerMotDePasse ? "/mot-de-passe?obligatoire=1" : accueilDuRole(u.codeRole as CodeRole));
}

export async function seDeconnecter() {
  const u = await utilisateurCourant();
  if (u) await auditer({ action: "DECONNEXION", login: u.login, codeRole: u.role, entite: "Utilisateur", cleEntite: u.login });
  await fermerSession();
  redirect("/connexion");
}

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
  // Message identique dans tous les cas (inconnu, désactivé, verrouillé, mauvais mot de passe) : impossible de deviner les comptes.
  const echec = async (detail: string, message = "Identifiant ou mot de passe incorrect. Après plusieurs échecs, le compte est verrouillé temporairement.") => {
    await auditer({ action: "CONNEXION_ECHEC", login, codeRole: u?.codeRole, entite: "Utilisateur", cleEntite: login, detail, succes: false });
    return { erreur: message };
  };

  if (!u || !u.isActif) {
    await verificationFactice(motDePasse);
    return echec(u ? "compte désactivé" : "identifiant inconnu");
  }
  if (u.verrouilleJusqua && u.verrouilleJusqua > new Date()) {
    await verificationFactice(motDePasse);
    return echec(`compte verrouillé jusqu'à ${u.verrouilleJusqua.toISOString()}`);
  }
  // Tentative comptée avant la vérification, dans une transaction (verrou de ligne) : des essais
  // lancés en parallèle reçoivent chacun un numéro distinct et ne peuvent pas dépasser le seuil.
  const max = await parametreNombre("MAX_ECHECS_CONNEXION");
  const duree = await parametreNombre("DUREE_VERROUILLAGE_MINUTES");
  const verrouiller = (tx: Pick<typeof prisma, "utilisateur"> = prisma) =>
    tx.utilisateur.update({ where: { login }, data: { nbEchecsConnexion: 0, verrouilleJusqua: new Date(Date.now() + duree * 60_000) } });
  const tentative = await prisma.$transaction(async (tx) => {
    const { count } = await tx.utilisateur.updateMany({
      where: { login, OR: [{ verrouilleJusqua: null }, { verrouilleJusqua: { lte: new Date() } }] },
      data: { nbEchecsConnexion: { increment: 1 } },
    });
    if (!count) return null; // verrouillé entre-temps par une requête concurrente
    const n = (await tx.utilisateur.findUniqueOrThrow({ where: { login }, select: { nbEchecsConnexion: true } })).nbEchecsConnexion;
    if (n > max) await verrouiller(tx); // seuil déjà atteint : verrouillage sans vérifier le mot de passe
    return n;
  });
  if (tentative === null || tentative > max) {
    await verificationFactice(motDePasse);
    return echec(tentative === null ? "compte verrouillé par une tentative simultanée" : `tentative au-delà du seuil (${tentative}/${max})`);
  }
  if (!(await verifierMotDePasse(motDePasse, u.motDePasseHash))) {
    if (tentative >= max) {
      await verrouiller();
      await auditer({ action: "COMPTE_VERROUILLE", login, codeRole: u.codeRole, entite: "Utilisateur", cleEntite: login, succes: false });
    }
    return echec(`mot de passe incorrect (${tentative}/${max})`);
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
  if (u) {
    // Un jeton copié avant la déconnexion devient inutilisable (versionSession).
    await prisma.utilisateur.update({ where: { login: u.login }, data: { versionSession: { increment: 1 } } });
    await auditer({ action: "DECONNEXION", login: u.login, codeRole: u.role, entite: "Utilisateur", cleEntite: u.login });
  }
  await fermerSession();
  redirect("/connexion");
}

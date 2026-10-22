import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../prisma";
import { auditer } from "../audit";
import { NOM_COOKIE, dureeSessionSecondes, lireJeton, signerJeton } from "./jeton";
import { ROLES, accueilDuRole, type CodeRole } from "../constantes";
import type { Acteur } from "../workflow";

export type UtilisateurCourant = Acteur & {
  nomComplet: string;
  doitChangerMotDePasse: boolean;
  /** Dépôt imposé par canal (Superviseur). */
  depotParCanal: Record<string, string | null>;
  /** Dépôt de rattachement (Agent dépôt). */
  codeDepotAgent: string | null;
};

export async function ouvrirSession(login: string, versionSession: number) {
  const jeton = await signerJeton({ login, vs: versionSession });
  (await cookies()).set(NOM_COOKIE, jeton, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: dureeSessionSecondes(),
  });
}

export async function fermerSession() {
  (await cookies()).delete(NOM_COOKIE);
}

/**
 * Utilisateur de la requête, relu en base à chaque requête : un compte désactivé, supprimé
 * ou dont le mot de passe a changé (versionSession) perd immédiatement sa session.
 */
export const utilisateurCourant = cache(async (): Promise<UtilisateurCourant | null> => {
  const contenu = await lireJeton((await cookies()).get(NOM_COOKIE)?.value);
  if (!contenu) return null;
  const u = await prisma.utilisateur.findUnique({
    where: { login: contenu.login },
    include: { affectations: { where: { isDeleted: false, isActif: true } } },
  });
  if (!u || !u.isActif || u.versionSession !== contenu.vs) return null;
  return {
    login: u.login,
    nomComplet: u.nomComplet,
    role: u.codeRole as CodeRole,
    canaux: u.affectations.map((a) => a.codeCanal),
    depotParCanal: Object.fromEntries(u.affectations.map((a) => [a.codeCanal, a.codeDepot])),
    doitChangerMotDePasse: u.doitChangerMotDePasse,
    codeDepotAgent: u.codeDepotAgent,
  };
});

/**
 * Exige un utilisateur connecté (et éventuellement un rôle). Redirige sinon.
 * Sans liste de rôles, la page est ouverte aux rôles du circuit des demandes : l'agent dépôt
 * n'y a pas accès (il ne voit que le compte rendu), sauf si `tousRoles` est demandé.
 */
export async function exigerUtilisateur(
  roles?: readonly CodeRole[],
  options?: { autoriserMdpExpire?: boolean; tousRoles?: boolean },
) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  if (u.doitChangerMotDePasse && !options?.autoriserMdpExpire) redirect("/mot-de-passe?obligatoire=1");
  const refuse = roles ? !roles.includes(u.role) : !options?.tousRoles && u.role === ROLES.AGENT_DEPOT;
  if (refuse) {
    await auditer({
      action: "ACCES_PAGE_REFUSE",
      login: u.login,
      codeRole: u.role,
      detail: roles ? `rôles requis : ${roles.join(", ")}` : "page réservée au circuit des demandes",
      succes: false,
    });
    redirect(`${accueilDuRole(u.role)}?refus=1`);
  }
  return u;
}

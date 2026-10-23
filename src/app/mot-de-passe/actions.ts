"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auditer } from "@/lib/audit";
import { exigerUtilisateur, ouvrirSession } from "@/lib/auth/session";
import { controlerPolitique, hacherMotDePasse, verifierMotDePasse } from "@/lib/auth/mot-de-passe";
import { parametreNombre } from "@/lib/parametres";
import { accueilDuRole } from "@/lib/constantes";

export type EtatMotDePasse = { erreur?: string };

export async function changerMotDePasse(_: EtatMotDePasse, form: FormData): Promise<EtatMotDePasse> {
  const moi = await exigerUtilisateur(undefined, { autoriserMdpExpire: true, tousRoles: true });
  const actuel = String(form.get("actuel") ?? "");
  const nouveau = String(form.get("nouveau") ?? "");
  const confirmation = String(form.get("confirmation") ?? "");
  const u = await prisma.utilisateur.findUniqueOrThrow({ where: { login: moi.login } });

  if (!(await verifierMotDePasse(actuel, u.motDePasseHash))) {
    // Une session volée ne doit pas permettre de deviner le mot de passe : verrouillage comme à la connexion.
    const max = await parametreNombre("MAX_ECHECS_CONNEXION");
    const echecs = u.nbEchecsConnexion + 1;
    const verrouiller = echecs >= max;
    await prisma.utilisateur.update({
      where: { login: moi.login },
      data: verrouiller
        ? { nbEchecsConnexion: 0, verrouilleJusqua: new Date(Date.now() + (await parametreNombre("DUREE_VERROUILLAGE_MINUTES")) * 60_000), versionSession: { increment: 1 } }
        : { nbEchecsConnexion: echecs },
    });
    await auditer({ action: verrouiller ? "COMPTE_VERROUILLE" : "MDP_CHANGEMENT_ECHEC", login: moi.login, codeRole: moi.role, entite: "Utilisateur", cleEntite: moi.login, detail: `mot de passe actuel incorrect (${echecs}/${max})`, succes: false });
    if (verrouiller) redirect("/connexion");
    return { erreur: "Mot de passe actuel incorrect." };
  }
  const regles = controlerPolitique(nouveau, moi.login, await parametreNombre("MDP_LONGUEUR_MIN"));
  if (regles.length) return { erreur: `Le nouveau mot de passe doit contenir : ${regles.join(", ")}.` };
  if (nouveau !== confirmation) return { erreur: "La confirmation ne correspond pas." };
  if (await verifierMotDePasse(nouveau, u.motDePasseHash)) return { erreur: "Choisissez un mot de passe différent de l'actuel." };

  const maj = await prisma.utilisateur.update({
    where: { login: moi.login },
    data: {
      motDePasseHash: await hacherMotDePasse(nouveau),
      doitChangerMotDePasse: false,
      dateChangementMotDePasse: new Date(),
      nbEchecsConnexion: 0,
      versionSession: { increment: 1 },
      modifiePar: moi.login,
    },
  });
  // Les autres sessions ouvertes sont invalidées ; celle-ci est renouvelée.
  await ouvrirSession(moi.login, maj.versionSession);
  await auditer({ action: "MDP_CHANGE", login: moi.login, codeRole: moi.role, entite: "Utilisateur", cleEntite: moi.login });
  redirect(`${accueilDuRole(moi.role)}?mdp=1`);
}

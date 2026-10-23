"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auditer } from "@/lib/audit";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ROLES } from "@/lib/constantes";

export type Resultat = { ok: boolean; message: string };

/** Déconnecte tous les utilisateurs (sauf soi) : utile après un incident ou un changement de configuration. */
export async function deconnecterTout(): Promise<Resultat> {
  const u = await exigerUtilisateur([ROLES.ADMIN_FULL]);
  const r = await prisma.utilisateur.updateMany({ where: { login: { not: u.login } }, data: { versionSession: { increment: 1 } } });
  await auditer({ action: "SESSIONS_FERMEES", login: u.login, codeRole: u.role, entite: "Utilisateur", detail: `${r.count} compte(s)` });
  revalidatePath("/admin/it");
  return { ok: true, message: `Toutes les sessions ont été fermées (${r.count} compte(s)). Chacun devra se reconnecter.` };
}

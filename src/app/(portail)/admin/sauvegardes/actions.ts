"use server";

import { revalidatePath } from "next/cache";
import { exigerUtilisateur } from "@/lib/auth/session";
import { auditer } from "@/lib/audit";
import { sauvegarderBase } from "@/lib/sauvegarde";
import { ROLES } from "@/lib/constantes";

export type Resultat = { ok: boolean; message: string };

export async function lancerSauvegarde(): Promise<Resultat> {
  const u = await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  try {
    const r = await sauvegarderBase(`manuelle · ${u.login}`);
    await auditer({ action: "SAUVEGARDE_MANUELLE", login: u.login, codeRole: u.role, entite: "Sauvegarde", cleEntite: r.fichier, apres: { octets: r.octets, sha256: r.sha256, lignes: r.lignes } });
    revalidatePath("/admin/sauvegardes");
    return { ok: true, message: `Sauvegarde ${r.fichier} créée (${Object.values(r.lignes).reduce((a, b) => a + b, 0)} lignes).` };
  } catch {
    await auditer({ action: "SAUVEGARDE_MANUELLE", login: u.login, codeRole: u.role, entite: "Sauvegarde", succes: false, detail: "échec, voir le journal des erreurs" });
    return { ok: false, message: "Échec de la sauvegarde : voir le journal des erreurs." };
  }
}

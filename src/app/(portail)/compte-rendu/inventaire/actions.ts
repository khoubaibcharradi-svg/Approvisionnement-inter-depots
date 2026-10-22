"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerUtilisateur } from "@/lib/auth/session";
import { journal } from "@/lib/journal";
import { ROLES } from "@/lib/constantes";
import { ErreurCompteRendu } from "@/lib/compte-rendu/service";
import { enregistrerInventaire as enregistrer } from "@/lib/compte-rendu/inventaire";

export type Resultat = { ok: boolean; message: string };

export async function enregistrerInventaire(dateJournee: string, codeMagasin: string, lignes: unknown): Promise<Resultat> {
  const u = await exigerUtilisateur([ROLES.AGENT_DEPOT]);
  try {
    const r = await enregistrer(u, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(dateJournee), z.string().max(30).parse(codeMagasin), lignes);
    revalidatePath("/compte-rendu");
    return {
      ok: true,
      message: r.erreurs.length
        ? `Inventaire enregistré (${r.articles} article(s)). À compléter avant de soumettre le compte rendu : ${r.erreurs.join(" ; ")}.`
        : `Inventaire enregistré (${r.articles} article(s)). La situation du stock du compte rendu est mise à jour.`,
    };
  } catch (e) {
    if (e instanceof ErreurCompteRendu) return { ok: false, message: e.message };
    if (e instanceof z.ZodError) return { ok: false, message: e.issues[0]?.message ?? "Saisie invalide : vérifiez les quantités." };
    journal.error("Inventaire : enregistrement en échec", { erreur: e, login: u.login });
    return { ok: false, message: "Erreur technique : l'incident a été journalisé." };
  }
}

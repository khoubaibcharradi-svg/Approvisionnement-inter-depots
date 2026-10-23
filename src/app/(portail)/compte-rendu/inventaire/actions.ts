"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerUtilisateur } from "@/lib/auth/session";
import { journal } from "@/lib/journal";
import { ROLES } from "@/lib/constantes";
import { ErreurCompteRendu } from "@/lib/compte-rendu/service";
import { enregistrerInventaire as enregistrer, LIBELLES_ETAPES, VALIDEES, type ActionInventaire } from "@/lib/compte-rendu/inventaire";

export type Resultat = { ok: boolean; message: string };

export async function enregistrerInventaire(
  dateJournee: string,
  codeMagasin: string,
  lignes: unknown,
  action: ActionInventaire,
  codes: { RECEPTIONS: string[]; RETOURS: string[] },
): Promise<Resultat> {
  const u = await exigerUtilisateur([ROLES.AGENT_DEPOT]);
  try {
    const r = await enregistrer(u, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(dateJournee), z.string().max(30).parse(codeMagasin), lignes, action, codes);
    revalidatePath("/compte-rendu");
    const etape = r.etape ? LIBELLES_ETAPES[r.etape] : "";
    switch (r.action) {
      case "CLOTURER":
        return { ok: true, message: `Inventaire clôturé (${r.articles} article(s)). Les valeurs sont reportées dans la situation du stock du compte rendu.` };
      case "VALIDER":
        return { ok: true, message: `${etape} ${VALIDEES[r.etape!]} : la colonne est figée.` };
      case "ANNULER_VALIDATION":
        return { ok: true, message: `Validation des ${etape.toLowerCase()} annulée : la colonne est de nouveau modifiable.` };
      default:
        return { ok: true, message: `Brouillon enregistré (${r.articles} article(s)).` };
    }
  } catch (e) {
    if (e instanceof ErreurCompteRendu) return { ok: false, message: e.message };
    if (e instanceof z.ZodError) return { ok: false, message: e.issues[0]?.message ?? "Saisie invalide : vérifiez les quantités et les codes." };
    journal.error("Inventaire : enregistrement en échec", { erreur: e, login: u.login });
    return { ok: false, message: "Erreur technique : l'incident a été journalisé." };
  }
}

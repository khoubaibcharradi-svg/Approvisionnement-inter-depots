"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerUtilisateur } from "@/lib/auth/session";
import { journal } from "@/lib/journal";
import { ROLES } from "@/lib/constantes";
import { ErreurCompteRendu } from "@/lib/compte-rendu/service";
import { rouvrirInventaire as rouvrir } from "@/lib/compte-rendu/inventaire";

export type Resultat = { ok: boolean; message: string };

export async function rouvrirInventaire(codeMagasin: string, dateJournee: string, motif: string): Promise<Resultat> {
  const u = await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  try {
    const r = await rouvrir(u, z.string().max(30).parse(codeMagasin), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(dateJournee), z.string().max(2000).parse(motif));
    revalidatePath("/admin/inventaires");
    return {
      ok: true,
      message: `Inventaire rouvert (réouverture n° ${r.numero}). L'agent peut corriger puis clôturer à nouveau.${r.compteRendu ? ` Le compte rendu ${r.compteRendu} repasse en brouillon pour être resoumis.` : ""}`,
    };
  } catch (e) {
    if (e instanceof ErreurCompteRendu) return { ok: false, message: e.message };
    journal.error("Réouverture d'inventaire en échec", { erreur: e, login: u.login });
    return { ok: false, message: "Erreur technique : l'incident a été journalisé." };
  }
}

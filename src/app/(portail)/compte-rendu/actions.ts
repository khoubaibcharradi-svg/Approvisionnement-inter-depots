"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerUtilisateur } from "@/lib/auth/session";
import { journal } from "@/lib/journal";
import { ROLES } from "@/lib/constantes";
import * as service from "@/lib/compte-rendu/service";

export type Resultat = { ok: boolean; message: string; numero?: string };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function executer(nom: string, f: () => Promise<Resultat>): Promise<Resultat> {
  try {
    const r = await f();
    revalidatePath("/compte-rendu");
    return r;
  } catch (e) {
    if (e instanceof service.ErreurCompteRendu) return { ok: false, message: e.message };
    if (e instanceof z.ZodError) return { ok: false, message: "Saisie invalide : vérifiez les montants (nombres) et les longueurs de texte." };
    journal.error(`Compte rendu : ${nom} en échec`, { erreur: e });
    return { ok: false, message: "Erreur technique : l'incident a été journalisé." };
  }
}

export async function enregistrerCompteRendu(dateJournee: string, version: number | null, saisie: unknown, soumettre: boolean) {
  const u = await exigerUtilisateur([ROLES.AGENT_DEPOT]);
  return executer(soumettre ? "soumission" : "brouillon", async () => {
    const numero = await service.enregistrer(u, date.parse(dateJournee), version, saisie, soumettre);
    return { ok: true, numero, message: soumettre ? `${numero} soumis. Merci, le compte rendu est transmis.` : `Brouillon ${numero} enregistré.` };
  });
}

export async function ajouterPiece(form: FormData) {
  const u = await exigerUtilisateur([ROLES.AGENT_DEPOT]);
  return executer("ajout de pièce", async () => {
    const numero = z.string().max(20).parse(form.get("numero"));
    const fichier = form.get("fichier");
    if (!(fichier instanceof File)) return { ok: false, message: "Choisissez un fichier." };
    await service.ajouterPiece(u, numero, fichier);
    return { ok: true, message: `Pièce « ${fichier.name} » ajoutée.` };
  });
}

export async function retirerPiece(numero: string, numeroPiece: number) {
  const u = await exigerUtilisateur([ROLES.AGENT_DEPOT]);
  return executer("retrait de pièce", async () => {
    await service.retirerPiece(u, z.string().max(20).parse(numero), z.number().int().min(1).parse(numeroPiece));
    return { ok: true, message: "Pièce retirée." };
  });
}

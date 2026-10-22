"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerUtilisateur } from "@/lib/auth/session";
import { journal } from "@/lib/journal";
import * as service from "@/lib/demandes/service";

export type Resultat = { ok: boolean; message?: string; numero?: string };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const quantite = z.coerce.number().int().min(1).max(1_000_000);
const ligneModifiee = z.object({
  numeroLigne: z.number().int().min(1),
  quantite,
  dateLivraisonSouhaitee: date.nullish(),
  dateExpeditionPrevue: date.or(z.literal("")).nullish().transform((v) => v || null),
});

const schemas = {
  creer: z.object({
    codeCanal: z.string().min(1).max(30),
    motif: z.string().max(2000).optional(),
    lignes: z
      .array(z.object({ codeArticle: z.string().min(1).max(30), quantite, unite: z.enum(["PIECE", "CARTON"]), dateLivraisonSouhaitee: date }))
      .min(1)
      .max(100),
  }),
  cible: z.object({ numero: z.string().max(20), version: z.number().int().min(0) }),
  motif: z.string().max(2000).optional(),
  lignes: z.array(ligneModifiee).max(100),
  rades: z.discriminatedUnion("type", [
    z.object({ type: z.literal("TOTALITE") }),
    z.object({
      type: z.literal("MODIFICATIONS"),
      motif: z.string().max(2000),
      lignes: z.array(z.object({ numeroLigne: z.number().int().min(1), quantite, dateExpeditionPrevue: date.or(z.literal("")).nullable().transform((v) => v || null) })),
    }),
    z.object({ type: z.literal("REFUS"), motif: z.string().max(2000) }),
  ]),
};

/** Exécute une action métier et convertit les erreurs en message affichable (et journalisé). */
async function executer(nom: string, f: () => Promise<string | undefined>, numero?: string): Promise<Resultat> {
  try {
    const message = await f();
    revalidatePath("/demandes");
    if (numero) revalidatePath(`/demandes/${numero}`);
    return { ok: true, message };
  } catch (e) {
    if (e instanceof service.ErreurMetier) return { ok: false, message: e.message };
    if (e instanceof z.ZodError) return { ok: false, message: "Saisie invalide : vérifiez les quantités et les dates." };
    journal.error(`Action ${nom} en échec`, { erreur: e, numero });
    return { ok: false, message: "Erreur technique : l'incident a été journalisé." };
  }
}

export async function creerDemande(saisie: unknown): Promise<Resultat> {
  const u = await exigerUtilisateur();
  let numero: string | undefined;
  const r = await executer("creerDemande", async () => {
    numero = await service.creerDemande(u, schemas.creer.parse(saisie));
    return `${numero} soumise au Chef de Vente.`;
  });
  return { ...r, numero };
}

export async function valider(numero: string, version: number) {
  const u = await exigerUtilisateur();
  return executer("valider", () => service.valider(u, ...cible(numero, version)), numero);
}

export async function rejeter(numero: string, version: number, motif: string) {
  const u = await exigerUtilisateur();
  return executer("rejeter", () => service.rejeter(u, ...cible(numero, version), schemas.motif.parse(motif) ?? ""), numero);
}

export async function annulerDecision(numero: string, version: number) {
  const u = await exigerUtilisateur();
  return executer("annulerDecision", () => service.annulerDecision(u, ...cible(numero, version)), numero);
}

export async function modifier(numero: string, version: number, lignes: unknown, motif?: string) {
  const u = await exigerUtilisateur();
  return executer(
    "modifier",
    () => service.modifier(u, ...cible(numero, version), schemas.lignes.parse(lignes), schemas.motif.parse(motif)),
    numero,
  );
}

export async function demanderModification(numero: string, version: number, lignes: unknown, motif: string) {
  const u = await exigerUtilisateur();
  return executer(
    "demanderModification",
    () => service.demanderModification(u, ...cible(numero, version), schemas.lignes.parse(lignes), schemas.motif.parse(motif) ?? ""),
    numero,
  );
}

export async function trancherModification(numero: string, version: number, accepter: boolean, motif?: string) {
  const u = await exigerUtilisateur();
  return executer(
    "trancherModification",
    () => service.trancherModification(u, ...cible(numero, version), accepter, schemas.motif.parse(motif)),
    numero,
  );
}

export async function retirerModification(numero: string, version: number) {
  const u = await exigerUtilisateur();
  return executer("retirerModification", () => service.retirerModification(u, ...cible(numero, version)), numero);
}

export async function deciderRades(numero: string, version: number, decision: unknown) {
  const u = await exigerUtilisateur();
  return executer("deciderRades", () => service.deciderRades(u, ...cible(numero, version), schemas.rades.parse(decision)), numero);
}

export async function expedier(numero: string, version: number) {
  const u = await exigerUtilisateur();
  return executer("expedier", () => service.expedier(u, ...cible(numero, version)), numero);
}

function cible(numero: string, version: number): [string, number] {
  const c = schemas.cible.parse({ numero, version });
  return [c.numero, c.version];
}

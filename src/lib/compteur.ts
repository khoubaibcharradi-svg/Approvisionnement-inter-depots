import type { Transaction } from "./prisma";

/**
 * Prochain numéro métier (DA-000001, IMP-000001…). L'upsert + increment est atomique sous InnoDB :
 * la ligne du compteur reste verrouillée jusqu'à la fin de la transaction, ce qui évite les doublons
 * quand plusieurs superviseurs soumettent en même temps.
 */
export async function prochainNumero(tx: Transaction, cle: string, prefixe: string, largeur = 6) {
  const c = await tx.compteur.upsert({
    where: { cle },
    create: { cle, valeur: 1 },
    update: { valeur: { increment: 1 } },
  });
  return `${prefixe}-${String(c.valeur).padStart(largeur, "0")}`;
}

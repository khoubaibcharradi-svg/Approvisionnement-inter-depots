import { prisma } from "./prisma";
import { PARAMETRES_DEFAUT } from "./constantes";

export async function parametreNombre(cle: keyof typeof PARAMETRES_DEFAUT & string) {
  const p = await prisma.parametre.findFirst({ where: { cle, isActif: true } });
  const v = Number(p?.valeur ?? PARAMETRES_DEFAUT[cle]?.valeur);
  return Number.isFinite(v) ? v : Number(PARAMETRES_DEFAUT[cle].valeur);
}

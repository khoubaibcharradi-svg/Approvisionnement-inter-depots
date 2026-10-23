import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";
import { LIBELLES_ROLES, type CodeRole } from "./constantes";

/**
 * Libellés des rôles lus dans la table `role` (modifiables par l'administrateur, par exemple dans phpMyAdmin) ;
 * le libellé du code sert seulement si la ligne est absente. Les codes, eux, restent fixes : ils portent les droits.
 */
export const libellesRoles = cache(async (): Promise<Record<CodeRole, string>> => {
  const lignes = await prisma.role.findMany({ select: { code: true, libelle: true } });
  const enBase = new Map(lignes.map((r) => [r.code, r.libelle]));
  return Object.fromEntries(Object.entries(LIBELLES_ROLES).map(([code, defaut]) => [code, enBase.get(code) ?? defaut])) as Record<CodeRole, string>;
});

/** Rôles proposés à l'attribution : actifs en base, dans l'ordre de la table. */
export async function rolesAttribuables() {
  const lignes = await prisma.role.findMany({ where: { isActif: true }, orderBy: { ordre: "asc" }, select: { code: true, libelle: true } });
  return lignes.filter((r) => r.code in LIBELLES_ROLES);
}

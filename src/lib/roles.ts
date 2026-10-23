import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";
import { ROLES, type CodeRole } from "./constantes";

/**
 * Libellés des rôles lus dans la table `role` (modifiables par l'administrateur, par exemple dans phpMyAdmin) ;
 * à défaut de ligne, le code est affiché. Les codes, eux, restent fixes : ils portent les droits.
 */
export const libellesRoles = cache(async (): Promise<Record<CodeRole, string>> => {
  const lignes = await prisma.role.findMany({ select: { code: true, libelle: true } });
  const enBase = new Map(lignes.map((r) => [r.code, r.libelle]));
  return Object.fromEntries(Object.values(ROLES).map((code) => [code, enBase.get(code) ?? code])) as Record<CodeRole, string>;
});

/** Rôles proposés à l'attribution : actifs en base, dans l'ordre de la table. */
export async function rolesAttribuables() {
  const lignes = await prisma.role.findMany({ where: { isActif: true }, orderBy: { ordre: "asc" }, select: { code: true, libelle: true } });
  return lignes.filter((r) => (Object.values(ROLES) as string[]).includes(r.code));
}

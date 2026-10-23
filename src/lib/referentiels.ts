import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";

/**
 * Référentiels d'affichage lus en base (tables libelle, logo, zone_carte, parametre) :
 * rien n'est figé dans le code, une modification en base est visible au chargement suivant.
 * Le code ne s'appuie que sur les codes ; à défaut de libellé, le code lui-même est affiché.
 */

export type Domaine =
  | "STATUT_DEMANDE"
  | "GROUPE_STATUT"
  | "ETAPE_DEMANDE"
  | "DECISION_DEPOT"
  | "UNITE"
  | "NATURE_CAISSE"
  | "ETAPE_INVENTAIRE"
  | "TEXTE";

/** Entrées actives d'un domaine, dans l'ordre de la table. */
export const listeLibelles = cache(async (domaine: Domaine) =>
  prisma.libelle.findMany({ where: { domaine, isActif: true }, orderBy: [{ ordre: "asc" }, { code: "asc" }], select: { code: true, libelle: true, valeur: true } }),
);

/** Dictionnaire code → libellé d'un domaine, avec repli sur le code. */
export async function libelles(domaine: Domaine) {
  const dict = Object.fromEntries((await listeLibelles(domaine)).map((l) => [l.code, l.libelle]));
  return new Proxy(dict, { get: (o, code: string) => (code in o ? o[code] : code) }) as Record<string, string>;
}

/** Textes du portail (domaine TEXTE). */
export async function textes() {
  return libelles("TEXTE");
}

export const parametreTexte = cache(async (cle: string) => (await prisma.parametre.findFirst({ where: { cle, isActif: true } }))?.valeur ?? null);

/** Logos actifs ; `chemin` est l'adresse publique du fichier (dossier public/logos). */
export const logos = cache(async () =>
  (await prisma.logo.findMany({ where: { isActif: true }, orderBy: [{ ordre: "asc" }, { code: "asc" }] })).map((l) => ({
    code: l.code,
    libelle: l.libelle,
    chemin: `/logos/${encodeURIComponent(l.fichier)}`,
    hauteur: l.hauteur,
    afficheConnexion: l.afficheConnexion,
  })),
);

export async function logo(code: string | null) {
  const tous = await logos();
  return tous.find((l) => l.code === code) ?? tous[0] ?? null;
}

/** Zones de la carte de connexion, avec la liste de leurs gouvernorats. */
export const zonesCarte = cache(async () =>
  (await prisma.zoneCarte.findMany({ where: { isActif: true }, orderBy: [{ ordre: "asc" }, { code: "asc" }] })).map((z) => ({
    code: z.code,
    libelle: z.libelle,
    gouvernorats: z.gouvernorats.split(",").map((g) => g.trim()).filter(Boolean),
  })),
);

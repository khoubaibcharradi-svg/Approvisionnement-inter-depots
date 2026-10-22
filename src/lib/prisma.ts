import { PrismaClient, Prisma } from "@prisma/client";
import { journal } from "./journal";

/**
 * Client Prisma partagé, avec suppression logique automatique :
 * - les lectures (findMany, findFirst, findUnique, count, aggregate, groupBy) excluent isDeleted = true ;
 * - delete / deleteMany sont interdits : utiliser supprimerLogiquement().
 * Les relations chargées par include ne sont pas filtrées : ajouter `where: { isDeleted: false }` dans l'include.
 */

const MODELES_SUPPRESSION_LOGIQUE = new Set([
  "Role",
  "Canal",
  "Depot",
  "Famille",
  "Article",
  "Utilisateur",
  "Affectation",
  "Demande",
  "LigneDemande",
  "DemandeModification",
  "ImportFichier",
  "Parametre",
  "Societe",
  "Magasin",
  "Vehicule",
  "CompteRendu",
  "CompteRenduStock",
  "CompteRenduVehicule",
  "CompteRenduRecette",
  "CompteRenduCaisse",
  "CompteRenduDepense",
  "CompteRenduPiece",
]);

const LECTURES = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]);
const LECTURES_UNIQUES = new Set(["findUnique", "findUniqueOrThrow"]);

function creerClient() {
  const base = new PrismaClient({
    log: [
      { emit: "event", level: "warn" },
      { emit: "event", level: "error" },
    ],
  });
  base.$on("warn", (e) => journal.warn("Prisma", { message: e.message }));
  base.$on("error", (e) => journal.error("Prisma", { message: e.message }));

  return base.$extends({
    name: "suppression-logique",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!MODELES_SUPPRESSION_LOGIQUE.has(model)) return query(args);
          if (operation === "delete" || operation === "deleteMany") {
            throw new Error(`Suppression physique interdite sur ${model} : utiliser supprimerLogiquement()`);
          }
          const a = (args ?? {}) as { where?: Record<string, unknown> };
          if (LECTURES.has(operation)) {
            a.where = a.where ? { AND: [a.where, { isDeleted: false }] } : { isDeleted: false };
          } else if (LECTURES_UNIQUES.has(operation)) {
            a.where = { ...a.where, isDeleted: false };
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type ClientPrisma = ReturnType<typeof creerClient>;
export type Transaction = Parameters<Parameters<ClientPrisma["$transaction"]>[0]>[0];

const g = globalThis as unknown as { __prisma?: ClientPrisma };
export const prisma: ClientPrisma = g.__prisma ?? creerClient();
if (process.env.NODE_ENV !== "production") g.__prisma = prisma;

/** Colonnes de suppression logique à passer à un update(). */
export function champsSuppression(login: string) {
  return { isDeleted: true, isActif: false, dateSuppression: new Date(), supprimePar: login, modifiePar: login };
}

export { Prisma };

import "server-only";
import { journal } from "./journal";

/**
 * Message d'erreur montré à l'utilisateur. Seuls les messages métier (lancés avec `new Error("…")`)
 * sont affichés tels quels ; une erreur technique (base de données, bug) est journalisée et remplacée
 * par un message neutre, pour ne pas exposer de détails internes (requêtes, tables, chemins).
 */
export function messagePublic(e: unknown, contexte: string) {
  if (e instanceof Error && e.constructor === Error) return e.message;
  journal.error(`${contexte} : erreur technique`, { erreur: e });
  return "Erreur technique : l'incident a été journalisé.";
}

import { journal, purgerJournaux } from "./journal";
import { purgerSauvegardes, sauvegarderBase } from "./sauvegarde";

/**
 * Tâches quotidiennes lancées au démarrage du serveur Node (instrumentation.ts) :
 * sauvegarde de la base à BACKUP_HEURE, puis purge des anciennes sauvegardes et des anciens journaux.
 * En cas de plusieurs instances, désactiver BACKUP_AUTO et planifier `npm run db:backup` via cron.
 */

const g = globalThis as unknown as { __planificateur?: NodeJS.Timeout; __derniereSauvegarde?: string };

export function demarrerPlanificateur() {
  if (g.__planificateur || process.env.BACKUP_AUTO === "false") return;
  const heure = process.env.BACKUP_HEURE || "02:00";
  journal.info("Planificateur démarré", { sauvegardeQuotidienneA: heure });
  g.__planificateur = setInterval(async () => {
    const maintenant = new Date();
    const hhmm = `${String(maintenant.getHours()).padStart(2, "0")}:${String(maintenant.getMinutes()).padStart(2, "0")}`;
    const jour = maintenant.toDateString();
    if (hhmm !== heure || g.__derniereSauvegarde === jour) return;
    g.__derniereSauvegarde = jour;
    try {
      await sauvegarderBase("planification quotidienne");
      purgerSauvegardes();
      purgerJournaux();
    } catch (e) {
      journal.error("Tâche quotidienne en échec", { erreur: e });
    }
  }, 30_000);
  g.__planificateur.unref();
}

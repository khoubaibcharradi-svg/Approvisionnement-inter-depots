import { exigerUtilisateur } from "@/lib/auth/session";
import { listerSauvegardes } from "@/lib/sauvegarde";
import { listerJournaux } from "@/lib/journal";
import { ROLES } from "@/lib/constantes";
import { BoutonSauvegarde } from "./bouton";

const taille = (o: number) => (o > 1048576 ? `${(o / 1048576).toFixed(1)} Mo` : `${Math.ceil(o / 1024)} Ko`);

export default async function PageSauvegardes() {
  await exigerUtilisateur([ROLES.ADMIN_FULL]);
  const sauvegardes = listerSauvegardes();
  const journaux = listerJournaux().slice(0, 60);
  return (
    <div className="flex flex-col gap-4">
      <div className="carte flex flex-col gap-2">
        <h1 className="titre-page">Sauvegardes de la base</h1>
        <p className="note">
          Sauvegarde texte automatique chaque jour à {process.env.BACKUP_HEURE || "02:00"}
          {process.env.BACKUP_AUTO === "false" ? " (désactivée ici : planifiée par le cron système)" : ""}, conservée {process.env.BACKUP_RETENTION_JOURS || 90} jours.
          Chaque fichier contient des instructions SQL rejouables, avec une empreinte SHA-256 de contrôle.
          Restauration : <code>npm run db:restore -- &lt;fichier&gt; --confirmer</code>.
        </p>
        <BoutonSauvegarde />
      </div>
      <div className="carte overflow-x-auto p-0">
        <table className="tableau">
          <thead><tr><th>Fichier</th><th>Date</th><th>Taille</th><th></th></tr></thead>
          <tbody>
            {sauvegardes.map((s) => (
              <tr key={s.fichier}>
                <td className="font-mono text-xs">{s.fichier}</td>
                <td>{s.date.toLocaleString("fr-FR")}</td>
                <td>{taille(s.octets)}</td>
                <td><a className="text-marque underline" href={`/api/sauvegardes/${s.fichier}`}>Télécharger</a></td>
              </tr>
            ))}
            {!sauvegardes.length && <tr><td colSpan={4} className="note py-4 text-center">Aucune sauvegarde pour l&apos;instant.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="carte flex flex-col gap-2">
        <h2 className="font-semibold">Fichiers de journal</h2>
        <p className="note">Un fichier par jour (app-*.log : toutes les actions ; erreurs-*.log : erreurs seules), au format JSON ligne par ligne.</p>
        <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {journaux.map((j) => (
            <li key={j.fichier}><a className="font-mono text-xs text-marque underline" href={`/api/journaux/${j.fichier}`}>{j.fichier}</a> <span className="note">({taille(j.octets)})</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

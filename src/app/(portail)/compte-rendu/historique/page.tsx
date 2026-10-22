import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constantes";

export default async function PageHistorique() {
  const u = await exigerUtilisateur([ROLES.AGENT_DEPOT]);
  const liste = u.codeDepotAgent
    ? await prisma.compteRendu.findMany({
        where: { codeDepot: u.codeDepotAgent },
        orderBy: { dateJournee: "desc" },
        take: 60,
        include: { agent: { select: { nomComplet: true } } },
      })
    : [];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Historique des comptes rendus de mon dépôt</h1>
      <div className="carte overflow-x-auto p-0">
        <table className="tableau">
          <thead><tr><th>Journée</th><th>N°</th><th>Agent</th><th>Statut</th></tr></thead>
          <tbody>
            {liste.map((c) => (
              <tr key={c.numero}>
                <td>{c.dateJournee.toLocaleDateString("fr-FR", { timeZone: "UTC" })}</td>
                <td><Link className="text-marque underline" href={`/compte-rendu/${c.numero}`}>{c.numero}</Link></td>
                <td>{c.agent.nomComplet}</td>
                <td><span className="badge">{c.statut === "SOUMIS" ? "Soumis" : "Brouillon"}</span></td>
              </tr>
            ))}
            {!liste.length && <tr><td colSpan={4} className="note py-4 text-center">Aucun compte rendu.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ROLES } from "@/lib/constantes";
import { chargerJournee, journeesAutorisees } from "@/lib/compte-rendu/service";
import { auditer } from "@/lib/audit";
import { FormulaireCompteRendu } from "./formulaire";

export default async function PageCompteRendu({ searchParams }: { searchParams: Promise<{ date?: string; mdp?: string; refus?: string }> }) {
  const u = await exigerUtilisateur([ROLES.AGENT_DEPOT]);
  const p = await searchParams;
  if (!u.codeDepotAgent) {
    return <p className="alerte-erreur">Aucun dépôt ne vous est affecté : contactez l&apos;administrateur.</p>;
  }
  const dates = await journeesAutorisees();
  const date = p.date && dates.includes(p.date) ? p.date : dates[0];
  if (p.date && p.date !== date) {
    await auditer({ action: "COMPTE_RENDU_JOURNEE_REFUSEE", login: u.login, codeRole: u.role, entite: "CompteRendu", detail: p.date.slice(0, 10), succes: false });
  }
  const journee = await chargerJournee(u, date);
  const libelleDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-4">
      {p.mdp && <p className="alerte-ok">Mot de passe modifié.</p>}
      {p.refus && <p className="alerte-erreur">Accès refusé : cette page n&apos;est pas ouverte à votre profil.</p>}
      {p.date && p.date !== date && <p className="alerte-erreur">La journée du {p.date} n&apos;est plus ouverte à la saisie.</p>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Compte rendu journalier — dépôt {journee.depot.libelle}</h1>
          <p className="note">ENR-08 · Montants au coût de revient, en dinars (3 décimales).</p>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Journée">
          {dates.map((d) => (
            <Link key={d} href={`/compte-rendu?date=${d}`} className={d === date ? "btn" : "btn-secondaire"}>
              {d === dates[0] ? "Aujourd'hui" : libelleDate(d)}
            </Link>
          ))}
        </nav>
      </div>
      <FormulaireCompteRendu key={date} journee={journee} />
    </div>
  );
}

import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ROLES } from "@/lib/constantes";
import { chargerJournee, journeesAccessibles } from "@/lib/compte-rendu/service";
import { auditer } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { FormulaireCompteRendu } from "./formulaire";

export default async function PageCompteRendu({ searchParams }: { searchParams: Promise<{ date?: string; mdp?: string; refus?: string }> }) {
  const u = await exigerUtilisateur([ROLES.AGENT_DEPOT]);
  const p = await searchParams;
  if (!u.codeDepotAgent) {
    return <p className="alerte-erreur">Aucun dépôt ne vous est affecté : contactez l&apos;administrateur.</p>;
  }
  const { dates } = await journeesAccessibles(u.codeDepotAgent);
  const date = p.date && dates.includes(p.date) ? p.date : dates[0];
  if (p.date && p.date !== date) {
    await auditer({ action: "COMPTE_RENDU_JOURNEE_REFUSEE", login: u.login, codeRole: u.role, entite: "CompteRendu", detail: p.date.slice(0, 10), succes: false });
  }
  const journee = await chargerJournee(u, date);
  // Journées déjà envoyées : une coche sur leur bouton.
  const soumises = new Set(
    (await prisma.compteRendu.findMany({
      where: { codeDepot: u.codeDepotAgent, statut: "SOUMIS", dateJournee: { in: dates.map((d) => new Date(`${d}T00:00:00.000Z`)) } },
      select: { dateJournee: true },
    })).map((c) => c.dateJournee.toISOString().slice(0, 10)),
  );
  const soumis = journee.statut === "SOUMIS";
  const aujourdhui = date === dates[0];
  const libelleDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-4">
      {p.mdp && <p className="alerte-ok">Mot de passe modifié.</p>}
      {p.refus && <p className="alerte-erreur">Accès refusé : cette page n&apos;est pas ouverte à votre profil.</p>}
      {p.date && p.date !== date && <p className="alerte-erreur">La journée du {p.date} n&apos;est plus ouverte à la saisie.</p>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titre-page">Compte rendu journalier — dépôt {journee.depot.libelle}</h1>
          <p className="note">ENR-08 · Montants au coût de revient, en dinars (3 décimales).</p>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Journée">
          {dates.map((d) => (
            <Link key={d} href={`/compte-rendu?date=${d}`} className={d === date ? "btn" : "btn-secondaire"} title={soumises.has(d) ? "Compte rendu envoyé" : undefined}>
              {soumises.has(d) && <span aria-label="envoyé" className={d === date ? "text-emerald-200" : "text-emerald-600"}>✓</span>}
              {d === dates[0] ? "Aujourd'hui" : libelleDate(d)}
            </Link>
          ))}
        </nav>
      </div>
      {soumis && (
        <section className="carte flex flex-col items-center gap-3 border-emerald-200 bg-emerald-50/70 py-8 text-center" aria-live="polite">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white" aria-hidden="true">✓</span>
          <h2 className="text-xl font-semibold text-emerald-900">Mission accomplie</h2>
          <p className="max-w-xl text-emerald-900">
            {aujourdhui ? "Le travail d'aujourd'hui est terminé." : `Le travail du ${libelleDate(date)} est terminé.`}{" "}
            Le compte rendu <b>{journee.numero}</b> a été envoyé
            {journee.dateSoumission && <> le {new Date(journee.dateSoumission).toLocaleDateString("fr-FR")} à {new Date(journee.dateSoumission).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</>}
            {journee.agent && <> par {journee.agent}</>}. Merci !
          </p>
          <p className="note max-w-xl">Un seul compte rendu par jour et par dépôt : il n&apos;est plus modifiable. En cas d&apos;erreur, contactez l&apos;administrateur.</p>
          <Link href="/compte-rendu/historique" className="btn-secondaire">Voir l&apos;historique</Link>
        </section>
      )}
      <FormulaireCompteRendu key={date} journee={journee} />
    </div>
  );
}

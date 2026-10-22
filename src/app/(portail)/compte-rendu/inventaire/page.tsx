import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ROLES } from "@/lib/constantes";
import { journeesAutorisees } from "@/lib/compte-rendu/service";
import { chargerInventaire } from "@/lib/compte-rendu/inventaire";
import { FormulaireInventaire } from "./formulaire";

export default async function PageInventaire({ searchParams }: { searchParams: Promise<{ date?: string; magasin?: string }> }) {
  const u = await exigerUtilisateur([ROLES.AGENT_DEPOT]);
  const p = await searchParams;
  if (!u.codeDepotAgent) return <p className="alerte-erreur">Aucun dépôt ne vous est affecté : contactez l&apos;administrateur.</p>;
  const dates = await journeesAutorisees();
  const date = p.date && dates.includes(p.date) ? p.date : dates[0];
  const inv = await chargerInventaire(u, date, p.magasin);
  const lien = (q: { date?: string; magasin?: string }) => `/compte-rendu/inventaire?${new URLSearchParams({ date: q.date ?? date, ...(q.magasin ?? inv.magasin?.code ? { magasin: q.magasin ?? inv.magasin!.code } : {}) })}`;
  const libelleDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Inventaire journalier (quantités en pièces)</h1>
          <p className="note">Une fois l&apos;inventaire enregistré, la « situation du stock » du <Link className="underline" href={`/compte-rendu?date=${date}`}>compte rendu</Link> se remplit automatiquement (valorisation au coût de revient).</p>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Journée">
          {dates.map((d) => (
            <Link key={d} href={lien({ date: d })} className={d === date ? "btn" : "btn-secondaire"}>{d === dates[0] ? "Aujourd'hui" : libelleDate(d)}</Link>
          ))}
        </nav>
      </div>
      {!inv.magasin ? (
        <p className="alerte-erreur">Aucun magasin n&apos;est paramétré pour votre dépôt : contactez l&apos;administrateur.</p>
      ) : (
        <>
          <nav className="flex flex-wrap gap-1" aria-label="Magasin">
            {inv.magasins.map((m) => (
              <Link key={m.code} href={lien({ magasin: m.code })} className={m.code === inv.magasin!.code ? "btn" : "btn-secondaire"}>{m.societe} · {m.libelle}</Link>
            ))}
          </nav>
          <FormulaireInventaire key={`${date}-${inv.magasin.code}`} inventaire={inv} />
        </>
      )}
    </div>
  );
}

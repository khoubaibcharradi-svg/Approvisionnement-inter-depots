import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { compterParStatut, listerDemandes } from "@/lib/demandes/lecture";
import { GROUPES_STATUTS, LIBELLES_STATUTS, ROLES } from "@/lib/constantes";

type Params = { groupe?: string; q?: string; page?: string; refus?: string; mdp?: string; ok?: string };

export default async function PageDemandes({ searchParams }: { searchParams: Promise<Params> }) {
  const u = await exigerUtilisateur();
  const p = await searchParams;
  const groupe = GROUPES_STATUTS.find((g) => g.titre === p.groupe);
  const [compteurs, liste] = await Promise.all([
    compterParStatut(u),
    listerDemandes(u, { statuts: groupe?.statuts, recherche: p.q, page: Number(p.page) || 1 }),
  ]);
  const total = (statuts: string[]) => statuts.reduce((s, x) => s + (compteurs[x as keyof typeof compteurs] ?? 0), 0);
  const portee =
    u.role === ROLES.SUPERVISEUR ? "Vos demandes uniquement" : u.role === ROLES.CHEF_VENTE ? `Circuit : ${u.canaux.join(", ")}` : "Toutes les demandes";
  const lien = (q: Partial<Params>) => {
    const s = new URLSearchParams(Object.entries({ groupe: p.groupe, q: p.q, ...q }).filter(([, v]) => v) as [string, string][]);
    return `/demandes${s.size ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {p.refus && <p className="alerte-erreur">Accès refusé : cette page n&apos;est pas ouverte à votre profil.</p>}
      {p.mdp && <p className="alerte-ok">Mot de passe modifié.</p>}
      {p.ok && <p className="alerte-ok">{p.ok}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {GROUPES_STATUTS.map((g) => (
          <Link key={g.titre} href={lien({ groupe: g.titre, page: undefined })} className={`carte text-center ${groupe?.titre === g.titre ? "ring-2 ring-marque" : ""}`}>
            <div className="text-2xl font-semibold">{total(g.statuts)}</div>
            <div className="note">{g.titre}</div>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Demandes{groupe ? ` · ${groupe.titre}` : ""}</h1>
          <p className="note">{portee} · {liste.total} demande(s)</p>
        </div>
        <form className="flex gap-2">
          {p.groupe && <input type="hidden" name="groupe" value={p.groupe} />}
          <input name="q" defaultValue={p.q} placeholder="N° de demande (DA-…)" className="champ" />
          <button className="btn-secondaire">Rechercher</button>
          {(p.groupe || p.q) && <Link href="/demandes" className="btn-secondaire">Tout afficher</Link>}
        </form>
      </div>

      <div className="carte overflow-x-auto p-0">
        <table className="tableau">
          <thead>
            <tr>
              <th>N°</th><th>Statut</th><th>Canal</th><th>Dépôt</th><th>Saisie par</th><th>Date</th><th>Articles</th><th></th>
            </tr>
          </thead>
          <tbody>
            {liste.demandes.map((d) => (
              <tr key={d.numero}>
                <td className="font-medium"><Link href={`/demandes/${d.numero}`} className="text-marque underline">{d.numero}</Link></td>
                <td><span className="badge">{LIBELLES_STATUTS[d.statut]}</span></td>
                <td>{d.canal.libelle}</td>
                <td>{d.depot.libelle}</td>
                <td>{d.saisiePar.nomComplet}</td>
                <td>{d.dateSaisie.toLocaleDateString("fr-FR")}</td>
                <td>{d._count.lignes}</td>
                <td>{d.modifications.length > 0 && <span className="badge bg-amber-100 text-amber-800">Modification demandée</span>}</td>
              </tr>
            ))}
            {!liste.demandes.length && (
              <tr><td colSpan={8} className="note py-6 text-center">Aucune demande à afficher.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {liste.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {liste.page > 1 && <Link className="btn-secondaire" href={lien({ page: String(liste.page - 1) })}>Précédent</Link>}
          <span>Page {liste.page} / {liste.pages}</span>
          {liste.page < liste.pages && <Link className="btn-secondaire" href={lien({ page: String(liste.page + 1) })}>Suivant</Link>}
        </div>
      )}
    </div>
  );
}

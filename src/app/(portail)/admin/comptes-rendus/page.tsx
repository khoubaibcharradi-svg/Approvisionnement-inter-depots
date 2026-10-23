import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ROLES, ROLES_LECTURE_COMPTES_RENDUS } from "@/lib/constantes";
import { filtreCompteRendu, type FiltresCompteRendu } from "@/lib/compte-rendu/service";

const TAILLE_PAGE = 50;
const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default async function PageComptesRendus({ searchParams }: { searchParams: Promise<FiltresCompteRendu & { page?: string; refus?: string; mdp?: string }> }) {
  await exigerUtilisateur(ROLES_LECTURE_COMPTES_RENDUS);
  const p = await searchParams;
  // Par défaut : les 7 derniers jours.
  const auj = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const { refus: _refus, mdp: _mdp, ...filtres } = p;
  const f: FiltresCompteRendu = { ...filtres, du: p.du ?? iso(new Date(auj.getTime() - 6 * 86_400_000)), au: p.au ?? iso(auj) };
  const page = Math.max(1, Number(p.page) || 1);
  const where = filtreCompteRendu(f);

  const [depots, magasins, agents, total, liste, sansCompteRendu] = await Promise.all([
    prisma.depot.findMany({ orderBy: { libelle: "asc" } }),
    prisma.magasin.findMany({ where: f.depot ? { codeDepot: f.depot } : {}, include: { societe: true }, orderBy: [{ codeDepot: "asc" }, { libelle: "asc" }] }),
    prisma.utilisateur.findMany({ where: { codeRole: ROLES.AGENT_DEPOT, ...(f.depot ? { codeDepotAgent: f.depot } : {}) }, orderBy: { nomComplet: "asc" } }),
    prisma.compteRendu.count({ where }),
    prisma.compteRendu.findMany({
      where,
      orderBy: [{ dateJournee: "desc" }, { codeDepot: "asc" }],
      skip: (page - 1) * TAILLE_PAGE,
      take: TAILLE_PAGE,
      include: {
        depot: true,
        agent: { select: { nomComplet: true } },
        stocks: { where: { isDeleted: false }, select: { ecart: true } },
        recettes: { where: { isDeleted: false }, select: { ecart: true } },
        caisses: { where: { isDeleted: false }, select: { ecart: true } },
        _count: { select: { pieces: { where: { isDeleted: false } } } },
      },
    }),
    // Contrôle : dépôts ayant des agents mais sans compte rendu soumis hier.
    prisma.depot.findMany({
      where: {
        agents: { some: { codeRole: ROLES.AGENT_DEPOT, isActif: true } },
        comptesRendus: { none: { statut: "SOUMIS", dateJournee: new Date(`${iso(new Date(auj.getTime() - 86_400_000))}T00:00:00.000Z`) } },
      },
      select: { libelle: true },
    }),
  ]);
  const somme = (xs: { ecart: { toNumber(): number } }[]) => xs.reduce((a, x) => a + Math.round(x.ecart.toNumber() * 1000), 0) / 1000;
  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE));
  const lien = (n: number) => `/admin/comptes-rendus?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Record<string, string>), page: String(n) })}`;
  const classe = (n: number) => (n === 0 ? "" : "font-semibold text-red-700");

  return (
    <div className="flex flex-col gap-4">
      {p.mdp && <p className="alerte-ok">Mot de passe modifié.</p>}
      {p.refus && <p className="alerte-erreur">Accès refusé : cette page n&apos;est pas ouverte à votre profil.</p>}
      <h1 className="text-lg font-semibold">Comptes rendus journaliers des dépôts</h1>
      <form className="carte grid gap-3 sm:grid-cols-3 lg:grid-cols-7 lg:items-end">
        <label className="etiquette">Date début<input type="date" name="du" defaultValue={f.du} className="champ" /></label>
        <label className="etiquette">Date fin<input type="date" name="au" defaultValue={f.au} className="champ" /></label>
        <label className="etiquette">Dépôt
          <select name="depot" defaultValue={f.depot} className="champ"><option value="">Tous</option>{depots.map((d) => <option key={d.code} value={d.code}>{d.libelle}</option>)}</select>
        </label>
        <label className="etiquette">Magasin
          <select name="magasin" defaultValue={f.magasin} className="champ"><option value="">Tous</option>{magasins.map((m) => <option key={m.code} value={m.code}>{m.libelle} ({m.societe.libelle})</option>)}</select>
        </label>
        <label className="etiquette">Agent
          <select name="agent" defaultValue={f.agent} className="champ"><option value="">Tous</option>{agents.map((a) => <option key={a.login} value={a.login}>{a.nomComplet}</option>)}</select>
        </label>
        <label className="etiquette">Statut
          <select name="statut" defaultValue={f.statut} className="champ"><option value="">Tous</option><option value="SOUMIS">Soumis</option><option value="BROUILLON">Brouillon</option></select>
        </label>
        <div className="flex gap-2"><button className="btn">Filtrer</button><Link href="/admin/comptes-rendus" className="btn-secondaire">Réinitialiser</Link></div>
      </form>

      {sansCompteRendu.length > 0 && (
        <p className="alerte-erreur">Pas de compte rendu soumis hier pour : {sansCompteRendu.map((d) => d.libelle).join(", ")}.</p>
      )}

      <div className="carte overflow-x-auto p-0">
        <table className="tableau">
          <thead>
            <tr><th>Journée</th><th>N°</th><th>Dépôt</th><th>Agent</th><th>Statut</th><th className="text-right">Écart stock</th><th className="text-right">Écart recettes</th><th className="text-right">Écart caisse</th><th>Annexes</th></tr>
          </thead>
          <tbody>
            {liste.map((c) => {
              const es = somme(c.stocks), er = somme(c.recettes), ec = somme(c.caisses);
              return (
                <tr key={c.numero}>
                  <td>{c.dateJournee.toLocaleDateString("fr-FR", { timeZone: "UTC" })}</td>
                  <td><Link className="text-marque underline" href={`/admin/comptes-rendus/${c.numero}`}>{c.numero}</Link></td>
                  <td>{c.depot.libelle}</td>
                  <td>{c.agent.nomComplet}</td>
                  <td><span className={`badge ${c.statut === "SOUMIS" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{c.statut === "SOUMIS" ? "Soumis" : "Brouillon"}</span></td>
                  <td className={`text-right tabular-nums ${classe(es)}`}>{fmt(es)}</td>
                  <td className={`text-right tabular-nums ${classe(er)}`}>{fmt(er)}</td>
                  <td className={`text-right tabular-nums ${classe(ec)}`}>{fmt(ec)}</td>
                  <td>{c._count.pieces}</td>
                </tr>
              );
            })}
            {!liste.length && <tr><td colSpan={9} className="note py-6 text-center">Aucun compte rendu pour ces filtres.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">{total} compte(s) rendu(s). Écarts en dinars ; en rouge lorsqu&apos;ils sont différents de zéro.</p>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link className="btn-secondaire" href={lien(page - 1)}>Précédent</Link>}
          <span>Page {page} / {pages}</span>
          {page < pages && <Link className="btn-secondaire" href={lien(page + 1)}>Suivant</Link>}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constantes";
import { listerInventaires, type FiltresInventaire } from "@/lib/compte-rendu/inventaire";

const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default async function PageInventaires({ searchParams }: { searchParams: Promise<FiltresInventaire> }) {
  await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  const p = await searchParams;
  const auj = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const f: FiltresInventaire = { ...p, du: p.du ?? iso(new Date(auj.getTime() - 6 * 86_400_000)), au: p.au ?? iso(auj) };
  const [depots, magasins, liste] = await Promise.all([
    prisma.depot.findMany({ orderBy: { libelle: "asc" } }),
    prisma.magasin.findMany({ where: f.depot ? { codeDepot: f.depot } : {}, include: { societe: true }, orderBy: [{ codeDepot: "asc" }, { libelle: "asc" }] }),
    listerInventaires(f),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Inventaires des dépôts</h1>
      <form className="carte grid gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
        <label className="etiquette">Date début<input type="date" name="du" defaultValue={f.du} className="champ" /></label>
        <label className="etiquette">Date fin<input type="date" name="au" defaultValue={f.au} className="champ" /></label>
        <label className="etiquette">Dépôt
          <select name="depot" defaultValue={f.depot} className="champ"><option value="">Tous</option>{depots.map((d) => <option key={d.code} value={d.code}>{d.libelle}</option>)}</select>
        </label>
        <label className="etiquette">Magasin
          <select name="magasin" defaultValue={f.magasin} className="champ"><option value="">Tous</option>{magasins.map((m) => <option key={m.code} value={m.code}>{m.libelle} ({m.societe.libelle})</option>)}</select>
        </label>
        <label className="etiquette">Statut
          <select name="statut" defaultValue={f.statut} className="champ"><option value="">Tous</option><option value="EN_COURS">En cours</option><option value="CLOTURE">Clôturé</option></select>
        </label>
        <div className="flex gap-2"><button className="btn">Filtrer</button><Link href="/admin/inventaires" className="btn-secondaire">Réinitialiser</Link></div>
      </form>
      <div className="carte overflow-x-auto p-0">
        <table className="tableau">
          <thead><tr><th>Journée</th><th>Dépôt</th><th>Magasin</th><th>Société</th><th>Statut</th><th>Articles</th><th>Non comptés</th><th className="text-right">Écart valorisé (DT)</th><th>Réouvertures</th></tr></thead>
          <tbody>
            {liste.map((i) => (
              <tr key={`${i.codeMagasin}-${i.dateJournee}`}>
                <td><Link className="text-marque underline" href={`/admin/inventaires/${encodeURIComponent(i.codeMagasin)}/${i.dateJournee}`}>{new Date(`${i.dateJournee}T12:00:00`).toLocaleDateString("fr-FR")}</Link></td>
                <td>{i.depot}</td><td>{i.magasin}</td><td>{i.societe}</td>
                <td><span className={`badge ${i.statut === "CLOTURE" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{i.statut === "CLOTURE" ? "🔒 Clôturé" : "En cours"}</span></td>
                <td>{i.nbLignes}</td>
                <td className={i.nonComptes ? "font-semibold text-red-700" : ""}>{i.nonComptes}</td>
                <td className={`text-right tabular-nums ${i.ecartValorise ? "font-semibold text-red-700" : ""}`}>{fmt(i.ecartValorise)}</td>
                <td>{i.nbReouvertures || ""}</td>
              </tr>
            ))}
            {!liste.length && <tr><td colSpan={9} className="note py-6 text-center">Aucun inventaire pour ces filtres.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

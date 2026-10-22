import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { auditer } from "@/lib/audit";
import { ROLES } from "@/lib/constantes";
import { detailInventaireAdmin } from "@/lib/compte-rendu/inventaire";
import { FormulaireReouverture } from "./reouverture";

const qte = (n: number | null) => (n === null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: 3 }));
const dt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default async function PageDetailInventaire({ params }: { params: Promise<{ magasin: string; date: string }> }) {
  const u = await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  const { magasin, date } = await params;
  const codeMagasin = decodeURIComponent(magasin).slice(0, 30);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const inv = await detailInventaireAdmin(codeMagasin, date);
  if (!inv) notFound();
  await auditer({ action: "CONSULTATION_INVENTAIRE", login: u.login, codeRole: u.role, entite: "Inventaire", cleEntite: `${codeMagasin}/${date}` });
  const e = inv.entete;
  const total = inv.lignes.reduce((s, l) => s + Math.round(l.ecart * l.prixRevient * 1000), 0) / 1000;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/inventaires" className="note underline">← Inventaires</Link>
      <div className="carte flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Inventaire · {inv.magasin} ({inv.societe}) · dépôt {inv.depot} · {new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h1>
          <p className="note">
            {e.statut === "CLOTURE" ? `Clôturé le ${e.dateCloture?.toLocaleString("fr-FR")} par ${e.loginCloture}` : "En cours de saisie"}
            {inv.compteRendu && <> · compte rendu <Link className="underline" href={`/admin/comptes-rendus/${inv.compteRendu.numero}`}>{inv.compteRendu.numero}</Link> ({inv.compteRendu.statut === "SOUMIS" ? "soumis" : "brouillon"})</>}
          </p>
        </div>
        <span className={`badge ${e.statut === "CLOTURE" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{e.statut === "CLOTURE" ? "🔒 Clôturé" : "En cours"}</span>
      </div>

      <div className="carte overflow-x-auto p-0">
        <table className="tableau">
          <thead><tr><th>Code</th><th>Désignation</th><th>Initial</th><th>Réceptions</th><th>Ventes</th><th>Retours</th><th>Théorique</th><th>Réel</th><th>Écart</th><th>Prix de revient</th><th>Écart (DT)</th></tr></thead>
          <tbody>
            {inv.lignes.map((l) => (
              <tr key={l.codeArticle} className={l.ecart !== 0 || l.stockFinalReel === null ? "bg-red-50" : ""}>
                <td className="font-mono text-xs">{l.codeArticle}</td><td>{l.designation}</td>
                {[l.stockInitial, l.receptions, l.ventes, l.retours, l.stockFinalTheorique, l.stockFinalReel, l.ecart].map((v, i) => <td key={i} className="text-right tabular-nums">{qte(v)}</td>)}
                <td className="text-right tabular-nums">{dt(l.prixRevient)}</td>
                <td className="text-right tabular-nums">{dt(Math.round(l.ecart * l.prixRevient * 1000) / 1000)}</td>
              </tr>
            ))}
            <tr className="font-semibold"><td colSpan={10}>Écart valorisé total</td><td className={`text-right tabular-nums ${total ? "text-red-700" : ""}`}>{dt(total)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="carte flex flex-col gap-3">
        <h2 className="font-semibold">Réouvertures</h2>
        {e.reouvertures.length ? (
          <ul className="list-disc pl-5 text-sm">
            {e.reouvertures.map((r) => <li key={r.numero}>n° {r.numero} · {r.date.toLocaleString("fr-FR")} · {r.loginAdmin} : {r.motif}</li>)}
          </ul>
        ) : <p className="note">Aucune réouverture.</p>}
        <FormulaireReouverture codeMagasin={codeMagasin} dateJournee={date} cloture={e.statut === "CLOTURE"} compteRenduSoumis={inv.compteRendu?.statut === "SOUMIS"} />
      </div>
    </div>
  );
}

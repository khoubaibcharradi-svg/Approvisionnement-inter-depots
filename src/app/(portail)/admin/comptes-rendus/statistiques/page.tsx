import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constantes";
import { statistiquesComptesRendus, type Cellule } from "@/lib/compte-rendu/statistiques";

export const dynamic = "force-dynamic";

const CELLULES: Record<Cellule["etat"], { classe: string; symbole: string; libelle: string }> = {
  SOUMIS: { classe: "bg-emerald-500 text-white", symbole: "✓", libelle: "Envoyé le jour même" },
  RETARD: { classe: "bg-amber-400 text-amber-950", symbole: "✓", libelle: "Envoyé en retard" },
  BROUILLON: { classe: "bg-sky-200 text-sky-900", symbole: "…", libelle: "Brouillon non envoyé" },
  MANQUANT: { classe: "bg-red-500 text-white", symbole: "✗", libelle: "Aucun compte rendu" },
  EN_COURS: { classe: "bg-amber-100 text-amber-800 ring-1 ring-amber-300", symbole: "·", libelle: "Journée en cours, pas encore commencé" },
  NON_OUVRE: { classe: "bg-slate-100 text-slate-400", symbole: "–", libelle: "Jour non ouvré" },
  A_VENIR: { classe: "bg-slate-100 text-slate-400", symbole: "", libelle: "Journée à venir" },
};
const dt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");

function Tuile({ titre, valeur, detail, ton = "neutre" }: { titre: string; valeur: string; detail?: string; ton?: "neutre" | "bon" | "alerte" }) {
  const couleurs = { neutre: "text-slate-900", bon: "text-emerald-700", alerte: "text-red-700" };
  return (
    <div className="carte flex flex-col gap-1 p-4">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{titre}</p>
      <p className={`text-2xl font-semibold ${couleurs[ton]}`}>{valeur}</p>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

export default async function PageSuiviComptesRendus({ searchParams }: { searchParams: Promise<{ du?: string; au?: string; depot?: string }> }) {
  await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  const p = await searchParams;
  const valide = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const au = valide(p.au) ?? local(new Date());
  const du = valide(p.du) ?? local(new Date(Date.now() - 13 * 86_400_000));
  const [s, depots] = await Promise.all([statistiquesComptesRendus(du, au, p.depot || undefined), prisma.depot.findMany({ where: { isActif: true }, orderBy: { libelle: "asc" } })]);
  const i = s.indicateurs;
  const jourCourt = (j: string) => new Date(`${j}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="titre-page">Suivi des comptes rendus</h1>
        <p className="note">Qui a envoyé son compte rendu, qui ne l&apos;a pas fait, retards et écarts. Un compte rendu est attendu chaque jour ouvré (paramètre CR_JOURS_NON_OUVRES) pour chaque dépôt ayant un agent actif.</p>
      </div>

      <form className="carte grid gap-3 sm:grid-cols-4 sm:items-end">
        <label className="etiquette">Du<input type="date" name="du" defaultValue={du} className="champ" /></label>
        <label className="etiquette">Au<input type="date" name="au" defaultValue={au} className="champ" /></label>
        <label className="etiquette">Dépôt
          <select name="depot" defaultValue={p.depot ?? ""} className="champ">
            <option value="">Tous</option>
            {depots.map((d) => <option key={d.code} value={d.code}>{d.libelle}</option>)}
          </select>
        </label>
        <div className="flex gap-2"><button className="btn">Afficher</button><Link href="/admin/comptes-rendus/statistiques" className="btn-secondaire">Réinitialiser</Link></div>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Tuile titre="Attendus" valeur={String(i.attendus)} detail={`${s.matrice.length} dépôt(s) · ${s.jours.length} jour(s)`} />
        <Tuile titre="Envoyés" valeur={String(i.soumis)} detail={`Taux de remise ${pct(i.soumis, i.attendus)}`} ton="bon" />
        <Tuile titre="À l'heure" valeur={String(i.aTemps)} detail={`Envoyés le jour même · ${pct(i.aTemps, i.soumis)}`} />
        <Tuile titre="En retard" valeur={String(i.enRetard)} detail="Envoyés un jour suivant" ton={i.enRetard ? "alerte" : "neutre"} />
        <Tuile titre="Non envoyés" valeur={String(i.manquants + i.brouillons)} detail={`${i.manquants} manquant(s) · ${i.brouillons} brouillon(s)`} ton={i.manquants + i.brouillons ? "alerte" : "neutre"} />
        <Tuile titre="Heure moyenne d'envoi" valeur={i.heureMoyenne ?? "—"} detail="Comptes rendus du jour même" />
      </div>

      {s.aujourdhuiParDepot.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Aujourd&apos;hui</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {s.aujourdhuiParDepot.map((d) => {
              const c = d.cellule;
              return (
                <div key={d.code} className={`carte flex flex-col gap-1 p-4 ${c.etat === "SOUMIS" || c.etat === "RETARD" ? "border-emerald-200 bg-emerald-50/60" : c.etat === "BROUILLON" ? "border-sky-200 bg-sky-50/60" : "border-amber-200 bg-amber-50/60"}`}>
                  <p className="font-semibold">Dépôt {d.libelle}</p>
                  <p className="text-sm">
                    {c.etat === "SOUMIS" || c.etat === "RETARD" ? <>✓ Envoyé à {c.heure} par {c.agent} · <Link className="underline" href={`/admin/comptes-rendus/${c.numero}`}>{c.numero}</Link></>
                      : c.etat === "BROUILLON" ? <>En cours de saisie par {c.agent} (brouillon {c.numero})</>
                      : <>Pas encore commencé</>}
                  </p>
                  <p className="text-xs text-slate-500">Agent(s) : {d.agents.map((a) => a.nomComplet).join(", ")}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Dépôts × jours</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          {(Object.keys(CELLULES) as Cellule["etat"][]).map((e) => (
            <span key={e} className="flex items-center gap-1.5"><span className={`inline-flex h-4 w-4 items-center justify-center rounded ${CELLULES[e].classe}`}>{CELLULES[e].symbole}</span>{CELLULES[e].libelle}</span>
          ))}
        </div>
        <div className="carte overflow-x-auto p-0">
          <table className="tableau">
            <thead>
              <tr><th>Dépôt</th>{s.jours.map((j) => <th key={j} className="text-center whitespace-nowrap">{jourCourt(j)}</th>)}<th className="text-right">Remise</th></tr>
            </thead>
            <tbody>
              {s.matrice.map((m) => {
                const passes = m.cellules.filter((c) => c.etat !== "A_VENIR" && c.etat !== "NON_OUVRE");
                const envoyes = passes.filter((c) => c.etat === "SOUMIS" || c.etat === "RETARD").length;
                return (
                  <tr key={m.code}>
                    <td className="font-medium whitespace-nowrap">{m.libelle}</td>
                    {m.cellules.map((c, k) => {
                      const st = CELLULES[c.etat];
                      const titre = `${m.libelle} · ${s.jours[k]} : ${st.libelle}${c.agent ? ` (${c.agent}${c.heure ? ` à ${c.heure}` : ""})` : ""}`;
                      const pastille = <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-semibold ${st.classe}`}>{st.symbole}</span>;
                      return (
                        <td key={k} className="text-center" title={titre}>
                          {c.numero ? <Link href={`/admin/comptes-rendus/${c.numero}`} aria-label={titre}>{pastille}</Link> : <span aria-label={titre}>{pastille}</span>}
                        </td>
                      );
                    })}
                    <td className="text-right font-semibold tabular-nums">{pct(envoyes, passes.length)}</td>
                  </tr>
                );
              })}
              {!s.matrice.length && <tr><td colSpan={s.jours.length + 2} className="note py-4 text-center">Aucun dépôt avec un agent actif.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Par agent</h2>
          <div className="carte overflow-x-auto p-0">
            <table className="tableau">
              <thead><tr><th>Agent</th><th>Dépôt</th><th className="text-right">Envoyés</th><th className="text-right">Dont en retard</th><th className="text-right">Brouillons</th></tr></thead>
              <tbody>
                {s.agents.map((a) => <tr key={a.nom + a.depot}><td>{a.nom}</td><td>{a.depot}</td><td className="text-right tabular-nums">{a.soumis}</td><td className={`text-right tabular-nums ${a.retard ? "font-semibold text-amber-700" : ""}`}>{a.retard}</td><td className="text-right tabular-nums">{a.brouillons}</td></tr>)}
                {!s.agents.length && <tr><td colSpan={5} className="note py-4 text-center">Aucun compte rendu sur la période.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Écarts cumulés par dépôt (DT)</h2>
          <div className="carte overflow-x-auto p-0">
            <table className="tableau">
              <thead><tr><th>Dépôt</th><th className="text-right">Stock</th><th className="text-right">Recettes</th><th className="text-right">Caisse</th><th className="text-right">CR avec écart</th></tr></thead>
              <tbody>
                {s.ecarts.map((e) => (
                  <tr key={e.code}>
                    <td>{e.libelle}</td>
                    {[e.stock, e.recettes, e.caisse].map((v, k) => <td key={k} className={`text-right tabular-nums ${v ? "font-semibold text-red-700" : ""}`}>{dt(v)}</td>)}
                    <td className="text-right tabular-nums">{e.avecEcart} / {e.envoyes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">Inventaires sur la période : {s.inventaires.clotures} clôturé(s), {s.inventaires.enCours} en cours, {s.inventaires.reouvertures} réouverture(s) par l&apos;administrateur.</p>
        </section>
      </div>
    </div>
  );
}

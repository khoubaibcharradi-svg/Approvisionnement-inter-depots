import { LIBELLES_NATURES, calculerCaisse, calculerRecette, calculerStock } from "@/lib/compte-rendu/calculs";
import type { detailCompteRendu } from "@/lib/compte-rendu/service";
import type { detailInventaire } from "@/lib/compte-rendu/inventaire";

type Detail = NonNullable<Awaited<ReturnType<typeof detailCompteRendu>>>;
type LigneInventaire = Awaited<ReturnType<typeof detailInventaire>>[number];
const qte = (n: number | null) => (n === null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: 3 }));

function Inventaire({ lignes }: { lignes: LigneInventaire[] }) {
  if (!lignes.length) return null;
  const magasins = [...new Set(lignes.map((l) => l.magasin))];
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-marque">Détail de l&apos;inventaire en quantités ({lignes.length} ligne(s))</summary>
      {magasins.map((m) => (
        <div key={m} className="mt-2 overflow-x-auto">
          <p className="font-medium">{m} · {lignes.find((l) => l.magasin === m)?.societe}</p>
          <table className="tableau">
            <thead><tr><th>Code</th><th>Désignation</th><th>Initial</th><th>Réceptions</th><th>Ventes</th><th>Retours</th><th>Théorique</th><th>Réel</th><th>Écart</th><th>Prix de revient</th><th>Écart (DT)</th></tr></thead>
            <tbody>
              {lignes.filter((l) => l.magasin === m).map((l) => (
                <tr key={l.codeArticle} className={l.ecart !== 0 || l.stockFinalReel === null ? "bg-red-50" : ""}>
                  <td className="font-mono text-xs">{l.codeArticle}</td><td>{l.designation}</td>
                  {[l.stockInitial, l.receptions, l.ventes, l.retours, l.stockFinalTheorique, l.stockFinalReel, l.ecart].map((v, i) => <td key={i} className="text-right tabular-nums">{qte(v)}</td>)}
                  <td className="text-right tabular-nums">{fmt(l.prixRevient)}</td>
                  <td className="text-right tabular-nums">{fmt(Math.round(l.ecart * l.prixRevient * 1000) / 1000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </details>
  );
}

const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
const ecart = (n: number) => <td className={`text-right tabular-nums ${n === 0 ? "" : n < 0 ? "font-semibold text-red-700" : "font-semibold text-amber-700"}`}>{fmt(n)}</td>;
const nombre = (n: number | null) => <td className="text-right tabular-nums">{fmt(n)}</td>;

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="carte flex flex-col gap-2">
      <h2 className="font-semibold uppercase tracking-wide text-marque">{titre}</h2>
      {children}
    </section>
  );
}
function Annexes({ cr, rubrique, titre }: { cr: Detail; rubrique: string; titre: string }) {
  const liste = cr.pieces.filter((p) => p.rubrique === rubrique);
  return (
    <div className="text-sm">
      <span className="font-medium">{titre} :</span>{" "}
      {liste.length ? liste.map((p, i) => (
        <span key={p.numeroPiece}>{i > 0 && " · "}<a className="text-marque underline" href={`/api/comptes-rendus/${cr.numero}/pieces/${p.numeroPiece}`}>{p.nomFichier}</a></span>
      )) : <span className="note">aucune</span>}
    </div>
  );
}

function Obs({ titre, texte }: { titre: string; texte: string }) {
  return (
    <p className="text-sm"><span className="font-medium">{titre} :</span> <span className="whitespace-pre-line">{texte || <span className="note">non renseigné</span>}</span></p>
  );
}

/** Compte rendu journalier en lecture seule (administrateur et historique de l'agent). */
export function VueCompteRendu({ cr, societes, inventaire = [] }: { cr: Detail; societes: Record<string, string>; inventaire?: LigneInventaire[] }) {
  const s = cr.saisie;
  const t = cr.totaux;
  return (
    <div className="flex flex-col gap-4">
      <div className="carte flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="titre-page">{cr.numero} · dépôt {cr.depot} · {new Date(`${cr.dateJournee}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h1>
          <p className="note">Agent : {cr.agent} · {cr.statut === "SOUMIS" ? `soumis le ${cr.dateSoumission?.toLocaleString("fr-FR")}` : `brouillon, dernière modification le ${cr.dateModification.toLocaleString("fr-FR")}`}</p>
        </div>
        <span className={`badge ${cr.statut === "SOUMIS" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{cr.statut === "SOUMIS" ? "Soumis" : "Brouillon"}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Écart de stock", t.stock.ecart], ["Écart recettes agents", t.recettes.ecart], ["Écart récap. caisse", t.caisse.ecart], ["Solde caisse dépenses", t.depenses.soldeFinal]].map(([l, v]) => (
          <div key={l as string} className="carte text-center">
            <div className={`text-xl font-semibold tabular-nums ${l !== "Solde caisse dépenses" && v !== 0 ? "text-red-700" : ""}`}>{fmt(v as number)}</div>
            <div className="note">{l}</div>
          </div>
        ))}
      </div>

      <Bloc titre="Situation du stock au coût de revient (en dinars)">
        <div className="overflow-x-auto">
          <table className="tableau">
            <thead><tr><th>Société / magasin</th><th>Stock initial</th><th>Réceptions</th><th>Ventes</th><th>Retours</th><th>Final théorique</th><th>Final réel</th><th>Écart</th></tr></thead>
            <tbody>
              {s.stocks.map((l) => {
                const c = calculerStock(l);
                const m = cr.magasins[l.codeMagasin];
                return (
                  <tr key={l.codeMagasin}>
                    <td><b>{m?.societe}</b><div className="note text-xs">{m?.libelle ?? l.codeMagasin}</div></td>
                    {nombre(l.stockInitial)}{nombre(l.receptions)}{nombre(l.ventes)}{nombre(l.retours)}{nombre(c.stockFinalTheorique)}{nombre(l.stockFinalReel)}{ecart(c.ecart)}
                  </tr>
                );
              })}
              <tr className="font-semibold"><td>TOTAL</td>{nombre(t.stock.stockInitial)}{nombre(t.stock.receptions)}{nombre(t.stock.ventes)}{nombre(t.stock.retours)}{nombre(t.stock.stockFinalTheorique)}{nombre(t.stock.stockFinalReel)}{ecart(t.stock.ecart)}</tr>
            </tbody>
          </table>
        </div>
        <Inventaire lignes={inventaire} />
        <Obs titre="Justification des écarts" texte={s.justificationEcarts} />
        <Annexes cr={cr} rubrique="STOCK" titre="États de stock annexés" />
      </Bloc>

      <Bloc titre="Véhicules traités">
        {s.aucunVehicule ? <p className="text-sm">Aucun véhicule traité.</p> : (
          <div className="overflow-x-auto">
            <table className="tableau">
              <thead><tr><th>Matricule</th><th>Société</th><th>Agence</th><th>Vendeur / chauffeur</th><th>Entrée</th><th>Sortie</th><th>Observations</th></tr></thead>
              <tbody>{s.vehicules.map((v, i) => <tr key={i}><td>{v.matricule}</td><td>{societes[v.codeSociete] ?? v.codeSociete}</td><td>{v.codeMagasin ? cr.magasins[v.codeMagasin]?.libelle ?? v.codeMagasin : "—"}</td><td>{v.vendeurChauffeur}</td><td>{v.heureEntree}</td><td>{v.heureSortie}</td><td>{v.observations}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Bloc>

      <Bloc titre="Suivi de la caisse recettes et versements">
        <div className="overflow-x-auto">
          <table className="tableau">
            <thead><tr><th>Agent</th><th>Société</th><th>CA comptant</th><th>Recouvrement</th><th>CA crédit</th><th>Recette</th><th>Écart</th></tr></thead>
            <tbody>
              {s.recettes.map((r, i) => <tr key={i}><td>{r.agent}</td><td>{societes[r.codeSociete] ?? r.codeSociete}</td>{nombre(r.caComptant)}{nombre(r.recouvrement)}{nombre(r.caCredit)}{nombre(r.recette)}{ecart(calculerRecette(r).ecart)}</tr>)}
              <tr className="font-semibold"><td colSpan={2}>TOTAL</td>{nombre(t.recettes.caComptant)}{nombre(t.recettes.recouvrement)}{nombre(t.recettes.caCredit)}{nombre(t.recettes.recette)}{ecart(t.recettes.ecart)}</tr>
            </tbody>
          </table>
        </div>
        <Annexes cr={cr} rubrique="RECETTES" titre="Pièces jointes" />
        <Obs titre="Observations" texte={s.observationsRecettes} />
      </Bloc>

      <Bloc titre="Récapitulatif caisse recettes">
        <div className="overflow-x-auto">
          <table className="tableau">
            <thead><tr><th>Nature</th><th>Solde veille (A)</th><th>Encaissements (B)</th><th>Transferts (C)</th><th>Théorique (D)</th><th>Réel (E)</th><th>Écart (E − D)</th><th>Justification</th></tr></thead>
            <tbody>
              {s.caisses.map((c) => {
                const k = calculerCaisse(c);
                return <tr key={c.nature}><td>{LIBELLES_NATURES[c.nature]}{c.precision ? ` (${c.precision})` : ""}</td>{nombre(c.soldeVeille)}{nombre(c.encaissements)}{nombre(c.transferts)}{nombre(k.soldeTheorique)}{nombre(c.soldeReel)}{ecart(k.ecart)}<td>{c.observations}</td></tr>;
              })}
              <tr className="font-semibold"><td>TOTAL</td>{nombre(t.caisse.soldeVeille)}{nombre(t.caisse.encaissements)}{nombre(t.caisse.transferts)}{nombre(t.caisse.soldeTheorique)}{nombre(t.caisse.soldeReel)}{ecart(t.caisse.ecart)}<td /></tr>
            </tbody>
          </table>
        </div>
        <Obs titre="Observations" texte={s.observationsCaisse} />
      </Bloc>

      <Bloc titre="Suivi de la caisse dépenses">
        <div className="overflow-x-auto">
          <table className="tableau">
            <thead><tr><th>Libellé</th><th>Débit (entrée)</th><th>Crédit (sortie)</th><th>Solde</th><th>Validé par</th></tr></thead>
            <tbody>
              <tr><td className="font-medium">Solde veille</td><td /><td />{nombre(s.soldeVeilleDepenses)}<td /></tr>
              {s.depenses.map((d, i) => <tr key={i}><td>{d.libelle}</td>{nombre(d.debit)}{nombre(d.credit)}{nombre(t.depenses.soldes[i])}<td>{d.validePar}</td></tr>)}
              <tr className="font-semibold"><td colSpan={3}>Solde fin de journée</td>{nombre(t.depenses.soldeFinal)}<td /></tr>
            </tbody>
          </table>
        </div>
        <Annexes cr={cr} rubrique="DEPENSES" titre="Justificatifs joints" />
        <Obs titre="Observations" texte={s.observationsDepenses} />
      </Bloc>

      <Bloc titre="Sécurité, infrastructure et anomalies">
        <Obs titre="État des caméras de surveillance" texte={s.etatCameras} />
        <Obs titre="Ressources humaines" texte={s.ressourcesHumaines} />
        <Obs titre="Remarques / incidents du jour" texte={s.remarques} />
      </Bloc>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InventaireJournee } from "@/lib/compte-rendu/inventaire";
import { calculerLigneInventaire, controlerInventaire, ligneConcernee } from "@/lib/compte-rendu/calculs";
import { enregistrerInventaire } from "./actions";

type Ligne = InventaireJournee["lignes"][number];
const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: 3 }));

function Quantite({ valeur, onChange, verrouille, label }: { valeur: number | null; onChange: (v: number | null) => void; verrouille: boolean; label: string }) {
  return (
    <input type="number" inputMode="decimal" step="any" min={0} disabled={verrouille} aria-label={label}
      className={`champ w-24 text-right ${verrouille ? "bg-slate-100 text-slate-600" : ""}`}
      value={valeur ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
  );
}

export function FormulaireInventaire({ inventaire: inv }: { inventaire: InventaireJournee }) {
  const router = useRouter();
  const [lignes, setLignes] = useState<Ligne[]>(inv.lignes);
  const [filtre, setFiltre] = useState("");
  const [seulementConcernees, setSeulementConcernees] = useState(false);
  const [modifie, setModifie] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const lecture = !inv.modifiable;
  const initialVerrouille = lecture || !!inv.reprise;
  const m = inv.magasin!;

  useEffect(() => {
    if (!modifie) return;
    const avertir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifie]);

  const maj = (code: string, p: Partial<Ligne>) => {
    setLignes((ls) => ls.map((l) => (l.codeArticle === code ? { ...l, ...p } : l)));
    setModifie(true);
  };
  const visibles = useMemo(() => {
    const f = filtre.trim().toLowerCase();
    return lignes.filter((l) => (!f || `${l.codeArticle} ${l.designation} ${l.famille}`.toLowerCase().includes(f)) && (!seulementConcernees || ligneConcernee(l)));
  }, [lignes, filtre, seulementConcernees]);
  const erreurs = controlerInventaire(lignes);
  const concernees = lignes.filter(ligneConcernee).length;

  const enregistrer = (cloturer: boolean) =>
    demarrer(async () => {
      if (cloturer && !confirm("Clôturer l'inventaire ? Les quantités ne seront plus modifiables (réouverture possible uniquement par l'administrateur).")) return;
      const r = await enregistrerInventaire(inv.dateJournee, m.code, lignes.filter(ligneConcernee), cloturer);
      setMessage({ ok: r.ok, texte: r.message });
      if (r.ok) {
        setModifie(false);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-3 pb-24">
      <div className="carte flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>Société : <b>{m.societe}</b></span>
        <span>Magasin : <b>{m.libelle}</b></span>
        <span>Journée : <b>{new Date(`${inv.dateJournee}T12:00:00`).toLocaleDateString("fr-FR")}</b></span>
        <span>{concernees} article(s) saisi(s)</span>
        {inv.derniereSaisie && <span className="note">Dernier enregistrement : {new Date(inv.derniereSaisie.date).toLocaleString("fr-FR")} ({inv.derniereSaisie.login})</span>}
        {inv.entete?.statut === "CLOTURE" && <span className="badge bg-emerald-100 text-emerald-800">🔒 Clôturé le {new Date(inv.entete.dateCloture!).toLocaleString("fr-FR")} ({inv.entete.loginCloture})</span>}
        {inv.entete?.statut !== "CLOTURE" && inv.compteRenduSoumis && <span className="badge bg-emerald-100 text-emerald-800">Compte rendu soumis : lecture seule</span>}
        {inv.entete?.statut === "EN_COURS" && <span className="badge bg-amber-100 text-amber-800">En cours</span>}
      </div>
      {inv.entete?.statut === "CLOTURE" && (
        <p className="alerte-ok">Inventaire clôturé : les quantités ne sont plus modifiables. En cas d&apos;erreur, demandez à l&apos;administrateur de le rouvrir.</p>
      )}
      {(inv.entete?.reouvertures.length ?? 0) > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>Réouverture(s) par l&apos;administrateur :</b>
          <ul className="list-disc pl-5">
            {inv.entete!.reouvertures.map((r) => <li key={r.numero}>{new Date(r.date).toLocaleString("fr-FR")} · {r.loginAdmin} : {r.motif}</li>)}
          </ul>
        </div>
      )}
      {inv.reprise && !lecture && <p className="note">Stock initial = stock final réel de l&apos;inventaire du {inv.reprise.date} (non modifiable).</p>}
      {!inv.reprise && !lecture && <p className="note">Premier inventaire de ce magasin : saisissez le stock initial de chaque article présent.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <input className="champ min-w-72" placeholder="Rechercher code, désignation, famille" value={filtre} onChange={(e) => setFiltre(e.target.value)} />
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={seulementConcernees} onChange={(e) => setSeulementConcernees(e.target.checked)} /> Uniquement les articles avec stock ou mouvement</label>
        <span className="note">{visibles.length} / {lignes.length} articles affichés</span>
      </div>

      <div className="carte overflow-x-auto p-0">
        <table className="tableau">
          <thead>
            <tr>
              <th>Société</th><th>Magasin</th><th>Code article</th><th>Désignation</th><th>Stock initial</th><th>Réceptions</th><th>Ventes</th><th>Retours</th><th>Stock final théorique</th><th>Stock final réel</th><th>Écart</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => {
              const c = calculerLigneInventaire(l);
              const aCompter = ligneConcernee(l) && l.stockFinalReel === null;
              return (
                <tr key={l.codeArticle} className={aCompter ? "bg-amber-50" : ""}>
                  <td className="text-slate-500">{m.societe}</td>
                  <td className="text-slate-500">{m.libelle}</td>
                  <td className="font-mono text-xs">{l.codeArticle}</td>
                  <td>{l.designation}<div className="note text-xs">{l.famille}</div></td>
                  <td><Quantite label={`Stock initial ${l.codeArticle}`} valeur={l.stockInitial} verrouille={initialVerrouille} onChange={(v) => maj(l.codeArticle, { stockInitial: v })} /></td>
                  <td><Quantite label={`Réceptions ${l.codeArticle}`} valeur={l.receptions} verrouille={lecture} onChange={(v) => maj(l.codeArticle, { receptions: v })} /></td>
                  <td><Quantite label={`Ventes ${l.codeArticle}`} valeur={l.ventes} verrouille={lecture} onChange={(v) => maj(l.codeArticle, { ventes: v })} /></td>
                  <td><Quantite label={`Retours ${l.codeArticle}`} valeur={l.retours} verrouille={lecture} onChange={(v) => maj(l.codeArticle, { retours: v })} /></td>
                  <td className="text-right tabular-nums">{fmt(c.stockFinalTheorique)}</td>
                  <td><Quantite label={`Stock final réel ${l.codeArticle}`} valeur={l.stockFinalReel} verrouille={lecture} onChange={(v) => maj(l.codeArticle, { stockFinalReel: v })} /></td>
                  <td className={`text-right tabular-nums ${c.ecart ? "font-semibold text-red-700" : ""}`}>{fmt(c.ecart)}</td>
                </tr>
              );
            })}
            {!visibles.length && <tr><td colSpan={11} className="note py-4 text-center">Aucun article.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">Quantités en pièces. Théorique = initial + réceptions − ventes + retours. Les lignes surlignées ont du stock ou un mouvement mais pas encore de stock final réel.</p>

      {message && <p className={message.ok ? "alerte-ok" : "alerte-erreur"}>{message.texte}</p>}
      {!lecture && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 shadow">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
            {erreurs.length > 0 && <span className="note mr-auto text-amber-700">À compléter : {erreurs.join(" ; ")}</span>}
            {modifie && !erreurs.length && <span className="note mr-auto">Modifications non enregistrées</span>}
            <button className="btn-secondaire" disabled={enCours} onClick={() => enregistrer(false)}>{enCours ? "Enregistrement…" : "Enregistrer l'inventaire"}</button>
            <button className="btn" disabled={enCours || erreurs.length > 0 || concernees === 0} title={erreurs.length ? "Comptez tous les articles concernés avant de clôturer" : undefined}
              onClick={() => enregistrer(true)}>Clôturer l&apos;inventaire</button>
          </div>
        </div>
      )}
    </div>
  );
}

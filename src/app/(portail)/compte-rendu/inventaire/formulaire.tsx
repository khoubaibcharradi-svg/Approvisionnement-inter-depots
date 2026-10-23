"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InventaireJournee } from "@/lib/compte-rendu/inventaire";
import { calculerLigneInventaire, controlerInventaire, ligneConcernee } from "@/lib/compte-rendu/calculs";
import { enregistrerInventaire } from "./actions";

type Ligne = InventaireJournee["lignes"][number];
type Colonne = "receptions" | "ventes" | "retours" | "stockFinalReel";
type Vue = "tous" | "concernes" | "aCompter";
const MOUVEMENTS = ["receptions", "ventes", "retours"] as const;
const TOUTES = "";
const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: 3 }));
const aCompter = (l: Ligne) => ligneConcernee(l) && l.stockFinalReel === null;

/** Entrée : passe à la même colonne de la ligne suivante, comme dans un tableur. */
function suivant(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const champs = [...document.querySelectorAll<HTMLInputElement>(`input[data-col="${e.currentTarget.dataset.col}"]`)];
  champs[champs.indexOf(e.currentTarget) + 1]?.focus();
}

function Quantite({ valeur, onChange, verrouille, label, colonne }: { valeur: number | null; onChange?: (v: number | null) => void; verrouille: boolean; label: string; colonne?: Colonne }) {
  return (
    <input type="number" inputMode="decimal" step="any" min={0} disabled={verrouille} aria-label={label} data-col={colonne}
      className={`champ w-24 text-right ${verrouille ? "bg-slate-100 text-slate-600" : ""}`}
      value={valeur ?? ""} onKeyDown={suivant} onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange?.(e.target.value === "" ? null : Number(e.target.value))} />
  );
}

export function FormulaireInventaire({ inventaire: inv }: { inventaire: InventaireJournee }) {
  const router = useRouter();
  const [lignes, setLignes] = useState<Ligne[]>(inv.lignes);
  const [filtre, setFiltre] = useState("");
  const [famille, setFamille] = useState(TOUTES);
  const [vue, setVue] = useState<Vue>("tous");
  const [modifie, setModifie] = useState(false);
  // Réceptions / ventes / retours modifiés depuis le dernier enregistrement : la clôture attend leur enregistrement.
  const [mouvementsModifies, setMouvementsModifies] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const lecture = !inv.modifiable;
  const m = inv.magasin!;

  useEffect(() => {
    if (!modifie) return;
    const avertir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifie]);

  const maj = (code: string, colonne: Colonne, v: number | null) => {
    setLignes((ls) => ls.map((l) => (l.codeArticle === code ? { ...l, [colonne]: v } : l)));
    setModifie(true);
    if (colonne !== "stockFinalReel") setMouvementsModifies(true);
  };

  const familles = useMemo(() => {
    const parFamille = new Map<string, { total: number; saisis: number; aCompter: number }>();
    for (const l of lignes) {
      const f = parFamille.get(l.famille) ?? { total: 0, saisis: 0, aCompter: 0 };
      f.total++;
      if (ligneConcernee(l)) f.saisis++;
      if (aCompter(l)) f.aCompter++;
      parFamille.set(l.famille, f);
    }
    return [...parFamille].sort(([a], [b]) => a.localeCompare(b, "fr"));
  }, [lignes]);

  const visibles = useMemo(() => {
    const f = filtre.trim().toLowerCase();
    return lignes.filter(
      (l) =>
        (famille === TOUTES || l.famille === famille) &&
        (!f || `${l.codeArticle} ${l.designation} ${l.famille}`.toLowerCase().includes(f)) &&
        (vue === "tous" || (vue === "concernes" ? ligneConcernee(l) : aCompter(l))),
    );
  }, [lignes, filtre, famille, vue]);
  const erreurs = controlerInventaire(lignes);
  const concernees = lignes.filter(ligneConcernee).length;
  const nbACompter = lignes.filter(aCompter).length;
  const jamaisEnregistre = !inv.entete;
  const clotureBloquee = enCours || jamaisEnregistre || mouvementsModifies || erreurs.length > 0 || concernees === 0;
  const raisonBlocage = jamaisEnregistre || mouvementsModifies
    ? "Enregistrez d'abord les réceptions, ventes et retours"
    : erreurs.length ? "Saisissez le stock final réel de tous les articles concernés" : undefined;

  const enregistrer = (cloturer: boolean) =>
    demarrer(async () => {
      if (cloturer && !confirm("Clôturer l'inventaire ? Les quantités ne seront plus modifiables (réouverture possible uniquement par l'administrateur).")) return;
      const r = await enregistrerInventaire(inv.dateJournee, m.code, lignes.filter(ligneConcernee), cloturer);
      setMessage({ ok: r.ok, texte: r.message });
      if (r.ok) {
        setModifie(false);
        setMouvementsModifies(false);
        router.refresh();
      }
    });

  const carteFamille = (cle: string, libelle: string, total: number, saisis: number, restants: number) => (
    <button key={cle || "toutes"} type="button" onClick={() => setFamille(cle)} aria-pressed={famille === cle}
      className={`flex min-h-16 flex-col items-start justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
        famille === cle ? "border-marque bg-marque text-white" : "border-slate-200 bg-white hover:border-marque"
      }`}>
      <span className="font-semibold">{libelle}</span>
      <span className={famille === cle ? "text-white/85" : "text-slate-500"}>
        {total} article(s) · {saisis} saisi(s)
        {restants > 0 && <span className={`ml-1 font-semibold ${famille === cle ? "text-amber-200" : "text-amber-700"}`}>· {restants} à compter</span>}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
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
      {!lecture && (
        <p className="note">
          {inv.reprise ? <>Stock initial = stock final réel de l&apos;inventaire du {inv.reprise.date} (non modifiable).</> : <>Premier inventaire de ce magasin : stock initial à 0 ; le stock final réel compté aujourd&apos;hui deviendra le stock initial de demain.</>}
          {" "}Étapes : 1. saisir réceptions, ventes et retours puis <b>Enregistrer</b> ; 2. compter le stock final réel puis <b>Clôturer</b>.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Familles">
        {carteFamille(TOUTES, "Toutes les familles", lignes.length, concernees, nbACompter)}
        {familles.map(([f, c]) => carteFamille(f, f, c.total, c.saisis, c.aCompter))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input className="champ min-w-72" placeholder="Rechercher code, désignation" value={filtre} onChange={(e) => setFiltre(e.target.value)} />
        <div className="flex gap-1" role="group" aria-label="Articles affichés">
          {([["tous", "Tous"], ["concernes", "Avec stock ou mouvement"], ["aCompter", `À compter (${nbACompter})`]] as const).map(([v, l]) => (
            <button key={v} type="button" className={vue === v ? "btn" : "btn-secondaire"} aria-pressed={vue === v} onClick={() => setVue(v)}>{l}</button>
          ))}
        </div>
        <span className="note">{visibles.length} / {lignes.length} articles affichés · Entrée = ligne suivante</span>
      </div>

      {message && <p className={message.ok ? "alerte-ok" : "alerte-erreur"}>{message.texte}</p>}

      <div className="carte max-h-[70vh] overflow-auto p-0">
        <table className="tableau">
          <thead className="sticky top-0 z-10">
            <tr>
              <th>Société</th><th>Magasin</th><th>Code article</th><th>Désignation</th><th>Stock initial</th><th>Réceptions</th><th>Ventes</th><th>Retours</th><th>Stock final théorique</th><th>Stock final réel</th><th>Écart</th>
            </tr>
            {!lecture && (
              <tr>
                <th colSpan={5} className="text-xs font-normal text-slate-500">
                  {modifie ? <span className="text-amber-700">Modifications non enregistrées</span> : raisonBlocage ? `Clôture : ${raisonBlocage.toLowerCase()}` : "Prêt à clôturer"}
                </th>
                <th colSpan={3}>
                  <button className="btn w-full" disabled={enCours} onClick={() => enregistrer(false)}>
                    {enCours ? "Enregistrement…" : "1. Enregistrer"}
                  </button>
                </th>
                <th />
                <th colSpan={2}>
                  <button className="btn w-full bg-emerald-700 hover:bg-emerald-800" disabled={clotureBloquee} title={raisonBlocage} onClick={() => enregistrer(true)}>
                    2. Clôturer
                  </button>
                </th>
              </tr>
            )}
          </thead>
          <tbody>
            {visibles.map((l) => {
              const c = calculerLigneInventaire(l);
              return (
                <tr key={l.codeArticle} className={aCompter(l) ? "bg-amber-50" : ""}>
                  <td className="text-slate-500">{m.societe}</td>
                  <td className="text-slate-500">{m.libelle}</td>
                  <td className="font-mono text-xs">{l.codeArticle}</td>
                  <td>{l.designation}<div className="note text-xs">{l.famille}</div></td>
                  <td><Quantite label={`Stock initial ${l.codeArticle}`} valeur={l.stockInitial} verrouille /></td>
                  {MOUVEMENTS.map((k) => (
                    <td key={k}><Quantite label={`${k} ${l.codeArticle}`} colonne={k} valeur={l[k]} verrouille={lecture} onChange={(v) => maj(l.codeArticle, k, v)} /></td>
                  ))}
                  <td className="text-right tabular-nums">{fmt(c.stockFinalTheorique)}</td>
                  <td><Quantite label={`Stock final réel ${l.codeArticle}`} colonne="stockFinalReel" valeur={l.stockFinalReel} verrouille={lecture} onChange={(v) => maj(l.codeArticle, "stockFinalReel", v)} /></td>
                  <td className={`text-right tabular-nums ${c.ecart ? "font-semibold text-red-700" : ""}`}>{fmt(c.ecart)}</td>
                </tr>
              );
            })}
            {!visibles.length && <tr><td colSpan={11} className="note py-4 text-center">Aucun article.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">
        Quantités en pièces. Théorique = initial + réceptions − ventes + retours. Les lignes surlignées ont du stock ou un mouvement mais pas encore de stock final réel.
        {!lecture && erreurs.length > 0 && <span className="text-amber-700"> À compléter avant clôture : {erreurs.join(" ; ")}.</span>}
      </p>
    </div>
  );
}

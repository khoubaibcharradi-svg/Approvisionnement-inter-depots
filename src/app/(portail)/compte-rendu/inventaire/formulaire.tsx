"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionInventaire, InventaireJournee } from "@/lib/compte-rendu/inventaire";
import { calculerLigneInventaire, controlerInventaire, ligneConcernee } from "@/lib/compte-rendu/calculs";
import { enregistrerInventaire } from "./actions";

type Ligne = InventaireJournee["lignes"][number];
type Etape = "RECEPTIONS" | "VENTES" | "RETOURS";
type EtapeAvecCodes = Exclude<Etape, "VENTES">;
type Colonne = "receptions" | "ventes" | "retours" | "stockFinalReel";
type Vue = "tous" | "concernes" | "aCompter";
/** Structure des étapes (codes, colonne, codes de bons exigés) ; les libellés viennent de la base. */
const STRUCTURE_ETAPES: { etape: Etape; colonne: Exclude<Colonne, "stockFinalReel">; avecCodes: boolean }[] = [
  { etape: "RECEPTIONS", colonne: "receptions", avecCodes: true },
  { etape: "VENTES", colonne: "ventes", avecCodes: false },
  { etape: "RETOURS", colonne: "retours", avecCodes: true },
];
const TOUTES = "";
const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: 3 }));
const heure = (d: Date | string) => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
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
      className={`champ w-20 px-2 text-right ${verrouille ? "bg-slate-100 text-slate-600" : ""}`}
      value={valeur ?? ""} onKeyDown={suivant} onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange?.(e.target.value === "" ? null : Number(e.target.value))} />
  );
}

/** Saisie de plusieurs codes : Entrée ou « + » ajoute, × retire. */
function Codes({ codes, onChange, verrouille, libelle }: { codes: string[]; onChange: (c: string[]) => void; verrouille: boolean; libelle: string }) {
  const [saisie, setSaisie] = useState("");
  const ajouter = () => {
    const c = saisie.trim().replace(/\s+/g, " ").toUpperCase();
    if (c && !codes.includes(c)) onChange([...codes, c]);
    setSaisie("");
  };
  return (
    <div className="flex flex-col gap-1">
      {codes.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={libelle}>
          {codes.map((c) => (
            <li key={c} className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 font-mono text-xs text-slate-800 ring-1 ring-slate-300">
              {c}
              {!verrouille && <button type="button" aria-label={`Retirer ${c}`} className="text-slate-500 hover:text-red-700" onClick={() => onChange(codes.filter((x) => x !== c))}>×</button>}
            </li>
          ))}
        </ul>
      )}
      {!verrouille && (
        <div className="flex gap-1">
          <input className="champ w-full min-w-0 py-1 text-xs font-normal" placeholder={libelle} aria-label={libelle} maxLength={50} value={saisie}
            onChange={(e) => setSaisie(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(); } }} />
          <button type="button" className="btn-secondaire px-2 py-1 text-xs" aria-label={`Ajouter ${libelle}`} onClick={ajouter}>+</button>
        </div>
      )}
      {verrouille && !codes.length && <span className="text-xs font-normal text-slate-500">Aucun code</span>}
    </div>
  );
}

export function FormulaireInventaire({ inventaire: inv }: { inventaire: InventaireJournee }) {
  const router = useRouter();
  const [lignes, setLignes] = useState<Ligne[]>(inv.lignes);
  const [codes, setCodes] = useState<Record<EtapeAvecCodes, string[]>>({ RECEPTIONS: inv.etapes?.RECEPTIONS.codes ?? [], RETOURS: inv.etapes?.RETOURS.codes ?? [] });
  const [filtre, setFiltre] = useState("");
  const [famille, setFamille] = useState(TOUTES);
  const [vue, setVue] = useState<Vue>("tous");
  const [modifie, setModifie] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const lecture = !inv.modifiable;
  const m = inv.magasin!;
  const validee = (e: Etape) => inv.etapes?.[e].validee ?? null;
  const ETAPES = STRUCTURE_ETAPES.map((e) => {
    const libelle = inv.libellesEtapes[e.etape];
    return { ...e, libelle, codes: e.avecCodes ? `N° de bon (${libelle})` : null };
  });

  const nomMagasin = `${m.societe} · ${m.libelle}`;

  // Saisie non enregistrée : on prévient avant de quitter la page, y compris en changeant de magasin
  // ou de journée (navigation interne, que « beforeunload » ne voit pas).
  useEffect(() => {
    if (!modifie) return;
    const avertir = (e: BeforeUnloadEvent) => e.preventDefault();
    const lien = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest("a[href]");
      if (!a || a.getAttribute("target") === "_blank") return;
      if (!confirm(`Des quantités saisies pour ${nomMagasin} ne sont pas enregistrées. Quitter sans enregistrer ?`)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", avertir);
    document.addEventListener("click", lien, true);
    return () => {
      window.removeEventListener("beforeunload", avertir);
      document.removeEventListener("click", lien, true);
    };
  }, [modifie, nomMagasin]);

  const maj = (code: string, colonne: Colonne, v: number | null) => {
    setLignes((ls) => ls.map((l) => (l.codeArticle === code ? { ...l, [colonne]: v } : l)));
    setModifie(true);
  };
  const majCodes = (e: EtapeAvecCodes, c: string[]) => {
    setCodes((x) => ({ ...x, [e]: c }));
    setModifie(true);
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
  const nonValidees = ETAPES.filter((e) => !validee(e.etape));
  const raisonBlocage = nonValidees.length
    ? `validez d'abord ${nonValidees.map((e) => `« ${e.libelle} »`).join(", ")}`
    : erreurs.length ? "saisissez le stock final réel de tous les articles concernés" : concernees === 0 ? "aucun article saisi" : null;

  const envoyer = (action: ActionInventaire, confirmation?: string) =>
    demarrer(async () => {
      if (confirmation && !confirm(confirmation)) return;
      const r = await enregistrerInventaire(inv.dateJournee, m.code, lignes.filter(ligneConcernee), action, codes);
      // Le serveur confirme le magasin réellement enregistré : il doit être celui affiché.
      if (r.ok && r.magasin !== m.code) {
        setMessage({ ok: false, texte: `Incohérence : l'enregistrement concerne ${r.magasin} au lieu de ${m.code}. Rechargez la page.` });
        return;
      }
      setMessage({ ok: r.ok, texte: r.message });
      if (r.ok) {
        setModifie(false);
        router.refresh();
      }
    });

  const carteFamille = (cle: string, libelle: string, total: number, saisis: number, restants: number) => (
    <button key={cle || "toutes"} type="button" onClick={() => setFamille(cle)} aria-pressed={famille === cle}
      className={`flex min-h-16 flex-col items-start justify-between rounded-lg border px-3 py-2 text-left text-sm ${
        famille === cle ? "border-marque bg-marque text-white" : "border-slate-200 bg-white hover:border-marque"
      }`}>
      <span className="font-semibold">{libelle}</span>
      <span className={famille === cle ? "text-white/85" : "text-slate-500"}>
        {total} article(s) · {saisis} saisi(s)
        {restants > 0 && <span className={`ml-1 font-semibold ${famille === cle ? "text-amber-200" : "text-amber-700"}`}>· {restants} à compter</span>}
      </span>
    </button>
  );

  const nbValidees = ETAPES.filter((e) => validee(e.etape)).length;
  const cloture = inv.entete?.statut === "CLOTURE";
  const progression = ((nbValidees + (cloture ? 1 : 0)) / (ETAPES.length + 1)) * 100;

  /** Carte d'une étape : numéro, état, codes éventuels et action. */
  const carteEtape = ({ etape, colonne, libelle, codes: libelleCodes }: (typeof ETAPES)[number], numero: number) => {
    const v = validee(etape);
    const total = lignes.reduce((t, l) => t + (l[colonne] ?? 0), 0);
    return (
      <li key={etape} className={`flex flex-col gap-3 rounded-xl border p-4 ${v ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
        <div className="flex items-start gap-3">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${v ? "bg-emerald-600 text-white" : "bg-marque-pale text-marque"}`} aria-hidden="true">
            {v ? "✓" : numero}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{libelle}</p>
            {v ? (
              <p className="text-xs text-emerald-800">Validée par {v.login} à {heure(v.date)}</p>
            ) : (
              <p className="text-xs text-amber-700">À valider · {fmt(total)} pièce(s) saisie(s)</p>
            )}
          </div>
        </div>
        {libelleCodes && <Codes libelle={libelleCodes} codes={codes[etape as EtapeAvecCodes]} verrouille={lecture || !!v} onChange={(c) => majCodes(etape as EtapeAvecCodes, c)} />}
        {!lecture && (
          <div className="mt-auto">
            {v ? (
              <button type="button" className="btn-secondaire w-full" disabled={enCours}
                onClick={() => envoyer({ type: "ANNULER_VALIDATION", etape }, `Modifier l'étape « ${libelle} » ? La colonne redevient modifiable et devra être validée de nouveau.`)}>
                Modifier
              </button>
            ) : (
              <button type="button" className="btn w-full" disabled={enCours} onClick={() => envoyer({ type: "VALIDER", etape }, `Valider l'étape « ${libelle} » de ${nomMagasin} (${fmt(total)} pièce(s)) ?`)}>
                Valider · {libelle}
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  const panneauEtapes = inv.etapes && (
    <section className="carte flex flex-col gap-4" aria-label="Étapes de l'inventaire">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Étapes de l&apos;inventaire · <span className="text-marque">{nomMagasin}</span></h2>
          <p className="note">
            {nbValidees}/{ETAPES.length} étapes validées
            {!lecture && <> · {modifie ? <span className="font-medium text-amber-700">modifications non enregistrées</span> : "tout est enregistré"}</>}
          </p>
        </div>
        {!lecture && (
          <button type="button" className="btn-secondaire" disabled={enCours} onClick={() => envoyer({ type: "BROUILLON" })}>
            {enCours ? "Enregistrement…" : "Enregistrer le brouillon"}
          </button>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Avancement" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progression)}>
        <div className="h-full rounded-full bg-marque transition-all" style={{ width: `${progression}%` }} />
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ETAPES.map((e, i) => carteEtape(e, i + 1))}
        <li className={`flex flex-col gap-3 rounded-xl border p-4 ${cloture ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
          <div className="flex items-start gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${cloture ? "bg-emerald-600 text-white" : "bg-marque-pale text-marque"}`} aria-hidden="true">
              {cloture ? "✓" : ETAPES.length + 1}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">Stock réel et clôture</p>
              <p className={`text-xs ${cloture ? "text-emerald-800" : raisonBlocage ? "text-slate-500" : "font-semibold text-emerald-800"}`}>
                {cloture ? `Clôturé par ${inv.entete!.loginCloture}` : raisonBlocage ? `Pour clôturer : ${raisonBlocage}` : "Prêt à clôturer"}
              </p>
            </div>
          </div>
          {!lecture && (
            <div className="mt-auto">
              <button type="button" className="btn w-full bg-emerald-700 hover:bg-emerald-800" disabled={enCours || !!raisonBlocage}
                onClick={() => envoyer({ type: "CLOTURER" }, `Clôturer l'inventaire de ${nomMagasin} ? Les quantités ne seront plus modifiables (réouverture possible uniquement par l'administrateur).`)}>
                Clôturer l&apos;inventaire
              </button>
            </div>
          )}
        </li>
      </ol>
    </section>
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
        </p>
      )}

      {panneauEtapes}

      {message && <p className={message.ok ? "alerte-ok" : "alerte-erreur"}>{message.texte}</p>}

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


      <div className="carte max-h-[75vh] overflow-auto p-0">
        <table className="tableau">
          <thead className="sticky top-0 z-10">
            <tr>
              <th>Société / magasin</th><th>Code article</th><th>Désignation</th><th>Stock initial</th>
              {ETAPES.map((e) => <th key={e.etape}>{e.libelle}{validee(e.etape) && <span className="ml-1 text-emerald-600" title="Étape validée : colonne figée">✓</span>}</th>)}
              <th>Stock final théorique</th><th>Stock final réel</th><th>Écart</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => {
              const c = calculerLigneInventaire(l);
              return (
                <tr key={l.codeArticle} className={aCompter(l) ? "bg-amber-50" : ""}>
                  <td className="text-xs text-slate-500"><span className="font-medium text-slate-700">{m.societe}</span><br />{m.libelle}</td>
                  <td className="font-mono text-xs">{l.codeArticle}</td>
                  <td>{l.designation}<div className="note text-xs">{l.famille}</div></td>
                  <td><Quantite label={`Stock initial ${l.codeArticle}`} valeur={l.stockInitial} verrouille /></td>
                  {ETAPES.map((e) => (
                    <td key={e.etape}>
                      <Quantite label={`${e.libelle} ${l.codeArticle}`} colonne={e.colonne} valeur={l[e.colonne]} verrouille={lecture || !!validee(e.etape)} onChange={(v) => maj(l.codeArticle, e.colonne, v)} />
                    </td>
                  ))}
                  <td className="text-right tabular-nums">{fmt(c.stockFinalTheorique)}</td>
                  <td><Quantite label={`Stock final réel ${l.codeArticle}`} colonne="stockFinalReel" valeur={l.stockFinalReel} verrouille={lecture} onChange={(v) => maj(l.codeArticle, "stockFinalReel", v)} /></td>
                  <td className={`text-right tabular-nums ${c.ecart ? "font-semibold text-red-700" : ""}`}>{fmt(c.ecart)}</td>
                </tr>
              );
            })}
            {!visibles.length && <tr><td colSpan={10} className="note py-4 text-center">Aucun article.</td></tr>}
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

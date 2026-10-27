"use client";

import { useActionState, useState, useTransition } from "react";
import { importerCatalogue, importerPrix, importerStock, majArticle, type Resultat } from "./actions";

type Article = {
  codeArticle: string;
  designation: string;
  famille: string;
  pcb: number | null;
  version: number;
  isActif: boolean;
  stockPieces?: number;
  quotaPieces?: number;
  rotation?: number | null;
  /** Prix de revient par société (dinars par pièce). */
  prix?: Record<string, number>;
};
type Societe = { code: string; libelle: string };
type Droits = { code: boolean; logistique: boolean; quota: boolean; prix: boolean };

export function LigneArticle({ article: a, voitStock, droits, societes }: { article: Article; voitStock: boolean; droits: Droits; societes: Societe[] }) {
  const [code, setCode] = useState(a.codeArticle);
  const [pcb, setPcb] = useState(a.pcb ? String(a.pcb) : "");
  const [stock, setStock] = useState(String(a.stockPieces ?? ""));
  const [quota, setQuota] = useState(String(a.quotaPieces ?? ""));
  const [prix, setPrix] = useState<Record<string, string>>(() => Object.fromEntries(societes.map((s) => [s.code, a.prix?.[s.code] !== undefined ? String(a.prix[s.code]) : ""])));
  const [message, setMessage] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const modifiable = droits.code || droits.logistique || droits.quota || droits.prix;

  const enregistrer = (extra: Record<string, unknown> = {}) =>
    demarrer(async () => {
      const r = await majArticle({
        codeArticle: a.codeArticle,
        version: a.version,
        ...(droits.code && code !== a.codeArticle ? { nouveauCode: code } : {}),
        ...(droits.logistique ? { pcb: pcb ? Number(pcb) : null, stockPieces: Number(stock) } : {}),
        ...(droits.quota ? { quotaPieces: Number(quota) } : {}),
        ...(droits.prix ? { prix: Object.fromEntries(Object.entries(prix).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) } : {}),
        ...extra,
      });
      setMessage(r);
    });

  return (
    <tr className={a.isActif ? "" : "opacity-50"}>
      <td>
        {droits.code ? <input className="champ w-28 font-mono text-xs" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code SKU" /> : <span className="font-mono text-xs">{a.codeArticle}</span>}
      </td>
      <td>{a.designation}</td>
      <td>{a.famille}</td>
      <td>
        {droits.logistique ? <input type="number" min={1} className="champ w-20" value={pcb} onChange={(e) => setPcb(e.target.value)} aria-label="Pièces par carton" /> : a.pcb ?? <span className="note">—</span>}
      </td>
      {voitStock && (
        <>
          <td>{a.rotation ?? "—"}</td>
          <td>{droits.logistique ? <input type="number" min={0} className="champ w-28" value={stock} onChange={(e) => setStock(e.target.value)} aria-label="Stock" /> : a.stockPieces}</td>
          <td>{droits.quota ? <input type="number" min={0} className="champ w-28" value={quota} onChange={(e) => setQuota(e.target.value)} aria-label="Quota" /> : a.quotaPieces}</td>
          {societes.map((s) => (
            <td key={s.code} className="text-right">
              {droits.prix ? (
                <input type="number" min={0} step="0.001" className="champ w-24 text-right" value={prix[s.code] ?? ""} onChange={(e) => setPrix({ ...prix, [s.code]: e.target.value })} aria-label={`Prix de revient ${s.libelle}`} />
              ) : (
                <span className={a.prix?.[s.code] ? "tabular-nums" : "text-amber-700 tabular-nums"}>{(a.prix?.[s.code] ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 3 })}</span>
              )}
            </td>
          ))}
        </>
      )}
      {modifiable && (
        <td className="whitespace-nowrap">
          <button className="btn-secondaire" disabled={enCours} onClick={() => enregistrer()}>Enregistrer</button>
          {droits.code && (
            <button className="btn-secondaire ml-1" disabled={enCours} onClick={() => enregistrer({ isActif: !a.isActif })}>
              {a.isActif ? "Désactiver" : "Activer"}
            </button>
          )}
          {message && <div className={`mt-1 text-xs ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.message}</div>}
        </td>
      )}
    </tr>
  );
}

function FormulaireImport({ titre, aide, action, children }: { titre: string; aide: string; action: (p: Resultat | null, f: FormData) => Promise<Resultat>; children?: React.ReactNode }) {
  const [etat, executer, enCours] = useActionState(action, null);
  return (
    <form action={executer} className="carte flex flex-col gap-2">
      <p className="font-medium">{titre}</p>
      <p className="note">{aide}</p>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <input type="file" name="fichier" accept=".xlsx,.csv" required className="text-sm" />
        <button className="btn" disabled={enCours}>{enCours ? "Import…" : "Importer"}</button>
      </div>
      {etat && <p className={etat.ok ? "alerte-ok" : "alerte-erreur"}>{etat.message}</p>}
    </form>
  );
}

export function Imports({ catalogue, stock, prix, societes }: { catalogue: boolean; stock: boolean; prix: boolean; societes: Societe[] }) {
  if (!catalogue && !stock && !prix) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {catalogue && (
        <FormulaireImport titre="Importer une liste d'articles (.xlsx / .csv)" action={importerCatalogue}
          aide="Colonnes : Code article, Désignation, Famille. Les codes existants sont mis à jour, les nouveaux ajoutés (stock et quota à 0)." />
      )}
      {prix && (
        <FormulaireImport titre="Importer les prix de revient (.xlsx / .csv)" action={importerPrix}
          aide="Un fichier par société. Colonnes : Code article, Prix de revient (dinars par pièce). Base de la valorisation des inventaires des magasins de la société choisie.">
          <select name="societe" required defaultValue="" className="champ" aria-label="Société">
            <option value="" disabled>Société…</option>
            {societes.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}
          </select>
        </FormulaireImport>
      )}
      {stock && (
        <FormulaireImport titre="Importer le stock ERP (.xlsx / .csv)" action={importerStock}
          aide="Colonnes : Code article, Stock (en pièces). Les quotas supérieurs au nouveau stock sont ramenés au stock." />
      )}
    </div>
  );
}

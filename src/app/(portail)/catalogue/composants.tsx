"use client";

import { useActionState, useState, useTransition } from "react";
import { importerCatalogue, importerStock, majArticle, type Resultat } from "./actions";

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
};
type Droits = { code: boolean; logistique: boolean; quota: boolean };

export function LigneArticle({ article: a, voitStock, droits }: { article: Article; voitStock: boolean; droits: Droits }) {
  const [code, setCode] = useState(a.codeArticle);
  const [pcb, setPcb] = useState(a.pcb ? String(a.pcb) : "");
  const [stock, setStock] = useState(String(a.stockPieces ?? ""));
  const [quota, setQuota] = useState(String(a.quotaPieces ?? ""));
  const [message, setMessage] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const modifiable = droits.code || droits.logistique || droits.quota;

  const enregistrer = (extra: Record<string, unknown> = {}) =>
    demarrer(async () => {
      const r = await majArticle({
        codeArticle: a.codeArticle,
        version: a.version,
        ...(droits.code && code !== a.codeArticle ? { nouveauCode: code } : {}),
        ...(droits.logistique ? { pcb: pcb ? Number(pcb) : null, stockPieces: Number(stock) } : {}),
        ...(droits.quota ? { quotaPieces: Number(quota) } : {}),
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

function FormulaireImport({ titre, aide, action }: { titre: string; aide: string; action: (p: Resultat | null, f: FormData) => Promise<Resultat> }) {
  const [etat, executer, enCours] = useActionState(action, null);
  return (
    <form action={executer} className="carte flex flex-col gap-2">
      <p className="font-medium">{titre}</p>
      <p className="note">{aide}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" name="fichier" accept=".xlsx,.csv" required className="text-sm" />
        <button className="btn" disabled={enCours}>{enCours ? "Import…" : "Importer"}</button>
      </div>
      {etat && <p className={etat.ok ? "alerte-ok" : "alerte-erreur"}>{etat.message}</p>}
    </form>
  );
}

export function Imports({ catalogue, stock }: { catalogue: boolean; stock: boolean }) {
  if (!catalogue && !stock) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {catalogue && (
        <FormulaireImport titre="Importer une liste d'articles (.xlsx / .csv)" action={importerCatalogue}
          aide="Colonnes : Code article, Désignation, Famille. Les codes existants sont mis à jour, les nouveaux ajoutés (stock et quota à 0)." />
      )}
      {stock && (
        <FormulaireImport titre="Importer le stock ERP (.xlsx / .csv)" action={importerStock}
          aide="Colonnes : Code article, Stock (en pièces). Les quotas supérieurs au nouveau stock sont ramenés au stock." />
      )}
    </div>
  );
}

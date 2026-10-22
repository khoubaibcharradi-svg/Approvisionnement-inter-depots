"use client";

import { useState, useTransition } from "react";
import * as act from "./actions";

type Ref = { code: string; libelle: string };
type Societe = Ref & { isActif: boolean };
type Magasin = Ref & { codeDepot: string; codeSociete: string; isActif: boolean };

function Retour({ r }: { r: act.Resultat | null }) {
  return r ? <p className={r.ok ? "alerte-ok" : "alerte-erreur"}>{r.message}</p> : null;
}

function LigneMagasin({ m, depots, societes }: { m: Magasin; depots: Ref[]; societes: Societe[] }) {
  const [v, setV] = useState(m);
  const [r, setR] = useState<act.Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const lancer = (f: () => Promise<act.Resultat>) => demarrer(async () => setR(await f()));
  return (
    <tr className={m.isActif ? "" : "opacity-50"}>
      <td className="font-mono text-xs">{m.code}</td>
      <td><input className="champ w-48" value={v.libelle} onChange={(e) => setV({ ...v, libelle: e.target.value })} aria-label="Libellé" /></td>
      <td>
        <select className="champ" value={v.codeDepot} onChange={(e) => setV({ ...v, codeDepot: e.target.value })} aria-label="Dépôt">
          {depots.map((d) => <option key={d.code} value={d.code}>{d.libelle}</option>)}
        </select>
      </td>
      <td>
        <select className="champ" value={v.codeSociete} onChange={(e) => setV({ ...v, codeSociete: e.target.value })} aria-label="Société">
          {societes.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}
        </select>
      </td>
      <td className="whitespace-nowrap">
        <button className="btn-secondaire" disabled={enCours} onClick={() => lancer(() => act.enregistrerMagasin(v, false))}>Enregistrer</button>{" "}
        <button className="btn-secondaire" disabled={enCours} onClick={() => lancer(() => act.basculerMagasin(m.code))}>{m.isActif ? "Désactiver" : "Activer"}</button>{" "}
        <button className="btn-danger" disabled={enCours} onClick={() => confirm(`Supprimer le magasin ${m.code} ?`) && lancer(() => act.supprimerMagasin(m.code))}>Supprimer</button>
        {r && <div className={`mt-1 text-xs ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.message}</div>}
      </td>
    </tr>
  );
}

export function GestionMagasins({ depots, societes, magasins }: { depots: Ref[]; societes: Societe[]; magasins: Magasin[] }) {
  const vide = { code: "", libelle: "", codeDepot: depots[0]?.code ?? "", codeSociete: societes.find((s) => s.isActif)?.code ?? "" };
  const [nouveau, setNouveau] = useState(vide);
  const [nouvelleSociete, setNouvelleSociete] = useState({ code: "", libelle: "" });
  const [filtre, setFiltre] = useState("");
  const [r, setR] = useState<act.Resultat | null>(null);
  const [rs, setRs] = useState<act.Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const actives = societes.filter((s) => s.isActif);
  const parDepot = depots
    .filter((d) => !filtre || d.code === filtre)
    .map((d) => ({ depot: d, magasins: magasins.filter((m) => m.codeDepot === d.code) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="carte flex flex-col gap-3">
        <h2 className="font-semibold">Ajouter un magasin</h2>
        <div className="grid gap-3 md:grid-cols-5 md:items-end">
          <label className="etiquette">Code<input className="champ" value={nouveau.code} placeholder="KRAM_PROMOFOOD" onChange={(e) => setNouveau({ ...nouveau, code: e.target.value })} /></label>
          <label className="etiquette">Libellé<input className="champ" value={nouveau.libelle} placeholder="Magasin Promofood Kram" onChange={(e) => setNouveau({ ...nouveau, libelle: e.target.value })} /></label>
          <label className="etiquette">Dépôt
            <select className="champ" value={nouveau.codeDepot} onChange={(e) => setNouveau({ ...nouveau, codeDepot: e.target.value })}>{depots.map((d) => <option key={d.code} value={d.code}>{d.libelle}</option>)}</select>
          </label>
          <label className="etiquette">Société
            <select className="champ" value={nouveau.codeSociete} onChange={(e) => setNouveau({ ...nouveau, codeSociete: e.target.value })}>{actives.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}</select>
          </label>
          <button className="btn" disabled={enCours} onClick={() => demarrer(async () => {
            const res = await act.enregistrerMagasin(nouveau, true);
            setR(res);
            if (res.ok) setNouveau({ ...vide, codeDepot: nouveau.codeDepot });
          })}>Ajouter</button>
        </div>
        <Retour r={r} />
      </div>

      <div className="flex items-center gap-2">
        <label className="etiquette">Afficher le dépôt
          <select className="champ" value={filtre} onChange={(e) => setFiltre(e.target.value)}><option value="">Tous</option>{depots.map((d) => <option key={d.code} value={d.code}>{d.libelle}</option>)}</select>
        </label>
      </div>

      {parDepot.map(({ depot, magasins: ms }) => (
        <div key={depot.code} className="carte overflow-x-auto p-0">
          <h3 className="px-3 pt-3 font-semibold">{depot.libelle} <span className="note">({ms.filter((m) => m.isActif).length} magasin(s) actif(s))</span></h3>
          <table className="tableau">
            <thead><tr><th>Code</th><th>Libellé</th><th>Dépôt</th><th>Société</th><th></th></tr></thead>
            <tbody>
              {ms.map((m) => <LigneMagasin key={`${m.code}-${m.codeDepot}-${m.codeSociete}-${m.libelle}-${m.isActif}`} m={m} depots={depots} societes={societes} />)}
              {!ms.length && <tr><td colSpan={5} className="note py-3 text-center">Aucun magasin : le compte rendu de ce dépôt ne pourra pas être soumis.</td></tr>}
            </tbody>
          </table>
        </div>
      ))}

      <details className="carte">
        <summary className="cursor-pointer font-semibold">Sociétés ({societes.length})</summary>
        <div className="mt-3 flex flex-col gap-3">
          <ul className="flex flex-col gap-1 text-sm">
            {societes.map((s) => (
              <li key={s.code} className={`flex items-center gap-2 ${s.isActif ? "" : "opacity-50"}`}>
                <span className="w-28 font-mono text-xs">{s.code}</span><span className="w-40">{s.libelle}</span>
                <button className="btn-secondaire" disabled={enCours} onClick={() => demarrer(async () => setRs(await act.basculerSociete(s.code)))}>{s.isActif ? "Désactiver" : "Activer"}</button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <label className="etiquette">Code<input className="champ" value={nouvelleSociete.code} onChange={(e) => setNouvelleSociete({ ...nouvelleSociete, code: e.target.value })} /></label>
            <label className="etiquette">Libellé<input className="champ" value={nouvelleSociete.libelle} onChange={(e) => setNouvelleSociete({ ...nouvelleSociete, libelle: e.target.value })} /></label>
            <button className="btn" disabled={enCours} onClick={() => demarrer(async () => {
              const res = await act.enregistrerSociete(nouvelleSociete, true);
              setRs(res);
              if (res.ok) setNouvelleSociete({ code: "", libelle: "" });
            })}>Ajouter la société</button>
          </div>
          <Retour r={rs} />
        </div>
      </details>
    </div>
  );
}

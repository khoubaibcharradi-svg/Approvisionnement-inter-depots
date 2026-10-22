"use client";

import { useState, useTransition } from "react";
import * as act from "./actions";

type Depot = { code: string; libelle: string };
type Agence = { code: string; libelle: string; codeDepot: string; societe: string };
type Vehicule = { matricule: string; codeMagasin: string; codeDepot: string; societe: string; chauffeurHabituel: string; description: string; isActif: boolean };

function ChoixAgence({ valeur, agences, depots, onChange }: { valeur: string; agences: Agence[]; depots: Depot[]; onChange: (v: string) => void }) {
  return (
    <select className="champ" value={valeur} onChange={(e) => onChange(e.target.value)} aria-label="Agence">
      <option value="">Choisir…</option>
      {depots.map((d) => (
        <optgroup key={d.code} label={`Dépôt ${d.libelle}`}>
          {agences.filter((a) => a.codeDepot === d.code).map((a) => <option key={a.code} value={a.code}>{a.libelle} ({a.societe})</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function Ligne({ v, agences, depots }: { v: Vehicule; agences: Agence[]; depots: Depot[] }) {
  const [x, setX] = useState(v);
  const [r, setR] = useState<act.Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const lancer = (f: () => Promise<act.Resultat>) => demarrer(async () => setR(await f()));
  return (
    <tr className={v.isActif ? "" : "opacity-50"}>
      <td className="font-mono text-xs">{v.matricule}</td>
      <td><ChoixAgence valeur={x.codeMagasin} agences={agences} depots={depots} onChange={(c) => setX({ ...x, codeMagasin: c })} /></td>
      <td>{agences.find((a) => a.code === x.codeMagasin)?.societe ?? v.societe}</td>
      <td><input className="champ w-40" value={x.chauffeurHabituel} onChange={(e) => setX({ ...x, chauffeurHabituel: e.target.value })} aria-label="Chauffeur habituel" /></td>
      <td><input className="champ w-40" value={x.description} onChange={(e) => setX({ ...x, description: e.target.value })} aria-label="Description" /></td>
      <td className="whitespace-nowrap">
        <button className="btn-secondaire" disabled={enCours} onClick={() => lancer(() => act.enregistrerVehicule(x, false))}>Enregistrer</button>{" "}
        <button className="btn-secondaire" disabled={enCours} onClick={() => lancer(() => act.basculerVehicule(v.matricule))}>{v.isActif ? "Désactiver" : "Activer"}</button>{" "}
        <button className="btn-danger" disabled={enCours} onClick={() => confirm(`Supprimer le véhicule ${v.matricule} ?`) && lancer(() => act.supprimerVehicule(v.matricule))}>Supprimer</button>
        {r && <div className={`mt-1 text-xs ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.message}</div>}
      </td>
    </tr>
  );
}

export function GestionVehicules({ depots, agences, vehicules }: { depots: Depot[]; agences: Agence[]; vehicules: Vehicule[] }) {
  const vide = { matricule: "", codeMagasin: "", chauffeurHabituel: "", description: "" };
  const [nouveau, setNouveau] = useState(vide);
  const [filtre, setFiltre] = useState("");
  const [r, setR] = useState<act.Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <div className="carte flex flex-col gap-3">
        <h2 className="font-semibold">Ajouter un véhicule</h2>
        {!agences.length && <p className="alerte-erreur">Créez d&apos;abord les agences (menu « Magasins »).</p>}
        <div className="grid gap-3 md:grid-cols-5 md:items-end">
          <label className="etiquette">Matricule<input className="champ uppercase" value={nouveau.matricule} placeholder="123 TU 4567" onChange={(e) => setNouveau({ ...nouveau, matricule: e.target.value })} /></label>
          <div className="etiquette">Agence (dépôt, société)<ChoixAgence valeur={nouveau.codeMagasin} agences={agences} depots={depots} onChange={(c) => setNouveau({ ...nouveau, codeMagasin: c })} /></div>
          <label className="etiquette">Chauffeur habituel<input className="champ" value={nouveau.chauffeurHabituel} onChange={(e) => setNouveau({ ...nouveau, chauffeurHabituel: e.target.value })} /></label>
          <label className="etiquette">Description<input className="champ" value={nouveau.description} placeholder="Camion 3,5 t" onChange={(e) => setNouveau({ ...nouveau, description: e.target.value })} /></label>
          <button className="btn" disabled={enCours} onClick={() => demarrer(async () => {
            const res = await act.enregistrerVehicule(nouveau, true);
            setR(res);
            if (res.ok) setNouveau({ ...vide, codeMagasin: nouveau.codeMagasin });
          })}>Ajouter</button>
        </div>
        {r && <p className={r.ok ? "alerte-ok" : "alerte-erreur"}>{r.message}</p>}
      </div>

      <label className="etiquette w-60">Afficher le dépôt
        <select className="champ" value={filtre} onChange={(e) => setFiltre(e.target.value)}><option value="">Tous</option>{depots.map((d) => <option key={d.code} value={d.code}>{d.libelle}</option>)}</select>
      </label>

      {depots.filter((d) => !filtre || d.code === filtre).map((d) => {
        const liste = vehicules.filter((v) => v.codeDepot === d.code);
        return (
          <div key={d.code} className="carte overflow-x-auto p-0">
            <h3 className="px-3 pt-3 font-semibold">{d.libelle} <span className="note">({liste.filter((v) => v.isActif).length} véhicule(s) actif(s))</span></h3>
            <table className="tableau">
              <thead><tr><th>Matricule</th><th>Agence</th><th>Société</th><th>Chauffeur habituel</th><th>Description</th><th></th></tr></thead>
              <tbody>
                {liste.map((v) => <Ligne key={`${v.matricule}-${v.codeMagasin}-${v.isActif}-${v.chauffeurHabituel}-${v.description}`} v={v} agences={agences} depots={depots} />)}
                {!liste.length && <tr><td colSpan={6} className="note py-3 text-center">Aucun véhicule.</td></tr>}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

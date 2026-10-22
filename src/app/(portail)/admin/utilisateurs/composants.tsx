"use client";

import { useState, useTransition } from "react";
import * as act from "./actions";

type Ref = { roles: { code: string; libelle: string }[]; canaux: { code: string; libelle: string }[]; depots: { code: string; libelle: string }[] };
type Affectation = { codeCanal: string; codeDepot: string | null };
type Utilisateur = {
  login: string; nomComplet: string; email: string; codeRole: string; isActif: boolean; verrouille: boolean;
  doitChangerMotDePasse: boolean; derniereConnexion: string | null; affectations: Affectation[];
};

function Retour({ r }: { r: act.Resultat | null }) {
  if (!r) return null;
  return (
    <div className={r.ok ? "alerte-ok" : "alerte-erreur"}>
      {r.message}
      {r.motDePasseTemporaire && (
        <div className="mt-1">Mot de passe temporaire (à transmettre, affiché une seule fois) : <code className="rounded bg-white px-1 font-mono">{r.motDePasseTemporaire}</code></div>
      )}
    </div>
  );
}

function ChampsFiche({ v, set, reference, loginModifiable }: { v: Omit<Utilisateur, "isActif" | "verrouille" | "doitChangerMotDePasse" | "derniereConnexion">; set: (p: Partial<Utilisateur>) => void; reference: Ref; loginModifiable: boolean }) {
  const sup = v.codeRole === "SUPERVISEUR";
  const avecCanaux = sup || v.codeRole === "CHEF_VENTE";
  const affectation = (c: string) => v.affectations.find((a) => a.codeCanal === c);
  const basculer = (c: string) =>
    set({ affectations: affectation(c) ? v.affectations.filter((a) => a.codeCanal !== c) : [...v.affectations, { codeCanal: c, codeDepot: null }] });
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <label className="etiquette">Identifiant<input className="champ" value={v.login} disabled={!loginModifiable} onChange={(e) => set({ login: e.target.value })} placeholder="prenom.n" /></label>
      <label className="etiquette">Nom<input className="champ" value={v.nomComplet} onChange={(e) => set({ nomComplet: e.target.value })} /></label>
      <label className="etiquette">E-mail<input className="champ" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} /></label>
      <label className="etiquette">Fonction
        <select className="champ" value={v.codeRole} onChange={(e) => set({ codeRole: e.target.value })}>
          {reference.roles.map((r) => <option key={r.code} value={r.code}>{r.libelle}</option>)}
        </select>
      </label>
      {avecCanaux && (
        <div className="md:col-span-4 flex flex-col gap-1">
          <span className="text-sm font-medium">Canaux{sup ? " et dépôt imposé" : ""}</span>
          {reference.canaux.map((c) => (
            <div key={c.code} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex w-40 items-center gap-1"><input type="checkbox" checked={!!affectation(c.code)} onChange={() => basculer(c.code)} />{c.libelle}</label>
              {sup && affectation(c.code) && (
                <select className="champ" value={affectation(c.code)?.codeDepot ?? ""}
                  onChange={(e) => set({ affectations: v.affectations.map((a) => (a.codeCanal === c.code ? { ...a, codeDepot: e.target.value || null } : a)) })}>
                  <option value="">Choisir un dépôt</option>
                  {reference.depots.map((d) => <option key={d.code} value={d.code}>{d.libelle}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function NouvelUtilisateur({ reference }: { reference: Ref }) {
  const vide = { login: "", nomComplet: "", email: "", codeRole: "SUPERVISEUR", affectations: [] as Affectation[] };
  const [v, setV] = useState(vide);
  const [r, setR] = useState<act.Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  return (
    <details className="carte">
      <summary className="cursor-pointer font-medium">Créer un utilisateur</summary>
      <div className="mt-3 flex flex-col gap-3">
        <ChampsFiche v={v} set={(p) => setV((x) => ({ ...x, ...p }))} reference={reference} loginModifiable />
        <div>
          <button className="btn" disabled={enCours} onClick={() => demarrer(async () => {
            const res = await act.creerUtilisateur({ login: v.login, nomComplet: v.nomComplet, email: v.email, codeRole: v.codeRole });
            if (res.ok && v.affectations.length) {
              const a = await act.majUtilisateur({ login: v.login.trim().toLowerCase(), nomComplet: v.nomComplet, email: v.email, codeRole: v.codeRole }, v.affectations);
              if (!a.ok) res.message += ` Affectations non enregistrées : ${a.message}`;
            }
            setR(res);
            if (res.ok) setV(vide);
          })}>Créer</button>
        </div>
        <Retour r={r} />
      </div>
    </details>
  );
}

export function FicheUtilisateur({ utilisateur: u, reference, moi }: { utilisateur: Utilisateur; reference: Ref; moi: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [v, setV] = useState(u);
  const [r, setR] = useState<act.Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const lancer = (f: () => Promise<act.Resultat>, confirmation?: string) => {
    if (confirmation && !confirm(confirmation)) return;
    demarrer(async () => setR(await f()));
  };
  const role = reference.roles.find((x) => x.code === u.codeRole)?.libelle ?? u.codeRole;
  const libelleCanal = (c: string) => reference.canaux.find((x) => x.code === c)?.libelle ?? c;
  const libelleDepot = (c: string | null) => (c ? reference.depots.find((x) => x.code === c)?.libelle ?? c : null);

  return (
    <>
      <tr className={u.isActif ? "" : "opacity-60"}>
        <td><div className="font-medium">{u.nomComplet}</div><div className="note font-mono text-xs">{u.login}</div></td>
        <td>{role}</td>
        <td>{u.affectations.map((a) => `${libelleCanal(a.codeCanal)}${a.codeDepot ? ` → ${libelleDepot(a.codeDepot)}` : ""}`).join(", ") || "—"}</td>
        <td className="flex flex-wrap gap-1">
          <span className="badge">{u.isActif ? "Actif" : "Désactivé"}</span>
          {u.verrouille && <span className="badge bg-red-100 text-red-800">Verrouillé</span>}
          {u.doitChangerMotDePasse && <span className="badge bg-amber-100 text-amber-800">Mot de passe à changer</span>}
        </td>
        <td>{u.derniereConnexion ?? "—"}</td>
        <td><button className="btn-secondaire" onClick={() => setOuvert((o) => !o)}>{ouvert ? "Fermer" : "Gérer"}</button></td>
      </tr>
      {ouvert && (
        <tr>
          <td colSpan={6} className="bg-slate-50">
            <div className="flex flex-col gap-3 p-2">
              <ChampsFiche v={v} set={(p) => setV((x) => ({ ...x, ...p }))} reference={reference} loginModifiable={false} />
              <div className="flex flex-wrap gap-2">
                <button className="btn" disabled={enCours} onClick={() => lancer(() => act.majUtilisateur({ login: v.login, nomComplet: v.nomComplet, email: v.email, codeRole: v.codeRole }, v.affectations))}>Enregistrer</button>
                <button className="btn-secondaire" disabled={enCours} onClick={() => lancer(() => act.reinitialiserMotDePasse(u.login), `Réinitialiser le mot de passe de ${u.login} ?`)}>Réinitialiser le mot de passe</button>
                {u.verrouille && <button className="btn-secondaire" disabled={enCours} onClick={() => lancer(() => act.deverrouiller(u.login))}>Déverrouiller</button>}
                {u.login !== moi && (
                  <>
                    <button className="btn-secondaire" disabled={enCours} onClick={() => lancer(() => act.basculerActif(u.login))}>{u.isActif ? "Désactiver" : "Réactiver"}</button>
                    <button className="btn-danger" disabled={enCours} onClick={() => lancer(() => act.supprimerUtilisateur(u.login), `Supprimer le compte ${u.login} ? (suppression logique, l'historique est conservé)`)}>Supprimer</button>
                  </>
                )}
              </div>
              <Retour r={r} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

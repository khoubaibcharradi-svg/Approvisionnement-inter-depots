"use client";

import { useActionState } from "react";
import { seConnecter, type EtatConnexion } from "./actions";

export function FormulaireConnexion({ acces }: { acces: string }) {
  const [etat, action, enCours] = useActionState<EtatConnexion, FormData>(seConnecter, {});
  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-5 rounded-2xl bg-white p-8 shadow-xl shadow-slate-900/10 sm:p-10">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Se connecter</h2>
        <p className="text-slate-600">{acces}</p>
      </div>
      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
        Identifiant
        <span className="relative flex">
          <svg aria-hidden="true" className="absolute top-3.5 left-3.5 h-[18px] w-[18px] stroke-slate-500" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
          <input name="login" className="champ h-12 flex-1 rounded-xl pl-11 text-[15px] font-normal" autoComplete="username" placeholder="prenom.n" required autoFocus />
        </span>
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
        Mot de passe
        <span className="relative flex">
          <svg aria-hidden="true" className="absolute top-3.5 left-3.5 h-[18px] w-[18px] stroke-slate-500" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          <input name="motDePasse" type="password" className="champ h-12 flex-1 rounded-xl pl-11 text-[15px] font-normal" autoComplete="current-password" required />
        </span>
      </label>
      {etat.erreur && <p className="alerte-erreur">{etat.erreur}</p>}
      <button className="btn h-12 rounded-xl text-base font-semibold" disabled={enCours}>
        {enCours ? "Connexion…" : "Se connecter"}
      </button>
      <p className="text-center text-sm text-slate-600">Mot de passe oublié ? Contactez votre administrateur.</p>
    </form>
  );
}

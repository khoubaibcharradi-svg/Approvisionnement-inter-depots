"use client";

import { useActionState } from "react";
import { seConnecter, type EtatConnexion } from "./actions";

export default function PageConnexion() {
  const [etat, action, enCours] = useActionState<EtatConnexion, FormData>(seConnecter, {});
  return (
    <main className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="mb-1 text-xl font-semibold">Approvisionnement inter-dépôts</h1>
      <p className="note mb-6">Radès · Portail d&apos;approvisionnement commercial</p>
      <form action={action} className="carte flex flex-col gap-4">
        <label className="etiquette">
          Identifiant
          <input name="login" className="champ" autoComplete="username" placeholder="prenom.n" required autoFocus />
        </label>
        <label className="etiquette">
          Mot de passe
          <input name="motDePasse" type="password" className="champ" autoComplete="current-password" required />
        </label>
        {etat.erreur && <p className="alerte-erreur">{etat.erreur}</p>}
        <button className="btn" disabled={enCours}>
          {enCours ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}

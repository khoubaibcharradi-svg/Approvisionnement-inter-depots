"use client";

import { useActionState } from "react";
import { changerMotDePasse, type EtatMotDePasse } from "./actions";

export function FormulaireMotDePasse() {
  const [etat, action, enCours] = useActionState<EtatMotDePasse, FormData>(changerMotDePasse, {});
  return (
    <form action={action} className="carte flex flex-col gap-4">
      <label className="etiquette">
        Mot de passe actuel
        <input name="actuel" type="password" className="champ" autoComplete="current-password" required />
      </label>
      <label className="etiquette">
        Nouveau mot de passe
        <input name="nouveau" type="password" className="champ" autoComplete="new-password" required />
      </label>
      <label className="etiquette">
        Confirmer le nouveau mot de passe
        <input name="confirmation" type="password" className="champ" autoComplete="new-password" required />
      </label>
      <p className="note">Au moins 10 caractères, avec une majuscule, une minuscule et un chiffre.</p>
      {etat.erreur && <p className="alerte-erreur">{etat.erreur}</p>}
      <button className="btn" disabled={enCours}>Changer mon mot de passe</button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { lancerSauvegarde, type Resultat } from "./actions";

export function BoutonSauvegarde() {
  const [etat, action, enCours] = useActionState<Resultat | null>(lancerSauvegarde, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div><button className="btn" disabled={enCours}>{enCours ? "Sauvegarde en cours…" : "Lancer une sauvegarde maintenant"}</button></div>
      {etat && <p className={etat.ok ? "alerte-ok" : "alerte-erreur"}>{etat.message}</p>}
    </form>
  );
}

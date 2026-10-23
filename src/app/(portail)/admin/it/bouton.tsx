"use client";

import { useState, useTransition } from "react";
import { deconnecterTout } from "./actions";

export function BoutonDeconnexion() {
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2">
      <button className="btn-danger" disabled={enCours}
        onClick={() => confirm("Fermer les sessions de tous les utilisateurs (sauf la vôtre) ?") && demarrer(async () => setMessage((await deconnecterTout()).message))}>
        {enCours ? "Fermeture…" : "Déconnecter tous les utilisateurs"}
      </button>
      {message && <p className="alerte-ok">{message}</p>}
    </div>
  );
}

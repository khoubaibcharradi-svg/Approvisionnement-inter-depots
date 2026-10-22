"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rouvrirInventaire, type Resultat } from "../../actions";

/** Toujours monté (même inventaire en cours) pour conserver le message après la réouverture. */
export function FormulaireReouverture({ codeMagasin, dateJournee, cloture, compteRenduSoumis }: { codeMagasin: string; dateJournee: string; cloture: boolean; compteRenduSoumis: boolean }) {
  const router = useRouter();
  const [motif, setMotif] = useState("");
  const [r, setR] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  if (!cloture) {
    return r ? <p className={r.ok ? "alerte-ok" : "alerte-erreur"}>{r.message}</p> : <p className="note">Inventaire en cours : la réouverture n&apos;est possible qu&apos;après sa clôture.</p>;
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-medium">Rouvrir l&apos;inventaire (exception)</p>
      {compteRenduSoumis && <p className="text-sm text-amber-900">Le compte rendu de cette journée est soumis : il repassera en brouillon pour être corrigé puis resoumis par l&apos;agent.</p>}
      <label className="etiquette">Motif (obligatoire, 10 caractères au moins)
        <textarea className="champ" rows={2} maxLength={2000} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. erreur de comptage signalée sur l'article P101001" />
      </label>
      <div>
        <button className="btn-danger" disabled={enCours || motif.trim().length < 10} onClick={() =>
          confirm("Rouvrir cet inventaire ? L'agent pourra de nouveau modifier les quantités.") &&
          demarrer(async () => {
            const res = await rouvrirInventaire(codeMagasin, dateJournee, motif);
            setR(res);
            if (res.ok) {
              setMotif("");
              router.refresh();
            }
          })}>Rouvrir l&apos;inventaire</button>
      </div>
      {r && <p className={r.ok ? "alerte-ok" : "alerte-erreur"}>{r.message}</p>}
    </div>
  );
}

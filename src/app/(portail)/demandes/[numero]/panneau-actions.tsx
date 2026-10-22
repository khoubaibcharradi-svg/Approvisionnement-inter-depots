"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DetailDemande } from "@/lib/demandes/lecture";
import * as act from "../actions";

type Mode = null | "modifier" | "demander" | "rejeter" | "refuserModif";
type Saisie = { quantite: string; livraison: string; expedition: string };

export function PanneauActions({ detail: d, estSuperviseur }: { detail: DetailDemande; estSuperviseur: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [motif, setMotif] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const initiale = () =>
    d.lignes.map((l) => ({ quantite: String(l.quantite), livraison: l.dateLivraisonSouhaitee, expedition: l.dateExpeditionPrevue ?? "" }));
  const [saisie, setSaisie] = useState<Saisie[]>(initiale);
  const a = d.actions;

  const executer = (f: () => Promise<act.Resultat>) =>
    demarrer(async () => {
      const r = await f();
      setMessage({ ok: r.ok, texte: r.message ?? (r.ok ? "Enregistré." : "Erreur") });
      if (r.ok) {
        setMode(null);
        setMotif("");
        router.refresh();
      }
    });

  const lignesSaisies = () =>
    d.lignes.map((l, i) => ({
      numeroLigne: l.numeroLigne,
      quantite: Number(saisie[i].quantite),
      ...(estSuperviseur ? { dateLivraisonSouhaitee: saisie[i].livraison } : { dateExpeditionPrevue: saisie[i].expedition || null }),
    }));
  const maj = (i: number, p: Partial<Saisie>) => setSaisie((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const ouvrir = (m: Mode) => {
    setSaisie(initiale());
    setMotif("");
    setMessage(null);
    setMode(m);
  };

  const rien = !Object.values(a).some(Boolean);
  if (rien && !message) return null;

  return (
    <div className="carte flex flex-col gap-3">
      <h2 className="font-semibold">Actions</h2>

      {a.deciderRades && <DecisionRades d={d} enCours={enCours} executer={executer} />}

      {(mode === "modifier" || mode === "demander") && (
        <div className="flex flex-col gap-2">
          <table className="tableau">
            <thead>
              <tr><th>SKU</th><th>Quantité</th><th>{estSuperviseur ? "Livraison souhaitée" : "Expédition prévue"}</th></tr>
            </thead>
            <tbody>
              {d.lignes.map((l, i) => (
                <tr key={l.numeroLigne}>
                  <td>{l.codeArticle} · {l.designation}</td>
                  <td><input type="number" min={1} className="champ w-24" value={saisie[i].quantite} onChange={(e) => maj(i, { quantite: e.target.value })} aria-label="Quantité" /> {l.unite === "CARTON" ? "carton(s)" : "pièce(s)"}</td>
                  <td>
                    {estSuperviseur ? (
                      <input type="date" className="champ" value={saisie[i].livraison} onChange={(e) => maj(i, { livraison: e.target.value })} aria-label="Livraison souhaitée" />
                    ) : (
                      <input type="date" className="champ" value={saisie[i].expedition} onChange={(e) => maj(i, { expedition: e.target.value })} aria-label="Expédition prévue" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Motif valeur={motif} onChange={setMotif} obligatoire={mode === "demander" || !estSuperviseur} />
          <div className="flex gap-2">
            <button className="btn" disabled={enCours} onClick={() =>
              executer(() => mode === "modifier"
                ? act.modifier(d.numero, d.version, lignesSaisies(), motif)
                : act.demanderModification(d.numero, d.version, lignesSaisies(), motif))}>
              {mode === "modifier" ? "Enregistrer" : "Envoyer la demande de modification"}
            </button>
            <button className="btn-secondaire" onClick={() => setMode(null)}>Annuler</button>
          </div>
        </div>
      )}

      {(mode === "rejeter" || mode === "refuserModif") && (
        <div className="flex flex-col gap-2">
          <Motif valeur={motif} onChange={setMotif} obligatoire />
          <div className="flex gap-2">
            <button className="btn-danger" disabled={enCours || !motif.trim()} onClick={() =>
              executer(() => mode === "rejeter"
                ? act.rejeter(d.numero, d.version, motif)
                : act.trancherModification(d.numero, d.version, false, motif))}>
              Confirmer le refus
            </button>
            <button className="btn-secondaire" onClick={() => setMode(null)}>Annuler</button>
          </div>
        </div>
      )}

      {mode === null && (
        <div className="flex flex-wrap gap-2">
          {a.valider && (
            <>
              <button className="btn" disabled={enCours} onClick={() => executer(() => act.valider(d.numero, d.version))}>
                {d.statut === "A_VALIDER" ? "Valider" : "Approuver"}
              </button>
              <button className="btn-danger" disabled={enCours} onClick={() => ouvrir("rejeter")}>Rejeter</button>
            </>
          )}
          {a.modifier && <button className="btn-secondaire" onClick={() => ouvrir("modifier")}>Modifier quantités / dates</button>}
          {a.annulerDecision && (
            <button className="btn-secondaire" disabled={enCours} onClick={() => executer(() => act.annulerDecision(d.numero, d.version))}>
              Modifier ma décision
            </button>
          )}
          {a.demanderModification && <button className="btn-secondaire" onClick={() => ouvrir("demander")}>Demander une modification</button>}
          {a.trancherModification && (
            <>
              <button className="btn" disabled={enCours} onClick={() => executer(() => act.trancherModification(d.numero, d.version, true))}>
                Accepter la modification
              </button>
              <button className="btn-danger" onClick={() => ouvrir("refuserModif")}>Refuser la modification</button>
            </>
          )}
          {a.retirerModification && (
            <button className="btn-secondaire" disabled={enCours} onClick={() => executer(() => act.retirerModification(d.numero, d.version))}>
              Retirer ma demande de modification
            </button>
          )}
          {a.expedier && (
            <button className="btn" disabled={enCours} onClick={() => executer(() => act.expedier(d.numero, d.version))}>Marquer expédiée</button>
          )}
        </div>
      )}

      {message && <p className={message.ok ? "alerte-ok" : "alerte-erreur"}>{message.texte}</p>}
    </div>
  );
}

function Motif({ valeur, onChange, obligatoire }: { valeur: string; onChange: (v: string) => void; obligatoire?: boolean }) {
  return (
    <label className="etiquette">
      Motif{obligatoire ? " (obligatoire)" : ""}
      <input className="champ" value={valeur} maxLength={2000} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** RG-05 : tableau de décision du Chef dépôt Radès (module 4). */
function DecisionRades({ d, enCours, executer }: { d: DetailDemande; enCours: boolean; executer: (f: () => Promise<act.Resultat>) => void }) {
  const [lignes, setLignes] = useState(d.lignes.map((l) => ({ quantite: String(l.quantite), expedition: l.dateExpeditionPrevue ?? "" })));
  const [motif, setMotif] = useState("");
  const maj = (i: number, p: Partial<(typeof lignes)[number]>) => setLignes((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Décision du chef de dépôt</p>
      <div className="overflow-x-auto">
        <table className="tableau">
          <thead>
            <tr><th>SKU</th><th>Quantité demandée</th><th>Livraison demandée</th><th>Quantité retenue</th><th>Date d&apos;expédition</th></tr>
          </thead>
          <tbody>
            {d.lignes.map((l, i) => (
              <tr key={l.numeroLigne}>
                <td>{l.codeArticle} · {l.designation}</td>
                <td>{l.quantite} {l.unite === "CARTON" ? "carton(s)" : "pièce(s)"}</td>
                <td>{l.dateLivraisonSouhaitee}</td>
                <td><input type="number" min={1} className="champ w-24" value={lignes[i].quantite} onChange={(e) => maj(i, { quantite: e.target.value })} aria-label="Quantité retenue" /></td>
                <td><input type="date" className="champ" value={lignes[i].expedition} onChange={(e) => maj(i, { expedition: e.target.value })} aria-label="Date d'expédition" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Motif valeur={motif} onChange={setMotif} />
      <p className="note">Motif obligatoire pour une modification ou un refus.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={enCours} onClick={() => executer(() => act.deciderRades(d.numero, d.version, { type: "TOTALITE" }))}>
          Accepter la totalité
        </button>
        <button className="btn-secondaire" disabled={enCours} onClick={() =>
          executer(() => act.deciderRades(d.numero, d.version, {
            type: "MODIFICATIONS",
            motif,
            lignes: d.lignes.map((l, i) => ({ numeroLigne: l.numeroLigne, quantite: Number(lignes[i].quantite), dateExpeditionPrevue: lignes[i].expedition || null })),
          }))}>
          Valider avec mes modifications
        </button>
        <button className="btn-danger" disabled={enCours} onClick={() => executer(() => act.deciderRades(d.numero, d.version, { type: "REFUS", motif }))}>
          Refuser toute la demande
        </button>
      </div>
    </div>
  );
}

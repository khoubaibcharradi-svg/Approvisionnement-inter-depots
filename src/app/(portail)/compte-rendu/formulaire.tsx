"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JourneeCompteRendu } from "@/lib/compte-rendu/service";
import {
  LIBELLES_NATURES,
  calculerCaisse,
  calculerDepenses,
  calculerRecette,
  calculerStock,
  controlerCompletude,
  totaux,
  type SaisieCompteRendu,
} from "@/lib/compte-rendu/calculs";
import { ajouterPiece, enregistrerCompteRendu, retirerPiece } from "./actions";

type Rubrique = "STOCK" | "RECETTES" | "DEPENSES";

const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const classeEcart = (n: number) => (n === 0 ? "" : n < 0 ? "text-red-700 font-semibold" : "text-amber-700 font-semibold");

function Montant({ valeur, onChange, verrouille, label }: { valeur: number | null; onChange: (v: number | null) => void; verrouille?: boolean; label: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="0.001"
      min={0}
      className={`champ w-28 text-right ${verrouille ? "bg-slate-100" : ""}`}
      value={valeur ?? ""}
      disabled={verrouille}
      aria-label={label}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    />
  );
}

function Texte({ valeur, onChange, label, lecture, lignes = 2, placeholder }: { valeur: string; onChange: (v: string) => void; label: string; lecture: boolean; lignes?: number; placeholder?: string }) {
  return (
    <label className="etiquette">
      {label}
      <textarea className="champ" rows={lignes} value={valeur} disabled={lecture} maxLength={5000} placeholder={placeholder ?? "« RAS » si rien à signaler"} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="carte flex flex-col gap-3">
      <h2 className="font-semibold uppercase tracking-wide text-marque">{titre}</h2>
      {children}
    </section>
  );
}

export function FormulaireCompteRendu({ journee: j }: { journee: JourneeCompteRendu }) {
  const router = useRouter();
  const [s, setS] = useState<SaisieCompteRendu>(j.saisie);
  const [modifie, setModifie] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const lecture = !j.modifiable;
  const piecesStock = j.pieces.filter((p) => p.rubrique === "STOCK").length;
  const t = useMemo(() => totaux(s), [s]);
  const magasin = (code: string) => j.magasins.find((m) => m.code === code);
  const repriseMagasin = (code: string) => !!j.reprise?.magasins.includes(code);
  /** Chauffeurs proposés dans la caisse recettes : ceux des véhicules du dépôt et ceux des véhicules traités ce jour. */
  const chauffeurs = [...new Set([...j.vehicules.map((v) => v.chauffeurHabituel), ...s.vehicules.map((v) => v.vendeurChauffeur)].map((c) => c.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const societeDuChauffeur = (c: string) =>
    s.vehicules.find((v) => v.vendeurChauffeur.trim() === c)?.codeSociete || j.vehicules.find((v) => v.chauffeurHabituel.trim() === c)?.codeSociete || "";
  /** Ligne calculée depuis l'inventaire en quantités : non saisissable ici. */
  const parInventaire = (code: string) => j.inventaire.obligatoire || !!j.inventaire.etat[code];
  const lienInventaire = (code: string) => `/compte-rendu/inventaire?date=${j.dateJournee}&magasin=${encodeURIComponent(code)}`;

  useEffect(() => {
    if (!modifie) return;
    const avertir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifie]);

  const maj = (p: Partial<SaisieCompteRendu>) => {
    setS((x) => ({ ...x, ...p }));
    setModifie(true);
  };
  const majLigne = <K extends "stocks" | "vehicules" | "recettes" | "caisses" | "depenses">(cle: K, i: number, p: Partial<SaisieCompteRendu[K][number]>) =>
    maj({ [cle]: s[cle].map((l, k) => (k === i ? { ...l, ...p } : l)) } as Partial<SaisieCompteRendu>);
  const retirer = (cle: "vehicules" | "recettes" | "depenses", i: number) => maj({ [cle]: s[cle].filter((_, k) => k !== i) } as Partial<SaisieCompteRendu>);

  const sauver = (soumettre: boolean) =>
    new Promise<boolean>((fin) =>
      demarrer(async () => {
        const r = await enregistrerCompteRendu(j.dateJournee, j.version, s, soumettre);
        setMessage({ ok: r.ok, texte: r.message });
        if (r.ok) {
          setModifie(false);
          router.refresh();
        }
        fin(r.ok);
      }),
    );

  const soumettre = async () => {
    const manques = [...j.inventaire.manques, ...controlerCompletude(s, { nbPieces: piecesStock, pieceObligatoire: j.pieceObligatoire })];
    if (manques.length) {
      setMessage({ ok: false, texte: `Compte rendu incomplet :\n• ${manques.join("\n• ")}` });
      return;
    }
    if (!confirm("Soumettre le compte rendu ? Il ne sera plus modifiable.")) return;
    await sauver(true);
  };

  /** Envoie la pièce dès qu'elle est choisie ; le brouillon est enregistré d'abord s'il n'existe pas. */
  const envoyerPiece = async (rubrique: Rubrique, f: File) => {
      let numero = j.numero;
      if (!numero || modifie) {
        // La pièce est rattachée au compte rendu : le brouillon est enregistré d'abord.
        const r = await enregistrerCompteRendu(j.dateJournee, j.version, s, false);
        if (!r.ok) return setMessage({ ok: false, texte: r.message });
        numero = r.numero!;
        setModifie(false);
      }
      const form = new FormData();
      form.set("numero", numero);
      form.set("rubrique", rubrique);
      form.set("fichier", f);
      const r = await ajouterPiece(form);
      setMessage({ ok: r.ok, texte: r.message });
      router.refresh();
  };
  const pieces = (rubrique: Rubrique, titre: string, obligatoire: boolean) => (
    <PiecesJointes j={j} rubrique={rubrique} titre={titre} obligatoire={obligatoire} lecture={lecture} envoyer={envoyerPiece} setMessage={setMessage} />
  );

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="carte flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          Dépôt <b>{j.depot.libelle}</b> · journée du <b>{new Date(`${j.dateJournee}T12:00:00`).toLocaleDateString("fr-FR")}</b>
          {j.numero && <> · {j.numero}</>}
        </span>
        <span className="badge">
          {j.statut === "SOUMIS" ? `Soumis le ${new Date(j.dateSoumission!).toLocaleString("fr-FR")} par ${j.agent}` : j.statut === "BROUILLON" ? `Brouillon (${j.agent})` : "Nouveau"}
        </span>
      </div>
      {j.reprise && !lecture && (
        <p className="note">Stock initial et soldes veille repris du compte rendu {j.reprise.numero} du {j.reprise.date} (non modifiables).</p>
      )}

      <Section titre="Situation du stock au coût de revient (en dinars)">
        {!lecture && s.stocks.length > 0 && s.stocks.some((l) => parInventaire(l.codeMagasin)) && (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            Cette situation est calculée automatiquement depuis l&apos;inventaire en quantités de chaque magasin, valorisé au coût de revient.
            <ul className="mt-1 list-disc pl-5">
              {s.stocks.map((l) => {
                const e = j.inventaire.etat[l.codeMagasin];
                const nom = magasin(l.codeMagasin)?.libelle ?? l.codeMagasin;
                return (
                  <li key={l.codeMagasin}>
                    <a className="font-medium underline" href={lienInventaire(l.codeMagasin)}>{nom}</a> :{" "}
                    {!e ? <span className="text-red-700">inventaire non saisi</span> : e.statut !== "CLOTURE" ? <span className="text-amber-700">inventaire en cours, non clôturé : les valeurs s&apos;afficheront après la clôture</span> : <>
                      🔒 clôturé · 
                      {e.nbLignes} article(s)
                      {e.erreurs.length > 0 && <span className="text-red-700"> · {e.erreurs.join(" ; ")}</span>}
                      {e.sansPrix > 0 && <span className="text-amber-700"> · {e.sansPrix} article(s) sans prix de revient (valorisés à 0)</span>}
                    </>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {!s.stocks.length && <p className="alerte-erreur">Aucun magasin n&apos;est paramétré pour votre dépôt : contactez l&apos;administrateur.</p>}
        <div className="overflow-x-auto">
          <table className="tableau">
            <thead>
              <tr>
                <th>Magasin / Société</th><th>Stock initial</th><th>Réceptions</th><th>Ventes</th><th>Retours</th><th>Stock final théorique</th><th>Stock final réel</th><th>Écart (+/−)</th>
              </tr>
            </thead>
            <tbody>
              {s.stocks.map((l, i) => {
                const c = calculerStock(l);
                const m = magasin(l.codeMagasin);
                return (
                  <tr key={l.codeMagasin}>
                    <td>
                      <b>{m?.societe}</b><div className="note text-xs">{m?.libelle ?? l.codeMagasin}</div>
                      {!lecture && parInventaire(l.codeMagasin) && <a className="text-xs text-marque underline" href={lienInventaire(l.codeMagasin)}>Saisir l&apos;inventaire</a>}
                    </td>
                    <td><Montant label="Stock initial" valeur={l.stockInitial} verrouille={lecture || parInventaire(l.codeMagasin) || repriseMagasin(l.codeMagasin)} onChange={(v) => majLigne("stocks", i, { stockInitial: v })} /></td>
                    <td><Montant label="Réceptions" valeur={l.receptions} verrouille={lecture || parInventaire(l.codeMagasin)} onChange={(v) => majLigne("stocks", i, { receptions: v })} /></td>
                    <td><Montant label="Ventes" valeur={l.ventes} verrouille={lecture || parInventaire(l.codeMagasin)} onChange={(v) => majLigne("stocks", i, { ventes: v })} /></td>
                    <td><Montant label="Retours" valeur={l.retours} verrouille={lecture || parInventaire(l.codeMagasin)} onChange={(v) => majLigne("stocks", i, { retours: v })} /></td>
                    <td className="text-right tabular-nums">{fmt(c.stockFinalTheorique)}</td>
                    <td><Montant label="Stock final réel" valeur={l.stockFinalReel} verrouille={lecture || parInventaire(l.codeMagasin)} onChange={(v) => majLigne("stocks", i, { stockFinalReel: v })} /></td>
                    <td className={`text-right tabular-nums ${classeEcart(c.ecart)}`}>{fmt(c.ecart)}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td>TOTAL</td>
                {[t.stock.stockInitial, t.stock.receptions, t.stock.ventes, t.stock.retours, t.stock.stockFinalTheorique, t.stock.stockFinalReel].map((v, k) => (
                  <td key={k} className="text-right tabular-nums">{fmt(v)}</td>
                ))}
                <td className={`text-right tabular-nums ${classeEcart(t.stock.ecart)}`}>{fmt(t.stock.ecart)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="note">Stock final théorique = stock initial + réceptions − ventes + retours ; écart = stock réel − théorique.</p>
        {pieces("STOCK", "Annexe : états de stock système édités juste avant la clôture de la journée", j.pieceObligatoire)}
        <Texte label={`Justification des écarts${t.stock.ecart !== 0 || s.stocks.some((l) => calculerStock(l).ecart !== 0) ? " (obligatoire : écart constaté)" : ""}`}
          valeur={s.justificationEcarts} lecture={lecture} lignes={3} placeholder="Expliquez chaque écart (casse, erreur de saisie, inventaire…)" onChange={(v) => maj({ justificationEcarts: v })} />
      </Section>

      <Section titre="Véhicules traités">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.aucunVehicule} disabled={lecture} onChange={(e) => maj({ aucunVehicule: e.target.checked })} /> Aucun véhicule traité aujourd&apos;hui
        </label>
        {!s.aucunVehicule && (
          <div className="overflow-x-auto">
            <table className="tableau">
              <thead><tr><th>Matricule</th><th>Agence / société</th><th>Vendeur / chauffeur</th><th>Heure d&apos;entrée</th><th>Heure de sortie</th><th>Observations</th><th></th></tr></thead>
              <tbody>
                {s.vehicules.map((v, i) => {
                  const ref = j.vehicules.find((x) => x.matricule === v.matricule);
                  return (
                  <tr key={i}>
                    <td>
                      <select className="champ w-44" value={v.matricule} disabled={lecture} aria-label="Matricule"
                        onChange={(e) => {
                          const x = j.vehicules.find((y) => y.matricule === e.target.value);
                          majLigne("vehicules", i, {
                            matricule: e.target.value,
                            codeSociete: x?.codeSociete ?? "",
                            codeMagasin: x?.codeMagasin ?? "",
                            vendeurChauffeur: v.vendeurChauffeur || x?.chauffeurHabituel || "",
                          });
                        }}>
                        <option value="">Choisir…</option>
                        {v.matricule && !ref && <option value={v.matricule}>{v.matricule} (inactif)</option>}
                        {j.vehicules.map((x) => (
                          <option key={x.matricule} value={x.matricule} disabled={s.vehicules.some((y, k) => k !== i && y.matricule === x.matricule)}>
                            {x.matricule}{x.description ? ` · ${x.description}` : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-sm">{ref ? <><b>{ref.societe}</b><div className="note text-xs">{ref.magasin}</div></> : <span className="note">—</span>}</td>
                    <td><input className="champ w-40" value={v.vendeurChauffeur} disabled={lecture} maxLength={100} aria-label="Vendeur / chauffeur" onChange={(e) => majLigne("vehicules", i, { vendeurChauffeur: e.target.value })} /></td>
                    <td><input type="time" className="champ" value={v.heureEntree} disabled={lecture} aria-label="Heure d'entrée" onChange={(e) => majLigne("vehicules", i, { heureEntree: e.target.value })} /></td>
                    <td><input type="time" className="champ" value={v.heureSortie} disabled={lecture} aria-label="Heure de sortie" onChange={(e) => majLigne("vehicules", i, { heureSortie: e.target.value })} /></td>
                    <td><input className="champ w-48" value={v.observations} disabled={lecture} maxLength={500} aria-label="Observations véhicule" onChange={(e) => majLigne("vehicules", i, { observations: e.target.value })} /></td>
                    <td>{!lecture && <button type="button" className="btn-secondaire" onClick={() => retirer("vehicules", i)}>Retirer</button>}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!lecture && !s.aucunVehicule && !j.vehicules.length && (
          <p className="alerte-erreur">Aucun véhicule n&apos;est paramétré pour votre dépôt : contactez l&apos;administrateur (menu « Véhicules »).</p>
        )}
        {!lecture && !s.aucunVehicule && j.vehicules.length > 0 && (
          <div><button type="button" className="btn-secondaire" disabled={s.vehicules.length >= j.vehicules.length}
            onClick={() => maj({ vehicules: [...s.vehicules, { codeSociete: "", codeMagasin: "", vendeurChauffeur: "", matricule: "", heureEntree: "", heureSortie: "", observations: "" }] })}>Ajouter un véhicule</button></div>
        )}
      </Section>

      <Section titre="Suivi de la caisse recettes et versements">
        <div className="overflow-x-auto">
          <table className="tableau">
            <thead><tr><th>Agent (chauffeur)</th><th>Société</th><th>CA au comptant</th><th>Recouvrement</th><th>CA à crédit</th><th>Recette</th><th>Écart</th><th></th></tr></thead>
            <tbody>
              {s.recettes.map((r, i) => {
                const ecart = calculerRecette(r).ecart;
                return (
                  <tr key={i}>
                    <td>
                      <select className="champ w-44" value={r.agent} disabled={lecture} aria-label="Agent"
                        onChange={(e) => majLigne("recettes", i, { agent: e.target.value, codeSociete: r.codeSociete || societeDuChauffeur(e.target.value) })}>
                        <option value="">Choisir…</option>
                        {r.agent && !chauffeurs.includes(r.agent) && <option value={r.agent}>{r.agent} (hors liste)</option>}
                        {chauffeurs.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td><ChoixSociete valeur={r.codeSociete} societes={j.societes} lecture={lecture} onChange={(x) => majLigne("recettes", i, { codeSociete: x })} /></td>
                    <td><Montant label="CA au comptant" valeur={r.caComptant} verrouille={lecture} onChange={(v) => majLigne("recettes", i, { caComptant: v })} /></td>
                    <td><Montant label="Recouvrement" valeur={r.recouvrement} verrouille={lecture} onChange={(v) => majLigne("recettes", i, { recouvrement: v })} /></td>
                    <td><Montant label="CA à crédit" valeur={r.caCredit} verrouille={lecture} onChange={(v) => majLigne("recettes", i, { caCredit: v })} /></td>
                    <td><Montant label="Recette" valeur={r.recette} verrouille={lecture} onChange={(v) => majLigne("recettes", i, { recette: v })} /></td>
                    <td className={`text-right tabular-nums ${classeEcart(ecart)}`}>{fmt(ecart)}</td>
                    <td>{!lecture && <button type="button" className="btn-secondaire" onClick={() => retirer("recettes", i)}>Retirer</button>}</td>
                  </tr>
                );
              })}
              {s.recettes.length > 0 && (
                <tr className="font-semibold">
                  <td colSpan={2}>TOTAL</td>
                  {[t.recettes.caComptant, t.recettes.recouvrement, t.recettes.caCredit, t.recettes.recette].map((v, k) => <td key={k} className="text-right tabular-nums">{fmt(v)}</td>)}
                  <td className={`text-right tabular-nums ${classeEcart(t.recettes.ecart)}`}>{fmt(t.recettes.ecart)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="note">Écart = recette remise − (CA au comptant + recouvrement). Le CA à crédit n&apos;entre pas en caisse.</p>
        {!lecture && (
          <div><button type="button" className="btn-secondaire" onClick={() => maj({ recettes: [...s.recettes, { agent: "", codeSociete: "", caComptant: null, recouvrement: null, caCredit: null, recette: null }] })}>Ajouter une ligne</button></div>
        )}
        {pieces("RECETTES", "Pièces jointes : bordereaux de versement, états de caisse…", false)}
        <Texte label="Observations" valeur={s.observationsRecettes} lecture={lecture} onChange={(v) => maj({ observationsRecettes: v })} />
      </Section>

      <Section titre="Récapitulatif caisse recettes">
        <div className="overflow-x-auto">
          <table className="tableau">
            <thead>
              <tr><th>Nature</th><th>Solde veille (A)</th><th>Encaissements (B)</th><th>Transferts / versement banque (C)</th><th>Solde théorique (D = A + B − C)</th><th>Solde réel (E)</th><th>Écart (E − D)</th><th>Justification des écarts</th></tr>
            </thead>
            <tbody>
              {s.caisses.map((c, i) => {
                const k = calculerCaisse(c);
                return (
                  <tr key={c.nature}>
                    <td>
                      <b>{LIBELLES_NATURES[c.nature]}</b>
                      {c.nature === "AUTRES" && (
                        <input className="champ mt-1 w-32" placeholder="Préciser" value={c.precision} disabled={lecture} maxLength={100} aria-label="Préciser la nature" onChange={(e) => majLigne("caisses", i, { precision: e.target.value })} />
                      )}
                    </td>
                    <td><Montant label={`Solde veille ${c.nature}`} valeur={c.soldeVeille} verrouille={lecture || !!j.reprise?.caisse} onChange={(v) => majLigne("caisses", i, { soldeVeille: v })} /></td>
                    <td><Montant label={`Encaissements ${c.nature}`} valeur={c.encaissements} verrouille={lecture} onChange={(v) => majLigne("caisses", i, { encaissements: v })} /></td>
                    <td><Montant label={`Transferts ${c.nature}`} valeur={c.transferts} verrouille={lecture} onChange={(v) => majLigne("caisses", i, { transferts: v })} /></td>
                    <td className="text-right tabular-nums">{fmt(k.soldeTheorique)}</td>
                    <td><Montant label={`Solde réel ${c.nature}`} valeur={c.soldeReel} verrouille={lecture} onChange={(v) => majLigne("caisses", i, { soldeReel: v })} /></td>
                    <td className={`text-right tabular-nums ${classeEcart(k.ecart)}`}>{fmt(k.ecart)}</td>
                    <td><input className="champ w-48" value={c.observations} disabled={lecture} maxLength={500} aria-label={`Justification ${c.nature}`} onChange={(e) => majLigne("caisses", i, { observations: e.target.value })} /></td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td>TOTAL</td>
                {[t.caisse.soldeVeille, t.caisse.encaissements, t.caisse.transferts, t.caisse.soldeTheorique, t.caisse.soldeReel].map((v, k) => <td key={k} className="text-right tabular-nums">{fmt(v)}</td>)}
                <td className={`text-right tabular-nums ${classeEcart(t.caisse.ecart)}`}>{fmt(t.caisse.ecart)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <Texte label="Observations" valeur={s.observationsCaisse} lecture={lecture} onChange={(v) => maj({ observationsCaisse: v })} />
      </Section>

      <Section titre="Suivi de la caisse dépenses">
        <div className="overflow-x-auto">
          <table className="tableau">
            <thead><tr><th>Libellé</th><th>Montant débit (entrée)</th><th>Montant crédit (sortie)</th><th>Solde</th><th>Validé par</th><th></th></tr></thead>
            <tbody>
              <tr>
                <td className="font-medium">Solde veille</td><td /><td />
                <td><Montant label="Solde veille dépenses" valeur={s.soldeVeilleDepenses} verrouille={lecture || !!j.reprise} onChange={(v) => maj({ soldeVeilleDepenses: v })} /></td>
                <td /><td />
              </tr>
              {s.depenses.map((d, i) => (
                <tr key={i}>
                  <td><input className="champ w-56" value={d.libelle} disabled={lecture} maxLength={200} aria-label="Libellé" onChange={(e) => majLigne("depenses", i, { libelle: e.target.value })} /></td>
                  <td><Montant label="Débit" valeur={d.debit} verrouille={lecture} onChange={(v) => majLigne("depenses", i, { debit: v })} /></td>
                  <td><Montant label="Crédit" valeur={d.credit} verrouille={lecture} onChange={(v) => majLigne("depenses", i, { credit: v })} /></td>
                  <td className="text-right tabular-nums">{fmt(calculerDepenses(s.soldeVeilleDepenses, s.depenses).soldes[i])}</td>
                  <td><input className="champ w-36" value={d.validePar} disabled={lecture} maxLength={100} aria-label="Validé par" onChange={(e) => majLigne("depenses", i, { validePar: e.target.value })} /></td>
                  <td>{!lecture && <button type="button" className="btn-secondaire" onClick={() => retirer("depenses", i)}>Retirer</button>}</td>
                </tr>
              ))}
              <tr className="font-semibold"><td colSpan={3}>Solde fin de journée</td><td className="text-right tabular-nums">{fmt(t.depenses.soldeFinal)}</td><td colSpan={2} /></tr>
            </tbody>
          </table>
        </div>
        {!lecture && (
          <div><button type="button" className="btn-secondaire" onClick={() => maj({ depenses: [...s.depenses, { libelle: "", debit: null, credit: null, validePar: "" }] })}>Ajouter une opération</button></div>
        )}
        {pieces("DEPENSES", "Pièces jointes : justificatifs de dépenses (factures, tickets…)", false)}
        <Texte label="Observations" valeur={s.observationsDepenses} lecture={lecture} onChange={(v) => maj({ observationsDepenses: v })} />
      </Section>

      <Section titre="Sécurité, infrastructure et anomalies">
        <Texte label="État des caméras de surveillance" valeur={s.etatCameras} lecture={lecture} placeholder="Ex. 8/8 caméras fonctionnelles" onChange={(v) => maj({ etatCameras: v })} />
        <Texte label="Ressources humaines (présences / absences / retards)" valeur={s.ressourcesHumaines} lecture={lecture} placeholder="Ex. 6 présents, 1 absent (congé), aucun retard" onChange={(v) => maj({ ressourcesHumaines: v })} />
        <Texte label="Remarques / incidents du jour" valeur={s.remarques} lecture={lecture} lignes={3} onChange={(v) => maj({ remarques: v })} />
      </Section>

      {message && <p className={`${message.ok ? "alerte-ok" : "alerte-erreur"} whitespace-pre-line`}>{message.texte}</p>}

      {!lecture && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 shadow">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
            {modifie && <span className="note mr-auto">Modifications non enregistrées</span>}
            <button className="btn-secondaire" disabled={enCours} onClick={() => sauver(false)}>{enCours ? "Enregistrement…" : "Enregistrer le brouillon"}</button>
            <button className="btn" disabled={enCours} onClick={soumettre}>Soumettre le compte rendu</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChoixSociete({ valeur, societes, lecture, onChange }: { valeur: string; societes: { code: string; libelle: string }[]; lecture: boolean; onChange: (v: string) => void }) {
  return (
    <select className="champ" value={valeur} disabled={lecture} aria-label="Société" onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {societes.map((x) => <option key={x.code} value={x.code}>{x.libelle}</option>)}
    </select>
  );
}

function PiecesJointes({ j, rubrique, titre, obligatoire, lecture, envoyer, setMessage }: {
  j: JourneeCompteRendu;
  rubrique: Rubrique;
  titre: string;
  obligatoire: boolean;
  lecture: boolean;
  envoyer: (rubrique: Rubrique, f: File) => Promise<void>;
  setMessage: (m: { ok: boolean; texte: string }) => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const liste = j.pieces.filter((p) => p.rubrique === rubrique);
  return (
    <div className="rounded-md border border-dashed border-slate-300 p-3">
      <p className="text-sm font-medium">{titre}{obligatoire ? " (obligatoire)" : ""}</p>
      <ul className="my-2 flex flex-col gap-1 text-sm">
        {liste.map((p) => (
          <li key={p.numeroPiece} className="flex items-center gap-2">
            <a className="text-marque underline" href={`/api/comptes-rendus/${j.numero}/pieces/${p.numeroPiece}`}>{p.nomFichier}</a>
            <span className="note">({Math.ceil(p.taille / 1024)} Ko)</span>
            {!lecture && (
              <button type="button" className="text-xs text-red-700 underline" disabled={enCours} onClick={() =>
                demarrer(async () => {
                  const r = await retirerPiece(j.numero!, p.numeroPiece);
                  setMessage({ ok: r.ok, texte: r.message });
                  router.refresh();
                })}>retirer</button>
            )}
          </li>
        ))}
        {!liste.length && <li className="note">Aucune pièce jointe.</li>}
      </ul>
      {!lecture && (
        <label className={`btn-secondaire cursor-pointer ${enCours ? "pointer-events-none opacity-50" : ""}`}>
          {enCours ? "Envoi en cours…" : "Joindre un fichier"}
          <input type="file" className="sr-only" accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png" aria-label={`Pièce jointe ${rubrique}`} disabled={enCours}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) demarrer(() => envoyer(rubrique, f));
            }} />
        </label>
      )}
      {!lecture && <span className="note ml-2">PDF, Excel, CSV, JPG ou PNG · 8 Mo maximum · envoi dès la sélection</span>}
    </div>
  );
}

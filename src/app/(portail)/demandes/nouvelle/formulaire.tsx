"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { creerDemande } from "../actions";

type Canal = { code: string; libelle: string; depot: string | null };
type Article = { code: string; designation: string; famille: string };
type Ligne = { saisie: string; quantite: string; unite: "PIECE" | "CARTON"; date: string };

const nouvelleLigne = (): Ligne => ({ saisie: "", quantite: "1", unite: "CARTON", date: "" });

export function FormulaireDemande({ canaux, articles }: { canaux: Canal[]; articles: Article[] }) {
  const router = useRouter();
  const [canal, setCanal] = useState(canaux[0].code);
  const [lignes, setLignes] = useState<Ligne[]>([nouvelleLigne()]);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const parLibelle = useMemo(() => new Map(articles.map((a) => [`${a.code} · ${a.designation}`, a])), [articles]);
  const parCode = useMemo(() => new Map(articles.map((a) => [a.code, a])), [articles]);
  const article = (s: string) => parLibelle.get(s) ?? parCode.get(s.trim().toUpperCase());
  const depot = canaux.find((c) => c.code === canal)?.depot;
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const maj = (i: number, p: Partial<Ligne>) => setLignes((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));

  function soumettre() {
    setErreur(null);
    const inconnues = lignes.filter((l) => !article(l.saisie));
    if (inconnues.length) return setErreur("Choisissez chaque article dans la liste proposée.");
    if (lignes.some((l) => !l.date)) return setErreur("Indiquez la date de livraison souhaitée pour chaque article.");
    demarrer(async () => {
      const r = await creerDemande({
        codeCanal: canal,
        motif: motif || undefined,
        lignes: lignes.map((l) => ({ codeArticle: article(l.saisie)!.code, quantite: Number(l.quantite), unite: l.unite, dateLivraisonSouhaitee: l.date })),
      });
      if (!r.ok) return setErreur(r.message ?? "Erreur");
      router.push(`/demandes/${r.numero}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="carte grid gap-4 sm:grid-cols-2">
        <label className="etiquette">
          Canal
          <select className="champ" value={canal} onChange={(e) => setCanal(e.target.value)}>
            {canaux.map((c) => <option key={c.code} value={c.code}>{c.libelle}</option>)}
          </select>
        </label>
        <div className="etiquette">
          Dépôt (affectation)
          <div className="champ bg-slate-50">{depot ?? "Non affecté — contactez l'administrateur"}</div>
        </div>
      </div>

      <datalist id="articles">
        {articles.map((a) => <option key={a.code} value={`${a.code} · ${a.designation}`} />)}
      </datalist>

      <div className="carte overflow-x-auto p-0">
        <table className="tableau">
          <thead>
            <tr><th>Article</th><th>Famille</th><th>Quantité</th><th>Unité</th><th>Livraison souhaitée</th><th></th></tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i}>
                <td className="min-w-72">
                  <input list="articles" className="champ w-full" value={l.saisie} placeholder="Tapez les premières lettres du code ou de la désignation"
                    onChange={(e) => maj(i, { saisie: e.target.value })} aria-label="Article" />
                </td>
                <td>{article(l.saisie)?.famille ?? "—"}</td>
                <td><input type="number" min={1} className="champ w-24" value={l.quantite} onChange={(e) => maj(i, { quantite: e.target.value })} aria-label="Quantité" /></td>
                <td>
                  <select className="champ" value={l.unite} onChange={(e) => maj(i, { unite: e.target.value as Ligne["unite"] })} aria-label="Unité">
                    <option value="CARTON">Carton</option>
                    <option value="PIECE">Pièce</option>
                  </select>
                </td>
                <td><input type="date" min={aujourdhui} className="champ" value={l.date} onChange={(e) => maj(i, { date: e.target.value })} aria-label="Livraison souhaitée" /></td>
                <td>
                  <button type="button" className="btn-secondaire" disabled={lignes.length === 1}
                    onClick={() => setLignes((x) => x.filter((_, k) => k !== i))}>Retirer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div><button type="button" className="btn-secondaire" onClick={() => setLignes((x) => [...x, nouvelleLigne()])}>Ajouter une ligne</button></div>

      <label className="etiquette">
        Motif / justification (obligatoire en cas de demande exceptionnelle ou de dépassement du quota autorisé)
        <textarea className="champ" rows={2} value={motif} maxLength={2000} onChange={(e) => setMotif(e.target.value)}
          placeholder="Ex. lancement promo GMS, nouveau client Grossiste" />
      </label>
      {erreur && <p className="alerte-erreur">{erreur}</p>}
      <div><button className="btn" onClick={soumettre} disabled={enCours || !depot}>{enCours ? "Envoi…" : "Soumettre au Chef de Vente"}</button></div>
    </div>
  );
}

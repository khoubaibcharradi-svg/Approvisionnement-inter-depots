import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { detailDemande } from "@/lib/demandes/lecture";
import { ROLES } from "@/lib/constantes";
import { libelles, listeLibelles } from "@/lib/referentiels";
import { auditer } from "@/lib/audit";
import { PanneauActions } from "./panneau-actions";

const RANG: Record<string, number> = { A_VALIDER: 1, A_APPROUVER: 2, APPROUVEE: 3, EN_PREPARATION: 4, EXPEDIEE: 4 };

export default async function PageDemande({ params }: { params: Promise<{ numero: string }> }) {
  const u = await exigerUtilisateur();
  const { numero } = await params;
  const d = await detailDemande(u, numero);
  if (!d) {
    // Introuvable ou hors circuit : même réponse pour ne pas révéler l'existence de la demande.
    await auditer({ action: "CONSULTATION_REFUSEE", login: u.login, codeRole: u.role, entite: "Demande", cleEntite: numero.slice(0, 80), succes: false });
    notFound();
  }
  const rang = RANG[d.statut] ?? 0;
  const [statuts, unites, decisions, etapes] = await Promise.all([
    libelles("STATUT_DEMANDE"),
    libelles("UNITE"),
    libelles("DECISION_DEPOT"),
    listeLibelles("ETAPE_DEMANDE").then((l) => l.map((e, i) => `${i + 1} · ${e.libelle}`)),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/demandes" className="note underline">← Demandes</Link>
      <div className="carte flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="titre-page">{d.numero}</h1>
            <p className="note">{d.canal} · dépôt {d.depot} · saisie par {d.saisiePar} le {d.dateSaisie.toLocaleString("fr-FR")}</p>
          </div>
          <span className="badge text-sm">{statuts[d.statut]}</span>
        </div>
        <ol className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
          {etapes.map((e, i) => {
            const rejet = d.statut === "REJETEE" && d.etapeRejet === i;
            const fait = d.statut === "REJETEE" ? i < (d.etapeRejet ?? 0) : i < rang;
            const courant = d.statut !== "REJETEE" && i === rang;
            return (
              <li key={e} className={`rounded px-2 py-1 text-center ${rejet ? "bg-red-100 text-red-800" : fait ? "bg-emerald-100 text-emerald-800" : courant ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
                {e}{rejet ? " · rejet" : ""}
              </li>
            );
          })}
        </ol>
        {d.motif && <p className="text-sm"><span className="font-medium">Motif du superviseur :</span> {d.motif}</p>}
      </div>

      <div className="carte overflow-x-auto p-0">
        <table className="tableau">
          <thead>
            <tr>
              <th>Famille</th><th>SKU</th><th>Désignation</th><th>Quantité</th><th>Livraison souhaitée</th><th>Expédition prévue</th><th>Décision dépôt</th>
              {d.voitStock && <><th>Stock (crt)</th><th>Rotation (crt/mois)</th><th>En instance (crt)</th></>}
            </tr>
          </thead>
          <tbody>
            {d.lignes.map((l) => (
              <tr key={l.numeroLigne}>
                <td>{l.famille}</td>
                <td className="font-mono text-xs">{l.codeArticle}</td>
                <td>{l.designation}</td>
                <td>
                  {l.quantite} {unites[l.unite]}
                  {l.quantite !== l.quantiteInitiale && <span className="note"> (demandé {l.quantiteInitiale})</span>}
                </td>
                <td>{l.dateLivraisonSouhaitee}</td>
                <td>{l.dateExpeditionPrevue ?? "—"}</td>
                <td>{l.decisionDepot ? `${decisions[l.decisionDepot]}${l.motifDecision ? ` · ${l.motifDecision}` : ""}` : <span className="note">en attente</span>}</td>
                {l.aide && (
                  <>
                    <td>{l.aide.stockCartons}{!l.aide.pcb && <span className="note" title="PCB non renseigné"> *</span>}</td>
                    <td>{l.aide.rotationCartons ?? <span className="note">—</span>}</td>
                    <td>{l.aide.instanceCartons}{l.aide.dontCetteDemande > 0 && <span className="note"> (dont celle-ci : {l.aide.dontCetteDemande})</span>}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {d.voitStock && <p className="note px-3 py-2">Aide à la décision en cartons (RG-08). * PCB non renseigné : 1 pièce par carton.</p>}
      </div>

      {d.modificationEnAttente && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>Demande de modification en attente</b> — {d.modificationEnAttente.loginDemandeur} : {d.modificationEnAttente.resume} · motif : {d.modificationEnAttente.motif}
        </p>
      )}

      <PanneauActions detail={d} estSuperviseur={u.role === ROLES.SUPERVISEUR} />

      <div className="carte">
        <h2 className="mb-2 font-semibold">Historique</h2>
        <ol className="flex flex-col gap-1 text-sm">
          {d.historique.map((h) => (
            <li key={h.numeroEvenement}>
              <span className="note">{h.horodatage.toLocaleString("fr-FR")}</span> — {h.libelle}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

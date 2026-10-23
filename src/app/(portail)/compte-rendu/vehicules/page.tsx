import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constantes";
import { GestionVehicules } from "../../admin/vehicules/composants";

/** Véhicules du dépôt de l'agent : ajout, description, chauffeur habituel, activation. */
export default async function PageVehiculesAgent() {
  const u = await exigerUtilisateur([ROLES.AGENT_DEPOT]);
  if (!u.codeDepotAgent) return <p className="alerte-erreur">Aucun dépôt ne vous est affecté : contactez l&apos;administrateur.</p>;
  const [depot, magasins, vehicules] = await Promise.all([
    prisma.depot.findUniqueOrThrow({ where: { code: u.codeDepotAgent } }),
    prisma.magasin.findMany({ where: { codeDepot: u.codeDepotAgent, isActif: true }, include: { societe: true }, orderBy: { libelle: "asc" } }),
    prisma.vehicule.findMany({ where: { codeDepot: u.codeDepotAgent }, include: { magasin: { include: { societe: true } } }, orderBy: [{ codeMagasin: "asc" }, { matricule: "asc" }] }),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="titre-page">Véhicules du dépôt {depot.libelle}</h1>
        <p className="note">Ajoutez les véhicules de vos agences, mettez à jour leur description et leur chauffeur habituel, ou désactivez ceux qui ne roulent plus. Les chauffeurs de cette liste sont proposés dans la caisse recettes du compte rendu.</p>
      </div>
      <GestionVehicules
        peutSupprimer={false}
        depots={[{ code: depot.code, libelle: depot.libelle }]}
        agences={magasins.map((m) => ({ code: m.code, libelle: m.libelle, codeDepot: m.codeDepot, societe: m.societe.libelle }))}
        vehicules={vehicules.map((v) => ({
          matricule: v.matricule,
          codeMagasin: v.codeMagasin,
          codeDepot: v.codeDepot,
          societe: v.magasin.societe.libelle,
          chauffeurHabituel: v.chauffeurHabituel ?? "",
          description: v.description ?? "",
          isActif: v.isActif,
        }))}
      />
    </div>
  );
}

import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constantes";
import { GestionVehicules } from "./composants";

export default async function PageVehicules() {
  await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  const [depots, magasins, vehicules] = await Promise.all([
    prisma.depot.findMany({ where: { isActif: true }, orderBy: { libelle: "asc" } }),
    prisma.magasin.findMany({ where: { isActif: true }, include: { societe: true }, orderBy: [{ codeDepot: "asc" }, { libelle: "asc" }] }),
    prisma.vehicule.findMany({ include: { magasin: { include: { societe: true } } }, orderBy: [{ codeDepot: "asc" }, { codeMagasin: "asc" }, { matricule: "asc" }] }),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Véhicules</h1>
        <p className="note">Chaque véhicule est rattaché à une agence (magasin), donc à un dépôt et à une société. Les agents d&apos;un dépôt choisissent les véhicules traités dans cette liste.</p>
      </div>
      <GestionVehicules
        depots={depots.map((d) => ({ code: d.code, libelle: d.libelle }))}
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

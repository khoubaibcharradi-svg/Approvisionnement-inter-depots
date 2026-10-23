import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constantes";
import { GestionMagasins } from "./composants";

export default async function PageMagasins() {
  await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  const [depots, societes, magasins] = await Promise.all([
    prisma.depot.findMany({ where: { isActif: true }, orderBy: { libelle: "asc" } }),
    prisma.societe.findMany({ orderBy: { ordre: "asc" } }),
    prisma.magasin.findMany({ orderBy: [{ codeDepot: "asc" }, { libelle: "asc" }] }),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="titre-page">Magasins des dépôts</h1>
        <p className="note">Chaque magasin appartient à un dépôt et à une société. Les magasins actifs d&apos;un dépôt forment les lignes « situation du stock » de son compte rendu journalier.</p>
      </div>
      <GestionMagasins
        depots={depots.map((d) => ({ code: d.code, libelle: d.libelle }))}
        societes={societes.map((s) => ({ code: s.code, libelle: s.libelle, isActif: s.isActif }))}
        magasins={magasins.map((m) => ({ code: m.code, libelle: m.libelle, codeDepot: m.codeDepot, codeSociete: m.codeSociete, isActif: m.isActif }))}
      />
    </div>
  );
}

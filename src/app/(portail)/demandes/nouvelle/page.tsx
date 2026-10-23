import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constantes";
import { FormulaireDemande } from "./formulaire";

export default async function PageNouvelleDemande() {
  const u = await exigerUtilisateur([ROLES.SUPERVISEUR]);
  const [canaux, depots, articles] = await Promise.all([
    prisma.canal.findMany({ where: { code: { in: u.canaux }, isActif: true }, orderBy: { ordre: "asc" } }),
    prisma.depot.findMany(),
    // Le superviseur ne voit ni le stock ni le quota : seules les colonnes de référence sont chargées.
    prisma.article.findMany({
      where: { isActif: true },
      select: { codeArticle: true, designation: true, famille: { select: { libelle: true } } },
      orderBy: { designation: "asc" },
    }),
  ]);
  const libelleDepot = new Map(depots.map((d) => [d.code, d.libelle]));
  return (
    <div className="flex flex-col gap-4">
      <h1 className="titre-page">Nouvelle demande d&apos;approvisionnement</h1>
      {canaux.length === 0 ? (
        <p className="alerte-erreur">Aucun canal ne vous est affecté : contactez l&apos;administrateur.</p>
      ) : (
        <FormulaireDemande
          canaux={canaux.map((c) => ({ code: c.code, libelle: c.libelle, depot: libelleDepot.get(u.depotParCanal[c.code] ?? "") ?? null }))}
          articles={articles.map((a) => ({ code: a.codeArticle, designation: a.designation, famille: a.famille.libelle }))}
        />
      )}
    </div>
  );
}

import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma, Prisma } from "@/lib/prisma";
import { ROLES, ROLES_VOIENT_STOCK, estAdministrateur } from "@/lib/constantes";
import { LigneArticle, Imports } from "./composants";

const TAILLE_PAGE = 100;

export default async function PageCatalogue({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; inactifs?: string }> }) {
  const u = await exigerUtilisateur([ROLES.CHEF_VENTE, ROLES.DIRECTEUR_COMMERCIAL, ROLES.DIRECTEUR_LOGISTIQUE, ROLES.CHEF_DEPOT, ROLES.ADMINISTRATEUR]);
  const p = await searchParams;
  const q = p.q?.trim();
  const page = Math.max(1, Number(p.page) || 1);
  const where: Prisma.ArticleWhereInput = {
    ...(p.inactifs ? {} : { isActif: true }),
    ...(q ? { OR: [{ codeArticle: { contains: q } }, { designation: { contains: q } }, { famille: { libelle: { contains: q } } }] } : {}),
  };
  // Chaque société a son propre prix de revient : une colonne par société active.
  const societes = await prisma.societe.findMany({ where: { isActif: true }, orderBy: [{ ordre: "asc" }, { libelle: "asc" }], select: { code: true, libelle: true } });
  const [total, articles, sansPcb, majStock, sansPrix] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({ where, include: { famille: true, prix: { where: { isDeleted: false } } }, orderBy: [{ codeFamille: "asc" }, { designation: "asc" }], skip: (page - 1) * TAILLE_PAGE, take: TAILLE_PAGE }),
    prisma.article.count({ where: { pcb: null, isActif: true } }),
    prisma.article.findFirst({ where: { dateMajStock: { not: null } }, orderBy: { dateMajStock: "desc" }, select: { dateMajStock: true, sourceStock: true } }),
    prisma.article.count({ where: { isActif: true, OR: societes.map((s) => ({ prix: { none: { codeSociete: s.code, isDeleted: false, prixRevient: { gt: 0 } } } })) } }),
  ]);

  const voitStock = ROLES_VOIENT_STOCK.includes(u.role);
  const droits = {
    code: u.role === ROLES.DIRECTEUR_COMMERCIAL || estAdministrateur(u.role),
    logistique: u.role === ROLES.DIRECTEUR_LOGISTIQUE,
    quota: u.role === ROLES.DIRECTEUR_COMMERCIAL,
    prix: u.role === ROLES.DIRECTEUR_LOGISTIQUE || estAdministrateur(u.role),
  };
  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE));
  const lien = (n: number) => `/catalogue?${new URLSearchParams({ ...(q ? { q } : {}), ...(p.inactifs ? { inactifs: "1" } : {}), page: String(n) })}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="titre-page">Catalogue SKU ({total} articles)</h1>
        {!droits.code && <p className="note">🔒 Codes SKU en lecture seule pour votre profil.</p>}
        {voitStock && majStock?.dateMajStock && (
          <p className="note">Stock (dépôt central Radès) mis à jour le {majStock.dateMajStock.toLocaleString("fr-FR")} · source : {majStock.sourceStock}</p>
        )}
        {droits.logistique && sansPcb > 0 && <p className="alerte-erreur mt-2">PCB à renseigner pour {sansPcb} articles (1 pièce par carton en attendant).</p>}
        {voitStock && sansPrix > 0 && <p className="note text-amber-700">{sansPrix} article(s) actif(s) sans prix de revient pour au moins une société : ils sont valorisés à 0 dans les inventaires des magasins de cette société.</p>}
        {voitStock && <p className="note">Stock et quota en pièces ; rotation en cartons par mois. Le quota ne peut pas dépasser le stock.</p>}
      </div>

      <Imports catalogue={droits.code} stock={droits.logistique} prix={droits.prix} societes={societes} />

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Rechercher code, désignation, famille" className="champ min-w-72" />
        {droits.code && (
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="inactifs" value="1" defaultChecked={!!p.inactifs} /> Inclure les inactifs</label>
        )}
        <button className="btn-secondaire">Rechercher</button>
      </form>

      <div className="carte overflow-x-auto p-0">
        <table className="tableau">
          <thead>
            <tr>
              <th>Code SKU</th><th>Désignation</th><th>Famille</th><th>Pièces / carton</th>
              {voitStock && <><th>Rotation (crt/mois)</th><th>Stock (pièces)</th><th>Quota (pièces)</th>{societes.map((s) => <th key={s.code} className="text-right">Prix de revient<br />{s.libelle} (DT/pièce)</th>)}</>}
              {(droits.code || droits.logistique || droits.quota || droits.prix) && <th></th>}
            </tr>
          </thead>
          <tbody>
            {articles.map((a) => (
              <LigneArticle
                key={a.codeArticle}
                article={{
                  codeArticle: a.codeArticle,
                  designation: a.designation,
                  famille: a.famille.libelle,
                  pcb: a.pcb,
                  version: a.version,
                  isActif: a.isActif,
                  ...(voitStock ? { stockPieces: a.stockPieces, quotaPieces: a.quotaPieces, rotation: a.rotationCartons?.toNumber() ?? null, prix: Object.fromEntries(a.prix.map((x) => [x.codeSociete, x.prixRevient.toNumber()])) } : {}),
                }}
                voitStock={voitStock}
                droits={droits}
                societes={societes}
              />
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link className="btn-secondaire" href={lien(page - 1)}>Précédent</Link>}
          <span>Page {page} / {pages}</span>
          {page < pages && <Link className="btn-secondaire" href={lien(page + 1)}>Suivant</Link>}
        </div>
      )}
    </div>
  );
}

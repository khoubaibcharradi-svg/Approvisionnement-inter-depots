import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma, Prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constantes";

const TAILLE_PAGE = 100;
type Params = { login?: string; action?: string; cle?: string; du?: string; au?: string; echecs?: string; page?: string };

export default async function PageAudit({ searchParams }: { searchParams: Promise<Params> }) {
  await exigerUtilisateur([ROLES.DIRECTEUR_COMMERCIAL, ROLES.DIRECTEUR_LOGISTIQUE, ROLES.CHEF_DEPOT, ROLES.ADMINISTRATEUR]);
  const p = await searchParams;
  const page = Math.max(1, Number(p.page) || 1);
  const where: Prisma.JournalAuditWhereInput = {
    ...(p.login ? { login: { contains: p.login.trim().toLowerCase() } } : {}),
    ...(p.action ? { action: { contains: p.action.trim().toUpperCase() } } : {}),
    ...(p.cle ? { cleEntite: { contains: p.cle.trim() } } : {}),
    ...(p.echecs ? { succes: false } : {}),
    ...(p.du || p.au
      ? { horodatage: { ...(p.du ? { gte: new Date(`${p.du}T00:00:00`) } : {}), ...(p.au ? { lte: new Date(`${p.au}T23:59:59.999`) } : {}) } }
      : {}),
  };
  const [total, lignes] = await Promise.all([
    prisma.journalAudit.count({ where }),
    prisma.journalAudit.findMany({ where, orderBy: { horodatage: "desc" }, skip: (page - 1) * TAILLE_PAGE, take: TAILLE_PAGE }),
  ]);
  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE));
  const lien = (n: number) => `/audit?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(p).filter(([k, v]) => v && k !== "page")) as Record<string, string>), page: String(n) })}`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="titre-page">Journal d&apos;audit ({total} événements)</h1>
      <form className="carte flex flex-wrap items-end gap-2">
        <label className="etiquette">Utilisateur<input name="login" defaultValue={p.login} className="champ" /></label>
        <label className="etiquette">Action<input name="action" defaultValue={p.action} className="champ" placeholder="CONNEXION, DEMANDE…" /></label>
        <label className="etiquette">Clé (n° demande, SKU…)<input name="cle" defaultValue={p.cle} className="champ" /></label>
        <label className="etiquette">Du<input type="date" name="du" defaultValue={p.du} className="champ" /></label>
        <label className="etiquette">Au<input type="date" name="au" defaultValue={p.au} className="champ" /></label>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="echecs" value="1" defaultChecked={!!p.echecs} /> Échecs et refus seulement</label>
        <button className="btn-secondaire">Filtrer</button>
      </form>
      <div className="carte overflow-x-auto p-0">
        <table className="tableau">
          <thead><tr><th>Heure</th><th>Utilisateur</th><th>Action</th><th>Objet</th><th>Détail</th><th>Avant → après</th><th>IP</th></tr></thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.reference} className={l.succes ? "" : "bg-red-50"}>
                <td className="whitespace-nowrap">{l.horodatage.toLocaleString("fr-FR")}</td>
                <td>{l.login ?? "—"}<div className="note text-xs">{l.codeRole}</div></td>
                <td className="font-mono text-xs">{l.action}</td>
                <td>{l.entite} {l.cleEntite}</td>
                <td className="max-w-md">{l.detail}</td>
                <td className="max-w-md">
                  {(l.avant !== null || l.apres !== null) && (
                    <details><summary className="cursor-pointer text-xs text-marque">voir</summary>
                      <pre className="whitespace-pre-wrap text-xs">{JSON.stringify({ avant: l.avant, apres: l.apres }, null, 1)}</pre>
                    </details>
                  )}
                </td>
                <td className="text-xs">{l.adresseIp}</td>
              </tr>
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

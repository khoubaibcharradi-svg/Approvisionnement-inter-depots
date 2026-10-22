import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma, Prisma } from "@/lib/prisma";
import { LIBELLES_STATUTS, ROLES } from "@/lib/constantes";
import { enPieces } from "@/lib/workflow";

type Params = { canal?: string; depot?: string; du?: string; au?: string };

function Barres({ titre, donnees }: { titre: string; donnees: [string, number][] }) {
  const max = Math.max(1, ...donnees.map((d) => d[1]));
  return (
    <div className="carte">
      <h2 className="mb-2 font-semibold">{titre}</h2>
      {donnees.length === 0 && <p className="note">Aucune donnée.</p>}
      <div className="flex flex-col gap-1">
        {donnees.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-2 text-sm">
            <span className="truncate" title={k}>{k}</span>
            <span className="h-3 rounded bg-marque/80" style={{ width: `${Math.round((100 * v) / max)}%` }} />
            <b className="tabular-nums">{v.toLocaleString("fr-FR")}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function PageStatistiques({ searchParams }: { searchParams: Promise<Params> }) {
  await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  const p = await searchParams;
  const where: Prisma.DemandeWhereInput = {
    ...(p.canal ? { codeCanal: p.canal } : {}),
    ...(p.depot ? { codeDepot: p.depot } : {}),
    ...(p.du || p.au ? { dateSaisie: { ...(p.du ? { gte: new Date(`${p.du}T00:00:00`) } : {}), ...(p.au ? { lte: new Date(`${p.au}T23:59:59.999`) } : {}) } } : {}),
  };
  const [canaux, depots, demandes] = await Promise.all([
    prisma.canal.findMany({ orderBy: { ordre: "asc" } }),
    prisma.depot.findMany({ orderBy: { libelle: "asc" } }),
    prisma.demande.findMany({
      where,
      select: {
        statut: true,
        canal: { select: { libelle: true } },
        depot: { select: { libelle: true } },
        saisiePar: { select: { nomComplet: true } },
        lignes: {
          where: { isDeleted: false },
          select: { codeArticle: true, quantite: true, quantiteInitiale: true, unite: true, decisionDepot: true, article: { select: { pcb: true, designation: true, famille: { select: { libelle: true } } } } },
        },
      },
    }),
  ]);

  const lignes = demandes.flatMap((d) => d.lignes.map((l) => ({ ...l, d })));
  const pieces = (q: number, l: (typeof lignes)[number]) => enPieces(q, l.unite, l.article.pcb);
  const retenue = (l: (typeof lignes)[number]) => (l.decisionDepot === "REFUS" ? 0 : l.quantite);
  const demandees = lignes.reduce((s, l) => s + pieces(l.quantiteInitiale, l), 0);
  const retenues = lignes.reduce((s, l) => s + pieces(retenue(l), l), 0);
  const ecart = lignes.reduce((s, l) => s + Math.abs(pieces(retenue(l), l) - pieces(l.quantiteInitiale, l)), 0);
  const nb = (st: string) => demandes.filter((d) => d.statut === st).length;
  const pct = (n: number, t: number) => (t ? `${Math.round((100 * n) / t)} %` : "—");
  const grouper = <T,>(xs: T[], cle: (x: T) => string, val: (x: T) => number) =>
    Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[cle(x)] = (m[cle(x)] ?? 0) + val(x)), m), {})).sort((a, b) => b[1] - a[1]);

  const kpis: [string, string | number][] = [
    ["Demandes", demandes.length],
    ["Pièces demandées", demandees.toLocaleString("fr-FR")],
    ["Pièces après arbitrage", retenues.toLocaleString("fr-FR")],
    ["Taux d'écart", pct(ecart, demandees)],
    ["Taux de rejet", pct(nb("REJETEE"), demandes.length)],
    ["Expédiées", pct(nb("EXPEDIEE"), demandes.length)],
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Statistiques</h1>
      <form className="carte flex flex-wrap items-end gap-2">
        <label className="etiquette">Canal
          <select name="canal" defaultValue={p.canal} className="champ"><option value="">Tous</option>{canaux.map((c) => <option key={c.code} value={c.code}>{c.libelle}</option>)}</select>
        </label>
        <label className="etiquette">Dépôt
          <select name="depot" defaultValue={p.depot} className="champ"><option value="">Tous</option>{depots.map((d) => <option key={d.code} value={d.code}>{d.libelle}</option>)}</select>
        </label>
        <label className="etiquette">Du<input type="date" name="du" defaultValue={p.du} className="champ" /></label>
        <label className="etiquette">Au<input type="date" name="au" defaultValue={p.au} className="champ" /></label>
        <button className="btn-secondaire">Filtrer</button>
      </form>
      <p className="note">Période filtrée sur la date de saisie. Quantités en pièces (cartons convertis par le PCB).</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {kpis.map(([t, v]) => (
          <div key={t} className="carte text-center"><div className="text-xl font-semibold">{v}</div><div className="note">{t}</div></div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Barres titre="Demandes par statut" donnees={Object.entries(LIBELLES_STATUTS).map(([k, v]) => [v, nb(k)])} />
        <Barres titre="Quantités (pièces) par canal" donnees={grouper(lignes, (l) => l.d.canal.libelle, (l) => pieces(l.quantite, l))} />
        <Barres titre="Quantités (pièces) par dépôt" donnees={grouper(lignes, (l) => l.d.depot.libelle, (l) => pieces(l.quantite, l))} />
        <Barres titre="Quantités (pièces) par famille" donnees={grouper(lignes, (l) => l.article.famille.libelle, (l) => pieces(l.quantite, l))} />
        <Barres titre="Top 10 articles (pièces)" donnees={grouper(lignes, (l) => `${l.codeArticle} · ${l.article.designation.slice(0, 28)}`, (l) => pieces(l.quantite, l)).slice(0, 10)} />
        <Barres titre="Demandes par superviseur" donnees={grouper(demandes, (d) => d.saisiePar.nomComplet, () => 1).slice(0, 10)} />
      </div>
    </div>
  );
}

import "server-only";
import { prisma } from "../prisma";
import { ROLES } from "../constantes";
import { parametreTexte } from "../referentiels";

/**
 * Suivi des comptes rendus sur une période : qui a envoyé, qui ne l'a pas fait, retards et écarts.
 * Un compte rendu est « attendu » chaque jour pour chaque dépôt actif ayant au moins un agent actif.
 */

const enDate = (j: string) => new Date(`${j}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Date locale (fuseau du serveur) d'un horodatage, au format AAAA-MM-JJ. */
const jourLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const somme = (xs: { ecart: { toNumber(): number } }[]) => xs.reduce((a, x) => a + Math.round(x.ecart.toNumber() * 1000), 0) / 1000;

export type Cellule = { etat: "SOUMIS" | "RETARD" | "BROUILLON" | "MANQUANT" | "EN_COURS" | "NON_OUVRE" | "A_VENIR"; numero?: string; agent?: string; heure?: string };

export async function statistiquesComptesRendus(du: string, au: string, codeDepot?: string) {
  const aujourdhui = jourLocal(new Date());
  // Jours sans compte rendu attendu (paramètre CR_JOURS_NON_OUVRES, 0 = dimanche).
  const nonOuvres = new Set(((await parametreTexte("CR_JOURS_NON_OUVRES")) ?? "").split(",").map((x) => x.trim()).filter(Boolean).map(Number));
  const jours: string[] = [];
  for (let d = enDate(du); d <= enDate(au) && jours.length < 92; d = new Date(d.getTime() + 86_400_000)) jours.push(iso(d));

  const [depots, comptesRendus, inventaires] = await Promise.all([
    prisma.depot.findMany({
      where: { isActif: true, ...(codeDepot ? { code: codeDepot } : {}), agents: { some: { codeRole: ROLES.AGENT_DEPOT, isActif: true } } },
      include: { agents: { where: { codeRole: ROLES.AGENT_DEPOT, isActif: true }, select: { login: true, nomComplet: true, derniereConnexion: true } } },
      orderBy: { libelle: "asc" },
    }),
    prisma.compteRendu.findMany({
      where: { dateJournee: { gte: enDate(du), lte: enDate(au) }, ...(codeDepot ? { codeDepot } : {}) },
      include: {
        agent: { select: { nomComplet: true } },
        stocks: { where: { isDeleted: false }, select: { ecart: true } },
        recettes: { where: { isDeleted: false }, select: { ecart: true } },
        caisses: { where: { isDeleted: false }, select: { ecart: true } },
      },
    }),
    prisma.inventaire.groupBy({
      by: ["statut"],
      where: { dateJournee: { gte: enDate(du), lte: enDate(au) }, ...(codeDepot ? { codeDepot } : {}) },
      _count: { _all: true },
      _sum: { nbReouvertures: true },
    }),
  ]);

  const parCle = new Map(comptesRendus.map((c) => [`${c.codeDepot}|${iso(c.dateJournee)}`, c]));
  const heure = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  // Matrice dépôts × jours
  const matrice = depots.map((d) => ({
    code: d.code,
    libelle: d.libelle,
    agents: d.agents,
    cellules: jours.map((j): Cellule => {
      const c = parCle.get(`${d.code}|${j}`);
      if (!c) {
        if (j > aujourdhui) return { etat: "A_VENIR" };
        if (nonOuvres.has(new Date(`${j}T12:00:00Z`).getUTCDay())) return { etat: "NON_OUVRE" };
        return { etat: j === aujourdhui ? "EN_COURS" : "MANQUANT" };
      }
      if (c.statut === "SOUMIS") {
        const enRetard = !!c.dateSoumission && jourLocal(c.dateSoumission) > j;
        return { etat: enRetard ? "RETARD" : "SOUMIS", numero: c.numero, agent: c.agent.nomComplet, heure: c.dateSoumission ? heure(c.dateSoumission) : undefined };
      }
      return { etat: "BROUILLON", numero: c.numero, agent: c.agent.nomComplet };
    }),
  }));

  const cellules = matrice.flatMap((m) => m.cellules).filter((c) => c.etat !== "A_VENIR" && c.etat !== "NON_OUVRE");
  const compte = (e: Cellule["etat"]) => cellules.filter((c) => c.etat === e).length;
  const soumis = comptesRendus.filter((c) => c.statut === "SOUMIS" && c.dateSoumission);
  const memeJour = soumis.filter((c) => jourLocal(c.dateSoumission!) === iso(c.dateJournee));
  const minutes = memeJour.map((c) => c.dateSoumission!.getHours() * 60 + c.dateSoumission!.getMinutes());
  const heureMoyenne = minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null;

  // Aujourd'hui, par dépôt
  const jourCourant = jours.includes(aujourdhui) ? aujourdhui : null;
  const aujourdhuiParDepot = jourCourant ? matrice.map((m) => ({ code: m.code, libelle: m.libelle, agents: m.agents, cellule: m.cellules[jours.indexOf(jourCourant)] })) : [];

  // Par agent
  const agents = new Map<string, { nom: string; depot: string; soumis: number; retard: number; brouillons: number }>();
  for (const c of comptesRendus) {
    const a = agents.get(c.loginAgent) ?? { nom: c.agent.nomComplet, depot: depots.find((d) => d.code === c.codeDepot)?.libelle ?? c.codeDepot, soumis: 0, retard: 0, brouillons: 0 };
    if (c.statut === "SOUMIS") {
      a.soumis++;
      if (c.dateSoumission && jourLocal(c.dateSoumission) > iso(c.dateJournee)) a.retard++;
    } else a.brouillons++;
    agents.set(c.loginAgent, a);
  }

  // Écarts par dépôt (comptes rendus envoyés)
  const ecarts = depots.map((d) => {
    const crs = soumis.filter((c) => c.codeDepot === d.code);
    const stock = crs.reduce((t, c) => t + somme(c.stocks), 0);
    const recettes = crs.reduce((t, c) => t + somme(c.recettes), 0);
    const caisse = crs.reduce((t, c) => t + somme(c.caisses), 0);
    const avecEcart = crs.filter((c) => somme(c.stocks) !== 0 || somme(c.recettes) !== 0 || somme(c.caisses) !== 0).length;
    return { code: d.code, libelle: d.libelle, envoyes: crs.length, stock, recettes, caisse, avecEcart };
  });

  const inv = (s: string) => inventaires.find((i) => i.statut === s);
  return {
    jours,
    aujourdhui,
    matrice,
    indicateurs: {
      attendus: cellules.length,
      soumis: compte("SOUMIS") + compte("RETARD"),
      aTemps: compte("SOUMIS"),
      enRetard: compte("RETARD"),
      brouillons: compte("BROUILLON"),
      manquants: compte("MANQUANT") + compte("EN_COURS"),
      heureMoyenne: heureMoyenne === null ? null : `${String(Math.floor(heureMoyenne / 60)).padStart(2, "0")}:${String(heureMoyenne % 60).padStart(2, "0")}`,
    },
    aujourdhuiParDepot,
    agents: [...agents.values()].sort((a, b) => b.soumis - a.soumis || a.nom.localeCompare(b.nom)),
    ecarts,
    inventaires: {
      clotures: inv("CLOTURE")?._count._all ?? 0,
      enCours: inv("EN_COURS")?._count._all ?? 0,
      reouvertures: inventaires.reduce((t, i) => t + (i._sum.nbReouvertures ?? 0), 0),
    },
  };
}

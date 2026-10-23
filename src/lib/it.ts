import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "./prisma";
import { listerSauvegardes } from "./sauvegarde";
import { cheminJournal, listerJournaux } from "./journal";
import { dossierPieces } from "./compte-rendu/service";

/** Indicateurs d'exploitation pour le tableau de bord IT (rôle ADMIN_FULL). */

const n = (v: unknown) => Number(v ?? 0);
const jour = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Taille d'un dossier (récursif, plafonné pour rester rapide). */
function tailleDossier(dir: string, plafond = 20_000) {
  let octets = 0;
  let fichiers = 0;
  const pile = [dir];
  while (pile.length && fichiers < plafond) {
    const d = pile.pop()!;
    if (!fs.existsSync(d)) continue;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) pile.push(p);
      else if (e.isFile()) {
        octets += fs.statSync(p).size;
        fichiers++;
      }
    }
  }
  return { octets, fichiers };
}

export function etatServeur() {
  const disque = fs.statfsSync(process.cwd());
  const versionNext = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules/next/package.json"), "utf8")).version as string;
    } catch {
      return "?";
    }
  })();
  return {
    hote: os.hostname(),
    systeme: `${os.type()} ${os.release()}`,
    processeurs: os.cpus().length,
    charge: os.loadavg(),
    memoire: { totale: os.totalmem(), libre: os.freemem() },
    disque: { total: disque.blocks * disque.bsize, libre: disque.bavail * disque.bsize },
    demarrageServeur: os.uptime(),
    demarrageApplication: process.uptime(),
    memoireApplication: process.memoryUsage().rss,
    node: process.version,
    next: versionNext,
    environnement: process.env.NODE_ENV ?? "?",
    fuseau: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export async function etatBase() {
  const [[version], [taille], tables, [connexions], [demarrage], migrations] = await Promise.all([
    prisma.$queryRaw<{ v: string }[]>`SELECT VERSION() AS v`,
    prisma.$queryRaw<{ o: bigint }[]>`SELECT COALESCE(SUM(data_length + index_length), 0) AS o FROM information_schema.TABLES WHERE table_schema = DATABASE()`,
    prisma.$queryRaw<{ nom: string; lignes: bigint; o: bigint }[]>`
      SELECT TABLE_NAME AS nom, TABLE_ROWS AS lignes, (data_length + index_length) AS o
      FROM information_schema.TABLES WHERE table_schema = DATABASE() ORDER BY o DESC LIMIT 8`,
    prisma.$queryRaw<{ Value: string }[]>`SHOW STATUS LIKE 'Threads_connected'`,
    prisma.$queryRaw<{ Value: string }[]>`SHOW STATUS LIKE 'Uptime'`,
    prisma.$queryRaw<{ nom: string; fin: Date | null }[]>`SELECT migration_name AS nom, finished_at AS fin FROM _prisma_migrations ORDER BY finished_at DESC`,
  ]);
  return {
    version: version.v,
    octets: n(taille.o),
    tables: tables.map((t) => ({ nom: t.nom, lignes: n(t.lignes), octets: n(t.o) })),
    connexions: n(connexions?.Value),
    demarrage: n(demarrage?.Value),
    migrations: { nombre: migrations.length, derniere: migrations[0] ?? null, enEchec: migrations.filter((m) => !m.fin).length },
  };
}

export function etatSauvegardes() {
  const liste = listerSauvegardes().filter((s) => s.fichier.endsWith(".sql.txt"));
  const derniere = liste[0] ?? null;
  return {
    nombre: liste.length,
    octets: liste.reduce((t, s) => t + s.octets, 0),
    derniere: derniere ? { ...derniere, ageHeures: (Date.now() - derniere.date.getTime()) / 3_600_000 } : null,
    heure: process.env.BACKUP_HEURE || "02:00",
    automatique: process.env.BACKUP_AUTO !== "false",
    retentionJours: Number(process.env.BACKUP_RETENTION_JOURS || 90),
    dernieres: liste.slice(0, 7),
  };
}

export function etatJournaux() {
  const fichiers = listerJournaux();
  const lire = (nom: string) => {
    const c = cheminJournal(nom);
    return c ? fs.readFileSync(c, "utf8").split("\n").filter(Boolean) : [];
  };
  const erreursDuJour = lire(`erreurs-${jour()}.log`);
  const hier = new Date(Date.now() - 86_400_000);
  const erreursHier = lire(`erreurs-${jour(hier)}.log`);
  const dernieres = [...erreursHier, ...erreursDuJour]
    .slice(-8)
    .reverse()
    .map((l) => {
      try {
        const o = JSON.parse(l) as { horodatage?: string; message?: string; erreur?: { message?: string } };
        return { date: o.horodatage ?? "", message: [o.message, o.erreur?.message].filter(Boolean).join(" · ") };
      } catch {
        return { date: "", message: l.slice(0, 200) };
      }
    });
  return {
    fichiers: fichiers.length,
    octets: fichiers.reduce((t, f) => t + f.octets, 0),
    erreursAujourdhui: erreursDuJour.length,
    erreursHier: erreursHier.length,
    dernieresErreurs: dernieres,
    retentionJours: Number(process.env.LOG_RETENTION_JOURS || 1825),
  };
}

export async function activite() {
  const depuis = new Date(Date.now() - 86_400_000);
  const parAction = await prisma.journalAudit.groupBy({ by: ["action"], where: { horodatage: { gte: depuis } }, _count: { _all: true } });
  const nb = (a: string) => parAction.find((x) => x.action === a)?._count._all ?? 0;
  const [actifs, connectes24h, verrouilles, mdpAChanger, ipsEchecs] = await Promise.all([
    prisma.utilisateur.count({ where: { isActif: true } }),
    prisma.utilisateur.count({ where: { derniereConnexion: { gte: depuis } } }),
    prisma.utilisateur.findMany({ where: { verrouilleJusqua: { gt: new Date() } }, select: { login: true, verrouilleJusqua: true } }),
    prisma.utilisateur.count({ where: { isActif: true, doitChangerMotDePasse: true } }),
    prisma.journalAudit.groupBy({ by: ["adresseIp"], where: { horodatage: { gte: depuis }, action: "CONNEXION_ECHEC" }, _count: { _all: true }, orderBy: { _count: { adresseIp: "desc" } }, take: 5 }),
  ]);
  return {
    connexions: nb("CONNEXION"),
    echecs: nb("CONNEXION_ECHEC"),
    verrouillages: nb("COMPTE_VERROUILLE"),
    accesRefuses: nb("ACCES_PAGE_REFUSE"),
    evenements: parAction.reduce((t, x) => t + x._count._all, 0),
    utilisateursActifs: actifs,
    connectes24h,
    verrouilles,
    mdpAChanger,
    ipsEchecs: ipsEchecs.map((x) => ({ ip: x.adresseIp ?? "inconnue", nombre: x._count._all })),
    pieces: tailleDossier(dossierPieces()),
  };
}

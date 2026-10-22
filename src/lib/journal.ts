import fs from "node:fs";
import path from "node:path";

/**
 * Journal applicatif fichier : une ligne JSON par événement, un fichier par jour
 * (logs/app-AAAA-MM-JJ.log). Les erreurs sont aussi copiées dans logs/erreurs-AAAA-MM-JJ.log.
 * Ce journal technique complète le journal d'audit en base (table journal_audit).
 */

type Niveau = "debug" | "info" | "warn" | "error";
const POIDS: Record<Niveau, number> = { debug: 10, info: 20, warn: 30, error: 40 };

type Etat = { jour: string; app?: fs.WriteStream; erreurs?: fs.WriteStream };
const g = globalThis as unknown as { __journal?: Etat };

function dossier() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.LOG_DIR || "logs");
}

function jourCourant(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function flux(): Etat {
  const jour = jourCourant();
  const etat = g.__journal;
  if (etat && etat.jour === jour && etat.app) return etat;
  etat?.app?.end();
  etat?.erreurs?.end();
  fs.mkdirSync(dossier(), { recursive: true });
  const ouvrir = (nom: string) => fs.createWriteStream(path.join(dossier(), `${nom}-${jour}.log`), { flags: "a" });
  g.__journal = { jour, app: ouvrir("app"), erreurs: ouvrir("erreurs") };
  return g.__journal;
}

function serialiserErreur(v: unknown) {
  return v instanceof Error ? { nom: v.name, message: v.message, pile: v.stack } : v;
}

function ecrire(niveau: Niveau, message: string, contexte?: Record<string, unknown>) {
  const seuil = POIDS[(process.env.LOG_NIVEAU as Niveau) || "info"] ?? POIDS.info;
  if (POIDS[niveau] < seuil) return;
  const ctx = contexte
    ? Object.fromEntries(Object.entries(contexte).map(([k, v]) => [k, serialiserErreur(v)]))
    : undefined;
  const ligne = JSON.stringify({ horodatage: new Date().toISOString(), niveau, message, ...ctx }) + "\n";
  try {
    const f = flux();
    f.app!.write(ligne);
    if (niveau === "error") f.erreurs!.write(ligne);
  } catch (e) {
    // Le journal ne doit jamais faire échouer une requête : repli sur la sortie standard.
    console.error("Écriture du journal impossible", e);
  }
  if (niveau === "error") console.error(ligne.trim());
  else if (process.env.NODE_ENV !== "production") console.log(ligne.trim());
}

export const journal = {
  debug: (m: string, c?: Record<string, unknown>) => ecrire("debug", m, c),
  info: (m: string, c?: Record<string, unknown>) => ecrire("info", m, c),
  warn: (m: string, c?: Record<string, unknown>) => ecrire("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => ecrire("error", m, c),
};

/** Supprime les fichiers de journal plus anciens que LOG_RETENTION_JOURS (5 ans par défaut). */
export function purgerJournaux() {
  const jours = Number(process.env.LOG_RETENTION_JOURS || 1825);
  const limite = Date.now() - jours * 86_400_000;
  if (!fs.existsSync(dossier())) return 0;
  let n = 0;
  for (const f of fs.readdirSync(dossier())) {
    if (!f.endsWith(".log")) continue;
    const p = path.join(dossier(), f);
    if (fs.statSync(p).mtimeMs < limite) {
      fs.unlinkSync(p);
      n++;
    }
  }
  if (n) journal.info("Purge des journaux", { fichiersSupprimes: n, retentionJours: jours });
  return n;
}

const NOM_JOURNAL = /^(app|erreurs)-\d{4}-\d{2}-\d{2}\.log$/;

export function listerJournaux() {
  if (!fs.existsSync(dossier())) return [];
  return fs
    .readdirSync(dossier())
    .filter((f) => NOM_JOURNAL.test(f))
    .map((f) => ({ fichier: f, octets: fs.statSync(path.join(dossier(), f)).size }))
    .sort((a, b) => b.fichier.localeCompare(a.fichier));
}

/** Chemin d'un fichier de journal à partir de son nom, en refusant tout autre nom (pas de traversée de répertoire). */
export function cheminJournal(fichier: string) {
  if (!NOM_JOURNAL.test(fichier)) return null;
  const p = path.join(dossier(), fichier);
  return fs.existsSync(p) ? p : null;
}

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma, Prisma } from "./prisma";
import { journal } from "./journal";

/**
 * Sauvegarde de la base au format texte : un fichier .sql.txt lisible, composé d'instructions
 * INSERT (une par ligne) rejouables avec `npm run db:restore -- <fichier>` ou le client mysql.
 * Une empreinte SHA-256 est écrite à côté (.sha256) pour contrôler l'intégrité avant restauration.
 */

const TAILLE_LOT = 2000;
const NOM_VALIDE = /^sauvegarde-\d{8}-\d{6}\.sql\.txt$/;

export const dossierSauvegardes = () => path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.BACKUP_DIR || "backups");

function horodatageFichier(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function echapperChaine(s: string) {
  return (
    "'" +
    s.replace(/[\0\n\r\b\t\\'"\x1a]/g, (c) => {
      switch (c) {
        case "\0":
          return "\\0";
        case "\n":
          return "\\n";
        case "\r":
          return "\\r";
        case "\b":
          return "\\b";
        case "\t":
          return "\\t";
        case "\x1a":
          return "\\Z";
        default:
          return "\\" + c;
      }
    }) +
    "'"
  );
}

/** Valeur SQL littérale. Les dates sont écrites en UTC, comme Prisma les stocke. */
export function valeurSql(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return echapperChaine(v.toISOString().replace("T", " ").replace("Z", ""));
  if (v instanceof Prisma.Decimal) return v.toString();
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return "X'" + Buffer.from(v).toString("hex") + "'";
  if (typeof v === "object") return echapperChaine(JSON.stringify(v));
  return echapperChaine(String(v));
}

async function tables() {
  const lignes = await prisma.$queryRaw<{ nom: string }[]>`
    SELECT TABLE_NAME AS nom FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> '_prisma_migrations'
    ORDER BY TABLE_NAME`;
  return lignes.map((l) => l.nom);
}

async function colonnes(table: string) {
  const c = await prisma.$queryRaw<{ nom: string; cle: string }[]>`
    SELECT COLUMN_NAME AS nom, COLUMN_KEY AS cle FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} ORDER BY ORDINAL_POSITION`;
  return { toutes: c.map((x) => x.nom), cle: c.filter((x) => x.cle === "PRI").map((x) => x.nom) };
}

const ident = (s: string) => "`" + s.replace(/`/g, "``") + "`";

export type ResultatSauvegarde = { fichier: string; chemin: string; octets: number; lignes: Record<string, number>; sha256: string };

export async function sauvegarderBase(declencheur: string): Promise<ResultatSauvegarde> {
  const debut = Date.now();
  fs.mkdirSync(dossierSauvegardes(), { recursive: true });
  const fichier = `sauvegarde-${horodatageFichier()}.sql.txt`;
  const chemin = path.join(dossierSauvegardes(), fichier);
  const temporaire = chemin + ".partiel";
  const sortie = fs.createWriteStream(temporaire, { encoding: "utf8" });
  const hash = crypto.createHash("sha256");
  const ecrire = (s: string) =>
    new Promise<void>((ok) => {
      hash.update(s);
      if (sortie.write(s)) ok();
      else sortie.once("drain", ok);
    });

  const compte: Record<string, number> = {};
  try {
    const [{ base }] = await prisma.$queryRaw<{ base: string }[]>`SELECT DATABASE() AS base`;
    await ecrire(
      `-- Sauvegarde texte — Portail d'approvisionnement inter-dépôts\n` +
        `-- Base : ${base} · Date : ${new Date().toISOString()} · Déclencheur : ${declencheur}\n` +
        `-- Restauration : npm run db:restore -- ${fichier}\n` +
        `SET NAMES utf8mb4;\nSET time_zone = '+00:00';\nSET FOREIGN_KEY_CHECKS = 0;\n`,
    );
    for (const table of await tables()) {
      const { toutes, cle } = await colonnes(table);
      const ordre = (cle.length ? cle : toutes).map(ident).join(", ");
      const listeColonnes = toutes.map(ident).join(", ");
      await ecrire(`\n-- Table ${table}\nDELETE FROM ${ident(table)};\n`);
      compte[table] = 0;
      for (let decalage = 0; ; decalage += TAILLE_LOT) {
        const lot = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT ${listeColonnes} FROM ${ident(table)} ORDER BY ${ordre} LIMIT ${TAILLE_LOT} OFFSET ${decalage}`,
        );
        for (const ligne of lot) {
          await ecrire(
            `INSERT INTO ${ident(table)} (${listeColonnes}) VALUES (${toutes.map((c) => valeurSql(ligne[c])).join(", ")});\n`,
          );
        }
        compte[table] += lot.length;
        if (lot.length < TAILLE_LOT) break;
      }
    }
    await ecrire(`\nSET FOREIGN_KEY_CHECKS = 1;\n-- FIN DE SAUVEGARDE ${JSON.stringify(compte)}\n`);
    await new Promise<void>((ok, ko) => sortie.end((e?: Error | null) => (e ? ko(e) : ok())));
    fs.renameSync(temporaire, chemin);
    const sha256 = hash.digest("hex");
    fs.writeFileSync(chemin.replace(/\.sql\.txt$/, ".sha256"), `${sha256}  ${fichier}\n`);
    const octets = fs.statSync(chemin).size;
    journal.info("Sauvegarde de la base terminée", { fichier, octets, lignes: compte, dureeMs: Date.now() - debut, declencheur });
    return { fichier, chemin, octets, lignes: compte, sha256 };
  } catch (e) {
    sortie.destroy();
    fs.rmSync(temporaire, { force: true });
    journal.error("Échec de la sauvegarde de la base", { erreur: e, declencheur });
    throw e;
  }
}

export function listerSauvegardes() {
  const dir = dossierSauvegardes();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => NOM_VALIDE.test(f))
    .map((f) => {
      const s = fs.statSync(path.join(dir, f));
      return { fichier: f, octets: s.size, date: s.mtime };
    })
    .sort((a, b) => b.fichier.localeCompare(a.fichier));
}

/** Chemin d'une sauvegarde à partir de son nom, en refusant tout ce qui n'est pas un nom de sauvegarde. */
export function cheminSauvegarde(fichier: string) {
  if (!NOM_VALIDE.test(fichier)) return null;
  const p = path.join(dossierSauvegardes(), fichier);
  return fs.existsSync(p) ? p : null;
}

export function purgerSauvegardes() {
  const jours = Number(process.env.BACKUP_RETENTION_JOURS || 90);
  const limite = Date.now() - jours * 86_400_000;
  let n = 0;
  for (const s of listerSauvegardes()) {
    if (s.date.getTime() < limite) {
      fs.rmSync(path.join(dossierSauvegardes(), s.fichier), { force: true });
      fs.rmSync(path.join(dossierSauvegardes(), s.fichier.replace(/\.sql\.txt$/, ".sha256")), { force: true });
      n++;
    }
  }
  if (n) journal.info("Purge des sauvegardes", { fichiersSupprimes: n, retentionJours: jours });
  return n;
}

/** Vérifie l'empreinte SHA-256 puis rejoue les instructions dans une transaction. */
export async function restaurerBase(chemin: string) {
  const contenu = fs.readFileSync(chemin, "utf8");
  const empreinte = chemin.replace(/\.sql\.txt$/, ".sha256");
  if (fs.existsSync(empreinte)) {
    const attendu = fs.readFileSync(empreinte, "utf8").split(/\s+/)[0];
    const obtenu = crypto.createHash("sha256").update(contenu).digest("hex");
    if (attendu !== obtenu) throw new Error("Empreinte SHA-256 invalide : fichier de sauvegarde altéré");
  }
  if (!contenu.includes("-- FIN DE SAUVEGARDE")) throw new Error("Sauvegarde incomplète (marqueur de fin absent)");
  const instructions = contenu.split("\n").filter((l) => l.trim() && !l.startsWith("--"));
  await prisma.$transaction(
    async (tx) => {
      for (const i of instructions) await tx.$executeRawUnsafe(i);
    },
    { timeout: 30 * 60_000, maxWait: 60_000 },
  );
  journal.warn("Base restaurée depuis une sauvegarde", { fichier: path.basename(chemin), instructions: instructions.length });
  return instructions.length;
}

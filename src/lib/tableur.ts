import ExcelJS from "exceljs";
import { contenuConforme } from "./fichiers";

/** Lecture d'un fichier .xlsx ou .csv (séparateur ; ou ,) en tableau de lignes de cellules texte. */

export type Ligne = string[];

function texteCellule(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return texteCellule(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    return "";
  }
  return String(v);
}

export async function lireFeuilleXlsx(contenu: ArrayBuffer | Buffer, nomFeuille?: string): Promise<Ligne[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(contenu as ArrayBuffer);
  const ws = nomFeuille ? wb.getWorksheet(nomFeuille) : wb.worksheets[0];
  if (!ws) throw new Error(`Feuille introuvable : ${nomFeuille ?? "(première)"}`);
  const lignes: Ligne[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const valeurs = (row.values as ExcelJS.CellValue[]).slice(1);
    lignes.push(valeurs.map((v) => texteCellule(v).trim()));
  });
  return lignes;
}

export function lireCsv(texte: string): Ligne[] {
  const contenu = texte.replace(/^﻿/, "");
  const premiere = contenu.split(/\r?\n/, 1)[0] ?? "";
  const sep = (premiere.match(/;/g)?.length ?? 0) >= (premiere.match(/,/g)?.length ?? 0) ? ";" : ",";
  const lignes: Ligne[] = [];
  let ligne: string[] = [];
  let champ = "";
  let guillemets = false;
  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i];
    if (guillemets) {
      if (c === '"' && contenu[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === sep) {
      ligne.push(champ.trim());
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && contenu[i + 1] === "\n") i++;
      ligne.push(champ.trim());
      if (ligne.some((x) => x)) lignes.push(ligne);
      ligne = [];
      champ = "";
    } else champ += c;
  }
  ligne.push(champ.trim());
  if (ligne.some((x) => x)) lignes.push(ligne);
  return lignes;
}

export async function lireTableur(nomFichier: string, contenu: ArrayBuffer): Promise<Ligne[]> {
  const ext = nomFichier.toLowerCase().split(".").pop() ?? "";
  if ((ext === "xlsx" || ext === "csv") && !contenuConforme(ext, new Uint8Array(contenu))) {
    throw new Error("Le contenu du fichier ne correspond pas à son extension : fichier refusé.");
  }
  if (ext === "xlsx") return lireFeuilleXlsx(contenu);
  if (ext === "csv") return lireCsv(new TextDecoder("utf-8").decode(contenu));
  throw new Error("Format non pris en charge : utilisez un fichier .xlsx ou .csv");
}

/** Nombre au format français ou anglais (« 1 234,5 », « 1234.5 »). NaN si illisible. */
export function lireNombre(s: string | undefined) {
  if (s === undefined || s.trim() === "") return NaN;
  return Number(s.replace(/[\s ]/g, "").replace(",", "."));
}

/** Retire la ligne d'en-tête si sa première cellule ressemble à un libellé de colonne. */
export function sansEntete(lignes: Ligne[]) {
  return lignes.length && /code|item|ref/i.test(lignes[0][0] ?? "") ? lignes.slice(1) : lignes;
}

/** Code métier normalisé : majuscules, sans accents, espaces remplacés par _. */
export function codeMetier(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

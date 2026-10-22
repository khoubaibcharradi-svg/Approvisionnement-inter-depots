/**
 * Restauration depuis une sauvegarde texte :
 *   npm run db:restore -- sauvegarde-20261022-020000.sql.txt --confirmer
 * Une sauvegarde de l'état courant est faite automatiquement avant d'écraser les données.
 */
import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { dossierSauvegardes, restaurerBase, sauvegarderBase } from "../src/lib/sauvegarde";
import { prisma } from "../src/lib/prisma";

async function main() {
  const args = process.argv.slice(2);
  const nom = args.find((a) => !a.startsWith("--"));
  if (!nom) throw new Error("Usage : npm run db:restore -- <fichier.sql.txt> --confirmer");
  const chemin = fs.existsSync(nom) ? path.resolve(nom) : path.join(dossierSauvegardes(), nom);
  if (!fs.existsSync(chemin)) throw new Error(`Fichier introuvable : ${chemin}`);
  if (!args.includes("--confirmer")) {
    console.log(`Toutes les données actuelles seront remplacées par ${chemin}.\nRelancez avec --confirmer pour continuer.`);
    return;
  }
  const avant = await sauvegarderBase("avant restauration");
  console.log(`État courant sauvegardé dans ${avant.fichier}`);
  const n = await restaurerBase(chemin);
  console.log(`Restauration terminée : ${n} instructions rejouées.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

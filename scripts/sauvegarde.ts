/**
 * Sauvegarde manuelle ou planifiée par le cron système :
 *   npm run db:backup
 *   (cron) 0 2 * * *  cd /opt/appro && npm run db:backup >> logs/cron.log 2>&1
 */
import "dotenv/config";
import { sauvegarderBase, purgerSauvegardes } from "../src/lib/sauvegarde";
import { purgerJournaux } from "../src/lib/journal";
import { prisma } from "../src/lib/prisma";

async function main() {
  const r = await sauvegarderBase("ligne de commande");
  console.log(`Sauvegarde écrite : ${r.chemin} (${r.octets} octets, SHA-256 ${r.sha256})`);
  console.log(Object.entries(r.lignes).map(([t, n]) => `  ${t}: ${n}`).join("\n"));
  purgerSauvegardes();
  purgerJournaux();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { journal } from "./lib/journal";
import { demarrerPlanificateur } from "./lib/planificateur";

journal.info("Démarrage du serveur", { environnement: process.env.NODE_ENV, version: process.env.npm_package_version });
process.on("unhandledRejection", (e) => journal.error("Promesse rejetée non gérée", { erreur: e }));
demarrerPlanificateur();

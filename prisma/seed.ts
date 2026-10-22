/**
 * Initialisation des référentiels à partir du fichier de paramétrage du prototype
 * (SEED_FICHIER, par défaut prisma/data/parametrage.xlsx — non versionné : données internes).
 * Idempotent : relançable sans doublon (upsert sur les clés métier) et sans écraser les mots de passe existants.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { lireFeuilleXlsx, lireNombre, codeMetier } from "../src/lib/tableur";
import { hacherMotDePasse } from "../src/lib/auth/mot-de-passe";
import { LIBELLES_ROLES, PARAMETRES_DEFAUT, ROLES, type CodeRole } from "../src/lib/constantes";

const AUTEUR = "seed";
const FICHIER = path.resolve(process.env.SEED_FICHIER || path.join(__dirname, "data", "parametrage.xlsx"));

const CANAUX = [
  { code: "GMS", libelle: "GMS", alias: ["gms"] },
  { code: "GROSSISTE", libelle: "Grossiste", alias: ["gros", "grossiste", "grossistes"] },
  { code: "DEPOSITAIRE", libelle: "Dépositaire", alias: ["depositaire", "depositaires"] },
  { code: "VENTE_DIRECTE", libelle: "Vente directe", alias: ["vente directe"] },
];

const ROLES_PAR_FONCTION: Record<string, CodeRole> = {
  "directeur general adjoint": ROLES.ADMINISTRATEUR,
  "directeur logistique": ROLES.DIRECTEUR_LOGISTIQUE,
  "chef depot central": ROLES.CHEF_DEPOT,
  "directeur commercial": ROLES.DIRECTEUR_COMMERCIAL,
  "chef vente": ROLES.CHEF_VENTE,
  superviseur: ROLES.SUPERVISEUR,
};

const normaliser = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const loginDe = (nom: string) => normaliser(nom).replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
const LIBELLES_DEPOTS: Record<string, string> = { RADES: "Radès" };

async function main() {
  if (!fs.existsSync(FICHIER)) throw new Error(`Fichier de paramétrage introuvable : ${FICHIER} (voir SEED_FICHIER)`);
  const contenu = fs.readFileSync(FICHIER);
  const feuille = (nom: string) => lireFeuilleXlsx(contenu, nom).then((l) => l.slice(1));
  const motDePasseInitial = process.env.SEED_MOT_DE_PASSE_INITIAL;
  if (!motDePasseInitial) throw new Error("SEED_MOT_DE_PASSE_INITIAL doit être défini dans .env");
  const hashInitial = await hacherMotDePasse(motDePasseInitial);

  // Paramètres
  for (const [cle, p] of Object.entries(PARAMETRES_DEFAUT)) {
    await prisma.parametre.upsert({ where: { cle }, create: { cle, ...p, creePar: AUTEUR }, update: {} });
  }

  // Rôles et canaux
  let ordre = 0;
  for (const [code, libelle] of Object.entries(LIBELLES_ROLES)) {
    await prisma.role.upsert({
      where: { code },
      create: { code, libelle, ordre: ++ordre, creePar: AUTEUR },
      update: { libelle, ordre, modifiePar: AUTEUR },
    });
  }
  for (const [i, c] of CANAUX.entries()) {
    await prisma.canal.upsert({
      where: { code: c.code },
      create: { code: c.code, libelle: c.libelle, ordre: i + 1, creePar: AUTEUR },
      update: { libelle: c.libelle, modifiePar: AUTEUR },
    });
  }

  // Dépôts (la feuille n'a pas d'en-tête)
  for (const [nom, type] of await lireFeuilleXlsx(contenu, "Dépôts")) {
    if (!nom) continue;
    const code = codeMetier(nom);
    await prisma.depot.upsert({
      where: { code },
      create: { code, libelle: LIBELLES_DEPOTS[code] ?? nom, type: /central/i.test(type) ? "CENTRAL" : "REGIONAL", creePar: AUTEUR },
      update: { modifiePar: AUTEUR },
    });
  }

  // Familles (la feuille n'a pas d'en-tête)
  const familles = new Set((await lireFeuilleXlsx(contenu, "Famille")).map((l) => l[0]).filter(Boolean));

  // Articles : liste Produits, complétée par les articles vendus ou en stock absents de cette liste
  type A = { designation: string; famille: string; pcb: number | null; stockCartons: number | null; rotation: number | null };
  const articles = new Map<string, A>();
  for (const [code, designation, famille, pcb] of await feuille("Produits")) {
    if (!code || articles.has(code)) continue;
    const n = lireNombre(pcb);
    articles.set(code, { designation, famille, pcb: n > 0 ? Math.round(n) : null, stockCartons: null, rotation: null });
  }
  for (const [famille, code, designation, , rotation] of await feuille("Ventes")) {
    if (!code) continue;
    const a = articles.get(code) ?? { designation, famille, pcb: null, stockCartons: null, rotation: null };
    const r = lireNombre(rotation);
    a.rotation = Number.isFinite(r) ? r : null;
    articles.set(code, a);
  }
  for (const [famille, code, designation, stock, rotation] of await feuille("Stock")) {
    if (!code) continue;
    const a = articles.get(code) ?? { designation, famille, pcb: null, stockCartons: null, rotation: null };
    const s = lireNombre(stock);
    a.stockCartons = Number.isFinite(s) ? s : null;
    if (a.rotation === null && Number.isFinite(lireNombre(rotation))) a.rotation = lireNombre(rotation);
    articles.set(code, a);
  }
  for (const a of articles.values()) if (a.famille) familles.add(a.famille);
  for (const f of familles) {
    const code = codeMetier(f);
    await prisma.famille.upsert({ where: { code }, create: { code, libelle: f, creePar: AUTEUR }, update: {} });
  }
  const maintenant = new Date();
  for (const [codeArticle, a] of articles) {
    // Le stock du fichier est en cartons : converti en pièces (RG-08). Quota initial = stock (RG-07),
    // à ajuster ensuite par le Directeur commercial.
    const stockPieces = Math.max(0, Math.round((a.stockCartons ?? 0) * (a.pcb ?? 1)));
    const donnees = {
      designation: a.designation,
      codeFamille: codeMetier(a.famille || "DIVERS"),
      pcb: a.pcb,
      rotationCartons: a.rotation,
      stockPieces,
      dateMajStock: maintenant,
      sourceStock: "Fichier de paramétrage",
    };
    await prisma.article.upsert({
      where: { codeArticle },
      create: { codeArticle, ...donnees, quotaPieces: stockPieces, creePar: AUTEUR },
      update: { ...donnees, modifiePar: AUTEUR },
    });
  }

  // Utilisateurs et affectations
  const responsables = await feuille("Responsables");
  const comptes = new Map<string, { nom: string; role: CodeRole; affectations: Map<string, string | null> }>();
  for (const [nom, fonction, circuit, depot] of responsables) {
    if (!nom) continue;
    const role = ROLES_PAR_FONCTION[normaliser(fonction)];
    if (!role) throw new Error(`Fonction inconnue pour ${nom} : « ${fonction} »`);
    const login = loginDe(nom);
    const c = comptes.get(login) ?? { nom, role, affectations: new Map() };
    const canal = CANAUX.find((x) => x.alias.includes(normaliser(circuit)));
    if (canal && (role === ROLES.SUPERVISEUR || role === ROLES.CHEF_VENTE)) {
      c.affectations.set(canal.code, role === ROLES.SUPERVISEUR && depot ? codeMetier(depot) : null);
    }
    comptes.set(login, c);
  }
  comptes.set("admin", { nom: "Administrateur technique", role: ROLES.ADMINISTRATEUR, affectations: new Map() });

  for (const [login, c] of comptes) {
    await prisma.utilisateur.upsert({
      where: { login },
      create: { login, nomComplet: c.nom, codeRole: c.role, motDePasseHash: hashInitial, doitChangerMotDePasse: true, creePar: AUTEUR },
      update: { nomComplet: c.nom, codeRole: c.role, modifiePar: AUTEUR },
    });
    for (const [codeCanal, codeDepot] of c.affectations) {
      await prisma.affectation.upsert({
        where: { login_codeCanal: { login, codeCanal } },
        create: { login, codeCanal, codeDepot, creePar: AUTEUR },
        update: { codeDepot, modifiePar: AUTEUR },
      });
    }
  }

  const sansPcb = [...articles.values()].filter((a) => !a.pcb).length;
  console.log(
    `Seed terminé : ${articles.size} articles (${sansPcb} sans PCB), ${familles.size} familles, ${comptes.size} utilisateurs.`,
  );
  console.log(`Mot de passe initial de tous les comptes : valeur de SEED_MOT_DE_PASSE_INITIAL (changement imposé).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

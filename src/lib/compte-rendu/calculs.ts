/**
 * Calculs et contrôle de complétude du compte rendu journalier dépôt (ENR-08).
 * Module pur, partagé par le formulaire (affichage en direct) et par le serveur (qui fait foi).
 * Les montants sont en dinars avec 3 décimales : les calculs se font en millimes entiers.
 */

export const NATURES_CAISSE = ["ESPECES", "CHEQUES", "TRAITES", "AUTRES"] as const;
export type NatureCaisse = (typeof NATURES_CAISSE)[number];
export const LIBELLES_NATURES: Record<NatureCaisse, string> = {
  ESPECES: "Espèces",
  CHEQUES: "Chèques",
  TRAITES: "Traites",
  AUTRES: "Autres",
};

type Montant = number | null;

export type SaisieStock = {
  codeMagasin: string;
  stockInitial: Montant;
  receptions: Montant;
  ventes: Montant;
  retours: Montant;
  stockFinalReel: Montant;
};
export type SaisieVehicule = {
  codeSociete: string;
  vendeurChauffeur: string;
  matricule: string;
  heureEntree: string;
  heureSortie: string;
  observations: string;
};
export type SaisieRecette = {
  agent: string;
  codeSociete: string;
  caComptant: Montant;
  recouvrement: Montant;
  caCredit: Montant;
  recette: Montant;
};
export type SaisieCaisse = {
  nature: NatureCaisse;
  precision: string;
  soldeVeille: Montant;
  encaissements: Montant;
  transferts: Montant;
  soldeReel: Montant;
  observations: string;
};
export type SaisieDepense = { libelle: string; debit: Montant; credit: Montant; validePar: string };

export type SaisieCompteRendu = {
  stocks: SaisieStock[];
  justificationEcarts: string;
  aucunVehicule: boolean;
  vehicules: SaisieVehicule[];
  recettes: SaisieRecette[];
  observationsRecettes: string;
  caisses: SaisieCaisse[];
  observationsCaisse: string;
  soldeVeilleDepenses: Montant;
  depenses: SaisieDepense[];
  observationsDepenses: string;
  etatCameras: string;
  ressourcesHumaines: string;
  remarques: string;
};

const mil = (v: Montant) => Math.round((v ?? 0) * 1000);
const din = (m: number) => m / 1000;

export function calculerStock(l: SaisieStock) {
  const theorique = mil(l.stockInitial) + mil(l.receptions) - mil(l.ventes) + mil(l.retours);
  return { stockFinalTheorique: din(theorique), ecart: din(mil(l.stockFinalReel) - theorique) };
}

/** Écart de caisse d'un agent : ce qu'il remet moins ce qu'il devait encaisser (comptant + recouvrements). */
export function calculerRecette(l: SaisieRecette) {
  return { ecart: din(mil(l.recette) - mil(l.caComptant) - mil(l.recouvrement)) };
}

/** D = A + B − C ; écart = E − D. */
export function calculerCaisse(l: SaisieCaisse) {
  const d = mil(l.soldeVeille) + mil(l.encaissements) - mil(l.transferts);
  return { soldeTheorique: din(d), ecart: din(mil(l.soldeReel) - d) };
}

/** Solde courant de la caisse dépenses, ligne après ligne, à partir du solde veille. */
export function calculerDepenses(soldeVeille: Montant, lignes: SaisieDepense[]) {
  let solde = mil(soldeVeille);
  const soldes = lignes.map((l) => {
    solde += mil(l.debit) - mil(l.credit);
    return din(solde);
  });
  return { soldes, soldeFinal: din(solde) };
}

export function totaux(s: SaisieCompteRendu) {
  const somme = (xs: number[]) => din(xs.reduce((a, x) => a + mil(x), 0));
  const stocks = s.stocks.map((l) => ({ ...l, ...calculerStock(l) }));
  const caisses = s.caisses.map((l) => ({ ...l, ...calculerCaisse(l) }));
  const recettes = s.recettes.map((l) => ({ ...l, ...calculerRecette(l) }));
  return {
    stock: {
      stockInitial: somme(stocks.map((l) => l.stockInitial ?? 0)),
      receptions: somme(stocks.map((l) => l.receptions ?? 0)),
      ventes: somme(stocks.map((l) => l.ventes ?? 0)),
      retours: somme(stocks.map((l) => l.retours ?? 0)),
      stockFinalTheorique: somme(stocks.map((l) => l.stockFinalTheorique)),
      stockFinalReel: somme(stocks.map((l) => l.stockFinalReel ?? 0)),
      ecart: somme(stocks.map((l) => l.ecart)),
    },
    recettes: {
      caComptant: somme(recettes.map((l) => l.caComptant ?? 0)),
      recouvrement: somme(recettes.map((l) => l.recouvrement ?? 0)),
      caCredit: somme(recettes.map((l) => l.caCredit ?? 0)),
      recette: somme(recettes.map((l) => l.recette ?? 0)),
      ecart: somme(recettes.map((l) => l.ecart)),
    },
    caisse: {
      soldeVeille: somme(caisses.map((l) => l.soldeVeille ?? 0)),
      encaissements: somme(caisses.map((l) => l.encaissements ?? 0)),
      transferts: somme(caisses.map((l) => l.transferts ?? 0)),
      soldeTheorique: somme(caisses.map((l) => l.soldeTheorique)),
      soldeReel: somme(caisses.map((l) => l.soldeReel ?? 0)),
      ecart: somme(caisses.map((l) => l.ecart)),
    },
    depenses: calculerDepenses(s.soldeVeilleDepenses, s.depenses),
  };
}

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const rempli = (t: string | null | undefined) => (t ?? "").trim().length >= 2;
const montantValide = (v: Montant) => v !== null && Number.isFinite(v) && v >= 0;

/**
 * Contrôle de complétude avant soumission. Retourne la liste des manques (vide = complet).
 * Les champs texte obligatoires acceptent « RAS » quand il n'y a rien à signaler.
 */
export function controlerCompletude(s: SaisieCompteRendu, o: { nbPieces: number; pieceObligatoire: boolean }) {
  const e: string[] = [];

  if (!s.stocks.length) e.push("Stock : aucun magasin n'est paramétré pour ce dépôt (contactez l'administrateur).");
  s.stocks.forEach((l) => {
    const champs: [string, Montant][] = [
      ["stock initial", l.stockInitial],
      ["réceptions", l.receptions],
      ["ventes", l.ventes],
      ["retours", l.retours],
      ["stock final réel", l.stockFinalReel],
    ];
    const manquants = champs.filter(([, v]) => !montantValide(v)).map(([n]) => n);
    if (manquants.length) e.push(`Stock ${l.codeMagasin} : ${manquants.join(", ")} à renseigner (montant ≥ 0).`);
  });
  if (s.stocks.some((l) => calculerStock(l).ecart !== 0) && !rempli(s.justificationEcarts)) {
    e.push("Stock : la justification des écarts est obligatoire lorsqu'un écart existe.");
  }

  if (s.aucunVehicule && s.vehicules.length) e.push("Véhicules : décochez « aucun véhicule » ou supprimez les lignes saisies.");
  if (!s.aucunVehicule && !s.vehicules.length) e.push("Véhicules : saisissez au moins un véhicule ou cochez « aucun véhicule traité ».");
  s.vehicules.forEach((v, i) => {
    const n = i + 1;
    if (!v.codeSociete) e.push(`Véhicule ${n} : société manquante.`);
    if (!rempli(v.vendeurChauffeur)) e.push(`Véhicule ${n} : vendeur / chauffeur manquant.`);
    if (!rempli(v.matricule)) e.push(`Véhicule ${n} : matricule manquant.`);
    if (!HEURE.test(v.heureEntree)) e.push(`Véhicule ${n} : heure d'entrée manquante.`);
    if (!HEURE.test(v.heureSortie)) e.push(`Véhicule ${n} : heure de sortie manquante.`);
    else if (HEURE.test(v.heureEntree) && v.heureSortie < v.heureEntree) e.push(`Véhicule ${n} : heure de sortie avant l'heure d'entrée.`);
  });

  if (!s.recettes.length) e.push("Caisse recettes : saisissez au moins une ligne.");
  s.recettes.forEach((r, i) => {
    const n = i + 1;
    if (!rempli(r.agent)) e.push(`Recette ${n} : agent manquant.`);
    if (!r.codeSociete) e.push(`Recette ${n} : société manquante.`);
    const manquants = (
      [
        ["CA au comptant", r.caComptant],
        ["recouvrement", r.recouvrement],
        ["CA à crédit", r.caCredit],
        ["recette", r.recette],
      ] as [string, Montant][]
    )
      .filter(([, v]) => !montantValide(v))
      .map(([x]) => x);
    if (manquants.length) e.push(`Recette ${n} : ${manquants.join(", ")} à renseigner.`);
  });
  if (!rempli(s.observationsRecettes)) e.push("Caisse recettes : observations obligatoires (« RAS » si rien à signaler).");

  for (const nature of NATURES_CAISSE) {
    const l = s.caisses.find((c) => c.nature === nature);
    const lib = LIBELLES_NATURES[nature];
    if (!l) {
      e.push(`Récapitulatif caisse : ligne ${lib} manquante.`);
      continue;
    }
    const manquants = (
      [
        ["solde veille", l.soldeVeille],
        ["encaissements", l.encaissements],
        ["transferts / versements", l.transferts],
        ["solde réel", l.soldeReel],
      ] as [string, Montant][]
    )
      .filter(([, v]) => !montantValide(v))
      .map(([x]) => x);
    if (manquants.length) e.push(`Récapitulatif caisse ${lib} : ${manquants.join(", ")} à renseigner.`);
    const nonNul = [l.soldeVeille, l.encaissements, l.transferts, l.soldeReel].some((v) => (v ?? 0) !== 0);
    if (nature === "AUTRES" && nonNul && !rempli(l.precision)) e.push("Récapitulatif caisse Autres : préciser la nature.");
    if (calculerCaisse(l).ecart !== 0 && !rempli(l.observations)) e.push(`Récapitulatif caisse ${lib} : justifier l'écart.`);
  }
  if (!rempli(s.observationsCaisse)) e.push("Récapitulatif caisse : observations obligatoires (« RAS » si rien à signaler).");

  if (!montantValide(s.soldeVeilleDepenses)) e.push("Caisse dépenses : solde veille à renseigner.");
  s.depenses.forEach((d, i) => {
    const n = i + 1;
    if (!rempli(d.libelle)) e.push(`Dépense ${n} : libellé manquant.`);
    const debit = d.debit ?? 0;
    const credit = d.credit ?? 0;
    if (debit < 0 || credit < 0) e.push(`Dépense ${n} : montants négatifs interdits.`);
    if ((debit > 0) === (credit > 0)) e.push(`Dépense ${n} : renseignez soit un débit (entrée), soit un crédit (sortie).`);
    if (!rempli(d.validePar)) e.push(`Dépense ${n} : « validé par » manquant.`);
  });
  if (calculerDepenses(s.soldeVeilleDepenses, s.depenses).soldeFinal < 0) e.push("Caisse dépenses : le solde ne peut pas devenir négatif.");
  if (!rempli(s.observationsDepenses)) e.push("Caisse dépenses : observations obligatoires (« RAS » si rien à signaler).");

  if (!rempli(s.etatCameras)) e.push("Sécurité : état des caméras de surveillance obligatoire.");
  if (!rempli(s.ressourcesHumaines)) e.push("Sécurité : ressources humaines (présences, absences, retards) obligatoire.");
  if (!rempli(s.remarques)) e.push("Sécurité : remarques / incidents du jour obligatoires (« RAS » si aucun).");

  if (o.pieceObligatoire && o.nbPieces === 0) {
    e.push("Annexe : joignez l'état de stock système édité juste avant la clôture de la journée.");
  }
  return e;
}

import { describe, expect, it } from "vitest";
import {
  calculerCaisse,
  calculerLigneInventaire,
  controlerInventaire,
  valoriserInventaire,
  calculerDepenses,
  calculerRecette,
  calculerStock,
  controlerCompletude,
  NATURES_CAISSE,
  totaux,
  type SaisieCompteRendu,
} from "./calculs";

const complet = (): SaisieCompteRendu => ({
  stocks: [{ codeMagasin: "MAG1", stockInitial: 1000, receptions: 200, ventes: 300, retours: 10, stockFinalReel: 910 }],
  justificationEcarts: "",
  aucunVehicule: false,
  vehicules: [{ codeSociete: "PROMOFOOD", vendeurChauffeur: "Ali", matricule: "123 TU 4567", heureEntree: "07:30", heureSortie: "18:00", observations: "" }],
  recettes: [{ agent: "Ali", codeSociete: "PROMOFOOD", caComptant: 500, recouvrement: 100, caCredit: 50, recette: 600 }],
  observationsRecettes: "RAS",
  caisses: NATURES_CAISSE.map((nature) => ({ nature, precision: "", soldeVeille: 0, encaissements: 0, transferts: 0, soldeReel: 0, observations: "" })),
  observationsCaisse: "RAS",
  soldeVeilleDepenses: 200,
  depenses: [{ libelle: "Carburant", debit: null, credit: 50, validePar: "Chef dépôt" }],
  observationsDepenses: "RAS",
  etatCameras: "Toutes fonctionnelles",
  ressourcesHumaines: "Tous présents",
  remarques: "RAS",
});

describe("calculs", () => {
  it("stock final théorique = initial + réceptions − ventes + retours", () => {
    expect(calculerStock(complet().stocks[0])).toEqual({ stockFinalTheorique: 910, ecart: 0 });
    expect(calculerStock({ ...complet().stocks[0], stockFinalReel: 905.5 }).ecart).toBe(-4.5);
  });
  it("travaille au millime sans erreur d'arrondi", () => {
    expect(calculerStock({ codeMagasin: "M", stockInitial: 0.1, receptions: 0.2, ventes: 0, retours: 0, stockFinalReel: 0.3 }).ecart).toBe(0);
  });
  it("écart recette = recette − (comptant + recouvrement)", () => {
    expect(calculerRecette({ agent: "a", codeSociete: "X", caComptant: 500, recouvrement: 100, caCredit: 999, recette: 590 }).ecart).toBe(-10);
  });
  it("récapitulatif caisse : D = A + B − C, écart = E − D", () => {
    expect(calculerCaisse({ nature: "ESPECES", precision: "", soldeVeille: 100, encaissements: 600, transferts: 500, soldeReel: 195, observations: "" })).toEqual({
      soldeTheorique: 200,
      ecart: -5,
    });
  });
  it("solde courant des dépenses", () => {
    expect(calculerDepenses(200, [
      { libelle: "a", debit: 100, credit: null, validePar: "x" },
      { libelle: "b", debit: null, credit: 30.25, validePar: "x" },
    ])).toEqual({ soldes: [300, 269.75], soldeFinal: 269.75 });
  });
  it("totaux par section", () => {
    expect(totaux(complet()).stock.ecart).toBe(0);
    expect(totaux(complet()).depenses.soldeFinal).toBe(150);
  });
});

describe("complétude", () => {
  const ok = { nbPieces: 1, pieceObligatoire: true };
  it("un compte rendu complet passe", () => {
    expect(controlerCompletude(complet(), ok)).toEqual([]);
  });
  it("exige la justification si un écart de stock existe", () => {
    const s = complet();
    s.stocks[0].stockFinalReel = 900;
    expect(controlerCompletude(s, ok).join()).toMatch(/justification des écarts/);
    s.justificationEcarts = "Casse constatée";
    expect(controlerCompletude(s, ok)).toEqual([]);
  });
  it("exige l'annexe de l'état de stock", () => {
    expect(controlerCompletude(complet(), { nbPieces: 0, pieceObligatoire: true }).join()).toMatch(/Annexe/);
    expect(controlerCompletude(complet(), { nbPieces: 0, pieceObligatoire: false })).toEqual([]);
  });
  it("véhicules : au moins un, ou « aucun véhicule » coché", () => {
    const s = complet();
    s.vehicules = [];
    expect(controlerCompletude(s, ok).join()).toMatch(/au moins un véhicule/);
    s.aucunVehicule = true;
    expect(controlerCompletude(s, ok)).toEqual([]);
  });
  it("refuse les champs vides, les heures incohérentes et une dépense à la fois débit et crédit", () => {
    const s = complet();
    s.stocks[0].ventes = null;
    s.vehicules[0].heureSortie = "06:00";
    s.depenses[0].debit = 10;
    s.remarques = "";
    const e = controlerCompletude(s, ok).join("\n");
    expect(e).toMatch(/ventes/);
    expect(e).toMatch(/sortie avant/);
    expect(e).toMatch(/soit un débit/);
    expect(e).toMatch(/incidents/);
  });
  it("écart de caisse : justification obligatoire sur la ligne", () => {
    const s = complet();
    s.caisses[0].soldeReel = 10;
    expect(controlerCompletude(s, ok).join()).toMatch(/Espèces : justifier/);
  });
});


describe("inventaire en quantités", () => {
  const l = { codeArticle: "P101001", stockInitial: 100, receptions: 50, ventes: 30, retours: 2, stockFinalReel: 120 };
  it("quantité théorique et écart", () => {
    expect(calculerLigneInventaire(l)).toEqual({ stockFinalTheorique: 122, ecart: -2 });
    expect(calculerLigneInventaire({ ...l, stockFinalReel: null }).ecart).toBeNull();
  });
  it("valorisation au prix de revient, au millime", () => {
    const v = valoriserInventaire([
      { ...l, prixRevient: 1.25 },
      { codeArticle: "B101001", stockInitial: 10, receptions: 0, ventes: 1, retours: 0, stockFinalReel: 9, prixRevient: 3.333 },
    ]);
    expect(v).toEqual({ stockInitial: 158.33, receptions: 62.5, ventes: 40.833, retours: 2.5, stockFinalTheorique: 182.497, stockFinalReel: 179.997, ecart: -2.5 });
  });
  it("un article avec stock ou mouvement doit être compté", () => {
    expect(controlerInventaire([{ ...l, stockFinalReel: null }]).join()).toMatch(/1 article/);
    expect(controlerInventaire([{ codeArticle: "X", stockInitial: null, receptions: null, ventes: null, retours: null, stockFinalReel: null }])).toEqual([]);
    expect(controlerInventaire([{ ...l, ventes: -1 }]).join()).toMatch(/négatives/);
  });
});

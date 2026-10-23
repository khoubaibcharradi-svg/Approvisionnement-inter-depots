import { describe, expect, it } from "vitest";
import {
  actionsPossibles,
  depasseQuota,
  enCartons,
  peutDemanderModification,
  peutModifier,
  peutTrancherModification,
  peutVoir,
  quotaPlafonne,
  statutApresAnnulation,
  type Acteur,
  type EtatDemande,
} from "./workflow";

const sup: Acteur = { login: "sup.a", role: "SUPERVISEUR", canaux: ["GMS"] };
const autreSup: Acteur = { login: "sup.b", role: "SUPERVISEUR", canaux: ["GMS"] };
const cv: Acteur = { login: "cv.gms", role: "CHEF_VENTE", canaux: ["GMS"] };
const cvAutre: Acteur = { login: "cv.vd", role: "CHEF_VENTE", canaux: ["VENTE_DIRECTE"] };
const dc: Acteur = { login: "dir.co", role: "DIRECTEUR_COMMERCIAL", canaux: [] };
const rades: Acteur = { login: "chef.depot", role: "CHEF_DEPOT", canaux: [] };
const admin: Acteur = { login: "admin", role: "ADMINISTRATEUR", canaux: [] };

const d = (p: Partial<EtatDemande> = {}): EtatDemande => ({
  loginSaisie: "sup.a",
  codeCanal: "GMS",
  statut: "A_VALIDER",
  etapeRejet: null,
  modificationEnAttente: null,
  ...p,
});

describe("visibilité", () => {
  it("le superviseur ne voit que ses demandes", () => {
    expect(peutVoir(sup, d())).toBe(true);
    expect(peutVoir(autreSup, d())).toBe(false);
  });
  it("le chef de vente ne voit que son circuit", () => {
    expect(peutVoir(cv, d())).toBe(true);
    expect(peutVoir(cvAutre, d())).toBe(false);
  });
  it("hors circuit : aucune action possible", () => {
    const a = actionsPossibles(cvAutre, d());
    expect(Object.values(a).every((v) => !v)).toBe(true);
  });
  it("l'agent dépôt et le consultant des comptes rendus ne voient aucune demande", () => {
    for (const role of ["AGENT_DEPOT", "CONSULTANT_CR"] as const) {
      const a: Acteur = { login: "x", role, canaux: ["GMS"] };
      expect(peutVoir(a, d())).toBe(false);
      expect(Object.values(actionsPossibles(a, d())).every((v) => !v)).toBe(true);
    }
  });
});

describe("modification directe", () => {
  it("le superviseur modifie sa demande tant qu'elle est à valider", () => {
    expect(peutModifier(sup, d())).toBe(true);
    expect(peutModifier(sup, d({ statut: "A_APPROUVER" }))).toBe(false);
  });
  it("chaque supérieur modifie à son étape", () => {
    expect(peutModifier(cv, d())).toBe(true);
    expect(peutModifier(dc, d())).toBe(false);
    expect(peutModifier(dc, d({ statut: "A_APPROUVER" }))).toBe(true);
    expect(peutModifier(rades, d({ statut: "EN_PREPARATION" }))).toBe(true);
  });
});

describe("RG-02 annulation de décision", () => {
  it("le chef de vente annule tant que le directeur commercial n'a pas agi", () => {
    expect(statutApresAnnulation(cv, d({ statut: "A_APPROUVER" }))).toBe("A_VALIDER");
    expect(statutApresAnnulation(cv, d({ statut: "APPROUVEE" }))).toBeNull();
    expect(statutApresAnnulation(cv, d({ statut: "REJETEE", etapeRejet: 1 }))).toBe("A_VALIDER");
    expect(statutApresAnnulation(cv, d({ statut: "REJETEE", etapeRejet: 2 }))).toBeNull();
  });
  it("le directeur commercial annule tant que Radès n'a pas agi", () => {
    expect(statutApresAnnulation(dc, d({ statut: "APPROUVEE" }))).toBe("A_APPROUVER");
    expect(statutApresAnnulation(dc, d({ statut: "EN_PREPARATION" }))).toBeNull();
    expect(statutApresAnnulation(dc, d({ statut: "REJETEE", etapeRejet: 2 }))).toBe("A_APPROUVER");
  });
});

describe("RG-04 demande de modification", () => {
  it("le superviseur la demande une fois la demande transmise", () => {
    expect(peutDemanderModification(sup, d())).toBe(false);
    expect(peutDemanderModification(sup, d({ statut: "A_APPROUVER" }))).toBe(true);
  });
  it("impossible en préparation, pour l'administrateur ou si une demande est déjà en attente", () => {
    expect(peutDemanderModification(cv, d({ statut: "EN_PREPARATION" }))).toBe(false);
    expect(peutDemanderModification(admin, d({ statut: "A_APPROUVER" }))).toBe(false);
    expect(
      peutDemanderModification(cv, d({ statut: "A_APPROUVER", modificationEnAttente: { loginDemandeur: "x" } })),
    ).toBe(false);
  });
  it("tranchée par le détenteur courant uniquement", () => {
    const e = d({ statut: "A_APPROUVER", modificationEnAttente: { loginDemandeur: "sup.a" } });
    expect(peutTrancherModification(dc, e)).toBe(true);
    expect(peutTrancherModification(cv, e)).toBe(false);
  });
});

describe("quotas et unités", () => {
  it("RG-06 convertit les cartons en pièces avant de comparer au quota", () => {
    expect(depasseQuota(10, "CARTON", 12, 100)).toBe(true);
    expect(depasseQuota(8, "CARTON", 12, 100)).toBe(false);
    expect(depasseQuota(100, "PIECE", 12, 100)).toBe(false);
  });
  it("RG-07 plafonne le quota au stock", () => {
    expect(quotaPlafonne(500, 120)).toBe(120);
    expect(quotaPlafonne(50, 120)).toBe(50);
  });
  it("RG-08 exprime en cartons avec une décimale", () => {
    expect(enCartons(30, 12)).toBe(2.5);
    expect(enCartons(30, null)).toBe(30);
  });
});

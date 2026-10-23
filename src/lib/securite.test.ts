import { describe, expect, it } from "vitest";
import { contenuConforme } from "./fichiers";
import { lireJeton, prolongerJeton, signerJeton } from "./auth/jeton";

const octets = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0x20)]);
const texte = (t: string) => new TextEncoder().encode(t);

describe("contrôle du contenu des fichiers", () => {
  it("accepte les vraies signatures", () => {
    expect(contenuConforme("pdf", texte("%PDF-1.7 ..."))).toBe(true);
    expect(contenuConforme("png", octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(contenuConforme("jpg", octets(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(contenuConforme("xlsx", octets(0x50, 0x4b, 0x03, 0x04))).toBe(true);
    expect(contenuConforme("csv", texte("Code;Désignation\nP1;Café"))).toBe(true);
  });
  it("refuse un fichier renommé ou piégé", () => {
    expect(contenuConforme("pdf", texte("<html><script>alert(1)</script>"))).toBe(false);
    expect(contenuConforme("png", texte("MZ\u0090 exécutable"))).toBe(false);
    expect(contenuConforme("xlsx", texte("%PDF-1.4"))).toBe(false);
    expect(contenuConforme("csv", texte("<!DOCTYPE html><body>"))).toBe(false);
    expect(contenuConforme("csv", octets(0x50, 0x00, 0x4b))).toBe(false);
    expect(contenuConforme("exe", texte("x"))).toBe(false);
  });
});

describe("jeton de session", () => {
  const maintenant = () => Math.floor(Date.now() / 1000);
  it("est valide juste après la connexion", async () => {
    const j = await signerJeton({ login: "agent", vs: 1, debut: maintenant() });
    expect((await lireJeton(j))?.login).toBe("agent");
  });
  it("est refusé au-delà de la durée maximale de session", async () => {
    const j = await signerJeton({ login: "agent", vs: 1, debut: maintenant() - 11 * 3600 });
    expect(await lireJeton(j)).toBeNull();
  });
  it("est refusé s'il a été modifié", async () => {
    const j = await signerJeton({ login: "agent", vs: 1, debut: maintenant() });
    const [h, p, s] = j.split(".");
    const faux = JSON.parse(Buffer.from(p, "base64url").toString());
    faux.sub = "admin";
    expect(await lireJeton(`${h}.${Buffer.from(JSON.stringify(faux)).toString("base64url")}.${s}`)).toBeNull();
  });
  it("n'est pas réémis à chaque requête", async () => {
    const j = await lireJeton(await signerJeton({ login: "agent", vs: 1, debut: maintenant() }));
    expect(await prolongerJeton(j!)).toBeNull();
  });
});

import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const COUT_BCRYPT = 12;

export const hacherMotDePasse = (mdp: string) => bcrypt.hash(mdp, COUT_BCRYPT);
export const verifierMotDePasse = (mdp: string, hash: string) => bcrypt.compare(mdp, hash);

// Mots et suites testés en premier par les attaquants (dictionnaires, nom de l'entreprise).
const MOTS_INTERDITS = ["password", "motdepasse", "azerty", "qwerty", "123456", "abcdef", "admin", "bienvenue", "welcome", "promofood", "proxim", "neolia", "beesky", "appro", "tunis", "depot"];

/** Mot de passe construit sur un mot courant ou une répétition (ex. « Promofood2026 », « Aaaa1111bb »). */
export function estPrevisible(mdp: string) {
  const m = mdp.toLowerCase().replace(/[@4]/g, "a").replace(/0/g, "o").replace(/[1!]/g, "i").replace(/3/g, "e").replace(/[$5]/g, "s");
  return MOTS_INTERDITS.some((x) => m.includes(x) || mdp.toLowerCase().includes(x)) || /(.)\1{3,}/.test(mdp);
}

/** Retourne la liste des règles non respectées (vide si le mot de passe est acceptable). */
export function controlerPolitique(mdp: string, login: string, longueurMin = 10): string[] {
  const erreurs: string[] = [];
  if (mdp.length < longueurMin) erreurs.push(`au moins ${longueurMin} caractères`);
  if (mdp.length > 72) erreurs.push("72 caractères au maximum");
  if (!/[a-z]/.test(mdp)) erreurs.push("une minuscule");
  if (!/[A-Z]/.test(mdp)) erreurs.push("une majuscule");
  if (!/\d/.test(mdp)) erreurs.push("un chiffre");
  if (login && mdp.toLowerCase().includes(login.toLowerCase())) erreurs.push("ne pas contenir l'identifiant");
  if (estPrevisible(mdp)) erreurs.push("aucun mot ou suite trop courant (nom de l'entreprise, azerty, 123456…)");
  return erreurs;
}

/** Mot de passe temporaire lisible, conforme à la politique (réinitialisation par l'administrateur). */
export function genererMotDePasseTemporaire() {
  const maj = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const min = "abcdefghijkmnpqrstuvwxyz";
  const chi = "23456789";
  const tous = maj + min + chi;
  const c = (s: string) => s[randomInt(s.length)];
  const base = [c(maj), c(min), c(chi), ...Array.from({ length: 9 }, () => c(tous))];
  for (let i = base.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.join("");
}

let hashFactice: Promise<string> | undefined;
/** Vérification à blanc : même durée que l'identifiant existe ou non (évite l'énumération des comptes). */
export async function verificationFactice(mdp: string) {
  hashFactice ??= hacherMotDePasse("verification-factice");
  await verifierMotDePasse(mdp, await hashFactice);
}

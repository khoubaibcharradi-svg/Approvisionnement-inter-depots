import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID : 26 caractères, triable par date (10 caractères d'horodatage + 16 aléatoires). */
export function ulid(date = Date.now()) {
  let t = date;
  let temps = "";
  for (let i = 0; i < 10; i++) {
    temps = ALPHABET[t % 32] + temps;
    t = Math.floor(t / 32);
  }
  const alea = randomBytes(16);
  let suite = "";
  for (let i = 0; i < 16; i++) suite += ALPHABET[alea[i] % 32];
  return temps + suite;
}

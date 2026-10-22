import { SignJWT, jwtVerify } from "jose";

/** Jeton de session signé (HS256). Utilisable aussi depuis proxy.ts : pas de dépendance à la base. */

export const NOM_COOKIE = "appro_session";

export type ContenuJeton = { login: string; vs: number };

let avertissementAffiche = false;

function cle() {
  let s = process.env.SESSION_SECRET?.trim();
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET manquant ou trop court (32 caractères minimum)");
    }
    // Poste de développement uniquement : clé déterministe (identique dans proxy.ts et le serveur),
    // pour ne pas bloquer un test local. Jamais utilisée en production.
    s = `cle-de-developpement-non-securisee::${process.env.DATABASE_URL ?? ""}`;
    if (!avertissementAffiche) {
      avertissementAffiche = true;
      console.warn("⚠ SESSION_SECRET absent de .env : clé de développement utilisée (interdit en production).");
    }
  }
  return new TextEncoder().encode(s);
}

export const dureeSessionSecondes = () => Number(process.env.SESSION_DUREE_HEURES || 10) * 3600;

export async function signerJeton(c: ContenuJeton) {
  return new SignJWT({ vs: c.vs })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.login)
    .setIssuedAt()
    .setExpirationTime(`${dureeSessionSecondes()}s`)
    .sign(cle());
}

export async function lireJeton(jeton: string | undefined): Promise<ContenuJeton | null> {
  if (!jeton) return null;
  try {
    const { payload } = await jwtVerify(jeton, cle(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.vs !== "number") return null;
    return { login: payload.sub, vs: payload.vs };
  } catch {
    return null;
  }
}

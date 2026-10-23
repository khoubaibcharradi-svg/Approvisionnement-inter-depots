import { SignJWT, jwtVerify } from "jose";

/** Jeton de session signé (HS256). Utilisable aussi depuis proxy.ts : pas de dépendance à la base. */

// Préfixe __Host- en production : cookie lié à ce seul domaine, en HTTPS, sur tout le site.
export const NOM_COOKIE = process.env.NODE_ENV === "production" ? "__Host-appro_session" : "appro_session";

/** `debut` : heure de connexion (secondes), pour borner la durée totale de la session. */
export type ContenuJeton = { login: string; vs: number; debut: number };

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

/** Durée maximale d'une session, quelle que soit l'activité (SESSION_DUREE_HEURES, 10 h par défaut). */
export const dureeSessionSecondes = () => Number(process.env.SESSION_DUREE_HEURES || 10) * 3600;
/** Déconnexion après inactivité (SESSION_INACTIVITE_MINUTES, 30 min par défaut). */
export const inactiviteSecondes = () => Number(process.env.SESSION_INACTIVITE_MINUTES || 30) * 60;

/** Options du cookie : inaccessible au JavaScript, HTTPS uniquement en production, durée = inactivité tolérée. */
export const optionsCookie = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: inactiviteSecondes(),
});

const maintenant = () => Math.floor(Date.now() / 1000);

/** Expiration : fin de la fenêtre d'inactivité, sans dépasser la durée maximale depuis la connexion. */
export async function signerJeton(c: ContenuJeton) {
  const exp = Math.min(maintenant() + inactiviteSecondes(), c.debut + dureeSessionSecondes());
  return new SignJWT({ vs: c.vs, debut: c.debut })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.login)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(cle());
}

export async function lireJeton(jeton: string | undefined): Promise<(ContenuJeton & { exp: number }) | null> {
  if (!jeton) return null;
  try {
    const { payload } = await jwtVerify(jeton, cle(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.vs !== "number" || typeof payload.debut !== "number" || typeof payload.exp !== "number") return null;
    if (payload.debut + dureeSessionSecondes() <= maintenant()) return null;
    return { login: payload.sub, vs: payload.vs, debut: payload.debut, exp: payload.exp };
  } catch {
    return null;
  }
}

/** Jeton prolongé si plus d'une minute s'est écoulée depuis son émission (activité de l'utilisateur), sinon null. */
export async function prolongerJeton(c: ContenuJeton & { exp: number }) {
  const cible = Math.min(maintenant() + inactiviteSecondes(), c.debut + dureeSessionSecondes());
  return cible - c.exp > 60 ? signerJeton(c) : null;
}

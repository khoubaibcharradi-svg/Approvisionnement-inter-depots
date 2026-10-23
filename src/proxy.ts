import { NextResponse, type NextRequest } from "next/server";
import { NOM_COOKIE, lireJeton, optionsCookie, prolongerJeton } from "./lib/auth/jeton";

/**
 * Premier filtre, sur toutes les pages :
 * - politique de sécurité du contenu avec un nonce par requête (seuls les scripts du portail s'exécutent) ;
 * - sans jeton valide, redirection vers la connexion ; avec un jeton valide, prolongation de la session (inactivité).
 * Le contrôle complet (compte actif, version de session, rôle) est refait côté serveur à chaque page et action.
 */
function politique(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Styles : attributs style= de mise en page, sans possibilité d'exécuter du code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = politique(nonce);
  const chemin = req.nextUrl.pathname;
  const publique = chemin === "/connexion" || chemin.startsWith("/connexion/");

  let prolonge: string | null = null;
  if (!publique) {
    const jeton = await lireJeton(req.cookies.get(NOM_COOKIE)?.value);
    if (!jeton) {
      const refus = chemin.startsWith("/api/")
        ? NextResponse.json({ erreur: "Non authentifié" }, { status: 401 })
        : NextResponse.redirect(new URL("/connexion", req.url));
      refus.headers.set("Content-Security-Policy", csp);
      return refus;
    }
    prolonge = await prolongerJeton(jeton);
  }

  const entetes = new Headers(req.headers);
  entetes.set("x-nonce", nonce);
  entetes.set("Content-Security-Policy", csp);
  const reponse = NextResponse.next({ request: { headers: entetes } });
  reponse.headers.set("Content-Security-Policy", csp);
  if (prolonge) reponse.cookies.set(NOM_COOKIE, prolonge, optionsCookie());
  return reponse;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|logos/).*)",
      // Préchargements de next/link : pas besoin d'un nouveau nonce.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

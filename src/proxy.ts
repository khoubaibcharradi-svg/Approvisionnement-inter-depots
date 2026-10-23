import { NextResponse, type NextRequest } from "next/server";
import { NOM_COOKIE, lireJeton } from "./lib/auth/jeton";

/**
 * Premier filtre : sans jeton valide, redirection vers la connexion.
 * Le contrôle complet (compte actif, version de session, rôle) est refait côté serveur à chaque page et action.
 */
export async function proxy(req: NextRequest) {
  const jeton = await lireJeton(req.cookies.get(NOM_COOKIE)?.value);
  if (!jeton) {
    if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ erreur: "Non authentifié" }, { status: 401 });
    return NextResponse.redirect(new URL("/connexion", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!connexion|logos/|_next/static|_next/image|favicon.ico).*)"],
};

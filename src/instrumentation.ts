export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node");
}

export async function onRequestError(
  erreur: unknown,
  requete: { path: string; method: string },
  contexte: { routerKind: string; routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { journal } = await import("./lib/journal");
  journal.error("Erreur serveur sur une requête", {
    erreur,
    chemin: requete.path,
    methode: requete.method,
    route: contexte.routePath,
    type: contexte.routeType,
  });
}

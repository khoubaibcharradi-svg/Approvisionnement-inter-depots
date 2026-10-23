import fs from "node:fs";
import { utilisateurCourant } from "@/lib/auth/session";
import { auditer } from "@/lib/audit";
import { pieceAutorisee } from "@/lib/compte-rendu/service";

export async function GET(_: Request, { params }: { params: Promise<{ numero: string; piece: string }> }) {
  const u = await utilisateurCourant();
  const { numero, piece } = await params;
  const n = /^\d{1,4}$/.test(piece) ? Number(piece) : null;
  const p = u && !u.doitChangerMotDePasse && n !== null ? await pieceAutorisee(u, numero.slice(0, 20), n) : null;
  if (!u || !p || !fs.existsSync(p.chemin)) {
    await auditer({ action: "TELECHARGEMENT_PIECE_REFUSE", login: u?.login, codeRole: u?.role, entite: "CompteRendu", cleEntite: numero.slice(0, 80), detail: `pièce ${piece}`, succes: false });
    return new Response("Introuvable ou accès refusé", { status: 404 });
  }
  await auditer({ action: "TELECHARGEMENT_PIECE", login: u.login, codeRole: u.role, entite: "CompteRendu", cleEntite: numero, detail: `pièce ${piece} · ${p.nomFichier}` });
  return new Response(fs.readFileSync(p.chemin), {
    headers: {
      "Content-Type": p.typeMime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(p.nomFichier)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

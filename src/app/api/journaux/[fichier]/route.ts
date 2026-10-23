import fs from "node:fs";
import { utilisateurCourant } from "@/lib/auth/session";
import { auditer } from "@/lib/audit";
import { cheminJournal } from "@/lib/journal";
import { ROLES } from "@/lib/constantes";

export async function GET(_: Request, { params }: { params: Promise<{ fichier: string }> }) {
  const u = await utilisateurCourant();
  const { fichier } = await params;
  if (!u || u.role !== ROLES.ADMIN_FULL || u.doitChangerMotDePasse) {
    await auditer({ action: "TELECHARGEMENT_JOURNAL_REFUSE", login: u?.login, codeRole: u?.role, entite: "Journal", cleEntite: fichier.slice(0, 80), succes: false });
    return new Response("Accès refusé", { status: 403 });
  }
  const chemin = cheminJournal(fichier);
  if (!chemin) return new Response("Introuvable", { status: 404 });
  await auditer({ action: "TELECHARGEMENT_JOURNAL", login: u.login, codeRole: u.role, entite: "Journal", cleEntite: fichier });
  return new Response(fs.readFileSync(chemin), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${fichier}"` },
  });
}

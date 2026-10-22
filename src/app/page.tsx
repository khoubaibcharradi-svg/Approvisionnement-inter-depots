import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { accueilDuRole } from "@/lib/constantes";

export default async function Accueil() {
  const u = await exigerUtilisateur(undefined, { tousRoles: true });
  redirect(accueilDuRole(u.role));
}

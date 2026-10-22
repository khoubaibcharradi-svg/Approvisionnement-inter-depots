import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { auditer } from "@/lib/audit";
import { ROLES } from "@/lib/constantes";
import { detailCompteRendu } from "@/lib/compte-rendu/service";
import { detailInventaire } from "@/lib/compte-rendu/inventaire";
import { VueCompteRendu } from "@/components/vue-compte-rendu";

export default async function PageDetailCompteRendu({ params }: { params: Promise<{ numero: string }> }) {
  const u = await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  const { numero } = await params;
  const cr = await detailCompteRendu(numero.slice(0, 20));
  if (!cr) notFound();
  await auditer({ action: "CONSULTATION_COMPTE_RENDU", login: u.login, codeRole: u.role, entite: "CompteRendu", cleEntite: cr.numero });
  const societes = Object.fromEntries((await prisma.societe.findMany()).map((s) => [s.code, s.libelle]));
  return (
    <div className="flex flex-col gap-3">
      <Link href="/admin/comptes-rendus" className="note underline">← Comptes rendus</Link>
      <VueCompteRendu cr={cr} societes={societes} inventaire={await detailInventaire(cr.codeDepot, cr.dateJournee)} />
    </div>
  );
}

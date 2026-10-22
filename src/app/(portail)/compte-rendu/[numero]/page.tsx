import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { auditer } from "@/lib/audit";
import { ROLES } from "@/lib/constantes";
import { detailCompteRendu } from "@/lib/compte-rendu/service";
import { detailInventaire } from "@/lib/compte-rendu/inventaire";
import { VueCompteRendu } from "@/components/vue-compte-rendu";

export default async function PageCompteRenduAgent({ params }: { params: Promise<{ numero: string }> }) {
  const u = await exigerUtilisateur([ROLES.AGENT_DEPOT]);
  const { numero } = await params;
  const cr = await prisma.compteRendu.findFirst({ where: { numero, codeDepot: u.codeDepotAgent ?? "" }, select: { numero: true } });
  const detail = cr ? await detailCompteRendu(cr.numero) : null;
  if (!detail) {
    await auditer({ action: "CONSULTATION_COMPTE_RENDU_REFUSEE", login: u.login, codeRole: u.role, entite: "CompteRendu", cleEntite: numero.slice(0, 80), succes: false });
    notFound();
  }
  const societes = Object.fromEntries((await prisma.societe.findMany()).map((s) => [s.code, s.libelle]));
  return (
    <div className="flex flex-col gap-3">
      <Link href="/compte-rendu/historique" className="note underline">← Historique</Link>
      <VueCompteRendu cr={detail} societes={societes} inventaire={await detailInventaire(detail.codeDepot, detail.dateJournee)} />
    </div>
  );
}

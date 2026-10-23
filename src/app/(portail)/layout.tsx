import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { LIBELLES_ROLES, ROLES, type CodeRole } from "@/lib/constantes";
import { seDeconnecter } from "../connexion/actions";
import logoNeolia from "../connexion/logos/logo-neolia.jpg";

const MENU: { href: string; libelle: string; roles?: CodeRole[]; saufRoles?: CodeRole[] }[] = [
  { href: "/demandes", libelle: "Demandes", saufRoles: [ROLES.AGENT_DEPOT] },
  { href: "/demandes/nouvelle", libelle: "Nouvelle demande", roles: [ROLES.SUPERVISEUR] },
  { href: "/catalogue", libelle: "Catalogue SKU", saufRoles: [ROLES.SUPERVISEUR, ROLES.AGENT_DEPOT] },
  { href: "/compte-rendu", libelle: "Compte rendu journalier", roles: [ROLES.AGENT_DEPOT] },
  { href: "/compte-rendu/inventaire", libelle: "Inventaire", roles: [ROLES.AGENT_DEPOT] },
  { href: "/compte-rendu/vehicules", libelle: "Véhicules", roles: [ROLES.AGENT_DEPOT] },
  { href: "/compte-rendu/historique", libelle: "Historique", roles: [ROLES.AGENT_DEPOT] },
  { href: "/audit", libelle: "Journal d'audit", saufRoles: [ROLES.SUPERVISEUR, ROLES.CHEF_VENTE, ROLES.AGENT_DEPOT] },
  { href: "/statistiques", libelle: "Statistiques", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/admin/comptes-rendus", libelle: "Comptes rendus dépôts", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/admin/inventaires", libelle: "Inventaires", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/admin/magasins", libelle: "Magasins", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/admin/vehicules", libelle: "Véhicules", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/admin/utilisateurs", libelle: "Utilisateurs", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/admin/sauvegardes", libelle: "Sauvegardes", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/mot-de-passe", libelle: "Mon mot de passe" },
];

export default async function LayoutPortail({ children }: { children: React.ReactNode }) {
  const u = await exigerUtilisateur(undefined, { tousRoles: true });
  const menu = MENU.filter((m) => (!m.roles || m.roles.includes(u.role)) && !m.saufRoles?.includes(u.role));
  return (
    <>
      <header className="bg-marque text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Les dépôts sont exploités par Neolia Logistique : son logo accompagne l'espace des agents dépôt. */}
            {u.role === ROLES.AGENT_DEPOT && (
              <span className="rounded-md bg-[#f7f7f7] px-2 py-1">
                <img src={logoNeolia.src} alt="Neolia Logistique" width={logoNeolia.width} height={logoNeolia.height} className="h-7 w-auto" />
              </span>
            )}
            <Link href="/" className="font-semibold">Approvisionnement inter-dépôts · Radès</Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span>{u.nomComplet} · {LIBELLES_ROLES[u.role]}</span>
            <form action={seDeconnecter}>
              <button className="rounded border border-white/40 px-2 py-1 hover:bg-white/10">Déconnexion</button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4 pb-2">
          {menu.map((m) => (
            <Link key={m.href} href={m.href} className="rounded px-2 py-1 text-sm hover:bg-white/15">{m.libelle}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}

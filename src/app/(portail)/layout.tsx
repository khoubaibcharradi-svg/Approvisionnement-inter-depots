import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { LIBELLES_ROLES, ROLES, type CodeRole } from "@/lib/constantes";
import { seDeconnecter } from "../connexion/actions";

const MENU: { href: string; libelle: string; roles?: CodeRole[]; saufRoles?: CodeRole[] }[] = [
  { href: "/demandes", libelle: "Demandes" },
  { href: "/demandes/nouvelle", libelle: "Nouvelle demande", roles: [ROLES.SUPERVISEUR] },
  { href: "/catalogue", libelle: "Catalogue SKU", saufRoles: [ROLES.SUPERVISEUR] },
  { href: "/audit", libelle: "Journal d'audit", saufRoles: [ROLES.SUPERVISEUR, ROLES.CHEF_VENTE] },
  { href: "/statistiques", libelle: "Statistiques", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/admin/utilisateurs", libelle: "Utilisateurs", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/admin/sauvegardes", libelle: "Sauvegardes", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/mot-de-passe", libelle: "Mon mot de passe" },
];

export default async function LayoutPortail({ children }: { children: React.ReactNode }) {
  const u = await exigerUtilisateur();
  const menu = MENU.filter((m) => (!m.roles || m.roles.includes(u.role)) && !m.saufRoles?.includes(u.role));
  return (
    <>
      <header className="bg-marque text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link href="/demandes" className="font-semibold">Approvisionnement inter-dépôts · Radès</Link>
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

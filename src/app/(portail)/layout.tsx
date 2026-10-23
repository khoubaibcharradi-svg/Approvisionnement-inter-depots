import { exigerUtilisateur } from "@/lib/auth/session";
import { LIBELLES_ROLES, ROLES, type CodeRole } from "@/lib/constantes";
import { Navigation, type EntreeMenu } from "./navigation";
import logoNeolia from "../connexion/logos/logo-neolia.jpg";
import logoPromofood from "../connexion/logos/logo-promofood.jpg";

const MENU: (EntreeMenu & { roles?: CodeRole[]; saufRoles?: CodeRole[] })[] = [
  { href: "/demandes", libelle: "Demandes", icone: "demandes", section: "Approvisionnement", saufRoles: [ROLES.AGENT_DEPOT, ROLES.CONSULTANT_CR] },
  { href: "/demandes/nouvelle", libelle: "Nouvelle demande", icone: "ajout", section: "Approvisionnement", roles: [ROLES.SUPERVISEUR] },
  { href: "/catalogue", libelle: "Catalogue SKU", icone: "catalogue", section: "Approvisionnement", saufRoles: [ROLES.SUPERVISEUR, ROLES.AGENT_DEPOT, ROLES.CONSULTANT_CR] },
  { href: "/statistiques", libelle: "Statistiques", icone: "statistiques", section: "Approvisionnement", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/compte-rendu", libelle: "Compte rendu journalier", icone: "compteRendu", section: "Mon dépôt", roles: [ROLES.AGENT_DEPOT] },
  { href: "/compte-rendu/inventaire", libelle: "Inventaire", icone: "inventaire", section: "Mon dépôt", roles: [ROLES.AGENT_DEPOT] },
  { href: "/compte-rendu/vehicules", libelle: "Véhicules", icone: "vehicule", section: "Mon dépôt", roles: [ROLES.AGENT_DEPOT] },
  { href: "/compte-rendu/historique", libelle: "Historique", icone: "historique", section: "Mon dépôt", roles: [ROLES.AGENT_DEPOT] },
  { href: "/admin/comptes-rendus", libelle: "Comptes rendus dépôts", icone: "comptesRendus", section: "Dépôts", roles: [ROLES.ADMINISTRATEUR, ROLES.CONSULTANT_CR] },
  { href: "/admin/inventaires", libelle: "Inventaires", icone: "inventaire", section: "Dépôts", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/admin/magasins", libelle: "Magasins", icone: "magasin", section: "Dépôts", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/admin/vehicules", libelle: "Véhicules", icone: "vehicule", section: "Dépôts", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/audit", libelle: "Journal d'audit", icone: "audit", section: "Administration", saufRoles: [ROLES.SUPERVISEUR, ROLES.CHEF_VENTE, ROLES.AGENT_DEPOT, ROLES.CONSULTANT_CR] },
  { href: "/admin/utilisateurs", libelle: "Utilisateurs", icone: "utilisateurs", section: "Administration", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/admin/sauvegardes", libelle: "Sauvegardes", icone: "sauvegarde", section: "Administration", roles: [ROLES.ADMINISTRATEUR] },
  { href: "/mot-de-passe", libelle: "Mon mot de passe", icone: "cle", section: "Mon compte" },
];

/** Les dépôts sont exploités par Neolia Logistique : ses espaces (agents, consultation) en prennent la charte. */
const ROLES_NEOLIA: CodeRole[] = [ROLES.AGENT_DEPOT, ROLES.CONSULTANT_CR];

export default async function LayoutPortail({ children }: { children: React.ReactNode }) {
  const u = await exigerUtilisateur(undefined, { tousRoles: true });
  const menu = MENU.filter((m) => (!m.roles || m.roles.includes(u.role)) && !m.saufRoles?.includes(u.role)).map(({ href, libelle, icone, section }) => ({ href, libelle, icone, section }));
  const neolia = ROLES_NEOLIA.includes(u.role);
  const logo = neolia ? logoNeolia : logoPromofood;
  return (
    <div className={neolia ? "theme-neolia" : undefined}>
      <Navigation
        menu={menu}
        utilisateur={{ nom: u.nomComplet, role: LIBELLES_ROLES[u.role] }}
        logo={{ src: logo.src, alt: neolia ? "Neolia Logistique" : "Promofood", largeur: logo.width, hauteur: logo.height }}
      />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

import { exigerUtilisateur } from "@/lib/auth/session";
import { ROLES, type CodeRole } from "@/lib/constantes";
import { libellesRoles } from "@/lib/roles";
import { Navigation, type EntreeMenu } from "./navigation";
import { logo as chargerLogo, parametreTexte, textes } from "@/lib/referentiels";

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

/** Espaces des dépôts (agents, consultation) : charte Neolia, logo choisi par le paramètre LOGO_ESPACE_DEPOTS. */
const ROLES_NEOLIA: CodeRole[] = [ROLES.AGENT_DEPOT, ROLES.CONSULTANT_CR];

export default async function LayoutPortail({ children }: { children: React.ReactNode }) {
  const u = await exigerUtilisateur(undefined, { tousRoles: true });
  const menu = MENU.filter((m) => (!m.roles || m.roles.includes(u.role)) && !m.saufRoles?.includes(u.role)).map(({ href, libelle, icone, section }) => ({ href, libelle, icone, section }));
  const neolia = ROLES_NEOLIA.includes(u.role);
  const [t, logo] = await Promise.all([textes(), chargerLogo(await parametreTexte(neolia ? "LOGO_ESPACE_DEPOTS" : "LOGO_ESPACE_DEFAUT"))]);
  return (
    <div className={neolia ? "theme-neolia" : undefined}>
      <Navigation
        menu={menu}
        utilisateur={{ nom: u.nomComplet, role: (await libellesRoles())[u.role] }}
        logo={logo ? { src: logo.chemin, alt: logo.libelle } : null}
        nomPortail={t.NOM_PORTAIL}
        sousTitre={t.SOUS_TITRE_PORTAIL}
      />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

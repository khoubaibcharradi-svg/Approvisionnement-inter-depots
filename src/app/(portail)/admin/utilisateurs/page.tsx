import { exigerUtilisateur } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { LIBELLES_ROLES, ROLES } from "@/lib/constantes";
import { FicheUtilisateur, NouvelUtilisateur } from "./composants";

export default async function PageUtilisateurs() {
  const moi = await exigerUtilisateur([ROLES.ADMINISTRATEUR]);
  const [utilisateurs, canaux, depots] = await Promise.all([
    prisma.utilisateur.findMany({
      include: { affectations: { where: { isDeleted: false }, orderBy: { codeCanal: "asc" } } },
      orderBy: [{ codeRole: "asc" }, { nomComplet: "asc" }],
    }),
    prisma.canal.findMany({ where: { isActif: true }, orderBy: { ordre: "asc" } }),
    prisma.depot.findMany({ where: { isActif: true }, orderBy: { libelle: "asc" } }),
  ]);
  const ref = {
    roles: Object.entries(LIBELLES_ROLES).map(([code, libelle]) => ({ code, libelle })),
    canaux: canaux.map((c) => ({ code: c.code, libelle: c.libelle })),
    depots: depots.map((d) => ({ code: d.code, libelle: d.libelle })),
  };
  const maintenant = new Date();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Utilisateurs ({utilisateurs.length})</h1>
        <p className="note">Mots de passe hachés (bcrypt) : un mot de passe temporaire est affiché une seule fois à la création ou à la réinitialisation, et doit être changé à la première connexion.</p>
      </div>
      <NouvelUtilisateur reference={ref} />
      <div className="carte overflow-x-auto p-0">
        <table className="tableau">
          <thead><tr><th>Utilisateur</th><th>Fonction</th><th>Affectations</th><th>État</th><th>Dernière connexion</th><th></th></tr></thead>
          <tbody>
            {utilisateurs.map((u) => (
              <FicheUtilisateur
                key={u.login}
                moi={moi.login}
                reference={ref}
                utilisateur={{
                  login: u.login,
                  nomComplet: u.nomComplet,
                  email: u.email ?? "",
                  codeRole: u.codeRole,
                  isActif: u.isActif,
                  verrouille: !!u.verrouilleJusqua && u.verrouilleJusqua > maintenant,
                  doitChangerMotDePasse: u.doitChangerMotDePasse,
                  derniereConnexion: u.derniereConnexion?.toLocaleString("fr-FR") ?? null,
                  affectations: u.affectations.map((a) => ({ codeCanal: a.codeCanal, codeDepot: a.codeDepot })),
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

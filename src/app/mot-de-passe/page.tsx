import Link from "next/link";
import { exigerUtilisateur } from "@/lib/auth/session";
import { FormulaireMotDePasse } from "./formulaire";

export default async function PageMotDePasse({ searchParams }: { searchParams: Promise<{ obligatoire?: string }> }) {
  const u = await exigerUtilisateur(undefined, { autoriserMdpExpire: true });
  const { obligatoire } = await searchParams;
  return (
    <main className="mx-auto mt-12 max-w-sm px-4">
      <h1 className="mb-1 text-xl font-semibold">Mon mot de passe</h1>
      <p className="note mb-4">{u.nomComplet} · {u.login}</p>
      {(obligatoire || u.doitChangerMotDePasse) && (
        <p className="alerte-erreur mb-4">Vous devez définir un mot de passe personnel avant d&apos;utiliser le portail.</p>
      )}
      <FormulaireMotDePasse />
      {!u.doitChangerMotDePasse && (
        <Link href="/demandes" className="note mt-4 block underline">Retour aux demandes</Link>
      )}
    </main>
  );
}

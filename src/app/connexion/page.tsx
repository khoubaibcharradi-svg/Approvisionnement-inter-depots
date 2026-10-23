import { CarteTunisie } from "./carte-tunisie";
import { FormulaireConnexion } from "./formulaire";
import { logos, textes, zonesCarte } from "@/lib/referentiels";

// Textes, logos et zones viennent de la base : la page est rendue à chaque requête.
export const dynamic = "force-dynamic";

// Sur ordinateur, la page tient dans la hauteur de l'écran (sans ascenseur) : la carte prend la place restante.
export default async function PageConnexion() {
  const [t, tousLogos, zones] = await Promise.all([textes(), logos(), zonesCarte()]);
  const bandeau = tousLogos.filter((l) => l.afficheConnexion);
  return (
    <div className="flex min-h-screen flex-col bg-[#eef2f6] lg:h-screen lg:overflow-hidden">
      <div className="flex flex-1 flex-wrap lg:min-h-0 lg:flex-nowrap">
        <section className="flex min-w-0 flex-[1_1_560px] flex-col gap-4 px-6 pt-8 pb-4 sm:px-16 lg:min-h-0">
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="text-[13px] font-semibold tracking-[0.12em] text-marque uppercase">{t.SURTITRE_CONNEXION}</p>
            <h1 className="text-3xl leading-tight font-bold sm:text-[38px]">{t.TITRE_CONNEXION}</h1>
            <p className="leading-relaxed text-slate-600">{t.ACCROCHE_CONNEXION}</p>
          </div>
          {zones.length > 0 && (
            <figure className="mx-auto w-full max-w-[480px] lg:min-h-0 lg:max-w-none lg:flex-1">
              <CarteTunisie zones={zones} />
            </figure>
          )}
        </section>
        <section className="flex min-w-0 flex-[1_1_420px] items-center justify-center px-6 py-8 max-[1023px]:order-first">
          <FormulaireConnexion acces={t.ACCES_CONNEXION} />
        </section>
      </div>
      {bandeau.length > 0 && (
        <footer className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 border-t border-slate-200 bg-[#f7f7f7] px-8 py-3">
          <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">{t.TITRE_LOGOS}</p>
          {bandeau.map((l) => (
            <img key={l.code} src={l.chemin} alt={l.libelle} style={{ height: l.hauteur }} className="w-auto" />
          ))}
        </footer>
      )}
    </div>
  );
}

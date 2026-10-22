import { CarteTunisie } from "./carte-tunisie";
import { FormulaireConnexion } from "./formulaire";
import logoPromofood from "./logos/logo-promofood.jpg";
import logoBeesky from "./logos/logo-beesky.jpg";
import logoNeolia from "./logos/logo-neolia.jpg";
import logoProxim from "./logos/logo-proxim.jpg";
import logoCofill from "./logos/logo-cofill.jpg";

// Les logos sont servis depuis /_next/static : accessibles sans être connecté (exclus du filtre de proxy.ts).
const LOGOS = [
  { image: logoPromofood, nom: "Promofood", hauteur: "h-10" },
  { image: logoBeesky, nom: "Beesky", hauteur: "h-9" },
  { image: logoNeolia, nom: "Neolia Logistique", hauteur: "h-10" },
  { image: logoProxim, nom: "Proxim Distribution", hauteur: "h-14" },
  { image: logoCofill, nom: "COFILL", hauteur: "h-10" },
];

// Sur ordinateur, la page tient dans la hauteur de l'écran (sans ascenseur) : la carte prend la place restante.
export default function PageConnexion() {
  return (
    <div className="flex min-h-screen flex-col bg-[#eef2f6] lg:h-screen lg:overflow-hidden">
      <div className="flex flex-1 flex-wrap lg:min-h-0 lg:flex-nowrap">
        <section className="flex min-w-0 flex-[1_1_560px] flex-col gap-4 px-6 pt-8 pb-4 sm:px-16 lg:min-h-0">
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="text-[13px] font-semibold tracking-[0.12em] text-marque uppercase">Portail Promofood</p>
            <h1 className="text-3xl leading-tight font-bold sm:text-[38px]">Approvisionnement inter-dépôts</h1>
            <p className="leading-relaxed text-slate-600">
              Un seul portail pour suivre les flux entre Radès et les dépôts de nos cinq zones.
            </p>
          </div>
          <figure className="mx-auto w-full max-w-[480px] lg:min-h-0 lg:max-w-none lg:flex-1">
            <CarteTunisie />
          </figure>
        </section>
        <section className="flex min-w-0 flex-[1_1_420px] items-center justify-center px-6 py-8 max-[1023px]:order-first">
          <FormulaireConnexion />
        </section>
      </div>
      <footer className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 border-t border-slate-200 bg-[#f7f7f7] px-8 py-3">
        <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Les sociétés du groupe</p>
        {LOGOS.map((l) => (
          <img key={l.nom} src={l.image.src} alt={l.nom} width={l.image.width} height={l.image.height} className={`${l.hauteur} w-auto`} />
        ))}
      </footer>
    </div>
  );
}

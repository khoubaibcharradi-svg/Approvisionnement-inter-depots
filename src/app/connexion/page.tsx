import { CarteTunisie } from "./carte-tunisie";
import { FormulaireConnexion } from "./formulaire";
import logoPromofood from "./logos/logo-promofood.jpg";
import logoPlaton from "./logos/logo-platon.jpg";
import logoNeolia from "./logos/logo-neolia.jpg";
import logoProxim from "./logos/logo-proxim.jpg";
import logoCofill from "./logos/logo-cofill.jpg";

// Les logos sont servis depuis /_next/static : accessibles sans être connecté (exclus du filtre de proxy.ts).
const LOGOS = [
  { image: logoPromofood, nom: "Promofood", hauteur: "h-[52px]" },
  { image: logoPlaton, nom: "Platon Business & Management", hauteur: "h-[52px]" },
  { image: logoNeolia, nom: "Neolia Logistique", hauteur: "h-[52px]" },
  { image: logoProxim, nom: "Proxim Distribution", hauteur: "h-[72px]" },
  { image: logoCofill, nom: "COFILL", hauteur: "h-[52px]" },
];

export default function PageConnexion() {
  return (
    <div className="flex min-h-screen flex-col bg-[#eef2f6]">
      <div className="flex flex-1 flex-wrap">
        <section className="flex min-w-0 flex-[1_1_560px] flex-col gap-6 px-6 pt-10 pb-6 sm:px-16 sm:pt-12">
          <div className="flex max-w-2xl flex-col gap-3">
            <p className="text-[13px] font-semibold tracking-[0.12em] text-marque uppercase">Portail Promofood</p>
            <h1 className="text-3xl leading-tight font-bold sm:text-[38px]">Approvisionnement inter-dépôts</h1>
            <p className="leading-relaxed text-slate-600">
              Un seul portail pour suivre les flux entre Radès et les dépôts de nos cinq zones.
            </p>
          </div>
          <figure className="mx-auto w-full max-w-[480px]">
            <CarteTunisie />
          </figure>
        </section>
        <section className="flex min-w-0 flex-[1_1_420px] items-center justify-center px-6 py-12 max-[980px]:order-first">
          <FormulaireConnexion />
        </section>
      </div>
      <footer className="flex flex-col items-center gap-4 border-t border-slate-200 bg-[#f7f7f7] px-8 py-6">
        <p className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Les sociétés du groupe</p>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {LOGOS.map((l) => (
            <img key={l.nom} src={l.image.src} alt={l.nom} width={l.image.width} height={l.image.height} className={`${l.hauteur} w-auto`} />
          ))}
        </div>
        <p className="text-[11px] text-slate-500">Fond de carte : geoBoundaries (CC BY 4.0)</p>
      </footer>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icone, type NomIcone } from "@/components/icone";
import { seDeconnecter } from "../connexion/actions";

export type EntreeMenu = { href: string; libelle: string; icone: NomIcone; section: string };
type Props = {
  menu: EntreeMenu[];
  utilisateur: { nom: string; role: string };
  logo: { src: string; alt: string } | null;
  nomPortail: string;
  sousTitre: string;
};

/** Lien actif : l'entrée dont l'adresse est le plus long préfixe de la page courante. */
function actif(menu: EntreeMenu[], chemin: string) {
  return menu
    .filter((m) => chemin === m.href || chemin.startsWith(`${m.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function Contenu({ menu, utilisateur, logo, nomPortail, sousTitre, onNaviguer }: Props & { onNaviguer?: () => void }) {
  const chemin = usePathname();
  const courant = actif(menu, chemin);
  const sections = [...new Set(menu.map((m) => m.section))];
  const initiales = utilisateur.nom.split(/\s+/).map((m) => m[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 px-5 pt-6 pb-4">
        {logo && (
          <div className="flex h-14 items-center justify-center rounded-xl bg-[#f7f7f7] px-3">
            <img src={logo.src} alt={logo.alt} className="h-9 w-auto" />
          </div>
        )}
        <div className="px-1">
          <p className="text-sm font-semibold text-slate-900">{nomPortail}</p>
          <p className="text-xs text-slate-500">{sousTitre}</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Navigation principale">
        {sections.map((s) => (
          <div key={s} className="mt-4 first:mt-0">
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{s}</p>
            <ul className="flex flex-col gap-0.5">
              {menu.filter((m) => m.section === s).map((m) => {
                const estActif = m.href === courant;
                return (
                  <li key={m.href}>
                    <Link href={m.href} onClick={onNaviguer} aria-current={estActif ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        estActif ? "bg-marque-pale font-semibold text-marque" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}>
                      <Icone nom={m.icone} className={`h-[18px] w-[18px] shrink-0 ${estActif ? "text-marque" : "text-slate-400"}`} />
                      {m.libelle}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marque text-sm font-semibold text-white" aria-hidden="true">{initiales}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{utilisateur.nom}</p>
            <p className="truncate text-xs text-slate-500">{utilisateur.role}</p>
          </div>
          <form action={seDeconnecter}>
            <button className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-red-700" aria-label="Déconnexion" title="Déconnexion">
              <Icone nom="sortie" className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function Navigation(props: Props) {
  const [ouvert, setOuvert] = useState(false);
  const chemin = usePathname();
  useEffect(() => setOuvert(false), [chemin]);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <Contenu {...props} />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          {props.logo && (
            <span className="rounded-lg bg-[#f7f7f7] px-2 py-1">
              <img src={props.logo.src} alt={props.logo.alt} className="h-6 w-auto" />
            </span>
          )}
          <span className="text-sm font-semibold text-slate-900">{props.nomPortail}</span>
        </div>
        <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Ouvrir le menu" aria-expanded={ouvert} onClick={() => setOuvert(true)}>
          <Icone nom="menu" />
        </button>
      </header>

      {ouvert && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-slate-900/40" aria-label="Fermer le menu" onClick={() => setOuvert(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <button className="absolute top-3 right-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fermer le menu" onClick={() => setOuvert(false)}>
              <Icone nom="fermer" />
            </button>
            <Contenu {...props} onNaviguer={() => setOuvert(false)} />
          </div>
        </div>
      )}
    </>
  );
}

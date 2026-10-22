import { TRACES } from "./carte-tunisie-traces";

/** Zones couvertes : point d'ancrage dans la zone, position et alignement de l'étiquette. */
const ZONES = [
  { trace: TRACES.GRAND_TUNIS, nom: "Grand Tunis", point: [190, 62], ligne: [238, 14], texte: [243, 19], ancre: "start" },
  { trace: TRACES.CAP_BON, nom: "Cap Bon", point: [234, 74], ligne: [300, 74], texte: [306, 80], ancre: "start" },
  { trace: TRACES.SOUSSE, nom: "Sousse", point: [212, 145], ligne: [300, 145], texte: [306, 151], ancre: "start" },
  { trace: TRACES.SFAX, nom: "Sfax", point: [212, 240], ligne: [300, 240], texte: [306, 246], ancre: "start" },
  { trace: TRACES.JENDOUBA, nom: "Jendouba", point: [84, 82], ligne: [-6, 82], texte: [-12, 88], ancre: "end" },
] as const;

export function CarteTunisie() {
  return (
    <svg
      role="img"
      aria-label={`Carte de la Tunisie : zones ${ZONES.map((z) => z.nom).join(", ")}`}
      viewBox="-115 0 510 631"
      className="mx-auto block h-auto w-full lg:h-full lg:w-auto lg:max-w-full"
    >
      {/* Crédit exigé par la licence CC BY 4.0 du fond de carte : affiché au survol de la carte. */}
      <title>Fond de carte : geoBoundaries (CC BY 4.0)</title>
      <g stroke="#ffffff" strokeWidth="1" strokeLinejoin="round">
        <path fill="#cbd5e1" d={TRACES.AUTRES} />
        {ZONES.map((z) => (
          <path key={z.nom} className="fill-marque" d={z.trace} />
        ))}
      </g>
      {ZONES.map((z) => (
        <g key={z.nom}>
          <path d={`M${z.point[0]} ${z.point[1]} L${z.ligne[0]} ${z.ligne[1]}`} stroke="#334155" strokeWidth="1.2" fill="none" />
          <circle cx={z.point[0]} cy={z.point[1]} r="4" fill="#ffffff" stroke="#334155" strokeWidth="1.5" />
          <text x={z.texte[0]} y={z.texte[1]} textAnchor={z.ancre} fontSize="17" fontWeight="600" fill="#0f172a">
            {z.nom}
          </text>
        </g>
      ))}
    </svg>
  );
}

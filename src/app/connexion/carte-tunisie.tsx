import { GOUVERNORATS } from "./carte-tunisie-traces";

type Zone = { code: string; libelle: string; gouvernorats: string[] };

const ECART_MIN = 34; // espacement vertical minimal entre deux étiquettes d'un même côté
const BORD_DROIT = 300;
const BORD_GAUCHE = -6;

/**
 * Place les étiquettes des zones (lues en base) : à droite de la carte si la zone est à l'est, à gauche sinon,
 * puis écarte verticalement celles qui se chevauchent.
 */
function etiquettes(zones: Zone[]) {
  const placees = zones
    .map((z) => {
      const centres = z.gouvernorats.map((g) => GOUVERNORATS[g]).filter(Boolean);
      if (!centres.length) return null;
      const cx = centres.reduce((s, c) => s + c.cx, 0) / centres.length;
      const cy = centres.reduce((s, c) => s + c.cy, 0) / centres.length;
      return { ...z, cx, cy, ly: cy, droite: cx >= 120 };
    })
    .filter((z): z is NonNullable<typeof z> => z !== null);
  for (const cote of [true, false]) {
    const groupe = placees.filter((z) => z.droite === cote).sort((a, b) => a.cy - b.cy);
    for (let i = 1; i < groupe.length; i++) {
      if (groupe[i].ly - groupe[i - 1].ly < ECART_MIN) groupe[i].ly = groupe[i - 1].ly + ECART_MIN;
    }
    // Recentre le groupe sur la position moyenne d'origine pour limiter le décalage.
    const decalage = groupe.reduce((s, z) => s + (z.ly - z.cy), 0) / (groupe.length || 1);
    for (const z of groupe) z.ly = Math.max(14, z.ly - decalage / 2);
  }
  return placees;
}

export function CarteTunisie({ zones }: { zones: Zone[] }) {
  const enEvidence = new Set(zones.flatMap((z) => z.gouvernorats));
  const places = etiquettes(zones);
  return (
    <svg
      role="img"
      aria-label={`Carte de la Tunisie : zones ${zones.map((z) => z.libelle).join(", ")}`}
      viewBox="-125 0 560 631"
      className="mx-auto block h-auto w-full lg:h-full lg:w-auto lg:max-w-full"
    >
      {/* Crédit exigé par la licence CC BY 4.0 du fond de carte : affiché au survol de la carte. */}
      <title>Fond de carte : geoBoundaries (CC BY 4.0)</title>
      <g stroke="#ffffff" strokeWidth="1" strokeLinejoin="round">
        {Object.entries(GOUVERNORATS).map(([iso, g]) => (
          <path key={iso} d={g.d} className={enEvidence.has(iso) ? "fill-marque" : undefined} fill={enEvidence.has(iso) ? undefined : "#cbd5e1"} />
        ))}
      </g>
      {places.map((z) => {
        const bord = z.droite ? BORD_DROIT : BORD_GAUCHE;
        return (
          <g key={z.code}>
            <path d={`M${z.cx} ${z.cy} L${bord} ${z.ly}`} stroke="#334155" strokeWidth="1.2" fill="none" />
            <circle cx={z.cx} cy={z.cy} r="4" fill="#ffffff" stroke="#334155" strokeWidth="1.5" />
            <text x={z.droite ? bord + 6 : bord - 6} y={z.ly + 6} textAnchor={z.droite ? "start" : "end"} fontSize="17" fontWeight="600" fill="#0f172a">
              {z.libelle}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

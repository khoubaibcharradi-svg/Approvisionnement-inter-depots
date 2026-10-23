import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";

/**
 * Politique de sécurité du contenu : la page ne charge que des ressources du portail lui-même
 * (aucun script, style, image ou formulaire externe), ne peut pas être affichée dans un cadre
 * et n'envoie ses formulaires qu'au portail. 'unsafe-inline' reste nécessaire aux scripts
 * d'hydratation et aux styles de Next.js ; 'unsafe-eval' uniquement en développement.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${production ? "" : " ws: wss:"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Adresses autorisées à ouvrir le serveur de développement depuis le réseau (ex. "192.168.1.243")
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
  serverExternalPackages: ["exceljs", "bcryptjs"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: CSP },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // HTTPS obligatoire pour le navigateur pendant 1 an (production uniquement, le poste de dev est en HTTP)
          ...(production
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;

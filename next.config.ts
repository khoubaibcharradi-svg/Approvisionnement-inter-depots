import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";

// La politique de sécurité du contenu (CSP) est posée par src/proxy.ts, avec un nonce par requête.

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

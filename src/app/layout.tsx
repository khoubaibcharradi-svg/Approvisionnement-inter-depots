import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { textes } from "@/lib/referentiels";

// Police auto-hébergée à la compilation : aucun appel à Google depuis le navigateur.
const inter = Inter({ subsets: ["latin"], variable: "--police-inter", display: "swap" });

// Toutes les pages sont rendues à la demande : nécessaire au nonce de la politique de sécurité (proxy.ts),
// et les textes viennent de la base (jamais figés à la compilation).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const t = await textes();
    return { title: t.TITRE_CONNEXION, description: `${t.TITRE_CONNEXION} · ${t.SOUS_TITRE_PORTAIL}` };
  } catch {
    return { title: "Portail" };
  }
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Police auto-hébergée à la compilation : aucun appel à Google depuis le navigateur.
const inter = Inter({ subsets: ["latin"], variable: "--police-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Approvisionnement inter-dépôts",
  description: "Portail d'approvisionnement commercial et de traçabilité inter-dépôts — Radès",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

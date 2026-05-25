import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteShell } from "@/components/SiteShell";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "Prompta — Marketplace de prompts, agents & workflows IA",
    template: "%s | Prompta",
  },
  description:
    "Découvrez, achetez et publiez des prompts, agents et workflows IA prêts à l'emploi. Bundles complets avec environnement, guide et versioning.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    siteName: "Prompta",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-body bg-bg text-ink antialiased`}
      >
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}

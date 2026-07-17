import type { Metadata } from "next";
import Script from "next/script";
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
    default: "Prompta — l'IA qui voit ton écran et fait le travail",
    template: "%s | Prompta",
  },
  description:
    "L'assistant IA dans ton navigateur : réponse instantanée sur n'importe quelle page, missions complètes sur tes apps, pilotage du navigateur sous tes yeux — avec validation humaine.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    siteName: "Prompta",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Prompta — l'IA qui voit ton écran et fait le travail",
    description:
      "Réponse instantanée sur n'importe quelle page, missions cross-app, pilotage du navigateur — avec ton feu vert.",
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
        {/* Analytics privacy-first — actif seulement si le domaine est configuré. */}
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
          <Script
            defer
            data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.tagged-events.js"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const MINIMAL_CHROME_PREFIXES = ["/admin"];

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const minimal = MINIMAL_CHROME_PREFIXES.some((p) => pathname.startsWith(p));

  if (minimal) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      <Footer />
    </>
  );
}

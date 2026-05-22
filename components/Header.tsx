import Link from "next/link";
import { Search, Zap } from "lucide-react";
import dynamic from "next/dynamic";

const AuthNav = dynamic(() => import("@/components/AuthNav").then((m) => m.AuthNav), {
  ssr: false,
  loading: () => <div className="h-9 w-20 animate-pulse rounded-lg bg-border" />,
});

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Zap className="h-7 w-7 text-accent" strokeWidth={2.5} />
          <span className="text-xl font-bold tracking-tight">Prompta</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/explore"
            className="text-sm font-medium text-muted hover:text-foreground transition-colors"
          >
            Explorer
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-muted hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/explore"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent-light transition-colors"
          >
            <Search className="h-4 w-4" />
          </Link>
          <AuthNav />
        </div>
      </div>
    </header>
  );
}

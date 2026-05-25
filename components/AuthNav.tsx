"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, User } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export function AuthNav() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setLoading(false);
      return;
    }

    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();

      supabase.auth.getUser().then(({ data }) => {
        setUser(data.user);
        setLoading(false);
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

      return () => subscription.unsubscribe();
    });
  }, []);

  if (loading) {
    return <div className="h-9 w-20 animate-pulse rounded-lg bg-border" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          prefetch
          className="rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink transition-colors"
        >
          Connexion
        </Link>
        <Link
          href="/signup"
          prefetch
          className="hidden rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors sm:inline-flex"
        >
          S&apos;inscrire
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/dashboard"
        prefetch
        className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-light text-accent hover:bg-accent hover:text-white transition-colors"
      >
        <User className="h-4 w-4" />
      </Link>
      <button
        onClick={async () => {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          await supabase.auth.signOut();
          window.location.href = "/";
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent-light transition-colors"
        title="Déconnexion"
      >
        <LogOut className="h-4 w-4 text-muted" />
      </button>
    </div>
  );
}

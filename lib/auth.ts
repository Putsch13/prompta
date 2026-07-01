import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthResult {
  userId: string;
  isAdmin: boolean;
}

/**
 * Vérifie que l'utilisateur est authentifié.
 * Redirige vers /login si non connecté.
 */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  return {
    userId: user.id,
    isAdmin: profile?.is_admin ?? false,
  };
}

/**
 * Vérifie que l'utilisateur est un administrateur.
 * Redirige vers /login si non connecté, vers / si non admin.
 */
export async function requireAdmin(): Promise<AuthResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    redirect("/");
  }

  return {
    userId: user.id,
    isAdmin: true,
  };
}

/**
 * Vérifie les permissions admin côté API (pour les routes API).
 * Retourne null si l'utilisateur n'est pas admin.
 */
export async function checkAdminApi(): Promise<AuthResult | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return null;
  }

  return {
    userId: user.id,
    isAdmin: true,
  };
}

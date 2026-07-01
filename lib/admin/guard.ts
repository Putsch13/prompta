/**
 * lib/admin/guard.ts
 * ────────────────────────────────────────────────────────────
 * Contrôle d'accès à l'espace admin.
 *
 * Un utilisateur n'accède à /admin que si profiles.is_admin = true.
 * À utiliser au début de chaque page/route admin.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminUser = {
  id: string;
  username: string;
  display_name: string;
};

/**
 * Vérifie que l'utilisateur courant est admin.
 * Redirige vers /login s'il n'est pas connecté, vers / s'il n'est pas admin.
 * Renvoie les infos de l'admin sinon.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, is_admin")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_admin) {
    // Pas admin → on renvoie à l'accueil sans révéler l'existence de /admin
    redirect("/");
  }

  return {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
  };
}

/** Variante pour les routes API : renvoie null si non-admin (pas de redirect). */
export async function getAdminOrNull(): Promise<AdminUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, is_admin")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_admin) return null;
  return { id: profile.id, username: profile.username, display_name: profile.display_name };
}

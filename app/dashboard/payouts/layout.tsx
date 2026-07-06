import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Stripe Connect (encaissements) = configuration PLATEFORME, réservée admin.
 * Prompta n'est plus une marketplace : les utilisateurs n'ont rien à encaisser.
 */
export default async function PayoutsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/dashboard");

  return <>{children}</>;
}

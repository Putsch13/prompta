import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function AdminNavLink() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return null;

  return (
    <Link
      href="/admin"
      className="hidden text-sm font-medium text-ink-soft hover:text-accent transition-colors md:block"
    >
      Admin
    </Link>
  );
}

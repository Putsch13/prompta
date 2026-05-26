import { createAdminClient } from "@/lib/supabase/admin";

export interface UserPrivileges {
  isAdmin: boolean;
  unrestricted: boolean;
  email: string | null;
}

const HARDCODED_UNRESTRICTED = new Set(
  ["puccini.f13@gmail.com", ...(process.env.UNRESTRICTED_EMAILS?.split(",").map((e) => e.trim().toLowerCase()) ?? [])].filter(
    Boolean
  )
);

/** Plafonds élevés pour comptes sans restriction (admin / QA). */
export const UNRESTRICTED_LIMITS = {
  max_steps: 50,
  max_tokens: 500_000,
  timeout_ms: 600_000,
  max_tool_calls: 50,
  max_output_bytes: 512_000,
};

export async function getUserPrivileges(userId: string): Promise<UserPrivileges> {
  const admin = createAdminClient();

  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const email = authData.user?.email?.toLowerCase() ?? null;

  if (email && HARDCODED_UNRESTRICTED.has(email)) {
    await admin
      .from("profiles")
      .update({ is_admin: true, unrestricted_usage: true })
      .eq("id", userId);
    return { isAdmin: true, unrestricted: true, email };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin, unrestricted_usage")
    .eq("id", userId)
    .maybeSingle();

  const isAdmin = Boolean(profile?.is_admin);
  const unrestricted = Boolean(profile?.unrestricted_usage) || isAdmin;

  return { isAdmin, unrestricted, email };
}

export async function isUnrestrictedUser(userId: string): Promise<boolean> {
  const p = await getUserPrivileges(userId);
  return p.unrestricted;
}

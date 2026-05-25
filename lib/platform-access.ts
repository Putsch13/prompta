import { createAdminClient } from "@/lib/supabase/admin";

export async function hasPlatformPro(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_subscriptions")
    .select("status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return !!data;
}

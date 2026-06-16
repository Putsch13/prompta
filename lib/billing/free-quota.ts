import { createAdminClient } from "@/lib/supabase/admin";
import { FREE_RUNS_PER_DAY } from "./credits";

/** Vérifie et consomme une run du quota gratuit journalier. */
export async function consumeFreeRunQuota(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const { data: quota } = await supabase
    .from("free_run_quota")
    .select("runs_today, last_reset")
    .eq("user_id", userId)
    .maybeSingle();

  if (!quota) {
    await supabase.from("free_run_quota").insert({ user_id: userId, runs_today: 1, last_reset: today });
    return true;
  }

  if (quota.last_reset !== today) {
    await supabase
      .from("free_run_quota")
      .update({ runs_today: 1, last_reset: today })
      .eq("user_id", userId);
    return true;
  }

  if ((quota.runs_today ?? 0) >= FREE_RUNS_PER_DAY) return false;

  await supabase
    .from("free_run_quota")
    .update({ runs_today: (quota.runs_today ?? 0) + 1 })
    .eq("user_id", userId);

  return true;
}

export async function getFreeRunsRemaining(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const { data: quota } = await supabase
    .from("free_run_quota")
    .select("runs_today, last_reset")
    .eq("user_id", userId)
    .maybeSingle();

  if (!quota || quota.last_reset !== today) return FREE_RUNS_PER_DAY;
  return Math.max(0, FREE_RUNS_PER_DAY - (quota.runs_today ?? 0));
}

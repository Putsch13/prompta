import { createAdminClient } from "@/lib/supabase/admin";
import { FREE_RUNS_PER_DAY } from "./credits";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Vérifie et consomme une run du quota gratuit journalier. */
export async function consumeFreeRunQuota(
  userId: string,
  adminOverride?: AdminClient
): Promise<boolean> {
  const supabase = adminOverride ?? createAdminClient();

  // Atomique : reset de jour + incrément conditionnel en un seul UPDATE —
  // N requêtes parallèles à limite-1 ne passent plus toutes.
  const { data: rpcResult, error: rpcError } = await supabase.rpc("consume_free_run_quota", {
    p_user_id: userId,
    p_limit: FREE_RUNS_PER_DAY,
  });
  if (!rpcError) return rpcResult === true;

  // Fallback pré-migration 0050 : read-then-write (racy).
  console.warn("[free-quota] consume RPC unavailable, using JS fallback:", rpcError.message);

  const today = new Date().toISOString().split("T")[0];

  let { data: quota } = await supabase
    .from("free_run_quota")
    .select("runs_today, last_reset")
    .eq("user_id", userId)
    .maybeSingle();

  if (!quota) {
    const { error: insertErr } = await supabase
      .from("free_run_quota")
      .insert({ user_id: userId, runs_today: 1, last_reset: today });
    if (!insertErr) return true;

    // 23505 : une requête concurrente a créé la ligne — relire et passer par
    // le chemin incrément pour ne pas offrir une run hors quota.
    const { data: raced } = await supabase
      .from("free_run_quota")
      .select("runs_today, last_reset")
      .eq("user_id", userId)
      .maybeSingle();
    if (!raced) return true; // ligne toujours absente : ne bloque pas l'utilisateur
    quota = raced;
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

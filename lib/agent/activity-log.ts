import { createAdminClient } from "@/lib/supabase/admin";

export interface LogActivityParams {
  userId: string;
  runId?: string;
  listingId?: string;
  actionType: "llm" | "tool" | "action" | "code";
  actionLabel: string;
  detail?: Record<string, unknown>;
  simulated?: boolean;
}

export async function logRunActivity(params: LogActivityParams): Promise<void> {
  const admin = createAdminClient();
  await admin.from("user_run_activity").insert({
    user_id: params.userId,
    run_id: params.runId ?? null,
    listing_id: params.listingId ?? null,
    action_type: params.actionType,
    action_label: params.actionLabel,
    detail: (params.detail ?? {}) as import("@/lib/types.db").Json,
    simulated: params.simulated ?? false,
  });
}

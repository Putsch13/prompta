import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["completed", "failed", "suspended", "cancelled"]);
const POLL_MS = 600;

interface Params {
  params: { runId: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Non authentifié", { status: 401 });
  }

  const admin = createAdminClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      try {
        while (!closed) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: run } = await (admin as any)
            .from("listing_agent_runs")
            .select("id, status, output, error_message, steps_completed, started_at, heartbeat_at")
            .eq("id", params.runId)
            .eq("user_id", user.id)
            .maybeSingle();

          if (!run) {
            send("error", { message: "Run non trouvé" });
            close();
            return;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: steps } = await (admin as any)
            .from("listing_agent_run_steps")
            .select("id, step_index, step_type, label, status, output_preview, error_code, error_message, started_at, finished_at")
            .eq("run_id", params.runId)
            .order("step_index", { ascending: true });

          let approval_id: string | null = null;
          let approval: {
            id: string;
            label?: string;
            preview?: string;
            step_index: number;
          } | null = null;
          if (run.status === "awaiting_approval") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: pending } = await (admin as any)
              .from("agent_approvals")
              .select("id, payload, step_index")
              .eq("run_id", params.runId)
              .eq("status", "pending")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (pending) {
              approval_id = pending.id;
              const payload = (pending.payload ?? {}) as { label?: string; preview?: string };
              approval = {
                id: pending.id,
                label: payload.label,
                preview: payload.preview,
                step_index: pending.step_index,
              };
            }
          }

          send("run", {
            id: run.id,
            status: run.status,
            steps_completed: run.steps_completed,
            error_message: run.error_message,
            started_at: run.started_at,
            heartbeat_at: run.heartbeat_at,
            approval_id,
            approval,
          });

          send("steps", { steps: steps ?? [] });

          if (TERMINAL.has(run.status) || run.status === "awaiting_approval") {
            close();
            return;
          }

          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : "Erreur stream",
        });
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types.db";

function db() {
  return createAdminClient();
}

export async function getRelevantMemories(
  listingId: string,
  userId: string,
  query: string,
  limit = 5
): Promise<string[]> {
  const { data } = await db()
    .from("agent_memories")
    .select("content, key")
    .eq("listing_id", listingId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  if (!data?.length) return [];

  const q = query.toLowerCase();
  const scored = data.map((m: { content: string; key: string | null }) => {
    const text = `${m.key ?? ""} ${m.content}`.toLowerCase();
    const score = q.split(/\s+/).filter(Boolean).reduce((acc, word) => acc + (text.includes(word) ? 1 : 0), 0);
    return { content: m.content, score };
  });

  return scored
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, limit)
    .map((m: { content: string }) => m.content);
}

export async function saveRunMemory(params: {
  listingId: string;
  userId: string;
  runId: string;
  content: string;
  key?: string;
  memoryType?: "run" | "agent" | "user" | "fact";
}): Promise<void> {
  await db().from("agent_memories").insert({
    listing_id: params.listingId,
    user_id: params.userId,
    run_id: params.runId,
    memory_type: params.memoryType ?? "run",
    key: params.key,
    content: params.content.slice(0, 4000),
  });
}

export async function saveKnowledgeChunk(
  sourceId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db().from("agent_knowledge_chunks").insert({
    source_id: sourceId,
    content: content.slice(0, 8000),
    metadata: (metadata ?? {}) as Json,
  });
}

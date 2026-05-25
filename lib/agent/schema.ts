import { z } from "zod";

export const AgentInputSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "file"]).default("text"),
  required: z.boolean().default(false),
});

export const AgentStepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("llm"),
    model: z.string(),
    prompt: z.string(),
  }),
  z.object({
    type: z.literal("tool"),
    tool: z.enum(["web_search", "http_fetch", "file_read"]),
    params: z.record(z.string(), z.string()).default({}),
  }),
]);

export const AgentManifestSchema = z.object({
  inputs: z.array(AgentInputSchema).default([]),
  secrets: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  steps: z.array(AgentStepSchema).default([]),
  limits: z
    .object({
      max_steps: z.number().default(10),
      max_tokens: z.number().default(8000),
      timeout_ms: z.number().default(60000),
    })
    .default({ max_steps: 10, max_tokens: 8000, timeout_ms: 60000 }),
  outputs: z.array(z.string()).default(["result"]),
});

export type AgentManifest = z.infer<typeof AgentManifestSchema>;
export type AgentStep = z.infer<typeof AgentStepSchema>;

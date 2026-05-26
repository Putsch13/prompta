import { z } from "zod";

export const AgentInputSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "number", "file", "list"]).default("text"),
  required: z.boolean().default(false),
  help: z.string().optional(),
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
  z.object({
    type: z.literal("action"),
    connector: z.string(),
    action: z.string(),
    params: z.record(z.string(), z.string()).default({}),
  }),
  z.object({
    type: z.literal("code"),
    language: z.enum(["python"]).default("python"),
    source: z.string(),
  }),
]);

export const AgentManifestSchema = z.object({
  inputs: z.array(AgentInputSchema).default([]),
  secrets: z.array(z.string()).default([]),
  connectors: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  steps: z.array(AgentStepSchema).default([]),
  limits: z
    .object({
      max_steps: z.number().default(10),
      max_tokens: z.number().default(8000),
      timeout_ms: z.number().default(60000),
      max_tool_calls: z.number().default(5),
      max_output_bytes: z.number().default(51200),
    })
    .default({ max_steps: 10, max_tokens: 8000, timeout_ms: 60000, max_tool_calls: 5, max_output_bytes: 51200 }),
  outputs: z.array(z.string()).default(["result"]),
});

export type AgentManifest = z.infer<typeof AgentManifestSchema>;
export type AgentStep = z.infer<typeof AgentStepSchema>;

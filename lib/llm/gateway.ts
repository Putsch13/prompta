import type { LLMProvider } from "./providers";
import type { TokenParam } from "@/lib/catalogs";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CallModelParams {
  provider: LLMProvider;
  model: string;
  messages: ChatMessage[];
  apiKey: string;
  stream?: boolean;
  maxTokens?: number;
  tokenParam?: TokenParam;
}

export interface CallModelResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: LLMProvider;
}

/**
 * Non-retryable status codes and error codes — exported for use by callers
 * that need to distinguish retryable vs. fatal provider errors.
 */
export const NON_RETRYABLE_STATUSES = [401, 403, 429];
export const NON_RETRYABLE_ERROR_CODES = [
  "invalid_api_key",
  "authentication_error",
  "insufficient_quota",
  "billing_not_active",
  "permission_denied",
  "rate_limit_exceeded",
];

function parseProviderError(provider: string, status: number, body: string): Error {
  let errorMessage = `${provider}: ${status}`;
  let errorCode = "";
  try {
    const errJson = JSON.parse(body);
    errorMessage = errJson.error?.message ?? body;
    errorCode = errJson.error?.code ?? errJson.error?.type ?? "";
  } catch {
    errorMessage = body;
  }

  const prefix = `[${provider}] ${status}`;
  if (errorCode) {
    return new Error(`${prefix} (${errorCode}) ${errorMessage}`);
  }
  return new Error(`${prefix} ${errorMessage}`);
}

async function callOpenAI(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  maxTokens = 4096,
  tokenParam: TokenParam = "max_tokens"
): Promise<CallModelResult> {
  const tokenConfig =
    tokenParam === "max_completion_tokens"
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, ...tokenConfig }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw parseProviderError("OpenAI", res.status, body);
  }

  const data = await res.json();
  return {
    content: data.choices[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    model,
    provider: "openai",
  };
}

async function callAnthropic(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  maxTokens = 4096
): Promise<CallModelResult> {
  const system = messages.find((m) => m.role === "system")?.content;
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: chatMessages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw parseProviderError("Anthropic", res.status, body);
  }

  const data = await res.json();
  return {
    content: data.content[0]?.text ?? "",
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    model,
    provider: "anthropic",
  };
}

async function callGoogle(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  maxTokens = 4096
): Promise<CallModelResult> {
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages.find((m) => m.role === "system")?.content;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction }] }
          : undefined,
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw parseProviderError("Google", res.status, body);
  }

  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  return {
    content: text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    model,
    provider: "google",
  };
}

async function callMistral(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  maxTokens = 4096
): Promise<CallModelResult> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw parseProviderError("Mistral", res.status, body);
  }

  const data = await res.json();
  return {
    content: data.choices[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    model,
    provider: "mistral",
  };
}

async function callProvider(
  params: CallModelParams
): Promise<CallModelResult> {
  const { provider, model, messages, apiKey, maxTokens, tokenParam } = params;

  switch (provider) {
    case "openai":
      return callOpenAI(model, messages, apiKey, maxTokens, tokenParam);
    case "anthropic":
      return callAnthropic(model, messages, apiKey, maxTokens);
    case "google":
      return callGoogle(model, messages, apiKey, maxTokens);
    case "mistral":
      return callMistral(model, messages, apiKey, maxTokens);
    default:
      throw new Error(`Provider inconnu: ${provider}`);
  }
}

/**
 * Appelle un modèle LLM. Ne fait JAMAIS de fallback sur :
 * - 401 (clé invalide)
 * - 403 (permission refusée)
 * - 429 (rate limit / quota)
 * - insufficient_quota, billing_not_active, invalid_api_key
 *
 * Fallback autorisé UNIQUEMENT sur model_not_found / 404.
 */
export async function callModel(
  params: CallModelParams
): Promise<CallModelResult> {
  return callProvider(params);
}

/** Streaming simulé en V1 — découpe la réponse en chunks. */
export async function* streamModel(
  params: CallModelParams
): AsyncGenerator<string, CallModelResult, undefined> {
  const result = await callModel({ ...params, stream: false });
  const chunks = result.content.match(/.{1,20}/g) ?? [result.content];
  for (const chunk of chunks) {
    yield chunk;
    await new Promise((r) => setTimeout(r, 10));
  }
  return result;
}

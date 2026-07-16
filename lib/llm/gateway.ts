import type { LLMProvider } from "./providers";
import type { TokenParam } from "@/lib/catalogs";
import { inferOpenAITokenParam } from "./resolve-model";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CallModelParams {
  provider: LLMProvider;
  model: string;
  messages: ChatMessage[];
  apiKey: string;
  maxTokens?: number;
  tokenParam?: TokenParam;
}

export interface CallModelResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: LLMProvider;
  /** Raison d'arrêt (ex. "max_tokens"/"length" = réponse tronquée). */
  stopReason?: string;
  /** Vrai si la réponse a été coupée par la limite de tokens. */
  truncated?: boolean;
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

function openAITokenConfig(tokenParam: TokenParam, maxTokens: number) {
  return tokenParam === "max_completion_tokens"
    ? { max_completion_tokens: maxTokens }
    : { max_tokens: maxTokens };
}

function openAIUnsupportedTokenParam(body: string): boolean {
  return (
    body.includes("unsupported_parameter") &&
    body.includes("max_tokens") &&
    body.includes("max_completion_tokens")
  );
}

async function callOpenAI(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  maxTokens = 4096,
  tokenParam?: TokenParam
): Promise<CallModelResult> {
  let effectiveParam = tokenParam ?? inferOpenAITokenParam(model);

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        ...openAITokenConfig(effectiveParam, maxTokens),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (
        attempt === 0 &&
        effectiveParam === "max_tokens" &&
        openAIUnsupportedTokenParam(body)
      ) {
        effectiveParam = "max_completion_tokens";
        continue;
      }
      throw parseProviderError("OpenAI", res.status, body);
    }

    const data = await res.json();
    const finish = data.choices[0]?.finish_reason;
    return {
      content: data.choices[0]?.message?.content ?? "",
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model,
      provider: "openai",
      stopReason: finish ?? undefined,
      truncated: finish === "length",
    };
  }

  throw new Error("[OpenAI] Impossible de résoudre le paramètre de tokens pour ce modèle.");
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
  // Claude renvoie un tableau de blocs ; on concatène TOUS les blocs `text`
  // (le 1er peut être un bloc thinking/autre, ou la réponse être multi-blocs).
  const text = Array.isArray(data.content)
    ? data.content
        .filter(
          (b: { type?: string; text?: string }) =>
            b?.type === "text" && typeof b.text === "string",
        )
        .map((b: { text: string }) => b.text)
        .join("")
    : (data.content?.[0]?.text ?? "");
  return {
    content: text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    model,
    provider: "anthropic",
    stopReason: data.stop_reason ?? undefined,
    truncated: data.stop_reason === "max_tokens",
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
  const parts = data.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .filter((p: { text?: string }) => typeof p?.text === "string")
        .map((p: { text: string }) => p.text)
        .join("")
    : (parts?.[0]?.text ?? "");
  const finish = data.candidates?.[0]?.finishReason;

  return {
    content: text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    model,
    provider: "google",
    stopReason: finish ?? undefined,
    truncated: finish === "MAX_TOKENS",
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
  const finish = data.choices[0]?.finish_reason;
  return {
    content: data.choices[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    model,
    provider: "mistral",
    stopReason: finish ?? undefined,
    truncated: finish === "length",
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

// ─── Vrai streaming (SSE fournisseur → deltas) ───────────────────────────────

/** Lit un flux SSE et yield chaque champ `data:` (hors [DONE]). */
async function* sseData(res: Response): AsyncGenerator<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Flux de streaming indisponible");
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload && payload !== "[DONE]") yield payload;
    }
  }
}

/**
 * Streaming RÉEL des deltas de texte depuis le fournisseur. Utilisé par le
 * mode « réponse instantanée » (tac au tac) — le run agent reste en callModel.
 * Yield les fragments de texte ; retourne le contenu complet à la fin.
 */
export async function* streamModelDeltas(
  params: CallModelParams
): AsyncGenerator<string, { content: string }, undefined> {
  const { provider, model, messages, apiKey, maxTokens = 4096, tokenParam } = params;
  let full = "";

  if (provider === "openai" || provider === "mistral") {
    const url =
      provider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : "https://api.mistral.ai/v1/chat/completions";
    const tokenConfig =
      provider === "openai"
        ? openAITokenConfig(tokenParam ?? inferOpenAITokenParam(model), maxTokens)
        : { max_tokens: maxTokens };
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, ...tokenConfig }),
    });
    if (!res.ok) throw parseProviderError(provider === "openai" ? "OpenAI" : "Mistral", res.status, await res.text());
    for await (const data of sseData(res)) {
      try {
        const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          full += delta;
          yield delta;
        }
      } catch {
        /* fragment non-JSON : ignoré */
      }
    }
    return { content: full };
  }

  if (provider === "anthropic") {
    const system = messages.find((m) => m.role === "system")?.content;
    const chatMessages = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: chatMessages, stream: true }),
    });
    if (!res.ok) throw parseProviderError("Anthropic", res.status, await res.text());
    for await (const data of sseData(res)) {
      try {
        const evt = JSON.parse(data);
        if (evt?.type === "content_block_delta" && typeof evt.delta?.text === "string") {
          full += evt.delta.text;
          yield evt.delta.text;
        }
      } catch {
        /* fragment non-JSON : ignoré */
      }
    }
    return { content: full };
  }

  if (provider === "google") {
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const systemInstruction = messages.find((m) => m.role === "system")?.content;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          contents,
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
    );
    if (!res.ok) throw parseProviderError("Google", res.status, await res.text());
    for await (const data of sseData(res)) {
      try {
        const parts = JSON.parse(data)?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (typeof p?.text === "string" && p.text) {
              full += p.text;
              yield p.text;
            }
          }
        }
      } catch {
        /* fragment non-JSON : ignoré */
      }
    }
    return { content: full };
  }

  // Fournisseur sans chemin streaming : réponse en un bloc (dégradé propre).
  const result = await callModel(params);
  full = result.content;
  yield result.content;
  return { content: full };
}

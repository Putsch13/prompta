import { resolveModelOrDefault } from "./resolve-model";
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

const FALLBACK_CATALOG_IDS: Record<LLMProvider, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-haiku-4-5",
  google: "gemini-3-flash",
  mistral: "mistral-small",
};

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
    const err = await res.text();
    let errorMessage = `OpenAI: ${res.status}`;
    try {
      const errJson = JSON.parse(err);
      errorMessage = errJson.error?.message ?? err;
    } catch {
      errorMessage = err;
    }
    if (res.status === 404) {
      throw new Error(`Modèle "${model}" non trouvé sur OpenAI. Vérifiez l'identifiant.`);
    }
    if (res.status === 401) {
      throw new Error("Clé API OpenAI invalide ou expirée.");
    }
    throw new Error(errorMessage);
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
    const err = await res.text();
    let errorMessage = `Anthropic: ${res.status}`;
    try {
      const errJson = JSON.parse(err);
      errorMessage = errJson.error?.message ?? err;
    } catch {
      errorMessage = err;
    }
    if (res.status === 404) {
      throw new Error(`Modèle "${model}" non trouvé sur Anthropic. Vérifiez l'identifiant.`);
    }
    if (res.status === 401) {
      throw new Error("Clé API Anthropic invalide ou expirée.");
    }
    throw new Error(errorMessage);
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
    const err = await res.text();
    let errorMessage = `Google: ${res.status}`;
    try {
      const errJson = JSON.parse(err);
      errorMessage = errJson.error?.message ?? err;
    } catch {
      errorMessage = err;
    }
    if (res.status === 404) {
      throw new Error(`Modèle "${model}" non trouvé sur Google AI. Vérifiez l'identifiant.`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Clé API Google AI invalide ou expirée.");
    }
    throw new Error(errorMessage);
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
    const err = await res.text();
    let errorMessage = `Mistral: ${res.status}`;
    try {
      const errJson = JSON.parse(err);
      errorMessage = errJson.error?.message ?? err;
    } catch {
      errorMessage = err;
    }
    if (res.status === 404) {
      throw new Error(`Modèle "${model}" non trouvé sur Mistral. Vérifiez l'identifiant.`);
    }
    if (res.status === 401) {
      throw new Error("Clé API Mistral invalide ou expirée.");
    }
    throw new Error(errorMessage);
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

export async function callModel(
  params: CallModelParams
): Promise<CallModelResult> {
  try {
    return await callProvider(params);
  } catch (primaryError) {
    const fallbackCatalogId = FALLBACK_CATALOG_IDS[params.provider];
    const fallback = resolveModelOrDefault(fallbackCatalogId);
    if (fallback.apiModel === params.model) throw primaryError;

    return callProvider({
      ...params,
      model: fallback.apiModel,
      provider: fallback.provider,
      tokenParam: fallback.tokenParam,
    });
  }
}

/** Streaming simulé en V1 — découpe la réponse en chunks, pas de vrai SSE provider. */
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

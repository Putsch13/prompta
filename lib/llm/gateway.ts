import { getModel, type LLMProvider } from "./providers";

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
}

export interface CallModelResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: LLMProvider;
}

const FALLBACK_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-20241022",
  google: "gemini-2.0-flash",
  mistral: "mistral-large-latest",
};

async function callOpenAI(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  maxTokens = 4096
): Promise<CallModelResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${err}`);
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
    throw new Error(`Anthropic error: ${err}`);
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
    throw new Error(`Google error: ${err}`);
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
    throw new Error(`Mistral error: ${err}`);
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
  const { provider, model, messages, apiKey, maxTokens } = params;

  switch (provider) {
    case "openai":
      return callOpenAI(model, messages, apiKey, maxTokens);
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
    const fallbackModel = FALLBACK_MODELS[params.provider];
    if (fallbackModel === params.model) throw primaryError;

    const fallbackInfo = getModel(fallbackModel);
    if (!fallbackInfo) throw primaryError;

    return callProvider({
      ...params,
      model: fallbackModel,
      provider: fallbackInfo.provider,
    });
  }
}

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

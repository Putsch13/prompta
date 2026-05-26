import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret, maskKey } from "@/lib/crypto";
import { callModel } from "@/lib/llm/gateway";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";

export type KeyProvider = "openai" | "anthropic" | "google" | "mistral" | "serper";

export interface KeyMetadata {
  id: string;
  provider: KeyProvider;
  last4: string;
  is_valid: boolean;
  last_checked_at: string | null;
  created_at: string;
}

export interface KeyValidationResult {
  valid: boolean;
  provider: KeyProvider;
  model: string;
  statusCode?: number;
  errorCode?: string;
  message?: string;
  rawProviderMessage?: string;
}

/** Modèles de test par provider — les plus petits/rapides pour valider une clé. */
const PROVIDER_TEST_MODELS: Record<KeyProvider, string> = {
  openai: process.env.OPENAI_TEST_MODEL || "gpt-4.1-nano",
  anthropic: process.env.ANTHROPIC_TEST_MODEL || "claude-haiku-4-5",
  google: process.env.GOOGLE_TEST_MODEL || "gemini-2.5-flash",
  mistral: process.env.MISTRAL_TEST_MODEL || "mistral-small-latest",
  serper: "",
};

export async function listUserKeys(userId: string): Promise<KeyMetadata[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("user_api_keys")
    .select("id, provider, last4, is_valid, last_checked_at, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []) as KeyMetadata[];
}

export async function getUserKey(
  userId: string,
  provider: KeyProvider
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("user_api_keys")
    .select("encrypted_key, is_valid")
    .eq("owner_id", userId)
    .eq("provider", provider)
    .eq("is_valid", true)
    .maybeSingle();

  if (!data?.encrypted_key) return null;
  return decryptSecret(data.encrypted_key);
}

export async function saveUserKey(
  userId: string,
  provider: KeyProvider,
  plaintext: string,
  eventType: "added" | "rotated" = "added",
  isValid = true
): Promise<KeyMetadata> {
  const supabase = createAdminClient();
  const encrypted = encryptSecret(plaintext);
  const last4 = maskKey(plaintext);

  const { data, error } = await supabase
    .from("user_api_keys")
    .upsert(
      {
        owner_id: userId,
        provider,
        encrypted_key: encrypted,
        last4,
        is_valid: isValid,
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,provider" }
    )
    .select("id, provider, last4, is_valid, last_checked_at, created_at")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Erreur sauvegarde clé");

  await supabase.from("key_events").insert({
    owner_id: userId,
    provider,
    event_type: eventType,
  });

  return data as KeyMetadata;
}

export async function deleteUserKey(
  userId: string,
  provider: KeyProvider
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("user_api_keys")
    .delete()
    .eq("owner_id", userId)
    .eq("provider", provider);

  await supabase.from("key_events").insert({
    owner_id: userId,
    provider,
    event_type: "deleted",
  });
}

/**
 * Valide une clé API auprès du fournisseur.
 * Ne touche PAS la DB — c'est l'appelant qui décide de sauvegarder ou non.
 * Retourne toujours un résultat structuré avec la raison exacte en cas d'échec.
 */
export async function validateProviderKey(
  provider: KeyProvider,
  apiKey: string
): Promise<KeyValidationResult> {
  const testModel = PROVIDER_TEST_MODELS[provider];

  if (provider === "serper") {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: "test", num: 1 }),
      });
      if (!res.ok) {
        const body = await res.text();
        return {
          valid: false,
          provider,
          model: "",
          statusCode: res.status,
          errorCode: res.status === 401 ? "invalid_api_key" : "request_failed",
          message: res.status === 401
            ? "Clé Serper invalide"
            : `Serper: erreur ${res.status}`,
          rawProviderMessage: body.slice(0, 500),
        };
      }
      return { valid: true, provider, model: "", message: "Clé Serper validée" };
    } catch (err) {
      return {
        valid: false,
        provider,
        model: "",
        errorCode: "network_error",
        message: "Impossible de contacter Serper",
        rawProviderMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const resolved = resolveModelOrDefault(testModel);
  try {
    await callModel({
      provider: resolved.provider,
      model: resolved.apiModel,
      messages: [{ role: "user", content: "ping" }],
      apiKey,
      maxTokens: 5,
      tokenParam: resolved.tokenParam,
    });
    return {
      valid: true,
      provider,
      model: resolved.apiModel,
      message: "Clé validée avec succès",
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);

    let statusCode: number | undefined;
    let errorCode: string | undefined;
    let message: string;

    const statusMatch = raw.match(/\[(\w+)\] (\d+)/);
    if (statusMatch) {
      statusCode = parseInt(statusMatch[2], 10);
    }

    const codeMatch = raw.match(/\(([^)]+)\)/);
    if (codeMatch) {
      errorCode = codeMatch[1];
    }

    if (statusCode === 401 || raw.includes("invalid_api_key") || raw.includes("authentication")) {
      message = "Clé API invalide ou expirée";
      errorCode = errorCode ?? "invalid_api_key";
    } else if (raw.includes("insufficient_quota") || raw.includes("billing_not_active")) {
      message = "Clé valide mais quota insuffisant ou facturation inactive";
      errorCode = errorCode ?? "insufficient_quota";
    } else if (statusCode === 429 || raw.includes("rate_limit")) {
      message = "Clé valide mais rate limit atteint — réessayez dans quelques secondes";
      errorCode = errorCode ?? "rate_limit";
    } else if (statusCode === 404 || raw.includes("not found")) {
      message = `Clé valide mais le modèle de test "${resolved.apiModel}" n'est pas disponible sur votre compte`;
      errorCode = errorCode ?? "model_not_found";
    } else if (statusCode === 403 || raw.includes("permission")) {
      message = "Clé valide mais permissions insuffisantes pour ce modèle";
      errorCode = errorCode ?? "permission_denied";
    } else {
      message = `Erreur fournisseur : ${raw.slice(0, 200)}`;
      errorCode = errorCode ?? "unknown";
    }

    return {
      valid: false,
      provider,
      model: resolved.apiModel,
      statusCode,
      errorCode,
      message,
      rawProviderMessage: raw.slice(0, 500),
    };
  }
}

/**
 * Legacy wrapper — appelle validateProviderKey puis met à jour la DB.
 * @deprecated Utiliser validateProviderKey + saveUserKey séparément.
 */
export async function testUserKey(
  userId: string,
  provider: KeyProvider,
  apiKey: string
): Promise<KeyValidationResult> {
  const result = await validateProviderKey(provider, apiKey);

  const supabase = createAdminClient();
  await supabase
    .from("user_api_keys")
    .update({ is_valid: result.valid, last_checked_at: new Date().toISOString() })
    .eq("owner_id", userId)
    .eq("provider", provider);

  return result;
}

export async function invalidateKey(
  userId: string,
  provider: KeyProvider
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("user_api_keys")
    .update({ is_valid: false })
    .eq("owner_id", userId)
    .eq("provider", provider);

  await supabase.from("key_events").insert({
    owner_id: userId,
    provider,
    event_type: "invalidated",
  });
}

export function providerForModel(model: string): KeyProvider {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gemini")) return "google";
  if (model.startsWith("mistral")) return "mistral";
  return "openai";
}

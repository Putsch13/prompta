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

const KEY_TEST_MODELS: Record<KeyProvider, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-haiku-4-5",
  google: "gemini-3-flash",
  mistral: "mistral-small",
  serper: "",
};

export async function testUserKey(
  userId: string,
  provider: KeyProvider,
  apiKey: string
): Promise<boolean> {
  const supabase = createAdminClient();

  try {
    if (provider === "serper") {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: "test", num: 1 }),
      });
      if (!res.ok) throw new Error("Invalid Serper key");
    } else {
      const catalogId = KEY_TEST_MODELS[provider];
      const resolved = resolveModelOrDefault(catalogId);
      await callModel({
        provider: resolved.provider,
        model: resolved.apiModel,
        messages: [{ role: "user", content: "ping" }],
        apiKey,
        maxTokens: 5,
        tokenParam: resolved.tokenParam,
      });
    }

    await supabase
      .from("user_api_keys")
      .update({ is_valid: true, last_checked_at: new Date().toISOString() })
      .eq("owner_id", userId)
      .eq("provider", provider);

    return true;
  } catch {
    await supabase
      .from("user_api_keys")
      .update({ is_valid: false, last_checked_at: new Date().toISOString() })
      .eq("owner_id", userId)
      .eq("provider", provider);

    return false;
  }
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

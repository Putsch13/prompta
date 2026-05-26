#!/usr/bin/env tsx
/**
 * scripts/smoke-local.ts — Smoke tests locaux (DB + clés + APIs)
 */
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const results: { name: string; ok: boolean; detail: string }[] = [];

  // ── 1. DB migrations ──
  try {
    const { createAdminClient } = await import("../lib/supabase/admin");
    const admin = createAdminClient() as ReturnType<typeof createAdminClient> & {
      from: (t: string) => { select: (c: string) => { limit: (n: number) => Promise<{ error: unknown }> } };
    };

    const checks = [
      { table: "listing_agent_run_steps", label: "0028 step logs" },
      { table: "agent_approvals", label: "0029 approvals" },
      { table: "agent_triggers", label: "0029 triggers" },
      { table: "agent_memories", label: "0029 memory" },
    ];

    for (const c of checks) {
      const { error } = await (admin as unknown as { from: (t: string) => { select: (col: string) => { limit: (n: number) => Promise<{ error: unknown }> } } })
        .from(c.table)
        .select("id")
        .limit(1);
      results.push({
        name: `Migration ${c.label}`,
        ok: !error,
        detail: error ? String((error as { message?: string }).message ?? error) : "table accessible",
      });
    }

    const { error: rpcErr } = await (admin as unknown as { rpc: (fn: string, args: object) => Promise<{ error: unknown }> }).rpc(
      "hold_credits_for_run",
      { p_user_id: "00000000-0000-0000-0000-000000000000", p_amount: 0, p_run_type: "manual", p_agent_run_id: null, p_prompt_run_id: null }
    );
    results.push({
      name: "Migration 0027 RPC hold_credits",
      ok: !rpcErr || String((rpcErr as { message?: string }).message).includes("not found") === false,
      detail: rpcErr
        ? String((rpcErr as { message?: string }).message).includes("Could not find")
          ? "RPC absent — appliquer migration 0027"
          : String((rpcErr as { message?: string }).message)
        : "RPC présente",
    });
  } catch (e) {
    results.push({ name: "DB connection", ok: false, detail: e instanceof Error ? e.message : String(e) });
  }

  // ── 2. Key validation ──
  try {
    const { validateProviderKey } = await import("../lib/keys");
    const invalid = await validateProviderKey("openai", "sk-invalid-key-for-test");
    results.push({
      name: "Clé OpenAI invalide → rejetée",
      ok: !invalid.valid && !!invalid.message,
      detail: invalid.errorCode ?? invalid.message ?? "—",
    });

    const platformKey = process.env.PLATFORM_OPENAI_KEY?.trim();
    if (platformKey) {
      const valid = await validateProviderKey("openai", platformKey);
      results.push({
        name: "Clé OpenAI plateforme → validation",
        ok: valid.valid,
        detail: valid.valid ? `OK (${valid.model})` : (valid.errorCode ?? valid.message ?? "échec"),
      });
    } else {
      results.push({
        name: "Clé OpenAI plateforme",
        ok: true,
        detail: "SKIP — PLATFORM_OPENAI_KEY non définie (BYOK only)",
      });
    }
  } catch (e) {
    results.push({ name: "Key validation", ok: false, detail: e instanceof Error ? e.message : String(e) });
  }

  // ── 3. HTTP endpoints (sans auth) ──
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const endpoints = [
    { path: "/", expect: 200, name: "Homepage" },
    { path: "/api/composio/toolkits", expect: 200, name: "Composio toolkits API" },
    { path: "/api/run/agent/preflight", expect: 401, name: "Preflight (401 sans auth)", method: "POST" },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${base}${ep.path}`, {
        method: ep.method ?? "GET",
        headers: ep.method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: ep.method === "POST" ? JSON.stringify({}) : undefined,
      });
      results.push({
        name: ep.name,
        ok: res.status === ep.expect,
        detail: `HTTP ${res.status} (attendu ${ep.expect})`,
      });
    } catch (e) {
      results.push({ name: ep.name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }

  // ── Report ──
  console.log("\n=== SMOKE LOCAL PROMPTA ===\n");
  let pass = 0;
  let fail = 0;
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`${icon} ${r.name}`);
    console.log(`   ${r.detail}`);
    if (r.ok) pass++;
    else fail++;
  }
  console.log(`\n${pass}/${results.length} OK · ${fail} échec(s)\n`);

  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

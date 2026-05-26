#!/usr/bin/env tsx
/**
 * scripts/composio-smoke.ts — Smoke test Composio integration
 * Usage: npm run composio:smoke
 */
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

async function main() {
  const { isComposioEnabled } = await import("../lib/composio/client");
  const { listComposioToolkits, listComposioTools } = await import("../lib/composio/catalog");

  console.log("=== Composio Smoke Test ===\n");

  if (!isComposioEnabled()) {
    console.error("FAIL: COMPOSIO_API_KEY not set");
    process.exit(1);
  }
  console.log("OK: COMPOSIO_API_KEY present");

  const toolkits = await listComposioToolkits();
  console.log(`OK: ${toolkits.length} toolkits listed`);
  if (toolkits.length === 0) {
    console.error("FAIL: no toolkits returned");
    process.exit(1);
  }

  const gmail = toolkits.find((t) => t.id === "gmail") ?? toolkits[0];
  console.log(`Testing toolkit: ${gmail.label} (${gmail.id})`);

  const tools = await listComposioTools(gmail.id);
  console.log(`OK: ${tools.length} actions for ${gmail.id}`);
  if (tools.length > 0) {
    console.log(`  Sample action: ${tools[0].slug} — ${tools[0].name}`);
  }

  console.log("\n=== Smoke test passed ===");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});

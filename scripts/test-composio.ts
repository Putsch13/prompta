import { listComposioToolkits } from "../lib/composio/catalog";
import { isComposioEnabled } from "../lib/composio/client";

async function main() {
  console.log("enabled:", isComposioEnabled());
  try {
    const toolkits = await listComposioToolkits();
    console.log("OK", toolkits.length, "toolkits");
    console.log(toolkits.slice(0, 8).map((t) => t.id).join(", "));
  } catch (e) {
    console.error("ERR:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();

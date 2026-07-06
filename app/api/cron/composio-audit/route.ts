import { NextRequest, NextResponse } from "next/server";
import { listComposioToolkits, listComposioTools } from "@/lib/composio/catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * AUDIT des toolkits Composio : pour chaque outil, classe les paramètres
 * requis selon la capacité du pipeline à les gérer sans échec :
 *  - auto (default / enum → toujours résolus par le garde)
 *  - ask (string/id libre → doit être demandé au builder ; le garde produit
 *    un message actionnable si absent)
 *  - opaque (type array/object requis sans default → risqué)
 * Protégé par CRON_SECRET. `?toolkits=a,b` pour cibler, sinon les N premiers.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const url = new URL(req.url);
  const only = url.searchParams.get("toolkits")?.split(",").map((s) => s.trim()).filter(Boolean);
  const limit = Number(url.searchParams.get("limit") ?? 40);

  const allToolkits = await listComposioToolkits();
  const targets = only?.length
    ? allToolkits.filter((t) => only.includes(t.id))
    : allToolkits.slice(0, limit);

  const report: Array<{
    toolkit: string;
    tools: number;
    autoResolvable: number;
    mustAsk: number;
    opaqueRequired: string[];
    parseErrors?: string;
  }> = [];

  for (const tk of targets) {
    try {
      const tools = await listComposioTools(tk.id);
      let auto = 0;
      let ask = 0;
      const opaque: string[] = [];
      for (const tool of tools) {
        for (const input of tool.inputs) {
          if (!input.required) continue;
          const hasDefault = input.defaultValue != null && input.defaultValue !== "";
          const hasEnum = (input.enumValues?.length ?? 0) > 0;
          if (hasDefault || hasEnum) {
            auto++;
          } else if (input.rawType === "array" || input.rawType === "object") {
            opaque.push(`${tool.slug}.${input.key}`);
          } else {
            ask++;
          }
        }
      }
      report.push({
        toolkit: tk.id,
        tools: tools.length,
        autoResolvable: auto,
        mustAsk: ask,
        opaqueRequired: opaque.slice(0, 10),
      });
    } catch (err) {
      report.push({
        toolkit: tk.id,
        tools: 0,
        autoResolvable: 0,
        mustAsk: 0,
        opaqueRequired: [],
        parseErrors: err instanceof Error ? err.message.slice(0, 120) : "erreur",
      });
    }
  }

  const totals = report.reduce(
    (acc, r) => ({
      toolkits: acc.toolkits + 1,
      tools: acc.tools + r.tools,
      auto: acc.auto + r.autoResolvable,
      ask: acc.ask + r.mustAsk,
      opaque: acc.opaque + r.opaqueRequired.length,
      errors: acc.errors + (r.parseErrors ? 1 : 0),
    }),
    { toolkits: 0, tools: 0, auto: 0, ask: 0, opaque: 0, errors: 0 },
  );

  return NextResponse.json({ totals, report });
}

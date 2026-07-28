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
  const offset = Number(url.searchParams.get("offset") ?? 0);

  // Sonde : ?raw=SLUG_OUTIL renvoie le schéma brut d'un outil (debug).
  const rawTool = url.searchParams.get("raw");
  if (rawTool) {
    const toolkit = rawTool.split("_")[0]?.toLowerCase() ?? "";
    const { getComposioClient } = await import("@/lib/composio/client");
    const composio = getComposioClient();
    const tools = await composio.tools.getRawComposioTools({ toolkits: [toolkit], limit: 500 });
    const tool = (tools ?? []).find((t) => t.slug === rawTool);
    return NextResponse.json({
      slug: rawTool,
      inputParameters: tool?.inputParameters ?? null,
    });
  }

  const allToolkits = await listComposioToolkits();

  // Sonde légère : ?count=1 → taille du catalogue (vérif pagination complète).
  if (url.searchParams.get("count")) {
    return NextResponse.json({
      toolkits: allToolkits.length,
      sample: allToolkits.slice(0, 5).map((t) => t.id),
      last: allToolkits.slice(-3).map((t) => t.id),
    });
  }

  // Sonde légère : ?slugs=1 → slugs de la tranche (sans fetch des outils).
  if (url.searchParams.get("slugs")) {
    return NextResponse.json({
      slugs: allToolkits.slice(offset, offset + limit).map((t) => t.id),
    });
  }

  // Sonde PLOMBERIE : ?plumbing=toolkit1,toolkit2 → batterie complète
  // (résolution, param-guard, approbations, retry) sur ces toolkits, avec les
  // intentions utilisateur simulées. Pilotée par scripts/plumbing-battery.ts.
  const plumbingParam = url.searchParams.get("plumbing");
  if (plumbingParam) {
    const { checkToolkit, checkErrorMapping } = await import("@/lib/composio/plumbing-battery");
    const slugsToCheck = plumbingParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);
    const failures: import("@/lib/composio/plumbing-battery").Failure[] = [];
    const counters: Record<string, number> = new Proxy({} as Record<string, number>, {
      get: (t, k: string) => t[k] ?? 0,
      set: (t, k: string, v) => ((t[k] = v as number), true),
    });
    if (url.searchParams.get("errmap")) checkErrorMapping(failures);
    for (const slug of slugsToCheck) {
      await checkToolkit(slug, failures, counters);
    }
    return NextResponse.json({ toolkits: slugsToCheck.length, counters: { ...counters }, failures });
  }

  // Sonde résolution : ?resolve=connector.action[,connector.action…] →
  // slug d'outil réellement choisi par le résolveur (vérif multi-apps).
  const resolveParam = url.searchParams.get("resolve");
  if (resolveParam) {
    const { resolveComposioToolSlug } = await import("@/lib/composio/resolve-native-action");
    const pairs = resolveParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 60);
    const results: Record<string, string | null> = {};
    for (const actionId of pairs) {
      const connector = actionId.split(".")[0] ?? "";
      results[actionId] = await resolveComposioToolSlug(connector, actionId).catch(
        () => "ERREUR_CATALOGUE",
      );
    }
    return NextResponse.json({ results });
  }

  const targets = only?.length
    ? allToolkits.filter((t) => only.includes(t.id))
    : allToolkits.slice(offset, offset + limit);

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

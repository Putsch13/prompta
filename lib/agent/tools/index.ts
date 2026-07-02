import { scanContent } from "@/lib/content-filter";

const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.|0\.|169\.254\.|localhost|\[::1\])/i,
];

export async function webSearch(query: string, apiKey?: string): Promise<string> {
  if (!apiKey) throw new Error("Clé Serper requise pour la recherche web");

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 5 }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const hint =
      res.status === 401 || res.status === 403
        ? " — clé Serper invalide ou quota épuisé (vérifiez PLATFORM_SERPER_KEY)"
        : "";
    throw new Error(`Recherche web refusée (${res.status})${hint}${detail ? ` : ${detail.slice(0, 120)}` : ""}`);
  }
  const data = await res.json();
  const snippets = (data.organic ?? [])
    .slice(0, 5)
    .map((r: { title: string; snippet: string }) => `${r.title}: ${r.snippet}`)
    .join("\n");
  return snippets || "Aucun résultat";
}

export async function httpFetch(url: string): Promise<string> {
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(url)) {
      throw new Error("Accès réseau interne interdit (egress filter)");
    }
  }

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "Prompta-Agent/1.0" },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text.substring(0, 5000);
}

export async function fileRead(content: string): Promise<string> {
  return content.substring(0, 10000);
}

export function scanOutput(output: string): boolean {
  const result = scanContent(output);
  return result.flagged;
}

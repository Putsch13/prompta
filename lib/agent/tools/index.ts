import { scanContent } from "@/lib/content-filter";
import { safeFetch } from "./safe-fetch";

/** Désencode les entités HTML basiques (partagé corps + href des liens). */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export async function webSearch(query: string, apiKey?: string, num = 10): Promise<string> {
  if (!apiKey) throw new Error("Clé Serper requise pour la recherche web");

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    // num : profondeur de recherche (les recensements exhaustifs passent 30-50).
    body: JSON.stringify({ q: query, num: Math.min(50, Math.max(1, num)) }),
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

const WEB_FETCH_CHAR_CAP = 20000;
const WEB_FETCH_MAX_LINKS = 30;
const WEB_FETCH_MAX_BYTES = 8 * 1024 * 1024;

/**
 * HTML brut → texte lisible + liens. Pur (testable) : titre, contenu débarrassé
 * des scripts/styles/nav, et une section LIENS pour que l'agent puisse creuser
 * le site (chaque lien est re-fetchable via l'outil web_fetch).
 */
export function htmlToReadableText(html: string, baseUrl?: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] ??
    "";

  // Liens absolus, dédupliqués, libellés — pour l'exploration en profondeur.
  const links: string[] = [];
  const seen = new Set<string>();
  const linkRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) && links.length < WEB_FETCH_MAX_LINKS) {
    try {
      // Désencoder l'href AVANT new URL : &amp; dans le HTML = & dans l'URL.
      const href = new URL(decodeEntities(m[1]), baseUrl).toString();
      if (!/^https?:/i.test(href) || seen.has(href)) continue;
      seen.add(href);
      const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
      links.push(label ? `- ${label} → ${href}` : `- ${href}`);
    } catch {
      /* href invalide : ignoré */
    }
  }

  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|footer|aside|header)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const body = decodeEntities(stripped)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  const parts = [
    title ? `TITRE : ${title}` : "",
    description ? `DESCRIPTION : ${description}` : "",
    body,
    links.length ? `\nLIENS DE LA PAGE (re-fetchables via web_fetch) :\n${links.join("\n")}` : "",
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, WEB_FETCH_CHAR_CAP);
}

/**
 * Lecteur de page profond : HTML → texte lisible + liens ; PDF/Office →
 * extraction texte (officeparser) ; JSON/texte → brut plafonné. C'est l'outil
 * qui permet à un agent de « creuser » un site page après page.
 */
export async function httpFetch(url: string): Promise<string> {
  const target = url.trim();
  if (!target) {
    throw new Error("URL manquante pour la lecture de page (paramètre « url »).");
  }

  // safeFetch valide l'URL ET chaque redirection contre la garde SSRF (IP
  // internes en clair/encodées, hostnames résolvant en interne, IPv6…).
  const res = await safeFetch(target, {
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "Prompta-Agent/1.0" },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${target}`);
  const contentType = res.headers.get("content-type") ?? "";

  if (/pdf|officedocument|msword|opendocument/i.test(contentType) || /\.(pdf|docx?|pptx?|odt)(\?|$)/i.test(target)) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > WEB_FETCH_MAX_BYTES) throw new Error("Document trop volumineux (> 8 Mo)");
    const { parseOffice } = await import("officeparser");
    const ast = await parseOffice(buf);
    // parseOffice renvoie TOUJOURS un AST : extraire le texte (comme user-documents).
    const text = ast.toText().trim();
    return (text || "[Document sans texte extractible — peut-être un scan.]").slice(0, WEB_FETCH_CHAR_CAP);
  }

  // Plafond d'octets aussi sur HTML/texte : évite de charger un dump de
  // plusieurs Mo en mémoire puis d'y passer les regex plein-document.
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.subarray(0, WEB_FETCH_MAX_BYTES).toString("utf-8");
  if (/html/i.test(contentType) || /^\s*</.test(text)) {
    return htmlToReadableText(text, target);
  }
  return text.slice(0, WEB_FETCH_CHAR_CAP);
}

export async function fileRead(content: string): Promise<string> {
  return content.substring(0, 10000);
}

export function scanOutput(output: string): boolean {
  const result = scanContent(output);
  return result.flagged;
}

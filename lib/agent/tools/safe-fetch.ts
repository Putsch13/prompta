import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Garde SSRF pour tout fetch d'URL arbitraire (outils web_fetch/http_fetch).
 *
 * Défend contre : IP privées/loopback/link-local en clair, encodages d'IP
 * (décimal/octal/hex), IPv6 interne, hostnames qui RÉSOLVENT vers une IP
 * interne (DNS rebinding), et redirections vers l'un de ces cas — en
 * revalidant CHAQUE saut (le fetch natif ne rappelle pas la garde sur les 3xx).
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

/** Une IP (v4/v6, déjà parsée) tombe-t-elle dans une plage interne ? */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformé → refus
    const [a, b] = p;
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 169 && b === 254) || // link-local (métadonnées cloud)
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      a >= 224 // multicast / réservé
    );
  }
  if (v === 6) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true; // link-local / ULA
    // IPv4-mappé (::ffff:127.0.0.1) : valide l'IPv4 embarquée
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // pas une IP reconnue → refus prudent
}

/** Normalise l'hôte d'une URL et refuse les formes internes évidentes. */
function assertHostAllowed(hostname: string): void {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("Accès réseau interne interdit (egress filter)");
  }
  // Hôte littéralement une IP (y compris décimal 2130706433, hex 0x7f…) →
  // Node les normalise via isIP seulement pour les formes canoniques ; on
  // bloque tout ce qui n'est pas un IP public canonique et ressemble à un nombre.
  if (isIP(host) && isPrivateIp(host)) {
    throw new Error("Accès réseau interne interdit (egress filter)");
  }
  if (/^(0x[0-9a-f]+|\d{8,10})$/i.test(host)) {
    throw new Error("Adresse IP encodée refusée (egress filter)");
  }
}

/** Résout l'hôte et vérifie qu'AUCUNE des IP renvoyées n'est interne. */
async function assertResolvesPublic(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Accès réseau interne interdit (egress filter)");
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`Hôte introuvable : ${host}`);
  }
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("Accès réseau interne interdit (l'hôte résout vers une IP privée)");
  }
}

/**
 * fetch durci : valide l'URL et chaque redirection (manuelle) contre la garde
 * SSRF. Renvoie la Response finale (corps non lu). `maxHops` borne les 3xx.
 */
export async function safeFetch(
  url: string,
  init: RequestInit & { maxHops?: number } = {},
): Promise<Response> {
  const { maxHops = 5, ...rest } = init;
  let current = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new Error(`URL invalide : ${current.slice(0, 120)}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Seuls http(s) sont autorisés");
    }
    assertHostAllowed(parsed.hostname);
    await assertResolvesPublic(parsed.hostname);

    const res = await fetch(current, { ...rest, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("Trop de redirections");
}

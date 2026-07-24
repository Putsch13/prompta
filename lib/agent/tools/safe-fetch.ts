import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import type { Dispatcher, RequestInit as UndiciRequestInit } from "undici";

/**
 * Garde SSRF pour tout fetch d'URL arbitraire (outils web_fetch/http_fetch).
 *
 * Défend contre : IP privées/loopback/link-local en clair, encodages d'IP
 * (décimal/octal/hex), IPv6 interne, hostnames qui RÉSOLVENT vers une IP
 * interne, et redirections vers l'un de ces cas — en revalidant CHAQUE saut.
 *
 * La résolution DNS et sa validation vivent DANS le connecteur (option
 * `lookup` de net/tls.connect via l'Agent undici) : l'IP validée est celle
 * que la socket compose — un domaine à TTL court ne peut pas renvoyer une IP
 * publique à la garde puis 127.0.0.1 à la connexion (DNS rebinding). Le SNI
 * et le header Host restent ceux du hostname d'origine, seule l'adresse
 * composée est épinglée.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

/** Erreur marqueur : permet de dépiauter le « fetch failed » d'undici. */
export class EgressError extends Error {}

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
    if (lower.startsWith("64:ff9b:") || lower.startsWith("64:ff9b::")) return true; // NAT64 (embarque une IPv4)
    // IPv4-mappé en notation pointée : ::ffff:127.0.0.1
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    // IPv4-mappé en hexadécimal : ::ffff:7f00:1  → reconstruit l'IPv4
    const hex = lower.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateIp(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
    }
    return false;
  }
  return true; // pas une IP reconnue → refus prudent
}

/** Normalise l'hôte d'une URL et refuse les formes internes évidentes. */
function assertHostAllowed(hostname: string): void {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new EgressError("Accès réseau interne interdit (egress filter)");
  }
  // Hôte littéralement une IP (y compris décimal 2130706433, hex 0x7f…) →
  // Node les normalise via isIP seulement pour les formes canoniques ; on
  // bloque tout ce qui n'est pas un IP public canonique et ressemble à un nombre.
  if (isIP(host) && isPrivateIp(host)) {
    throw new EgressError("Accès réseau interne interdit (egress filter)");
  }
  if (/^(0x[0-9a-f]+|\d{8,10})$/i.test(host)) {
    throw new EgressError("Adresse IP encodée refusée (egress filter)");
  }
}

type ResolvedAddress = { address: string; family: number };

/**
 * Fabrique la fonction `lookup` passée à net/tls.connect par l'Agent undici :
 * résout l'hôte UNE fois, refuse si une adresse est interne, et renvoie
 * exactement ces adresses à la socket (épinglage — aucune re-résolution
 * possible entre la garde et la connexion). `resolve`/`isPrivate` sont
 * injectables pour les tests unitaires.
 */
export function makeGuardedLookup(deps: {
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  isPrivate?: (ip: string) => boolean;
} = {}): LookupFunction {
  const resolve = deps.resolve ?? (async (hostname: string) => dnsLookup(hostname, { all: true }));
  const isPrivate = deps.isPrivate ?? isPrivateIp;
  return (hostname, options, callback) => {
    void (async (): Promise<ResolvedAddress[]> => {
      const host = hostname.replace(/^\[|\]$/g, "");
      const literal = isIP(host);
      let addrs: ResolvedAddress[];
      if (literal) {
        addrs = [{ address: host, family: literal }];
      } else {
        try {
          addrs = await resolve(host);
        } catch {
          throw new EgressError(`Hôte introuvable : ${host}`);
        }
      }
      if (addrs.length === 0) throw new EgressError(`Hôte introuvable : ${host}`);
      if (addrs.some((a) => isPrivate(a.address))) {
        throw new EgressError("Accès réseau interne interdit (l'hôte résout vers une IP privée)");
      }
      const family = options.family === 4 || options.family === "IPv4" ? 4 : options.family === 6 || options.family === "IPv6" ? 6 : 0;
      const usable = family ? addrs.filter((a) => a.family === family) : addrs;
      if (usable.length === 0) throw new EgressError(`Hôte introuvable : ${host} (aucune adresse IPv${family})`);
      return usable;
    })().then(
      (usable) => {
        if (options.all) callback(null, usable);
        else callback(null, usable[0].address, usable[0].family);
      },
      (err: Error) => callback(err, "", undefined),
    );
  };
}

/** Agent partagé : toute connexion passe par le lookup gardé ci-dessus. */
const guardedAgent = new Agent({ connect: { lookup: makeGuardedLookup() } });

/**
 * Les erreurs de la garde remontent enveloppées dans le « fetch failed »
 * d'undici (voire un AggregateError si plusieurs adresses ont été tentées) :
 * on ressort l'EgressError telle quelle, sinon l'erreur d'origine.
 */
function unwrapFetchError(err: unknown): Error {
  const seen = new Set<unknown>();
  const queue: unknown[] = [err];
  while (queue.length > 0) {
    const e = queue.pop();
    if (!(e instanceof Error) || seen.has(e)) continue;
    seen.add(e);
    if (e instanceof EgressError) return e;
    if (e instanceof AggregateError) queue.push(...e.errors);
    if (e.cause !== undefined) queue.push(e.cause);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * fetch durci : valide l'URL et chaque redirection (manuelle) contre la garde
 * SSRF, la résolution DNS étant validée ET épinglée au moment de la connexion
 * (chaque saut ouvre sa connexion via le lookup gardé — re-validation et
 * ré-épinglage par hop). Renvoie la Response finale (corps non lu).
 * `maxHops` borne les 3xx ; `dispatcher` n'est injectable que pour les tests.
 */
export async function safeFetch(
  url: string,
  init: RequestInit & { maxHops?: number; dispatcher?: Dispatcher } = {},
): Promise<Response> {
  const { maxHops = 5, dispatcher = guardedAgent, ...rest } = init;
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

    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(current, { ...(rest as UndiciRequestInit), dispatcher, redirect: "manual" });
    } catch (err) {
      throw unwrapFetchError(err);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res as unknown as Response;
      await res.body?.cancel().catch(() => {}); // libère la socket keep-alive avant le hop suivant
      current = new URL(location, current).toString();
      continue;
    }
    return res as unknown as Response;
  }
  throw new Error("Trop de redirections");
}

import { createHmac } from "crypto";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("OAUTH_STATE_SECRET or ENCRYPTION_KEY is required for OAuth");
  }
  return secret;
}

function hmacSign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/**
 * Create a signed OAuth state with HMAC.
 * Format: base64url(payload).signature
 */
export function createSignedState(data: {
  userId: string;
  connectorId: string;
}): string {
  const payload = Buffer.from(
    JSON.stringify({ ...data, ts: Date.now() })
  ).toString("base64url");
  const sig = hmacSign(payload);
  return `${payload}.${sig}`;
}

/**
 * Verify and parse a signed OAuth state.
 * Returns null if invalid, expired, or tampered with.
 */
export function verifySignedState(
  state: string
): { userId: string; connectorId: string; ts: number } | null {
  const dotIdx = state.indexOf(".");
  if (dotIdx === -1) return null;

  const payload = state.slice(0, dotIdx);
  const sig = state.slice(dotIdx + 1);

  const expectedSig = hmacSign(payload);
  if (sig !== expectedSig) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!parsed.userId || !parsed.connectorId || !parsed.ts) return null;

    if (Date.now() - parsed.ts > STATE_MAX_AGE_MS) return null;

    return parsed;
  } catch {
    return null;
  }
}

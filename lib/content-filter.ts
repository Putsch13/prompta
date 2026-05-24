export type ContentFlagType =
  | "jailbreak"
  | "nsfw"
  | "illegal"
  | "misinformation"
  | "spam"
  | "hate_speech";

export interface ContentScanResult {
  flagged: boolean;
  flags: ContentFlagType[];
  details: string[];
}

const JAILBREAK_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /forget\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /\bDAN\b.*\bmode\b/i,
  /do\s+anything\s+now/i,
  /jailbreak/i,
  /bypass\s+(your\s+)?restrictions/i,
  /act\s+as\s+if\s+you\s+have\s+no\s+(rules|guidelines|restrictions)/i,
  /pretend\s+(you\s+)?(are|have)\s+no\s+(ethical|moral)\s+(guidelines|restrictions)/i,
  /roleplay\s+as\s+an?\s+(unfiltered|unrestricted)/i,
  /developer\s+mode/i,
  /\[\s*JAILBROKEN\s*\]/i,
  /evil\s+confidant/i,
  /opposite\s+mode/i,
  /\bGPT-4\s+JAILBREAK\b/i,
];

const NSFW_PATTERNS = [
  /\b(explicit\s+)?(sexual|erotic|pornographic)\s+(content|material|acts)/i,
  /\bnude(s)?\b/i,
  /\bnsfw\b/i,
  /\badult\s+content\b/i,
  /\bxxx\b/i,
  /generate\s+(explicit|sexual|erotic)/i,
];

const ILLEGAL_PATTERNS = [
  /\b(how\s+to\s+)?(make|create|build)\s+(a\s+)?(bomb|explosive|weapon)/i,
  /\b(how\s+to\s+)?hack\s+(into|someone)/i,
  /\b(credit\s+card|identity)\s+fraud/i,
  /\bphishing\s+(attack|email|page)/i,
  /\bmoney\s+laundering/i,
  /\bhuman\s+trafficking/i,
  /\bdrug\s+(manufacturing|synthesis|production)/i,
  /\billegal\s+(substances|drugs|weapons)/i,
  /\bransomware\s+(attack|deployment|creation)/i,
  /\bddos\s+attack/i,
];

const MISINFORMATION_PATTERNS = [
  /\b(vaccine|covid|5g)\s+(conspiracy|hoax|fake)/i,
  /\bflat\s+earth\b/i,
  /\bqanon\b/i,
  /\b(election|voting)\s+(fraud|rigged|stolen)\b/i,
  /\bdeep\s+state\b/i,
  /generate\s+(fake|false)\s+(news|information)/i,
  /\bspread\s+(mis|dis)information/i,
];

const HATE_SPEECH_PATTERNS = [
  /\b(racial|ethnic)\s+(slur|insult)/i,
  /\bhate\s+speech\b/i,
  /\b(anti-semitic|antisemitic|racist|homophobic|transphobic)\s+(content|material)/i,
  /\bwhite\s+supremac(y|ist)/i,
  /\bnazi\s+(propaganda|ideology)/i,
  /\bgenocide\s+(denial|promotion)/i,
];

const SPAM_PATTERNS = [
  /\b(get\s+rich\s+quick|make\s+\$\d+\s+a\s+day)\b/i,
  /\b(click\s+here|act\s+now|limited\s+time)\b.*\b(offer|deal|discount)\b/i,
  /\bpyramid\s+scheme\b/i,
  /\b(nigerian|lottery)\s+(prince|scam)\b/i,
  /\bcryptocurrency\s+scam\b/i,
];

function checkPatterns(
  text: string,
  patterns: RegExp[],
  flagType: ContentFlagType,
  result: ContentScanResult
): void {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (!result.flags.includes(flagType)) {
        result.flags.push(flagType);
        result.flagged = true;
      }
      result.details.push(`${flagType}: "${match[0]}"`);
    }
  }
}

/**
 * Scanne le contenu textuel pour détecter des patterns problématiques.
 * Retourne les flags détectés et les détails des correspondances.
 */
export function scanContent(text: string): ContentScanResult {
  const result: ContentScanResult = {
    flagged: false,
    flags: [],
    details: [],
  };

  if (!text || text.trim().length === 0) {
    return result;
  }

  const normalizedText = text.toLowerCase();

  checkPatterns(normalizedText, JAILBREAK_PATTERNS, "jailbreak", result);
  checkPatterns(normalizedText, NSFW_PATTERNS, "nsfw", result);
  checkPatterns(normalizedText, ILLEGAL_PATTERNS, "illegal", result);
  checkPatterns(normalizedText, MISINFORMATION_PATTERNS, "misinformation", result);
  checkPatterns(normalizedText, HATE_SPEECH_PATTERNS, "hate_speech", result);
  checkPatterns(normalizedText, SPAM_PATTERNS, "spam", result);

  return result;
}

/**
 * Vérifie si le contenu contient des flags problématiques.
 */
export function hasContentFlags(text: string): boolean {
  return scanContent(text).flagged;
}

/**
 * Labels lisibles pour les types de flags.
 */
export const FLAG_LABELS: Record<ContentFlagType, string> = {
  jailbreak: "Tentative de jailbreak",
  nsfw: "Contenu adulte/NSFW",
  illegal: "Contenu illégal",
  misinformation: "Désinformation",
  spam: "Spam/Arnaque",
  hate_speech: "Discours haineux",
};

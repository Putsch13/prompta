const SECRET_PATTERNS = [
  /(?:sk|pk)[-_](?:live|test)[-_][a-zA-Z0-9]{20,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /glpat-[a-zA-Z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /(?:password|secret|token|apikey|api_key)\s*[:=]\s*["']?[a-zA-Z0-9_\-/.]{8,}/i,
  /Bearer\s+[a-zA-Z0-9_\-/.]{20,}/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];

const SUSPICIOUS_CODE_PATTERNS = [
  /eval\s*\(/i,
  /Function\s*\(\s*["'`]/,
  /child_process/,
  /exec\s*\(/,
  /require\s*\(\s*["']fs["']\s*\)/,
  /process\.env\./,
  /document\.cookie/i,
  /localStorage\.getItem/i,
  /XMLHttpRequest/,
  /fetch\s*\(\s*["']https?:\/\/(?:169\.254|10\.|192\.168|127\.0\.0\.1)/,
];

const EXFILTRATION_LINK_PATTERNS = [
  /https?:\/\/(?:pastebin|requestbin|webhook\.site|ngrok|burpcollaborator|pipedream)[^\s"']*/i,
  /https?:\/\/[^\s"']*(?:exfil|steal|dump|leak)[^\s"']*/i,
  /data:text\/html[^"']*base64/i,
  /(?:curl|wget|Invoke-WebRequest)\s+[^\s"']*https?:\/\//i,
];

export interface ScanResult {
  secrets: string[];
  suspiciousCode: string[];
  exfiltrationLinks: string[];
}

export function scanForSecrets(content: string): string[] {
  const findings: string[] = [];

  for (const pattern of SECRET_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const masked = match[0].substring(0, 8) + "***";
      findings.push(`Secret potentiel détecté : ${masked}`);
    }
  }

  return findings;
}

export function scanBundle(content: string): ScanResult {
  const secrets = scanForSecrets(content);
  const suspiciousCode: string[] = [];
  const exfiltrationLinks: string[] = [];

  for (const pattern of SUSPICIOUS_CODE_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      suspiciousCode.push(`Code suspect : ${match[0].substring(0, 40)}`);
    }
  }

  for (const pattern of EXFILTRATION_LINK_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      exfiltrationLinks.push(`Lien d'exfiltration : ${match[0].substring(0, 60)}`);
    }
  }

  return { secrets, suspiciousCode, exfiltrationLinks };
}

export function hasSecrets(content: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(content));
}

export function hasSuspiciousContent(content: string): boolean {
  const result = scanBundle(content);
  return (
    result.secrets.length > 0 ||
    result.suspiciousCode.length > 0 ||
    result.exfiltrationLinks.length > 0
  );
}

export function allFindings(content: string): string[] {
  const result = scanBundle(content);
  return [...result.secrets, ...result.suspiciousCode, ...result.exfiltrationLinks];
}

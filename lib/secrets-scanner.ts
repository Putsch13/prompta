const SECRET_PATTERNS = [
  /(?:sk|pk)[-_](?:live|test)[-_][a-zA-Z0-9]{20,}/,        // Stripe
  /AIza[0-9A-Za-z_-]{35}/,                                   // Google API
  /sk-[a-zA-Z0-9]{20,}/,                                     // OpenAI
  /ghp_[a-zA-Z0-9]{36}/,                                     // GitHub PAT
  /glpat-[a-zA-Z0-9_-]{20,}/,                                // GitLab PAT
  /AKIA[0-9A-Z]{16}/,                                        // AWS Access Key
  /(?:password|secret|token|apikey|api_key)\s*[:=]\s*["\']?[a-zA-Z0-9_\-/.]{8,}/i,
  /Bearer\s+[a-zA-Z0-9_\-/.]{20,}/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];

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

export function hasSecrets(content: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(content));
}

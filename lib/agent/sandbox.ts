/**
 * Exécution de code arbitraire via E2B (optionnel).
 * Nécessite E2B_API_KEY dans l'environnement.
 */

const E2B_API = "https://api.e2b.dev/v1";

export async function runCodeInSandbox(
  code: string,
  timeoutMs = 30000
): Promise<string> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    throw new Error(
      "E2B non configuré — ajoutez E2B_API_KEY pour exécuter du code arbitraire"
    );
  }

  const createRes = await fetch(`${E2B_API}/sandboxes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ template: "base" }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!createRes.ok) {
    throw new Error(`E2B sandbox create failed: ${createRes.status}`);
  }

  const { sandboxID } = (await createRes.json()) as { sandboxID: string };

  try {
    const execRes = await fetch(`${E2B_API}/sandboxes/${sandboxID}/exec`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cmd: "python3", args: ["-c", code] }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!execRes.ok) {
      throw new Error(`E2B exec failed: ${execRes.status}`);
    }

    const result = (await execRes.json()) as { stdout?: string; stderr?: string };
    return (result.stdout ?? "") + (result.stderr ? `\n[stderr] ${result.stderr}` : "");
  } finally {
    await fetch(`${E2B_API}/sandboxes/${sandboxID}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => undefined);
  }
}

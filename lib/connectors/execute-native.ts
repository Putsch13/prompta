import type { ExecuteContext, ExecuteResult } from "./types";
import { isAllRangeValue } from "./param-defaults";

async function fetchPrimaryGmailAddress(token: string): Promise<string | undefined> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as {
    sendAs?: { sendAsEmail?: string; isPrimary?: boolean }[];
  };
  const primary = data.sendAs?.find((s) => s.isPrimary)?.sendAsEmail;
  return primary ?? data.sendAs?.[0]?.sendAsEmail;
}

function isPlaceholderValue(v?: string): boolean {
  if (!v?.trim()) return true;
  return v.trim().startsWith("{{");
}

async function gmailSend(
  ctx: ExecuteContext,
  params: Record<string, string>
): Promise<ExecuteResult> {
  if (!ctx.accessToken) throw new Error("Connexion Gmail requise");
  let from = params.from?.trim();
  if (isPlaceholderValue(from)) {
    from = (await fetchPrimaryGmailAddress(ctx.accessToken)) ?? "";
  }
  const fromLine = from ? `From: ${from}\r\n` : "";
  const raw = [
    fromLine,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    params.body,
  ].join("\r\n");
  const encoded = Buffer.from(raw).toString("base64url");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail : ${res.status} — ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return { output: `Email envoyé (id: ${data.id})`, metadata: data };
}

async function gmailRead(ctx: ExecuteContext, params: Record<string, string>): Promise<ExecuteResult> {
  if (!ctx.accessToken) throw new Error("Connexion Gmail requise");
  const q = params.query ? `&q=${encodeURIComponent(params.query)}` : "";
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5${q}`,
    { headers: { Authorization: `Bearer ${ctx.accessToken}` } }
  );
  if (!res.ok) throw new Error(`Gmail lecture : ${res.status}`);
  const data = await res.json();
  const count = data.messages?.length ?? 0;
  return { output: `${count} email(s) trouvé(s).`, metadata: data };
}

async function sheetsRead(ctx: ExecuteContext, params: Record<string, string>): Promise<ExecuteResult> {
  if (!ctx.accessToken) throw new Error("Connexion Google requise");
  if (isPlaceholderValue(params.spreadsheetId)) {
    throw new Error("Paramètre « Feuille de calcul » non renseigné");
  }

  const token = ctx.accessToken;
  const spreadsheetId = params.spreadsheetId;
  const range = params.range?.trim() ?? "";
  const tab = params.tab?.trim();

  async function fetchSheetTitles(): Promise<string[]> {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!metaRes.ok) {
      const err = await metaRes.text();
      throw new Error(`Google Sheets : ${metaRes.status} — ${err.slice(0, 200)}`);
    }
    const meta = (await metaRes.json()) as {
      sheets?: { properties?: { title?: string } }[];
    };
    return (meta.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => !!t?.trim());
  }

  async function fetchValues(rangeA1: string): Promise<unknown[][]> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeA1)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Sheets : ${res.status} — ${err.slice(0, 200)}`);
    }
    const data = (await res.json()) as { values?: unknown[][] };
    return data.values ?? [];
  }

  if (isAllRangeValue(range)) {
    const titles = tab ? [tab] : await fetchSheetTitles();
    const sheets: { sheet: string; values: unknown[][] }[] = [];
    for (const title of titles) {
      sheets.push({ sheet: title, values: await fetchValues(title) });
    }
    return {
      output: JSON.stringify(sheets, null, 2),
      metadata: { mode: "all_sheets", sheetCount: sheets.length },
    };
  }

  const effectiveRange = range || tab || "Sheet1";
  const values = await fetchValues(effectiveRange);
  return {
    output: JSON.stringify(values, null, 2),
    metadata: { range: effectiveRange },
  };
}

async function sheetsAppend(ctx: ExecuteContext, params: Record<string, string>): Promise<ExecuteResult> {
  if (!ctx.accessToken) throw new Error("Connexion Google requise");
  const values = JSON.parse(params.values || "[]");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${params.spreadsheetId}/values/${encodeURIComponent(params.range)}:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: Array.isArray(values[0]) ? values : [values] }),
  });
  if (!res.ok) throw new Error(`Google Sheets append : ${res.status}`);
  const data = await res.json();
  return { output: "Ligne ajoutée.", metadata: data };
}

async function slackSend(ctx: ExecuteContext, params: Record<string, string>): Promise<ExecuteResult> {
  if (!ctx.accessToken) throw new Error("Connexion Slack requise");
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: params.channel, text: params.text }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack : ${data.error ?? "erreur"}`);
  return { output: "Message Slack envoyé.", metadata: data };
}

async function telegramSend(ctx: ExecuteContext, params: Record<string, string>): Promise<ExecuteResult> {
  const token = ctx.apiKey ?? ctx.accessToken;
  if (!token) throw new Error("Token bot Telegram requis");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: params.chat_id, text: params.text }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram : ${data.description ?? "erreur"}`);
  return { output: "Message Telegram envoyé.", metadata: data };
}

async function canvaCreate(ctx: ExecuteContext, params: Record<string, string>): Promise<ExecuteResult> {
  if (!ctx.accessToken) throw new Error("Connexion Canva requise");
  const res = await fetch("https://api.canva.com/rest/v1/designs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      design_type: { type: "preset", name: "doc" },
      title: params.title,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Canva : ${res.status} — ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return { output: `Design créé : ${data.design?.id ?? "ok"}`, metadata: data };
}

const HANDLERS: Record<string, (ctx: ExecuteContext, params: Record<string, string>) => Promise<ExecuteResult>> = {
  "gmail.send": gmailSend,
  "gmail.read": gmailRead,
  "sheets.read": sheetsRead,
  "sheets.append": sheetsAppend,
  "slack.send": slackSend,
  "telegram.send": telegramSend,
  "canva.create": canvaCreate,
};

export async function executeNativeConnectorAction(
  actionId: string,
  params: Record<string, string>,
  ctx: ExecuteContext
): Promise<ExecuteResult> {
  const handler = HANDLERS[actionId];
  if (!handler) throw new Error(`Action connecteur inconnue : ${actionId}`);
  return handler(ctx, params);
}

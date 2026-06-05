import type { ExecuteContext, ExecuteResult } from "./types";

async function gmailSend(
  ctx: ExecuteContext,
  params: Record<string, string>
): Promise<ExecuteResult> {
  if (!ctx.accessToken) throw new Error("Connexion Gmail requise");
  const fromLine = params.from ? `From: ${params.from}\r\n` : "";
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
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${params.spreadsheetId}/values/${encodeURIComponent(params.range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${ctx.accessToken}` } });
  if (!res.ok) throw new Error(`Google Sheets : ${res.status}`);
  const data = await res.json();
  return { output: JSON.stringify(data.values ?? [], null, 2), metadata: data };
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

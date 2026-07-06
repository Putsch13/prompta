/**
 * Markdown léger → HTML email propre.
 *
 * Les agents produisent du markdown (titres, gras, listes) ; l'envoyer brut
 * en texte donnait des emails illisibles (« **titre** », mise en page plate).
 * Ce convertisseur volontairement minimal couvre ce que produisent les LLM :
 * titres (#, ##, ###), gras, italique, listes (tirets et numérotées), liens,
 * séparateurs, paragraphes. Tout le reste est échappé (pas d'injection HTML).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(md: string): string {
  let s = escapeHtml(md);
  // Liens [texte](url) — uniquement http(s).
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#4F46E5">$1</a>');
  // URLs nues.
  s = s.replace(/(?<!["'=>])(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#4F46E5">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px">$1</code>');
  return s;
}

/** Vrai si le texte ressemble déjà à du HTML complet. */
export function looksLikeHtml(text: string): boolean {
  return /<\s*(html|body|p|div|table|h[1-6]|ul|ol)\b/i.test(text);
}

export function markdownToEmailHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList();
      const level = Math.min(h[1].length + 1, 4); // # → h2 (h1 réservé au sujet)
      out.push(
        `<h${level} style="margin:18px 0 6px;color:#111827;font-size:${level === 2 ? 20 : level === 3 ? 16 : 14}px">${inline(h[2])}</h${level}>`,
      );
      continue;
    }
    const li = line.match(/^\s*[-*•]\s+(.*)$/);
    if (li) {
      if (list !== "ul") {
        closeList();
        out.push('<ul style="margin:6px 0;padding-left:22px">');
        list = "ul";
      }
      out.push(`<li style="margin:3px 0">${inline(li[1])}</li>`);
      continue;
    }
    const oli = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (oli) {
      if (list !== "ol") {
        closeList();
        out.push('<ol style="margin:6px 0;padding-left:22px">');
        list = "ol";
      }
      out.push(`<li style="margin:3px 0">${inline(oli[2])}</li>`);
      continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      closeList();
      out.push('<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">');
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    closeList();
    // Tableau markdown simple ? On le laisse en bloc monospace lisible.
    if (/^\s*\|.*\|\s*$/.test(line)) {
      out.push(`<div style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre">${inline(line)}</div>`);
      continue;
    }
    out.push(`<p style="margin:8px 0;line-height:1.55">${inline(line)}</p>`);
  }
  closeList();

  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:15px;max-width:660px">${out.join("\n")}</div>`;
}

/**
 * Parsing robuste du JSON renvoyé par un LLM.
 *
 * Les modèles produisent parfois du JSON légèrement invalide : texte autour,
 * blocs ```json, virgules traînantes, ou sauts de ligne/tabulations bruts à
 * l'intérieur d'une chaîne. On extrait l'objet de façon équilibrée (en
 * respectant les chaînes) puis on tente quelques réparations sûres.
 */

/** Extrait le premier objet JSON équilibré ({...}) en respectant les chaînes. */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  // Objet non fermé (probable troncature) → on rend ce qu'on a.
  return text.slice(start);
}

/** Réparations sûres : échappe les caractères de contrôle bruts dans les chaînes,
 *  supprime les virgules traînantes. */
export function repairJsonString(input: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inStr) {
      if (esc) {
        out += c;
        esc = false;
        continue;
      }
      if (c === "\\") {
        out += c;
        esc = true;
        continue;
      }
      if (c === '"') {
        out += c;
        inStr = false;
        continue;
      }
      // Caractères de contrôle bruts interdits en JSON → échappés.
      if (c === "\n") out += "\\n";
      else if (c === "\r") out += "\\r";
      else if (c === "\t") out += "\\t";
      else out += c;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      continue;
    }
    out += c;
  }
  // Virgules traînantes avant } ou ]
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** Parse tolérant : retourne l'objet ou null. */
export function parseLlmJson<T = unknown>(text: string): T | null {
  const block = extractJsonObject(text);
  if (!block) return null;
  try {
    return JSON.parse(block) as T;
  } catch {
    // tentative 1
  }
  try {
    return JSON.parse(repairJsonString(block)) as T;
  } catch {
    return null;
  }
}

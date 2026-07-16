/**
 * Evaluate simple condition expressions like:
 * {{score}} > 80
 * {{steps.extract_leads.json.count}} >= 5
 * {{variable}} == "hot"
 */
export function evaluateCondition(expression: string, vars: Record<string, string>): boolean {
  const trimmed = expression.trim();
  if (!trimmed) return false;

  // Opérateur le plus à GAUCHE (pas le premier de la liste) : sinon
  // `{{x}} == "a >= b"` serait parsé comme `>=` trouvé dans le littéral.
  // À index égal, le plus long gagne (`>=` avant `>`).
  const ops = [">=", "<=", "!=", "==", ">", "<", "contains"];
  let op = "";
  let opIdx = -1;

  for (const candidate of ops) {
    const idx = trimmed.indexOf(candidate);
    if (idx === -1) continue;
    if (opIdx === -1 || idx < opIdx || (idx === opIdx && candidate.length > op.length)) {
      op = candidate;
      opIdx = idx;
    }
  }

  if (opIdx === -1) {
    const val = resolveExpr(trimmed, vars);
    return val === "true" || val === "1" || val.toLowerCase() === "yes";
  }

  const leftRaw = trimmed.slice(0, opIdx).trim();
  const rightRaw = trimmed.slice(opIdx + op.length).trim();
  const left = resolveExpr(leftRaw, vars);
  const right = resolveExpr(rightRaw, vars);

  const leftNum = Number(left);
  const rightNum = Number(right);
  const bothNumeric = !Number.isNaN(leftNum) && !Number.isNaN(rightNum);

  switch (op) {
    case ">":
      return bothNumeric ? leftNum > rightNum : left > right;
    case "<":
      return bothNumeric ? leftNum < rightNum : left < right;
    case ">=":
      return bothNumeric ? leftNum >= rightNum : left >= right;
    case "<=":
      return bothNumeric ? leftNum <= rightNum : left <= right;
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "contains":
      return left.toLowerCase().includes(right.toLowerCase());
    default:
      return false;
  }
}

function resolveExpr(expr: string, vars: Record<string, string>): string {
  const m = expr.match(/^\{\{([\w.]+)\}\}$/);
  if (m) {
    const key = m[1];
    const dotIdx = key.indexOf(".");
    if (dotIdx === -1) return vars[key] ?? "";
    const base = key.slice(0, dotIdx);
    const path = key.slice(dotIdx + 1);
    const baseVal = vars[base];
    if (!baseVal) return "";
    try {
      let current: unknown = JSON.parse(baseVal);
      for (const seg of path.split(".")) {
        if (current == null || typeof current !== "object") return baseVal;
        current = (current as Record<string, unknown>)[seg];
      }
      return typeof current === "string" ? current : JSON.stringify(current);
    } catch {
      return baseVal;
    }
  }
  return expr.replace(/^["']|["']$/g, "");
}

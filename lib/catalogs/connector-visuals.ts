import type { PlanNode } from "@/lib/builder/plan-graph";
import { BUILDER_CATEGORIES } from "@/lib/catalogs";

export interface ConnectorVisual {
  color: string;
  emoji?: string;
  lucide?: string;
}

export const CONNECTOR_VISUALS: Record<string, ConnectorVisual> = {
  gmail: { color: "#EA4335", emoji: "📧" },
  google_sheets: { color: "#0F9D58", emoji: "📊" },
  slack: { color: "#4A154B", emoji: "💬" },
  telegram: { color: "#229ED9", emoji: "✈️" },
  linkedin: { color: "#0A66C2", emoji: "💼" },
  twitter: { color: "#000000", emoji: "𝕏" },
  x: { color: "#000000", emoji: "𝕏" },
  facebook: { color: "#1877F2", emoji: "📘" },
  instagram: { color: "#E4405F", emoji: "📸" },
  airtable: { color: "#FCB400", emoji: "🗂️" },
  notion: { color: "#000000", emoji: "📝" },
  hubspot: { color: "#FF7A59", emoji: "🧡" },
  canva: { color: "#00C4CC", emoji: "🎨" },
  whatsapp: { color: "#25D366", emoji: "📱" },
  github: { color: "#24292F", lucide: "Github" },
  stripe: { color: "#635BFF", emoji: "💳" },
  jira: { color: "#0052CC", emoji: "📋" },
  linear: { color: "#5E6AD2", emoji: "◇" },
  zendesk: { color: "#03363D", emoji: "🎫" },
  shopify: { color: "#96BF48", emoji: "🛒" },
  google_drive: { color: "#4285F4", emoji: "📁" },
};

const KIND_FALLBACK: Record<string, { lucide: string; color: string; label: string }> = {
  llm: { lucide: "MessageSquare", color: "#6366F1", label: "IA" },
  tool: { lucide: "Search", color: "#0EA5E9", label: "Outil" },
  code: { lucide: "Code", color: "#8B5CF6", label: "Code" },
  condition: { lucide: "GitBranch", color: "#F59E0B", label: "Condition" },
  approval: { lucide: "Shield", color: "#D97706", label: "Approbation" },
  action: { lucide: "Zap", color: "#10B981", label: "Action" },
  retrieve: { lucide: "BookOpen", color: "#0D9488", label: "Savoir (RAG)" },
  trigger: { lucide: "Play", color: "#64748B", label: "Déclencheur" },
};

export function getNodeVisual(node: PlanNode): {
  icon: string;
  color: string;
  label: string;
  emoji?: string;
  lucide?: string;
} {
  if (node.kind === "action" && node.connectorId) {
    const vis = CONNECTOR_VISUALS[node.connectorId] ?? CONNECTOR_VISUALS[node.connectorId.toLowerCase()];
    if (vis) {
      return {
        icon: vis.emoji ?? vis.lucide ?? "Zap",
        color: vis.color,
        label: node.actionSlug ?? node.connectorId,
        emoji: vis.emoji,
        lucide: vis.lucide,
      };
    }
    const cat = BUILDER_CATEGORIES.find((c) =>
      node.connectorId?.toLowerCase().includes(c.slug),
    );
    return {
      icon: cat?.icon ?? "Zap",
      color: "#10B981",
      label: node.actionSlug ?? node.connectorId,
      lucide: "Zap",
    };
  }

  if (node.kind === "llm") {
    const fb = KIND_FALLBACK.llm;
    return {
      icon: fb.lucide,
      color: fb.color,
      label: node.model ? `IA — ${node.model}` : "IA",
      lucide: fb.lucide,
    };
  }

  const fb = KIND_FALLBACK[node.kind] ?? KIND_FALLBACK.action;
  return {
    icon: fb.lucide,
    color: fb.color,
    label: node.toolId ?? fb.label,
    lucide: fb.lucide,
  };
}

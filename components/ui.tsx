/**
 * Primitives UI partagées — DA « AI Core » (dark HUD cyan).
 * Réduit à ce qui est réellement consommé : pastilles de statut + état vide.
 */

/**
 * Pastille de statut unifiée pour les runs/agents.
 * Couleurs cohérentes : succès, échec, en cours, attente, neutre.
 */
export type StatusTone =
  | "running"
  | "success"
  | "failed"
  | "pending"
  | "warning"
  | "cancelled"
  | "neutral";

const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  running: "border border-accent/30 bg-accent/10 text-accent",
  success: "border border-success/30 bg-success/10 text-success",
  failed: "border border-destructive/30 bg-destructive/10 text-destructive",
  pending: "border border-warning/30 bg-warning/10 text-warning",
  warning: "border border-warning/30 bg-warning/10 text-warning",
  cancelled: "border border-line bg-card2 text-ink-faint",
  neutral: "border border-line bg-card2 text-ink-soft",
};

/** Mappe un statut de run vers une tonalité de pastille. */
export function statusTone(status: string): StatusTone {
  switch (status) {
    case "completed":
    case "success":
      return "success";
    case "failed":
      return "failed";
    case "running":
      return "running";
    case "pending":
    case "queued":
      return "pending";
    case "awaiting_approval":
    case "suspended":
      return "warning";
    case "cancelled":
      return "cancelled";
    default:
      return "neutral";
  }
}

export function StatusPill({
  tone,
  children,
  dot = true,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE_CLASSES[tone]}`}
    >
      {dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${tone === "running" ? "animate-pulse" : ""} bg-current`} />
      )}
      {children}
    </span>
  );
}

/** État vide réutilisable (listes runs/agents/connexions). */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card p-10 text-center">
      {icon && <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-card2 text-ink-soft">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

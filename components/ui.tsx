import { Star, FileText, Bot, GitBranch } from "lucide-react";

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

interface KickerProps {
  children: React.ReactNode;
  className?: string;
}

export function Kicker({ children, className = "" }: KickerProps) {
  return (
    <span
      className={`text-[11px] font-bold uppercase tracking-wider text-ink-soft ${className}`}
    >
      {children}
    </span>
  );
}

interface StarsProps {
  rating: number;
  size?: "sm" | "md";
}

export function Stars({ rating, size = "md" }: StarsProps) {
  const starSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${starSize} ${
            i < Math.round(rating)
              ? "fill-star text-star"
              : "fill-transparent text-line"
          }`}
        />
      ))}
    </div>
  );
}

interface TypeBadgeProps {
  type: "prompt" | "agent" | "workflow";
  size?: "sm" | "md";
}

export function TypeBadge({ type, size = "md" }: TypeBadgeProps) {
  const colors = {
    prompt: "bg-sky-400/10 text-sky-300",
    agent: "bg-violet-400/10 text-violet-300",
    workflow: "bg-orange-400/10 text-orange-300",
  };

  const labels = {
    prompt: "Prompt",
    agent: "Agent",
    workflow: "Workflow",
  };

  const padding = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${colors[type]} ${padding}`}
    >
      <TypeIcon type={type} className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {labels[type]}
    </span>
  );
}

interface TypeIconProps {
  type: "prompt" | "agent" | "workflow";
  className?: string;
}

export function TypeIcon({ type, className = "h-4 w-4" }: TypeIconProps) {
  switch (type) {
    case "prompt":
      return <FileText className={className} />;
    case "agent":
      return <Bot className={className} />;
    case "workflow":
      return <GitBranch className={className} />;
  }
}

interface PriceTagProps {
  priceCents: number;
  size?: "sm" | "md" | "lg";
}

export function PriceTag({ priceCents, size = "md" }: PriceTagProps) {
  const isFree = priceCents === 0;

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
  };

  if (isFree) {
    return (
      <span className={`font-display font-bold text-success ${sizeClasses[size]}`}>
        Gratuit
      </span>
    );
  }

  return (
    <span className={`font-display font-bold text-ink ${sizeClasses[size]}`}>
      {(priceCents / 100).toFixed(2)} €
    </span>
  );
}

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ name, url, size = 40, className = "" }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-light font-display font-bold text-accent ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}

interface BadgePillProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}

export function BadgePill({ children, variant = "secondary" }: BadgePillProps) {
  const colors =
    variant === "primary"
      ? "bg-accent text-white"
      : "bg-card2 text-ink-soft";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${colors}`}
    >
      {children}
    </span>
  );
}

/**
 * Pastille de statut unifiée pour les runs/agents (P2 — design system).
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

/**
 * Bouton primitif du design system (P2).
 * Variantes : primary (accent), secondary (carte bordée), ghost, danger.
 */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent font-semibold text-accent-ink shadow-glow-sm hover:bg-accent-hover hover:shadow-glow",
  secondary:
    "border border-line bg-card text-ink hover:border-accent/50 hover:shadow-glow-sm",
  ghost: "text-ink-soft hover:bg-card2 hover:text-ink",
  danger: "bg-destructive/90 font-semibold text-[#1a0505] hover:bg-destructive",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...props}
    />
  );
}

/** Surface carte standard du design system (P2). */
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-line bg-card ${className}`}>
      {children}
    </div>
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

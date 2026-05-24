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
    prompt: "bg-blue-50 text-blue-600",
    agent: "bg-purple-50 text-purple-600",
    workflow: "bg-orange-50 text-orange-600",
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

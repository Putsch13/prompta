import Link from "next/link";
import { Download } from "lucide-react";
import { TypeBadge, PriceTag, Stars, fmt, Avatar } from "./ui";

interface PromptCardProps {
  slug: string;
  title: string;
  type: "prompt" | "agent" | "workflow";
  priceCents: number;
  description?: string | null;
  rating?: number | null;
  reviewCount?: number;
  downloads?: number;
  creator?: {
    username: string;
    display_name: string;
    avatar_url?: string | null;
  } | null;
  variant?: "default" | "compact";
}

export function PromptCard({
  slug,
  title,
  type,
  priceCents,
  description,
  rating,
  reviewCount = 0,
  downloads = 0,
  creator,
  variant = "default",
}: PromptCardProps) {
  if (variant === "compact") {
    return (
      <Link
        href={`/listing/${slug}`}
        className="flex items-center justify-between gap-4 rounded-xl border border-line bg-card px-4 py-3 transition-all hover:border-accent hover:shadow-sm"
      >
        <div className="flex items-center gap-3">
          <TypeBadge type={type} size="sm" />
          <span className="font-medium text-ink">{title}</span>
        </div>
        <PriceTag priceCents={priceCents} size="sm" />
      </Link>
    );
  }

  return (
    <Link
      href={`/listing/${slug}`}
      className="group flex flex-col rounded-xl border border-line bg-card p-5 transition-all hover:border-accent hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <TypeBadge type={type} />
        <PriceTag priceCents={priceCents} />
      </div>

      <h3 className="mt-3 font-display text-lg font-semibold text-ink group-hover:text-accent">
        {title}
      </h3>

      {description && (
        <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{description}</p>
      )}

      <div className="mt-auto flex items-center justify-between pt-4">
        {creator && (
          <div className="flex items-center gap-2">
            <Avatar
              name={creator.display_name}
              url={creator.avatar_url}
              size={24}
            />
            <span className="text-xs text-ink-soft">@{creator.username}</span>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-ink-soft">
          {rating !== null && rating !== undefined && rating > 0 && (
            <div className="flex items-center gap-1">
              <Stars rating={rating} size="sm" />
              <span>({reviewCount})</span>
            </div>
          )}
          {downloads > 0 && (
            <span className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              {fmt(downloads)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

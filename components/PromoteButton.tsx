"use client";

interface Props {
  slug: string;
  title: string;
}

export function PromoteButton({ slug, title }: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://prompta.app";
  const shareUrl = `${appUrl}/listing/${slug}`;
  const suggestedText = encodeURIComponent(
    `Découvrez mon prompt « ${title} » sur Prompta — prêt à tourner en un clic. ${shareUrl}`
  );
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${suggestedText}`;

  return (
    <a
      href={linkedInUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-light"
    >
      Promouvoir
    </a>
  );
}

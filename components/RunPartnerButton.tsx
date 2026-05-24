"use client";

import { posthog } from "@/lib/posthog";

interface Props {
  partnerName: string;
  runUrl: string;
  listingSlug?: string;
}

export function RunPartnerButton({ partnerName, runUrl, listingSlug }: Props) {
  function handleClick() {
    posthog.capture("partner_run_click", {
      listing_slug: listingSlug,
      partner_name: partnerName,
    });

    window.open(runUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 rounded-lg border border-accent bg-accent-light px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-white"
    >
      Exécuter dans {partnerName}
    </button>
  );
}

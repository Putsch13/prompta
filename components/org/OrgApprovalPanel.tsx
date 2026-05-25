"use client";

import { useState } from "react";

interface PendingListing {
  id: string;
  title: string;
  status: string;
}

interface Props {
  orgSlug: string;
  pending: PendingListing[];
  isAdmin: boolean;
}

export function OrgApprovalPanel({ orgSlug, pending, isAdmin }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  if (!isAdmin || pending.length === 0) return null;

  async function handleAction(orgListingId: string, action: "approve" | "reject") {
    setLoading(orgListingId);
    await fetch("/api/org/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgSlug, orgListingId, action }),
    });
    window.location.reload();
  }

  return (
    <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50/50 p-6">
      <h2 className="font-display text-lg font-semibold text-ink">
        En attente d&apos;approbation ({pending.length})
      </h2>
      <ul className="mt-4 space-y-2">
        {pending.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm"
          >
            <span>{item.title}</span>
            <div className="flex gap-2">
              <button
                onClick={() => handleAction(item.id, "approve")}
                disabled={loading === item.id}
                className="rounded bg-green-600 px-3 py-1 text-xs text-white"
              >
                Approuver
              </button>
              <button
                onClick={() => handleAction(item.id, "reject")}
                disabled={loading === item.id}
                className="rounded bg-red-600 px-3 py-1 text-xs text-white"
              >
                Rejeter
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

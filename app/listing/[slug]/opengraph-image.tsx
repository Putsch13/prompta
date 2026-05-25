import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const alt = "Prompta Listing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: { slug: string };
}

export default async function Image({ params }: Props) {
  const supabase = createAdminClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("title, type, price_cents, creator_id")
    .eq("slug", params.slug)
    .eq("status", "published")
    .single();

  const { data: creator } = listing
    ? await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", listing.creator_id)
        .single()
    : { data: null };

  const title = listing?.title ?? "Prompta";
  const creatorName = creator?.display_name ?? "Builder";
  const price =
    listing?.price_cents === 0
      ? "Gratuit"
      : `${((listing?.price_cents ?? 0) / 100).toFixed(2)} €`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 60,
          background: "linear-gradient(135deg, #FAF8F5 0%, #F0EBE3 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#0A66C2",
            }}
          />
          <span style={{ fontSize: 24, fontWeight: 700, color: "#1A1A1A" }}>
            Prompta
          </span>
        </div>
        <div>
          <span
            style={{
              fontSize: 18,
              color: "#0A66C2",
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            {listing?.type ?? "prompt"}
          </span>
          <h1
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: "#1A1A1A",
              marginTop: 12,
              lineHeight: 1.2,
            }}
          >
            {title.length > 60 ? title.slice(0, 60) + "…" : title}
          </h1>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 24, color: "#666" }}>par {creatorName}</span>
          <span
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "#0A66C2",
            }}
          >
            {price}
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}

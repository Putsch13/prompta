import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const alt = "Profil Prompta";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: { username: string };
}

export default async function Image({ params }: Props) {
  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, headline, is_verified")
    .eq("username", params.username)
    .single();

  const name = profile?.display_name ?? params.username;
  const headline = profile?.headline ?? "Builder Prompta";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 60,
          background: "linear-gradient(115deg, #0A66C2 0%, #378FE9 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            fontWeight: 700,
            color: "#0A66C2",
            marginBottom: 24,
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <h1 style={{ fontSize: 48, fontWeight: 700, color: "white" }}>
          {name}
          {profile?.is_verified ? " ✓" : ""}
        </h1>
        <p style={{ fontSize: 24, color: "rgba(255,255,255,0.85)", marginTop: 12 }}>
          {headline}
        </p>
        <p style={{ fontSize: 18, color: "rgba(255,255,255,0.6)", marginTop: 24 }}>
          prompta.app/u/{params.username}
        </p>
      </div>
    ),
    { ...size }
  );
}

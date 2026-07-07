import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Prompta — Ton agent IA travaille. Toi, tu valides.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Image de partage (LinkedIn, X, Slack…) pour la racine du site. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            P
          </div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>Prompta</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 68, fontWeight: 800, lineHeight: 1.15 }}>
          Ton agent IA travaille.
        </div>
        <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.15, opacity: 0.9 }}>
          Toi, tu valides.
        </div>
        <div style={{ marginTop: 40, fontSize: 30, opacity: 0.85 }}>
          Construis, lance et supervise des agents connectés à 1 000+ applications.
        </div>
      </div>
    ),
    size,
  );
}

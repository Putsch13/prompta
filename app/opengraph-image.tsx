import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Prompta — L'IA qui voit ton écran et fait le travail.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Image de partage (LinkedIn, X, Slack…) — DA « AI Core » dark HUD. */
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
          background:
            "radial-gradient(80% 80% at 70% 20%, rgba(56,189,248,0.18), transparent 60%), #05070D",
          color: "#E4EDF9",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Anneau décoratif */}
        <div
          style={{
            position: "absolute",
            right: -140,
            top: -140,
            width: 520,
            height: 520,
            borderRadius: 520,
            border: "2px solid rgba(56,189,248,0.35)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -90,
            top: -90,
            width: 420,
            height: 420,
            borderRadius: 420,
            border: "1px dashed rgba(56,189,248,0.25)",
            display: "flex",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 56,
              border: "2px solid rgba(56,189,248,0.7)",
              background: "rgba(56,189,248,0.12)",
              boxShadow: "0 0 40px rgba(56,189,248,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 700,
              color: "#E4EDF9",
            }}
          >
            P
          </div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>Prompta</div>
          <div
            style={{
              marginLeft: 12,
              padding: "6px 14px",
              borderRadius: 999,
              border: "1px solid rgba(56,189,248,0.4)",
              color: "#38BDF8",
              fontSize: 18,
              letterSpacing: 3,
            }}
          >
            AI CORE
          </div>
        </div>
        <div style={{ marginTop: 48, fontSize: 68, fontWeight: 800, lineHeight: 1.15 }}>
          {"L'IA qui voit ton écran"}
        </div>
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.15,
            color: "#38BDF8",
          }}
        >
          et fait le travail.
        </div>
        <div style={{ marginTop: 40, fontSize: 30, color: "#8FA1BC" }}>
          Tac au tac, missions cross-app, pilotage du navigateur — toi, tu valides.
        </div>
      </div>
    ),
    size,
  );
}

import { ImageResponse } from "next/og";

// Per-route og:image for /project/[accessId] — OVERRIDES the global app card. A project link that
// gets texted/forwarded must preview as a neutral, discreet "secure access" card: a locked vault,
// the brand, nothing that reveals the customer, address, or stage. Generated as a PNG on demand.
export const alt = "IOT TECHS — Secure access";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function ProjectOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(1000px 560px at 50% 8%, rgba(201,169,110,0.18), rgba(11,15,26,0) 60%), #0B0F1A",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Lock glyph in a soft ring */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 168,
            height: 168,
            borderRadius: 84,
            border: "2px solid rgba(201,169,110,0.35)",
            background: "rgba(201,169,110,0.08)",
            boxShadow: "0 0 60px rgba(201,169,110,0.25)",
          }}
        >
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#E8CB94" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        {/* Wordmark */}
        <div style={{ display: "flex", fontSize: 58, fontWeight: 800, letterSpacing: "0.06em", marginTop: 44 }}>
          <span>IOT&nbsp;</span>
          <span style={{ color: "#C9A96E" }}>TECHS</span>
        </div>

        {/* Discreet secure-access pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 22,
            border: "1px solid rgba(255,255,255,0.22)",
            borderRadius: 100,
            padding: "9px 24px",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "0.18em",
            color: "#c9cede",
          }}
        >
          SECURE&nbsp;ACCESS
        </div>

        <div style={{ display: "flex", fontSize: 20, marginTop: 26, color: "#6f7686", letterSpacing: "0.02em" }}>
          Private link · Authorized access only
        </div>
      </div>
    ),
    { ...size }
  );
}

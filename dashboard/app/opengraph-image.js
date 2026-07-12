import { ImageResponse } from "next/og";

// Auto-wired by Next as the og:image (and twitter:image) for the whole app, so texting any
// link shows this branded card instead of a gray blank. Generated as a PNG on demand — no
// binary asset to keep in the repo.
export const alt = "IOT TECHS — Security & automation, professionally installed";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "90px",
          background: "#0B0F1A",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 20,
              background: "#C9A96E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 30, height: 30, borderRadius: 30, background: "#0B0F1A" }} />
          </div>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: "0.06em", display: "flex" }}>
            <span>IOT&nbsp;</span>
            <span style={{ color: "#C9A96E" }}>TECHS</span>
          </div>
        </div>
        <div style={{ fontSize: 46, marginTop: 46, color: "#e6e8ee", maxWidth: 940, lineHeight: 1.25 }}>
          Security &amp; automation, professionally installed.
        </div>
        <div style={{ fontSize: 28, marginTop: 28, color: "#9aa1b3", display: "flex" }}>
          Cameras · Access control · Networking · Commercial &amp; residential
        </div>
      </div>
    ),
    { ...size }
  );
}

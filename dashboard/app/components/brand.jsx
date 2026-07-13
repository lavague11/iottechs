"use client";

// The company's real mark: bold "IOT TECHS" wordmark (no icon in front of it — every
// context that used to show a lock-in-a-square icon just drops the icon) + a pill-shaped
// tagline badge ("Make Tomorrow Safer Today" + a small globe glyph) wherever there's room
// for a tagline. `tone` picks a readable default color for dark vs light surfaces; pass
// `className`/`style` to fold into a surface's existing typography instead.
export function TaglinePill({ tone = "dark", className = "", style }) {
  const border = tone === "light" ? "#1c2333" : "rgba(255,255,255,.35)";
  const text = tone === "light" ? "#1c2333" : "#fff";
  return (
    <span className={`brand-pill ${className}`} style={{ borderColor: border, color: text, ...style }}>
      Make Tomorrow Safer Today
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18M4.5 7.5h15M4.5 16.5h15" />
      </svg>
      <style>{`
        .brand-pill{display:inline-flex;align-items:center;gap:6px;border:1.5px solid;border-radius:100px;padding:4px 12px;font-size:.68rem;font-weight:600;letter-spacing:.02em;white-space:nowrap}
      `}</style>
    </span>
  );
}

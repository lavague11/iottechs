"use client";

// The company's real mark, from the owner's logo art (2026-07-14): squared, segment-gapped
// "IOT TECHS" letterforms + the "Make Tomorrow Safer Today" pill. The wordmark is drawn as
// inline SVG (stadium-ended strokes on a 100-unit cap grid) so it scales crisp anywhere and
// can never be lost again — a standalone copy also lives at public/logo.svg.

// One letter = a group of rounded rects (fill) or a stroked ring (O / C). currentColor drives
// the fill, so surfaces color it via CSS; `twoTone` paints "TECHS" gold like the site accent.
export function Wordmark({ height = 22, twoTone = true, className = "", style, techsColor = "var(--gold-deep, #a8894e)" }) {
  return (
    <svg viewBox="0 0 742 100" height={height} className={className} style={{ display: "block", ...style }}
         role="img" aria-label="IOT TECHS" xmlns="http://www.w3.org/2000/svg">
      <g fill="currentColor">
        {/* I */}
        <rect x="0" y="0" width="22" height="100" rx="11" />
        {/* O — stroked ring */}
        <rect x="49" y="11" width="62" height="78" rx="26" fill="none" stroke="currentColor" strokeWidth="22" />
        {/* T */}
        <g transform="translate(138)">
          <rect x="0" y="0" width="84" height="22" rx="11" />
          <rect x="31" y="0" width="22" height="100" rx="11" />
        </g>
      </g>
      <g fill="currentColor" style={twoTone ? { color: techsColor } : undefined}>
        {/* T */}
        <g transform="translate(270)">
          <rect x="0" y="0" width="84" height="22" rx="11" />
          <rect x="31" y="0" width="22" height="100" rx="11" />
        </g>
        {/* E — spine + three detached arms (the segmented signature of the mark) */}
        <g transform="translate(370)">
          <rect x="0" y="0" width="22" height="100" rx="11" />
          <rect x="30" y="0" width="42" height="22" rx="11" />
          <rect x="30" y="39" width="42" height="22" rx="11" />
          <rect x="30" y="78" width="42" height="22" rx="11" />
        </g>
        {/* C — the O ring with its right side opened */}
        <rect x="469" y="11" width="62" height="78" rx="26" fill="none" stroke="currentColor" strokeWidth="22"
              strokeLinecap="round" strokeDasharray="46.8 34 154.6" />
        {/* H — crossbar floats between the stems */}
        <g transform="translate(558)">
          <rect x="0" y="0" width="22" height="100" rx="11" />
          <rect x="62" y="0" width="22" height="100" rx="11" />
          <rect x="30" y="39" width="24" height="22" rx="11" />
        </g>
        {/* S */}
        <g transform="translate(658)">
          <rect x="0" y="0" width="84" height="22" rx="11" />
          <rect x="0" y="11" width="22" height="40" rx="11" />
          <rect x="0" y="39" width="84" height="22" rx="11" />
          <rect x="62" y="50" width="22" height="39" rx="11" />
          <rect x="0" y="78" width="84" height="22" rx="11" />
        </g>
      </g>
    </svg>
  );
}

// The pill-shaped tagline badge ("Make Tomorrow Safer Today" + a small globe glyph) wherever
// there's room for a tagline. `tone` picks a readable default color for dark vs light surfaces;
// pass `className`/`style` to fold into a surface's existing typography instead.
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

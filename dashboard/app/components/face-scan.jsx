"use client";

import { useEffect, useRef } from "react";

// Reusable Face-ID scan animation — the camera-lens replacement used on the PIN
// gate, the login page, and enrollment. Pure visual; the camera + 1:N matching
// are driven by the parent. Drive it with `state`:
//   idle      → nothing drawn
//   scanning  → gold frame + face draw in, gentle pulse
//   ok        → recolors green
//   fail      → frame red, face removed, red ✕ draws in
// No circle — the mark floats on whatever background it sits on.
export default function FaceScan({ state = "idle", size = 150 }) {
  const ref = useRef(null);

  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    if (state === "scanning") { f.className = "fsc"; void f.offsetWidth; f.classList.add("draw", "scanning"); }
    else if (state === "ok") { f.className = "fsc draw ok"; }
    else if (state === "fail") { f.className = "fsc draw fail"; }
    else { f.className = "fsc"; }   // idle: dim resting glyph
  }, [state]);

  return (
    <div className="fsc-wrap" style={{ width: size, height: size }}>
      <style>{FSC_CSS}</style>
      <div className="fsc" ref={ref}>
        <svg className="fsc-frame" viewBox="0 0 100 100">
          <path d="M8 26 V16 Q8 8 16 8 H26" style={{ "--len": 44 }} />
          <path d="M74 8 H84 Q92 8 92 16 V26" style={{ "--len": 44 }} />
          <path d="M92 74 V84 Q92 92 84 92 H74" style={{ "--len": 44 }} />
          <path d="M26 92 H16 Q8 92 8 84 V74" style={{ "--len": 44 }} />
        </svg>
        <svg className="fsc-face" viewBox="0 0 100 100">
          <line x1="37" y1="42" x2="37" y2="50" style={{ "--len": 8 }} />
          <line x1="63" y1="42" x2="63" y2="50" style={{ "--len": 8 }} />
          <path d="M50 46 V58 Q50 61 47 61" style={{ "--len": 20 }} />
          <path d="M38 68 Q50 78 62 68" style={{ "--len": 30 }} />
        </svg>
        <svg className="fsc-cross" viewBox="0 0 100 100">
          <line x1="36" y1="36" x2="64" y2="64" style={{ "--len": 40 }} />
          <line x1="64" y1="36" x2="36" y2="64" style={{ "--len": 40 }} />
        </svg>
      </div>
    </div>
  );
}

const FSC_CSS = `
.fsc-wrap{position:relative;display:grid;place-items:center}
.fsc{position:relative;width:78%;height:78%}
.fsc svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
/* Resting state: the glyph is always drawn, just dim — no empty gap. */
.fsc-frame path{fill:none;stroke:#C9A96E;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;
  stroke-dasharray:var(--len);stroke-dashoffset:0;opacity:.32;
  filter:drop-shadow(0 0 4px rgba(201,169,110,.3));transition:opacity .35s,stroke .35s}
.fsc-face path,.fsc-face line{fill:none;stroke:#C9A96E;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;
  stroke-dasharray:var(--len);stroke-dashoffset:0;opacity:.32;transition:opacity .35s,stroke .35s}
.fsc-cross line{fill:none;stroke:#C2534E;stroke-width:7;stroke-linecap:round;
  stroke-dasharray:var(--len);stroke-dashoffset:var(--len);opacity:0}
/* Scan: redraw the strokes and bring them to full brightness, then pulse. */
.fsc.draw .fsc-frame path{animation:fscDraw .55s ease;opacity:1}
.fsc.draw .fsc-face path,.fsc.draw .fsc-face line{animation:fscDraw .5s ease .3s;opacity:1}
.fsc.fail .fsc-cross line{animation:fscDraw .3s ease forwards,fscAppear .01s forwards}
@keyframes fscDraw{from{stroke-dashoffset:var(--len)}to{stroke-dashoffset:0}}
@keyframes fscAppear{to{opacity:1}}
.fsc.scanning{animation:fscPulse 1.5s ease-in-out .8s infinite}
@keyframes fscPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
.fsc.ok .fsc-frame path,.fsc.ok .fsc-face path,.fsc.ok .fsc-face line{stroke:#1c8a45;opacity:1}
.fsc.fail .fsc-frame path{stroke:#C2534E;opacity:1}
.fsc.fail .fsc-face{display:none}
@media(prefers-reduced-motion:reduce){.fsc *{animation-duration:.01s!important}}
`;

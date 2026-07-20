"use client";

// UnlockPatternReveal — a lock-screen "password" (the G pattern) draws itself across the recorder's
// unlock screen, an "Unlocked" toast slides in, then the lock layer fades to reveal the live camera
// grid. Self-contained, no dependencies.
//
// Supplied by the owner as a drop-in; adapted here to the vault-dark theme (gold trace) and driven
// by the guide's own controls instead of self-looping. Dot centres and the pattern were measured
// against pattern-locked.png (native 1448×1086) — re-measure if that image is ever swapped.

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_DOTS = {
  1: [616, 475], 2: [716, 475], 3: [815, 475],
  4: [616, 556], 5: [716, 556], 6: [815, 556],
  7: [616, 637], 8: [716, 637], 9: [815, 637],
};
// The G, in the recorder's own draw order.
const DEFAULT_PATTERN = [3, 2, 1, 4, 7, 8, 9, 6, 5];

export default function UnlockPatternReveal({
  lockedSrc = "/guides/nvr/pattern-locked.png",
  cleanSrc = "/guides/nvr/pattern-clean.png",
  dots = DEFAULT_DOTS,
  pattern = DEFAULT_PATTERN,
  viewBox = { w: 1448, h: 1086 },
  traceColor = "#C9A96E",
  successColor = "#2f9e63",
  toastTitle = "Unlocked",
  toastSubtitle = "Access granted",
  drawMs = 3000,
  replayKey = 0,          // bump from the parent to replay
}) {
  const traceRef = useRef(null);
  const penRef = useRef(null);
  const nodeRefs = useRef({});
  const rafRef = useRef(null);
  const timersRef = useRef([]);

  const [revealed, setRevealed] = useState(false);
  const [toast, setToast] = useState(false);

  const geom = useRef(null);
  if (!geom.current || geom.current.pattern !== pattern) {
    const pts = pattern.map((n) => dots[n]);
    const seg = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      seg.push(L); total += L;
    }
    const reach = [0];
    for (let i = 0; i < seg.length; i++) reach.push(reach[i] + seg[i]);
    geom.current = { pattern, pts, seg, total, reach };
  }

  const pointAt = useCallback((d) => {
    const { pts, seg } = geom.current;
    if (d <= 0) return pts[0];
    let acc = 0;
    for (let i = 0; i < seg.length; i++) {
      if (d <= acc + seg[i]) {
        const t = (d - acc) / seg[i];
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
      }
      acc += seg[i];
    }
    return pts[pts.length - 1];
  }, []);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };
  const later = (fn, ms) => timersRef.current.push(setTimeout(fn, ms));

  const resetVisuals = useCallback(() => {
    if (traceRef.current) { traceRef.current.setAttribute("points", ""); traceRef.current.style.stroke = traceColor; }
    if (penRef.current) penRef.current.style.opacity = 0;
    Object.values(nodeRefs.current).forEach((c) => { if (c) c.style.fill = "transparent"; });
    setToast(false); setRevealed(false);
  }, [traceColor]);

  const cycle = useCallback(() => {
    clearTimers();
    resetVisuals();
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const DUR = reduce ? 900 : drawMs;

    later(() => {
      const { pts, total, reach } = geom.current;
      let start = null, lit = 0;
      if (penRef.current) penRef.current.style.opacity = 1;

      const frame = (ts) => {
        if (!start) start = ts;
        const p = Math.min(1, (ts - start) / DUR);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const d = e * total;

        let str = "";
        for (let i = 0; i < pts.length; i++) if (reach[i] <= d) str += `${pts[i][0]},${pts[i][1]} `;
        const cur = pointAt(d);
        str += `${cur[0]},${cur[1]}`;
        traceRef.current?.setAttribute("points", str.trim());
        if (penRef.current) { penRef.current.setAttribute("cx", cur[0]); penRef.current.setAttribute("cy", cur[1]); }
        while (lit < pattern.length && d >= reach[lit] - 0.5) {
          const el = nodeRefs.current[pattern[lit]];
          if (el) el.style.fill = traceColor;
          lit++;
        }

        if (p < 1) { rafRef.current = requestAnimationFrame(frame); }
        else {
          if (penRef.current) penRef.current.style.opacity = 0;
          if (traceRef.current) traceRef.current.style.stroke = successColor;
          pattern.forEach((n) => { const el = nodeRefs.current[n]; if (el) el.style.fill = successColor; });
          later(() => setToast(true), 350);
          later(() => setRevealed(true), 1150);
          later(() => setToast(false), 3200);
        }
      };
      rafRef.current = requestAnimationFrame(frame);
    }, 500);
  }, [drawMs, pattern, pointAt, resetVisuals, successColor, traceColor]);

  useEffect(() => { cycle(); return clearTimers; }, [cycle, replayKey]);

  return (
    <div className="upr-wrap">
      <div className="upr-frame">
        <img src={cleanSrc} alt="" className="upr-img" style={{ zIndex: 1 }} draggable={false} />
        <div className="upr-lock" style={{ opacity: revealed ? 0 : 1 }}>
          <img src={lockedSrc} alt="" className="upr-img" style={{ zIndex: 1 }} draggable={false} />
          <svg viewBox={`0 0 ${viewBox.w} ${viewBox.h}`} preserveAspectRatio="none" className="upr-svg">
            <polyline ref={traceRef} points="" fill="none" stroke={traceColor} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round"
              style={{ transition: "stroke .3s", filter: "drop-shadow(0 0 8px currentColor)" }} />
            <circle ref={penRef} r={10} fill="#fff" style={{ opacity: 0 }} />
            {Object.entries(dots).map(([n, [x, y]]) => (
              <circle key={n} ref={(el) => (nodeRefs.current[n] = el)} cx={x} cy={y} r={22} fill="transparent" style={{ transition: "fill .18s ease" }} />
            ))}
          </svg>
        </div>
        <div className="upr-toast" style={{ transform: toast ? "translate(-50%,0)" : "translate(-50%,-140%)", opacity: toast ? 1 : 0 }}>
          <span className="upr-toast-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0b0c0e" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><path d="M4 12.5l5 5L20 6" /></svg>
          </span>
          <span className="upr-toast-tx">{toastTitle}{toastSubtitle ? <small>{toastSubtitle}</small> : null}</span>
        </div>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.upr-wrap{width:100%;display:flex;justify-content:center}
.upr-frame{position:relative;width:100%;max-width:560px;aspect-ratio:1448 / 1086;border-radius:10px;overflow:hidden;box-shadow:0 24px 60px -18px rgba(0,0,0,.55)}
.upr-img{position:absolute;inset:0;width:100%;height:100%;display:block}
.upr-lock{position:absolute;inset:0;z-index:2;transition:opacity .7s ease}
.upr-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;z-index:2}
.upr-toast{position:absolute;z-index:3;top:5%;left:50%;display:flex;align-items:center;gap:10px;padding:11px 20px 11px 14px;border-radius:14px;background:rgba(20,22,26,.82);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 34px rgba(0,0,0,.5);transition:transform .5s cubic-bezier(.2,1.2,.35,1),opacity .4s ease;white-space:nowrap}
.upr-toast-ic{width:26px;height:26px;border-radius:50%;flex:0 0 auto;background:#2f9e63;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(47,158,99,.7)}
.upr-toast-tx{color:#f2f5f8;font-weight:600;font-size:clamp(13px,1.5vw,16px);letter-spacing:.3px;display:flex;flex-direction:column;line-height:1.25}
.upr-toast-tx small{font-weight:400;font-size:.78em;color:#aab2bd}
`;

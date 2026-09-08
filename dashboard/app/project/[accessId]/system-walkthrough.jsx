"use client";
import { useState, useEffect, useMemo } from "react";

// A guided, camera-by-camera tour of the customer's system. Each stop ties a camera's LOCATION
// (its dot + heading arrow on the floor-plan mini-map, the rest dimmed) to WHAT IT SEES (its view
// photo). Prev/Next, progress pips, and an autoplay "tour". Read-only, customer-facing — no cone,
// no compass claim (we don't know the plan's north), just the real aim arrow. Driven by the same
// survey2/mockup data the layout already loads.
//   floors: [{ name, bg, cams:[{ x, y, aim, aimed, name, cid, photo, photoName }] }]
//   photos: [{ url, name }]  (mockup previews — a fallback "what it sees" when a camera has no photo)
const norm = (s) => String(s || "").trim().toLowerCase();

export default function SystemWalkthrough({ floors = [], photos = [], focusCid = null }) {
  const stops = useMemo(() => {
    const out = [];
    floors.forEach((f, fi) => (f.cams || []).forEach((cam, ci) => out.push({ fi, floor: f, cam, ci })));
    return out;
  }, [floors]);
  const total = stops.length;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { if (idx > total - 1) setIdx(0); }, [total, idx]);
  // "View Placement" on a camera line jumps the tour straight to that camera (matched by cid).
  useEffect(() => {
    if (!focusCid) return;
    const i = stops.findIndex((s) => s.cam.cid && s.cam.cid === focusCid);
    if (i >= 0) { setPlaying(false); setIdx(i); }
  }, [focusCid, stops]);
  useEffect(() => {
    if (!playing || total <= 1) return;
    const t = setTimeout(() => setIdx((i) => { if (i >= total - 1) { setPlaying(false); return i; } return i + 1; }), 3800);
    return () => clearTimeout(t);
  }, [playing, idx, total]);

  if (!total) return null;
  const cur = stops[idx];
  const f = cur.floor;
  const shot = cur.cam.photo || photos.find((p) => norm(p.name) === norm(cur.cam.name))?.url || null;
  const go = (n) => { setPlaying(false); setIdx(Math.max(0, Math.min(total - 1, n))); };
  const atEnd = idx >= total - 1;
  const togglePlay = () => { if (playing) { setPlaying(false); return; } if (atEnd) setIdx(0); setPlaying(true); };

  return (
    <div className="swk">
      <style>{SWK_CSS}</style>
      <div className="swk-stage">
        <div className="swk-map">
          <img src={f.bg} alt={f.name} />
          {(f.cams || []).map((c, j) => {
            const on = j === cur.ci;
            return (
              <span key={j} className={`swk-dot${on ? " on" : ""}`} style={{ left: `${c.x}%`, top: `${c.y}%` }} title={c.name || `Camera ${j + 1}`}>
                {on && c.aimed && Number.isFinite(c.aim) && (
                  <svg className="swk-aim" viewBox="0 0 40 40" style={{ transform: `translate(-50%,-50%) rotate(${c.aim}deg)` }} aria-hidden="true">
                    <line x1="20" y1="20" x2="34" y2="20" /><path d="M31 15l7 5-7 5z" />
                  </svg>
                )}
                <span className="swk-dot-n">{j + 1}</span>
              </span>
            );
          })}
          {floors.length > 1 && <span className="swk-floor-tag">{f.name}</span>}
        </div>
        <div className="swk-view">
          {shot
            ? <img key={shot} src={shot} alt={cur.cam.name || "Camera view"} className="swk-shot" loading="lazy" />
            : (
              <div className="swk-noshot">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                <span>Preview coming soon</span>
              </div>
            )}
          <div className="swk-badge">{idx + 1}<span>/{total}</span></div>
        </div>
      </div>

      <div className="swk-cap">
        <div className="swk-cap-nm">{cur.cam.name || `Camera ${cur.ci + 1}`}</div>
        <div className="swk-cap-sub">{floors.length > 1 ? `${f.name} · ` : ""}Camera {idx + 1} of {total}</div>
      </div>

      <div className="swk-ctrl">
        <button type="button" className="swk-nav" disabled={idx === 0} onClick={() => go(idx - 1)} aria-label="Previous camera">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="swk-pips">
          {stops.map((_, i) => <button key={i} type="button" className={`swk-pip${i === idx ? " on" : ""}`} onClick={() => go(i)} aria-label={`Camera ${i + 1}`} />)}
        </div>
        <button type="button" className="swk-nav" disabled={atEnd} onClick={() => go(idx + 1)} aria-label="Next camera">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        {total > 1 && (
          <button type="button" className="swk-play" onClick={togglePlay}>
            {playing
              ? <><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>Pause</>
              : <><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>{atEnd ? "Replay" : "Play tour"}</>}
          </button>
        )}
      </div>
    </div>
  );
}

const SWK_CSS = `
.swk{margin:2px 0 4px}
.swk-stage{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:560px){.swk-stage{grid-template-columns:1fr}}
.swk-map{position:relative;border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;overflow:hidden;background:#eef0f2;line-height:0}
.swk-map>img{width:100%;display:block}
.swk-view{position:relative;border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;overflow:hidden;background:#0B0F1A;display:flex;align-items:center;justify-content:center;min-height:150px}
.swk-shot{width:100%;height:100%;object-fit:cover;display:block;animation:swkFade .5s ease}
@keyframes swkFade{from{opacity:0}to{opacity:1}}
.swk-noshot{display:flex;flex-direction:column;align-items:center;gap:8px;color:#9aa1ac;font-size:.78rem;font-weight:500;padding:24px}
.swk-badge{position:absolute;right:8px;bottom:8px;background:rgba(11,15,26,.72);color:#fff;font-size:.74rem;font-weight:700;padding:2px 8px;border-radius:100px;font-variant-numeric:tabular-nums}
.swk-badge span{opacity:.6;font-weight:600}
.swk-floor-tag{position:absolute;left:8px;top:8px;background:rgba(11,15,26,.72);color:#fff;font-size:.68rem;font-weight:600;letter-spacing:.02em;padding:2px 9px;border-radius:100px}
/* Camera dots — inactive ones recede so the current stop reads as the subject. */
.swk-dot{position:absolute;transform:translate(-50%,-50%);width:16px;height:16px;border-radius:50%;background:var(--dv-faint,#A1A6AC);color:#fff;font-size:.6rem;font-weight:800;display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);opacity:.55;transition:all .35s ease;z-index:1}
.swk-dot.on{width:24px;height:24px;font-size:.72rem;background:var(--dv-gold,#C9A96E);opacity:1;z-index:3;box-shadow:0 0 0 4px rgba(201,169,110,.28),0 2px 8px rgba(0,0,0,.35)}
.swk-dot-n{position:relative;z-index:1;line-height:1}
.swk-aim{position:absolute;left:50%;top:50%;width:44px;height:44px;overflow:visible;pointer-events:none;z-index:0}
.swk-aim line{stroke:var(--dv-gold,#C9A96E);stroke-width:2.6;stroke-linecap:round}
.swk-aim path{fill:var(--dv-gold,#C9A96E)}
.swk-cap{text-align:center;margin:11px 0 9px}
.swk-cap-nm{font-size:1rem;font-weight:700;letter-spacing:-.01em;color:var(--dv-ink,#101418)}
.swk-cap-sub{font-size:.76rem;color:var(--dv-meta,#787D84);margin-top:2px}
.swk-ctrl{display:flex;align-items:center;justify-content:center;gap:12px}
.swk-nav{width:36px;height:36px;flex:0 0 auto;border-radius:50%;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);display:grid;place-items:center;cursor:pointer}
.swk-nav:hover:not(:disabled){border-color:var(--dv-ink,#101418)}
.swk-nav:disabled{opacity:.35;cursor:default}
.swk-pips{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:center}
.swk-pip{width:8px;height:8px;border-radius:50%;border:none;background:var(--dv-line,#E4E4DF);cursor:pointer;padding:0;transition:all .2s}
.swk-pip:hover{background:var(--dv-faint,#A1A6AC)}
.swk-pip.on{background:var(--dv-gold,#C9A96E);width:22px;border-radius:100px}
.swk-play{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 15px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit}
.swk-play:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
@media (prefers-reduced-motion:reduce){.swk-dot,.swk-shot{transition:none;animation:none}}
`;

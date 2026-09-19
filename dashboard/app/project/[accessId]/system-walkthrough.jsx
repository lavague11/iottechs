"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { addToolNoteAction } from "./proposal-actions";
import MicButton from "../../components/mic-button";

// Two-panel Walkthrough (mobile-first): the floor plan stays PUT on top with the active camera's marker
// highlighted, and the camera view below is a horizontal photo carousel (swipe / prev-next / autoplay).
// You always see WHERE a camera is and WHAT it sees at once. No map zoom, no marker→photo morph, no
// circular reveal — just a stable map + a clean iPhone-style photo carousel.
//   floors: [{ name, bg, cams:[{ x, y, name, cid, photo }] }]   photos: [{ url, name }]
const norm = (s) => String(s || "").trim().toLowerCase();
const pad2 = (n) => String(n).padStart(2, "0");
const EASE = "cubic-bezier(.22,1,.36,1)";

export default function SystemWalkthrough({ accessId = "", floors = [], photos = [], focusCid = null, customerName = "", defaultFs = false, onClose = null }) {
  const stops = useMemo(() => {
    const out = [];
    floors.forEach((f, fi) => (f.cams || []).forEach((cam, ci) => out.push({ fi, floor: f, cam, ci })));
    return out;
  }, [floors]);
  const total = stops.length;
  const shotFor = (cam) => cam.photo || photos.find((p) => norm(p.name) === norm(cam.name))?.url || null;
  const nameFor = (s) => (s.cam.name && s.cam.name.trim()) || `Camera ${s.ci + 1}`;
  const keyFor = (s) => s.cam.cid || `${s.fi}:${s.ci}`;

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [fs, setFs] = useState(!!defaultFs);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [commentOpen, setCommentOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState({});
  const [saving, setSaving] = useState(false);

  // Marker positioning on the (stable) map panel — the plan is contain-fit; place markers on its real rect.
  const mapRef = useRef(null), aerialRef = useRef(null);
  const [plate, setPlate] = useState(null);   // { l, t, w, h } of the plan image within the map panel
  const measure = useCallback(() => {
    const box = mapRef.current, img = aerialRef.current;
    if (!box || !img || !img.naturalWidth) return;
    const bw = box.clientWidth, bh = box.clientHeight; if (!bw || !bh) return;
    const a = img.naturalWidth / img.naturalHeight;
    let w, h; if (bw / bh > a) { h = bh; w = bh * a; } else { w = bw; h = bw / a; }
    setPlate({ l: (bw - w) / 2, t: (bh - h) / 2, w, h });
  }, []);
  useEffect(() => {
    measure();
    let ro; try { ro = new ResizeObserver(measure); if (mapRef.current) ro.observe(mapRef.current); } catch { /* no RO */ }
    window.addEventListener("resize", measure);
    return () => { try { ro && ro.disconnect(); } catch { /* noop */ } window.removeEventListener("resize", measure); };
  }, [measure, fs]);

  useEffect(() => { if (idx > total - 1) setIdx(Math.max(0, total - 1)); }, [total, idx]);
  // "View placement" from a camera line jumps straight to that camera.
  useEffect(() => {
    if (!focusCid) return;
    const i = stops.findIndex((s) => s.cam.cid && s.cam.cid === focusCid);
    if (i >= 0) { setPlaying(false); setEnded(false); setIdx(i); }
  }, [focusCid, stops]);

  const go = useCallback((i) => setIdx(Math.max(0, Math.min(total - 1, i))), [total]);
  const next = () => { setPlaying(false); setEnded(false); go(idx + 1); };
  const prev = () => { setPlaying(false); setEnded(false); go(idx - 1); };
  const selectCam = (i) => { setPlaying(false); setEnded(false); go(i); };

  // Autoplay — advance every ~4.2s; the MAP NEVER MOVES, only the marker + carousel. Stops at the end (→ Replay).
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => { if (idx >= total - 1) { setPlaying(false); setEnded(true); } else setIdx(idx + 1); }, 4200);
    return () => clearTimeout(t);
  }, [playing, idx, total]);
  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    if (ended || idx >= total - 1) { setEnded(false); setIdx(0); }
    setPlaying(true);
  };

  // ---- horizontal swipe carousel (camera panel only) ----
  const [drag, setDrag] = useState(0);        // live px offset during a swipe (for the render)
  const dragRef = useRef(0), dragging = useRef(false), axis = useRef(null);
  const startX = useRef(0), startY = useRef(0), trackW = useRef(1);
  const carRef = useRef(null);
  const setDragBoth = (v) => { dragRef.current = v; setDrag(v); };
  function onDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging.current = true; axis.current = null;
    startX.current = e.clientX; startY.current = e.clientY;
    trackW.current = carRef.current?.clientWidth || 1;
  }
  function onMove(e) {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current, dy = e.clientY - startY.current;
    if (axis.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (axis.current !== "x") return;
    if (playing) setPlaying(false);
    let d = dx;                                   // resist past the ends
    if ((idx === 0 && dx > 0) || (idx === total - 1 && dx < 0)) d = dx * 0.35;
    setDragBoth(d);
  }
  function onUp() {
    if (!dragging.current) return;
    dragging.current = false;
    const d = dragRef.current, th = Math.min(90, trackW.current * 0.22);
    setDragBoth(0);
    if (axis.current === "x") { setEnded(false); if (d < -th) go(idx + 1); else if (d > th) go(idx - 1); }
    axis.current = null;
  }

  // A per-camera note is REAL feedback — persist it to the mockup comment channel, anchored by the
  // camera's name (existing convention), so staff see it on the thread.
  const saveNote = async () => {
    const cur = stops[idx]; if (!cur) return;
    const v = draft.trim(); if (!v) return;
    const anchor = (cur.cam.name && cur.cam.name.trim()) || `Camera ${cur.ci + 1}`;
    setNotes((n) => ({ ...n, [keyFor(cur)]: v })); setCommentOpen(false);
    if (!accessId) return;
    setSaving(true);
    try { await addToolNoteAction(accessId, "mockup", anchor, v); } catch { /* keep the optimistic note */ }
    setSaving(false);
  };

  // Fullscreen: lock scroll + Esc/arrows.
  useEffect(() => {
    if (!fs) return;
    const onKey = (e) => {
      if (e.key === "Escape") { if (commentOpen) setCommentOpen(false); else { setFs(false); onClose && onClose(); } }
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOv = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOv; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs, commentOpen, idx, total]);

  if (!total) return null;
  const cur = stops[idx];
  const f = cur.floor;
  const noteKey = keyFor(cur);

  const tree = (
    <div className={`swk2${fs ? " fs" : ""}`}>
      <style>{CSS}</style>

      {fs && (
        <div className="swk2-bar">
          <span className="swk2-ttl">Walkthrough{customerName ? ` · ${customerName}` : ""}</span>
          <button className="swk2-x" title="Close" aria-label="Close walkthrough" onClick={() => { setPlaying(false); setFs(false); onClose && onClose(); }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}

      <div className="swk2-body">
      {/* TOP — the floor plan stays put; the active camera's marker is highlighted */}
      <div className="swk2-map" ref={mapRef}>
        <img className="swk2-plan" ref={aerialRef} onLoad={measure} src={f.bg} alt={f.name} />
        {plate && (f.cams || []).map((c, j) => (
          Number.isFinite(c.x) && Number.isFinite(c.y) ? (
            <button key={j} className={`swk2-mk${j === cur.ci ? " on" : ""}`}
              style={{ left: `${plate.l + (c.x / 100) * plate.w}px`, top: `${plate.t + (c.y / 100) * plate.h}px` }}
              onClick={() => selectCam(stops.findIndex((s) => s.fi === cur.fi && s.ci === j))}
              aria-label={(c.name && c.name.trim()) || `Camera ${j + 1}`} aria-current={j === cur.ci}>
              {j + 1}
            </button>
          ) : null
        ))}
      </div>

      {/* BOTTOM — camera identity + a horizontal photo carousel */}
      <div className="swk2-cam">
        <div className="swk2-cam-h">
          <div className="swk2-cam-idx">{pad2(idx + 1)} / {pad2(total)}</div>
          <div className="swk2-cam-name">{nameFor(cur)}{notes[noteKey] && <span className="swk2-cam-note">✎</span>}</div>
          <button className={`swk2-note-btn${notes[noteKey] ? " on" : ""}`} title="Leave a note" aria-label="Leave a note"
            onClick={() => { setDraft(notes[noteKey] || ""); setCommentOpen((v) => !v); setPlaying(false); }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          </button>
        </div>
        <div className="swk2-viewer" ref={carRef}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}>
          <div className={`swk2-track${dragging.current ? " dragging" : ""}`}
            style={{ width: `${total * 100}%`, transform: `translate3d(calc(${(-idx * 100) / total}% + ${drag}px), 0, 0)` }}>
            {stops.map((s, i) => {
              const shot = shotFor(s.cam);
              const near = Math.abs(i - idx) <= 1;   // render/preload only current + neighbours' images
              return (
                <div className="swk2-slide" key={keyFor(s)} style={{ width: `${100 / total}%` }} aria-hidden={i !== idx}>
                  {shot
                    ? (near ? <img className="swk2-shot" src={shot} alt={nameFor(s)} draggable="false" /> : null)
                    : <div className="swk2-noshot"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg><span>No photo</span></div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>{/* /swk2-body */}

      {/* CONTROLS — one compact dock */}
      <div className="swk2-dock">
        <button className="swk2-round" onClick={prev} disabled={idx === 0} aria-label="Previous"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
        <button className="swk2-round" onClick={next} disabled={idx === total - 1} aria-label="Next"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></button>
        <button className="swk2-play" onClick={togglePlay} aria-label={playing ? "Pause" : ended ? "Replay" : "Play"}>
          {playing
            ? <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            : ended
              ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
              : <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
          {playing ? "Pause" : ended ? "Replay" : "Play"}
        </button>
      </div>

      {/* note panel */}
      {commentOpen && (
        <div className="swk2-notewrap" onClick={(e) => { if (e.target.classList.contains("swk2-notewrap")) setCommentOpen(false); }}>
          <div className="swk2-note">
            <div className="swk2-note-h">Leave a note on <b>{nameFor(cur)}</b><span style={{ marginLeft: "auto" }}><MicButton value={draft} onChange={setDraft} /></span></div>
            <textarea autoFocus rows={3} className="swk2-note-in" value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="Tell us what you'd like adjusted… e.g. raise the angle · more driveway · less of the fence" />
            <div className="swk2-note-act">
              <button className="swk2-btn ghost" onClick={() => setCommentOpen(false)}>Cancel</button>
              <button className="swk2-btn primary" disabled={!draft.trim() || saving} onClick={saveNote}>{saving ? "Saving…" : "Save note"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  // Fullscreen portals to <body> so it escapes any transformed/filtered ancestor.
  return fs && mounted ? createPortal(tree, document.body) : tree;
}

const CSS = `
.swk2{margin:2px 0 4px;display:flex;flex-direction:column;gap:10px}
/* Fullscreen = a tight top-to-bottom grid (header · map · camera · dock). No vertical centering, so the
   map sits right under the header and the camera panel fills down to the controls — no black dead zones. */
.swk2.fs{position:fixed;top:0;left:0;right:0;height:100dvh;z-index:4000;margin:0;gap:0;background:#07090e;animation:swk2In .28s ease;
  display:grid;grid-template-rows:auto 1fr auto;overflow:hidden}
@keyframes swk2In{from{opacity:0}to{opacity:1}}

/* header (fullscreen only) */
.swk2-bar{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:9px 15px;padding-top:calc(9px + env(safe-area-inset-top));color:#fff}
.swk2-ttl{font-size:.86rem;font-weight:800;letter-spacing:.02em}
.swk2-x{width:36px;height:36px;border:none;background:rgba(255,255,255,.12);border-radius:50%;color:#fff;display:grid;place-items:center;cursor:pointer}
.swk2-x:hover{background:rgba(255,255,255,.2)}

/* body wraps the two panels. Inline: stacked. Fullscreen: a grid [map · camera] filling the middle row. */
.swk2-body{display:flex;flex-direction:column;gap:10px}
.swk2.fs .swk2-body{display:grid;grid-template-rows:30dvh minmax(0,1fr);gap:8px;min-height:0;padding:8px 12px 0}

/* TOP — stable floor plan; a white panel (contain letterbox is seamless on white plans) */
.swk2-map{position:relative;overflow:hidden;background:#0b0f16;border-radius:14px}
.swk2.fs .swk2-map{min-height:0;border-radius:12px;background:#fff}
.swk2-plan{display:block;width:100%;height:auto;max-height:230px;margin:0 auto;object-fit:contain;-webkit-user-drag:none;user-select:none}
.swk2.fs .swk2-plan{height:100%;max-height:none}
.swk2-mk{position:absolute;transform:translate(-50%,-50%);z-index:2;width:28px;height:28px;border-radius:50%;border:2px solid #fff;
  background:rgba(20,22,26,.62);color:#fff;font-size:.72rem;font-weight:800;display:grid;place-items:center;cursor:pointer;
  box-shadow:0 2px 7px rgba(0,0,0,.4);transition:background .18s ease,color .18s ease,box-shadow .18s ease,transform .18s ease}
.swk2-mk:hover{transform:translate(-50%,-50%) scale(1.08)}
.swk2-mk.on{background:var(--dv-gold,#C9A96E);color:#1a1712;border-color:#fff;box-shadow:0 0 0 4px rgba(201,169,110,.3),0 3px 9px rgba(0,0,0,.4)}

/* BOTTOM — camera identity + photo carousel */
.swk2-cam{display:flex;flex-direction:column;min-height:0}
.swk2.fs .swk2-cam{display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0}
.swk2-cam-h{display:flex;align-items:baseline;gap:10px;padding:2px 2px 8px}
.swk2.fs .swk2-cam-h{padding:12px 16px 8px}
.swk2-cam-idx{font-size:.72rem;font-weight:800;letter-spacing:.1em;color:var(--dv-gold,#C9A96E);font-variant-numeric:tabular-nums;flex:0 0 auto}
.swk2-cam-name{font-size:1.02rem;font-weight:800;letter-spacing:-.01em;color:var(--dv-ink,#101418);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.swk2.fs .swk2-cam-name{color:#fff}
.swk2-cam-note{margin-left:6px;color:var(--dv-gold,#C9A96E)}
.swk2-note-btn{margin-left:auto;flex:0 0 auto;width:32px;height:32px;border:1px solid var(--dv-line,#E4E4DF);background:transparent;border-radius:8px;color:var(--dv-muted,#6b7079);display:grid;place-items:center;cursor:pointer}
.swk2-note-btn.on,.swk2-note-btn:hover{color:var(--dv-gold-deep,#A8842F);border-color:var(--dv-gold,#C9A96E)}
.swk2.fs .swk2-note-btn{border-color:rgba(255,255,255,.22);color:#c8ccd2}
.swk2.fs .swk2-note-btn.on,.swk2.fs .swk2-note-btn:hover{color:var(--dv-gold,#C9A96E);border-color:var(--dv-gold,#C9A96E)}
.swk2-viewer{position:relative;overflow:hidden;border-radius:14px;background:#0b0f1a;touch-action:pan-y;aspect-ratio:16/9;width:100%;max-height:52dvh}
.swk2.fs .swk2-viewer{aspect-ratio:auto;height:100%;max-height:none;border-radius:12px}
.swk2-track{display:flex;height:100%;will-change:transform;transition:transform .34s ${EASE}}
.swk2-track.dragging{transition:none}
.swk2-slide{flex:0 0 auto;height:100%;display:flex;align-items:center;justify-content:center}
.swk2-shot{max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain;display:block;-webkit-user-drag:none;user-select:none}
.swk2-noshot{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#8a93a2;font-size:.82rem;font-weight:600;width:100%;height:100%}

/* controls dock */
.swk2-dock{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:12px;padding:6px 0}
.swk2.fs .swk2-dock{padding:8px 16px calc(8px + env(safe-area-inset-bottom))}
.swk2-round{width:40px;height:40px;border-radius:50%;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);display:grid;place-items:center;cursor:pointer}
.swk2-round:hover:not(:disabled){border-color:var(--dv-ink,#101418)}.swk2-round:disabled{opacity:.35;cursor:default}
.swk2.fs .swk2-round{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.24);color:#fff}
.swk2.fs .swk2-round:hover:not(:disabled){background:rgba(255,255,255,.24)}
.swk2-play{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 15px;border-radius:100px;border:1px solid var(--dv-gold,#C9A96E);background:var(--dv-gold,#C9A96E);color:#1a1712;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;margin-left:4px}
.swk2-play:hover{filter:brightness(1.05)}

/* note panel */
.swk2-notewrap{position:fixed;inset:0;z-index:4100;background:rgba(6,9,16,.45);display:flex;align-items:flex-end;justify-content:center;padding:0 14px calc(20px + env(safe-area-inset-bottom));animation:swk2In .2s ease}
.swk2-note{width:100%;max-width:480px;background:#fff;border-radius:15px;padding:15px;box-shadow:0 26px 60px -18px rgba(0,0,0,.55);animation:swk2Up .28s ${EASE}}
@keyframes swk2Up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.swk2-note-h{display:flex;align-items:center;font-size:.88rem;font-weight:700;color:#1A1712;margin-bottom:9px}
.swk2-note-in{width:100%;box-sizing:border-box;border:1px solid rgba(16,17,18,.16);border-radius:10px;padding:9px 11px;font-size:.86rem;font-family:inherit;color:#1A1712;resize:vertical;outline:none}
.swk2-note-in:focus{border-color:var(--dv-gold,#C9A96E)}
.swk2-note-act{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.swk2-btn{height:36px;padding:0 16px;border-radius:100px;border:1px solid transparent;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit}
.swk2-btn.primary{background:#1A1712;color:#fff}.swk2-btn.primary:disabled{opacity:.5;cursor:default}
.swk2-btn.ghost{background:transparent;color:#1A1712;border-color:rgba(16,17,18,.16)}

@media (prefers-reduced-motion:reduce){.swk2-track{transition:opacity .2s ease!important}}
`;

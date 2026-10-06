"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { addToolNoteAction } from "./proposal-actions";
import MicButton from "../../components/mic-button";
import { northArrowAngle } from "../../../lib/site-transform";
import { SPK_COVERAGE } from "../../../lib/survey2-model";
import { buildStops, coverageShape, stopPlace } from "../../../lib/walkthrough-stops";
import { polygonCentroid } from "../../../lib/device-context";

// Walkthrough: ONE canonical survey, played back stop by stop. Stops are the survey's own devices —
// cameras, plus placed speakers that have coverage or a photo (lib/walkthrough-stops.js). The floor plan
// stays PUT with the selected device highlighted and its stored coverage (camera cone / speaker ring)
// emphasised, the rest dimmed; the device view is a horizontal carousel (swipe / prev-next / autoplay)
// with a compact thumbnail strip. Desktop (wide container): plan | detail side by side. Mobile: plan →
// device → media → controls. No map zoom, no marker→photo morph — only a subtle slide, none when the
// user prefers reduced motion.
//   floors: [{ name, bg, scale, aerial, devices?:[…canonical], cams?:[…], zones?, boundary?, sides?, plan?, ctx? }]
//   photos: [{ url, name }]   (legacy `cams` still works when `devices` is absent)
const pad2 = (n) => String(n).padStart(2, "0");
const EASE = "cubic-bezier(.22,1,.36,1)";
const WINDOW = 5;   // thumbnails mounted either side of the active stop (photos are full-res data URIs)

function useReducedMotion() {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    let m; try { m = window.matchMedia("(prefers-reduced-motion: reduce)"); } catch { return undefined; }
    setRm(m.matches);
    const h = (e) => setRm(e.matches);
    try { m.addEventListener("change", h); } catch { try { m.addListener(h); } catch { /* noop */ } }
    return () => { try { m.removeEventListener("change", h); } catch { try { m.removeListener(h); } catch { /* noop */ } } };
  }, []);
  return rm;
}

// Estimated site context (zones + boundary): PLATE-% polygons, the same space the device markers use. Quiet
// layer UNDER coverage + markers. Estimates only — never labelled or drawn as a legal/parcel line.
const ZONE_RGB = { street: "120,132,148", driveway: "176,136,84", parking: "74,126,206", "front-yard": "84,164,104", "rear-yard": "138,172,64", "side-yard": "58,160,150", alley: "154,102,170", loading: "206,112,72", entrance: "200,84,114", custom: "140,146,150" };
const ptXY = (p) => { const x = Array.isArray(p) ? p[0] : p && p.x, y = Array.isArray(p) ? p[1] : p && p.y; return Number.isFinite(+x) && Number.isFinite(+y) && x !== null && y !== null ? [+x, +y] : null; };
const ptsStr = (pts) => { const q = (Array.isArray(pts) ? pts : []).map(ptXY).filter(Boolean); return q.length >= 3 ? q.map((p) => `${+p[0].toFixed(2)},${+p[1].toFixed(2)}`).join(" ") : ""; };
function siteRegions(f) {
  const zones = [];
  ((f && f.zones) || []).forEach((z, i) => {
    const points = ptsStr(z && z.pts); if (!points) return;
    const label = String((z && z.label) || "").trim(), c = label ? polygonCentroid(z.pts) : null;
    zones.push({ key: (z && z.id) || `z${i}`, points, rgb: ZONE_RGB[z.type] || ZONE_RGB.custom, label, cx: c ? c.x : 0, cy: c ? c.y : 0 });
  });
  const boundary = ptsStr(f && f.boundary && f.boundary.pts);
  return zones.length || boundary ? { zones, boundary } : null;
}

const Ico = ({ kind, size = 14 }) => kind === "spk"
  ? <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></svg>
  : <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>;

export default function SystemWalkthrough({ accessId = "", floors = [], photos = [], focusCid = null, customerName = "", defaultFs = false, onClose = null }) {
  const stops = useMemo(() => buildStops(floors, photos), [floors, photos]);
  const total = stops.length;
  const hasMedia = useMemo(() => stops.some((s) => s.shot), [stops]);
  const rm = useReducedMotion();

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
  // "View placement" from a camera line jumps straight to that device.
  useEffect(() => {
    if (!focusCid) return;
    const i = stops.findIndex((s) => s.dev.cid && s.dev.cid === focusCid);
    if (i >= 0) { setPlaying(false); setEnded(false); setIdx(i); }
  }, [focusCid, stops]);

  const go = useCallback((i) => setIdx(Math.max(0, Math.min(total - 1, i))), [total]);
  const next = () => { setPlaying(false); setEnded(false); go(idx + 1); };
  const prev = () => { setPlaying(false); setEnded(false); go(idx - 1); };
  const selectStop = (i) => { setPlaying(false); setEnded(false); go(i); };

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

  // ---- horizontal swipe (device card: header + media). The live drag offset is written straight to the
  // track's style (rAF-batched) — no React state per pointer move, so markers/thumbs never re-render mid-swipe.
  const dragRef = useRef(0), dragging = useRef(false), axis = useRef(null), raf = useRef(0);
  const startX = useRef(0), startY = useRef(0), trackW = useRef(1);
  const carRef = useRef(null), trackRef = useRef(null);
  const baseT = (i) => `translate3d(${(-i * 100) / Math.max(1, total)}%, 0, 0)`;
  const paint = () => {
    raf.current = 0;
    const el = trackRef.current; if (!el) return;
    el.style.transform = `translate3d(calc(${(-idx * 100) / Math.max(1, total)}% + ${dragRef.current}px), 0, 0)`;
  };
  function onDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging.current = true; axis.current = null; dragRef.current = 0;
    startX.current = e.clientX; startY.current = e.clientY;
    trackW.current = carRef.current?.clientWidth || 1;
  }
  function onMove(e) {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current, dy = e.clientY - startY.current;
    if (axis.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axis.current === "x") { trackRef.current && trackRef.current.classList.add("dragging"); if (playing) setPlaying(false); }
    }
    if (axis.current !== "x") return;
    dragRef.current = ((idx === 0 && dx > 0) || (idx === total - 1 && dx < 0)) ? dx * 0.35 : dx;   // resist past the ends
    if (!raf.current) raf.current = requestAnimationFrame(paint);
  }
  function onUp() {
    if (!dragging.current) return;
    dragging.current = false;
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; }
    const d = dragRef.current, th = Math.min(90, trackW.current * 0.22), wasX = axis.current === "x";
    dragRef.current = 0; axis.current = null;
    const el = trackRef.current; if (el) el.classList.remove("dragging");
    if (!wasX) return;
    setEnded(false);
    const target = d < -th ? Math.min(total - 1, idx + 1) : d > th ? Math.max(0, idx - 1) : idx;
    if (el) el.style.transform = baseT(target);   // settle (animated); React writes the same value on commit
    if (target !== idx) setIdx(target);
  }
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  // A per-device note is REAL feedback — persist it to the mockup comment channel, anchored by the
  // device's name (existing convention), so staff see it on the thread.
  const saveNote = async () => {
    const cur = stops[idx]; if (!cur) return;
    const v = draft.trim(); if (!v) return;
    setNotes((n) => ({ ...n, [cur.key]: v })); setCommentOpen(false);
    if (!accessId) return;
    setSaving(true);
    try { await addToolNoteAction(accessId, "mockup", cur.name, v); } catch { /* keep the optimistic note */ }
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

  // Keep the active thumbnail centred in its strip (strip-local scroll only — never scrolls the page).
  const stripRef = useRef(null);
  useEffect(() => {
    const s = stripRef.current; if (!s) return;
    const el = s.querySelector('[data-on="1"]'); if (!el) return;
    s.scrollTo({ left: el.offsetLeft - (s.clientWidth - el.clientWidth) / 2, behavior: rm ? "auto" : "smooth" });
  }, [idx, rm, hasMedia, fs]);

  const cur = stops[idx] || null;
  const curFi = cur ? cur.fi : -1;
  // This floor's stops (global index kept) → markers + faint coverage. Geometry is memoised on plate/floor.
  const floorStops = useMemo(() => stops.map((s, i) => ({ s, i })).filter((x) => x.s.fi === curFi), [stops, curFi]);
  const shapes = useMemo(() => floorStops.map(({ s }) => coverageShape(s.dev, s.floor, plate)), [floorStops, plate]);
  const place = useMemo(() => (cur ? stopPlace(cur.dev, cur.floor) : []), [cur]);
  const curFloor = cur ? cur.floor : null;
  const regions = useMemo(() => { try { return siteRegions(curFloor); } catch { return null; } }, [curFloor]);   // per floor, not per stop/pointer

  if (!total || !cur) return null;
  const f = cur.floor;
  const activeShape = shapes[floorStops.findIndex((x) => x.i === idx)] || null;

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
      {/* MAP — the floor plan stays put; the selected device's marker + coverage are emphasised, the rest dimmed */}
      <div className="swk2-map" ref={mapRef}>
        <img className="swk2-plan" ref={aerialRef} onLoad={measure} src={f.bg} alt={f.name} />
        {plate && regions && (
          <div className="swk2-site" aria-hidden="true" style={{ left: `${plate.l}px`, top: `${plate.t}px`, width: `${plate.w}px`, height: `${plate.h}px` }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              {regions.zones.map((z) => <polygon key={z.key} points={z.points} fill={`rgba(${z.rgb},.16)`} stroke={`rgba(${z.rgb},.7)`} />)}
              {regions.boundary && <polygon className="bnd" points={regions.boundary} />}
            </svg>
            {regions.zones.map((z) => z.label ? <span key={`l-${z.key}`} className="swk2-zl" style={{ left: `${z.cx}%`, top: `${z.cy}%` }}>{z.label}</span> : null)}
          </div>
        )}
        {plate && (
          <svg className="swk2-cov" aria-hidden="true">
            {floorStops.map(({ s, i }, j) => {
              const sh = shapes[j];
              return sh && i !== idx ? (
                <g key={s.key} transform={`translate(${sh.px.toFixed(1)} ${sh.py.toFixed(1)}) rotate(${sh.rot})`}><path className={sh.kind} d={sh.d} /></g>
              ) : null;
            })}
          </svg>
        )}
        {/* Selected device coverage — fans out on each advance, settles into the stored geometry (cone: aim/fov/
            range; ring: speaker radius; real feet when the floor is scaled). Never mutates the survey. */}
        {activeShape && (
          <div className={`swk2-cone ${activeShape.kind}`} style={{ left: `${activeShape.px}px`, top: `${activeShape.py}px`, transform: `rotate(${activeShape.rot}deg)` }} aria-hidden="true">
            <div className="swk2-cone-grow" key={`cone-${idx}`}>
              <svg><path d={activeShape.d} style={activeShape.kind === "ring" ? { fill: SPK_COVERAGE.fill, stroke: SPK_COVERAGE.stroke } : undefined} /></svg>
            </div>
          </div>
        )}
        {plate && floorStops.map(({ s, i }) => (
          Number.isFinite(s.dev.x) && Number.isFinite(s.dev.y) ? (
            <button key={s.key} className={`swk2-mk${s.kind === "spk" ? " spk" : ""}${i === idx ? " on" : ""}`}
              style={{ left: `${plate.l + (s.dev.x / 100) * plate.w}px`, top: `${plate.t + (s.dev.y / 100) * plate.h}px` }}
              onClick={() => selectStop(i)}
              aria-label={s.name} aria-current={i === idx} title={s.name}>
              {s.n}
            </button>
          ) : null
        ))}
        {f.aerial && Number.isFinite(f.aerial.northDeg) && (
          <svg className="swk2-north" viewBox="0 0 26 26" aria-hidden="true" style={{ transform: `rotate(${northArrowAngle(f.aerial.northDeg)}deg)` }}>
            <circle cx="13" cy="13" r="12.5" fill="rgba(16,20,24,.86)" />
            <path d="M13 8 L16 13 L14 13 L14 20 L12 20 L12 13 L10 13 Z" fill="#fff" />
            <text x="13" y="7" textAnchor="middle" fontSize="7" fontWeight="800" fill="#fff" fontFamily="system-ui,sans-serif">N</text>
          </svg>
        )}
      </div>

      {/* DEVICE — identity + media carousel (swipe anywhere on the card), then the thumbnail strip */}
      <div className="swk2-side">
        <div className="swk2-cam" ref={carRef}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}>
          <div className="swk2-cam-h">
            <div className="swk2-cam-idx">{pad2(idx + 1)} / {pad2(total)}</div>
            <div className="swk2-cam-id">
              <div className="swk2-cam-name"><span className="swk2-kind"><Ico kind={cur.kind} /></span>{cur.name}{notes[cur.key] && <span className="swk2-cam-note">✎</span>}</div>
              {place.length > 0 && <div className="swk2-cam-pl">{place.join(" · ")}</div>}
            </div>
            <button className={`swk2-note-btn${notes[cur.key] ? " on" : ""}`} title="Note" aria-label="Leave a note"
              onClick={() => { setDraft(notes[cur.key] || ""); setCommentOpen((v) => !v); setPlaying(false); }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </button>
          </div>
          <div className="swk2-viewer">
            <div className="swk2-track" ref={trackRef}
              style={{ width: `${total * 100}%`, transform: baseT(idx) }}>
              {stops.map((s, i) => {
                const near = Math.abs(i - idx) <= 1;   // render/preload only current + neighbours' full images
                return (
                  <div className="swk2-slide" key={s.key} style={{ width: `${100 / total}%` }} aria-hidden={i !== idx}>
                    {s.shot
                      ? (near ? <img className="swk2-shot" src={s.shot} alt={s.name} draggable="false" decoding="async" /> : null)
                      : <div className="swk2-noshot"><Ico kind={s.kind} size={30} /><span>No photo</span></div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {hasMedia && total > 1 && (
          <div className="swk2-strip" ref={stripRef} aria-label="Stops">
            {stops.map((s, i) => {
              const on = i === idx, show = s.shot && Math.abs(i - idx) <= WINDOW;
              return (
                <button key={s.key} className={`swk2-th${on ? " on" : ""}`} data-on={on ? "1" : undefined} aria-current={on}
                  aria-label={s.name} title={s.name} onClick={() => selectStop(i)}>
                  {show ? <img src={s.shot} alt="" loading="lazy" decoding="async" draggable="false" /> : <Ico kind={s.kind} size={16} />}
                  <b>{s.n}</b>
                </button>
              );
            })}
          </div>
        )}
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
            <div className="swk2-note-h">Leave a note on <b>{cur.name}</b><span style={{ marginLeft: "auto" }}><MicButton value={draft} onChange={setDraft} /></span></div>
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
/* Fullscreen = a tight top-to-bottom grid (header · map · device · dock). No vertical centering, so the
   map sits right under the header and the device panel fills down to the controls — no black dead zones. */
.swk2.fs{position:fixed;top:0;left:0;right:0;height:100dvh;z-index:4000;margin:0;gap:0;background:#07090e;animation:swk2In .28s ease;
  display:grid;grid-template-rows:auto 1fr auto;overflow:hidden}
@keyframes swk2In{from{opacity:0}to{opacity:1}}

/* header (fullscreen only) */
.swk2-bar{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:9px 15px;padding-top:calc(9px + env(safe-area-inset-top));color:#fff}
.swk2-ttl{font-size:.86rem;font-weight:800;letter-spacing:.02em}
.swk2-x{width:36px;height:36px;border:none;background:rgba(255,255,255,.12);border-radius:50%;color:#fff;display:grid;place-items:center;cursor:pointer}
.swk2-x:hover{background:rgba(255,255,255,.2)}

/* body wraps the two panels. Inline: stacked. Fullscreen: a grid [map · device] filling the middle row.
   Wide containers (desktop) go side by side — see the media query below. */
.swk2-body{display:flex;flex-direction:column;gap:10px}
.swk2.fs .swk2-body{display:grid;grid-template-rows:32dvh minmax(0,1fr);gap:8px;min-height:0;padding:8px 12px 0}

/* MAP — stable floor plan; a white panel (contain letterbox is seamless on white plans) */
.swk2-map{position:relative;overflow:hidden;background:#0b0f16;border-radius:14px}
.swk2-north{position:absolute;top:8px;right:8px;z-index:3;width:26px;height:26px;pointer-events:none}
.swk2.fs .swk2-map{min-height:0;border-radius:12px;background:#fff}
.swk2-plan{display:block;width:100%;height:auto;max-height:230px;margin:0 auto;object-fit:contain;-webkit-user-drag:none;user-select:none}
.swk2.fs .swk2-plan{height:100%;max-height:none}
.swk2-mk{position:absolute;transform:translate(-50%,-50%);z-index:2;width:28px;height:28px;border-radius:50%;border:2px solid #fff;
  background:rgba(20,22,26,.62);color:#fff;font-size:.72rem;font-weight:800;display:grid;place-items:center;cursor:pointer;padding:0;opacity:.72;
  box-shadow:0 2px 7px rgba(0,0,0,.4);transition:background .18s ease,color .18s ease,box-shadow .18s ease,transform .18s ease,opacity .18s ease}
.swk2-mk.spk{background:rgba(120,84,170,.72)}
.swk2-mk:hover{transform:translate(-50%,-50%) scale(1.08);opacity:1}
.swk2-mk.on{z-index:4;opacity:1;transform:translate(-50%,-50%) scale(1.18);background:var(--dv-gold,#C9A96E);color:#1a1712;border-color:#fff;box-shadow:0 0 0 4px rgba(201,169,110,.34),0 3px 9px rgba(0,0,0,.4)}
/* Coverage. Selected = the animated wrapper (apex at the device; gold cone / blue ring); every other stop's
   coverage is one shared faint SVG layer. Both sit under the markers. */
.swk2-cov{position:absolute;left:0;top:0;width:100%;height:100%;z-index:1;pointer-events:none;overflow:visible}
.swk2-cov path.cone{fill:rgba(201,169,110,.07);stroke:rgba(201,169,110,.32);stroke-width:1}
.swk2-cov path.ring{fill:rgba(96,165,250,.07);stroke:rgba(96,165,250,.32);stroke-width:1}
/* Site context (zones + estimated boundary) — static, quiet, under coverage (z0 < z1) and markers */
.swk2-site{position:absolute;z-index:0;pointer-events:none}
.swk2-site svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.swk2-site polygon{stroke-width:1;vector-effect:non-scaling-stroke}
.swk2-site polygon.bnd{fill:none;stroke:#b98a2e;stroke-width:1.2;stroke-dasharray:5 4;opacity:.85}
.swk2-zl{position:absolute;transform:translate(-50%,-50%);max-width:34%;padding:1px 5px;border-radius:4px;background:rgba(16,20,24,.6);color:rgba(255,255,255,.9);font-size:.6rem;font-weight:700;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.swk2-cone{position:absolute;z-index:1;pointer-events:none;transform-origin:0 0}
.swk2-cone-grow{transform-origin:0 0;animation:swkConeGrow .6s cubic-bezier(.2,.85,.25,1)}
@keyframes swkConeGrow{from{transform:scale(.08);opacity:.15}55%{opacity:1}to{transform:scale(1);opacity:1}}
.swk2-cone svg{position:absolute;left:0;top:0;overflow:visible}
.swk2-cone path{fill:rgba(201,169,110,.3);stroke:rgba(201,169,110,.7);stroke-width:1.2}

/* DEVICE — identity + media carousel + thumbnail strip */
.swk2-side{display:flex;flex-direction:column;gap:8px;min-height:0;min-width:0}
.swk2-cam{display:flex;flex-direction:column;min-height:0;touch-action:pan-y}
.swk2.fs .swk2-cam{display:grid;grid-template-rows:auto minmax(0,1fr);flex:1 1 auto}
.swk2-cam-h{display:flex;align-items:center;gap:10px;padding:2px 2px 8px}
.swk2.fs .swk2-cam-h{padding:6px 4px 8px}
.swk2-cam-idx{font-size:.72rem;font-weight:800;letter-spacing:.1em;color:var(--dv-gold-text,#8A6A1F);font-variant-numeric:tabular-nums;flex:0 0 auto}
.swk2-cam-id{min-width:0;flex:1 1 auto}
.swk2-cam-name{display:flex;align-items:center;gap:6px;font-size:1.02rem;font-weight:800;letter-spacing:-.01em;color:var(--dv-ink,#101418);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.swk2.fs .swk2-cam-name{color:#fff}
.swk2-kind{display:inline-grid;place-items:center;flex:0 0 auto;color:var(--dv-gold-text,#8A6A1F)}
.swk2-cam-pl{font-size:.74rem;font-weight:600;color:var(--dv-meta,#787D84);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.swk2.fs .swk2-cam-pl{color:#9aa3b2}
.swk2-cam-note{margin-left:6px;color:var(--dv-gold-text,#8A6A1F)}
.swk2-note-btn{margin-left:auto;flex:0 0 auto;width:32px;height:32px;border:1px solid var(--dv-line,#E4E4DF);background:transparent;border-radius:8px;color:var(--dv-muted,#6b7079);display:grid;place-items:center;cursor:pointer}
.swk2-note-btn.on,.swk2-note-btn:hover{color:var(--dv-gold-text,#8A6A1F);border-color:var(--dv-gold-text,#8A6A1F)}
.swk2.fs .swk2-note-btn{border-color:rgba(255,255,255,.22);color:#c8ccd2}
.swk2.fs .swk2-note-btn.on,.swk2.fs .swk2-note-btn:hover{color:var(--dv-gold-text,#8A6A1F);border-color:var(--dv-gold-text,#8A6A1F)}
.swk2-viewer{position:relative;overflow:hidden;border-radius:14px;background:#0b0f1a;aspect-ratio:16/9;width:100%;max-height:52dvh}
.swk2.fs .swk2-viewer{aspect-ratio:auto;height:100%;max-height:none;border-radius:12px}
.swk2-track{display:flex;height:100%;will-change:transform;transition:transform .34s ${EASE}}
.swk2-track.dragging{transition:none}
.swk2-slide{flex:0 0 auto;height:100%;display:flex;align-items:center;justify-content:center}
.swk2-shot{max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain;display:block;-webkit-user-drag:none;user-select:none}
.swk2-noshot{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#8a93a2;font-size:.82rem;font-weight:600;width:100%;height:100%}

/* thumbnail strip — compact cards, only when any stop has media */
.swk2-strip{position:relative;flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;padding:2px 2px 4px;scrollbar-width:none;touch-action:pan-x;overscroll-behavior-x:contain}
.swk2-strip::-webkit-scrollbar{display:none}
.swk2-th{position:relative;flex:0 0 auto;width:58px;height:42px;padding:0;border-radius:8px;overflow:hidden;border:2px solid transparent;background:#0b0f1a;color:#8a93a2;display:grid;place-items:center;cursor:pointer;opacity:.7;transition:opacity .18s ease,border-color .18s ease}
.swk2-th:hover{opacity:1}
.swk2-th.on{border-color:var(--dv-gold,#C9A96E);opacity:1}
.swk2-th img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;-webkit-user-drag:none;user-select:none}
.swk2-th b{position:absolute;left:3px;bottom:1px;font-size:.6rem;font-weight:800;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.8)}

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
.swk2-note-in:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.swk2-note-act{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.swk2-btn{height:36px;padding:0 16px;border-radius:100px;border:1px solid transparent;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit}
.swk2-btn.primary{background:#1A1712;color:#fff}.swk2-btn.primary:disabled{opacity:.5;cursor:default}
.swk2-btn.ghost{background:transparent;color:#1A1712;border-color:rgba(16,17,18,.16)}

/* DESKTOP — wide fullscreen: plan on the left, selected device (media + strip) on the right. Inline (embedded
   in a narrow column) stays stacked. */
@media (min-width:900px){
  .swk2.fs .swk2-body{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:14px;align-items:stretch;padding:12px 18px 0}
  .swk2.fs .swk2-side{height:100%}
  .swk2.fs .swk2-cam-name{font-size:1.1rem}
  .swk2.fs .swk2-mk{width:30px;height:30px}
}

@media (prefers-reduced-motion:reduce){
  .swk2.fs,.swk2-note,.swk2-notewrap{animation:none}
  .swk2-cone-grow{animation:none}
  .swk2-track{transition:none!important}
  .swk2-mk,.swk2-th{transition:none}
}
`;

"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { addToolNoteAction } from "./proposal-actions";

// A cinematic, spatial walkthrough. The aerial SITE SURVEY is the stage; every planned camera is a
// numbered marker on it. When a camera is picked (or the tour plays), that marker MORPHS open — it
// grows from its dot into the full camera view — so it reads as "this camera goes HERE → and this is
// what it sees." The Map control collapses the view right back into its marker. Play tour auto-advances
// (collapse → next marker → expand); a Fullscreen mode makes it immersive. Read-only; notes/approvals
// are held locally per camera. Driven by the same survey2/mockup data the layout already loads.
//   floors: [{ name, bg, cams:[{ x, y, aim, aimed, name, cid, photo }] }]   photos: [{ url, name }]
const norm = (s) => String(s || "").trim().toLowerCase();
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
  const [mode, setMode] = useState("map");        // "map" (survey) | "cam" (a camera expanded)
  const [expanded, setExpanded] = useState(false); // morph expanded (drives the CSS)
  const [playing, setPlaying] = useState(false);
  const [fs, setFs] = useState(!!defaultFs);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [commentOpen, setCommentOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState({});          // key → note text (persisted to the real comment channel)
  const [saving, setSaving] = useState(false);

  const modeRef = useRef("map");
  const tokRef = useRef(0);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Morph a camera open — collapsing any current one first (the "shared element" grows from its marker).
  const show = useCallback(async (i) => {
    const tok = ++tokRef.current;
    if (modeRef.current === "cam") { setExpanded(false); await sleep(560); if (tok !== tokRef.current) return; }
    setIdx(i); setMode("cam"); modeRef.current = "cam"; setExpanded(false); setCommentOpen(false);
    await sleep(60); if (tok !== tokRef.current) return;
    setExpanded(true);
  }, []);
  // Collapse the camera view back into its marker → the survey.
  const hide = useCallback(async () => {
    const tok = ++tokRef.current;
    setExpanded(false); setCommentOpen(false); await sleep(600); if (tok !== tokRef.current) return;
    setMode("map"); modeRef.current = "map";
  }, []);

  useEffect(() => { if (idx > total - 1) setIdx(0); }, [total, idx]);
  // "View placement" from a camera line jumps straight to that camera.
  useEffect(() => {
    if (!focusCid) return;
    const i = stops.findIndex((s) => s.cam.cid && s.cam.cid === focusCid);
    if (i >= 0) { setPlaying(false); show(i); }
  }, [focusCid, stops, show]);

  // Autoplay — expand, hold, then collapse→next. Pauses while a note box is open; stops on the last camera.
  useEffect(() => {
    if (!playing) return;
    if (mode === "map") { show(idx); return; }
    if (!expanded || commentOpen) return;
    const t = setTimeout(() => { if (idx >= total - 1) setPlaying(false); else show(idx + 1); }, 3400);
    return () => clearTimeout(t);
  }, [playing, mode, expanded, idx, commentOpen, show, total]);

  // Fullscreen: lock scroll + Esc backs out (close note → collapse → exit fullscreen).
  useEffect(() => {
    if (!fs) return;
    const onKey = (e) => {
      if (e.key === "Escape") { if (commentOpen) setCommentOpen(false); else if (mode === "cam") hide(); else setFs(false); }
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOv = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOv; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs, commentOpen, mode]);

  if (!total) return null;
  const cur = stops[idx];
  const f = cur.floor;
  const cam = cur.cam;
  const shot = shotFor(cam);
  const ox = Number.isFinite(cam.x) ? cam.x : 50;
  const oy = Number.isFinite(cam.y) ? cam.y : 50;

  const openCam = (i) => { setPlaying(false); show(i); };
  const next = () => { if (idx < total - 1) { setPlaying(false); show(idx + 1); } };
  const prev = () => { if (idx > 0) { setPlaying(false); show(idx - 1); } };
  const togglePlay = () => { if (playing) { setPlaying(false); return; } if (mode === "map") show(idx); setPlaying(true); };
  // A per-camera note is REAL feedback — persist it to the same comment channel the tools use, anchored
  // by the camera's name (the existing convention), so staff actually see it on the mockup thread.
  const saveNote = async () => {
    const v = draft.trim(); if (!v) return;
    const anchor = (cur.cam.name && cur.cam.name.trim()) || `Camera ${cur.ci + 1}`;
    setNotes((n) => ({ ...n, [keyFor(cur)]: v })); setCommentOpen(false);
    if (!accessId) return;
    setSaving(true);
    try { await addToolNoteAction(accessId, "mockup", anchor, v); } catch { /* keep the optimistic note */ }
    setSaving(false);
  };

  const camActive = mode === "cam";

  const tree = (
    <div className={`swk2${fs ? " fs" : ""}`}>
      <style>{CSS}</style>

      {fs && (
        <div className="swk2-fsbar">
          <span className="swk2-fsttl">Walkthrough{customerName ? ` · ${customerName}` : ""}</span>
          <button className="swk2-ico" title="Close" aria-label="Close walkthrough" onClick={() => { setPlaying(false); setFs(false); if (onClose) onClose(); }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}

      <div className="swk2-stage" style={{ "--ox": `${ox}%`, "--oy": `${oy}%` }}>
        {/* the survey — dims + eases toward the active marker while a camera is open */}
        <img className={`swk2-aerial${camActive ? " zoom" : ""}`} src={f.bg} alt={f.name} />
        <div className={`swk2-dim${camActive ? " on" : ""}`} />

        {/* markers */}
        {(f.cams || []).map((c, j) => {
          const active = j === cur.ci;
          const k = keyFor({ ...cur, cam: c, ci: j });
          const noted = !!notes[k];
          return Number.isFinite(c.x) && Number.isFinite(c.y) ? (
            <button key={j} className={`swk2-mk${active ? " active" : ""}${camActive && active ? " hidden" : ""}`}
              style={{ left: `${c.x}%`, top: `${c.y}%` }} onClick={() => openCam(j === cur.ci ? idx : stops.findIndex((s) => s.fi === cur.fi && s.ci === j))}
              title={(c.name && c.name.trim()) || `Camera ${j + 1}`} aria-label={(c.name && c.name.trim()) || `Camera ${j + 1}`}>
              <span className="swk2-mk-n">{j + 1}</span>
              {noted && <span className="swk2-mk-badge note" />}
            </button>
          ) : null;
        })}

        {/* the morph — grows from the active marker into the full camera view */}
        <div className={`swk2-morph${camActive ? " show" : ""}${expanded ? " open" : ""}`}>
          {shot
            ? <img src={shot} alt={nameFor(cur)} className="swk2-shot" />
            : <div className="swk2-noshot"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg><span>View photo coming soon</span></div>}
          <div className="swk2-morph-scrim" />
          <div className={`swk2-caption${expanded ? " in" : ""}`}>
            <div className="swk2-eyebrow">Camera {idx + 1} of {total}</div>
            <div className="swk2-name">{nameFor(cur)}</div>
            {notes[keyFor(cur)] && <div className="swk2-status note">✎ Change requested</div>}
          </div>
        </div>

        {/* camera controls — a slim media-player bar over the view */}
        {camActive && (
          <div className={`swk2-controls${expanded ? " in" : ""}`}>
            <button className="swk2-ico" onClick={prev} disabled={idx === 0} title="Previous" aria-label="Previous"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
            <button className="swk2-ico" onClick={togglePlay} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>{playing ? <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}</button>
            <button className="swk2-ico" onClick={next} disabled={idx === total - 1} title="Next" aria-label="Next"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></button>
            <span className="swk2-sep" />
            <button className="swk2-ico" onClick={() => { setPlaying(false); hide(); }} title="Back to map" aria-label="Back to map"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5 2V6L9 4m0 16 6-2m-6 2V4m6 14 5.5 2V6L15 4m0 14V4m-6 0 6 2" /></svg></button>
            <button className={`swk2-ico${notes[keyFor(cur)] ? " marked" : ""}`} onClick={() => { setDraft(notes[keyFor(cur)] || ""); setCommentOpen((v) => !v); setPlaying(false); }} title="Leave a note" aria-label="Leave a note"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></button>
            {!fs && <button className="swk2-ico" onClick={() => setFs(true)} title="Fullscreen" aria-label="Fullscreen"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg></button>}
          </div>
        )}

        {/* note panel */}
        {commentOpen && camActive && (
          <div className="swk2-notewrap" onClick={(e) => { if (e.target.classList.contains("swk2-notewrap")) setCommentOpen(false); }}>
            <div className="swk2-note">
              <div className="swk2-note-h">Leave a note on <b>{nameFor(cur)}</b></div>
              <textarea autoFocus rows={3} className="swk2-note-in" value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder="Tell us what you'd like adjusted… e.g. raise the angle · more driveway · less of the fence" />
              <div className="swk2-note-act">
                <button className="swk2-btn ghost" onClick={() => setCommentOpen(false)}>Cancel</button>
                <button className="swk2-btn primary" disabled={!draft.trim() || saving} onClick={saveNote}>{saving ? "Saving…" : "Save note"}</button>
              </div>
            </div>
          </div>
        )}

        {/* map-view intro caption (before any camera is opened / while collapsed) */}
        {!camActive && (
          <div className="swk2-mapcap">
            <div className="swk2-eyebrow gold">Your system</div>
            <div className="swk2-mapcap-t">{total} camera{total !== 1 ? "s" : ""} — tap a point or play the tour</div>
          </div>
        )}
      </div>

      {/* map-view controls — prev · progress · next · Play tour */}
      {!camActive && (
        <div className="swk2-maprow">
          <button className="swk2-round" onClick={prev} disabled={idx === 0} aria-label="Previous"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
          <div className="swk2-pips">{stops.map((_, i) => <button key={i} className={`swk2-pip${i === idx ? " on" : ""}`} onClick={() => openCam(i)} aria-label={`Camera ${i + 1}`} />)}</div>
          <button className="swk2-round" onClick={next} disabled={idx === total - 1} aria-label="Next"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></button>
          <button className="swk2-play" onClick={togglePlay}><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>Play tour</button>
        </div>
      )}
    </div>
  );
  // Fullscreen must escape any transformed/filtered ancestor (which would trap position:fixed),
  // so we portal it to <body> — that makes "full screen" truly cover the whole viewport.
  return fs && mounted ? createPortal(tree, document.body) : tree;
}

const CSS = `
.swk2{margin:2px 0 4px}
.swk2.fs{position:fixed;inset:0;z-index:4000;margin:0;background:#07090e;display:flex;flex-direction:column;animation:swk2In .3s ease}
@keyframes swk2In{from{opacity:0}to{opacity:1}}
.swk2-fsbar{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:14px 18px;color:#fff}
.swk2-fsttl{font-size:.8rem;font-weight:800;letter-spacing:.04em}

/* stage — the survey is the hero */
.swk2-stage{position:relative;border-radius:14px;overflow:hidden;background:#0b0f16;line-height:0;--ox:50%;--oy:50%}
.swk2.fs .swk2-stage{flex:1 1 0;min-height:0;border-radius:0;display:flex;align-items:center;justify-content:center}
.swk2-aerial{width:100%;display:block;transform-origin:var(--ox) var(--oy);transition:transform .72s ${EASE},filter .55s ease;will-change:transform}
.swk2.fs .swk2-aerial{width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain}
.swk2-aerial.zoom{transform:scale(1.16);filter:brightness(.62) saturate(.92)}
.swk2-dim{position:absolute;inset:0;background:rgba(6,9,16,.36);opacity:0;transition:opacity .55s ease;pointer-events:none;z-index:1}
.swk2-dim.on{opacity:1}

/* markers */
.swk2-mk{position:absolute;transform:translate(-50%,-50%);z-index:2;min-width:26px;height:26px;padding:0 6px;border-radius:100px;border:2px solid #fff;background:rgba(16,17,18,.5);color:#fff;font-size:.7rem;font-weight:800;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);transition:transform .3s ${EASE},background .3s,opacity .3s,box-shadow .3s}
.swk2-mk:hover{transform:translate(-50%,-50%) scale(1.12)}
.swk2-mk.active{background:var(--dv-gold,#C9A96E);color:#1a1712;box-shadow:0 0 0 5px rgba(201,169,110,.28),0 3px 10px rgba(0,0,0,.4);animation:swk2Pulse 2s ease-out infinite}
@keyframes swk2Pulse{0%{box-shadow:0 0 0 4px rgba(201,169,110,.4),0 3px 10px rgba(0,0,0,.4)}70%{box-shadow:0 0 0 13px rgba(201,169,110,0),0 3px 10px rgba(0,0,0,.4)}100%{box-shadow:0 0 0 4px rgba(201,169,110,0),0 3px 10px rgba(0,0,0,.4)}}
.swk2-mk.hidden{opacity:0;pointer-events:none;transition:opacity .18s ease}
.swk2-mk-n{position:relative;line-height:1}
.swk2-mk-badge{position:absolute;right:-4px;top:-4px;width:14px;height:14px;border-radius:50%;border:1.5px solid #fff;font-size:.5rem;display:flex;align-items:center;justify-content:center;line-height:1}
.swk2-mk-badge.note{background:var(--dv-gold,#C9A96E)}

/* morph — the shared-element that grows from the marker into the camera view */
.swk2-morph{position:absolute;inset:0;z-index:3;overflow:hidden;background:#0B0F1A;opacity:0;pointer-events:none;
  transform-origin:var(--ox) var(--oy);transform:scale(.05);border-radius:50%;
  transition:transform .72s ${EASE},border-radius .72s ${EASE},opacity .28s ease;will-change:transform,border-radius}
.swk2-morph.show{opacity:1;pointer-events:auto}
.swk2-morph.open{transform:scale(1);border-radius:0}
.swk2-shot{width:100%;height:100%;object-fit:cover;display:block}
.swk2.fs .swk2-morph.open{border-radius:0}
.swk2-noshot{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;color:#8a93a2;font-size:.82rem;font-weight:600}
.swk2-morph-scrim{position:absolute;inset:0;pointer-events:none;background:linear-gradient(to top,rgba(6,9,16,.82) 0,rgba(6,9,16,.15) 26%,rgba(6,9,16,0) 48%)}
.swk2-caption{position:absolute;left:0;right:0;bottom:0;padding:20px 22px 74px;z-index:2;opacity:0;transform:translateY(8px);transition:opacity .4s ease .1s,transform .4s ${EASE} .1s;line-height:1.25}
.swk2-caption.in{opacity:1;transform:none}
.swk2-eyebrow{font-size:.66rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--dv-gold,#C9A96E)}
.swk2-eyebrow.gold{color:var(--dv-gold,#C9A96E)}
.swk2-name{font-size:1.4rem;font-weight:800;letter-spacing:-.02em;color:#fff;margin-top:4px;text-shadow:0 2px 20px rgba(0,0,0,.5)}
.swk2-status{display:inline-block;margin-top:8px;font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:100px}
.swk2-status.note{background:rgba(201,169,110,.24);color:#e6cfa0}

/* controls */
.swk2-controls{position:absolute;left:50%;bottom:16px;transform:translateX(-50%) translateY(8px);z-index:5;display:flex;align-items:center;gap:4px;padding:6px;border-radius:100px;
  background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 10px 30px -10px rgba(0,0,0,.5);opacity:0;transition:opacity .4s ease .12s,transform .4s ${EASE} .12s}
.swk2-controls.in{opacity:1;transform:translateX(-50%)}
.swk2-ico{width:38px;height:38px;border-radius:50%;border:none;background:transparent;color:#fff;display:grid;place-items:center;cursor:pointer;transition:background .14s}
.swk2-ico:hover:not(:disabled){background:rgba(255,255,255,.18)}
.swk2-ico:disabled{opacity:.4;cursor:default}
.swk2-ico.marked{color:var(--dv-gold,#C9A96E)}
.swk2-sep{width:1px;height:22px;background:rgba(255,255,255,.28);margin:0 4px}
.swk2-fsbar .swk2-ico{color:#fff}.swk2-fsbar .swk2-ico:hover{background:rgba(255,255,255,.12)}

/* note panel */
.swk2-notewrap{position:absolute;inset:0;z-index:6;background:rgba(6,9,16,.4);display:flex;align-items:flex-end;justify-content:center;padding:0 14px 78px;animation:swk2In .2s ease}
.swk2-note{width:100%;max-width:480px;background:#fff;border-radius:15px;padding:15px;box-shadow:0 26px 60px -18px rgba(0,0,0,.55);animation:swk2Up .28s ${EASE}}
@keyframes swk2Up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.swk2-note-h{font-size:.88rem;font-weight:700;color:#1A1712;margin-bottom:9px}
.swk2-note-in{width:100%;border:1px solid rgba(16,17,18,.16);border-radius:10px;padding:9px 11px;font-size:.86rem;font-family:inherit;color:#1A1712;resize:vertical;outline:none}
.swk2-note-in:focus{border-color:var(--dv-gold,#C9A96E)}
.swk2-note-act{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.swk2-btn{height:36px;padding:0 16px;border-radius:100px;border:1px solid transparent;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit}
.swk2-btn.primary{background:#1A1712;color:#fff}.swk2-btn.primary:disabled{opacity:.5;cursor:default}
.swk2-btn.ghost{background:transparent;color:#1A1712;border-color:rgba(16,17,18,.16)}

/* map caption */
.swk2-mapcap{position:absolute;left:0;right:0;bottom:0;padding:16px 18px;z-index:2;background:linear-gradient(to top,rgba(6,9,16,.7),transparent);pointer-events:none}
.swk2-mapcap-t{font-size:.92rem;font-weight:700;color:#fff;margin-top:3px;text-shadow:0 1px 10px rgba(0,0,0,.5)}

/* map-view row */
.swk2-maprow{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:12px}
.swk2-round{width:36px;height:36px;border-radius:50%;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);display:grid;place-items:center;cursor:pointer}
.swk2-round:hover:not(:disabled){border-color:var(--dv-ink,#101418)}.swk2-round:disabled{opacity:.35;cursor:default}
.swk2-pips{display:flex;align-items:center;gap:7px}
.swk2-pip{width:8px;height:8px;border-radius:50%;border:none;background:var(--dv-line,#E4E4DF);cursor:pointer;padding:0;transition:all .2s}
.swk2-pip.on{background:var(--dv-gold,#C9A96E);width:22px;border-radius:100px}
.swk2-play{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 15px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit}
.swk2-play:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}

@media (prefers-reduced-motion:reduce){.swk2 *{animation:none!important;transition:opacity .2s ease!important}.swk2-morph.show{transform:scale(1);border-radius:0}}
`;

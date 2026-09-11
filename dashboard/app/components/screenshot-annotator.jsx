"use client";
import { useRef, useEffect, useState, useCallback } from "react";

// Screenshot markup tool. Dark workspace, one sharp unfiltered image, one compact SVG toolbar.
// Tools: Box (default) · Arrow · Pen · Text. Color palette + stroke width. Undo/redo/clear history.
// Keyboard: R/A/P/T tools, Ctrl/Cmd+Z undo, +Shift redo, Esc cancels, Delete/Backspace undoes.
// The image layer is never filtered — the surrounding chrome is dark, the screenshot stays crisp.
// Attach flattens image + annotations to a PNG at natural resolution and hands it back.
//
// Shapes (all in the image's NATURAL pixel coords):
//   {type:'rect',  x,y,w,h}          {type:'arrow', from:{x,y}, to:{x,y}}
//   {type:'pen',   points:[{x,y}]}   {type:'text',  x,y, text, size}
// Each carries {color, lw}. History is snapshots of the full shape array (every commit is one step).

const PALETTE = [
  ["#ff2d2d", "Red"], ["#ff9500", "Orange"], ["#ffd60a", "Yellow"],
  ["#31c46b", "Green"], ["#3b82f6", "Blue"], ["#ffffff", "White"], ["#101317", "Black"],
];
const STROKES = [["Thin", 0.62], ["Medium", 1], ["Thick", 1.7]];
const clampZ = (z) => Math.max(1, Math.min(6, z));
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid2 = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export default function ScreenshotAnnotator({ shot, onDone, onCancel, initialShapes }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const drawing = useRef(false);
  const draftRef = useRef(null);          // in-progress shape during a drag (not yet committed)
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState("rect");
  const [color, setColor] = useState("#ff2d2d");
  const [strokeMul, setStrokeMul] = useState(1);
  const [showColor, setShowColor] = useState(false);
  const [showMore, setShowMore] = useState(false);   // mobile dock ••• menu (Redo / Clear)
  const [editor, setEditor] = useState(null);   // { clientX, clientY, nx, ny, value, cssFont }
  const [H, setH] = useState({ stack: [initialShapes && initialShapes.length ? initialShapes : []], i: 0 });
  const shapes = H.stack[H.i];

  const toolRef = useRef(tool); toolRef.current = tool;
  const colorRef = useRef(color); colorRef.current = color;
  const mulRef = useRef(strokeMul); mulRef.current = strokeMul;
  // Zoom/pan: a CSS transform on the canvas. pt() reads getBoundingClientRect, which already reflects
  // the transform, so annotation coordinates stay correct at any zoom. Two-finger pinch/drag on touch,
  // wheel + on-screen ± controls on desktop.
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view); viewRef.current = view;
  const pointers = useRef(new Map());   // active pointerId -> {x,y}
  const pinch = useRef(null);           // { dist, mid, z, x, y } during a two-finger gesture
  const panning = useRef(null);         // { x, y, vx, vy } during a one-finger pan (tool deselected)
  const zoomBy = (f) => setView((v) => { const z = clampZ(v.z * f); return z <= 1 ? { z: 1, x: 0, y: 0 } : { ...v, z }; });
  // Tapping the active tool deselects it → "pan mode": one finger pans, nothing draws (so you can
  // zoom/pan the screenshot freely). Tap any tool again to resume drawing.
  const selectTool = (k) => setTool((cur) => (cur === k ? null : k));

  const commit = useCallback((next) => setH(({ stack, i }) => ({ stack: [...stack.slice(0, i + 1), next], i: i + 1 })), []);
  const undo = useCallback(() => setH((s) => (s.i > 0 ? { ...s, i: s.i - 1 } : s)), []);
  const redo = useCallback(() => setH((s) => (s.i < s.stack.length - 1 ? { ...s, i: s.i + 1 } : s)), []);
  const clear = useCallback(() => { if (shapes.length) commit([]); }, [shapes.length, commit]);

  // ---- base stroke width in natural px, derived from image width ----
  const baseLw = () => { const c = canvasRef.current; return Math.max(3, Math.round((c ? c.width : 1200) / 380)); };
  const natFont = () => { const c = canvasRef.current; return Math.max(20, Math.round((c ? c.width : 1200) / 34)); };

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img; const c = canvasRef.current; if (!c) return;
      c.width = img.naturalWidth; c.height = img.naturalHeight; setReady(true); redraw();
    };
    img.src = shot;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot]);

  // redraw whenever committed shapes change
  useEffect(() => { redraw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [H]);

  function drawArrow(ctx, a, b, lw) {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy); if (len < 1) return;
    const ah = Math.max(12, lw * 3.6), ang = Math.atan2(dy, dx);
    ctx.beginPath(); ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + ah * Math.cos(ang + Math.PI * 0.83), b.y + ah * Math.sin(ang + Math.PI * 0.83));
    ctx.lineTo(b.x + ah * Math.cos(ang - Math.PI * 0.83), b.y + ah * Math.sin(ang - Math.PI * 0.83));
    ctx.closePath(); ctx.fill();
  }
  function drawShape(ctx, s) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.lw;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.shadowColor = "rgba(0,0,0,.38)"; ctx.shadowBlur = Math.max(2, s.lw * 0.8);
    if (s.type === "rect") {
      const x = Math.min(s.x, s.x + s.w), y = Math.min(s.y, s.y + s.h), w = Math.abs(s.w), h = Math.abs(s.h);
      ctx.save(); ctx.globalAlpha = 0.06; ctx.fillRect(x, y, w, h); ctx.restore();
      ctx.strokeRect(x, y, w, h);
    } else if (s.type === "arrow") {
      drawArrow(ctx, s.from, s.to, s.lw);
    } else if (s.type === "pen") {
      const p = s.points; if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0].x, p[0].y, s.lw, 0, 7); ctx.fill(); }
      else if (p.length > 1) { ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y); ctx.stroke(); }
    } else if (s.type === "text") {
      ctx.shadowBlur = Math.max(3, s.size * 0.14);
      ctx.font = `600 ${s.size}px system-ui,-apple-system,Segoe UI,sans-serif`;
      ctx.textBaseline = "top";
      s.text.split("\n").forEach((ln, i) => ctx.fillText(ln, s.x, s.y + i * s.size * 1.22));
    }
    ctx.shadowBlur = 0;
  }
  function redraw(extra) {
    const c = canvasRef.current, img = imgRef.current; if (!c || !img) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0);
    for (const s of shapes) drawShape(ctx, s);
    if (extra) drawShape(ctx, extra);
  }
  function pt(e) {
    const c = canvasRef.current, r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }

  function down(e) {
    if (editor) return;                    // let the text editor keep focus
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Second finger → pan/zoom gesture: abandon any in-progress draw and start the pinch.
    if (pointers.current.size === 2) {
      drawing.current = false; draftRef.current = null; redraw();
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: dist2(a, b), mid: mid2(a, b), z: viewRef.current.z, x: viewRef.current.x, y: viewRef.current.y };
      return;
    }
    if (pointers.current.size > 2) return;
    const t = toolRef.current;
    // No tool selected → pan mode: one finger drags the (zoomed) screenshot, nothing draws.
    if (!t) { panning.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y }; try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* noop */ } return; }
    const p = pt(e), lw = baseLw() * mulRef.current, col = colorRef.current;
    if (t === "text") { openEditor(e, p); return; }
    e.preventDefault(); drawing.current = true;
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* noop */ }
    if (t === "rect") draftRef.current = { type: "rect", x: p.x, y: p.y, w: 0, h: 0, color: col, lw };
    else if (t === "arrow") draftRef.current = { type: "arrow", from: p, to: p, color: col, lw };
    else draftRef.current = { type: "pen", points: [p], color: col, lw };
    redraw(draftRef.current);
  }
  function move(e) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      e.preventDefault();
      const [a, b] = [...pointers.current.values()];
      const d = dist2(a, b), m = mid2(a, b);
      const z = clampZ(pinch.current.z * (d / (pinch.current.dist || 1)));
      const nx = pinch.current.x + (m.x - pinch.current.mid.x);
      const ny = pinch.current.y + (m.y - pinch.current.mid.y);
      setView(z <= 1 ? { z: 1, x: 0, y: 0 } : { z, x: nx, y: ny });
      return;
    }
    if (panning.current) {
      e.preventDefault();
      if (viewRef.current.z > 1) setView((v) => ({ ...v, x: panning.current.vx + (e.clientX - panning.current.x), y: panning.current.vy + (e.clientY - panning.current.y) }));
      return;
    }
    if (!drawing.current) return; e.preventDefault(); const p = pt(e), d = draftRef.current;
    if (d.type === "rect") { d.w = p.x - d.x; d.h = p.y - d.y; }
    else if (d.type === "arrow") d.to = p;
    else d.points.push(p);
    redraw(d);
  }
  function up(e) {
    if (e) pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (panning.current) { panning.current = null; return; }
    if (!drawing.current) return; drawing.current = false; const d = draftRef.current; draftRef.current = null;
    if (!d) return;
    const tiny = (d.type === "rect" && Math.abs(d.w) < 5 && Math.abs(d.h) < 5) ||
      (d.type === "arrow" && Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) < 5);
    if (tiny) { redraw(); return; }
    commit([...shapes, d]);
  }
  function onWheel(e) {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return;
    zoomBy(e.deltaY < 0 ? 1.15 : 0.87);
  }

  // ---- text editor (inline over the image) ----
  function openEditor(e, p) {
    const c = canvasRef.current, r = c.getBoundingClientRect();
    const cssFont = Math.round(natFont() * (r.width / c.width));
    // On mobile the software keyboard covers the lower half — keep the typing box above it (the text
    // still lands where you tapped; only the input box floats up so you can see what you type).
    let clientY = e.clientY;
    if (typeof window !== "undefined" && window.matchMedia("(max-width:640px)").matches) {
      const vh = window.visualViewport?.height || window.innerHeight;
      clientY = Math.min(clientY, Math.round(vh * 0.42));
    }
    setEditor({ clientX: e.clientX, clientY, nx: p.x, ny: p.y, value: "", cssFont });
  }
  function commitEditor() {
    if (!editor) return; const v = editor.value.trim();
    if (v) commit([...shapes, { type: "text", x: editor.nx, y: editor.ny, text: editor.value, size: natFont(), color: colorRef.current, lw: 0 }]);
    setEditor(null);
  }

  // ---- keyboard ----
  useEffect(() => {
    function onKey(e) {
      if (editor) { if (e.key === "Escape") { e.preventDefault(); setEditor(null); } return; }
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && (e.key === "z" || e.key === "Z")) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (meta && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); return; }
      if (e.key === "Escape") { e.preventDefault(); if (drawing.current) { drawing.current = false; draftRef.current = null; redraw(); } else onCancel?.(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && shapes.length) { e.preventDefault(); undo(); return; }
      const k = e.key.toLowerCase();
      if (k === "r") setTool("rect"); else if (k === "a") setTool("arrow");
      else if (k === "p") setTool("pen"); else if (k === "t") setTool("text");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, shapes.length, undo, redo, onCancel]);

  function attach() {
    const c = canvasRef.current; if (!c) return;
    draftRef.current = null; redraw();               // ensure no draft lingers
    onDone?.(c.toDataURL("image/png"), shapes);
  }

  const canUndo = H.i > 0, canRedo = H.i < H.stack.length - 1;
  const closeMenus = () => { if (showColor) setShowColor(false); if (showMore) setShowMore(false); };

  const colorControl = (up) => (
    <ColorControl color={color} setColor={setColor} strokeMul={strokeMul} setStrokeMul={setStrokeMul}
      show={showColor} setShow={setShowColor} up={up} />
  );

  return (
    <div className={`mk-scrim${editor ? " mk-editing" : ""}`} onPointerDown={closeMenus}>
      {/* TOP BAR — desktop: full toolbar. mobile: just X (left) + Attach (right). */}
      <div className="mk-bar" onPointerDown={(e) => e.stopPropagation()}>
        <button className="mk-x mk-mobile" onClick={onCancel} aria-label="Close" title="Close"><CloseI /></button>
        <div className="mk-desk">
          <div className="mk-seg" role="toolbar" aria-label="Tools">
            <Tool on={tool === "rect"} onClick={() => selectTool("rect")} tip="Box · R"><RectI /></Tool>
            <Tool on={tool === "arrow"} onClick={() => selectTool("arrow")} tip="Arrow · A"><ArrowI /></Tool>
            <Tool on={tool === "pen"} onClick={() => selectTool("pen")} tip="Pen · P"><PenI /></Tool>
            <Tool on={tool === "text"} onClick={() => selectTool("text")} tip="Text · T"><TextI /></Tool>
          </div>
          <div className="mk-sep" />
          {colorControl(false)}
          <div className="mk-sep" />
          <div className="mk-seg">
            <Tool onClick={undo} disabled={!canUndo} tip="Undo"><UndoI /></Tool>
            <Tool onClick={redo} disabled={!canRedo} tip="Redo"><RedoI /></Tool>
            <Tool onClick={clear} disabled={!shapes.length} tip="Clear"><TrashI /></Tool>
          </div>
        </div>
        <div className="mk-spacer" />
        <button className="mk-btn ghost mk-desktop" onClick={onCancel}>Cancel</button>
        <button className="mk-btn go" onClick={attach} disabled={!ready}>Attach</button>
      </div>

      <div className="mk-stage" onPointerDown={(e) => { if (e.target.classList.contains("mk-stage") && !editor) onCancel?.(); }} onWheel={onWheel}>
        <canvas ref={canvasRef} className={`mk-canvas mk-t-${tool || "pan"}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: "center center" }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        <div className="mk-zoom" onPointerDown={(e) => e.stopPropagation()}>
          <button className="mk-ztool" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.25)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="6" x2="12" y2="18" /><line x1="6" y1="12" x2="18" y2="12" /></svg>
          </button>
          <button className="mk-ztool" aria-label="Zoom out" title="Zoom out" disabled={view.z <= 1} onClick={() => zoomBy(0.8)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="12" x2="18" y2="12" /></svg>
          </button>
          {view.z > 1 && <button className="mk-ztool mk-zreset" aria-label="Reset zoom" title="Reset" onClick={() => setView({ z: 1, x: 0, y: 0 })}>{Math.round(view.z * 10) / 10}×</button>}
        </div>
        {editor && (
          <textarea autoFocus className="mk-text-in"
            style={{ left: editor.clientX, top: editor.clientY, color, font: `600 ${editor.cssFont}px system-ui,-apple-system,Segoe UI,sans-serif` }}
            value={editor.value}
            onChange={(e) => setEditor((s) => ({ ...s, value: e.target.value }))}
            onBlur={commitEditor}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEditor(); } else if (e.key === "Escape") { e.preventDefault(); setEditor(null); } }}
            placeholder="" />
        )}
      </div>

      {/* MOBILE DOCK — drawing tools float over the bottom, within thumb reach. */}
      <div className="mk-dock mk-mobile" onPointerDown={(e) => e.stopPropagation()}>
        <Tool on={tool === "rect"} onClick={() => selectTool("rect")} tip="Box"><RectI /></Tool>
        <Tool on={tool === "arrow"} onClick={() => selectTool("arrow")} tip="Arrow"><ArrowI /></Tool>
        <Tool on={tool === "pen"} onClick={() => selectTool("pen")} tip="Pen"><PenI /></Tool>
        <Tool on={tool === "text"} onClick={() => selectTool("text")} tip="Text"><TextI /></Tool>
        {colorControl(true)}
        <Tool onClick={undo} disabled={!canUndo} tip="Undo"><UndoI /></Tool>
        <div className="mk-morewrap">
          <Tool on={showMore} onClick={() => setShowMore((v) => !v)} tip="More"><MoreI /></Tool>
          {showMore && (
            <div className="mk-pop up mk-moremenu" onPointerDown={(e) => e.stopPropagation()}>
              <button disabled={!canRedo} onClick={() => { redo(); setShowMore(false); }}><RedoI /> Redo</button>
              <button disabled={!shapes.length} onClick={() => { clear(); setShowMore(false); }}><TrashI /> Clear</button>
            </div>
          )}
        </div>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

function Tool({ on, onClick, disabled, tip, children }) {
  return (
    <button type="button" className={`mk-tool${on ? " on" : ""}`} onClick={onClick} disabled={disabled}
      aria-label={tip} aria-pressed={on || undefined} title={tip}>{children}</button>
  );
}

// Color swatch + palette + stroke width. `up` opens the popover above (for the mobile bottom dock).
function ColorControl({ color, setColor, strokeMul, setStrokeMul, show, setShow, up }) {
  return (
    <div className="mk-colwrap">
      <button className="mk-swatch" aria-label="Color" title="Color" onClick={() => setShow((v) => !v)}>
        <span className="mk-dot" style={{ background: color, boxShadow: color === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,.3)" : "none" }} />
      </button>
      {show && (
        <div className={`mk-pop${up ? " up" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
          <div className="mk-sw-row">
            {PALETTE.map(([hex, name]) => (
              <button key={hex} className={`mk-sw${color === hex ? " on" : ""}`} aria-label={name} title={name}
                style={{ background: hex, boxShadow: hex === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,.25)" : "none" }}
                onClick={() => { setColor(hex); setShow(false); }} />
            ))}
          </div>
          <div className="mk-str-row">
            {STROKES.map(([name, mul]) => (
              <button key={name} className={`mk-str${strokeMul === mul ? " on" : ""}`} title={name} aria-label={name}
                onClick={() => setStrokeMul(mul)}>
                <span className="mk-str-bar" style={{ height: Math.max(2, Math.round(mul * 3)) }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* icons — one family, 2px stroke, currentColor */
const S = { viewBox: "0 0 24 24", width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
const RectI = () => (<svg {...S}><rect x="3" y="5" width="18" height="14" rx="1.5" /></svg>);
const ArrowI = () => (<svg {...S}><line x1="6" y1="18" x2="18" y2="6" /><polyline points="9 6 18 6 18 15" /></svg>);
const PenI = () => (<svg {...S}><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="1.4" /></svg>);
const TextI = () => (<svg {...S}><polyline points="4 7 4 5 20 5 20 7" /><line x1="12" y1="5" x2="12" y2="19" /><line x1="9" y1="19" x2="15" y2="19" /></svg>);
const UndoI = () => (<svg {...S}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></svg>);
const RedoI = () => (<svg {...S}><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h1" /></svg>);
const TrashI = () => (<svg {...S}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>);
const CloseI = () => (<svg {...S}><path d="M18 6 6 18M6 6l12 12" /></svg>);
const MoreI = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>);

const CSS = `
.mk-scrim{position:fixed;inset:0;z-index:2147483200;background:#0b0d11;display:flex;flex-direction:column;
  font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#e9edf2}
.mk-bar{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 12px;flex-wrap:wrap;
  background:#12151b;border-bottom:1px solid rgba(255,255,255,.08)}
.mk-seg{display:inline-flex;gap:2px;padding:3px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:11px}
.mk-tool{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:0;border-radius:8px;
  background:transparent;color:#c2c7ce;cursor:pointer;line-height:0;transition:background .13s,color .13s}
.mk-tool:hover:not(:disabled){background:rgba(255,255,255,.1);color:#fff}
.mk-tool.on{background:#fff;color:#12151b}
.mk-tool:disabled{opacity:.34;cursor:default}
.mk-tool:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(94,150,255,.7)}
.mk-sep{width:1px;height:26px;background:rgba(255,255,255,.12)}
.mk-spacer{flex:1}
.mk-desk{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mk-mobile{display:none}                 /* X + bottom dock — revealed only in the mobile query */
.mk-x{align-items:center;justify-content:center;width:40px;height:40px;border:0;border-radius:9px;background:transparent;color:#c2c7ce;cursor:pointer;line-height:0}
.mk-x:hover{background:rgba(255,255,255,.1);color:#fff}
.mk-dock{display:none;align-items:center;gap:4px;padding:6px;background:#12151b;border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 12px 34px rgba(0,0,0,.5)}
.mk-morewrap{position:relative;display:inline-flex}
.mk-moremenu{left:auto;right:0;min-width:120px;padding:4px;flex-direction:column;gap:2px}
.mk-moremenu button{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:0;background:none;color:#e9edf2;font:600 .82rem/1 inherit;padding:9px 10px;border-radius:8px;cursor:pointer}
.mk-moremenu button:hover:not(:disabled){background:rgba(255,255,255,.1)}
.mk-moremenu button:disabled{opacity:.4;cursor:default}
.mk-moremenu svg{width:16px;height:16px}
.mk-colwrap{position:relative;display:inline-flex}
.mk-swatch{width:36px;height:36px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:rgba(255,255,255,.05);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.mk-swatch:hover{background:rgba(255,255,255,.1)}
.mk-dot{width:16px;height:16px;border-radius:50%}
.mk-pop{position:absolute;top:44px;left:0;z-index:5;background:#1b1f27;border:1px solid rgba(255,255,255,.14);border-radius:12px;
  padding:9px;box-shadow:0 16px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:8px}
.mk-pop.up{top:auto;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%)}
.mk-pop.up.mk-moremenu{left:auto;right:0;transform:none}
.mk-sw-row{display:flex;gap:6px}
.mk-sw{width:24px;height:24px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}
.mk-sw.on{border-color:#fff;box-shadow:0 0 0 2px #1b1f27,0 0 0 3px #fff}
.mk-str-row{display:flex;gap:6px;border-top:1px solid rgba(255,255,255,.1);padding-top:8px}
.mk-str{flex:1;height:26px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center}
.mk-str.on{background:#fff}
.mk-str-bar{width:20px;border-radius:6px;background:#c2c7ce}
.mk-str.on .mk-str-bar{background:#12151b}
.mk-btn{height:36px;padding:0 16px;border-radius:9px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);
  color:#e9edf2;font:700 .84rem/1 inherit;cursor:pointer}
.mk-btn:hover{background:rgba(255,255,255,.12)}
.mk-btn.ghost{background:transparent}
.mk-btn.go{background:#e0574a;border-color:#e0574a;color:#fff}
.mk-btn.go:hover{background:#d34a3d}
.mk-btn:disabled{opacity:.45;cursor:default}
.mk-stage{flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;padding:16px;overflow:hidden}
.mk-canvas{max-width:calc(100vw - 32px);max-height:calc(100vh - 92px);border-radius:6px;
  box-shadow:0 24px 70px rgba(0,0,0,.6);cursor:crosshair;touch-action:none;background:#fff;image-rendering:auto;will-change:transform}
.mk-zoom{position:absolute;right:14px;bottom:14px;z-index:7;display:flex;flex-direction:column;gap:6px}
.mk-ztool{width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.14);
  border-radius:10px;background:rgba(18,21,27,.86);color:#e9edf2;cursor:pointer;backdrop-filter:blur(6px);font:700 .78rem/1 system-ui}
.mk-ztool:hover:not(:disabled){background:rgba(30,34,42,.92)}
.mk-ztool:disabled{opacity:.4;cursor:default}
.mk-zreset{font-variant-numeric:tabular-nums}
.mk-canvas.mk-t-text{cursor:text}
.mk-canvas.mk-t-pan{cursor:grab}
.mk-canvas.mk-t-pan:active{cursor:grabbing}
.mk-text-in{position:fixed;z-index:12;min-width:40px;min-height:1.2em;background:transparent;border:1px dashed rgba(120,160,255,.9);
  border-radius:4px;padding:2px 4px;outline:none;resize:none;overflow:hidden;white-space:pre;line-height:1.22;
  text-shadow:0 1px 3px rgba(0,0,0,.4);caret-color:currentColor}
@media (max-width:640px){
  /* Everything lives at the BOTTOM on mobile. The old top bar collided with the browser's address
     bar and hid Attach — so X + Attach float above the tool dock, in thumb reach, clear of chrome. */
  .mk-desk,.mk-desktop{display:none!important}
  .mk-mobile{display:inline-flex}
  .mk-bar{position:fixed;left:0;right:0;top:auto;bottom:calc(70px + env(safe-area-inset-bottom));
    padding:0 14px;min-height:0;background:transparent;border:0;justify-content:space-between;gap:8px;z-index:9}
  .mk-x{background:rgba(18,21,27,.9);border:1px solid rgba(255,255,255,.14);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
  .mk-btn{height:44px;padding:0 22px;box-shadow:0 8px 24px rgba(0,0,0,.45)}
  .mk-dock{display:flex;position:fixed;left:50%;transform:translateX(-50%);
    bottom:calc(12px + env(safe-area-inset-bottom));z-index:8;max-width:calc(100vw - 8px)}
  /* fluid width so all 7 tools always fit — even on narrow / zoomed-display phones (~320px) */
  .mk-dock .mk-tool,.mk-dock .mk-swatch{width:min(44px, calc((100vw - 46px) / 7));height:44px}
  .mk-dock .mk-swatch{border:0;background:transparent}
  .mk-dock .mk-swatch:hover{background:rgba(255,255,255,.1)}
  .mk-stage{padding:8px 12px calc(128px + env(safe-area-inset-bottom))}
  .mk-canvas{max-width:calc(100vw - 24px);max-height:calc(100vh - 172px)}
  .mk-zoom{right:12px;bottom:calc(124px + env(safe-area-inset-bottom))}   /* above the X/Attach row */
  /* while typing text, get the tool chrome out of the way so it can't cover the input */
  .mk-editing .mk-dock,.mk-editing .mk-bar,.mk-editing .mk-zoom{display:none}
}
`;

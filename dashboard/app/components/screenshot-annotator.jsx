"use client";
import { useRef, useEffect, useState } from "react";

// Red-ink annotator over a captured screenshot. Two tools: Pen (freehand — circle the problem) and
// Arrow (drag to point at it). Then Attach — it composites the markup onto the shot and hands back a
// PNG data URL. Undo/Clear/Cancel. The canvas is at the image's natural resolution (crisp), shown scaled.
export default function ScreenshotAnnotator({ shot, onDone, onCancel }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const drawing = useRef(false);
  const shapesRef = useRef([]);      // {type:'pen',points:[{x,y}]} | {type:'arrow',from,to} — natural coords
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState("pen");
  const toolRef = useRef(tool); toolRef.current = tool;

  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; const c = canvasRef.current; if (!c) return;
      c.width = img.naturalWidth; c.height = img.naturalHeight; redraw(); setReady(true); };
    img.src = shot;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot]);

  function drawArrow(ctx, a, b, lw) {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ah = Math.max(14, lw * 4.5), ang = Math.atan2(dy, dx);
    ctx.beginPath(); ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + ah * Math.cos(ang + Math.PI * 0.82), b.y + ah * Math.sin(ang + Math.PI * 0.82));
    ctx.lineTo(b.x + ah * Math.cos(ang - Math.PI * 0.82), b.y + ah * Math.sin(ang - Math.PI * 0.82));
    ctx.closePath(); ctx.fill();
  }
  function redraw() {
    const c = canvasRef.current, img = imgRef.current; if (!c || !img) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    const lw = Math.max(3, Math.round(c.width / 400));
    ctx.strokeStyle = "#ff2d2d"; ctx.fillStyle = "#ff2d2d"; ctx.lineWidth = lw;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = lw;
    for (const s of shapesRef.current) {
      if (s.type === "arrow") { drawArrow(ctx, s.from, s.to, lw); continue; }
      const p = s.points;
      if (p.length < 2) { if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0].x, p[0].y, lw, 0, 7); ctx.fill(); } continue; }
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  function pt(e) {
    const c = canvasRef.current; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function down(e) {
    e.preventDefault(); drawing.current = true; const p = pt(e);
    if (toolRef.current === "arrow") shapesRef.current.push({ type: "arrow", from: p, to: p });
    else shapesRef.current.push({ type: "pen", points: [p] });
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* noop */ }
    redraw();
  }
  function move(e) {
    if (!drawing.current) return; e.preventDefault(); const p = pt(e);
    const s = shapesRef.current[shapesRef.current.length - 1];
    if (s.type === "arrow") s.to = p; else s.points.push(p);
    redraw();
  }
  function up() {
    if (!drawing.current) return; drawing.current = false;
    const s = shapesRef.current[shapesRef.current.length - 1];   // drop a zero-length arrow (a click, no drag)
    if (s && s.type === "arrow" && Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y) < 4) { shapesRef.current.pop(); redraw(); }
  }
  function attach() { const c = canvasRef.current; if (c) onDone?.(c.toDataURL("image/png")); }

  return (
    <div className="ann-scrim">
      <div className="ann-bar">
        <div className="ann-left">
          <span className="ann-title">Mark the problem in red</span>
          <div className="ann-seg" role="tablist">
            <button className={`ann-tb${tool === "pen" ? " on" : ""}`} onClick={() => setTool("pen")} title="Freehand pen">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>Pen
            </button>
            <button className={`ann-tb${tool === "arrow" ? " on" : ""}`} onClick={() => setTool("arrow")} title="Arrow">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7" /><polyline points="9 7 17 7 17 15" /></svg>Arrow
            </button>
          </div>
        </div>
        <div className="ann-tools">
          <button className="ann-b" onClick={() => { shapesRef.current.pop(); redraw(); }} disabled={!ready}>Undo</button>
          <button className="ann-b" onClick={() => { shapesRef.current = []; redraw(); }} disabled={!ready}>Clear</button>
          <button className="ann-b ghost" onClick={onCancel}>Cancel</button>
          <button className="ann-b go" onClick={attach} disabled={!ready}>Attach</button>
        </div>
      </div>
      <div className="ann-stage">
        <canvas ref={canvasRef} className="ann-canvas"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      </div>
      <style>{`
        .ann-scrim{position:fixed;inset:0;z-index:2147483200;background:rgba(8,10,14,.92);display:flex;flex-direction:column;
          font-family:system-ui,-apple-system,Segoe UI,sans-serif}
        .ann-bar{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;color:#e9edf2;flex-wrap:wrap}
        .ann-left{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
        .ann-title{font-size:.9rem;font-weight:700}
        .ann-seg{display:inline-flex;gap:3px;padding:3px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:100px}
        .ann-tb{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:0;border-radius:100px;background:transparent;
          color:#c8ccd2;font:700 .78rem/1 inherit;cursor:pointer}
        .ann-tb.on{background:#fff;color:#12151b}
        .ann-tools{display:flex;gap:8px}
        .ann-b{height:34px;padding:0 14px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);
          color:#e9edf2;font:700 .82rem/1 inherit;cursor:pointer}
        .ann-b:hover{background:rgba(255,255,255,.14)}
        .ann-b:disabled{opacity:.45;cursor:default}
        .ann-b.ghost{background:transparent}
        .ann-b.go{background:#e0574a;border-color:#e0574a;color:#fff}
        .ann-b.go:hover{background:#d34a3d}
        .ann-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 16px 16px;overflow:auto}
        .ann-canvas{max-width:100%;max-height:100%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5);cursor:crosshair;touch-action:none;background:#fff}
      `}</style>
    </div>
  );
}

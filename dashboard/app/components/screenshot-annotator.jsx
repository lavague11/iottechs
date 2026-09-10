"use client";
import { useRef, useEffect, useState } from "react";

// Red-ink annotator over a captured screenshot. Draw freehand (circle/point at the problem), then
// Attach — it composites the drawing onto the shot and hands back a PNG data URL. Cancel/Clear/Undo.
// The drawing canvas is at the image's natural resolution (crisp), displayed scaled to fit.
export default function ScreenshotAnnotator({ shot, onDone, onCancel }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const drawing = useRef(false);
  const strokesRef = useRef([]);     // array of strokes; each stroke = array of {x,y} in natural coords
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; const c = canvasRef.current; if (!c) return;
      c.width = img.naturalWidth; c.height = img.naturalHeight; redraw(); setReady(true); };
    img.src = shot;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot]);

  function redraw() {
    const c = canvasRef.current, img = imgRef.current; if (!c || !img) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    ctx.strokeStyle = "#ff2d2d"; ctx.lineWidth = Math.max(3, Math.round(c.width / 400));
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = ctx.lineWidth;
    for (const s of strokesRef.current) {
      if (s.length < 2) { if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0].x, s[0].y, ctx.lineWidth, 0, 7); ctx.fillStyle = "#ff2d2d"; ctx.fill(); } continue; }
      ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  function pt(e) {
    const c = canvasRef.current; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function down(e) { e.preventDefault(); drawing.current = true; strokesRef.current.push([pt(e)]); try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* noop */ } redraw(); }
  function move(e) { if (!drawing.current) return; e.preventDefault(); const s = strokesRef.current[strokesRef.current.length - 1]; s.push(pt(e)); redraw(); }
  function up() { drawing.current = false; }

  function attach() {
    const c = canvasRef.current; if (!c) return;
    onDone?.(c.toDataURL("image/png"));
  }

  return (
    <div className="ann-scrim">
      <div className="ann-bar">
        <span className="ann-title">Circle the problem in red</span>
        <div className="ann-tools">
          <button className="ann-b" onClick={() => { strokesRef.current.pop(); redraw(); }} disabled={!ready}>Undo</button>
          <button className="ann-b" onClick={() => { strokesRef.current = []; redraw(); }} disabled={!ready}>Clear</button>
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
        .ann-title{font-size:.9rem;font-weight:700}
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

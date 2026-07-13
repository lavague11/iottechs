"use client";

import { useEffect, useRef, useState } from "react";
import { startPinCanvas } from "../project/[accessId]/gateway-pin-canvas";

// Full-screen black-hole "hyperspace" screen — reuses the exact canvas warp the PIN gate plays
// on "access granted" (gateway-pin-canvas startWarp): the starfield spirals into a gold-ringed
// black hole, flashes, and drops to a black void. Once the warp lands, the message + actions
// fade in over it. Used for the wrong-dimension 404 and the closed-project "missed your train".
export default function WarpScreen({ eyebrow, title, subtitle, children, onArrive }) {
  const canvasRef = useRef(null);
  const ctrlRef = useRef(null);
  const arriveRef = useRef(onArrive);
  arriveRef.current = onArrive;
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const ctrl = startPinCanvas(canvasRef.current);
    ctrlRef.current = ctrl;
    // Let the network breathe for a beat, then fall into the black hole.
    const t1 = setTimeout(() => ctrl.startWarp && ctrl.startWarp(), 500);
    // The warp resolves to a black void around ~1.6s — reveal the message then, and let the
    // caller kick off anything timed to the arrival (e.g. the 404's countdown-to-dashboard).
    const t2 = setTimeout(() => { setArrived(true); arriveRef.current && arriveRef.current(); }, 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); ctrl.cleanup && ctrl.cleanup(); };
  }, []);

  return (
    <div className="warp-root">
      <canvas ref={canvasRef} className="warp-canvas" />
      <div className={`warp-content${arrived ? " in" : ""}`}>
        {eyebrow && <div className="warp-eyebrow">{eyebrow}</div>}
        <h1 className="warp-title">{title}</h1>
        {subtitle && <p className="warp-sub">{subtitle}</p>}
        {children && <div className="warp-actions">{children}</div>}
      </div>

      <style>{`
        .warp-root{position:fixed;inset:0;background:#03060a;overflow:hidden;
          display:flex;align-items:center;justify-content:center;padding:24px;font-family:'Bricolage Grotesque',system-ui,sans-serif}
        .warp-canvas{position:absolute;inset:0;width:100%;height:100%}
        .warp-content{position:relative;z-index:70;text-align:center;max-width:460px;width:100%;
          opacity:0;transform:scale(.8);filter:blur(6px);pointer-events:none;
          transition:opacity .9s ease,transform .9s cubic-bezier(.16,1,.3,1),filter .9s ease}
        .warp-content.in{opacity:1;transform:scale(1);filter:blur(0);pointer-events:auto}
        .warp-eyebrow{font-size:.72rem;font-weight:800;letter-spacing:.32em;text-transform:uppercase;color:#C9A96E;margin-bottom:14px}
        .warp-title{font-size:2rem;font-weight:800;letter-spacing:-.02em;line-height:1.1;
          background:linear-gradient(180deg,#fff,#e8cb94);-webkit-background-clip:text;background-clip:text;color:transparent}
        .warp-sub{color:#aeb6cc;font-size:1rem;line-height:1.55;margin:14px auto 0;max-width:360px}
        .warp-actions{margin-top:30px;display:flex;flex-direction:column;align-items:center;gap:12px}
        .warp-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-width:200px;
          background:#C9A96E;color:#0B0F1A;font-weight:800;font-size:.98rem;padding:13px 26px;border:none;border-radius:100px;
          cursor:pointer;text-decoration:none;box-shadow:0 14px 34px -10px rgba(201,169,110,.6);transition:transform .15s,box-shadow .15s}
        .warp-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 20px 42px -10px rgba(201,169,110,.7)}
        .warp-btn:disabled{opacity:.6;cursor:default}
        .warp-btn.ghost{background:transparent;color:#c3ccdd;border:1px solid rgba(255,255,255,.18);box-shadow:none;min-width:0;padding:11px 22px;font-weight:700}
        .warp-btn.ghost:hover{border-color:#C9A96E;color:#fff;transform:none;box-shadow:none}
        .warp-note{color:#5f6b85;font-size:.78rem;margin-top:2px}
        @media(max-width:480px){.warp-title{font-size:1.6rem}}
      `}</style>
    </div>
  );
}

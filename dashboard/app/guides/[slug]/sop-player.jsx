"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

// Full-screen SOP player for the Guides library — photo on top, text below, Step X of Y, Back/Next, swipe,
// arrow keys. Reads the immutable published snapshot (step.img is already the chosen original/enhanced).
export default function SopPlayer({ sop }) {
  const steps = Array.isArray(sop.steps) ? sop.steps : [];
  const n = steps.length;
  const [i, setI] = useState(0);
  const sx = useRef(0);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") setI((v) => Math.min(n - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [n]);
  const st = steps[i] || {};
  return (
    <div className="sopv" role="dialog" aria-label={sop.title}
      onTouchStart={(e) => { sx.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const d = e.changedTouches[0].clientX - sx.current; if (d < -60 && i < n - 1) setI(i + 1); else if (d > 60 && i > 0) setI(i - 1); }}>
      <style>{CSS}</style>
      <div className="ph">
        <Link className="ib" href="/guides" aria-label="Back to guides">✕</Link>
        <div><b>{sop.title}</b><span>{n ? `Step ${i + 1} of ${n}` : "No steps"}</span></div>
      </div>
      <div className="bars">{steps.map((_, k) => <i className={k <= i ? "on" : ""} key={k} />)}</div>
      <div className="mid">
        {st.video ? <video src={st.video} poster={st.img || undefined} controls playsInline preload="metadata" /> : (st.img && <img src={st.img} alt="" />)}
        <h2>{st.title}</h2>
        <p>{st.instruction}</p>
      </div>
      <div className="nav">
        <button disabled={!i} onClick={() => setI(Math.max(0, i - 1))}>Back</button>
        <button className="nx" disabled={i >= n - 1} onClick={() => setI(Math.min(n - 1, i + 1))}>{i >= n - 1 ? "Done" : "Next"}</button>
      </div>
    </div>
  );
}

const CSS = `
.sopv{--card:#131315;--line:#2b2b30;--mut:#9d9da4;--acc:#FFD60A;position:fixed;inset:0;background:#000;color:#fff;
  font:16px/1.45 -apple-system,system-ui,sans-serif;display:flex;flex-direction:column;z-index:1}
.sopv *{box-sizing:border-box}
.sopv .ib{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:#fff;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-size:16px;flex:none}
.sopv .ph{padding:max(10px,env(safe-area-inset-top)) 12px 6px;display:flex;align-items:center;gap:10px}
.sopv .ph div{flex:1;min-width:0}
.sopv .ph b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:17px}
.sopv .ph span{font-size:13px;color:var(--mut);font-weight:600}
.sopv .bars{display:flex;gap:3px;padding:0 12px}
.sopv .bars i{flex:1;height:3px;border-radius:2px;background:#333}
.sopv .bars i.on{background:var(--acc)}
.sopv .mid{flex:1;overflow:auto;padding:12px 16px}
.sopv .mid img,.sopv .mid video{width:100%;max-height:56dvh;object-fit:contain;border-radius:16px;background:#111;display:block;margin:0 auto 14px}
.sopv h2{font-size:24px;font-weight:800;margin-bottom:8px}
.sopv p{font-size:19px;line-height:1.45;white-space:pre-wrap}
.sopv .nav{display:flex;gap:10px;padding:10px 12px calc(12px + env(safe-area-inset-bottom));max-width:720px;width:100%;margin:0 auto}
.sopv .nav button{flex:1;min-height:56px;border-radius:14px;border:1px solid var(--line);background:var(--card);color:#fff;font-size:18px;font-weight:800}
.sopv .nav .nx{flex:2;background:#fff;color:#000;border:0}
.sopv .nav button:disabled{opacity:.3}
`;

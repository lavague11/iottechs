"use client";

import { useState, useLayoutEffect } from "react";
import { markTourSeenAction } from "./actions";

// First-time guided tour for a customer: dims the page, spotlights the two spots that matter, and
// closes with a "call us" beat. Auto-shows once (DB flag: tour_seen_at) right after they confirm
// their details, and can be replayed anytime from the header "?" button. Dependency-free.
export default function CustomerTour({ accessId, phone = "(646) 396-0775", onClose }) {
  const STEPS = [
    { selector: ".pbar-wrap", title: "This is your project",
      body: "Your progress bar. Tap any step to see exactly where things stand — and what's coming next." },
    { selector: ".pv-survey-tools", altSelector: ".flow-wrap, .pcv-root, .apv-root", title: "Your next step is right here",
      body: "Review and approve items here to move your project forward. We'll guide you one step at a time." },
    { selector: null, title: "We're one call away", isFinal: true,
      body: "Questions at any point? Give us a call and we'll walk you through it — no rush." },
  ];
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  useLayoutEffect(() => {
    const find = () => (step.selector && document.querySelector(step.selector))
      || (step.altSelector && document.querySelector(step.altSelector)) || null;
    const el = find();
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    const measure = () => {
      const node = find();
      if (!node) { setRect(null); return; }
      const r = node.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const t = setTimeout(measure, el ? 380 : 0);   // let the smooth-scroll settle first
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  async function finish() { try { await markTourSeenAction(accessId); } catch (_) {} onClose?.(); }
  const next = () => (last ? finish() : setI(i + 1));

  // Tooltip sits just below the spotlight when there's room, else above; centered with no target.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1000;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let place = "center", style;
  if (rect) {
    const useBelow = rect.top + rect.height + 260 < vh;
    place = useBelow ? "below" : "above";
    style = {
      left: Math.min(Math.max(rect.left + rect.width / 2, 180), vw - 180),
      top:  useBelow ? rect.top + rect.height + 14 : rect.top - 14,
      transform: useBelow ? "translate(-50%,0)" : "translate(-50%,-100%)",
    };
  }
  const telHref = "tel:" + phone.replace(/[^\d+]/g, "");

  return (
    <div className="ctour" role="dialog" aria-modal="true">
      <style>{CSS}</style>
      {rect
        ? <div className="ctour-hole" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />
        : <div className="ctour-dim" />}
      <div className={`ctour-card ctour-${place}`} style={style}>
        <button className="ctour-x" onClick={finish} aria-label="Skip tour">✕</button>
        <div className="ctour-kick">Step {i + 1} of {STEPS.length}</div>
        <div className="ctour-title">{step.title}</div>
        <div className="ctour-body">{step.body}</div>
        {step.isFinal && (
          <a className="ctour-call" href={telHref}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            Call {phone}
          </a>
        )}
        <div className="ctour-foot">
          <div className="ctour-dots">{STEPS.map((_, k) => <span key={k} className={k === i ? "on" : ""} />)}</div>
          <div className="ctour-btns">
            {i > 0 && <button className="ctour-back" onClick={() => setI(i - 1)}>Back</button>}
            <button className="ctour-next" onClick={next}>{last ? "Got it" : "Next →"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.ctour{position:fixed;inset:0;z-index:9000;font-family:var(--font)}
.ctour-dim{position:fixed;inset:0;background:rgba(11,15,26,.74);animation:ctf .25s ease}
.ctour-hole{position:fixed;border-radius:14px;border:2px solid var(--gold-hi);box-shadow:0 0 0 9999px rgba(11,15,26,.74),0 0 0 4px rgba(201,169,110,.35);pointer-events:none;transition:top .35s ease,left .35s ease,width .35s ease,height .35s ease;animation:ctf .25s ease}
@keyframes ctf{from{opacity:0}to{opacity:1}}
.ctour-card{position:fixed;width:min(340px,92vw);background:#fff;border-radius:16px;border-top:4px solid var(--gold);box-shadow:0 24px 60px rgba(0,0,0,.45);padding:18px 18px 14px;animation:ctp .28s cubic-bezier(.2,.8,.3,1)}
.ctour-center{left:50%;top:50%;transform:translate(-50%,-50%)}
@keyframes ctp{from{opacity:0;transform:translate(-50%,-50%) scale(.94)}to{opacity:1}}
.ctour-below,.ctour-above{animation:ctp2 .28s cubic-bezier(.2,.8,.3,1)}
@keyframes ctp2{from{opacity:0}to{opacity:1}}
.ctour-x{position:absolute;top:10px;right:10px;width:26px;height:26px;border:none;background:#f2efe9;border-radius:8px;color:#8a8578;font-size:.8rem;cursor:pointer;line-height:1}
.ctour-x:hover{background:#e8e3d8;color:var(--ink)}
.ctour-kick{font-size:.66rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#a3812f}
.ctour-title{font-size:1.12rem;font-weight:800;color:var(--ink);letter-spacing:-.01em;margin-top:4px}
.ctour-body{font-size:.9rem;color:var(--muted);line-height:1.5;margin-top:6px}
.ctour-call{display:inline-flex;align-items:center;gap:8px;margin-top:12px;height:40px;padding:0 16px;border-radius:10px;background:linear-gradient(180deg,var(--gold-hi),var(--gold));color:var(--ink);font-size:.9rem;font-weight:800;text-decoration:none}
.ctour-call:hover{filter:brightness(1.05)}
.ctour-foot{display:flex;align-items:center;justify-content:space-between;margin-top:16px}
.ctour-dots{display:flex;gap:6px}
.ctour-dots span{width:7px;height:7px;border-radius:50%;background:#dcd8cf;transition:.2s}
.ctour-dots span.on{background:var(--gold);width:20px;border-radius:4px}
.ctour-btns{display:flex;gap:8px}
.ctour-back{height:36px;padding:0 14px;border:1px solid var(--line-warm);border-radius:9px;background:#fff;color:var(--muted);font-size:.85rem;font-weight:700;cursor:pointer;font-family:inherit}
.ctour-back:hover{border-color:var(--gold);color:var(--ink)}
.ctour-next{height:36px;padding:0 18px;border:none;border-radius:9px;background:var(--ink);color:#fff;font-size:.85rem;font-weight:800;cursor:pointer;font-family:inherit}
.ctour-next:hover{background:#1a2233}
`;

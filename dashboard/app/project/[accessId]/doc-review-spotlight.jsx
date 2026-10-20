"use client";
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";

/* Reusable guided-review SPOTLIGHT. Document-agnostic: give it an ordered list of steps, each pointing at
   a DOM element (ref or id) with helper copy; it dims the page, keeps the target bright, scrolls it into
   view, and walks Next/Back. The LAST step's button calls onFinish (e.g. open the signer). The spotlight
   NEVER signs/approves anything — it only guides attention. Mobile-safe (100dvh, safe-area, tracks scroll
   + resize), keyboard + reduced-motion aware. Used by the proposal today; PCP / change orders reuse it by
   supplying their own steps.

   steps: [{ el?: HTMLElement, getEl?: ()=>HTMLElement, title, hint, cta? }]  (cta only on the final step)
*/
export default function DocReviewSpotlight({ steps = [], onFinish, onClose, startAt = 0 }) {
  const [i, setI] = useState(startAt);
  const [rect, setRect] = useState(null);
  const rafRef = useRef(0);
  const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const steps0 = steps.filter(Boolean);
  const step = steps0[i] || null;
  const last = i >= steps0.length - 1;
  const targetEl = useCallback(() => (step ? (step.getEl ? step.getEl() : step.el) : null), [step]);

  const measure = useCallback(() => {
    const el = targetEl();
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    const pad = 8;
    setRect({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
  }, [targetEl]);

  // Scroll the target into view when the step changes, then measure (after the smooth scroll settles).
  useEffect(() => {
    const el = targetEl();
    if (!el) return;
    try { el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center", inline: "nearest" }); } catch { el.scrollIntoView(); }
    const t = setTimeout(measure, reduce ? 0 : 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // Keep the cutout glued to the target through scroll/resize/layout shifts (rAF-throttled).
  useLayoutEffect(() => {
    measure();
    const onMove = () => { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(measure); };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    const id = setInterval(measure, 500);   // catch async content/height changes without a resize event
    return () => { window.removeEventListener("scroll", onMove, true); window.removeEventListener("resize", onMove); cancelAnimationFrame(rafRef.current); clearInterval(id); };
  }, [measure]);

  const next = useCallback(() => { if (last) { onFinish && onFinish(); } else setI((v) => Math.min(steps0.length - 1, v + 1)); }, [last, onFinish, steps0.length]);
  const back = useCallback(() => setI((v) => Math.max(0, v - 1)), []);
  const close = useCallback(() => onClose && onClose(), [onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, close]);

  // lock body scroll while guiding (the spotlight scrolls the target for them)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!step) return null;

  // Helper card goes BELOW the target, or ABOVE when the target sits in the lower half of the viewport,
  // so it never lands off-screen or under the CTA.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const belowRoom = rect ? vh - (rect.top + rect.height) : vh;
  const cardAbove = rect ? belowRoom < 210 : false;

  return (
    <div className="docspot-root" role="dialog" aria-modal="true" aria-label={`Review step ${i + 1} of ${steps0.length}: ${step.title}`}>
      <style>{CSS}</style>
      {/* The dim: a transparent ring whose huge box-shadow darkens everything outside it. */}
      {rect ? (
        <div
          className="docspot-ring"
          onClick={next}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      ) : (
        <div className="docspot-fallback" onClick={next} />
      )}

      <div
        className={"docspot-card" + (cardAbove ? " above" : "")}
        style={rect ? (cardAbove ? { bottom: Math.max(16, vh - rect.top + 12) } : { top: Math.min(vh - 180, rect.top + rect.height + 12) }) : {}}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="docspot-top">
          <span className="docspot-step">Step {i + 1} of {steps0.length}</span>
          <button type="button" className="docspot-x" onClick={close} aria-label="Close review">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="docspot-title">{step.title}</div>
        {step.hint && <div className="docspot-hint">{step.hint}</div>}
        <div className="docspot-nav">
          {i > 0 ? <button type="button" className="docspot-back" onClick={back}>Back</button> : <span />}
          <button type="button" className="docspot-next" onClick={next}>
            {last ? (step.cta || "Review & Sign") : "Next"}
            {!last && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.docspot-root{position:fixed;inset:0;z-index:4000;height:100dvh}
.docspot-ring{position:fixed;border-radius:14px;box-shadow:0 0 0 9999px rgba(11,15,26,.52);outline:2px solid #C9A14A;outline-offset:0;transition:all .18s cubic-bezier(.2,.7,.3,1);cursor:pointer}
.docspot-fallback{position:fixed;inset:0;background:rgba(11,15,26,.52)}
.docspot-card{position:fixed;left:50%;transform:translateX(-50%);width:min(440px,calc(100vw - 28px));background:#fffdf8;border:1px solid #ece4d2;border-radius:16px;box-shadow:0 18px 50px -14px rgba(16,17,18,.5);padding:16px 18px 14px;z-index:4001}
.docspot-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.docspot-step{font:700 10.5px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#B4945C}
.docspot-x{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;background:transparent;color:#8a8069;cursor:pointer;border-radius:8px}
.docspot-x:hover{background:#f0ead9;color:#161821}
.docspot-title{font:650 17px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:#141821;letter-spacing:-.01em}
.docspot-hint{font:400 13.5px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#6b6555;margin-top:4px}
.docspot-nav{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px}
.docspot-back{border:1px solid #e0d8c6;background:#fff;color:#4a4636;border-radius:10px;padding:9px 16px;font:600 13.5px system-ui,sans-serif;cursor:pointer}
.docspot-back:hover{border-color:#161821}
.docspot-next{display:inline-flex;align-items:center;gap:5px;border:0;background:#161821;color:#F0E7D4;border-radius:10px;padding:11px 20px;font:650 14px system-ui,sans-serif;cursor:pointer;margin-left:auto}
.docspot-next:hover{background:#000}
@media (prefers-reduced-motion: reduce){ .docspot-ring{transition:none} }
`;

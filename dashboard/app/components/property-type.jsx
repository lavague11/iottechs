"use client";
import { useEffect, useRef, useState } from "react";
import { normalizePropertyType, PROPERTY_TYPES } from "../../lib/spec";

// Subtle, universal Residential / Commercial indicator + editor. ONE primitive, shared by the
// Project Header and the Site Survey so the classification looks and behaves identically everywhere
// and always drives the SAME canonical value (via onChange → setPropertyTypeAction). Read-only viewers
// get a plain one-word indicator with a small icon; editors get a tap-to-switch popover (no modal).
const ICON = {
  // office / building
  commercial: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="1.5"/><path d="M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01M10 22v-3h4v3"/></svg>,
  // home
  residential: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>,
};

export default function PropertyToggle({ value, editable = false, onChange, className = "" }) {
  const cur = normalizePropertyType(value);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  async function pick(next) {
    setOpen(false);
    if (next === cur || busy) return;
    setBusy(true);
    try { await onChange?.(next); } finally { setBusy(false); }
  }

  const label = PROPERTY_TYPES[cur];

  if (!editable) {
    return (
      <span className={`ptype ptype-ro ${className}`} title={label} aria-label={`Property type — ${label}`}>
        <span className="ptype-ic">{ICON[cur]}</span>{label}
      </span>
    );
  }

  return (
    <span className={`ptype-wrap ${className}`} ref={wrapRef} data-stop>
      <button type="button" className="ptype ptype-btn" aria-haspopup="listbox" aria-expanded={open}
        title={`${label} — tap to change`} disabled={busy}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <span className="ptype-ic">{ICON[cur]}</span>{label}
        <svg className="ptype-cv" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open && (
        <span className="ptype-pop" role="listbox">
          {Object.keys(PROPERTY_TYPES).map((k) => (
            <button key={k} type="button" role="option" aria-selected={k === cur}
              className={`ptype-opt${k === cur ? " on" : ""}`} onClick={(e) => { e.stopPropagation(); pick(k); }}>
              <span className="ptype-ic">{ICON[k]}</span>{PROPERTY_TYPES[k]}
              {k === cur && <svg className="ptype-ck" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
            </button>
          ))}
        </span>
      )}
      <style jsx global>{`
        .ptype-wrap{position:relative;display:inline-flex;flex:none}
        .ptype{display:inline-flex;align-items:center;gap:5px;font-size:.72rem;font-weight:600;
          letter-spacing:.01em;color:inherit;opacity:.72;white-space:nowrap}
        .ptype-ic{display:inline-flex;opacity:.85}
        .ptype-btn{border:1px solid currentColor;background:transparent;border-radius:999px;
          padding:3px 8px;cursor:pointer;opacity:.6;transition:opacity .15s;line-height:1}
        .ptype-btn:hover:not(:disabled){opacity:.9}
        .ptype-btn:disabled{cursor:default;opacity:.4}
        .ptype-cv{opacity:.7;margin-left:1px}
        .ptype-pop{position:absolute;top:calc(100% + 6px);left:0;z-index:60;min-width:150px;
          display:flex;flex-direction:column;padding:5px;border-radius:11px;
          background:var(--pop-bg,#12161f);border:1px solid rgba(255,255,255,.12);
          box-shadow:0 14px 34px rgba(0,0,0,.42)}
        .ptype-opt{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:0;
          background:transparent;border-radius:8px;cursor:pointer;font-size:.82rem;font-weight:600;
          color:var(--pop-fg,#e8ebf2);text-align:left}
        .ptype-opt:hover{background:rgba(255,255,255,.08)}
        .ptype-opt.on{color:#C9A96E}
        .ptype-opt .ptype-ck{margin-left:auto}
      `}</style>
    </span>
  );
}

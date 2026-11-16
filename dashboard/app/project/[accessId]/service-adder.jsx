"use client";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PROPOSAL_SERVICES, serviceColor } from "../../../lib/proposal";

// Simple line icons (one family, 24-grid) per service — a quick visual identifier in the picker.
const SVC_ICON = {
  camera: <><path d="M3 8.5h10.5l2.5 2.5v6H3z"/><circle cx="8" cy="13" r="2.3"/><path d="M16 11.4l5-2.4v8l-5-2.4"/></>,
  sound: <><rect x="4.5" y="3.5" width="11" height="17" rx="2"/><circle cx="10" cy="14.5" r="3"/><circle cx="10" cy="7.5" r="1"/></>,
  toast: <><rect x="3" y="4.5" width="18" height="11.5" rx="1.5"/><path d="M8.5 20h7"/><path d="M12 16v4"/></>,
  alarm: <><path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/></>,
  access: <><circle cx="8" cy="8" r="4"/><path d="M10.8 10.8 20 20"/><path d="m16.5 16.5 2-2"/><path d="m19 19 1.5-1.5"/></>,
  wiring: <><path d="M5 6v4.5A4.5 4.5 0 0 0 9.5 15a4.5 4.5 0 0 1 4.5 4.5V21"/><path d="M4 4v2.5M8 4v2.5"/><path d="M19 20v-4.5A4.5 4.5 0 0 0 14.5 11"/><path d="M20 22v-2.5M16 22v-2.5"/></>,
  custom: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
};

// "+ Add Service" → a full-viewport modal with compact service tiles (icon + name + restrained accent),
// replacing the old native-looking dropdown. Picking a tile adds that service (duplicates allowed —
// two camera systems, two custom blocks, etc.); Custom opens an in-modal name field. Portals to <body>
// so the deck's CSS transforms don't offset the fixed overlay (same reason as the waiver modal).
export default function ServiceAdder({ label = "+ Add Service", primary = false, onPick }) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  function close() { setOpen(false); setCustomMode(false); setCustomName(""); setTimeout(() => btnRef.current?.focus(), 0); }

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      const nodes = [...(panelRef.current?.querySelectorAll('button,input,[tabindex]:not([tabindex="-1"])') || [])].filter((n) => !n.disabled && n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => { panelRef.current?.querySelector("button,input")?.focus(); }, 0);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [open]);

  function pickService(key) {
    if (key === "custom") { setCustomMode(true); return; }
    onPick(key); close();
  }
  function addCustom() { const n = customName.trim(); onPick("custom", n || undefined); close(); }

  const overlay = (
    <div className="psm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="psm-panel" role="dialog" aria-modal="true" aria-label="Add service" ref={panelRef}>
        <div className="psm-head">
          <span className="psm-title">Add Service</span>
          <button type="button" className="psm-x" aria-label="Close" onClick={close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
          </button>
        </div>
        {customMode ? (
          <div className="psm-custom">
            <input className="psm-cinput" value={customName} autoFocus placeholder="Service name"
                   onChange={(e) => setCustomName(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
            <div className="psm-cacts">
              <button type="button" className="psm-btn ghost" onClick={() => { setCustomMode(false); setCustomName(""); }}>Cancel</button>
              <button type="button" className="psm-btn gold" onClick={addCustom}>Add</button>
            </div>
          </div>
        ) : (
          <div className="psm-grid">
            {PROPOSAL_SERVICES.map((s) => (
              <button type="button" key={s.key} className="psm-tile" onClick={() => pickService(s.key)}>
                <span className="psm-ic" style={{ color: serviceColor(s.key), background: `${serviceColor(s.key)}22` }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{SVC_ICON[s.key]}</svg>
                </span>
                <span className="psm-name">{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="prop-fp">
      <button type="button" ref={btnRef} className={`prop-fp-btn${primary ? " primary" : ""}`} onClick={() => setOpen(true)}>{label}</button>
      {open && typeof document !== "undefined" && createPortal(overlay, document.body)}
    </div>
  );
}

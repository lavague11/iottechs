"use client";

import { useState } from "react";

// Progressive-disclosure primitives for the Service Call diagnosis.
// A diagnosis is a story, not an option library: at rest each field shows the ANSWER (a compact row),
// and the full list of choices appears only when the row is tapped. Styling lives in svc-diagnose CSS.

// One summary row: LABEL … value ›. Tapping opens its editor. `empty` shows when nothing is chosen.
export function FieldRow({ label, value, empty = "—", onClick, disabled = false, tone = "", hint }) {
  const has = value != null && value !== "" && !(Array.isArray(value) && value.length === 0);
  return (
    <button type="button" className={`sd-fr${tone ? ` ${tone}` : ""}${has ? " has" : ""}`} onClick={disabled ? undefined : onClick} disabled={disabled} aria-label={label}>
      <span className="sd-fr-l">{label}</span>
      <span className="sd-fr-v">{has ? value : <em>{empty}</em>}</span>
      {hint ? <span className="sd-fr-hint">{hint}</span> : null}
      {!disabled && <svg className="sd-fr-x" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>}
    </button>
  );
}

// The picker sheet — centered popover on desktop, bottom sheet on mobile (CSS). Search + Suggested +
// All. Single or multi select. Options are the existing taxonomy; nothing is invented here.
export function Selector({ title, options, selected = [], multi = false, suggested = [], onToggle, onClose, children }) {
  const [q, setQ] = useState("");
  const sel = new Set(Array.isArray(selected) ? selected : selected ? [selected] : []);
  const byKey = Object.fromEntries(options.map((o) => [o.key, o]));
  const query = q.trim().toLowerCase();
  const match = (o) => !query || o.label.toLowerCase().includes(query);
  const sugKeys = query ? [] : suggested.filter((k) => byKey[k]).slice(0, 6);
  const sugSet = new Set(sugKeys);
  const rest = options.filter((o) => match(o) && !sugSet.has(o.key));

  const Row = (o) => (
    <button type="button" key={o.key} className={`sd-sel-opt${sel.has(o.key) ? " on" : ""}`}
      onClick={() => { onToggle(o.key); if (!multi) onClose(); }}>
      <span>{o.label}</span>
      {sel.has(o.key) && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
    </button>
  );

  return (
    <div className="svc-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sd-sel" role="dialog" aria-label={title}>
        <div className="sd-sel-h">
          <b>{title}</b>
          <button type="button" className="sd-sel-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {options.length > 8 && <input className="apx-input sd-sel-q" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />}
        <div className="sd-sel-list">
          {sugKeys.length > 0 && <>
            <div className="sd-sel-grp">Suggested</div>
            {sugKeys.map((k) => Row(byKey[k]))}
            <div className="sd-sel-grp">All</div>
          </>}
          {rest.map(Row)}
          {rest.length === 0 && sugKeys.length === 0 && <div className="sd-sel-none">No match</div>}
        </div>
        {children}
        {multi && <div className="sd-sel-foot"><button type="button" className="svc-inv-btn gold" onClick={onClose}>Done</button></div>}
      </div>
    </div>
  );
}

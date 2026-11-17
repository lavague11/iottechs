"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { skipOutsideClose } from "../../../lib/outside-click";

// Shared catalog type-ahead used by the Proposal's line items AND the Addendum builder — one picker, so a
// preset chosen in either lands with the same name + price.
export const capFirst = (s) => (s.length ? s[0].toUpperCase() + s.slice(1) : s);
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Name field for a line item or sub-item: auto-capitalizes the first letter as you type,
// and shows a type-ahead of matching catalog entries across every service — entries from
// the service currently being edited sort first, so "cat" while adding to Toast surfaces
// Toast's own "Cat6 Drop" before camera's or wiring's identical-priced entry.
export default function ItemNameField({ value, onChange, onPick, currentService, allCatalog, disabled, placeholder, style, autoFocus, onBlur, hidePrice = false }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e) { if (skipOutsideClose(e)) return; if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  // A freshly-created "+ Item" row lands here focused with the cursor ready (and selects any seeded
  // text), so the user types immediately — no second click. Mount-only.
  useEffect(() => {
    if (!autoFocus || !inputRef.current) return;
    inputRef.current.focus();
    if (value) inputRef.current.select();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Strictly scoped to the CURRENT service by canonical service id (never by name/keyword). A Security
  // Cameras editor only ever offers Security Cameras catalog items — no cross-service leakage.
  const matches = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (!needle) return [];
    return allCatalog.filter((c) => c.service === currentService && c.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [value, allCatalog, currentService]);

  function handleChange(e) {
    onChange(capFirst(e.target.value));
    setOpen(true);
  }
  function pick(c) {
    onPick(c);
    setOpen(false);
  }

  return (
    <div className="prop-name-ac" ref={boxRef}>
      <input ref={inputRef} value={value} disabled={disabled} placeholder={placeholder} style={style}
             onChange={handleChange} onFocus={() => setOpen(true)}
             onKeyDown={(e) => {
               if (e.key === "Enter") { e.preventDefault(); setOpen(false); e.currentTarget.blur(); }   // commit + leave the field
               else if (e.key === "Escape") { e.preventDefault(); setOpen(false); e.currentTarget.blur(); } // untouched blank rows are dropped on blur
             }}
             onBlur={() => { setOpen(false); onBlur?.(); }} />
      {open && !disabled && matches.length > 0 && (
        <div className="prop-name-menu">
          {matches.map((c, i) => (
            <div key={c.service + c.name + i} className="prop-name-opt mine"
                 onMouseDown={(e) => { e.preventDefault(); pick(c); }}>
              <span className="prop-name-opt-name">{c.name}</span>
              {!hidePrice && <span className="prop-name-opt-price">{money(c.price)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

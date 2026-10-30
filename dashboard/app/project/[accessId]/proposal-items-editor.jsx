"use client";
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { PROPOSAL_CATALOG, newItemId, svcSubtotal, itemTotal, priceOf, displayNameOf, serviceColor, effectiveCatalog, allCatalogEntries, loadPriceBook, presetsForService, makePresetBlock, lineRole, infraKindOf, nvrSummary, dispSummary, itemTypeOf, ensureNvrSetup, WAIVER_CAUSES, waiverCausesOf, hasWaiverCause, withWaiverCause, isWaived } from "../../../lib/proposal";
import { skipOutsideClose } from "../../../lib/outside-click";
import { bulkSubMatches, applyBulkSub, subKey, numEq } from "../../../lib/proposal-bulk";
import { LINE_CONDITIONS, LINE_CONDITION, lineConditions, loadConditions, conditionMap, exclusiveWith, conditionWaiveCause } from "../../../lib/proposal-terms";

const capFirst = (s) => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

// Touch long-press → open the row's action menu (the mobile pair of desktop right-click). Timer-based so
// it never blocks normal scrolling; cancels the moment the finger moves (scroll) or lifts early. Each call
// closes over its own timer/start-point, so every row is independent. Returns {} when disabled.
function longPress(onFire, ms = 500) {
  if (!onFire) return {};
  let timer = null, sx = 0, sy = 0;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return {
    onTouchStart: (e) => { if (e.target.closest("input,textarea,select")) return; const t = e.touches?.[0]; sx = t?.clientX || 0; sy = t?.clientY || 0; clear(); timer = setTimeout(() => { timer = null; onFire(); }, ms); },
    onTouchMove: (e) => { const t = e.touches?.[0]; if (t && (Math.abs(t.clientX - sx) > 8 || Math.abs(t.clientY - sy) > 8)) clear(); },
    onTouchEnd: clear,
    onTouchCancel: clear,
  };
}

// Name field for a line item or sub-item: auto-capitalizes the first letter as you type,
// and shows a type-ahead of matching catalog entries across every service — entries from
// the service currently being edited sort first, so "cat" while adding to Toast surfaces
// Toast's own "Cat6 Drop" before camera's or wiring's identical-priced entry.
function ItemNameField({ value, onChange, onPick, currentService, allCatalog, disabled, placeholder, style, autoFocus, onBlur }) {
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
              <span className="prop-name-opt-price">{money(c.price)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Compact condition markers for a row: up to `max` acronym badges inline, the rest collapsed into a
// quiet "+N" chip (hover lists them; click expands them in place). Each badge hovers to its full label +
// tooltip. Keeps a crowded row from wrapping/pushing the price off. Same component on parent + sub rows.
function CondBadges({ keys, condMap, max = 2 }) {
  const [all, setAll] = useState(false);
  const defs = (keys || []).map((k) => condMap[k] || LINE_CONDITION[k]).filter(Boolean);
  if (!defs.length) return null;
  const shown = all ? defs : defs.slice(0, max);
  const hiddenDefs = all ? [] : defs.slice(max);
  return (
    <>
      {shown.map((d) => (
        <span key={d.key} className={`prop-cond ${d.tone}`} title={`${d.label}${d.note ? ` — ${d.note}` : ""}`}>{d.badge}</span>
      ))}
      {hiddenDefs.length > 0 && (
        <button type="button" className="prop-cond prop-cond-more" title={hiddenDefs.map((d) => d.label).join(", ")}
                onClick={(e) => { e.stopPropagation(); setAll(true); }}>+{hiddenDefs.length}</button>
      )}
    </>
  );
}

// Dark / inverted equipment badge (gold glyph) that sits where the number badge would — the one visual cue that
// a line is infrastructure, not a numbered endpoint. Same footprint as .prop-block-num.
function InfraBadge({ kind = "generic", color }) {
  const P = {
    nvr: <><rect x="3" y="4.5" width="18" height="6" rx="1.3"/><rect x="3" y="13.5" width="18" height="6" rx="1.3"/><circle cx="6.5" cy="7.5" r=".9" fill="currentColor" stroke="none"/><circle cx="6.5" cy="16.5" r=".9" fill="currentColor" stroke="none"/></>,
    display: <><rect x="3" y="4.5" width="18" height="11" rx="1.3"/><line x1="9" y1="19.5" x2="15" y2="19.5"/><line x1="12" y1="15.5" x2="12" y2="19.5"/></>,
    amp: <><rect x="3" y="5" width="18" height="14" rx="1.3"/><circle cx="9" cy="12" r="3"/><circle cx="16.5" cy="9" r=".9" fill="currentColor" stroke="none"/><circle cx="16.5" cy="12.5" r=".9" fill="currentColor" stroke="none"/></>,
    switch: <><rect x="2.5" y="8.5" width="19" height="7" rx="1.3"/><line x1="6.5" y1="12" x2="6.5" y2="12"/><line x1="10.5" y1="12" x2="10.5" y2="12"/><line x1="14.5" y1="12" x2="14.5" y2="12"/><line x1="18" y1="12" x2="18" y2="12"/></>,
    panel: <><rect x="5" y="2.5" width="14" height="19" rx="2"/><line x1="8.5" y1="6.5" x2="15.5" y2="6.5"/><circle cx="12" cy="14" r="3"/></>,
    generic: <><rect x="4.5" y="4.5" width="15" height="15" rx="2"/></>,
  };
  return (
    <span className="prop-infra-badge" title="Infrastructure" style={color ? { background: color } : undefined}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{P[kind] || P.generic}</svg>
    </span>
  );
}

// Anchored "update matching items?" confirm shown after a repeated sub-item value is committed. Compact, one
// clear primary action; the scope toggle appears only with multiple options. Closes on Escape / outside click
// (= keep this one). All matching + counts are precomputed (b.cur / b.all) by the editor.
function BulkPrompt({ b, optionCount, onApply, onClose }) {
  const [scope, setScope] = useState("current");
  const ref = useRef(null);
  useEffect(() => {
    function onDown(e) { if (skipOutsideClose(e)) return; if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  const multi = optionCount > 1;
  const fmt = (v) => (b.field === "price" ? money(v) : String(Math.round((+v || 0) * 100) / 100));
  const count = (scope === "all" ? b.all : b.cur).length;
  return (
    <div className="prop-bulk" role="dialog" aria-label="Update matching items" ref={ref}>
      <div className="prop-bulk-h">Update {b.name}?</div>
      <div className="prop-bulk-sub">Changed from {fmt(b.oldValue)} to {fmt(b.newValue)}. {count} other{count === 1 ? "" : "s"} still use{count === 1 ? "s" : ""} {fmt(b.oldValue)}.</div>
      {multi && (
        <div className="prop-bulk-scope">
          <button type="button" className={`prop-bulk-sc${scope === "current" ? " on" : ""}`} onClick={() => setScope("current")}>This option · {b.cur.length}</button>
          <button type="button" className={`prop-bulk-sc${scope === "all" ? " on" : ""}`} onClick={() => setScope("all")}>All options · {b.all.length}</button>
        </div>
      )}
      <div className="prop-bulk-acts">
        <button type="button" className="prop-bulk-keep" onClick={onClose}>Keep</button>
        <button type="button" className="prop-bulk-all" onClick={() => onApply(scope)}>Update all {count + 1}</button>
      </div>
    </div>
  );
}

// One service group inside the builder: header, column labels, editable line-item rows
// (Cost column only when showCost), catalog quick-add, locations note.
// Items may carry sub-items (a camera block: the camera + its drop/termination/mounting/
// programming/waterproofing). Blocks render COLLAPSED as one line showing the all-in
// total; the chevron expands the editable breakdown.
const NVR_MODELS = (PROPOSAL_CATALOG.camera || []).filter((c) => /^NVR/.test(c.name));
const STORAGE_DRIVES = (PROPOSAL_CATALOG.camera || []).filter((c) => /Storage Drive/.test(c.name));
const isDrive = (it) => /Storage Drive/.test(it.name || "");
// The 3 picks for each Display Slot — customer supplies their own monitor ($0), or we supply
// a bundled monitor + mount ($200 default), or that same bundle plus custom work (price set
// per job). Always 4 slots, none locked (no NVR-capacity tie like HDD bays). Unlike NVR/storage
// names these aren't locked, so the dropdown must reflect price-book renames/prices live —
// see `displayOptions` computed per-render below, keyed by baseName.
const DISPLAY_OPTION_NAMES = ["Customer Provided", "Monitor + Mount", "Monitor + Mount + Custom"];
// HDD bays per NVR model: 8-Channel has 1 slot, 16-Channel 2, 32-Channel 4.
const NVR_SLOTS = { 8: 1, 16: 2, 32: 4 };
const slotsFor = (name) => NVR_SLOTS[+(String(name).match(/(\d+)-Channel/)?.[1] || 0)] || 0;
// Camera capacity = channel count. Recommend the smallest NVR that fits the camera count.
const chFor = (name) => +(String(name).match(/(\d+)-Channel/)?.[1] || 0);
function recommendedNvr(count) {
  if (count <= 8) return "NVR (8-Channel)";
  if (count <= 16) return "NVR (16-Channel)";
  if (count <= 32) return "NVR (32-Channel)";
  return "NVR (32-Channel + 16-Port PoE)"; // largest; may need a second NVR beyond 32
}
const nvrShort = (name) => String(name).replace(/^NVR \(|\)$/g, "");

// Line-item (•••) action menu — the one predictable place for anything you do to a row: Duplicate ·
// Add/Edit description · Remove. Delete is destructive, so Remove shows an in-menu confirm. Sub-items get
// Remove only. Closes on outside-click / Escape.
// A dropdown menu (absolute, opens below its trigger) gets clipped when a late row sits near the bottom of
// the overflow-hidden service card. Flip it to open UPWARD when opening down would clip it (and there's room
// above). Measured once, before paint, so there's no flash.
function useMenuFlip(ref) {
  const [up, setUp] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    let clip = { top: 0, bottom: window.innerHeight };
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = window.getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(cs.overflowY)) { const pr = p.getBoundingClientRect(); clip = { top: Math.max(clip.top, pr.top), bottom: Math.min(clip.bottom, pr.bottom) }; break; }
    }
    setUp(r.bottom > clip.bottom - 4 && (r.top - r.height - 8) > clip.top);
  }, []);
  return up;
}
function ItemMenu({ isSub = false, hasDesc = false, conditions = [], conditionDefs = LINE_CONDITIONS, onDuplicate, onDescribe, onToggleCondition, onApplyPeers, peerLabel, waived, onToggleWaive, onRemove, removeLabel, onClose, itemType, onSetType }) {
  const [confirming, setConfirming] = useState(false);
  const ref = useRef(null);
  const up = useMenuFlip(ref);
  useEffect(() => {
    function onDown(e) { if (skipOutsideClose(e)) return; if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div className={`prop-im${up ? " up" : ""}`} ref={ref} role="menu">
      {confirming ? (
        <div className="prop-im-confirm">
          <div className="prop-im-ctitle">Remove this line item?</div>
          <div className="prop-im-csub">{removeLabel}</div>
          <div className="prop-im-cacts">
            <button type="button" className="prop-im-cancel" onClick={onClose}>Cancel</button>
            <button type="button" className="prop-im-go" onClick={() => { onRemove(); onClose(); }}>Remove</button>
          </div>
        </div>
      ) : (
        <>
          {/* Fixed order (owner): Add description · Duplicate · Remove, then Conditions, then Waive LAST.
              Duplicate + Conditions are available on sub-items too (not just top-level); description/waive
              stay top-level only. */}
          {!isSub && onDescribe && <button type="button" className="prop-im-item" role="menuitem" onClick={() => { onDescribe(); onClose(); }}>{hasDesc ? "Edit description" : "Add description"}</button>}
          {onDuplicate && <button type="button" className="prop-im-item" role="menuitem" onClick={() => { onDuplicate(); onClose(); }}>Duplicate</button>}
          {onRemove && (
            <button type="button" className="prop-im-item danger" role="menuitem" onClick={() => setConfirming(true)}>Remove</button>
          )}
          {onToggleCondition && (
            <>
              <div className="prop-im-sep" />
              <div className="prop-im-grouplbl">Conditions</div>
              {conditionDefs.map((c) => {
                const on = conditions.includes(c.key);
                return (
                  <button key={c.key} type="button" className={`prop-im-item prop-im-cond${on ? " on" : ""}`} role="menuitemcheckbox" aria-checked={on}
                          title={c.note} onClick={() => onToggleCondition(c.key, !on)}>
                    <span className={`prop-im-cdot ${c.tone}`} aria-hidden="true" />
                    <span className="prop-im-cname"><span className="prop-im-cbadge">{c.badge}</span>{c.label}</span>
                    {on && <svg className="prop-im-ck" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>}
                  </button>
                );
              })}
              {onApplyPeers && conditions.length > 0 && (
                <button type="button" className="prop-im-item prop-im-apply" role="menuitem" onClick={() => { onApplyPeers(); onClose(); }}>{peerLabel || "Apply to all"}</button>
              )}
            </>
          )}
          {onSetType && (
            <>
              <div className="prop-im-sep" />
              <div className="prop-im-grouplbl">Type</div>
              {[["equipment", "Equipment"], ["labor", "Labor"]].map(([val, lbl]) => (
                <button key={val} type="button" className={`prop-im-item prop-im-cond${itemType === val ? " on" : ""}`}
                        role="menuitemradio" aria-checked={itemType === val} onClick={() => { onSetType(val); onClose(); }}>
                  <span className="prop-im-cname">{lbl}</span>
                  {itemType === val && <svg className="prop-im-ck" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>}
                </button>
              ))}
            </>
          )}
          {onToggleWaive && (
            <>
              {(onDescribe || onDuplicate || onRemove || onToggleCondition || onSetType) && <div className="prop-im-sep" />}
              <button type="button" className="prop-im-item" role="menuitem" onClick={() => { onToggleWaive(); onClose(); }}>{waived ? "Unwaive" : "Waive"}</button>
            </>
          )}
        </>
      )}
    </div>
  );
}
// Action menu for a collapsed system row (NVR / Displays / Amp) — same ••• control the line items use, so
// every row reads the same. Its one action opens that system's slot editor.
// Parent (•••) menu for a grouped lead row — only TRUE parent-level actions. Edit (amp, which still
// uses its own form) OR Remove (NVR/Displays, now edited inline, so the only parent action is removing
// the whole group). Remove shows a one-step in-menu confirm since it drops the group's equipment.
function SysRowMenu({ onEdit, onRemove, removeLabel = "Remove", onClose }) {
  const ref = useRef(null);
  const up = useMenuFlip(ref);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    function onDown(e) { if (skipOutsideClose(e)) return; if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div className={`prop-im${up ? " up" : ""}`} ref={ref} role="menu">
      {onEdit && <button type="button" className="prop-im-item" role="menuitem" onClick={() => { onEdit(); onClose(); }}>Edit</button>}
      {onRemove && (confirm
        ? <button type="button" className="prop-im-item danger" role="menuitem" onClick={() => { onRemove(); onClose(); }}>Confirm remove</button>
        : <button type="button" className="prop-im-item danger" role="menuitem" onClick={() => setConfirm(true)}>{removeLabel}</button>)}
    </div>
  );
}
// Service-header gear menu (replaces the old remove-service ✕): this service's pricing & presets, plus the
// (destructive) remove-service at the bottom.
// surveyImport (camera service only): { floors:[{index,name,count}], onImport(indices), onSync() } — the
// "Import from floor plan" (multi-floor checklist) and "Sync from survey" actions live here in the gear
// menu, not as separate buttons above the service.
function SvcHeadMenu({ onPricing, onWaiveItems, waivedCount = 0, onRemove, onClose, surveyImport }) {
  const [confirming, setConfirming] = useState(false);
  const [syncConfirm, setSyncConfirm] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const ref = useRef(null);
  const up = useMenuFlip(ref);
  useEffect(() => {
    function onDown(e) { if (skipOutsideClose(e)) return; if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  const floors = surveyImport?.floors || [];
  const canImport = !!surveyImport?.onImport && floors.length > 0;
  const toggle = (idx) => setChecked((s) => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  const doImport = () => { if (!checked.size) return; surveyImport.onImport([...checked]); onClose(); };
  const ck = <svg className="prop-im-ck" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>;
  return (
    <div className={`prop-im${up ? " up" : ""}`} ref={ref} role="menu">
      {confirming ? (
        <div className="prop-im-confirm">
          <div className="prop-im-ctitle">Remove this service?</div>
          <div className="prop-im-csub">Its line items go with it.</div>
          <div className="prop-im-cacts">
            <button type="button" className="prop-im-cancel" onClick={onClose}>Cancel</button>
            <button type="button" className="prop-im-go" onClick={() => { onRemove(); onClose(); }}>Remove</button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="prop-im-item" role="menuitem" onClick={() => { onPricing(); onClose(); }}>Pricing &amp; presets</button>
          {canImport && (
            <>
              <div className="prop-im-sep" />
              <div className="prop-im-grouplbl">Survey</div>
              {floors.length === 1 ? (
                <button type="button" className="prop-im-item" role="menuitem" onClick={() => { surveyImport.onImport([floors[0].index]); onClose(); }}>Import from floor plan</button>
              ) : (
                <>
                  {floors.map((f) => {
                    const on = checked.has(f.index);
                    return (
                      <button key={f.index} type="button" className={`prop-im-item prop-im-cond${on ? " on" : ""}`} role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(f.index)}>
                        <span className="prop-im-cname">{f.name}</span>
                        <span className="prop-im-count">{f.count}</span>
                        {on && ck}
                      </button>
                    );
                  })}
                  <button type="button" className="prop-im-item prop-im-apply" role="menuitem" disabled={!checked.size} onClick={doImport}>Import from floor plan{checked.size ? ` (${checked.size})` : ""}</button>
                </>
              )}
              {surveyImport?.onSync && (syncConfirm ? (
                <div className="prop-im-confirm">
                  <div className="prop-im-ctitle">Replace cameras with the survey&apos;s?</div>
                  <div className="prop-im-cacts">
                    <button type="button" className="prop-im-cancel" onClick={() => setSyncConfirm(false)}>Cancel</button>
                    <button type="button" className="prop-im-go" onClick={() => { surveyImport.onSync(); onClose(); }}>Rebuild</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="prop-im-item" role="menuitem" onClick={() => setSyncConfirm(true)}>Sync from survey</button>
              ))}
            </>
          )}
          {onWaiveItems && (
            <>
              <div className="prop-im-sep" />
              <button type="button" className="prop-im-item prop-im-waive" role="menuitem" onClick={() => { onWaiveItems(); onClose(); }}>
                Waive Items…{waivedCount > 0 && <span className="prop-im-count">{waivedCount}</span>}
              </button>
            </>
          )}
          <div className="prop-im-sep" />
          <button type="button" className="prop-im-item danger" role="menuitem" onClick={() => setConfirming(true)}>Remove service</button>
        </>
      )}
    </div>
  );
}
// Batch waiver manager for ONE service — replaces the old permanent "Waive items" page section. Checkboxes
// apply live (same as the old inline list); Done closes. Waive All confirms (it comps the whole service).
// Desktop = centred modal, phone = bottom sheet (CSS). Reuses the canonical it.waived model — no new math.
function WaiveBatchModal({ svcLabel, items, onToggle, onWaiveAll, onClose }) {
  const ref = useRef(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const waivedN = items.filter((it) => it.waived).length;
  const anyActive = items.some((it) => !it.waived);
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const nodes = [...(ref.current?.querySelectorAll('button,input,[tabindex]:not([tabindex="-1"])') || [])].filter((n) => !n.disabled && n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Portal to <body>: the deck slides use CSS transforms, which would make a position:fixed overlay
  // resolve against the slide instead of the viewport (off-centre). Portalling escapes that.
  const overlay = (
    <div className="pwm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pwm-panel" role="dialog" aria-modal="true" aria-label="Waive items" ref={ref}>
        <div className="pwm-head">
          <span className="pwm-title">Waive Items</span>
          <span className="pwm-svc">{svcLabel}{waivedN > 0 ? ` · ${waivedN} waived` : ""}</span>
          <button type="button" className="pwm-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="pwm-list">
          {items.map((it) => (
            <label key={it.id} className={`pwm-row${it.waived ? " on" : ""}`}>
              <input type="checkbox" checked={!!it.waived} onChange={(e) => onToggle(it.id, e.target.checked)} />
              <span className="pwm-name">{it.name || "Untitled item"}</span>
              <span className="pwm-amt">{it.waived ? "Waived" : money(itemTotal({ ...it, waived: false }))}</span>
            </label>
          ))}
        </div>
        <div className="pwm-acts">
          {confirmAll ? (
            <span className="pwm-confirm">Waive all in {svcLabel}?
              <button type="button" className="pwm-btn ghost" onClick={() => setConfirmAll(false)}>Cancel</button>
              <button type="button" className="pwm-btn gold" onClick={() => { onWaiveAll(true); setConfirmAll(false); }}>Waive All</button>
            </span>
          ) : (<>
            {waivedN > 0 && <button type="button" className="pwm-btn ghost" onClick={() => onWaiveAll(false)}>Unwaive All</button>}
            {anyActive && <button type="button" className="pwm-btn ghost" onClick={() => setConfirmAll(true)}>Waive All</button>}
            <button type="button" className="pwm-btn gold" onClick={onClose}>Done</button>
          </>)}
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}
// Dictation: a mic button that fills a text field by voice (Web Speech API). Renders nothing when the
// browser has no SpeechRecognition (and stays quiet if the mic is blocked — e.g. inside the preview pane),
// so it's a pure enhancement. onText receives the recognized phrase to append.
function DictateButton({ onText, title = "Dictate" }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  useEffect(() => () => { try { recRef.current?.stop(); } catch {} }, []);
  if (!SR) return null;
  function toggle() {
    if (listening) { try { recRef.current?.stop(); } catch {} return; }
    let rec; try { rec = new SR(); } catch { return; }
    rec.lang = "en-US"; rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0]?.transcript || "").join(" ").replace(/\s+/g, " ").trim();
      if (t) onText(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  }
  return (
    <button type="button" className={`prop-desc-mic${listening ? " on" : ""}`} title={listening ? "Stop" : title}
            aria-label={title} aria-pressed={listening} onClick={toggle}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><line x1="12" y1="17" x2="12" y2="22" />
      </svg>
    </button>
  );
}
// Audio system bar (Commercial Audio only): the amplifier is the head end — picked once, like the
// NVR — and Rack & Mount is its add-on, like a Display slot. Both live in the bar, not the item list.
const AMP_ADDON = "Rack & Mount";

export default function ProposalItemsEditor({ svc, showCost, readOnly, onChange, onRemove, onOpenPricing, priceBookVersion, customerFlags, onResolveFlag, cameraNames, onCameraRename, svcDrag, itemDrag, payload, activeOptId, optionCount = 1, onBulkApply,
  // Customer read-only capabilities — this same renderer powers the customer proposal. These are no-ops
  // for staff (undefined), so staff rendering is unchanged. `customer` turns on the customer-facing
  // per-line affordances: a pen that opens a change request (onRequestChange) and a Placement link
  // (onViewPlacement) when the camera is on a floor plan (hasLayout). `requestFlags` shows which lines
  // already have a pending request.
  customer = false, onRequestChange, onViewPlacement, requestFlags, hasLayout = false,
  // Optional node rendered on the RIGHT of the service header line (e.g. the customer view's Share/Download
  // cluster). No-op for staff/other services when undefined.
  headerRight = null,
  // Camera service only: { floors, onImport, onSync } — surfaces "Import from floor plan" + "Sync from
  // survey" inside the gear menu (SvcHeadMenu) instead of as separate buttons above the service.
  surveyImport }) {
  const flags = customerFlags || {};
  const reqFlags = requestFlags || {};
  // Smart bulk-update: when a repeated SUB-ITEM value (price/qty) is committed, offer to propagate it to the
  // other matching sub-items that still hold the OLD value. `preEdit` snapshots the value at focus so we can
  // tell what changed; `bulkPrompt` drives the anchored confirm. Both reset when the prompt closes.
  const preEdit = useRef({});                 // { [subId_field]: oldValue } captured onFocus
  const [bulkPrompt, setBulkPrompt] = useState(null);  // { parentId, subId, field, name, oldValue, newValue, cur:[], all:[] }
  const [waiveBatchOpen, setWaiveBatchOpen] = useState(false);  // the service's "Waive Items…" batch manager
  // Optional customer descriptions are progressive-disclosure: hidden until "+ Description" is clicked (or the
  // item already has one). descOpen = ids whose editor is open; emptying the field just clears it (no confirm).
  const [descOpen, setDescOpen] = useState(() => new Set());
  const [menuOpen, setMenuOpen] = useState(null);   // id of the line-item (•••) action menu that's open
  const [subEditId, setSubEditId] = useState(null); // sub-item being inline-edited (one at a time); else compact
  const [svcMenuOpen, setSvcMenuOpen] = useState(false); // service-header gear menu (pricing/presets · remove)
  const openDesc = (id) => setDescOpen((s) => new Set(s).add(id));
  const closeDesc = (id) => setDescOpen((s) => { const n = new Set(s); n.delete(id); return n; });
  // Detect a committed sub-item edit (blur / Enter) and open the propagate prompt when there are still-old matches.
  function maybeBulk(parent, sub, field) {
    if (readOnly || !payload || !onBulkApply) return;
    const k = `${sub.id}_${field}`;
    const oldValue = preEdit.current[k];
    delete preEdit.current[k];
    if (oldValue == null) return;
    const newValue = sub[field];
    if (numEq(oldValue, newValue)) return;                 // nothing really changed (#13)
    const matchKey = subKey(sub);
    const args = { serviceKey: svc.key, matchKey, field, oldValue, excludeSubId: sub.id };
    const cur = bulkSubMatches(payload, { ...args, optionId: activeOptId, allOptions: false });
    if (!cur.length) return;                               // unique → save normally, no prompt (#12)
    const all = optionCount > 1 ? bulkSubMatches(payload, { ...args, allOptions: true }) : cur;
    setBulkPrompt({ parentId: parent.id, subId: sub.id, field, matchKey, name: sub.name || "item", oldValue, newValue, cur, all });
  }
  // Apply the propagation at the chosen scope. Matches are RE-COMPUTED against the live payload (conflict
  // safety: only sub-items that STILL hold the old value are updated — anything changed since the prompt opened
  // is left alone). Reports the undo set (others + the edited sub) so the whole thing reverses atomically.
  function applyBulk(scope) {
    const b = bulkPrompt; if (!b) return;
    const others = bulkSubMatches(payload, { serviceKey: svc.key, matchKey: b.matchKey, field: b.field, oldValue: b.oldValue, excludeSubId: b.subId, optionId: activeOptId, allOptions: scope === "all" });
    const edited = { optionId: activeOptId, itemId: b.parentId, subId: b.subId };
    const next = applyBulkSub(payload, others, b.field, b.newValue);
    onBulkApply(next, { field: b.field, name: b.name, oldValue: b.oldValue, newValue: b.newValue,
      count: others.length + 1, undoTargets: [...others, edited] });
    setBulkPrompt(null);
  }
  // Recomputed whenever the price book changes (priceBookVersion bumps after Save) — includes
  // renamed/priced defaults, minus hidden ones, plus any custom items added for this service.
  const catalog = effectiveCatalog(svc.key, loadPriceBook());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allCatalog = useMemo(() => allCatalogEntries(loadPriceBook()), [priceBookVersion]);
  // Display Slot dropdown options — live name/price from the book, keyed by stable baseName
  // (unlike NVR/storage these are renamable, so the dropdown must track renames).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const displayOptions = useMemo(() => {
    const book = loadPriceBook();
    return DISPLAY_OPTION_NAMES.map((n) => ({ baseName: n, name: displayNameOf(n, book), price: priceOf(n, book) }));
  }, [priceBookVersion]);
  // Drive options with the LIVE service-pricing (price-book) prices — same source the config edits — so
  // the add-drive picker never shows a stale catalog price (setSlotDrive already prices from the book).
  const driveOptions = useMemo(() => {
    const book = loadPriceBook();
    return STORAGE_DRIVES.map((d) => ({ name: d.name, price: priceOf(d.name, book) }));
  }, [priceBookVersion]);
  const [open, setOpen] = useState({});   // parent item id -> expanded
  const [editingId, setEditingId] = useState(null);   // camera/block name shown as text; dbl-click to edit
  const [focusNewId, setFocusNewId] = useState(null); // a just-added "+ Item" row to autofocus for inline naming
  const [leadOpen, setLeadOpen] = useState({});   // collapsed NVR/Displays/Amp group -> children; open by default, false = user collapsed it
  const [leadEditId, setLeadEditId] = useState(null);   // which NVR/Display child row is inline-editing (one at a time)
  const [nvrConflict, setNvrConflict] = useState(null); // pending NVR downgrade that would drop drives → confirm first
  const [pick, setPick] = useState(null);               // center-screen add picker: { kind: "drive" | "display" } | null
  const [dispShown, setDispShown] = useState(1);  // display slots revealed (start at 1, "+ Add display" reveals more)
  const [askCam, setAskCam] = useState(null);     // preset awaiting a "how many cameras?" count (first camera only)
  const [camN, setCamN] = useState(4);
  const [renamingSvc, setRenamingSvc] = useState(false);   // service-name inline rename (double-click)
  const [svcDraft, setSvcDraft] = useState("");
  // Accordion: opening one parent collapses the others in this service (keeps the proposal from becoming
  // screens of breakdowns, esp. on mobile). Collapsing clears any open sub-item editor.
  const toggle = (id) => { setSubEditId(null); setOpen((o) => (o[id] ? {} : { [id]: true })); };
  const [dragId, setDragId] = useState(null);   // line item being dragged (within THIS section)
  const [overId, setOverId] = useState(null);    // line item currently hovered as a drop target
  // An item dragged from ANOTHER section is hovering here → this section is a cross-section drop target.
  const crossItem = !!(itemDrag?.active && itemDrag.active.svcIdx !== itemDrag.svcIdx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  void priceBookVersion; // referenced only to force a recompute of `catalog` above on save

  // ---- Camera system bar (Security Cameras only): count · NVR pick · per-slot drives ----
  const camCount = svc.items.filter((it) => it.sub).reduce((s, it) => s + (+it.qty || 0), 0);
  const nvrItem = svc.items.find((it) => !it.sub && /^NVR/.test(it.name));
  const hddSlots = slotsFor(nvrItem?.name);
  const driveAt = (n) => svc.items.find((it) => it.slot === n);
  const displayAt = (n) => svc.items.find((it) => it.displaySlot === n);

  // NVR capacity check: more cameras than the selected NVR's channels → offer an upgrade.
  const [warnDismissed, setWarnDismissed] = useState(false);
  const overCapacity = !!nvrItem && camCount > chFor(nvrItem.name);
  const recNvr = overCapacity ? recommendedNvr(camCount) : null;
  // Re-show the warning whenever the camera count or NVR changes (a new mismatch).
  useEffect(() => { setWarnDismissed(false); }, [camCount, nvrItem?.name]);
  function upgradeNvr() {
    const model = NVR_MODELS.find((m) => m.name === recNvr);
    if (!model || !nvrItem) return;
    onChange({ ...svc, items: svc.items.map((it) => (it === nvrItem ? { ...it, name: model.name, price: priceOf(model.name) } : it)) });
  }

  function applyNvr(name) {
    let items;
    if (!name) {
      // No NVR — drives have nowhere to mount, so every slotted drive goes too.
      items = svc.items.filter((it) => it !== nvrItem && it.slot == null);
    } else {
      const model = NVR_MODELS.find((m) => m.name === name);
      items = nvrItem
        ? svc.items.map((it) => (it === nvrItem ? { ...it, name: model.name, price: priceOf(model.name) } : it))
        : [...svc.items, { id: newItemId(), name: model.name, qty: 1, price: priceOf(model.name), cost: 0 }];
      // Downgrading drops any drive in a bay beyond the new NVR's slot count (only reached after the
      // conflict prompt is confirmed — chooseNvr blocks a silent drop).
      const slots = slotsFor(model.name);
      items = items.filter((it) => it.slot == null || it.slot <= slots);
    }
    // P2: keep exactly one NVR Setup labor line while there's an NVR (added after the drives); drop it when
    // the NVR is removed. Dedup-safe + additive — never alters other lines.
    onChange({ ...svc, items: ensureNvrSetup(items) });
  }
  // Inline NVR model change. A downgrade that would drop drives is NOT silent — it raises a compact
  // conflict the user confirms first (#7). Capacity comes from the canonical NVR_SLOTS rule (slotsFor).
  function chooseNvr(name) {
    if (name) {
      const slots = slotsFor(name);
      const filled = svc.items.filter((it) => it.slot != null);
      if (filled.length > slots) { setNvrConflict({ name, slots, remove: filled.length - slots }); return; }
    }
    applyNvr(name);
  }
  // First empty HDD bay within the current NVR's capacity, else 0 (none free).
  function nextFreeBay() {
    for (let n = 1; n <= hddSlots; n++) if (!driveAt(n)) return n;
    return 0;
  }
  // "+ Add Hard Drive" → the picker calls this with the chosen size; fills the next free bay.
  function addDrive(name) {
    const n = nextFreeBay();
    if (n) setSlotDrive(n, name || (STORAGE_DRIVES[0] || {}).name || "");
    setPick(null);
  }
  // "+ Add Display" → the picker calls this with the chosen type (or "__custom__"); next slot, max 4.
  function addDisplay(baseName) {
    const used = displayItems.map((d) => d.displaySlot);
    let n = 1; while (used.includes(n)) n++;
    if (n <= 4) { setSlotDisplay(n, baseName || "Customer Provided"); setDispShown(Math.max(dispShown, n)); }
    setPick(null);
  }
  // The inline selector for a lead child (recorder / drive / display), by kind. Changing it routes to the
  // SAME canonical handler (chooseNvr / setSlotDrive / setSlotDisplay) and closes the row (unless Custom).
  function leadSelect(bi) {
    if (bi.kind === "nvr") return (
      <select className="prop-lead-sel" value={nvrItem?.name || ""} disabled={readOnly} autoFocus aria-label="NVR model"
        onChange={(e) => { chooseNvr(e.target.value); setLeadEditId(null); }}>
        <option value="">None</option>
        {NVR_MODELS.map((m) => <option key={m.name} value={m.name}>{nvrShort(m.name)}</option>)}
      </select>
    );
    if (bi.kind === "drive") return (
      <select className="prop-lead-sel" value={bi.ref?.name || ""} disabled={readOnly} autoFocus aria-label="Storage drive"
        onChange={(e) => { setSlotDrive(bi.slot, e.target.value); setLeadEditId(null); }}>
        <option value="">Empty</option>
        {STORAGE_DRIVES.map((x) => <option key={x.name} value={x.name}>{x.name.replace(/ Storage Drive$/, "")}</option>)}
      </select>
    );
    if (bi.kind === "amp") return (
      <select className="prop-lead-sel" value={ampItem?.name || ""} disabled={readOnly} autoFocus aria-label="Amplifier"
        onChange={(e) => { pickAmp(e.target.value); setLeadEditId(null); }}>
        <option value="">None</option>
        {ampModels.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
        {ampItem && !ampModels.some((m) => m.name === ampItem.name) && <option value={ampItem.name}>{ampItem.name}</option>}
      </select>
    );
    if (bi.kind === "rack") return (
      <select className="prop-lead-sel" value={rackItem ? "on" : ""} disabled={readOnly} autoFocus aria-label="Rack & Mount"
        onChange={(e) => { setRack(e.target.value === "on"); setLeadEditId(null); }}>
        <option value="">None</option>
        <option value="on">{displayNameOf(AMP_ADDON, loadPriceBook())}</option>
      </select>
    );
    return (
      <select className="prop-lead-sel" value={bi.ref?.baseName || ""} disabled={readOnly} autoFocus aria-label="Display"
        onChange={(e) => { setSlotDisplay(bi.slot, e.target.value); if (e.target.value !== "__custom__") setLeadEditId(null); }}>
        <option value="">Empty</option>
        {displayOptions.map((x) => <option key={x.baseName} value={x.baseName}>{x.name}</option>)}
        <option value="__custom__">Custom…</option>
      </select>
    );
  }
  // Put a drive (or Empty) into a specific bay. One qty-1 line item per filled slot.
  function setSlotDrive(n, driveName) {
    let items = svc.items.filter((it) => it.slot !== n);
    if (driveName) {
      const d = STORAGE_DRIVES.find((x) => x.name === driveName) || STORAGE_DRIVES[0];
      items = [...items, { id: newItemId(), name: d.name, qty: 1, price: priceOf(d.name), cost: 0, slot: n }];
    }
    onChange({ ...svc, items });
  }
  // Same pattern for the 4 Display Slots: Customer Provided / Monitor / Mount, or Empty.
  // Stores baseName alongside the (possibly renamed) display name so the dropdown keeps
  // matching the right option even after a rename in the pricing gear.
  function setSlotDisplay(n, baseName) {
    let items = svc.items.filter((it) => it.displaySlot !== n);
    if (baseName === "__custom__") {
      // Custom display: blank name for the office to type, price starts at 0. baseName "__custom__"
      // keeps it from being renamed/repriced by the price book (it's a one-off).
      items = [...items, { id: newItemId(), name: "", baseName: "__custom__", qty: 1, price: 0, cost: 0, displaySlot: n }];
    } else if (baseName) {
      const d = displayOptions.find((x) => x.baseName === baseName) || displayOptions[0];
      items = [...items, { id: newItemId(), name: d.name, baseName: d.baseName, qty: 1, price: d.price, cost: 0, displaySlot: n }];
    }
    onChange({ ...svc, items });
  }
  // Migrate a legacy aggregated "Storage Drive ×N" line into individual per-slot drives.
  useEffect(() => {
    const legacy = svc.items.filter((it) => isDrive(it) && it.slot == null);
    if (!nvrItem || hddSlots === 0 || legacy.length === 0) return;
    const filled = new Set(svc.items.filter((it) => it.slot != null).map((it) => it.slot));
    const drives = [];
    legacy.forEach((it) => { for (let k = 0; k < Math.max(1, +it.qty || 1); k++) drives.push({ name: it.name, price: it.price, cost: it.cost || 0 }); });
    const items = svc.items.filter((it) => !(isDrive(it) && it.slot == null));
    let n = 1;
    drives.forEach((d) => {
      while (filled.has(n)) n++;
      if (n > hddSlots) return;
      filled.add(n);
      items.push({ id: newItemId(), name: d.name, qty: 1, price: d.price, cost: d.cost, slot: n });
      n++;
    });
    onChange({ ...svc, items });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nvrItem?.name]);

  // Default Display 1 to "Customer Provided" ($0) once an NVR is chosen — most jobs reuse the
  // customer's own screen, so an empty slot is the wrong default. Only seeds when NO display slot
  // is configured at all, so a deliberate Monitor/Mount pick (or an explicitly emptied slot within
  // an already-touched display config) is never overwritten.
  useEffect(() => {
    if (readOnly || svc.key !== "camera" || !nvrItem) return;
    if (svc.items.some((it) => it.displaySlot != null)) return;   // displays already touched — leave them
    const cp = displayOptions.find((x) => x.baseName === "Customer Provided") || displayOptions[0];
    onChange({ ...svc, items: [...svc.items, { id: newItemId(), name: cp.name, baseName: cp.baseName, qty: 1, price: 0, cost: 0, displaySlot: 1 }] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svc.key, nvrItem?.name]);

  function patchItems(items) { onChange({ ...svc, items }); }
  function patchItem(id, patch) {
    patchItems(svc.items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  // Inline price/cost edits for the NVR + drive/display lines managed in the system bar.
  const setSlotField = (n, patch) => { const d = driveAt(n); if (d) patchItem(d.id, patch); };
  const setDisplayField = (n, patch) => { const d = displayAt(n); if (d) patchItem(d.id, patch); };
  const setNvrField = (patch) => { if (nvrItem) patchItem(nvrItem.id, patch); };
  // NVR + slotted drives/displays live only in the system bar, not the editable item list.
  // NVR hardware + drives + displays live in the NVR/Displays lead group; the NVR SETUP labor line is NOT
  // a sysbar item (it starts with "NVR" but is a normal labor line) — it renders in the flat list.
  const inSysbar = (it) => (svc.key === "camera" && !it.nvrSetup && (it.slot != null || it.displaySlot != null || /^NVR/.test(it.name || ""))) || (svc.key === "sound" && it.ampSlot != null);
  // ---- Audio system bar: amplifier pick (+ price/cost) and the Rack & Mount add-on ----
  const soundMode = svc.key === "sound";
  const ampModels = soundMode ? catalog.filter((c) => /^Amplifier/i.test(c.name)) : [];
  const ampItem = svc.items.find((it) => it.ampSlot === 1);
  const rackItem = svc.items.find((it) => it.ampSlot === 2);
  function pickAmp(name) {
    const rest = svc.items.filter((it) => it.ampSlot !== 1 && (name || it.ampSlot !== 2));   // no amp → no rack either
    if (!name) { patchItems(rest); return; }
    const c = catalog.find((x) => x.name === name);
    patchItems([...rest, { id: newItemId(), name, qty: 1, price: c ? c.price : priceOf(name, loadPriceBook()), cost: 0, ampSlot: 1 }]);
  }
  function setRack(on) {
    const rest = svc.items.filter((it) => it.ampSlot !== 2);
    if (!on) { patchItems(rest); return; }
    const book = loadPriceBook();
    patchItems([...rest, { id: newItemId(), name: displayNameOf(AMP_ADDON, book), qty: 1, price: priceOf(AMP_ADDON, book), cost: 0, ampSlot: 2 }]);
  }
  const setAmpField = (slot, patch) => { const it = svc.items.find((x) => x.ampSlot === slot); if (it) patchItem(it.id, patch); };
  function patchSub(pid, sid, patch) {
    patchItems(svc.items.map((it) => it.id === pid
      ? { ...it, sub: it.sub.map((x) => (x.id === sid ? { ...x, ...patch } : x)) }
      : it));
  }
  function removeSub(pid, sid) {
    patchItems(svc.items.map((it) => (it.id === pid ? { ...it, sub: it.sub.filter((x) => x.id !== sid) } : it)));
  }
  // Duplicate a sub-item (bundle component) right below the source with a fresh id — same pattern as
  // duplicateItem, for the inline edit bar so a repeated component (another drop, another mount) is one tap.
  function duplicateSub(pid, sid) {
    patchItems(svc.items.map((it) => {
      if (it.id !== pid) return it;
      const sub = it.sub || [];
      const idx = sub.findIndex((x) => x.id === sid);
      if (idx < 0) return it;
      const next = sub.slice();
      next.splice(idx + 1, 0, { ...sub[idx], id: newItemId() });
      return { ...it, sub: next };
    }));
  }
  // Toast "Existing" toggle on a Line Drop line: flip between a new Cat6 run ("Line Drop", $150)
  // and an existing cable ("Line Drop — Existing", $50 test & map). Swaps the line's name + price
  // from the price book; the office can still hand-edit the price after.
  function toggleExisting(parent, it) {
    const book = loadPriceBook();
    const isExisting = /existing/i.test(it.name || "");
    const baseName = isExisting ? "Line Drop" : "Line Drop — Existing";
    const nextPrice = priceOf(baseName, book) || (isExisting ? 150 : 50);
    patchSub(parent.id, it.id, { name: displayNameOf(baseName, book), price: nextPrice });
  }
  function addSub(pid) {
    patchItems(svc.items.map((it) => it.id === pid
      ? { ...it, sub: [...(it.sub || []), { id: newItemId(), name: "", qty: 1, price: 0, cost: 0 }] }
      : it));
  }
  function removeItem(id) { patchItems(svc.items.filter((it) => it.id !== id)); }
  // Duplicate a top-level line item just below the source: deep-copy (incl. sub-items, description, conditions)
  // with FRESH ids, and drop the survey camera link so the copy is a new camera, not the same placed device.
  function duplicateItem(id) {
    const idx = svc.items.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const src = svc.items[idx];
    const copy = { ...src, id: newItemId(), camera_id: null,
      ...(Array.isArray(src.conditions) ? { conditions: [...src.conditions] } : {}),   // duplicate preserves flags
      ...(src.sub ? { sub: src.sub.map((s) => ({ ...s, id: newItemId() })) } : {}) };
    const next = svc.items.slice(); next.splice(idx + 1, 0, copy);
    patchItems(next);
  }
  // Line-item CONDITIONS (customer-provided equipment, existing cable). Toggle on a single line, or apply
  // additively across every peer line in this service (never removes a peer's existing conditions).
  // Toggle a condition, enforcing mutual exclusivity: turning one on drops any peer in the same
  // exclusiveGroup (e.g. Tested ⇄ Not Tested), so a line is never both at once.
  const nextConds = (cur, key, on) => (on
    ? [...cur.filter((k) => k !== key && !exclusiveWith(key).includes(k)), key]
    : cur.filter((k) => k !== key));
  // The waiver cause a condition contributes (CPE ⇒ the canonical CPE cause; an admin waive-price condition
  // ⇒ its own isolated per-key cause). Reads the admin display-override merge first, then the built-in def.
  const condCause = (key) => conditionWaiveCause(condMap[key] || LINE_CONDITION[key]);
  // Build the patch for a condition toggle on a specific line/sub. A condition that carries a waiver cause
  // (CPE) adds/removes ONLY that cause via withWaiverCause — so a manual ••• Waive, or a different
  // condition's waive, is never clobbered, and removing CPE reveals the line's own preserved price again
  // (the snapshot is never touched, never re-read from the catalog). CPE ⇒ waived is one-way.
  const condPatch = (it, cur, key, on) => {
    const p = { conditions: nextConds(cur, key, on) };
    const cause = condCause(key);
    if (cause) Object.assign(p, withWaiverCause(it, cause, on));
    return p;
  };
  function setCondition(id, key, on) {
    const it = svc.items.find((x) => x.id === id); if (!it || !LINE_CONDITION[key]) return;
    const cur = lineConditions(it);
    if (on === cur.includes(key)) return;
    patchItem(id, condPatch(it, cur, key, on));
  }
  // Same, for a sub-item (bundle component) — conditions attach to sub-items too, so marking the CAMERA
  // component CPE comps only that component and leaves its sibling labor (drop, termination, mounting…)
  // billable. Each sub carries its own conditions + waiver causes.
  function setSubCondition(pid, sid, key, on) {
    const parent = svc.items.find((x) => x.id === pid); const x = parent?.sub?.find((s) => s.id === sid);
    if (!x || !LINE_CONDITION[key]) return;
    const cur = lineConditions(x);
    if (on === cur.includes(key)) return;
    patchSub(pid, sid, condPatch(x, cur, key, on));
  }
  // Bulk-apply: copy THIS line's conditions onto every peer endpoint line in one pass (additive — a peer's
  // own conditions are kept). Infrastructure rows (NVR/Displays/amp) are skipped.
  function applyLineConditionsToPeers(id) {
    const src = svc.items.find((x) => x.id === id); if (!src) return;
    const keys = lineConditions(src); if (!keys.length) return;
    patchItems(svc.items.map((it) => {
      if (it.id === id || lineRole(it) === "infrastructure") return it;
      const cur = lineConditions(it);
      const add = keys.filter((k) => !cur.includes(k));
      if (!add.length) return it;
      // Additive, but drop any peer condition the added keys are mutually exclusive with (e.g. adding
      // Tested removes an existing Not Tested), so a bulk apply never leaves a line in both states.
      const excluded = new Set(add.flatMap((k) => exclusiveWith(k)));
      return { ...it, conditions: [...cur.filter((k) => !excluded.has(k)), ...add] };
    }));
  }
  // + Item: create the row immediately and (when blank) hand focus to its name field so the user types
  // right away — spreadsheet-style. A blank, unpriced row that's abandoned is dropped on blur (see render).
  function addItem(name = "", price = 0) {
    const id = newItemId();
    patchItems([...svc.items, { id, name, qty: 1, price, cost: 0 }]);
    if (!name) setFocusNewId(id);
    return id;
  }
  // Preset bundles for this service (default "Full Camera Install" + any admin-added). One
  // click drops the whole bundle as a block (header + sub-items priced from the book).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const presets = presetsForService(svc.key, loadPriceBook());
  // Line-item conditions, with the admin's Configuration Center ▸ Conditions display edits applied (badge /
  // label / colour). Recomputes on save (priceBookVersion bump). The ••• submenu lists condDefs; badges read condMap.
  const condDefs = loadConditions(loadPriceBook());
  const condMap = conditionMap(loadPriceBook());
  void priceBookVersion; // chips recompute when the Configuration Center saves presets (bumps priceBookVersion)
  // ---- Waiver: comp a whole line off the invoice (keeps it visible at its original price, struck). A line
  // is waivable if it carries value (or is already waived) — INCLUDING the infrastructure lines (NVR, storage
  // drive / HDD, displays), which are grouped under the system bar but are still real priced lines you may
  // comp. Management lives in contextual actions: item ••• (Waive/Restore) and the service gear's "Waive
  // Items…" batch manager. The accounting is unchanged (it.waived drives itemTotal).
  const canWaiveItem = (it) => isWaived(it) || itemTotal({ ...it, waived: false }) > 0;
  const svcWaivable = (svc.items || []).filter(canWaiveItem);
  const svcWaivedCount = svcWaivable.filter((it) => isWaived(it)).length;
  // The ••• Waive / Restore control and the "Waive Items…" batch manager operate ONLY on the MANUAL cause,
  // via withWaiverCause — so they never silently clear a CPE waive (that is removed by unchecking CPE in
  // Conditions) and a manual waive survives adding/removing CPE. Price is never mutated.
  const manualOn = (it) => hasWaiverCause(it, WAIVER_CAUSES.MANUAL);
  const setItemWaived = (id, on) => { const it = (svc.items || []).find((x) => x.id === id); if (it) patchItem(id, withWaiverCause(it, WAIVER_CAUSES.MANUAL, on)); };
  const setSubWaived = (pid, sid, on) => { const x = (svc.items || []).find((i) => i.id === pid)?.sub?.find((s) => s.id === sid); if (x) patchSub(pid, sid, withWaiverCause(x, WAIVER_CAUSES.MANUAL, on)); };
  const waiveAllInSvc = (v) => patchItems((svc.items || []).map((it) => (canWaiveItem(it) ? { ...it, ...withWaiverCause(it, WAIVER_CAUSES.MANUAL, v) } : it)));
  function addPresetBlock(preset, count = 1) {
    const book = loadPriceBook();
    const blocks = Array.from({ length: Math.max(1, +count || 1) }, () => makePresetBlock(preset, book));
    patchItems([...svc.items, ...blocks]);
  }
  // First camera on a project → ask "how many?" so the office adds them all at once; after that, +1.
  function clickPreset(p) {
    if (svc.key === "camera" && camCount === 0) { setCamN(4); setAskCam(p); }
    else addPresetBlock(p);
  }

  const gridClass = showCost ? "" : " nocost";
  // Sequential, color-coded numbers (1..N) for every top-level line item in this service —
  // not just the ones with a sub-item breakdown (a camera block) but flat rows too (Network
  // Switch, ISP, Control Panel…). NVR/drives are excluded — they live in the sysbar, not here.
  const visibleItems = svc.items.filter((it) => !inSysbar(it));
  const svcColor = serviceColor(svc.key);

  // Recording-system groups (camera service only). Each collapses to one numbered summary line.
  const camMode = svc.key === "camera";
  const driveItems = camMode ? svc.items.filter((it) => it.slot != null) : [];
  const displayItems = camMode ? svc.items.filter((it) => it.displaySlot != null) : [];
  // Displays are add-on-demand: show 1 by default, reveal more with "+ Add display" (or as many as are filled).
  const dispVisible = Math.max(1, displayItems.reduce((m, it) => Math.max(m, it.displaySlot || 0), 0), dispShown);
  const nvrGroupTotal = nvrItem ? itemTotal(nvrItem) + driveItems.reduce((s, it) => s + itemTotal(it), 0) : 0;
  const displaysTotal = displayItems.reduce((s, it) => s + itemTotal(it), 0);
  // NVR + Displays are now ALWAYS inline-editable lead rows (no "Edit mode" form takeover). The camera
  // sysbar form is gone; a no-NVR service shows the recorder child as a compact inline selector instead.
  // Amp (audio) keeps its own sysbar for now. Every child carries its real item ref + kind + slot so the
  // inline editor can call the SAME canonical handlers (chooseNvr / setSlotDrive / setSlotDisplay).
  const showSysbar = false;
  const leadRows = [];
  if (camMode) {
    const nvrChildren = nvrItem
      ? [{ ref: nvrItem, kind: "nvr", name: nvrItem.name, price: +nvrItem.price || 0, total: itemTotal(nvrItem) },
         ...driveItems.map((d) => ({ ref: d, kind: "drive", slot: d.slot, name: d.name || "Storage drive", price: +d.price || 0, total: itemTotal(d) }))]
      : [{ kind: "nvr", placeholder: true, name: "", price: 0, total: 0 }];   // pick the recorder inline
    leadRows.push({ key: "nvr", title: nvrItem ? `NVR · ${nvrShort(nvrItem.name)}` : "NVR",
      summary: nvrItem ? nvrSummary(nvrItem, driveItems) : null,
      total: nvrGroupTotal,
      add: nvrItem && hddSlots > 0 && nextFreeBay() ? { label: "+ Add Hard Drive", pick: "drive" } : null,   // hidden when every bay is full
      hint: !nvrItem && camCount > 0 ? `Recommended · ${camCount <= 8 ? "8" : camCount <= 16 ? "16" : "32"}-Channel NVR` : null,
      items: nvrChildren });
    if (nvrItem) leadRows.push({ key: "disp", title: displayItems.length === 1 ? "Display" : "Displays",
      summary: displayItems.length > 0 ? dispSummary(displayItems) : null,
      total: displaysTotal,
      add: displayItems.length < 4 ? { label: "+ Add Display", pick: "display" } : null,
      items: displayItems.map((d) => ({ ref: d, kind: "display", slot: d.displaySlot, name: `Display ${d.displaySlot} · ${d.name || "—"}`, price: +d.price || 0, total: itemTotal(d) })) });
  }
  // Audio amp — same inline-editable grammar as NVR/Displays. Amp = the "recorder" (always a child,
  // selector); Rack & Mount = its optional add-on child. No Edit-mode form.
  if (soundMode) {
    const ampChildren = ampItem
      ? [{ ref: ampItem, kind: "amp", name: ampItem.name, price: +ampItem.price || 0, total: itemTotal(ampItem) },
         ...(rackItem ? [{ ref: rackItem, kind: "rack", name: rackItem.name, price: +rackItem.price || 0, total: itemTotal(rackItem) }] : [])]
      : [{ kind: "amp", placeholder: true, name: "", price: 0, total: 0 }];
    leadRows.push({ key: "amp", title: ampItem ? `Amp · ${ampItem.name}` : "Amp",
      total: (ampItem ? itemTotal(ampItem) : 0) + (rackItem ? itemTotal(rackItem) : 0),
      add: ampItem && !rackItem ? { label: "+ Add Rack & Mount", onClick: () => setRack(true) } : null,
      items: ampChildren });
  }
  const leadCount = leadRows.length;
  // Number ONLY endpoints (cameras / speakers / sensors), from 1 — infrastructure in the list gets an icon, not
  // a number, and the collapsed recording-system lines (NVR/Displays/Amp) are infrastructure too. So "8 cameras"
  // is badges 1–8 with no gaps. (leadCount no longer offsets the numbering.)
  const blockNumOf = {};
  let _epN = 0;
  visibleItems.forEach((it) => { if (lineRole(it) === "endpoint") blockNumOf[it.id] = ++_epN; });

  // Drag-to-reorder the numbered line-item blocks. Sysbar items (NVR/drives/displays) keep
  // their spots — only the visible blocks reorder, then the sysbar items are re-appended.
  function moveItem(fromId, toId) {
    if (!fromId || fromId === toId) return;
    const vis = visibleItems.slice();
    const from = vis.findIndex((x) => x.id === fromId);
    const to = vis.findIndex((x) => x.id === toId);
    if (from < 0 || to < 0) return;
    const [m] = vis.splice(from, 1);
    vis.splice(to, 0, m);
    patchItems([...vis, ...svc.items.filter(inSysbar)]);
  }

  const row = (it, parent, subIdx) => {
    // Every top-level item is expandable (even a flat $0 line like ISP or Pronto/Meraki) so
    // a breakdown can be added to any of them. Only once it actually HAS sub-items does it
    // switch to header display: block total only, no qty/price/cost of its own — the
    // breakdown lines carry that.
    const hasSub = !parent && !!it.sub && it.sub.length > 0;
    const expandable = !parent;
    // ONE money number per line. A lead row's amount is a read-only TOTAL of its children, so the WHOLE
    // line — the blank middle, the empty cells, and the total itself — toggles the breakdown (you edit the
    // children, not the sum). A flat line shows a single editable amount; clicking its blank area just
    // drops focus into the name. (Quantity isn't a separate control — Duplicate a line for multiples.)
    const focusName = (e) => e.currentTarget.closest(".prop-item")?.querySelector(".prop-name-ac input")?.focus();
    const expandCell = hasSub ? { onClick: () => toggle(it.id), style: { cursor: "pointer" } } : null;
    const editCell = (!hasSub && !readOnly) ? { onClick: focusName, style: { cursor: "text" } } : null;
    const blankCell = expandCell || editCell;
    // A camera line's label is the survey's location name (single source of truth). We DISPLAY the
    // survey name (camName) but edit it.name; entering edit mode seeds it.name from the survey name,
    // and on blur a camera line linked by camera_id writes the new name back to the survey (→ survey +
    // mockup stay in sync). camName resolves by camera_id only, so a line is never mislabeled.
    const camName = svc.key === "camera" && cameraNames ? cameraNames.get(it.id) : null;
    const startCamEdit = () => { if (readOnly) return; if (camName && camName !== it.name) patchItem(it.id, { name: camName }); setEditingId(it.id); };
    const writeCamName = () => { if (svc.key === "camera" && it.camera_id && onCameraRename) onCameraRename(it.camera_id, it.name); };  // survey write-back on rename
    return (
    <div key={it.id} className={`prop-item${gridClass}${parent ? " sub" : ""}${hasSub ? " prop-parent" : ""}${parent && subIdx % 2 ? " alt" : ""}`}
         style={parent && bulkPrompt?.subId === it.id ? { position: "relative", zIndex: 5 } : undefined}
         /* Right-click (desktop) / long-press (mobile) a line → the SAME ••• action menu; suppress the
            browser's native context menu on a non-editing line. */
         onContextMenu={!readOnly ? (e) => { if (e.target.closest("input,textarea,select")) return; e.preventDefault(); setMenuOpen((m) => (m === it.id ? m : it.id)); } : undefined}
         {...longPress(!readOnly ? () => setMenuOpen(it.id) : null)}>
      <span style={{ display: "flex", alignItems: "center", gap: 4, ...(hasSub ? { cursor: "pointer" } : null) }}
            onClick={(e) => { if (e.target !== e.currentTarget) return; if (hasSub) toggle(it.id); else if (!readOnly) focusName(e); }}>
        {/* LEFT = hierarchy. A subtle disclosure chevron (same language as the NVR/Displays rows), shown only
            when the row expands into sub-items. A description is a one-line muted preview below the row, not a
            disclosure target, so a flat row (even one with a description) gets a spacer. */}
        {!parent && (hasSub ? (
          <button type="button" className="prop-chev" style={{ color: svcColor }} aria-expanded={!!open[it.id]}
                  title={open[it.id] ? "Collapse" : "Expand"} onClick={() => toggle(it.id)}>{open[it.id] ? "▾" : "▸"}</button>
        ) : <span className="prop-disc-sp" />)}
        {!parent && (lineRole(it) === "infrastructure"
          ? <InfraBadge color={svcColor} kind={infraKindOf((it.baseName && it.baseName !== "__custom__") ? it.baseName : it.name)} />
          : blockNumOf[it.id] ? <span className="prop-block-num" style={{ background: svcColor }}>{blockNumOf[it.id]}</span> : null)}
        {hasSub ? (
          editingId === it.id ? (
            <input value={it.name} disabled={readOnly} placeholder="Item" autoFocus
                   style={!parent && it.outdoor ? { color: "var(--dv-red,#C4553D)", fontWeight: 700 } : undefined}
                   onChange={(e) => patchItem(it.id, { name: e.target.value })}
                   onBlur={() => { setEditingId(null); writeCamName(); }}
                   onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setEditingId(null); writeCamName(); } }} />
          ) : (
            <>
              <span className="prop-item-nametext" title={readOnly ? undefined : "Double-click to rename"}
                    style={!parent && it.outdoor ? { color: "var(--dv-red,#C4553D)", fontWeight: 700 } : undefined}
                    onDoubleClick={() => { if (camName != null) startCamEdit(); else if (!readOnly) setEditingId(it.id); }}>{camName || it.name || "Item"}</span>
            </>
          )
        ) : (
          <ItemNameField
            value={it.name} disabled={readOnly} placeholder={parent ? "Sub-item" : "Item name"}
            autoFocus={!parent && it.id === focusNewId}
            style={{ ...(parent ? { marginLeft: 18 } : null), ...(!parent && it.outdoor ? { color: "var(--red)", fontWeight: 700 } : null) }}
            currentService={svc.key} allCatalog={allCatalog}
            onChange={(v) => (parent ? patchSub(parent.id, it.id, { name: v }) : patchItem(it.id, { name: v }))}
            onPick={(c) => (parent ? patchSub(parent.id, it.id, { name: c.name, price: c.price }) : patchItem(it.id, { name: c.name, price: c.price }))}
            onBlur={!parent ? () => { setFocusNewId((f) => (f === it.id ? null : f)); if (!String(it.name || "").trim() && !(+it.price)) removeItem(it.id); } : undefined}
          />
        )}
        {/* Condition badges (top-level) — customer-provided equipment / existing cable. Shown only when set;
            managed from the ••• Conditions submenu. Each maps to one signed acknowledgment at signing. */}
        {!parent && <CondBadges keys={lineConditions(it)} condMap={condMap} />}
        {/* Waived marker — compact, inline, in place (no separate waiver list). The price shows struck. */}
        {!parent && it.waived && <span className="prop-wvd" title="Waived — removed from this proposal's price">Waived</span>}
        {/* Customer read-only: a Placement link to the floor-plan map, and a pending-request chip. */}
        {customer && !parent && it.camera_id && hasLayout && onViewPlacement && (
          <button type="button" className="prop-place" title="See where this goes on your floor plan"
                  aria-label="View placement" onClick={(e) => { e.stopPropagation(); onViewPlacement(it.camera_id); }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Placement
          </button>
        )}
        {customer && !parent && reqFlags[it.id] && (
          <span className={`prop-reqflag ${reqFlags[it.id].type}`}>
            {reqFlags[it.id].type === "remove" ? "Removal requested" : "Change requested"}{reqFlags[it.id].note ? `: ${reqFlags[it.id].note}` : ""}
          </span>
        )}
        {/* No inline "+ Description" icon here — adding a description lives in the ••• menu (first item). An
            existing description still shows as a one-line preview below the row (tap to edit). */}
        {parent && /^line drop/i.test(it.name || "") && (
          readOnly
            ? (/existing/i.test(it.name || "") && <span className="prop-exist-tag" title="Existing cable — test &amp; map">Existing</span>)
            : <button type="button" className={`prop-exist-tog${/existing/i.test(it.name || "") ? " on" : ""}`}
                      title="Existing cable — test &amp; map only ($50) instead of a new Cat6 run ($150)"
                      onClick={() => toggleExisting(parent, it)}>Existing</button>
        )}
        {!parent && flags[it.id] && (
          <span className="prop-cflag-wrap">
            <span className={`prop-cflag ${flags[it.id].type}`} title={flags[it.id].note || (flags[it.id].type === "remove" ? "Customer requested removal" : "Customer requested a change")}>
              {flags[it.id].type === "remove" ? "⚑ Remove" : "⚑ Change"}{flags[it.id].note ? `: ${flags[it.id].note}` : ""}
            </span>
            {onResolveFlag && (
              <>
                <button className="prop-cflag-btn done" title="Mark this change done" onClick={() => onResolveFlag(it.id, "done")}>Done</button>
                <button className="prop-cflag-btn discard" title="Discard this request" onClick={() => onResolveFlag(it.id, "discard")}>Discard</button>
              </>
            )}
          </span>
        )}
      </span>
      {/* QTY + PRICE columns are folded into the single amount on the right. For a lead row they're part
          of the expand target; for a flat row they're blank space that drops focus into the name. */}
      {hasSub ? <span {...expandCell} /> : <span {...editCell} />}
      {hasSub ? <span {...expandCell} /> : <span {...editCell} />}
      {showCost && (hasSub ? <span {...expandCell} /> : (
        <input className="num" type="number" min="0" step="0.01" value={it.cost ?? 0} disabled={readOnly}
               title="Internal cost — never shown to sales or customers"
               onChange={(e) => patchItem(it.id, { cost: e.target.value })} />
      ))}
      {/* THE one money number. Lead row: a read-only TOTAL of the children — click it (or anywhere on the
          line) to expand; you edit the children, not the sum. Flat row: the single editable amount (= qty ×
          price; editing sets the price and keeps any quantity). Waived: struck, read-only. */}
      {hasSub ? (
        <span className="prop-line-total" {...expandCell}>
          {it.waived
            ? <s className="prop-waived-strike" title="Comped off the invoice — you still see the value waived">{money(itemTotal({ ...it, waived: false }))}</s>
            : money(itemTotal(it))}
        </span>
      ) : it.waived ? (
        <span className="prop-line-total"><s className="prop-waived-strike" title="Comped off the invoice — you still see the value waived">{money(itemTotal({ ...it, waived: false }))}</s></span>
      ) : readOnly ? (
        // Read-only (customer view / preview): show the formatted amount like every other row — NOT a bare,
        // disabled number input ("240") which reads as unformatted and visually breaks the line.
        <span className="prop-line-total">{money(itemTotal(it))}</span>
      ) : (
        <input className="num prop-line-amt" type="number" step="0.01" value={(+it.qty || 0) * (+it.price || 0)} disabled={readOnly}
               title="Price" aria-label="Price"
               onChange={(e) => { const total = +e.target.value || 0; const q = +it.qty || 1; patchItem(it.id, { price: q ? total / q : total }); }} />
      )}
      {!readOnly ? (
        <div className="prop-im-wrap">
          <button type="button" className="prop-item-menu" aria-label="Line item actions" title="Actions"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === it.id ? null : it.id); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
          </button>
          {menuOpen === it.id && (
            <ItemMenu
              isSub={!!parent}
              hasDesc={!parent && !!(it.desc && it.desc.trim())}
              conditions={!parent ? lineConditions(it) : []}
              conditionDefs={condDefs}
              onDuplicate={parent ? null : () => duplicateItem(it.id)}
              onDescribe={parent ? null : () => openDesc(it.id)}
              onToggleCondition={parent ? null : (key, on) => setCondition(it.id, key, on)}
              onApplyPeers={parent ? null : () => applyLineConditionsToPeers(it.id)}
              peerLabel={`Apply to all ${svc.key === "camera" ? "cameras" : "lines"}`}
              waived={!parent && canWaiveItem(it) ? manualOn(it) : undefined}
              onToggleWaive={!parent && canWaiveItem(it) ? () => setItemWaived(it.id, !manualOn(it)) : null}
              onRemove={() => (parent ? removeSub(parent.id, it.id) : removeItem(it.id))}
              removeLabel={`${camName || it.name || "Item"}${!parent ? ` · ${money(itemTotal(it))}` : ""}`}
              /* Equipment/Labor type — offered on ATOMIC top-level lines (custom/manual items); a container
                 bundle carries its type on its children, not the header. */
              itemType={(!parent && !(it.sub?.length)) ? itemTypeOf(it, svc.key) : undefined}
              onSetType={(!parent && !(it.sub?.length) && !readOnly) ? (t) => patchItem(it.id, { itemType: t }) : undefined}
              onClose={() => setMenuOpen(null)}
            />
          )}
        </div>
      ) : (customer && onRequestChange && !parent) ? (
        <div className="prop-im-wrap">
          <button type="button" className={`prop-reqpen${reqFlags[it.id] ? " on" : ""}`}
                  title={reqFlags[it.id] ? "Edit your request" : "Request a change to this item"}
                  aria-label={reqFlags[it.id] ? "Edit your request" : "Request a change to this item"}
                  onClick={(e) => { e.stopPropagation(); onRequestChange(it.id); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
        </div>
      ) : <span />}
      {/* Optional customer-facing description (top-level). Editor while editing; a muted one-line PREVIEW when
          it has text and is collapsed (tap to edit); nothing when empty (the "+ Description" is by the name). */}
      {!parent && (() => {
        const hasDesc = !!(it.desc && it.desc.trim());
        if (readOnly) return hasDesc ? <div className="prop-desc-row"><span className="prop-item-descro">{it.desc}</span></div> : null;
        if (descOpen.has(it.id)) return (
          <div className="prop-desc-row open">
            <input className="prop-item-desc" value={it.desc || ""} maxLength={600} autoFocus
                   placeholder="Customer description…" title="A short explanation the customer sees on the proposal — not the product name"
                   onChange={(e) => patchItem(it.id, { desc: e.target.value })}
                   onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); closeDesc(it.id); } }} />
            <DictateButton title="Dictate description" onText={(t) => patchItem(it.id, { desc: ((it.desc || "") + (it.desc && !/\s$/.test(it.desc) ? " " : "") + t).slice(0, 600) })} />
            <button type="button" className="prop-desc-done" title="Done" aria-label="Done" onClick={() => closeDesc(it.id)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </button>
          </div>
        );
        return hasDesc ? (
          <div className="prop-desc-row">
            <button type="button" className="prop-item-descro prop-desc-preview" title="Edit description" onClick={() => openDesc(it.id)}>{it.desc}</button>
          </div>
        ) : null;
      })()}
      {parent && bulkPrompt?.subId === it.id && (
        <BulkPrompt b={bulkPrompt} optionCount={optionCount} onApply={applyBulk} onClose={() => setBulkPrompt(null)} />
      )}
    </div>
    );
  };

  // Compact, responsive sub-item (bundle component). Default = name … amount (a qty>1 reads as "N × $unit"
  // under the name). Tap/click to inline-edit (one at a time): name + qty × price, the Existing-cable
  // toggle for a Line Drop, Done, and Remove. A blank (just-added) sub opens straight into edit. Same
  // component on desktop and mobile — no per-breakpoint logic. Bulk-propagate + price book autocomplete
  // are preserved in edit mode.
  const subRow = (x, parent, idx = 0) => {
    const q = +x.qty || 1;
    const amount = (+x.qty || 0) * (+x.price || 0);
    const isDrop = /^line drop/i.test(x.name || "");
    const isExisting = /existing/i.test(x.name || "");
    const editing = !readOnly && (subEditId === x.id || !String(x.name || "").trim());
    const letter = String.fromCharCode(65 + (idx % 26));   // A, B, C… local to this parent (decorative)
    const conds = lineConditions(x);
    const canWaive = canWaiveItem(x);
    const condBadges = <CondBadges keys={conds} condMap={condMap} />;
    const waivedMark = x.waived ? <span className="prop-wvd" title="Waived — comped off this block's price">Waived</span> : null;
    const amtDisplay = x.waived
      ? <s className="prop-waived-strike" title="Comped off this block's price — the value stays visible">{money(amount)}</s>
      : money(amount);
    // ••• menu for a component — the same control the top-level rows use (reused ItemMenu): Duplicate ·
    // Remove · Conditions (CX supplied / Existing cable) · Waive. No Done — editing commits on blur / Enter.
    const subMenu = !readOnly && (
      <div className="prop-im-wrap">
        <button type="button" className="prop-item-menu" aria-label="Component actions" title="Actions"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === x.id ? null : x.id); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
        </button>
        {menuOpen === x.id && (
          <ItemMenu isSub conditions={conds} conditionDefs={condDefs}
            onDuplicate={() => duplicateSub(parent.id, x.id)}
            onToggleCondition={(key, on) => setSubCondition(parent.id, x.id, key, on)}
            waived={canWaive ? manualOn(x) : undefined}
            onToggleWaive={canWaive ? () => setSubWaived(parent.id, x.id, !manualOn(x)) : null}
            onRemove={() => removeSub(parent.id, x.id)}
            removeLabel={`${x.name || "Component"} · ${money(amount)}`}
            onClose={() => setMenuOpen(null)} />
        )}
      </div>
    );
    return (
      <div key={x.id} className={`prop-sub2-wrap${idx % 2 ? " alt" : ""}`} style={bulkPrompt?.subId === x.id ? { position: "relative", zIndex: 5 } : undefined}>
        {editing ? (
          <div className="prop-sub2 editing"
               onBlur={(e) => { const box = e.currentTarget; setTimeout(() => { if (box && !box.contains(document.activeElement) && menuOpen !== x.id && subEditId === x.id) setSubEditId(null); }, 0); }}>
            <span className="prop-sub2-badge" aria-hidden="true">{letter}</span>
            <ItemNameField value={x.name} disabled={readOnly} placeholder="Sub-item" currentService={svc.key} allCatalog={allCatalog}
              autoFocus
              onChange={(v) => patchSub(parent.id, x.id, { name: v })}
              onPick={(c) => patchSub(parent.id, x.id, { name: c.name, price: c.price })} />
            {condBadges}
            {waivedMark}
            {isDrop && <button type="button" className={`prop-exist-tog${isExisting ? " on" : ""}`} title="Existing cable — test &amp; map only ($50) instead of a new Cat6 run ($150)" onClick={() => toggleExisting(parent, x)}>Existing</button>}
            {/* ONE editable number — the component's amount (qty × price). Editing sets the price and keeps
                any quantity; use Duplicate for more of the same. A waived component shows struck (comped). */}
            {x.waived ? (
              <span className="prop-sub2-amt prop-sub2-amt-edit">{amtDisplay}</span>
            ) : (
              <input className="num prop-sub2-amt prop-sub2-amt-edit" type="number" step="0.01" value={amount} disabled={readOnly} title="Price" aria-label="Price"
                onFocus={(e) => { preEdit.current[`${x.id}_price`] = x.price; e.currentTarget.select(); }} onBlur={() => maybeBulk(parent, x, "price")}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); setSubEditId(null); } }}
                onChange={(e) => { const total = +e.target.value || 0; patchSub(parent.id, x.id, { price: q ? total / q : total }); }} />
            )}
            {showCost && <input className="num prop-sub2-cost" type="number" min="0" step="0.01" value={x.cost ?? 0} title="Internal cost — never shown to sales or customers"
              onChange={(e) => patchSub(parent.id, x.id, { cost: e.target.value })} />}
            {subMenu}
          </div>
        ) : (
          <div className={`prop-sub2 compact${x.waived ? " waived" : ""}`}
               onContextMenu={!readOnly ? (e) => { e.preventDefault(); setMenuOpen((m) => (m === x.id ? m : x.id)); } : undefined}
               {...longPress(!readOnly ? () => setMenuOpen(x.id) : null)}>
            <button type="button" className="prop-sub2-hit" onClick={() => { if (!readOnly) setSubEditId(x.id); }} title={readOnly ? undefined : "Edit"} aria-label={`Component ${letter}: ${x.name || "Component"}`}>
              <span className="prop-sub2-badge" aria-hidden="true">{letter}</span>
              <span className="prop-sub2-name">{x.name || "Sub-item"}{isExisting && <span className="prop-sub2-tag">existing</span>}</span>
              {condBadges}
              {waivedMark}
              {q > 1 && !x.waived && <span className="prop-sub2-math">{q} × {money(x.price)}</span>}
              <span className="prop-sub2-amt">{amtDisplay}</span>
            </button>
            {subMenu}
          </div>
        )}
        {bulkPrompt?.subId === x.id && (
          <BulkPrompt b={bulkPrompt} optionCount={optionCount} onApply={applyBulk} onClose={() => setBulkPrompt(null)} />
        )}
      </div>
    );
  };

  return (
    <div className={`prop-svc${svcDrag?.over ? " svc-over" : ""}${crossItem ? " svc-item-target" : ""}`}
         onDragOver={(svcDrag?.dragging || crossItem) ? (e) => { e.preventDefault(); if (svcDrag?.dragging) svcDrag.onDragOver(); } : undefined}
         onDrop={(svcDrag?.dragging || crossItem) ? (e) => { e.preventDefault(); if (crossItem) itemDrag.onDrop(null); else svcDrag.onDrop(); } : undefined}>
      <div className="prop-svc-head">
        {svcDrag && (
          <span className="prop-svc-drag" draggable title="Drag to reorder"
                onDragStart={(e) => { svcDrag.onHandleDragStart(); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", "svc"); } catch {} }}
                onDragEnd={() => svcDrag.onHandleDragEnd()}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>
          </span>
        )}
        {renamingSvc && !readOnly ? (
          <input className="prop-svc-name-in" value={svcDraft} autoFocus maxLength={60}
                 onChange={(e) => setSvcDraft(e.target.value)}
                 onBlur={() => { const v = svcDraft.trim(); if (v && v !== svc.label) onChange({ ...svc, label: v }); setRenamingSvc(false); }}
                 onKeyDown={(e) => { if (e.key === "Enter") { const v = svcDraft.trim(); if (v && v !== svc.label) onChange({ ...svc, label: v }); setRenamingSvc(false); } else if (e.key === "Escape") setRenamingSvc(false); }} />
        ) : (
          <span className="prop-svc-name" title={readOnly ? undefined : "Double-click to rename"}
                onDoubleClick={() => { if (!readOnly) { setSvcDraft(svc.label); setRenamingSvc(true); } }}>
            {svc.label}
            {svc.key === "camera" && camCount > 0 && <span className="prop-svc-count"> · {camCount} camera{camCount !== 1 ? "s" : ""}</span>}
          </span>
        )}
        <span className="prop-svc-sp" />
        {!readOnly && (
          <div className="prop-svc-gearwrap">
            <button type="button" className="prop-svc-gear" title="Service settings — pricing, presets, remove"
                    aria-label="Service settings" onClick={(e) => { e.stopPropagation(); setSvcMenuOpen((o) => !o); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            {svcMenuOpen && (
              <SvcHeadMenu
                onPricing={() => onOpenPricing && onOpenPricing(svc.key)}
                onWaiveItems={svcWaivable.length ? () => setWaiveBatchOpen(true) : null}
                waivedCount={svcWaivedCount}
                surveyImport={surveyImport}
                onRemove={onRemove}
                onClose={() => setSvcMenuOpen(false)}
              />
            )}
          </div>
        )}
        {headerRight}
      </div>


      {/* NVR capacity warning: more cameras than the selected NVR's channels */}
      {svc.key === "camera" && overCapacity && !warnDismissed && !readOnly && (
        <div className="prop-nvr-warn">
          <span className="prop-nvr-warn-msg">
            ⚠ {camCount} cameras exceed the {nvrShort(nvrItem.name)} NVR ({chFor(nvrItem.name)} channels).
          </span>
          <button className="prop-nvr-up" onClick={upgradeNvr}>Upgrade to {nvrShort(recNvr)}</button>
          <button className="prop-nvr-cancel" onClick={() => setWarnDismissed(true)}>Cancel</button>
        </div>
      )}

      {/* Column captions. Each line now carries a single amount in the Total column (qty/price are folded
          into it), so the only captions are Item and Total — Qty/Price captions over empty columns would
          be noise. Presentation only; the rows themselves are unchanged. */}
      {svc.items.length > 0 && (
        <div className={`prop-cols${gridClass}`}>
          <span>Item</span><span /><span />
          {showCost && <span className="r">Cost</span>}
          <span className="r hcell-lt">Total</span><span />
        </div>
      )}

      {/* Collapsed recording-system lines (NVR, Displays) — numbered, expandable via Edit */}
      {leadRows.map((lr) => {
        // Customer view opens with every group COLLAPSED for a clean first look (open only what they tap);
        // staff keep the breakdown open by default for editing. `leadOpen` stores an explicit true/false.
        const isOpen = customer ? leadOpen[lr.key] === true : leadOpen[lr.key] !== false;
        // Parent menu holds ONLY true parent actions: Edit (amp still uses its form) or Remove the group.
        const removeGroup = lr.key === "nvr" ? (nvrItem ? () => applyNvr("") : null)
          : lr.key === "disp" ? () => patchItems(svc.items.filter((it) => it.displaySlot == null))
          : lr.key === "amp" ? (ampItem ? () => pickAmp("") : null)
          : null;
        const hasMenu = !readOnly && !!removeGroup;
        return (
        <div key={lr.key} className={`prop-block prop-lead${!readOnly ? " has-drag" : ""}`}>
          <div className="prop-sysline">
            {lr.items?.length > 0 ? (
              <button className="prop-chev" style={{ color: svcColor }} title={isOpen ? "Hide breakdown" : "Show breakdown"}
                      onClick={() => setLeadOpen((o) => ({ ...o, [lr.key]: !isOpen }))}>{isOpen ? "▾" : "▸"}</button>
            ) : <span style={{ width: 16, flexShrink: 0 }} />}
            <InfraBadge color={svcColor} kind={infraKindOf(lr.key === "disp" ? "display" : lr.key)} />
            <span className="prop-sysline-name">{lr.title}</span>
            {/* CLOSED tells you what's inside — a muted scan-summary built from the children; hidden once
                expanded (the exact rows below are the detail, now inline-editable). */}
            {lr.summary && !isOpen && <span className="prop-sysline-sum">{lr.summary}</span>}
            <span className="prop-sysline-total">{money(lr.total)}</span>
            {hasMenu ? (
              <div className="prop-im-wrap prop-sysline-menu">
                <button type="button" className="prop-item-menu" aria-label={`${lr.title} actions`} title="Actions"
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === `sys-${lr.key}` ? null : `sys-${lr.key}`); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
                </button>
                {menuOpen === `sys-${lr.key}` && <SysRowMenu onRemove={removeGroup} removeLabel={lr.key === "nvr" ? "Remove NVR" : lr.key === "amp" ? "Remove amp" : "Remove displays"} onClose={() => setMenuOpen(null)} />}
              </div>
            ) : <span className="prop-im-sp" aria-hidden="true" />}
          </div>
          {/* Inline-editable children — ONE grammar with the camera bundle: click a child → that row becomes
              a compact selector (recorder / drive / display). No separate Edit mode, no form takeover. Amp
              children stay display-only (amp keeps its own form for now). */}
          {isOpen && lr.items?.length > 0 && lr.items.map((bi, bidx) => {
            const letter = String.fromCharCode(65 + (bidx % 26));
            const editing = !readOnly && (bi.placeholder || (bi.ref && leadEditId === bi.ref.id));
            const setField = (p) => {
              if (bi.kind === "nvr") setNvrField(p);
              else if (bi.kind === "drive") setSlotField(bi.slot, p);
              else if (bi.kind === "display") setDisplayField(bi.slot, p);
              else if (bi.kind === "amp") setAmpField(1, p);
              else if (bi.kind === "rack") setAmpField(2, p);
            };
            const removable = bi.kind === "drive" || bi.kind === "display" || bi.kind === "rack";   // not the recorder/amp
            const removeChild = () => { if (bi.kind === "drive") setSlotDrive(bi.slot, ""); else if (bi.kind === "display") setSlotDisplay(bi.slot, ""); else if (bi.kind === "rack") setRack(false); setLeadEditId(null); };
            // ••• menu — the SAME control + grammar the camera components use (Waive / Remove), shown in both
            // the compact row and edit mode (no more ✓/🗑 bar), so a grouped child is built just like a sub-item.
            const canW = bi.ref && canWaiveItem(bi.ref);
            const childMenu = (!readOnly && bi.ref && (canW || removable)) ? (
              <div className="prop-im-wrap">
                <button type="button" className="prop-item-menu" aria-label={`${bi.name} actions`} title="Actions"
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === `child-${bi.ref.id}` ? null : `child-${bi.ref.id}`); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
                </button>
                {menuOpen === `child-${bi.ref.id}` && (
                  <ItemMenu isSub
                    conditions={lineConditions(bi.ref)}
                    conditionDefs={condDefs}
                    onToggleCondition={(key, on) => setCondition(bi.ref.id, key, on)}
                    waived={canW ? manualOn(bi.ref) : undefined}
                    onToggleWaive={canW ? () => setItemWaived(bi.ref.id, !manualOn(bi.ref)) : null}
                    onRemove={removable ? removeChild : undefined}
                    removeLabel={`${bi.name}${bi.total ? ` · ${money(bi.total)}` : ""}`}
                    onClose={() => setMenuOpen(null)} />
                )}
              </div>
            ) : null;
            return (
              <div key={bi.ref?.id || `${lr.key}-${bidx}`} className={`prop-sub2-wrap${bidx % 2 ? " alt" : ""}`}>
                {editing ? (
                  <div className="prop-sub2 editing"
                       onBlur={(e) => { const box = e.currentTarget; const id = bi.ref?.id; setTimeout(() => { if (box && id && !box.contains(document.activeElement) && menuOpen !== `child-${id}` && leadEditId === id) setLeadEditId(null); }, 0); }}>
                    <span className="prop-sub2-badge" aria-hidden="true">{letter}</span>
                    {leadSelect(bi)}
                    {bi.ref?.baseName === "__custom__" && (
                      <input className="num prop-sub2-cname" type="text" placeholder="Custom display…" value={bi.ref.name} disabled={readOnly}
                             title="Custom display name" onChange={(e) => setDisplayField(bi.slot, { name: e.target.value })} />
                    )}
                    {/* ONE editable amount (= qty × price; editing sets the price), matching the camera
                        components — no separate price box + read-only total. A waived child shows struck. */}
                    {bi.ref && (bi.ref.waived
                      ? <span className="prop-sub2-amt prop-sub2-amt-edit"><s className="prop-waived-strike" title="Comped off this block's price">{money(itemTotal({ ...bi.ref, waived: false }))}</s></span>
                      : <input className="num prop-sub2-amt prop-sub2-amt-edit" type="number" min="0" step="0.01" value={bi.total} disabled={readOnly} title="Price" aria-label="Price"
                               onChange={(e) => { const t = +e.target.value || 0; const q = +bi.qty || 1; setField({ price: q ? t / q : t }); }} />)}
                    {bi.ref && showCost && (
                      <input className="num prop-sub2-cost" type="number" min="0" step="0.01" value={bi.ref.cost ?? 0} disabled={readOnly} title="Internal cost"
                             onChange={(e) => setField({ cost: e.target.value })} />
                    )}
                    {childMenu}
                  </div>
                ) : (
                  <div className={`prop-sub2 compact${bi.ref?.waived ? " waived" : ""}`}>
                    <button type="button" className="prop-sub2-hit" disabled={readOnly} title={readOnly ? undefined : "Edit"}
                            aria-label={`${letter}: ${bi.name}${bi.ref?.waived ? " (waived)" : ""}`} onClick={() => { if (!readOnly && bi.ref) setLeadEditId(bi.ref.id); }}>
                      <span className="prop-sub2-badge" aria-hidden="true">{letter}</span>
                      <span className="prop-sub2-name">{bi.name}</span>
                      {bi.ref && <CondBadges keys={lineConditions(bi.ref)} condMap={condMap} />}
                      {bi.ref?.waived && <span className="prop-wvd">Waived</span>}
                      {(+bi.qty || 1) > 1 && !bi.ref?.waived && <span className="prop-sub2-math">{bi.qty} × {money(bi.price)}</span>}
                      <span className="prop-sub2-amt">{bi.ref?.waived ? <s className="prop-waived-strike">{money(itemTotal({ ...bi.ref, waived: false }))}</s> : money(bi.total)}</span>
                    </button>
                    {childMenu}
                  </div>
                )}
              </div>
            );
          })}
          {/* Contextual add — component-specific wording, capacity-aware (hidden when no bay/slot is free).
              A multi-option add (drive size / display type) opens a center-screen picker; a single add-on
              (Rack & Mount) is added directly. */}
          {isOpen && !readOnly && lr.add && (
            <div className="prop-subadd">
              <button type="button" className="prop-subadd-btn" aria-haspopup={lr.add.pick ? "dialog" : undefined}
                      onClick={() => (lr.add.pick ? setPick({ kind: lr.add.pick }) : lr.add.onClick?.())}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {lr.add.label.replace(/^\+\s*/, "")}
              </button>
            </div>
          )}
          {isOpen && lr.hint && <div className="prop-subadd"><span className="prop-subadd-note">{lr.hint}</span></div>}
        </div>
        );
      })}
      {/* NVR downgrade conflict — never drop drives silently (#7). */}
      {nvrConflict && (
        <div className="prop-conflict-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setNvrConflict(null); }}>
          <div className="prop-conflict" role="dialog" aria-modal="true" aria-label="NVR drive conflict">
            <b className="prop-conflict-t">This NVR supports {nvrConflict.slots} drive{nvrConflict.slots === 1 ? "" : "s"}</b>
            <span className="prop-conflict-m">Switching will remove {nvrConflict.remove} drive{nvrConflict.remove === 1 ? "" : "s"} from the extra bays.</span>
            <div className="prop-conflict-acts">
              <button type="button" className="prop-conflict-cancel" onClick={() => setNvrConflict(null)}>Cancel</button>
              <button type="button" className="prop-conflict-go" onClick={() => { applyNvr(nvrConflict.name); setNvrConflict(null); }}>Remove {nvrConflict.remove} &amp; switch</button>
            </div>
          </div>
        </div>
      )}
      {/* Center-screen add picker — pick the drive SIZE / display TYPE before adding (no assumed default).
          Prices are the LIVE service-pricing (price-book) values, so the picker matches the config exactly. */}
      {pick && (
        <div className="prop-conflict-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setPick(null); }}>
          <div className="prop-pickm" role="dialog" aria-modal="true" aria-label={pick.kind === "drive" ? "Add hard drive" : "Add display"}>
            <div className="prop-pickm-head">
              <b>{pick.kind === "drive" ? "Add hard drive" : "Add display"}</b>
              <button type="button" className="prop-pickm-x" aria-label="Close" onClick={() => setPick(null)}>×</button>
            </div>
            <div className="prop-pickm-list">
              {pick.kind === "drive"
                ? driveOptions.map((d) => (
                    <button key={d.name} type="button" className="prop-pickm-opt" onClick={() => addDrive(d.name)}>
                      <span>{d.name.replace(/ Storage Drive$/, "")}</span><span className="prop-pickm-price">{money(d.price)}</span>
                    </button>
                  ))
                : (<>
                    {displayOptions.map((x) => (
                      <button key={x.baseName} type="button" className="prop-pickm-opt" onClick={() => addDisplay(x.baseName)}>
                        <span>{x.name}</span><span className="prop-pickm-price">{money(x.price)}</span>
                      </button>
                    ))}
                    <button type="button" className="prop-pickm-opt" onClick={() => addDisplay("__custom__")}>
                      <span>Custom…</span><span className="prop-pickm-price" />
                    </button>
                  </>)}
            </div>
          </div>
        </div>
      )}

      {visibleItems.map((it, idx) => (
        <div key={it.id}
             className={`prop-block${!readOnly ? " has-drag" : ""}${idx % 2 ? " alt" : ""}${open[it.id] && (it.sub || []).length ? " prop-open" : ""}${it.outdoor ? " prop-outdoor" : ""}${it.waived ? " prop-waived" : ""}${dragId === it.id ? " prop-dragging" : ""}${overId === it.id && (dragId || crossItem) && dragId !== it.id ? " prop-dragover" : ""}`}
             style={{ "--svc-color": svcColor }} title={it.outdoor ? "Outdoor placement" : undefined}
             onDragOver={!readOnly && (dragId || crossItem) ? (e) => { e.preventDefault(); if (overId !== it.id) setOverId(it.id); } : undefined}
             onDrop={!readOnly && (dragId || crossItem) ? (e) => { e.preventDefault(); e.stopPropagation(); if (crossItem) itemDrag.onDrop(it.id); else moveItem(dragId, it.id); setDragId(null); setOverId(null); } : undefined}>
          {!readOnly && (
            <span className="prop-drag-handle" draggable title="Drag to reorder"
                  onDragStart={(e) => { setDragId(it.id); itemDrag?.onStart(it.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", it.id); } catch {} }}
                  onDragEnd={() => { setDragId(null); setOverId(null); itemDrag?.onEnd(); }}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
            </span>
          )}
          {row(it, null)}
          {open[it.id] && (it.sub || []).map((x, i) => subRow(x, it, i))}
          {open[it.id] && !readOnly && (
            <div className="prop-subadd">
              <button type="button" className="prop-subadd-btn" onClick={() => addSub(it.id)}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Component
              </button>
            </div>
          )}
        </div>
      ))}

      {!readOnly && (
        <div className="prop-addbar">
          {/* ONE quick-add row: preset bundles (one click each) then + Item. No Catalog select — browsing
              the internal price catalog to build a line is gone; the catalog lives in the Configuration
              Center. + Item makes a blank row and drops you straight into typing its name. */}
          <div className="prop-preset-row">
            {presets.map((p) => (
              <button key={p.id} className="prop-preset-chip" style={{ background: svcColor }} title={`Add bundle: ${p.name}`} onClick={() => clickPreset(p)}>+ {p.name}</button>
            ))}
            {askCam && (
              <span className="prop-camask">
                How many cameras?
                <input type="number" min="1" max="64" value={camN} autoFocus
                       onChange={(e) => setCamN(e.target.value)}
                       onKeyDown={(e) => { if (e.key === "Enter") { addPresetBlock(askCam, camN); setAskCam(null); } else if (e.key === "Escape") setAskCam(null); }} />
                <button type="button" className="prop-camask-go" onClick={() => { addPresetBlock(askCam, camN); setAskCam(null); }}>Add</button>
                <button type="button" className="prop-camask-x" onClick={() => setAskCam(null)}>Cancel</button>
              </span>
            )}
            <button type="button" className="prop-mini prop-additem" onClick={() => addItem()}>+ Item</button>
          </div>
        </div>
      )}

      {svc.note && <div className="prop-svc-note">{svc.note}</div>}

      {waiveBatchOpen && (
        <WaiveBatchModal svcLabel={svc.label} items={svcWaivable}
          onToggle={setItemWaived} onWaiveAll={waiveAllInSvc} onClose={() => setWaiveBatchOpen(false)} />
      )}
    </div>
  );
}

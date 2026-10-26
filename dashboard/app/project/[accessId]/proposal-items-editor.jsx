"use client";
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { PROPOSAL_CATALOG, newItemId, svcSubtotal, itemTotal, priceOf, displayNameOf, serviceColor, effectiveCatalog, allCatalogEntries, loadPriceBook, presetsForService, makePresetBlock, lineRole, infraKindOf, nvrSummary, dispSummary } from "../../../lib/proposal";
import { skipOutsideClose } from "../../../lib/outside-click";
import { bulkSubMatches, applyBulkSub, subKey, numEq } from "../../../lib/proposal-bulk";
import { LINE_CONDITIONS, LINE_CONDITION, lineConditions } from "../../../lib/proposal-terms";

const capFirst = (s) => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

// Name field for a line item or sub-item: auto-capitalizes the first letter as you type,
// and shows a type-ahead of matching catalog entries across every service — entries from
// the service currently being edited sort first, so "cat" while adding to Toast surfaces
// Toast's own "Cat6 Drop" before camera's or wiring's identical-priced entry.
function ItemNameField({ value, onChange, onPick, currentService, allCatalog, disabled, placeholder, style }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e) { if (skipOutsideClose(e)) return; if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

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
      <input value={value} disabled={disabled} placeholder={placeholder} style={style}
             onChange={handleChange} onFocus={() => setOpen(true)} />
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

// Dark / inverted equipment badge (gold glyph) that sits where the number badge would — the one visual cue that
// a line is infrastructure, not a numbered endpoint. Same footprint as .prop-block-num.
function InfraBadge({ kind = "generic" }) {
  const P = {
    nvr: <><rect x="3" y="4.5" width="18" height="6" rx="1.3"/><rect x="3" y="13.5" width="18" height="6" rx="1.3"/><circle cx="6.5" cy="7.5" r=".9" fill="currentColor" stroke="none"/><circle cx="6.5" cy="16.5" r=".9" fill="currentColor" stroke="none"/></>,
    display: <><rect x="3" y="4.5" width="18" height="11" rx="1.3"/><line x1="9" y1="19.5" x2="15" y2="19.5"/><line x1="12" y1="15.5" x2="12" y2="19.5"/></>,
    amp: <><rect x="3" y="5" width="18" height="14" rx="1.3"/><circle cx="9" cy="12" r="3"/><circle cx="16.5" cy="9" r=".9" fill="currentColor" stroke="none"/><circle cx="16.5" cy="12.5" r=".9" fill="currentColor" stroke="none"/></>,
    switch: <><rect x="2.5" y="8.5" width="19" height="7" rx="1.3"/><line x1="6.5" y1="12" x2="6.5" y2="12"/><line x1="10.5" y1="12" x2="10.5" y2="12"/><line x1="14.5" y1="12" x2="14.5" y2="12"/><line x1="18" y1="12" x2="18" y2="12"/></>,
    panel: <><rect x="5" y="2.5" width="14" height="19" rx="2"/><line x1="8.5" y1="6.5" x2="15.5" y2="6.5"/><circle cx="12" cy="14" r="3"/></>,
    generic: <><rect x="4.5" y="4.5" width="15" height="15" rx="2"/></>,
  };
  return (
    <span className="prop-infra-badge" title="Infrastructure">
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
function ItemMenu({ isSub = false, hasDesc = false, conditions = [], onDuplicate, onDescribe, onToggleCondition, onApplyPeers, peerLabel, onRemove, removeLabel, onClose }) {
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
          {!isSub && onDuplicate && <button type="button" className="prop-im-item" role="menuitem" onClick={() => { onDuplicate(); onClose(); }}>Duplicate</button>}
          {!isSub && onDescribe && <button type="button" className="prop-im-item" role="menuitem" onClick={() => { onDescribe(); onClose(); }}>{hasDesc ? "Edit description" : "Add description"}</button>}
          {!isSub && onToggleCondition && (
            <>
              <div className="prop-im-sep" />
              <div className="prop-im-grouplbl">Conditions</div>
              {LINE_CONDITIONS.map((c) => {
                const on = conditions.includes(c.key);
                return (
                  <button key={c.key} type="button" className={`prop-im-item prop-im-cond${on ? " on" : ""}`} role="menuitemcheckbox" aria-checked={on}
                          title={c.note} onClick={() => onToggleCondition(c.key, !on)}>
                    <span className={`prop-im-cdot ${c.tone}`} aria-hidden="true" />
                    <span className="prop-im-cname">{c.badge}</span>
                    {on && <svg className="prop-im-ck" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>}
                  </button>
                );
              })}
              {onApplyPeers && conditions.length > 0 && (
                <button type="button" className="prop-im-item prop-im-apply" role="menuitem" onClick={() => { onApplyPeers(); onClose(); }}>{peerLabel || "Apply to all"}</button>
              )}
            </>
          )}
          {!isSub && <div className="prop-im-sep" />}
          <button type="button" className="prop-im-item danger" role="menuitem" onClick={() => setConfirming(true)}>Remove</button>
        </>
      )}
    </div>
  );
}
// Action menu for a collapsed system row (NVR / Displays / Amp) — same ••• control the line items use, so
// every row reads the same. Its one action opens that system's slot editor.
function SysRowMenu({ onEdit, onClose }) {
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
      <button type="button" className="prop-im-item" role="menuitem" onClick={() => { onEdit(); onClose(); }}>Edit</button>
    </div>
  );
}
// Service-header gear menu (replaces the old remove-service ✕): this service's pricing & presets, plus the
// (destructive) remove-service at the bottom.
function SvcHeadMenu({ onPricing, onRemove, onClose }) {
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
          <div className="prop-im-sep" />
          <button type="button" className="prop-im-item danger" role="menuitem" onClick={() => setConfirming(true)}>Remove service</button>
        </>
      )}
    </div>
  );
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

export default function ProposalItemsEditor({ svc, showCost, readOnly, onChange, onRemove, onOpenPricing, priceBookVersion, customerFlags, onResolveFlag, cameraNames, onCameraRename, svcDrag, itemDrag, payload, activeOptId, optionCount = 1, onBulkApply }) {
  const flags = customerFlags || {};
  // Smart bulk-update: when a repeated SUB-ITEM value (price/qty) is committed, offer to propagate it to the
  // other matching sub-items that still hold the OLD value. `preEdit` snapshots the value at focus so we can
  // tell what changed; `bulkPrompt` drives the anchored confirm. Both reset when the prompt closes.
  const preEdit = useRef({});                 // { [subId_field]: oldValue } captured onFocus
  const [bulkPrompt, setBulkPrompt] = useState(null);  // { parentId, subId, field, name, oldValue, newValue, cur:[], all:[] }
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
  const [open, setOpen] = useState({});   // parent item id -> expanded
  const [editingId, setEditingId] = useState(null);   // camera/block name shown as text; dbl-click to edit
  const [leadOpen, setLeadOpen] = useState({});   // collapsed NVR/Displays/Amp group -> children; open by default, false = user collapsed it
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
  // Camera recording system: NVR (+drives) and Displays each collapse to a compact, expandable
  // summary line via a "Done" button. Start collapsed when already configured (cleaner reopen).
  const [nvrDone, setNvrDone] = useState(() => (svc.items || []).some((it) => !it.sub && /^NVR/.test(it.name || "")));
  const [dispDone, setDispDone] = useState(() => (svc.items || []).some((it) => it.displaySlot != null));
  const [ampDone, setAmpDone] = useState(() => (svc.items || []).some((it) => it.ampSlot === 1));
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

  function pickNvr(e) {
    const name = e.target.value;
    let items;
    if (!name) {
      // No NVR — drives have nowhere to mount, so every slotted drive goes too.
      items = svc.items.filter((it) => it !== nvrItem && it.slot == null);
    } else {
      const model = NVR_MODELS.find((m) => m.name === name);
      items = nvrItem
        ? svc.items.map((it) => (it === nvrItem ? { ...it, name: model.name, price: priceOf(model.name) } : it))
        : [...svc.items, { id: newItemId(), name: model.name, qty: 1, price: priceOf(model.name), cost: 0 }];
      // Downgrading drops any drive in a bay beyond the new NVR's slot count.
      const slots = slotsFor(model.name);
      items = items.filter((it) => it.slot == null || it.slot <= slots);
    }
    onChange({ ...svc, items });
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
  const inSysbar = (it) => (svc.key === "camera" && (it.slot != null || it.displaySlot != null || /^NVR/.test(it.name || ""))) || (svc.key === "sound" && it.ampSlot != null);
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
  function setCondition(id, key, on) {
    const it = svc.items.find((x) => x.id === id); if (!it || !LINE_CONDITION[key]) return;
    const cur = lineConditions(it);
    if (on === cur.includes(key)) return;
    patchItem(id, { conditions: on ? [...cur, key] : cur.filter((k) => k !== key) });
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
      return add.length ? { ...it, conditions: [...cur, ...add] } : it;
    }));
  }
  function addItem(name = "", price = 0) {
    patchItems([...svc.items, { id: newItemId(), name, qty: 1, price, cost: 0 }]);
  }
  // Preset bundles for this service (default "Full Camera Install" + any admin-added). One
  // click drops the whole bundle as a block (header + sub-items priced from the book).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const presets = presetsForService(svc.key, loadPriceBook());
  void priceBookVersion; // chips recompute when the Configuration Center saves presets (bumps priceBookVersion)
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
  function quickAdd(e) {
    const v = e.target.value;
    if (!v) return;
    const c = catalog[+v];
    if (c) addItem(c.name, c.price);
    e.target.value = "";
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
  const nvrCollapsed = camMode && nvrDone && !!nvrItem;
  const dispCollapsed = camMode && dispDone && displayItems.length > 0;
  const showNvrPickers = camMode && !nvrCollapsed;              // NVR select + HDD bays
  const showDispPickers = camMode && !!nvrItem && !dispCollapsed; // Display slots
  const showSysbar = camMode && (showNvrPickers || showDispPickers);
  // Collapsed recording-system lines that render as numbered items 1..leadCount above the cameras.
  const leadRows = [];
  if (nvrCollapsed) leadRows.push({ key: "nvr", title: `NVR · ${nvrShort(nvrItem.name)}`,
    summary: nvrSummary(nvrItem, driveItems),
    total: nvrGroupTotal, edit: () => setNvrDone(false),
    // Breakdown so the collapsed line isn't a mystery total — recorder + each drive, priced.
    // qty/price carried so these rows read exactly like a camera's sub-items (qty · price · total).
    items: [{ name: nvrItem.name, qty: +nvrItem.qty || 1, price: +nvrItem.price || 0, total: (+nvrItem.qty || 1) * (+nvrItem.price || 0) },
      ...driveItems.map((d) => ({ name: d.name || "Storage drive", qty: +d.qty || 1, price: +d.price || 0, total: (+d.qty || 1) * (+d.price || 0) }))] });
  if (dispCollapsed) leadRows.push({ key: "disp", title: displayItems.length === 1 ? "Display" : "Displays",
    summary: dispSummary(displayItems),
    total: displaysTotal, edit: () => setDispDone(false),
    // Each display slot + what it costs — so it's clear what's driving the total, not just a lump sum.
    items: displayItems.map((d) => ({ name: `Display ${d.displaySlot} · ${d.name || "—"}`, qty: +d.qty || 1, price: +d.price || 0, total: itemTotal(d) })) });
  const ampCollapsed = soundMode && ampDone && !!ampItem;
  if (ampCollapsed) leadRows.push({ key: "amp", title: `Amp · ${ampItem.name}`,
    total: itemTotal(ampItem) + (rackItem ? itemTotal(rackItem) : 0), edit: () => setAmpDone(false),
    items: [ampItem, ...(rackItem ? [rackItem] : [])].map((d) => ({ name: d.name, qty: +d.qty || 1, price: +d.price || 0, total: itemTotal(d) })) });
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
    // A camera line's label is the survey's location name (single source of truth). We DISPLAY the
    // survey name (camName) but edit it.name; entering edit mode seeds it.name from the survey name,
    // and on blur a camera line linked by camera_id writes the new name back to the survey (→ survey +
    // mockup stay in sync). camName resolves by camera_id only, so a line is never mislabeled.
    const camName = svc.key === "camera" && cameraNames ? cameraNames.get(it.id) : null;
    const startCamEdit = () => { if (readOnly) return; if (camName && camName !== it.name) patchItem(it.id, { name: camName }); setEditingId(it.id); };
    const writeCamName = () => { if (svc.key === "camera" && it.camera_id && onCameraRename) onCameraRename(it.camera_id, it.name); };  // survey write-back on rename
    return (
    <div key={it.id} className={`prop-item${gridClass}${parent ? " sub" : ""}${hasSub ? " prop-parent" : ""}${parent && subIdx % 2 ? " alt" : ""}`}
         style={parent && bulkPrompt?.subId === it.id ? { position: "relative", zIndex: 5 } : undefined}>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {/* LEFT = hierarchy. A subtle disclosure chevron (same language as the NVR/Displays rows), shown only
            when the row expands into sub-items. A description is a one-line muted preview below the row, not a
            disclosure target, so a flat row (even one with a description) gets a spacer. */}
        {!parent && (hasSub ? (
          <button type="button" className="prop-chev" style={{ color: svcColor }} aria-expanded={!!open[it.id]}
                  title={open[it.id] ? "Collapse" : "Expand"} onClick={() => toggle(it.id)}>{open[it.id] ? "▾" : "▸"}</button>
        ) : <span className="prop-disc-sp" />)}
        {!parent && (lineRole(it) === "infrastructure"
          ? <InfraBadge kind={infraKindOf((it.baseName && it.baseName !== "__custom__") ? it.baseName : it.name)} />
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
            value={it.name} disabled={readOnly} placeholder={parent ? "Sub-item" : "Item"}
            style={{ ...(parent ? { marginLeft: 18 } : null), ...(!parent && it.outdoor ? { color: "var(--red)", fontWeight: 700 } : null) }}
            currentService={svc.key} allCatalog={allCatalog}
            onChange={(v) => (parent ? patchSub(parent.id, it.id, { name: v }) : patchItem(it.id, { name: v }))}
            onPick={(c) => (parent ? patchSub(parent.id, it.id, { name: c.name, price: c.price }) : patchItem(it.id, { name: c.name, price: c.price }))}
          />
        )}
        {/* Condition badges (top-level) — customer-provided equipment / existing cable. Shown only when set;
            managed from the ••• Conditions submenu. Each maps to one signed acknowledgment at signing. */}
        {!parent && lineConditions(it).map((k) => (
          <span key={k} className={`prop-cond ${LINE_CONDITION[k].tone}`} title={LINE_CONDITION[k].note}>{LINE_CONDITION[k].badge}</span>
        ))}
        {/* Description toggle (top-level, editable) — a speech bubble with a + (add) that becomes a − once the
            description is showing (remove). Replaces the old rename pencil; rename is double-click on the name. */}
        {/* MIDDLE: a lightweight "+ Description" after the name (only when there's no description yet and the
            editor isn't open). An existing description shows as a preview below the row; the ••• menu can also
            open the editor. */}
        {!parent && !readOnly && !(it.desc && it.desc.trim()) && !descOpen.has(it.id) && (
          <button type="button" className="prop-desc-add2" title="Add a description" aria-label="Add description" onClick={() => openDesc(it.id)}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><line x1="9" y1="10" x2="15" y2="10" /><line x1="12" y1="7" x2="12" y2="13" /></svg>
          </button>
        )}
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
      {hasSub ? <span /> : (
        <input className="num" type="number" min="0" value={it.qty} disabled={readOnly}
               onFocus={parent ? () => { preEdit.current[`${it.id}_qty`] = it.qty; } : undefined}
               onBlur={parent ? () => maybeBulk(parent, it, "qty") : undefined}
               onKeyDown={parent ? (e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } } : undefined}
               onChange={(e) => (parent ? patchSub(parent.id, it.id, { qty: e.target.value }) : patchItem(it.id, { qty: e.target.value }))} />
      )}
      {hasSub ? <span /> : (
        <input className="num" type="number" step="0.01" value={it.price} disabled={readOnly}
               onFocus={parent ? () => { preEdit.current[`${it.id}_price`] = it.price; } : undefined}
               onBlur={parent ? () => maybeBulk(parent, it, "price") : undefined}
               onKeyDown={parent ? (e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } } : undefined}
               onChange={(e) => (parent ? patchSub(parent.id, it.id, { price: e.target.value }) : patchItem(it.id, { price: e.target.value }))} />
      )}
      {showCost && (hasSub ? <span /> : (
        <input className="num" type="number" min="0" step="0.01" value={it.cost ?? 0} disabled={readOnly}
               title="Internal cost — never shown to sales or customers"
               onChange={(e) => (parent ? patchSub(parent.id, it.id, { cost: e.target.value }) : patchItem(it.id, { cost: e.target.value }))} />
      ))}
      {/* RIGHT = money, then actions. The price is calm — no expand/delete controls beside it (expand is the
          left chevron; delete lives in •••). */}
      {(() => {
        const priceEl = (!parent && it.waived)
          ? <s className="prop-waived-strike" title="Comped off the invoice — you still see the value waived">{money(itemTotal({ ...it, waived: false }))}</s>
          : hasSub ? money(itemTotal(it)) : parent ? money((+it.qty || 0) * (+it.price || 0)) : money(itemTotal(it));
        return <span className="prop-line-total">{priceEl}</span>;
      })()}
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
              onDuplicate={parent ? null : () => duplicateItem(it.id)}
              onDescribe={parent ? null : () => openDesc(it.id)}
              onToggleCondition={parent ? null : (key, on) => setCondition(it.id, key, on)}
              onApplyPeers={parent ? null : () => applyLineConditionsToPeers(it.id)}
              peerLabel={`Apply to all ${svc.key === "camera" ? "cameras" : "lines"}`}
              onRemove={() => (parent ? removeSub(parent.id, it.id) : removeItem(it.id))}
              removeLabel={`${camName || it.name || "Item"}${!parent ? ` · ${money(itemTotal(it))}` : ""}`}
              onClose={() => setMenuOpen(null)}
            />
          )}
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
  const subRow = (x, parent) => {
    const q = +x.qty || 1;
    const amount = (+x.qty || 0) * (+x.price || 0);
    const isDrop = /^line drop/i.test(x.name || "");
    const isExisting = /existing/i.test(x.name || "");
    const editing = !readOnly && (subEditId === x.id || !String(x.name || "").trim());
    return (
      <div key={x.id} className="prop-sub2-wrap" style={bulkPrompt?.subId === x.id ? { position: "relative", zIndex: 5 } : undefined}>
        {editing ? (
          <div className="prop-sub2 editing">
            <ItemNameField value={x.name} disabled={readOnly} placeholder="Sub-item" currentService={svc.key} allCatalog={allCatalog}
              onChange={(v) => patchSub(parent.id, x.id, { name: v })}
              onPick={(c) => patchSub(parent.id, x.id, { name: c.name, price: c.price })} />
            <input className="num prop-sub2-qty" type="number" min="0" step="1" value={x.qty} disabled={readOnly} title="Quantity"
              onFocus={() => { preEdit.current[`${x.id}_qty`] = x.qty; }} onBlur={() => maybeBulk(parent, x, "qty")}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
              onChange={(e) => patchSub(parent.id, x.id, { qty: e.target.value })} />
            <span className="prop-sub2-mul">×</span>
            <input className="num prop-sub2-price" type="number" step="0.01" value={x.price} disabled={readOnly} title="Unit price"
              onFocus={() => { preEdit.current[`${x.id}_price`] = x.price; }} onBlur={() => maybeBulk(parent, x, "price")}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
              onChange={(e) => patchSub(parent.id, x.id, { price: e.target.value })} />
            {showCost && <input className="num prop-sub2-cost" type="number" min="0" step="0.01" value={x.cost ?? 0} title="Internal cost — never shown to sales or customers"
              onChange={(e) => patchSub(parent.id, x.id, { cost: e.target.value })} />}
            {isDrop && <button type="button" className={`prop-exist-tog${isExisting ? " on" : ""}`} title="Existing cable — test &amp; map only ($50) instead of a new Cat6 run ($150)" onClick={() => toggleExisting(parent, x)}>Existing</button>}
            <span className="prop-sub2-amt">{money(amount)}</span>
            <button type="button" className="prop-sub2-done" title="Done" aria-label="Done" onClick={() => setSubEditId(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </button>
            <button type="button" className="prop-sub2-del" title="Remove from bundle" aria-label="Remove from bundle" onClick={() => removeSub(parent.id, x.id)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </div>
        ) : (
          <button type="button" className="prop-sub2 compact" onClick={() => { if (!readOnly) setSubEditId(x.id); }} title={readOnly ? undefined : "Edit"}>
            <span className="prop-sub2-name">{x.name || "Sub-item"}{isExisting && <span className="prop-sub2-tag">existing</span>}</span>
            {q > 1 && <span className="prop-sub2-math">{q} × {money(x.price)}</span>}
            <span className="prop-sub2-amt">{money(amount)}</span>
          </button>
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
                onRemove={onRemove}
                onClose={() => setSvcMenuOpen(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* First things first — the recording system: NVR model + a drive picker per HDD bay. NVR and
          Displays each sit on their own row (mobile-friendly). Prices/cost render below each picker. */}
      {soundMode && !ampCollapsed && (
        <div className="prop-sysbar">
          <div className="prop-sysrow">
            <div className="prop-slot">
              <span className="prop-slot-lbl">Amp</span>
              <select value={ampItem?.name || ""} onChange={(e) => pickAmp(e.target.value)} disabled={readOnly} aria-label="Amplifier">
                <option value="">None</option>
                {ampModels.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                {ampItem && !ampModels.some((m) => m.name === ampItem.name) && <option value={ampItem.name}>{ampItem.name}</option>}
              </select>
              {ampItem ? (
                <>
                  <input className="prop-slot-price" type="number" min="0" step="0.01" value={ampItem.price} disabled={readOnly} title="Price" onChange={(e) => setAmpField(1, { price: e.target.value })} />
                  {showCost && <input className="prop-slot-costin" type="number" min="0" step="0.01" value={ampItem.cost ?? 0} disabled={readOnly} title="Internal cost" onChange={(e) => setAmpField(1, { cost: e.target.value })} />}
                </>
              ) : <span className="prop-slot-cost">—</span>}
            </div>
            {ampItem && (
              <div className="prop-slots">
                <div className="prop-slot">
                  <span className="prop-slot-lbl">Rack</span>
                  <select value={rackItem ? "on" : ""} onChange={(e) => setRack(e.target.value === "on")} disabled={readOnly} aria-label="Rack">
                    <option value="">None</option>
                    <option value="on">{displayNameOf(AMP_ADDON, loadPriceBook())}</option>
                  </select>
                  {rackItem ? (
                    <>
                      <input className="prop-slot-price" type="number" min="0" step="0.01" value={rackItem.price} disabled={readOnly} title="Price" onChange={(e) => setAmpField(2, { price: e.target.value })} />
                      {showCost && <input className="prop-slot-costin" type="number" min="0" step="0.01" value={rackItem.cost ?? 0} disabled={readOnly} title="Internal cost" onChange={(e) => setAmpField(2, { cost: e.target.value })} />}
                    </>
                  ) : <span className="prop-slot-cost">—</span>}
                </div>
              </div>
            )}
            {ampItem && !readOnly && <button type="button" className="prop-sys-done" onClick={() => setAmpDone(true)}>Done</button>}
          </div>
        </div>
      )}
      {showSysbar && (
        <div className="prop-sysbar">
          {showNvrPickers && <div className="prop-sysrow">
          <div className="prop-slot">
            <span className="prop-slot-lbl">NVR</span>
            <select value={nvrItem?.name || ""} onChange={pickNvr} disabled={readOnly}>
              <option value="">None</option>
              {NVR_MODELS.map((m) => (
                <option key={m.name} value={m.name}>{m.name.replace(/^NVR \(|\)$/g, "")}</option>
              ))}
            </select>
            {nvrItem ? (
              <>
                <input className="prop-slot-price" type="number" min="0" step="0.01" value={nvrItem.price} disabled={readOnly}
                       title="Price" onChange={(e) => setNvrField({ price: e.target.value })} />
                {showCost && (
                  <input className="prop-slot-costin" type="number" min="0" step="0.01" value={nvrItem.cost ?? 0} disabled={readOnly}
                         title="Internal cost" onChange={(e) => setNvrField({ cost: e.target.value })} />
                )}
              </>
            ) : <span className="prop-slot-cost">—</span>}
          </div>
          {nvrItem && hddSlots > 0 && (
            <div className="prop-slots">
              {/* Only the bays this NVR actually has — 8-Ch → 1, 16-Ch → 2, 32-Ch → 4. No greyed N/A slots. */}
              {Array.from({ length: hddSlots }, (_, i) => {
                const n = i + 1;
                const d = driveAt(n);
                return (
                  <div className="prop-slot" key={n}>
                    <span className="prop-slot-lbl">HDD Slot {n}</span>
                    <select value={d?.name || ""} onChange={(e) => setSlotDrive(n, e.target.value)} disabled={readOnly}>
                      <option value="">Empty</option>
                      {STORAGE_DRIVES.map((x) => (
                        <option key={x.name} value={x.name}>{x.name.replace(/ Storage Drive$/, "")}</option>
                      ))}
                    </select>
                    {d ? (
                      <>
                        <input className="prop-slot-price" type="number" min="0" step="0.01" value={d.price} disabled={readOnly}
                               title="Price" onChange={(e) => setSlotField(n, { price: e.target.value })} />
                        {showCost && (
                          <input className="prop-slot-costin" type="number" min="0" step="0.01" value={d.cost ?? 0} disabled={readOnly}
                                 title="Internal cost" onChange={(e) => setSlotField(n, { cost: e.target.value })} />
                        )}
                      </>
                    ) : <span className="prop-slot-cost">—</span>}
                  </div>
                );
              })}
            </div>
          )}
          {nvrItem && !readOnly && (
            <button type="button" className="prop-sys-done" onClick={() => setNvrDone(true)}>Done</button>
          )}
          </div>}
          {showDispPickers && <div className="prop-sysrow">
            <div className="prop-slots">
              {Array.from({ length: dispVisible }, (_, i) => {
                const n = i + 1;
                const d = displayAt(n);
                return (
                  <div className="prop-slot" key={n}>
                    <span className="prop-slot-lbl">Display {n}
                      {!readOnly && n === dispVisible && dispVisible > 1 && (
                        <button type="button" className="prop-slot-x" title="Remove this display" onClick={() => { setSlotDisplay(n, ""); setDispShown(dispVisible - 1); }}>✕</button>
                      )}
                    </span>
                    <select value={d?.baseName || ""} onChange={(e) => setSlotDisplay(n, e.target.value)} disabled={readOnly}>
                      <option value="">Empty</option>
                      {displayOptions.map((x) => (
                        <option key={x.baseName} value={x.baseName}>{x.name}</option>
                      ))}
                      <option value="__custom__">Custom…</option>
                    </select>
                    {d ? (
                      <>
                        {d.baseName === "__custom__" && (
                          <input className="prop-slot-name" type="text" placeholder="Custom display…" value={d.name} disabled={readOnly}
                                 title="Custom display name" onChange={(e) => setDisplayField(n, { name: e.target.value })} />
                        )}
                        <input className="prop-slot-price" type="number" min="0" step="0.01" value={d.price} disabled={readOnly}
                               title="Price" onChange={(e) => setDisplayField(n, { price: e.target.value })} />
                        {showCost && (
                          <input className="prop-slot-costin" type="number" min="0" step="0.01" value={d.cost ?? 0} disabled={readOnly}
                                 title="Internal cost" onChange={(e) => setDisplayField(n, { cost: e.target.value })} />
                        )}
                      </>
                    ) : <span className="prop-slot-cost">—</span>}
                  </div>
                );
              })}
              {!readOnly && dispVisible < 4 && (
                <button type="button" className="prop-add-slot" onClick={() => setDispShown(dispVisible + 1)} title="Add another display">+ Add display</button>
              )}
            </div>
          {displayItems.length > 0 && !readOnly && (
            <button type="button" className="prop-sys-done" onClick={() => setDispDone(true)}>Done</button>
          )}
          </div>}
          {!nvrItem && camCount > 0 && (
            <span className="prop-sys-hint">Recommended · {camCount <= 8 ? "8" : camCount <= 16 ? "16" : "32"}-Channel NVR</span>
          )}
        </div>
      )}

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

      {/* Column captions only when a flat (qty × price) line exists — bundle blocks carry just a total, so Qty/Price
          captions over empty columns would be noise. Presentation only; the rows themselves are unchanged. */}
      {svc.items.length > 0 && visibleItems.some((it) => !((it.sub || []).length > 0)) && (
        <div className={`prop-cols${gridClass}`}>
          <span>Item</span><span className="r">Qty</span><span className="r">Price</span>
          {showCost && <span className="r">Cost</span>}
          <span className="r hcell-lt">Total</span><span />
        </div>
      )}

      {/* Collapsed recording-system lines (NVR, Displays) — numbered, expandable via Edit */}
      {leadRows.map((lr, i) => (
        <div key={lr.key} className={`prop-block prop-lead${!readOnly ? " has-drag" : ""}`}>
          <div className="prop-sysline">
            {lr.items?.length > 0 ? (
              <button className="prop-chev" style={{ color: svcColor }} title={leadOpen[lr.key] !== false ? "Hide breakdown" : "Show breakdown"}
                      onClick={() => setLeadOpen((o) => ({ ...o, [lr.key]: o[lr.key] === false }))}>{leadOpen[lr.key] !== false ? "▾" : "▸"}</button>
            ) : <span style={{ width: 16, flexShrink: 0 }} />}
            <InfraBadge kind={infraKindOf(lr.key === "disp" ? "display" : lr.key)} />
            <span className="prop-sysline-name">{lr.title}</span>
            {/* CLOSED tells you what's inside — a muted scan-summary built from the children; hidden once
                expanded (the exact rows below are the detail). Inline on desktop, its own line on mobile. */}
            {lr.summary && leadOpen[lr.key] === false && <span className="prop-sysline-sum">{lr.summary}</span>}
            <span className="prop-sysline-total">{money(lr.total)}</span>
            {!readOnly && (
              <div className="prop-im-wrap prop-sysline-menu">
                <button type="button" className="prop-item-menu" aria-label={`${lr.title} actions`} title="Actions"
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === `sys-${lr.key}` ? null : `sys-${lr.key}`); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
                </button>
                {menuOpen === `sys-${lr.key}` && <SysRowMenu onEdit={lr.edit} onClose={() => setMenuOpen(null)} />}
              </div>
            )}
            {/* Read-only keeps the ••• column's width so every price lines up with the editable layout. */}
            {readOnly && <span className="prop-im-sp" aria-hidden="true" />}
          </div>
          {leadOpen[lr.key] !== false && lr.items?.length > 0 && lr.items.map((bi, bidx) => (
            // The same compact child-row component as a camera's expanded sub-item (name … amount, "N × $unit" when
            // qty > 1) — display-only: you edit these via the block's Edit action.
            <div key={bidx} className="prop-sub2-wrap">
              <div className="prop-sub2 static">
                <span className="prop-sub2-name">{bi.name}</span>
                {(+bi.qty || 1) > 1 && <span className="prop-sub2-math">{bi.qty} × {money(bi.price)}</span>}
                <span className="prop-sub2-amt">{money(bi.total)}</span>
              </div>
            </div>
          ))}
        </div>
      ))}

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
          {open[it.id] && (it.sub || []).map((x) => subRow(x, it))}
          {open[it.id] && !readOnly && (
            <div className="prop-subadd">
              <button type="button" className="prop-subadd-btn" onClick={() => addSub(it.id)}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Sub-item
              </button>
            </div>
          )}
        </div>
      ))}

      {!readOnly && (
        <div className="prop-addbar">
          {/* Preset bundles — one-click line groups (ACTIONS). The preset EDITOR lives in the top gear's
              Configuration Center; these chips just add items. Hidden when the service has no presets. */}
          {(presets.length > 0 || askCam) && (
          <div className="prop-preset-row">
            {presets.map((p, pi) => (
              <button key={p.id} className={`prop-preset-chip c${pi % 3}`} title={`Add bundle: ${p.name}`} onClick={() => clickPreset(p)}>+ {p.name}</button>
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
          </div>
          )}
          <div className="prop-addrow-basic">
            <button className="prop-mini" onClick={() => addItem()}>+ Item</button>
            {catalog.length > 0 && (
              <select defaultValue="" onChange={quickAdd}>
                <option value="" disabled>Catalog…</option>
                {catalog.map((c, i) => (
                  <option key={c.name} value={i}>{c.name} · {money(c.price)}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {svc.note && <div className="prop-svc-note">{svc.note}</div>}
    </div>
  );
}

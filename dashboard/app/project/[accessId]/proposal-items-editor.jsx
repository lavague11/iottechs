"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { PROPOSAL_CATALOG, newItemId, svcSubtotal, itemTotal, priceOf, displayNameOf, serviceColor, serviceLabel, effectiveCatalog, allCatalogEntries, loadPriceBook } from "../../../lib/proposal";

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
    function onDocDown(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const matches = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (!needle) return [];
    const hits = allCatalog.filter((c) => c.name.toLowerCase().includes(needle));
    const mine = hits.filter((c) => c.service === currentService);
    const others = hits.filter((c) => c.service !== currentService);
    return [...mine, ...others].slice(0, 8);
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
            <div key={c.service + c.name + i} className={`prop-name-opt${c.service === currentService ? " mine" : ""}`}
                 onMouseDown={(e) => { e.preventDefault(); pick(c); }}>
              <span className="prop-name-opt-name">{c.name}</span>
              <span className="prop-name-opt-svc">{serviceLabel(c.service)}</span>
              <span className="prop-name-opt-price">{money(c.price)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export default function ProposalItemsEditor({ svc, showCost, readOnly, onChange, onRemove, onOpenPricing, priceBookVersion, customerFlags, onResolveFlag }) {
  const flags = customerFlags || {};
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
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const [dragId, setDragId] = useState(null);   // line item being dragged
  const [overId, setOverId] = useState(null);    // line item currently hovered as a drop target
  // Camera recording system: NVR (+drives) and Displays each collapse to a compact, expandable
  // summary line via a "Done" button. Start collapsed when already configured (cleaner reopen).
  const [nvrDone, setNvrDone] = useState(() => (svc.items || []).some((it) => !it.sub && /^NVR/.test(it.name || "")));
  const [dispDone, setDispDone] = useState(() => (svc.items || []).some((it) => it.displaySlot != null));
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

  function patchItems(items) { onChange({ ...svc, items }); }
  function patchItem(id, patch) {
    patchItems(svc.items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  // Inline price/cost edits for the NVR + drive/display lines managed in the system bar.
  const setSlotField = (n, patch) => { const d = driveAt(n); if (d) patchItem(d.id, patch); };
  const setDisplayField = (n, patch) => { const d = displayAt(n); if (d) patchItem(d.id, patch); };
  const setNvrField = (patch) => { if (nvrItem) patchItem(nvrItem.id, patch); };
  // NVR + slotted drives/displays live only in the system bar, not the editable item list.
  const inSysbar = (it) => svc.key === "camera" && (it.slot != null || it.displaySlot != null || /^NVR/.test(it.name || ""));
  function patchSub(pid, sid, patch) {
    patchItems(svc.items.map((it) => it.id === pid
      ? { ...it, sub: it.sub.map((x) => (x.id === sid ? { ...x, ...patch } : x)) }
      : it));
  }
  function removeSub(pid, sid) {
    patchItems(svc.items.map((it) => (it.id === pid ? { ...it, sub: it.sub.filter((x) => x.id !== sid) } : it)));
  }
  function addSub(pid) {
    patchItems(svc.items.map((it) => it.id === pid
      ? { ...it, sub: [...(it.sub || []), { id: newItemId(), name: "", qty: 1, price: 0, cost: 0 }] }
      : it));
  }
  function removeItem(id) { patchItems(svc.items.filter((it) => it.id !== id)); }
  function addItem(name = "", price = 0) {
    patchItems([...svc.items, { id: newItemId(), name, qty: 1, price, cost: 0 }]);
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
    sub: driveItems.length ? `${driveItems.length} drive${driveItems.length !== 1 ? "s" : ""}` : "No drives",
    total: nvrGroupTotal, edit: () => setNvrDone(false) });
  if (dispCollapsed) leadRows.push({ key: "disp", title: "Displays",
    sub: `${displayItems.length} display${displayItems.length !== 1 ? "s" : ""}`,
    total: displaysTotal, edit: () => setDispDone(false) });
  const leadCount = leadRows.length;
  // Camera location blocks number AFTER the collapsed recording-system lines (1, 2, then cameras).
  const blockNumOf = {};
  visibleItems.forEach((it, i) => { blockNumOf[it.id] = leadCount + i + 1; });

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
    return (
    <div key={it.id} className={`prop-item${gridClass}${parent ? " sub" : ""}${hasSub ? " prop-parent" : ""}${parent && subIdx % 2 ? " alt" : ""}`}>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {expandable && (
          <button className="prop-chev" style={{ color: svcColor }} title={open[it.id] ? "Collapse" : "Expand breakdown"} onClick={() => toggle(it.id)}>
            {open[it.id] ? "▾" : "▸"}
          </button>
        )}
        {!parent && blockNumOf[it.id] && <span className="prop-block-num" style={{ background: svcColor }}>{blockNumOf[it.id]}</span>}
        {hasSub ? (
          <input value={it.name} disabled={readOnly} placeholder="Item"
                 style={!parent && it.outdoor ? { color: "var(--red)", fontWeight: 700 } : undefined}
                 onChange={(e) => patchItem(it.id, { name: e.target.value })} />
        ) : (
          <ItemNameField
            value={it.name} disabled={readOnly} placeholder={parent ? "Sub-item" : "Item"}
            style={{ ...(parent ? { marginLeft: 18 } : null), ...(!parent && it.outdoor ? { color: "var(--red)", fontWeight: 700 } : null) }}
            currentService={svc.key} allCatalog={allCatalog}
            onChange={(v) => (parent ? patchSub(parent.id, it.id, { name: v }) : patchItem(it.id, { name: v }))}
            onPick={(c) => (parent ? patchSub(parent.id, it.id, { name: c.name, price: c.price }) : patchItem(it.id, { name: c.name, price: c.price }))}
          />
        )}
        {!parent && it.waived && <span className="prop-waived-banner" title="This line is waived — comped off the invoice">Waived</span>}
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
               onChange={(e) => (parent ? patchSub(parent.id, it.id, { qty: e.target.value }) : patchItem(it.id, { qty: e.target.value }))} />
      )}
      {hasSub ? <span /> : (
        <input className="num" type="number" min="0" step="0.01" value={it.price} disabled={readOnly}
               onChange={(e) => (parent ? patchSub(parent.id, it.id, { price: e.target.value }) : patchItem(it.id, { price: e.target.value }))} />
      )}
      {showCost && (hasSub ? <span /> : (
        <input className="num" type="number" min="0" step="0.01" value={it.cost ?? 0} disabled={readOnly}
               title="Internal cost — never shown to sales or customers"
               onChange={(e) => (parent ? patchSub(parent.id, it.id, { cost: e.target.value }) : patchItem(it.id, { cost: e.target.value }))} />
      ))}
      <span className="prop-line-total">
        {!parent && it.waived
          ? <s className="prop-waived-strike" title="Comped off the invoice — you still see the value waived">{money(itemTotal({ ...it, waived: false }))}</s>
          : hasSub ? money(itemTotal(it)) : parent ? money((+it.qty || 0) * (+it.price || 0)) : money(itemTotal(it))}
      </span>
      {!readOnly ? (
        <button className="prop-item-x" title="Remove"
                onClick={() => (parent ? removeSub(parent.id, it.id) : removeItem(it.id))}>✕</button>
      ) : <span />}
    </div>
    );
  };

  return (
    <div className="prop-svc">
      <div className="prop-svc-head">
        <span className="prop-svc-name">
          {svc.label}
          {svc.key === "camera" && camCount > 0 && <span className="prop-svc-count"> · {camCount} camera{camCount !== 1 ? "s" : ""}</span>}
        </span>
        <span className="prop-svc-sub">{money(svcSubtotal(svc))}</span>
        {!readOnly && onOpenPricing && (
          <button className="prop-svc-gear" title={`${svc.label} pricing`} onClick={() => onOpenPricing(svc.key)}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        )}
        {!readOnly && <button className="prop-svc-x" title="Remove service" onClick={onRemove}>✕</button>}
      </div>

      {/* First things first — the recording system: NVR model + a drive picker per HDD bay.
          NVR and each drive show their editable price (and cost, for admin/manager) below the picker. */}
      {showSysbar && (
        <div className="prop-sysbar">
          {showNvrPickers && <>
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
          {nvrItem && (
            <div className="prop-slots">
              {Array.from({ length: 4 }, (_, i) => {
                const n = i + 1;
                const locked = n > hddSlots;
                const d = !locked && driveAt(n);
                return (
                  <div className={`prop-slot${locked ? " prop-slot-locked" : ""}`} key={n}>
                    <span className="prop-slot-lbl">HDD Slot {n}</span>
                    <select value={d?.name || ""} onChange={(e) => setSlotDrive(n, e.target.value)} disabled={readOnly || locked}
                            title={locked ? `Not available on ${nvrShort(nvrItem.name)}` : undefined}>
                      <option value="">{locked ? "N/A" : "Empty"}</option>
                      {!locked && STORAGE_DRIVES.map((x) => (
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
          </>}
          {showDispPickers && <>
            <div className="prop-slots">
              {Array.from({ length: 4 }, (_, i) => {
                const n = i + 1;
                const d = displayAt(n);
                return (
                  <div className="prop-slot" key={n}>
                    <span className="prop-slot-lbl">Display {n}</span>
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
            </div>
          {displayItems.length > 0 && !readOnly && (
            <button type="button" className="prop-sys-done" onClick={() => setDispDone(true)}>Done</button>
          )}
          </>}
          {!nvrItem && camCount > 0 && (
            <span className="prop-sys-hint">Recommended: {camCount <= 8 ? "8" : camCount <= 16 ? "16" : "32"}-Channel</span>
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

      {svc.items.length > 0 && (
        <div className={`prop-cols${gridClass}`}>
          <span>Item</span><span className="r">Qty</span><span className="r">Price</span>
          {showCost && <span className="r">Cost</span>}
          <span className="r hcell-lt">Total</span><span />
        </div>
      )}

      {/* Collapsed recording-system lines (NVR, Displays) — numbered, expandable via Edit */}
      {leadRows.map((lr, i) => (
        <div key={lr.key} className="prop-block prop-sysline">
          <span className="prop-block-num" style={{ background: svcColor }}>{i + 1}</span>
          <span className="prop-sysline-name">{lr.title}</span>
          <span className="prop-sysline-sub">{lr.sub}</span>
          <span className="prop-sysline-total">{money(lr.total)}</span>
          {!readOnly && <button type="button" className="prop-mini prop-sysline-edit" onClick={lr.edit}>Edit</button>}
        </div>
      ))}

      {visibleItems.map((it, idx) => (
        <div key={it.id}
             className={`prop-block${!readOnly ? " has-drag" : ""}${idx % 2 ? " alt" : ""}${it.outdoor ? " prop-outdoor" : ""}${it.waived ? " prop-waived" : ""}${dragId === it.id ? " prop-dragging" : ""}${overId === it.id && dragId && dragId !== it.id ? " prop-dragover" : ""}`}
             style={{ "--svc-color": svcColor }} title={it.outdoor ? "Outdoor placement" : undefined}
             onDragOver={!readOnly && dragId ? (e) => { e.preventDefault(); if (overId !== it.id) setOverId(it.id); } : undefined}
             onDrop={!readOnly && dragId ? (e) => { e.preventDefault(); moveItem(dragId, it.id); setDragId(null); setOverId(null); } : undefined}>
          {!readOnly && (
            <span className="prop-drag-handle" draggable title="Drag to reorder"
                  onDragStart={(e) => { setDragId(it.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", it.id); } catch {} }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
            </span>
          )}
          {row(it, null)}
          {open[it.id] && (it.sub || []).map((x, si) => row(x, it, si))}
          {open[it.id] && !readOnly && (
            <div className="prop-subadd">
              <button className="prop-mini" onClick={() => addSub(it.id)}>+ Sub-item</button>
            </div>
          )}
        </div>
      ))}

      {!readOnly && (
        <div className="prop-addbar">
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
      )}

      {svc.note && <div className="prop-svc-note">{svc.note}</div>}
    </div>
  );
}

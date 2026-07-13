"use client";

import { useState, useMemo, useRef, useTransition } from "react";
import { addItemAction, batchReceiveAction } from "./actions";

const CATEGORIES = ["Camera", "NVR", "Storage", "Cabling", "Networking", "Access", "Audio", "Other"];

// Add Inventory: two modes.
//  • Single — the classic one-item form.
//  • Batch  — pick an item (or name a new one), then scan serial/QR codes with a barcode
//    scanner. Each scan drops a line into the box (scanners send Enter after each code),
//    and every non-blank line becomes one serialized unit on submit.
export default function AddInventoryModal({ items, projects, onClose, onDone }) {
  const [mode, setMode] = useState("single");
  return (
    <div className="am-overlay" onClick={(e) => { if (e.target.classList.contains("am-overlay")) onClose(); }}>
      <div className="am-box">
        <button className="am-x" onClick={onClose}>×</button>
        <div className="am-head"><h2>Add Inventory</h2></div>
        <div className="am-tabs">
          <button className={mode === "single" ? "on" : ""} onClick={() => setMode("single")}>Single</button>
          <button className={mode === "batch" ? "on" : ""} onClick={() => setMode("batch")}>Batch scan</button>
        </div>
        {mode === "single"
          ? <SingleForm projects={projects} onDone={onDone} />
          : <BatchForm items={items} onDone={onDone} />}
      </div>
    </div>
  );
}

function SingleForm({ projects, onDone }) {
  const [f, setF] = useState({ name: "", category: "Camera", sku: "", quantity: "", unit_cost: "", location: "Warehouse A", project_access_id: "", qty_for_project: "" });
  const [err, setErr] = useState("");
  const [pending, startTx] = useTransition();
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  function submit(e) {
    e.preventDefault();
    setErr("");
    startTx(async () => {
      const res = await addItemAction({ ...f, quantity: Number(f.quantity) || 0, unit_cost: Number(f.unit_cost) || 0, project_access_id: f.project_access_id || null });
      if (res.error) setErr(res.error); else onDone();
    });
  }

  return (
    <form className="am-form" onSubmit={submit}>
      <div className="am-field"><label>Item Name</label><input className="apx-input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Hikvision 4MP Dome" required /></div>
      <div className="am-row2">
        <div className="am-field"><label>Category</label><select className="apx-input" value={f.category} onChange={(e) => set("category", e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="am-field"><label>SKU <span className="am-opt">(optional)</span></label><input className="apx-input" value={f.sku} onChange={(e) => set("sku", e.target.value)} placeholder="HK-2143G2" /></div>
      </div>
      <div className="am-row2">
        <div className="am-field"><label>Quantity</label><input className="apx-input" type="number" min="0" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="0" required /></div>
        <div className="am-field"><label>Unit Cost ($)</label><input className="apx-input" type="number" min="0" value={f.unit_cost} onChange={(e) => set("unit_cost", e.target.value)} placeholder="0" /></div>
      </div>
      <div className="am-row2">
        <div className="am-field"><label>Location</label><input className="apx-input" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Warehouse A" /></div>
        <div className="am-field"><label>Assign to Project <span className="am-opt">(optional)</span></label>
          <select className="apx-input" value={f.project_access_id} onChange={(e) => set("project_access_id", e.target.value)}>
            <option value="">— In stock —</option>
            {projects.map((p) => <option key={p.access_id} value={p.access_id}>{p.customer} ({p.access_id})</option>)}
          </select>
        </div>
      </div>
      {f.project_access_id && (
        <div className="am-field"><label>Qty for Project</label>
          <input className="apx-input" type="number" min="0" value={f.qty_for_project} onChange={(e) => set("qty_for_project", e.target.value)} placeholder="0" />
        </div>
      )}
      {err && <div className="am-err">{err}</div>}
      <button className="am-submit" type="submit" disabled={pending}>{pending ? "Adding…" : "Add Item"}</button>
    </form>
  );
}

function BatchForm({ items, onDone }) {
  const [target, setTarget] = useState(items[0]?.id ? String(items[0].id) : "__new__");
  const [newItem, setNewItem] = useState({ name: "", category: "Camera" });
  const [serials, setSerials] = useState("");
  const [sku, setSku] = useState("");
  const [tracking, setTracking] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [pending, startTx] = useTransition();
  const boxRef = useRef(null);

  const lines = useMemo(() => serials.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean), [serials]);
  const dupCount = useMemo(() => {
    const seen = new Set(); let d = 0;
    for (const l of lines) { const k = l.toLowerCase(); if (seen.has(k)) d++; else seen.add(k); }
    return d;
  }, [lines]);
  const unique = lines.length - dupCount;
  const isNew = target === "__new__";

  function submit(e) {
    e.preventDefault();
    setErr(""); setResult(null);
    if (!lines.length) { setErr("Scan at least one serial."); return; }
    if (isNew && !newItem.name.trim()) { setErr("Name the new item."); return; }
    startTx(async () => {
      const res = await batchReceiveAction({
        itemId: isNew ? null : Number(target),
        newItem: isNew ? newItem : null,
        serials, sku, tracking,
      });
      if (res.error) { setErr(res.error); return; }
      setResult(res);
      setSerials(""); setSku(""); setTracking("");
      boxRef.current?.focus();
    });
  }

  return (
    <form className="am-form" onSubmit={submit}>
      <div className="am-field"><label>Item</label>
        <select className="apx-input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="__new__">+ New item…</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.sku ? ` · ${i.sku}` : ""}</option>)}
        </select>
      </div>
      {isNew && (
        <div className="am-row2">
          <div className="am-field"><label>New item name</label><input className="apx-input" value={newItem.name} onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Hikvision 4MP Dome" /></div>
          <div className="am-field"><label>Category</label><select className="apx-input" value={newItem.category} onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value }))}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
      )}
      <div className="am-row2">
        <div className="am-field"><label>SKU <span className="am-opt">(optional)</span></label><input className="apx-input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Scan or type" /></div>
        <div className="am-field"><label>Tracking # <span className="am-opt">(optional)</span></label><input className="apx-input" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Shipment tracking" /></div>
      </div>
      <div className="am-field">
        <label>Scan serials <span className="am-opt">one per line — point the scanner here and scan away</span></label>
        <textarea ref={boxRef} className="apx-input am-scan" autoFocus rows={8} value={serials} onChange={(e) => setSerials(e.target.value)}
                  placeholder={"SN-000123456\nSN-000123457\nSN-000123458"} />
        <div className="am-scan-meta">
          <span><strong>{unique}</strong> to add</span>
          {dupCount > 0 && <span className="am-dup">{dupCount} duplicate{dupCount !== 1 ? "s" : ""} skipped</span>}
          {serials && <button type="button" className="am-clear" onClick={() => setSerials("")}>Clear</button>}
        </div>
      </div>
      {err && <div className="am-err">{err}</div>}
      {result && <div className="am-ok">✓ Scanned in {result.added} unit{result.added !== 1 ? "s" : ""}{result.skipped ? ` · ${result.skipped} already on file` : ""}. Keep scanning or close.</div>}
      <div className="am-batch-actions">
        <button className="am-submit" type="submit" disabled={pending || !unique}>{pending ? "Scanning…" : `Scan in ${unique || ""}`.trim()}</button>
        <button type="button" className="am-done" onClick={onDone}>Done</button>
      </div>
    </form>
  );
}

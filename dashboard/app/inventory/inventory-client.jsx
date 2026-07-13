"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";
import ConfirmDialog from "../components/confirm-dialog";
import AddInventoryModal from "./inventory-add-modal";
import InventoryHistoryModal from "./inventory-history-modal";
import { assignItemAction, deleteItemAction, updateQtyForProjectAction, markUsedAction } from "./actions";

const money = (n) => "$" + (n || 0).toLocaleString();

// Sort options — label + comparator. "assigned"/used pull the project + install progress up.
const SORTS = {
  name_az:  { label: "Name A → Z",   cmp: (a, b) => a.name.localeCompare(b.name) },
  name_za:  { label: "Name Z → A",   cmp: (a, b) => b.name.localeCompare(a.name) },
  category: { label: "Category",     cmp: (a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name) },
  qty:      { label: "Quantity ↓",   cmp: (a, b) => (b.quantity || 0) - (a.quantity || 0) },
  unit:     { label: "Unit cost ↓",  cmp: (a, b) => (b.unit_cost || 0) - (a.unit_cost || 0) },
  value:    { label: "Value ↓",      cmp: (a, b) => (b.total_value || 0) - (a.total_value || 0) },
  assigned: { label: "Assigned",     cmp: (a, b) => (a.project_customer || "~").localeCompare(b.project_customer || "~") },
  used:     { label: "Used / installed ↓", cmp: (a, b) => (b.qty_used || 0) - (a.qty_used || 0) },
};

function AssignCell({ item, projects }) {
  const [pending, startTx] = useTransition();
  const [localQty, setLocalQty] = useState(item.qty_for_project || 0);
  const router = useRouter();

  function onProjectChange(e) {
    const val = e.target.value;
    startTx(async () => {
      await assignItemAction(item.id, val || null, val ? localQty : 0);
      router.refresh();
    });
  }

  function onQtyBlur(e) {
    const qty = Number(e.target.value) || 0;
    if (qty === item.qty_for_project) return;
    startTx(async () => { await updateQtyForProjectAction(item.id, qty); router.refresh(); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <select className="usel" value={item.project_access_id || ""} onChange={onProjectChange} disabled={pending}>
        <option value="">In stock</option>
        {projects.map((p) => <option key={p.access_id} value={p.access_id}>{p.customer} ({p.access_id})</option>)}
      </select>
      {item.project_access_id && (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: ".74rem", color: "var(--muted)", whiteSpace: "nowrap" }}>Qty for project:</span>
          <input
            className="apx-input"
            type="number" min="0"
            style={{ width: 60, padding: "3px 6px", fontSize: ".82rem" }}
            value={localQty}
            onChange={(e) => setLocalQty(e.target.value)}
            onBlur={onQtyBlur}
            disabled={pending}
          />
          {Number(localQty) > item.quantity && (
            <span title="Exceeds available stock" style={{ color: "#e74c3c", fontSize: ".74rem", fontWeight: 700 }}>⚠ over</span>
          )}
        </div>
      )}
      {item.project_access_id && (
        <Link href={`/project/${item.project_access_id}`} className="idlink" style={{ fontSize: ".76rem" }}>
          {item.project_customer || item.project_access_id} →
        </Link>
      )}
    </div>
  );
}

function UsedCell({ item }) {
  const [pending, startTx] = useTransition();
  const [val, setVal] = useState(item.qty_used || 0);
  const router = useRouter();
  const target = item.qty_for_project || 0;
  const fullyUsed = target > 0 && Number(val) >= target;
  const partiallyUsed = Number(val) > 0 && !fullyUsed;

  function onBlur(e) {
    const qty = Math.min(Number(e.target.value) || 0, item.quantity);
    if (qty === item.qty_used) return;
    startTx(async () => { await markUsedAction(item.id, qty); router.refresh(); });
  }

  function markAll() {
    const qty = target || item.quantity;
    setVal(qty);
    startTx(async () => { await markUsedAction(item.id, qty); router.refresh(); });
  }

  if (!item.project_access_id) return <span style={{ color: "var(--muted)", fontSize: ".8rem" }}>—</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <input
          className="apx-input"
          type="number" min="0" max={item.quantity}
          style={{ width: 54, padding: "3px 6px", fontSize: ".82rem" }}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={onBlur}
          disabled={pending}
        />
        {target > 0 && <span style={{ fontSize: ".74rem", color: "var(--muted)" }}>/ {target}</span>}
      </div>
      {fullyUsed ? (
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#1c8a45", background: "rgba(91,184,122,.12)", padding: "1px 7px", borderRadius: 100 }}>✓ Installed</span>
      ) : partiallyUsed ? (
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#b87300", background: "rgba(224,154,58,.1)", padding: "1px 7px", borderRadius: 100 }}>Partial</span>
      ) : (
        <button onClick={markAll} disabled={pending} style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--accent)", background: "var(--accent-soft)", border: "none", borderRadius: 100, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}>
          Mark all used
        </button>
      )}
    </div>
  );
}

function ShortageAlert({ shortages }) {
  const issues = shortages.filter((s) => s.over_allocated > 0 || s.pending_install > 0);
  if (!issues.length) return null;
  return (
    <div className="inv-shortage-banner">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span><strong>{issues.length} project{issues.length > 1 ? "s" : ""}</strong> with inventory issues —</span>
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {issues.map((s) => (
          <Link key={s.project_access_id} href={`/project/${s.project_access_id}`} style={{ color: "#b87300", fontWeight: 700, textDecoration: "none", fontSize: ".82rem" }}>
            {s.customer}
            {s.over_allocated > 0 && <span style={{ color: "#e74c3c" }}> ⚠ {s.over_allocated} over-allocated</span>}
            {s.pending_install > 0 && <span style={{ color: "#b87300" }}> · {s.pending_install} pending</span>}
          </Link>
        ))}
      </span>
    </div>
  );
}

export default function InventoryClient({ user, alerts, items, stats, projects, shortages = [] }) {
  const [filter, setFilter] = useState("all");
  const [cat, setCat]       = useState("all");
  const [sort, setSort]     = useState("category");
  const [query, setQuery]   = useState("");
  const [adding, setAdding] = useState(false);
  const [histItem, setHistItem] = useState(null);
  const [pending, startTx]  = useTransition();
  const router = useRouter();

  const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort();
  const q = query.trim().toLowerCase();
  const visible = items
    .filter((i) => filter === "all" ? true : filter === "stock" ? !i.project_access_id : !!i.project_access_id)
    .filter((i) => cat === "all" ? true : (i.category || "") === cat)
    .filter((i) => !q || i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q) || (i.category || "").toLowerCase().includes(q) || (i.project_customer || "").toLowerCase().includes(q) || (i.serials_blob || "").toLowerCase().includes(q))
    .slice()
    .sort((SORTS[sort] || SORTS.category).cmp);

  const [delItem, setDelItem] = useState(null);
  function confirmRemoveItem() {
    const id = delItem?.id;
    setDelItem(null);
    if (!id) return;
    startTx(async () => { await deleteItemAction(id); router.refresh(); });
  }

  const KPI = [
    { cls: "c-gold",  label: "Total Units",     val: stats.units,        big: true },
    { cls: "c-blue",  label: "In Stock",        val: stats.inStock,      big: true },
    { cls: "c-amber", label: "Deployed",        val: stats.deployed,     big: true },
    { cls: "c-green", label: "Inventory Value", val: money(stats.value) },
  ];

  return (
    <AdminShell user={user} alerts={alerts} active="inventory">
      <div className="apx-wrap">
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div><h1>Inventory</h1><div className="ph-sub">{stats.skus} item types · {stats.units} units · {money(stats.value)} on hand</div></div>
          <button className="btn btn-gold" onClick={() => setAdding(true)}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg> Add Inventory</button>
        </div>

        <div className="kpi-row k4">
          {KPI.map((k) => <div key={k.label} className={`kpi ${k.cls}`}><div className="k-label">{k.label}</div><div className="k-val" style={{ fontSize: k.big ? undefined : "1.35rem" }}>{k.val}</div></div>)}
        </div>

        <ShortageAlert shortages={shortages} />

        <div className="sec-head inv-toolbar">
          <div className="filters">
            {[["all", `All (${items.length})`], ["stock", "In Stock"], ["deployed", "Deployed"]].map(([k, lbl]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{lbl}</button>
            ))}
          </div>
          <div className="inv-controls">
            <select className="apx-input inv-sel" value={cat} onChange={(e) => setCat(e.target.value)} title="Filter by category">
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="apx-input inv-sel" value={sort} onChange={(e) => setSort(e.target.value)} title="Sort by">
              {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
            <input className="apx-input inv-search" placeholder="Search item, SKU, serial, project…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        <div className="panel mb">
          {visible.length === 0 ? <div className="empty">No items in this view.</div> : (
            <table className="dtable">
              <thead><tr><th>Item</th><th>Category</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Value</th><th>Assigned To</th><th>Used / Installed</th><th></th></tr></thead>
              <tbody>
                {visible.map((i) => {
                  const shortage = i.project_access_id && i.qty_for_project > i.quantity;
                  return (
                    <tr key={i.id} style={shortage ? { background: "rgba(231,76,60,.03)" } : undefined}>
                      <td>
                        <button className="inv-name-btn" onClick={() => setHistItem(i)} title="View item history">
                          {i.name}
                          {i.serial_count > 0 && <span className="inv-serial-badge" title={`${i.serial_count} serial${i.serial_count !== 1 ? "s" : ""} on file`}>{i.serial_count} SN</span>}
                        </button>
                        {i.sku && <div className="mono" style={{ color: "var(--muted)", fontSize: ".76rem" }}>{i.sku}{i.location ? ` · ${i.location}` : ""}</div>}
                        {shortage && <div style={{ fontSize: ".72rem", color: "#e74c3c", fontWeight: 700, marginTop: 2 }}>⚠ Qty needed exceeds stock</div>}
                      </td>
                      <td><span className="chip">{i.category || "—"}</span></td>
                      <td className="num">{i.quantity}</td>
                      <td className="num">{money(i.unit_cost)}</td>
                      <td className="num">{money(i.total_value)}</td>
                      <td><AssignCell item={i} projects={projects} /></td>
                      <td><UsedCell item={i} /></td>
                      <td className="num">
                        <button className="btn-icon-del" title="Remove item" onClick={() => setDelItem(i)} disabled={pending}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {adding && <AddInventoryModal items={items} projects={projects} onClose={() => setAdding(false)} onDone={() => { setAdding(false); router.refresh(); }} />}
      {histItem && <InventoryHistoryModal item={histItem} onClose={() => setHistItem(null)} />}

      <ConfirmDialog
        open={!!delItem}
        title="Remove this item?"
        message={<>“{delItem?.name}” will be moved to <strong>Archives</strong>. You can restore it from there anytime.</>}
        confirmLabel="Remove item"
        busy={pending}
        onConfirm={confirmRemoveItem}
        onCancel={() => setDelItem(null)}
      />

      <style>{`
        .apx .inv-shortage-banner{display:flex;align-items:center;gap:8px;background:rgba(224,154,58,.08);border:1px solid rgba(224,154,58,.3);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:.85rem;color:#7a4f00;flex-wrap:wrap}
        .apx .inv-shortage-banner svg{flex-shrink:0;stroke:#b87300}
        .apx .btn-icon-del,.btn-icon-del{width:28px;height:28px;border-radius:7px;background:transparent;border:1.5px solid rgba(231,76,60,.28);color:#e74c3c;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,border-color .12s;padding:0}
        .apx .btn-icon-del:hover,.btn-icon-del:hover{background:rgba(231,76,60,.08);border-color:#e74c3c}
        .apx .btn-icon-del:disabled,.btn-icon-del:disabled{opacity:.4;cursor:not-allowed}
        .apx .am-overlay{position:fixed;inset:0;background:rgba(14,19,32,.55);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
        .apx .am-box{position:relative;background:#fff;border-radius:22px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:26px 28px 28px;box-shadow:0 32px 80px -24px rgba(14,19,32,.5)}
        .apx .am-x{position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#9ca3af;line-height:1;padding:4px 8px;border-radius:8px}
        .apx .am-x:hover{background:var(--bg-soft);color:var(--ink)}
        .apx .am-head{margin-bottom:18px}
        .apx .am-head h2{font-family:'Bricolage Grotesque',sans-serif;font-size:1.3rem;font-weight:700;margin-bottom:6px}
        .apx .am-head p{color:var(--muted);font-size:.9rem}
        .apx .am-form{display:grid;gap:13px}
        .apx .am-row2{display:grid;grid-template-columns:1fr 1fr;gap:13px}
        .apx .am-field{display:flex;flex-direction:column;gap:5px}
        .apx .am-field label{font-size:.82rem;font-weight:600}
        .apx .am-opt{font-weight:400;color:var(--muted)}
        .apx .am-err{font-size:.85rem;color:var(--red);background:var(--red-soft);padding:8px 12px;border-radius:8px}
        .apx .am-submit{width:100%;padding:12px;background:var(--gold);color:var(--ink);border:none;border-radius:12px;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem;cursor:pointer;transition:.18s}
        .apx .am-submit:hover:not(:disabled){background:var(--ink);color:var(--gold)}
        .apx .am-submit:disabled{opacity:.6;cursor:not-allowed}
        @media(max-width:620px){.apx .am-row2{grid-template-columns:1fr}}
        /* Toolbar: category + sort + search */
        .apx .inv-toolbar{align-items:center;gap:12px;flex-wrap:wrap}
        .apx .inv-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto}
        .apx .inv-sel{width:auto;padding:7px 10px;font-size:.82rem;font-weight:600}
        .apx .inv-search{width:250px;max-width:100%}
        /* Clickable item name → history */
        .apx .inv-name-btn{display:inline-flex;align-items:center;gap:8px;background:none;border:none;padding:0;font-family:inherit;font-size:.9rem;font-weight:700;color:var(--ink);cursor:pointer;text-align:left}
        .apx .inv-name-btn:hover{color:var(--gold-deep,#8a6d2f)}
        .apx .inv-serial-badge{font-size:.62rem;font-weight:800;letter-spacing:.03em;color:#3257ff;background:#e8f0fe;border-radius:100px;padding:1px 7px;white-space:nowrap}
        /* Add modal: Single / Batch tabs + scan box */
        .apx .am-tabs{display:flex;gap:6px;margin-bottom:16px;background:var(--bg-soft);padding:4px;border-radius:11px}
        .apx .am-tabs button{flex:1;height:34px;border:none;border-radius:8px;background:none;font-family:inherit;font-size:.85rem;font-weight:800;color:var(--muted);cursor:pointer}
        .apx .am-tabs button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(14,19,32,.12)}
        .apx .am-scan{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.84rem;line-height:1.5;resize:vertical}
        .apx .am-scan-meta{display:flex;align-items:center;gap:12px;font-size:.78rem;color:var(--muted);margin-top:5px}
        .apx .am-scan-meta strong{color:var(--ink)}
        .apx .am-dup{color:#b45309}
        .apx .am-clear{margin-left:auto;background:none;border:none;color:var(--muted);font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer;text-decoration:underline}
        .apx .am-ok{font-size:.85rem;color:#1c8a45;background:rgba(28,138,69,.08);padding:8px 12px;border-radius:8px;font-weight:600}
        .apx .am-batch-actions{display:flex;gap:10px}
        .apx .am-batch-actions .am-submit{flex:1}
        .apx .am-done{padding:12px 20px;background:var(--bg-soft);color:var(--ink);border:1px solid var(--line);border-radius:12px;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem;cursor:pointer}
        .apx .am-done:hover{background:var(--line)}
      `}</style>
    </AdminShell>
  );
}

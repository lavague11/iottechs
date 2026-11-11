"use client";

import { useState, useMemo, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";
import ConfirmDialog from "../components/confirm-dialog";
import { addExpenseAction, importExpensesAction, deleteExpenseAction, updateExpenseStatusAction, bulkUpdateExpenseStatusAction, bulkDeleteExpenseAction } from "./actions";
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, ITEM_TYPES, SOURCES, SOURCE_DEFAULTS, COMMON_VENDORS, COMMON_DESCRIPTIONS,
  vendorColor, validateExpense, parseExpensesCSV, CSV_TEMPLATE, softDuplicate, sameReference,
} from "../../lib/expense-model";

const money = (n) => (Number(n) < 0 ? "−$" : "$") + Math.abs(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const normalizeStatus = (s) => s === "approved" ? "paid" : s === "rejected" ? "declined" : (s || "pending");

// A vendor chip (modal) or nothing. Readable text on the tint.
function VendorChip({ vendor }) {
  const c = vendorColor(vendor);
  if (!c) return null;
  return <span className="exp-vchip" style={{ background: c.bg, color: c.fg }}>{c.label}</span>;
}

// ------------------------------------------------------------------- Add modal
function AddModal({ projects, onClose, onAdded }) {
  const today = new Date().toISOString().slice(0, 10);
  const blank = { description: "", category: "Equipment", amount: "", vendor: "", access_id: "", spent_on: today, reference: "", payment_method: "", item_type: "", source: "" };
  const [f, setF] = useState(blank);
  const [errs, setErrs] = useState({});
  const [dup, setDup] = useState(null);        // { message } — awaiting "Save anyway"
  const [receipt, setReceipt] = useState(null); // { id, name, pdf }
  const [uploading, setUploading] = useState(false);
  const [pending, startTx] = useTransition();
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setDup(null); };

  // Picking a Source pre-fills payment method + vendor when empty.
  function pickSource(src) {
    setF((p) => {
      const d = SOURCE_DEFAULTS[src] || {};
      return { ...p, source: src, payment_method: p.payment_method || d.payment_method || "", vendor: p.vendor || d.vendor || "" };
    });
    setDup(null);
  }

  async function onReceipt(file) {
    if (!file) return;
    setUploading(true); setErrs((e) => ({ ...e, receipt: null }));
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("/api/receipt", { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
      if (r?.ok) setReceipt({ id: r.id, name: r.name, pdf: r.pdf }); else setErrs((e) => ({ ...e, receipt: r?.error || "Upload failed." }));
    } finally { setUploading(false); }
  }

  function doSubmit(force) {
    const { errors } = validateExpense(f);
    setErrs(errors);
    if (Object.keys(errors).length) return;
    startTx(async () => {
      const res = await addExpenseAction({ ...f, receipt_media_id: receipt?.id || null }, { force });
      if (res?.duplicate) { setDup({ message: res.message }); return; }
      if (res?.error) { setErrs(res.fieldErrors || { _: res.error }); return; }
      onAdded();
    });
  }

  const fieldErr = (k) => errs[k] && <div className="exp-ferr">{errs[k]}</div>;

  return (
    <div className="ex-overlay" onClick={(e) => { if (e.target.classList.contains("ex-overlay")) onClose(); }}>
      <div className="ex-box">
        <button className="ex-x" onClick={onClose}>×</button>
        <div className="ex-head"><h2>Add Expense</h2><p>Record a business cost, optionally tied to a project.</p></div>
        <form className="ex-form" onSubmit={(e) => { e.preventDefault(); doSubmit(false); }}>
          <div className="ex-f"><label>Description</label><input className="apx-input" list="exp-desc-list" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Type or pick a common item" />{fieldErr("description")}
            <datalist id="exp-desc-list">{COMMON_DESCRIPTIONS.map((d) => <option key={d} value={d} />)}</datalist>
          </div>

          <div className="ex-row2">
            <div className="ex-f"><label>Category</label><select className="apx-input" value={f.category} onChange={(e) => set("category", e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="ex-f"><label>Amount ($)</label><input className="apx-input" type="number" step="0.01" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" />{fieldErr("amount")}<div className="exp-hint">Negative = refund / credit</div></div>
          </div>

          <div className="ex-row2">
            <div className="ex-f"><label>Vendor <span className="opt">(optional)</span></label>
              <div className="exp-vendorrow"><input className="apx-input" list="exp-vendor-list" value={f.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="Type or pick" /><VendorChip vendor={f.vendor} /></div>
              <datalist id="exp-vendor-list">{COMMON_VENDORS.map((v) => <option key={v} value={v} />)}</datalist>
            </div>
            <div className="ex-f"><label>Date</label><input className="apx-input" type="date" value={f.spent_on} onChange={(e) => set("spent_on", e.target.value)} />{fieldErr("spent_on")}</div>
          </div>

          <div className="ex-row2">
            <div className="ex-f"><label>Source <span className="opt">(optional)</span></label>
              <select className="apx-input" value={f.source} onChange={(e) => pickSource(e.target.value)}>
                <option value="">—</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="ex-f"><label>Payment Method <span className="opt">(optional)</span></label>
              <select className="apx-input" value={f.payment_method} onChange={(e) => set("payment_method", e.target.value)}>
                <option value="">—</option>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="ex-row2">
            <div className="ex-f"><label>Item Type <span className="opt">(optional)</span></label>
              <select className="apx-input" value={f.item_type} onChange={(e) => set("item_type", e.target.value)}>
                <option value="">—</option>{ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="ex-f"><label>Reference # <span className="opt">(optional)</span></label><input className="apx-input" value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Order / invoice #" /></div>
          </div>

          <div className="ex-f"><label>Project <span className="opt">(optional)</span></label>
            <select className="apx-input" value={f.access_id} onChange={(e) => set("access_id", e.target.value)}>
              <option value="">— General / overhead —</option>
              {projects.map((p) => <option key={p.access_id} value={p.access_id}>{p.customer} ({p.access_id})</option>)}
            </select>
          </div>

          <div className="ex-f"><label>Receipt <span className="opt">(PDF, JPG, PNG, HEIC — 10MB)</span></label>
            {receipt ? (
              <div className="exp-receipt-ok"><a href={`/api/receipt/${receipt.id}`} target="_blank" rel="noreferrer">📎 {receipt.name}</a><button type="button" className="exp-link-x" onClick={() => setReceipt(null)}>remove</button></div>
            ) : (
              <input className="apx-input" type="file" accept=".pdf,image/*" disabled={uploading} onChange={(e) => onReceipt(e.target.files?.[0])} />
            )}
            {uploading && <div className="exp-hint">Uploading…</div>}
            {errs.receipt && <div className="exp-ferr">{errs.receipt}</div>}
          </div>

          {dup && (
            <div className="exp-dupwarn">
              <b>Possible duplicate.</b> {dup.message}
              <div className="exp-dup-acts"><button type="button" className="btn btn-sm" onClick={() => doSubmit(true)} disabled={pending}>Save anyway</button><button type="button" className="btn btn-sm btn-ghost" onClick={() => setDup(null)}>Cancel</button></div>
            </div>
          )}
          {errs._ && <div className="ex-err">{errs._}</div>}
          {!dup && <button className="ex-submit" type="submit" disabled={pending || uploading}>{pending ? "Adding…" : "Add Expense"}</button>}
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- CSV import modal
function ImportModal({ existing, onClose, onImported }) {
  const [rows, setRows] = useState(null);   // parsed+validated rows
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [pending, startTx] = useTransition();
  const inputRef = useRef(null);

  function onFile(file) {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseExpensesCSV(String(reader.result || ""));
      const evaluated = parsed.map((raw, i) => {
        const { cleaned, errors } = validateExpense(raw);
        // Duplicate vs the existing ledger (hard ref / soft) AND vs earlier rows in this same file.
        let dup = null;
        const refHit = cleaned.reference && existing.find((e) => sameReference(e.reference, cleaned.reference));
        const softHit = existing.find((e) => softDuplicate(e, cleaned));
        const selfHit = parsed.slice(0, i).find((p) => {
          const c = validateExpense(p).cleaned;
          return (cleaned.reference && sameReference(c.reference, cleaned.reference)) || softDuplicate(c, cleaned);
        });
        if (refHit || selfHit) dup = "reference"; else if (softHit) dup = "soft";
        const valid = Object.keys(errors).length === 0;
        return { raw, cleaned, errors, dup, valid, include: valid && !dup };   // dups unchecked by default
      });
      setRows(evaluated); setResult(null);
    };
    reader.readAsText(file);
  }

  const toggle = (i) => setRows((rs) => rs.map((r, j) => j === i ? { ...r, include: r.valid && !r.include } : r));
  const checked = rows ? rows.filter((r) => r.include) : [];

  function doImport() {
    startTx(async () => {
      const res = await importExpensesAction(checked.map((r) => r.raw));
      if (res?.ok) setResult({ imported: res.imported, skipped: res.skipped }); else setResult({ error: res?.error || "Import failed." });
    });
  }
  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "expenses-template.csv"; a.click();
  }

  return (
    <div className="ex-overlay" onClick={(e) => { if (e.target.classList.contains("ex-overlay")) onClose(); }}>
      <div className="ex-box ex-box-wide">
        <button className="ex-x" onClick={onClose}>×</button>
        <div className="ex-head"><h2>Import expenses from CSV</h2><p>Columns: date, description, category, amount, vendor, project, reference, payment_method, source, item_type.</p></div>

        {result ? (
          <div className="exp-import-result">
            {result.error ? <div className="ex-err">{result.error}</div> : <><h3>Imported {result.imported} expense{result.imported === 1 ? "" : "s"}.</h3>{result.skipped > 0 && <p>{result.skipped} row{result.skipped === 1 ? "" : "s"} skipped (invalid).</p>}</>}
            <button className="ex-submit" onClick={() => { onImported(); }}>Done</button>
          </div>
        ) : !rows ? (
          <div className="exp-import-pick">
            <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <button className="btn btn-gold" onClick={() => inputRef.current?.click()}>Choose a CSV file</button>
            <button className="btn btn-ghost" onClick={downloadTemplate}>Download template</button>
          </div>
        ) : (
          <>
            <div className="exp-import-bar">
              <span>{fileName} · {rows.length} rows · <b>{checked.length}</b> to import{rows.some((r) => !r.valid) ? ` · ${rows.filter((r) => !r.valid).length} invalid` : ""}{rows.some((r) => r.dup) ? ` · ${rows.filter((r) => r.dup).length} duplicate` : ""}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => { setRows(null); setFileName(""); }}>Choose another</button>
            </div>
            <div className="exp-preview-wrap">
              <table className="dtable exp-preview">
                <thead><tr><th></th><th>Date</th><th>Description</th><th>Category</th><th className="num">Amount</th><th>Vendor</th><th>Reference</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const c = vendorColor(r.cleaned.vendor);
                    return (
                      <tr key={i} className={!r.valid ? "exp-row-bad" : r.dup ? "exp-row-dup" : ""} style={c ? { boxShadow: `inset 4px 0 0 ${c.bg}` } : undefined}>
                        <td><input type="checkbox" checked={r.include} disabled={!r.valid} onChange={() => toggle(i)} /></td>
                        <td className={r.errors.spent_on ? "exp-cell-bad" : ""}>{r.cleaned.spent_on || r.raw.spent_on || "—"}</td>
                        <td className={r.errors.description ? "exp-cell-bad" : ""}>{r.cleaned.description}</td>
                        <td>{r.cleaned.category}</td>
                        <td className={`num ${r.errors.amount ? "exp-cell-bad" : ""}`}>{r.errors.amount ? (r.raw.amount || "—") : money(r.cleaned.amount)}</td>
                        <td>{r.cleaned.vendor || "—"}</td>
                        <td className="mono">{r.cleaned.reference || "—"}</td>
                        <td>{!r.valid ? <span className="chip chip-red">{Object.values(r.errors)[0]}</span> : r.dup === "reference" ? <span className="chip chip-red">Dup ref</span> : r.dup === "soft" ? <span className="chip chip-amber">Maybe dup</span> : <span className="chip chip-green">OK</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="ex-submit" onClick={doImport} disabled={pending || checked.length === 0}>{pending ? "Importing…" : `Import ${checked.length} expense${checked.length === 1 ? "" : "s"}`}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- expense detail (click a row)
function DetailModal({ expense: e, onClose }) {
  const c = vendorColor(e.vendor);
  const [imgOk, setImgOk] = useState(true);
  const Row = ({ label, children }) => (children || children === 0) ? <div className="exd-row"><span className="exd-k">{label}</span><span className="exd-v">{children}</span></div> : null;
  return (
    <div className="ex-overlay" onClick={(ev) => { if (ev.target.classList.contains("ex-overlay")) onClose(); }}>
      <div className="ex-box">
        <button className="ex-x" onClick={onClose}>×</button>
        <div className="ex-head"><h2>Expense detail</h2><p>{money(e.amount)} · {e.spent_on || "—"}</p></div>
        <div className="exd-desc">{e.description}</div>
        <div className="exd-grid">
          <Row label="Amount"><b style={Number(e.amount) < 0 ? { color: "var(--green)" } : undefined}>{money(e.amount)}</b></Row>
          <Row label="Category">{e.category || "—"}</Row>
          <Row label="Vendor">{e.vendor ? (c ? <span className="exp-vchip" style={{ background: c.bg, color: c.fg }}>{e.vendor}</span> : e.vendor) : "—"}</Row>
          <Row label="Payment">{e.payment_method}</Row>
          <Row label="Item Type">{e.item_type}</Row>
          <Row label="Source">{e.source}</Row>
          <Row label="Reference #">{e.reference ? <span className="mono">{e.reference}</span> : null}</Row>
          <Row label="Date">{e.spent_on}</Row>
          <Row label="Project">{e.access_id ? <a href={`/project/${e.access_id}`} className="idlink">{e.project_customer || e.access_id} →</a> : "General / overhead"}</Row>
          <Row label="Status">{normalizeStatus(e.status)}</Row>
        </div>
        <div className="exd-receipt">
          <div className="exd-k" style={{ marginBottom: 8 }}>Receipt</div>
          {e.receipt_media_id ? (
            <a href={`/api/receipt/${e.receipt_media_id}`} target="_blank" rel="noreferrer" className="exd-rlink">
              {imgOk
                ? <img src={`/api/receipt/${e.receipt_media_id}`} alt="Receipt" className="exd-img" onError={() => setImgOk(false)} />
                : <span className="exd-openlink">📎 Open receipt (PDF) →</span>}
            </a>
          ) : <div className="exp-hint">No receipt attached.</div>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- status cell (unchanged behavior)
function ExpStatusCell({ expense, onSaved }) {
  const [sel, setSel] = useState(normalizeStatus(expense.status));
  const [reason, setReason] = useState(expense.review_notes || "");
  const [payDate, setPayDate] = useState(expense.payment_date || "");
  const [payMethod, setPayMethod] = useState(expense.payment_method || "PayPal");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const STATUS_LABEL = { pending: "Pending", paid: "Paid", declined: "Declined" };
  const STATUS_CLS = { pending: "chip-amber", paid: "chip-green", declined: "chip-red" };
  async function save() {
    setSaving(true);
    const r = await updateExpenseStatusAction(expense.id, { status: sel, paymentDate: payDate, paymentMethod: payMethod, reviewNotes: reason });
    if (r?.ok) { onSaved(expense.id, sel, { payment_date: payDate, payment_method: payMethod, review_notes: reason }); setOpen(false); }
    setSaving(false);
  }
  if (!open) return <button className={`chip ${STATUS_CLS[sel] || "chip-amber"}`} style={{ cursor: "pointer", border: "none" }} onClick={() => setOpen(true)}>{STATUS_LABEL[sel] || sel}</button>;
  return (
    <div className="exp-inline-ctrl">
      <select className="apx-input" value={sel} onChange={(e) => setSel(e.target.value)} style={{ fontSize: ".8rem", padding: "4px 8px" }}>
        <option value="pending">Pending</option><option value="paid">Paid</option><option value="declined">Declined</option>
      </select>
      {sel === "declined" && <input className="apx-input" placeholder="Reason…" value={reason} onChange={(e) => setReason(e.target.value)} style={{ fontSize: ".8rem", padding: "4px 8px" }} />}
      {sel === "paid" && <>
        <input className="apx-input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={{ fontSize: ".8rem", padding: "4px 8px" }} />
        <select className="apx-input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ fontSize: ".8rem", padding: "4px 8px" }}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
      </>}
      <button className="btn btn-gold btn-sm" onClick={save} disabled={saving}>{saving ? "…" : "Save"}</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>✕</button>
    </div>
  );
}

// ------------------------------------------------------------------- page
export default function ExpensesClient({ user, alerts, expenses: initExpenses, projects }) {
  const [catFilter, setCatFilter] = useState("all");
  const [payFilter, setPayFilter] = useState("all");
  const [itemFilter, setItemFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [detail, setDetail] = useState(null);   // the expense opened in the detail view
  const [expenses, setExpenses] = useState(initExpenses);
  const [pending, startTx] = useTransition();
  const router = useRouter();
  const q = query.trim().toLowerCase();

  const visible = useMemo(() => expenses
    .filter((e) => catFilter === "all" || (e.category || "Other") === catFilter)
    .filter((e) => payFilter === "all" || (e.payment_method || "") === payFilter)
    .filter((e) => itemFilter === "all" || (e.item_type || "") === itemFilter)
    .filter((e) => !q || (e.description || "").toLowerCase().includes(q) || (e.vendor || "").toLowerCase().includes(q)
      || (e.reference || "").toLowerCase().includes(q) || (e.project_customer || "").toLowerCase().includes(q)),
    [expenses, catFilter, payFilter, itemFilter, q]);

  // Summary respects the active filters; plus the top vendor by spend in view.
  const stats = useMemo(() => {
    let total = 0; const byVendor = {};
    for (const e of visible) { const a = Number(e.amount) || 0; total += a; const v = (e.vendor || "General").trim() || "General"; byVendor[v] = (byVendor[v] || 0) + a; }
    const topVendor = Object.entries(byVendor).sort((a, b) => b[1] - a[1])[0] || null;
    return { total, count: visible.length, topVendor, byVendor };
  }, [visible]);

  const allCats = useMemo(() => [...new Set(expenses.map((e) => e.category || "Other"))], [expenses]);

  // Export exactly what's on screen (the active filter + search), as a CSV re-importable by this same tool.
  function exportVisibleCSV() {
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const cols = ["date", "description", "category", "amount", "vendor", "project", "reference", "payment_method", "source", "item_type"];
    const lines = [cols.join(",")].concat(visible.map((e) => [e.spent_on, e.description, e.category, e.amount, e.vendor, e.access_id, e.reference, e.payment_method, e.source, e.item_type].map(esc).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  const [delExp, setDelExp] = useState(null);
  function confirmRemove() { const id = delExp?.id; setDelExp(null); if (id) startTx(async () => { await deleteExpenseAction(id); router.refresh(); }); }
  function handleStatusSaved(id, status, fields) { setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, status, ...fields } : e)); }

  // bulk selection
  const [sel, setSel] = useState(() => new Set());
  const [bulkDel, setBulkDel] = useState(false);
  const visibleIds = visible.map((e) => e.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => sel.has(id));
  const toggleOne = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel((s) => visibleIds.every((id) => s.has(id)) ? new Set() : new Set(visibleIds));
  const clearSel = () => setSel(new Set());
  const today = () => new Date().toISOString().slice(0, 10);
  const bulkStatus = (status) => { const ids = [...sel]; startTx(async () => { await bulkUpdateExpenseStatusAction(ids, status, status === "paid" ? { paymentDate: today(), paymentMethod: "PayPal" } : {}); clearSel(); router.refresh(); }); };
  const bulkDelete = () => { const ids = [...sel]; setBulkDel(false); startTx(async () => { await bulkDeleteExpenseAction(ids); clearSel(); router.refresh(); }); };

  const KPI = [
    { cls: "c-red", label: "Total Spend", val: money(stats.total) },
    { cls: "c-amber", label: "Expenses", val: stats.count, big: true },
    { cls: "c-blue", label: "Top Vendor", val: stats.topVendor ? stats.topVendor[0] : "—", small: true },
    { cls: "c-purple", label: "Top Vendor Spend", val: stats.topVendor ? money(stats.topVendor[1]) : "$0" },
  ];
  const activeFilters = catFilter !== "all" || payFilter !== "all" || itemFilter !== "all" || q;

  return (
    <AdminShell user={user} alerts={alerts} active="expenses">
      <div className="apx-wrap">
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div><h1>Expenses</h1><div className="ph-sub">{stats.count} {activeFilters ? "shown" : "expenses"} · {money(stats.total)} total</div></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setImporting(true)}><svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg> Import CSV</button>
            <button className="btn btn-gold" onClick={() => setAdding(true)}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg> Add Expense</button>
          </div>
        </div>

        <div className="kpi-row k4">
          {KPI.map((k) => <div key={k.label} className={`kpi ${k.cls}`}><div className="k-label">{k.label}</div><div className="k-val" style={{ fontSize: k.big ? undefined : "1.2rem" }}>{k.val}</div></div>)}
        </div>

        <div className="exp-toolbar">
          <div className="exp-chips">
            <button className={catFilter === "all" ? "on" : ""} onClick={() => setCatFilter("all")}>All</button>
            {allCats.slice(0, 6).map((c) => <button key={c} className={catFilter === c ? "on" : ""} onClick={() => setCatFilter(c)}>{c}</button>)}
          </div>
          <div className="exp-controls">
            <select className="apx-input exp-fsel" value={payFilter} onChange={(e) => setPayFilter(e.target.value)}><option value="all">All payment</option>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
            <select className="apx-input exp-fsel" value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}><option value="all">All items</option>{ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            <input className="apx-input exp-search" placeholder="Search (desc, vendor, ref #)…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {activeFilters && <button className="btn btn-sm btn-ghost" onClick={() => { setCatFilter("all"); setPayFilter("all"); setItemFilter("all"); setQuery(""); }}>Reset</button>}
            <button className="btn btn-sm" onClick={exportVisibleCSV} title="Export the expenses currently shown"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 11l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg> Export</button>
          </div>
        </div>

        {sel.size > 0 && (
          <div className="exp-bulkbar">
            <span className="exp-bulk-count">{sel.size} selected</span>
            <div className="exp-bulk-acts">
              <button className="btn btn-sm" onClick={() => bulkStatus("paid")} disabled={pending}>Mark paid</button>
              <button className="btn btn-sm" onClick={() => bulkStatus("declined")} disabled={pending}>Decline</button>
              <button className="btn btn-sm" onClick={() => bulkStatus("pending")} disabled={pending}>Pending</button>
              <button className="btn btn-sm" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={() => setBulkDel(true)} disabled={pending}>Remove</button>
              <button className="btn btn-sm btn-ghost" onClick={clearSel}>Clear</button>
            </div>
          </div>
        )}

        <div className="panel mb exp-tablewrap">
          {visible.length === 0 ? <div className="empty">No expenses in this view.</div> : (
            <table className="dtable exp-table">
              <thead><tr><th className="exp-cb"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th><th>Description</th><th>Category</th><th>Vendor</th><th>Payment</th><th>Reference</th><th>Project</th><th>Date</th><th className="num">Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {visible.map((e) => {
                  const c = vendorColor(e.vendor);
                  return (
                    <tr key={e.id} className={`exp-rowclick${sel.has(e.id) ? " exp-row-sel" : ""}`} style={c ? { boxShadow: `inset 4px 0 0 ${c.bg}`, background: c.bg + "14" } : undefined} onClick={() => setDetail(e)}>
                      <td className="exp-cb" onClick={(ev) => ev.stopPropagation()}><input type="checkbox" checked={sel.has(e.id)} onChange={() => toggleOne(e.id)} aria-label={`Select ${e.description}`} /></td>
                      <td className="name-cell"><span className="exp-desc" title={e.description}>{e.description}</span>{e.receipt_media_id && <a href={`/api/receipt/${e.receipt_media_id}`} target="_blank" rel="noreferrer" className="exp-clip" title="View receipt" onClick={(ev) => ev.stopPropagation()}>📎</a>}</td>
                      <td><span className="chip">{e.category || "—"}</span></td>
                      <td>{e.vendor ? (c ? <span className="exp-vchip" style={{ background: c.bg, color: c.fg }}>{e.vendor}</span> : e.vendor) : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                      <td style={{ color: "var(--muted)" }}>{e.payment_method || "—"}</td>
                      <td className="mono" style={{ color: "var(--muted)" }}>{e.reference || "—"}</td>
                      <td>{e.access_id ? <Link href={`/project/${e.access_id}`} className="idlink">{e.project_customer || e.access_id} →</Link> : <span style={{ color: "var(--muted)" }}>General</span>}</td>
                      <td style={{ color: "var(--muted)" }}>{e.spent_on || "—"}</td>
                      <td className="num" style={Number(e.amount) < 0 ? { color: "var(--green)" } : undefined}>{money(e.amount)}</td>
                      <td onClick={(ev) => ev.stopPropagation()}><ExpStatusCell expense={e} onSaved={handleStatusSaved} /></td>
                      <td className="num" onClick={(ev) => ev.stopPropagation()}><button className="btn btn-ghost btn-sm" onClick={() => setDelExp(e)} disabled={pending}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {adding && <AddModal projects={projects} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); router.refresh(); }} />}
      {importing && <ImportModal existing={expenses} onClose={() => setImporting(false)} onImported={() => { setImporting(false); router.refresh(); }} />}
      {detail && <DetailModal expense={detail} onClose={() => setDetail(null)} />}

      <ConfirmDialog open={!!delExp} title="Remove this expense?" message={<>“{delExp?.description}” will be moved to <strong>Archives</strong>. You can restore it from there if needed.</>} confirmLabel="Remove expense" busy={pending} onConfirm={confirmRemove} onCancel={() => setDelExp(null)} />
      <ConfirmDialog open={bulkDel} title={`Remove ${sel.size} expense${sel.size === 1 ? "" : "s"}?`} message={<>The selected expenses move to <strong>Archives</strong> — you can restore them from there.</>} confirmLabel="Remove all" busy={pending} onConfirm={bulkDelete} onCancel={() => setBulkDel(false)} />

      <style>{EXP_CSS}</style>
    </AdminShell>
  );
}

const EXP_CSS = `
.apx .ex-overlay{position:fixed;inset:0;background:rgba(14,19,32,.55);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
.apx .ex-box{position:relative;background:#fff;border-radius:22px;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;padding:26px 28px 28px;box-shadow:0 32px 80px -24px rgba(14,19,32,.5)}
.apx .ex-box-wide{max-width:900px}
.apx .ex-x{position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#9ca3af;line-height:1;padding:4px 8px;border-radius:8px}
.apx .ex-x:hover{background:var(--bg-soft);color:var(--ink)}
.apx .ex-head{margin-bottom:14px}
.apx .ex-head h2{font-family:'Bricolage Grotesque',sans-serif;font-size:1.3rem;font-weight:700;margin-bottom:4px}
.apx .ex-head p{color:var(--muted);font-size:.86rem}
.apx .ex-form{display:grid;gap:11px}
.apx .ex-row2{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.apx .ex-f{display:flex;flex-direction:column;gap:5px;min-width:0}
.apx .ex-f label{font-size:.82rem;font-weight:600}
.apx .ex-f .opt{font-weight:400;color:var(--muted);font-size:.76rem}
.apx .ex-f .apx-input{min-height:44px}
.apx .exp-hint{font-size:.72rem;color:var(--muted)}
.apx .exp-ferr{font-size:.76rem;color:var(--red);font-weight:600}
.apx .exp-vendorrow{display:flex;gap:8px;align-items:center}
.apx .exp-vendorrow .apx-input{flex:1;min-width:0}
.apx .exp-vchip{display:inline-block;padding:3px 9px;border-radius:999px;font-size:.74rem;font-weight:700;white-space:nowrap}
.apx .exp-receipt-ok{display:flex;gap:10px;align-items:center;font-size:.86rem}
.apx .exp-receipt-ok a{color:var(--ink);font-weight:600}
.apx .exp-link-x{background:none;border:none;color:var(--red);cursor:pointer;font-size:.8rem}
.apx .ex-err{font-size:.85rem;color:var(--red);background:var(--red-soft);padding:8px 12px;border-radius:8px}
.apx .exp-dupwarn{font-size:.85rem;background:rgba(224,154,58,.12);border:1px solid rgba(224,154,58,.4);color:#7a5600;padding:11px 13px;border-radius:10px}
.apx .exp-dup-acts{display:flex;gap:8px;margin-top:10px}
.apx .ex-submit{width:100%;padding:13px;min-height:48px;background:var(--gold);color:var(--ink);border:none;border-radius:12px;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem;cursor:pointer;transition:.18s}
.apx .ex-submit:hover:not(:disabled){background:var(--ink);color:var(--gold)}
.apx .ex-submit:disabled{opacity:.6;cursor:not-allowed}
@media(max-width:620px){.apx .ex-row2{grid-template-columns:1fr}.apx .ex-box{padding:22px 18px 24px}}
.apx .exp-filters-head{flex-wrap:wrap;gap:10px}
.apx .exp-filter-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.apx .exp-fsel{max-width:150px;min-height:40px}
.apx .exp-import-pick{display:flex;gap:12px;flex-wrap:wrap;padding:20px 0}
.apx .exp-import-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;font-size:.84rem;color:var(--muted);margin-bottom:10px}
.apx .exp-preview-wrap{max-height:52vh;overflow:auto;border:1px solid var(--line);border-radius:12px;margin-bottom:14px}
.apx .exp-preview th,.apx .exp-preview td{font-size:.8rem;padding:7px 10px}
.apx .exp-row-bad{background:rgba(231,76,60,.06)}
.apx .exp-row-dup{background:rgba(224,154,58,.08)}
.apx .exp-cell-bad{color:var(--red);font-weight:600}
.apx .exp-import-result{text-align:center;padding:14px 0}
.apx .exp-import-result h3{font-size:1.1rem;margin-bottom:6px}
.apx .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82rem}
.apx .exp-clip{margin-left:7px;text-decoration:none;font-size:.9rem}
.apx .chip-amber{background:rgba(224,154,58,.12);color:#8a5f00;border:1px solid rgba(224,154,58,.3)}
.apx .chip-green{background:rgba(28,138,69,.1);color:#1c6b3a;border:1px solid rgba(28,138,69,.25)}
.apx .chip-red{background:rgba(231,76,60,.08);color:#a93226;border:1px solid rgba(231,76,60,.25)}
.apx .exp-inline-ctrl{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:4px 0}
.apx .exp-cb{width:36px;text-align:center}
.apx .exp-cb input{cursor:pointer;width:16px;height:16px}
.apx .exp-row-sel{background:rgba(201,169,110,.12)}
.apx .exp-tablewrap{overflow-x:auto}
.apx .exp-table td{vertical-align:top;padding-top:11px;padding-bottom:11px}
.apx .exp-table .name-cell{max-width:320px}
.apx .exp-desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.35;max-width:300px}
.apx .exp-table td:nth-child(8){white-space:nowrap}
.apx .exp-table .idlink{white-space:nowrap}
.apx .exp-vchip{max-width:140px;overflow:hidden;text-overflow:ellipsis}
.apx .exp-bulkbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--ink);color:#fff;border-radius:12px;padding:10px 16px;margin-bottom:12px}
.apx .exp-bulk-count{font-weight:700;font-size:.88rem}
.apx .exp-bulk-acts{display:flex;gap:8px;flex-wrap:wrap}
.apx .exp-bulkbar .btn{background:#fff;border:1px solid transparent}
.apx .exp-bulkbar .btn-ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,.3)}
.apx .exp-rowclick{cursor:pointer}
.apx .exp-rowclick:hover{background:var(--bg-soft)}
.apx .exp-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.apx .exp-chips{display:flex;gap:6px;flex-wrap:wrap}
.apx .exp-chips button{background:var(--bg-soft);border:1px solid var(--line);color:var(--muted);border-radius:999px;padding:6px 13px;font-size:.8rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:.15s}
.apx .exp-chips button:hover{color:var(--ink)}
.apx .exp-chips button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.apx .exp-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.apx .exp-controls .exp-fsel{max-width:150px;min-height:40px}
.apx .exp-search{min-height:40px;max-width:230px}
.apx .exp-controls .btn{min-height:40px;display:inline-flex;align-items:center;gap:6px}
.apx .exd-desc{font-size:.95rem;font-weight:600;line-height:1.4;margin-bottom:16px;color:var(--ink)}
.apx .exd-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;margin-bottom:20px}
.apx .exd-row{display:flex;flex-direction:column;gap:3px;min-width:0}
.apx .exd-k{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
.apx .exd-v{font-size:.9rem;color:var(--ink);min-width:0;overflow-wrap:anywhere}
.apx .exd-receipt{border-top:1px solid var(--line);padding-top:16px}
.apx .exd-rlink{display:block;text-decoration:none}
.apx .exd-img{max-width:100%;max-height:420px;border-radius:12px;border:1px solid var(--line);display:block}
.apx .exd-openlink{display:inline-block;padding:11px 15px;background:var(--bg-soft);border:1px solid var(--line);border-radius:10px;color:var(--ink);font-weight:600;font-size:.88rem}
@media(max-width:620px){.apx .exp-toolbar{flex-direction:column;align-items:stretch}.apx .exp-controls{width:100%}.apx .exp-search{max-width:none;flex:1}.apx .exd-grid{grid-template-columns:1fr}}
`;

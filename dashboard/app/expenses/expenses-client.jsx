"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";
import ConfirmDialog from "../components/confirm-dialog";
import { addExpenseAction, deleteExpenseAction, updateExpenseStatusAction, bulkUpdateExpenseStatusAction, bulkDeleteExpenseAction } from "./actions";

const money = (n) => "$" + (n || 0).toLocaleString();
const CATEGORIES = ["Equipment", "Materials", "Vehicle", "Gas", "Tolls", "Software", "Tools", "Insurance", "Operations", "Payroll", "Other"];
const PAY_METHODS = ["Cash","Check","Card","Zelle","ACH","Wire","Other"];

const normalizeStatus = (s) => s === "approved" || s === "rejected" ? (s === "approved" ? "paid" : "declined") : (s || "pending");

function ExpStatusCell({ expense, onSaved }) {
  const [sel, setSel]         = useState(normalizeStatus(expense.status));
  const [reason, setReason]   = useState(expense.review_notes || "");
  const [payDate, setPayDate] = useState(expense.payment_date || "");
  const [payMethod, setPayMethod] = useState(expense.payment_method || "Cash");
  const [open, setOpen]       = useState(false);
  const [saving, setSaving]   = useState(false);

  const STATUS_LABEL = { pending: "Pending", paid: "Paid", declined: "Declined" };
  const STATUS_CLS   = { pending: "chip-amber", paid: "chip-green", declined: "chip-red" };

  async function save() {
    setSaving(true);
    const r = await updateExpenseStatusAction(expense.id, { status: sel, paymentDate: payDate, paymentMethod: payMethod, reviewNotes: reason });
    if (r?.ok) { onSaved(expense.id, sel, { payment_date: payDate, payment_method: payMethod, review_notes: reason }); setOpen(false); }
    setSaving(false);
  }

  if (!open) return (
    <button className={`chip ${STATUS_CLS[sel] || "chip-amber"}`} style={{ cursor:"pointer", border:"none" }} onClick={() => setOpen(true)}>
      {STATUS_LABEL[sel] || sel}
    </button>
  );

  return (
    <div className="exp-inline-ctrl">
      <select className="apx-input" value={sel} onChange={e => setSel(e.target.value)} style={{ fontSize:".8rem", padding:"4px 8px" }}>
        <option value="pending">Pending</option>
        <option value="paid">Paid</option>
        <option value="declined">Declined</option>
      </select>
      {sel === "declined" && <input className="apx-input" placeholder="Reason…" value={reason} onChange={e => setReason(e.target.value)} style={{ fontSize:".8rem", padding:"4px 8px" }} />}
      {sel === "paid" && <>
        <input className="apx-input" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={{ fontSize:".8rem", padding:"4px 8px" }} />
        <select className="apx-input" value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ fontSize:".8rem", padding:"4px 8px" }}>
          {PAY_METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
      </>}
      <button className="btn btn-gold btn-sm" onClick={save} disabled={saving}>{saving ? "…" : "Save"}</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>✕</button>
    </div>
  );
}

function AddModal({ projects, onClose, onAdded }) {
  // The modal only mounts on an explicit click (no SSR), so a direct Date() default is safe here.
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ description: "", category: "Equipment", amount: "", vendor: "", access_id: "", spent_on: today });
  const [err, setErr] = useState("");
  const [pending, startTx] = useTransition();
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  function submit(e) {
    e.preventDefault(); setErr("");
    startTx(async () => {
      const res = await addExpenseAction({ ...f, amount: Number(f.amount) || 0, access_id: f.access_id || null });
      if (res.error) setErr(res.error); else onAdded();
    });
  }

  return (
    <div className="ex-overlay" onClick={(e) => { if (e.target.classList.contains("ex-overlay")) onClose(); }}>
      <div className="ex-box">
        <button className="ex-x" onClick={onClose}>×</button>
        <div className="ex-head"><h2>Add Expense</h2><p>Record a business cost, optionally tied to a project.</p></div>
        <form className="ex-form" onSubmit={submit}>
          <div className="ex-f"><label>Description</label><input className="apx-input" value={f.description} onChange={(e) => set("description", e.target.value)} required /></div>
          <div className="ex-row2">
            <div className="ex-f"><label>Category</label><select className="apx-input" value={f.category} onChange={(e) => set("category", e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="ex-f"><label>Amount ($)</label><input className="apx-input" type="number" min="0" value={f.amount} onChange={(e) => set("amount", e.target.value)} required /></div>
          </div>
          <div className="ex-row2">
            <div className="ex-f"><label>Vendor <span className="opt">(optional)</span></label><input className="apx-input" value={f.vendor} onChange={(e) => set("vendor", e.target.value)} /></div>
            <div className="ex-f"><label>Date</label><input className="apx-input" type="date" value={f.spent_on} onChange={(e) => set("spent_on", e.target.value)} /></div>
          </div>
          <div className="ex-f"><label>Project <span className="opt">(optional)</span></label>
            <select className="apx-input" value={f.access_id} onChange={(e) => set("access_id", e.target.value)}>
              <option value="">— General / overhead —</option>
              {projects.map((p) => <option key={p.access_id} value={p.access_id}>{p.customer} ({p.access_id})</option>)}
            </select>
          </div>
          {err && <div className="ex-err">{err}</div>}
          <button className="ex-submit" type="submit" disabled={pending}>{pending ? "Adding…" : "Add Expense"}</button>
        </form>
      </div>
    </div>
  );
}

export default function ExpensesClient({ user, alerts, expenses: initExpenses, stats, projects }) {
  const [filter, setFilter]   = useState("all");
  const [query, setQuery]     = useState("");
  const [adding, setAdding]   = useState(false);
  const [expenses, setExpenses] = useState(initExpenses);
  const [pending, startTx]    = useTransition();
  const router = useRouter();
  const q = query.trim().toLowerCase();

  const cats = Object.entries(stats.byCat).sort((a, b) => b[1] - a[1]);
  const visible = expenses
    .filter((e) => filter === "all" ? true : (e.category || "Other") === filter)
    .filter((e) => !q || e.description.toLowerCase().includes(q) || (e.vendor || "").toLowerCase().includes(q) || (e.project_customer || "").toLowerCase().includes(q));

  const [delExp, setDelExp] = useState(null);
  function confirmRemove() {
    const id = delExp?.id;
    setDelExp(null);
    if (!id) return;
    startTx(async () => { await deleteExpenseAction(id); router.refresh(); });
  }
  function handleStatusSaved(id, status, fields) {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, status, ...fields } : e));
  }

  // ---- Bulk selection ----
  const [sel, setSel] = useState(() => new Set());
  const [bulkDel, setBulkDel] = useState(false);
  const visibleIds = visible.map((e) => e.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => sel.has(id));
  const toggleOne = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel((s) => { if (visibleIds.every((id) => s.has(id))) return new Set(); return new Set(visibleIds); });
  const clearSel = () => setSel(new Set());
  const today = () => new Date().toISOString().slice(0, 10);
  function bulkStatus(status) {
    const ids = [...sel];
    startTx(async () => {
      await bulkUpdateExpenseStatusAction(ids, status, status === "paid" ? { paymentDate: today(), paymentMethod: "Cash" } : {});
      clearSel(); router.refresh();
    });
  }
  function bulkDelete() {
    const ids = [...sel];
    setBulkDel(false);
    startTx(async () => { await bulkDeleteExpenseAction(ids); clearSel(); router.refresh(); });
  }

  const KPI = [
    { cls: "c-red",   label: "Total Spend", val: money(stats.total) },
    { cls: "c-amber", label: "Expenses",    val: stats.count, big: true },
    { cls: "c-blue",  label: "Top Category", val: cats[0] ? cats[0][0] : "—", small: true },
    { cls: "c-purple",label: "Top Amount",  val: cats[0] ? money(cats[0][1]) : "$0" },
  ];

  return (
    <AdminShell user={user} alerts={alerts} active="expenses">
      <div className="apx-wrap">
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div><h1>Expenses</h1><div className="ph-sub">{stats.count} expenses · {money(stats.total)} total</div></div>
          <button className="btn btn-gold" onClick={() => setAdding(true)}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg> Add Expense</button>
        </div>

        <div className="kpi-row k4">
          {KPI.map((k) => <div key={k.label} className={`kpi ${k.cls}`}><div className="k-label">{k.label}</div><div className="k-val" style={{ fontSize: k.big ? undefined : k.small ? "1.2rem" : "1.35rem" }}>{k.val}</div></div>)}
        </div>

        <div className="sec-head">
          <div className="filters">
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All</button>
            {cats.slice(0, 5).map(([c]) => <button key={c} className={filter === c ? "on" : ""} onClick={() => setFilter(c)}>{c}</button>)}
          </div>
          <input className="apx-input" style={{ maxWidth: 300 }} placeholder="Search expenses…" value={query} onChange={(e) => setQuery(e.target.value)} />
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

        <div className="panel mb">
          {visible.length === 0 ? <div className="empty">No expenses in this view.</div> : (
            <table className="dtable">
              <thead><tr><th className="exp-cb"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th><th>Description</th><th>Category</th><th>Vendor</th><th>Submitted By</th><th>Project</th><th>Date</th><th className="num">Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id} className={sel.has(e.id) ? "exp-row-sel" : ""}>
                    <td className="exp-cb"><input type="checkbox" checked={sel.has(e.id)} onChange={() => toggleOne(e.id)} aria-label={`Select ${e.description}`} /></td>
                    <td className="name-cell">{e.description}</td>
                    <td><span className="chip">{e.category || "—"}</span></td>
                    <td style={{ color: "var(--muted)" }}>{e.vendor || "—"}</td>
                    <td style={{ color: "var(--muted)" }}>{e.submitted_by_name || "—"}</td>
                    <td>{e.access_id ? <Link href={`/project/${e.access_id}`} className="idlink">{e.project_customer || e.access_id} →</Link> : <span style={{ color: "var(--muted)" }}>General</span>}</td>
                    <td style={{ color: "var(--muted)" }}>{e.spent_on || "—"}</td>
                    <td className="num">{money(e.amount)}</td>
                    <td><ExpStatusCell expense={e} onSaved={handleStatusSaved} /></td>
                    <td className="num"><button className="btn btn-ghost btn-sm" onClick={() => setDelExp(e)} disabled={pending}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {adding && <AddModal projects={projects} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); router.refresh(); }} />}

      <ConfirmDialog
        open={!!delExp}
        title="Remove this expense?"
        message={<>“{delExp?.description}” will be moved to <strong>Archives</strong>. You can restore it from there if needed.</>}
        confirmLabel="Remove expense"
        busy={pending}
        onConfirm={confirmRemove}
        onCancel={() => setDelExp(null)}
      />

      <ConfirmDialog
        open={bulkDel}
        title={`Remove ${sel.size} expense${sel.size === 1 ? "" : "s"}?`}
        message={<>The selected expenses move to <strong>Archives</strong> — you can restore them from there.</>}
        confirmLabel="Remove all"
        busy={pending}
        onConfirm={bulkDelete}
        onCancel={() => setBulkDel(false)}
      />

      <style>{`
        .apx .ex-overlay{position:fixed;inset:0;background:rgba(14,19,32,.55);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
        .apx .ex-box{position:relative;background:#fff;border-radius:22px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:26px 28px 28px;box-shadow:0 32px 80px -24px rgba(14,19,32,.5)}
        .apx .ex-x{position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#9ca3af;line-height:1;padding:4px 8px;border-radius:8px}
        .apx .ex-x:hover{background:var(--bg-soft);color:var(--ink)}
        .apx .ex-head{margin-bottom:18px}
        .apx .ex-head h2{font-family:'Bricolage Grotesque',sans-serif;font-size:1.3rem;font-weight:700;margin-bottom:6px}
        .apx .ex-head p{color:var(--muted);font-size:.9rem}
        .apx .ex-form{display:grid;gap:13px}
        .apx .ex-row2{display:grid;grid-template-columns:1fr 1fr;gap:13px}
        .apx .ex-f{display:flex;flex-direction:column;gap:5px}
        .apx .ex-f label{font-size:.82rem;font-weight:600}
        .apx .ex-f .opt{font-weight:400;color:var(--muted)}
        .apx .ex-err{font-size:.85rem;color:var(--red);background:var(--red-soft);padding:8px 12px;border-radius:8px}
        .apx .ex-submit{width:100%;padding:12px;background:var(--gold);color:var(--ink);border:none;border-radius:12px;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem;cursor:pointer;transition:.18s}
        .apx .ex-submit:hover:not(:disabled){background:var(--ink);color:var(--gold)}
        .apx .ex-submit:disabled{opacity:.6;cursor:not-allowed}
        @media(max-width:620px){.apx .ex-row2{grid-template-columns:1fr}}
        .apx .chip-amber{background:rgba(224,154,58,.12);color:#8a5f00;border:1px solid rgba(224,154,58,.3)}
        .apx .chip-green{background:rgba(28,138,69,.1);color:#1c6b3a;border:1px solid rgba(28,138,69,.25)}
        .apx .chip-red{background:rgba(231,76,60,.08);color:#a93226;border:1px solid rgba(231,76,60,.25)}
        .apx .exp-inline-ctrl{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:4px 0}
        .apx .exp-cb{width:36px;text-align:center}
        .apx .exp-cb input{cursor:pointer;width:15px;height:15px}
        .apx .exp-row-sel{background:rgba(201,169,110,.08)}
        .apx .exp-bulkbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--ink);color:#fff;border-radius:12px;padding:10px 16px;margin-bottom:12px}
        .apx .exp-bulk-count{font-weight:700;font-size:.88rem}
        .apx .exp-bulk-acts{display:flex;gap:8px;flex-wrap:wrap}
        .apx .exp-bulkbar .btn{background:#fff;border:1px solid transparent}
        .apx .exp-bulkbar .btn-ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,.3)}
      `}</style>
    </AdminShell>
  );
}

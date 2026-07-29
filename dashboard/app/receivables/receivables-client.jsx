"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Owner's buckets: unsigned = pending, signed = 50% due, completed = 100% due, closed-unsigned = a dead job.
const BUCKET = {
  pending:   { label: "Pending",         cls: "warn", due: "Tentative" },
  signed:    { label: "Signed · 50%",    cls: "sent", due: "Deposit due" },
  completed: { label: "Completed · 100%", cls: "ok",  due: "Balance due" },
  jobs:      { label: "Job · unsigned",  cls: "dead", due: "—" },
};

// Accounts Receivable — balances bucketed by how firm the money is. Firm dues (signed 50% +
// completed 100%) drive "Outstanding"; unsigned totals show as "Pending"; closed-unsigned are Jobs.
export default function ReceivablesClient({ user, alerts, rows = [] }) {
  const [query, setQuery]   = useState("");
  const [filter, setFilter] = useState("all");   // all | pending | signed | completed | jobs
  const [sort, setSort]     = useState("balance"); // balance | total | aging

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = rows.filter((r) => {
      if (filter !== "all" && r.bucket !== filter) return false;
      if (!q) return true;
      return r.customer.toLowerCase().includes(q)
        || r.access_id.toLowerCase().includes(q)
        || (r.address || "").toLowerCase().includes(q);
    });
    const key = sort === "aging" ? (r) => r.daysOut : sort === "total" ? (r) => r.total : (r) => r.balance;
    return [...list].sort((a, b) => key(b) - key(a));
  }, [rows, q, filter, sort]);

  const sums = useMemo(() => {
    const s = { firm: 0, pending: 0, collected: 0, billed: 0, jobsCount: 0, jobsValue: 0,
                counts: { pending: 0, signed: 0, completed: 0, jobs: 0 } };
    for (const r of rows) {
      s.counts[r.bucket] = (s.counts[r.bucket] || 0) + 1;
      if (r.bucket === "jobs") { s.jobsCount++; s.jobsValue += r.total; continue; }
      s.billed += r.total; s.collected += r.paid;
      if (r.bucket === "pending") s.pending += r.balance;
      else s.firm += r.balance;   // signed + completed
    }
    return s;
  }, [rows]);

  return (
    <AdminShell user={user} alerts={alerts} active="receivables">
      <div className="apx-wrap">
        <div className="page-head arx-head">
          <div>
            <h1>Accounts Receivable</h1>
            <div className="ph-sub">{money(sums.firm)} due now · {money(sums.pending)} pending · {sums.jobsCount} dead job{sums.jobsCount === 1 ? "" : "s"}</div>
          </div>
        </div>

        <div className="arx-tiles">
          <div className="arx-tile out">
            <span className="arx-tile-lbl">Outstanding · due now</span>
            <span className="arx-tile-val">{money(sums.firm)}</span>
            <span className="arx-tile-sub">signed (50%) + completed (100%)</span>
          </div>
          <div className="arx-tile">
            <span className="arx-tile-lbl">Pending</span>
            <span className="arx-tile-val">{money(sums.pending)}</span>
            <span className="arx-tile-sub">{sums.counts.pending} unsigned · tentative</span>
          </div>
          <div className="arx-tile">
            <span className="arx-tile-lbl">Collected</span>
            <span className="arx-tile-val">{money(sums.collected)}</span>
            <span className="arx-tile-sub">of {money(sums.billed)} billed</span>
          </div>
          <div className="arx-tile">
            <span className="arx-tile-lbl">Jobs · closed unsigned</span>
            <span className="arx-tile-val">{sums.jobsCount}</span>
            <span className="arx-tile-sub">{money(sums.jobsValue)} never closed</span>
          </div>
        </div>

        <div className="sec-head">
          <input className="apx-input" style={{ maxWidth: 360 }} placeholder="Search customer, address, or project ID…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="arx-tabs">
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All {rows.length}</button>
            <button className={filter === "pending" ? "on" : ""} onClick={() => setFilter("pending")}>Pending {sums.counts.pending}</button>
            <button className={filter === "signed" ? "on" : ""} onClick={() => setFilter("signed")}>Signed {sums.counts.signed}</button>
            <button className={filter === "completed" ? "on" : ""} onClick={() => setFilter("completed")}>Completed {sums.counts.completed}</button>
            <button className={filter === "jobs" ? "on" : ""} onClick={() => setFilter("jobs")}>Jobs {sums.counts.jobs}</button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">{q ? "No projects match." : "Nothing here."}</div></div>
        ) : (
          <div className="arx-table-wrap">
            <table className="arx-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Project</th>
                  <th>Stage</th>
                  <th className="r sortable" onClick={() => setSort("total")}>Total{sort === "total" ? " ↓" : ""}</th>
                  <th className="r">Due now</th>
                  <th className="r">Paid</th>
                  <th className="r sortable" onClick={() => setSort("balance")}>Balance{sort === "balance" ? " ↓" : ""}</th>
                  <th className="r sortable" onClick={() => setSort("aging")}>Aging{sort === "aging" ? " ↓" : ""}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const b = BUCKET[r.bucket] || BUCKET.pending;
                  const isJob = r.bucket === "jobs";
                  return (
                    <tr key={r.access_id} className={isJob ? "dead" : ""}>
                      <td>
                        <Link className="arx-cust" href={`/project/${r.access_id}`}>{r.customer}</Link>
                        {r.address && <span className="arx-addr">{r.address}</span>}
                      </td>
                      <td><Link className="arx-pid" href={`/project/${r.access_id}`}>{r.access_id}</Link></td>
                      <td>
                        <span className={`arx-chip ${b.cls}`}>{b.label}</span>
                        {r.pending > 0 && <span className="arx-chip pend" title="Customer-submitted, awaiting your confirmation">{money(r.pending)} pending</span>}
                      </td>
                      <td className="r">{money(r.total)}</td>
                      <td className="r arx-due">{isJob ? "—" : money(r.expected)}</td>
                      <td className="r arx-paid">{money(r.paid)}</td>
                      <td className={`r arx-bal${isJob ? " zero" : r.paidInFull ? " zero" : ""}`}>
                        {isJob ? "—" : r.paidInFull ? "Paid" : money(r.balance)}
                      </td>
                      <td className={`r arx-age${!isJob && !r.paidInFull && r.daysOut > 30 ? " over" : ""}`}>{isJob ? "—" : `${r.daysOut}d`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <style>{CSS}</style>
    </AdminShell>
  );
}

const CSS = `
.apx .arx-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.apx .arx-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:4px 0 18px}
.apx .arx-tile{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:3px}
.apx .arx-tile.out{border-color:var(--gold,#C9A96E);background:#fbf7ef}
.apx .arx-tile-lbl{font-size:.68rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
.apx .arx-tile-val{font-size:1.7rem;font-weight:800;color:var(--ink);line-height:1.05}
.apx .arx-tile.out .arx-tile-val{color:var(--gold-deep,#b08f4f)}
.apx .arx-tile-sub{font-size:.72rem;color:var(--muted)}
.apx .arx-tabs{display:flex;gap:6px;flex-wrap:wrap}
.apx .arx-tabs button{height:34px;padding:0 13px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.apx .arx-tabs button.on{background:var(--gold-deep,#b08f4f);border-color:var(--gold-deep,#b08f4f);color:#fff}
.apx .arx-table-wrap{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:14px}
.apx .arx-table{width:100%;border-collapse:collapse;font-size:.85rem;min-width:780px}
.apx .arx-table th{text-align:left;font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding:12px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
.apx .arx-table th.r,.apx .arx-table td.r{text-align:right}
.apx .arx-table th.sortable{cursor:pointer;user-select:none}
.apx .arx-table th.sortable:hover{color:var(--gold-deep,#b08f4f)}
.apx .arx-table td{padding:11px 14px;border-bottom:1px solid var(--bg-soft,#f0eee9);vertical-align:middle}
.apx .arx-table tr:last-child td{border-bottom:none}
.apx .arx-table tbody tr:hover{background:var(--bg-tint,#faf7f1)}
.apx .arx-table tbody tr.dead{opacity:.6}
.apx .arx-cust{font-weight:700;color:var(--ink);text-decoration:none;display:block}
.apx .arx-cust:hover{color:var(--gold-deep,#b08f4f);text-decoration:underline}
.apx .arx-addr{display:block;font-size:.7rem;color:var(--muted)}
.apx .arx-pid{font-family:Menlo,Consolas,monospace;font-size:.78rem;font-weight:600;color:var(--gold-deep,#b08f4f);text-decoration:none}
.apx .arx-pid:hover{text-decoration:underline}
.apx .arx-chip{display:inline-block;font-size:.6rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:2px 8px;border-radius:100px;color:#fff;white-space:nowrap}
.apx .arx-chip.ok{background:var(--green,#1c8a45)}
.apx .arx-chip.sent{background:var(--gold-deep,#b08f4f)}
.apx .arx-chip.warn{background:#c98a1e}
.apx .arx-chip.dead{background:#8a94ad}
.apx .arx-chip.pend{background:#fff;color:#8a6d1e;border:1px solid #e6cf8a;margin-left:6px}
.apx .arx-due{font-weight:700;color:var(--ink)}
.apx .arx-paid{color:var(--muted)}
.apx .arx-bal{font-weight:800;color:#c0392b}
.apx .arx-bal.zero{color:var(--green,#1c8a45);font-weight:700}
.apx .arx-age{color:var(--muted);white-space:nowrap}
.apx .arx-age.over{color:#c0392b;font-weight:700}
`;

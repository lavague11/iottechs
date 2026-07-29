"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS = {
  sent:               { label: "Sent", cls: "sent" },
  changes_requested:  { label: "Changes", cls: "warn" },
  accepted:           { label: "Accepted", cls: "ok" },
};

// Accounts Receivable — outstanding balances across billed projects. Summary tiles + a table
// sorted by what's owed (biggest first), with Outstanding / Paid / All tabs and search.
export default function ReceivablesClient({ user, alerts, rows = [] }) {
  const [query, setQuery]   = useState("");
  const [filter, setFilter] = useState("open");   // open (default) | paid | all
  const [sort, setSort]     = useState("balance"); // balance | aging | total

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = rows.filter((r) => {
      if (filter === "open" && r.paidInFull) return false;
      if (filter === "paid" && !r.paidInFull) return false;
      if (!q) return true;
      return r.customer.toLowerCase().includes(q)
        || r.access_id.toLowerCase().includes(q)
        || (r.address || "").toLowerCase().includes(q);
    });
    const key = sort === "aging" ? (r) => r.daysOut : sort === "total" ? (r) => r.total : (r) => r.balance;
    return [...list].sort((a, b) => key(b) - key(a));
  }, [rows, q, filter, sort]);

  // Portfolio totals (all billed projects, regardless of the active tab).
  const sums = useMemo(() => rows.reduce((a, r) => ({
    billed: a.billed + r.total,
    collected: a.collected + r.paid,
    outstanding: a.outstanding + r.balance,
    pending: a.pending + r.pending,
    openCount: a.openCount + (r.paidInFull ? 0 : 1),
    overdue: a.overdue + (!r.paidInFull && r.daysOut > 30 ? 1 : 0),
  }), { billed: 0, collected: 0, outstanding: 0, pending: 0, openCount: 0, overdue: 0 }), [rows]);

  const openCount = rows.filter((r) => !r.paidInFull).length;
  const paidCount = rows.length - openCount;

  return (
    <AdminShell user={user} alerts={alerts} active="receivables">
      <div className="apx-wrap">
        <div className="page-head arx-head">
          <div>
            <h1>Accounts Receivable</h1>
            <div className="ph-sub">{openCount} of {rows.length} billed project{rows.length === 1 ? "" : "s"} still owe a balance</div>
          </div>
        </div>

        <div className="arx-tiles">
          <div className="arx-tile out">
            <span className="arx-tile-lbl">Outstanding</span>
            <span className="arx-tile-val">{money(sums.outstanding)}</span>
            <span className="arx-tile-sub">{sums.openCount} open{sums.overdue ? ` · ${sums.overdue} over 30d` : ""}</span>
          </div>
          <div className="arx-tile">
            <span className="arx-tile-lbl">Collected</span>
            <span className="arx-tile-val">{money(sums.collected)}</span>
            <span className="arx-tile-sub">of {money(sums.billed)} billed</span>
          </div>
          <div className="arx-tile">
            <span className="arx-tile-lbl">Pending confirmation</span>
            <span className="arx-tile-val">{money(sums.pending)}</span>
            <span className="arx-tile-sub">customer-submitted, unconfirmed</span>
          </div>
          <div className="arx-tile">
            <span className="arx-tile-lbl">Collection rate</span>
            <span className="arx-tile-val">{sums.billed > 0 ? Math.round((sums.collected / sums.billed) * 100) : 0}%</span>
            <span className="arx-tile-sub">collected ÷ billed</span>
          </div>
        </div>

        <div className="sec-head">
          <input className="apx-input" style={{ maxWidth: 380 }} placeholder="Search customer, address, or project ID…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="arx-tabs">
            <button className={filter === "open" ? "on" : ""} onClick={() => setFilter("open")}>Outstanding {openCount}</button>
            <button className={filter === "paid" ? "on" : ""} onClick={() => setFilter("paid")}>Paid in full {paidCount}</button>
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All {rows.length}</button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">{q ? "No projects match." : "Nothing outstanding — all billed projects are paid in full."}</div></div>
        ) : (
          <div className="arx-table-wrap">
            <table className="arx-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th className="r sortable" onClick={() => setSort("total")}>Total{sort === "total" ? " ↓" : ""}</th>
                  <th className="r">Paid</th>
                  <th className="r sortable" onClick={() => setSort("balance")}>Balance{sort === "balance" ? " ↓" : ""}</th>
                  <th className="r sortable" onClick={() => setSort("aging")}>Aging{sort === "aging" ? " ↓" : ""}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const st = STATUS[r.status] || { label: r.status, cls: "sent" };
                  return (
                    <tr key={r.access_id}>
                      <td>
                        <Link className="arx-cust" href={`/project/${r.access_id}`}>{r.customer}</Link>
                        {r.address && <span className="arx-addr">{r.address}</span>}
                      </td>
                      <td><Link className="arx-pid" href={`/project/${r.access_id}`}>{r.access_id}</Link></td>
                      <td>
                        <span className={`arx-chip ${st.cls}`}>{r.signed ? "Signed" : st.label}</span>
                        {r.pending > 0 && <span className="arx-chip pend" title="Customer-submitted, awaiting your confirmation">{money(r.pending)} pending</span>}
                      </td>
                      <td className="r">{money(r.total)}</td>
                      <td className="r arx-paid">{money(r.paid)}</td>
                      <td className={`r arx-bal${r.paidInFull ? " zero" : ""}`}>{r.paidInFull ? "Paid" : money(r.balance)}</td>
                      <td className={`r arx-age${!r.paidInFull && r.daysOut > 30 ? " over" : ""}`}>{r.paidInFull ? "—" : `${r.daysOut}d`}</td>
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
.apx .arx-tabs{display:flex;gap:6px}
.apx .arx-tabs button{height:34px;padding:0 14px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.apx .arx-tabs button.on{background:var(--gold-deep,#b08f4f);border-color:var(--gold-deep,#b08f4f);color:#fff}
.apx .arx-table-wrap{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:14px}
.apx .arx-table{width:100%;border-collapse:collapse;font-size:.85rem;min-width:720px}
.apx .arx-table th{text-align:left;font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding:12px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
.apx .arx-table th.r,.apx .arx-table td.r{text-align:right}
.apx .arx-table th.sortable{cursor:pointer;user-select:none}
.apx .arx-table th.sortable:hover{color:var(--gold-deep,#b08f4f)}
.apx .arx-table td{padding:11px 14px;border-bottom:1px solid var(--bg-soft,#f0eee9);vertical-align:middle}
.apx .arx-table tr:last-child td{border-bottom:none}
.apx .arx-table tbody tr:hover{background:var(--bg-tint,#faf7f1)}
.apx .arx-cust{font-weight:700;color:var(--ink);text-decoration:none;display:block}
.apx .arx-cust:hover{color:var(--gold-deep,#b08f4f);text-decoration:underline}
.apx .arx-addr{display:block;font-size:.7rem;color:var(--muted)}
.apx .arx-pid{font-family:Menlo,Consolas,monospace;font-size:.78rem;font-weight:600;color:var(--gold-deep,#b08f4f);text-decoration:none}
.apx .arx-pid:hover{text-decoration:underline}
.apx .arx-chip{display:inline-block;font-size:.6rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:2px 8px;border-radius:100px;color:#fff}
.apx .arx-chip.ok{background:var(--green,#1c8a45)}
.apx .arx-chip.sent{background:var(--gold-deep,#b08f4f)}
.apx .arx-chip.warn{background:#c98a1e}
.apx .arx-chip.pend{background:#fff;color:#8a6d1e;border:1px solid #e6cf8a;margin-left:6px}
.apx .arx-paid{color:var(--muted)}
.apx .arx-bal{font-weight:800;color:#c0392b}
.apx .arx-bal.zero{color:var(--green,#1c8a45);font-weight:700}
.apx .arx-age{color:var(--muted);white-space:nowrap}
.apx .arx-age.over{color:#c0392b;font-weight:700}
`;

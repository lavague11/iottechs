"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminShell from "../components/admin-shell";
import { archiveReceivableAction } from "./actions";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Owner's buckets: unsigned = pending, signed = 50% due, completed = 100% due, closed-unsigned = a dead job.
const BUCKET = {
  pending:   { label: "Pending",         cls: "warn" },
  signed:    { label: "Signed · 50%",    cls: "sent" },
  completed: { label: "Completed · 100%", cls: "ok"  },
  jobs:      { label: "Job · unsigned",  cls: "dead" },
};

export default function ReceivablesClient({ user, alerts, rows = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery]   = useState("");
  const [filter, setFilter] = useState("all");   // all | pending | signed | completed | jobs | archived
  const [sort, setSort]     = useState("balance"); // balance | total | aging
  const [from, setFrom]     = useState("");        // billed-date range (inclusive)
  const [to, setTo]         = useState("");
  const [busyId, setBusyId] = useState(null);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = rows.filter((r) => {
      if (filter === "archived") { if (!r.archived) return false; }
      else { if (r.archived) return false; if (filter !== "all" && r.bucket !== filter) return false; }
      if (from && (!r.billedAt || r.billedAt < from)) return false;
      if (to && (!r.billedAt || r.billedAt > to)) return false;
      if (!q) return true;
      return r.customer.toLowerCase().includes(q)
        || r.access_id.toLowerCase().includes(q)
        || (r.address || "").toLowerCase().includes(q);
    });
    const key = sort === "aging" ? (r) => r.daysOut : sort === "total" ? (r) => r.total : (r) => r.balance;
    return [...list].sort((a, b) => key(b) - key(a));
  }, [rows, q, filter, sort, from, to]);

  // Portfolio sums — active (non-archived) rows only, and respecting the date range so the tiles
  // track what's on screen for the selected period.
  const sums = useMemo(() => {
    const inRange = (r) => (!from || (r.billedAt && r.billedAt >= from)) && (!to || (r.billedAt && r.billedAt <= to));
    const s = { firm: 0, pending: 0, collected: 0, billed: 0, jobsCount: 0, jobsValue: 0,
                counts: { pending: 0, signed: 0, completed: 0, jobs: 0, archived: 0 } };
    for (const r of rows) {
      if (r.archived) { s.counts.archived++; continue; }
      if (!inRange(r)) continue;
      s.counts[r.bucket] = (s.counts[r.bucket] || 0) + 1;
      if (r.bucket === "jobs") { s.jobsCount++; s.jobsValue += r.total; continue; }
      s.billed += r.total; s.collected += r.paid;
      if (r.bucket === "pending") s.pending += r.balance;
      else s.firm += r.balance;
    }
    return s;
  }, [rows, from, to]);

  const activeCount = rows.filter((r) => !r.archived).length;

  function toggleArchive(r) {
    setBusyId(r.access_id);
    startTransition(async () => {
      await archiveReceivableAction(r.access_id, !r.archived);
      setBusyId(null);
      router.refresh();
    });
  }

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

        <div className="sec-head arx-controls">
          <input className="apx-input" style={{ maxWidth: 300 }} placeholder="Search customer, address, ID…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <label className="arx-daterange">
            <span>Billed</span>
            <input type="date" className="apx-input arx-date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            <span className="arx-dash">→</span>
            <input type="date" className="apx-input arx-date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            {(from || to) && <button type="button" className="arx-clear" onClick={() => { setFrom(""); setTo(""); }}>Clear</button>}
          </label>
          <div className="arx-tabs">
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All {activeCount}</button>
            <button className={filter === "pending" ? "on" : ""} onClick={() => setFilter("pending")}>Pending {sums.counts.pending}</button>
            <button className={filter === "signed" ? "on" : ""} onClick={() => setFilter("signed")}>Signed {sums.counts.signed}</button>
            <button className={filter === "completed" ? "on" : ""} onClick={() => setFilter("completed")}>Completed {sums.counts.completed}</button>
            <button className={filter === "jobs" ? "on" : ""} onClick={() => setFilter("jobs")}>Jobs {sums.counts.jobs}</button>
            <button className={filter === "archived" ? "on" : ""} onClick={() => setFilter("archived")}>Archived {sums.counts.archived}</button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">{q || from || to ? "No projects match." : "Nothing here."}</div></div>
        ) : (
          <div className="arx-table-wrap">
            <table className="arx-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Project</th>
                  <th>Stage</th>
                  <th>Billed</th>
                  <th className="r sortable" onClick={() => setSort("total")}>Total{sort === "total" ? " ↓" : ""}</th>
                  <th className="r">Due now</th>
                  <th className="r">Paid</th>
                  <th className="r sortable" onClick={() => setSort("balance")}>Balance{sort === "balance" ? " ↓" : ""}</th>
                  <th className="r sortable" onClick={() => setSort("aging")}>Aging{sort === "aging" ? " ↓" : ""}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const b = BUCKET[r.bucket] || BUCKET.pending;
                  const isJob = r.bucket === "jobs";
                  return (
                    <tr key={r.access_id} className={isJob || r.archived ? "dead" : ""}>
                      <td>
                        <Link className="arx-cust" href={`/project/${r.access_id}`}>{r.customer}</Link>
                        {r.address && <span className="arx-addr">{r.address}</span>}
                      </td>
                      <td><Link className="arx-pid" href={`/project/${r.access_id}`}>{r.access_id}</Link></td>
                      <td>
                        <span className={`arx-chip ${b.cls}`}>{b.label}</span>
                        {r.pending > 0 && <span className="arx-chip pend" title="Customer-submitted, awaiting confirmation">{money(r.pending)} pending</span>}
                      </td>
                      <td className="arx-billed">{r.billedAt || "—"}</td>
                      <td className="r">{money(r.total)}</td>
                      <td className="r arx-due">{isJob ? "—" : money(r.expected)}</td>
                      <td className="r arx-paid">{money(r.paid)}</td>
                      <td className={`r arx-bal${isJob || r.paidInFull ? " zero" : ""}`}>
                        {isJob ? "—" : r.paidInFull ? "Paid" : money(r.balance)}
                      </td>
                      <td className={`r arx-age${!isJob && !r.paidInFull && r.daysOut > 30 ? " over" : ""}`}>{isJob ? "—" : `${r.daysOut}d`}</td>
                      <td className="r">
                        <button type="button" className="arx-arch" disabled={busyId === r.access_id && pending}
                                onClick={() => toggleArchive(r)}
                                title={r.archived ? "Restore to the active list" : "Archive — hide from the active list (reversible)"}>
                          {busyId === r.access_id ? "…" : r.archived ? "Restore" : "Archive"}
                        </button>
                      </td>
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
.apx .arx-controls{flex-wrap:wrap;gap:10px}
.apx .arx-daterange{display:flex;align-items:center;gap:6px;font-size:.75rem;font-weight:700;color:var(--muted)}
.apx .arx-date{max-width:150px;height:36px}
.apx .arx-dash{color:var(--muted)}
.apx .arx-clear{height:32px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--muted);font-size:.72rem;font-weight:700;cursor:pointer;font-family:inherit}
.apx .arx-clear:hover{border-color:var(--gold);color:var(--gold-deep,#b08f4f)}
.apx .arx-tabs{display:flex;gap:6px;flex-wrap:wrap}
.apx .arx-tabs button{height:34px;padding:0 12px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit}
.apx .arx-tabs button.on{background:var(--gold-deep,#b08f4f);border-color:var(--gold-deep,#b08f4f);color:#fff}
.apx .arx-table-wrap{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:14px}
.apx .arx-table{width:100%;border-collapse:collapse;font-size:.85rem;min-width:880px}
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
.apx .arx-billed{font-size:.78rem;color:var(--muted);white-space:nowrap}
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
.apx .arx-arch{height:30px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--muted);font-size:.72rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
.apx .arx-arch:hover{border-color:var(--gold-deep,#b08f4f);color:var(--gold-deep,#b08f4f)}
.apx .arx-arch:disabled{opacity:.5;cursor:default}
`;

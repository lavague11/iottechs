"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminShell from "../components/admin-shell";
import { archiveReceivableAction } from "./actions";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Canonical financial states (from lib/receivables-model.js). Approved-but-unsigned is NOT money due;
// signed+deposit-unpaid is a real Due-Now obligation; completion balance is Due Now; full pay → Collected.
const STATE = {
  awaiting_signature: { label: "Awaiting Signature", cls: "sig",  tab: "Awaiting Signature" },
  awaiting_deposit:   { label: "Awaiting Deposit",   cls: "dep",  tab: "Awaiting Deposit" },
  due_now:            { label: "Due Now",            cls: "due",  tab: "Due Now" },
  pending:            { label: "Pending",            cls: "pend", tab: "Pending" },
  collected:          { label: "Collected",          cls: "ok",   tab: "Collected" },
  closed:             { label: "Closed",             cls: "dead", tab: "Closed" },
};
const TABS = ["awaiting_signature", "awaiting_deposit", "due_now", "pending", "collected", "closed"];

export default function ReceivablesClient({ user, alerts, rows = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery]   = useState("");
  const [filter, setFilter] = useState("all");     // all | <state> | archived
  const [sort, setSort]     = useState("due");      // due | total | aging | balance
  const [from, setFrom]     = useState("");
  const [to, setTo]         = useState("");
  const [busyId, setBusyId] = useState(null);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = rows.filter((r) => {
      if (filter === "archived") { if (!r.archived) return false; }
      else { if (r.archived) return false; if (filter !== "all" && r.financialState !== filter) return false; }
      if (from && (!r.billedAt || r.billedAt < from)) return false;
      if (to && (!r.billedAt || r.billedAt > to)) return false;
      if (!q) return true;
      return r.customer.toLowerCase().includes(q) || r.access_id.toLowerCase().includes(q) || (r.address || "").toLowerCase().includes(q);
    });
    const key = sort === "aging" ? (r) => (r.agingDays || 0) : sort === "total" ? (r) => r.total : sort === "balance" ? (r) => r.balance : (r) => r.amountDueNow;
    return [...list].sort((a, b) => key(b) - key(a));
  }, [rows, q, filter, sort, from, to]);

  // Portfolio sums — honest definitions. Due Now counts ONLY real obligations (never unsigned deals);
  // Pending is scheduled-but-not-due; Collected is confirmed payments.
  const sums = useMemo(() => {
    const inRange = (r) => (!from || (r.billedAt && r.billedAt >= from)) && (!to || (r.billedAt && r.billedAt <= to));
    const s = { dueNow: 0, awaitingDepositVal: 0, pendingVal: 0, collected: 0, billed: 0,
                counts: Object.fromEntries(TABS.map((k) => [k, 0])) };
    s.counts.archived = 0;
    for (const r of rows) {
      if (r.archived) { s.counts.archived++; continue; }
      if (!inRange(r)) continue;
      s.counts[r.financialState] = (s.counts[r.financialState] || 0) + 1;
      if (r.financialState === "closed") continue;
      s.dueNow += r.amountDueNow || 0;
      s.pendingVal += r.pendingAmount || 0;
      s.collected += r.paid || 0;
      s.billed += r.total || 0;
      if (r.financialState === "awaiting_deposit") s.awaitingDepositVal += r.amountDueNow || 0;
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
            <div className="ph-sub">{money(sums.dueNow)} due now · {money(sums.pendingVal)} scheduled · {sums.counts.closed} closed</div>
          </div>
        </div>

        <div className="arx-tiles">
          <div className="arx-tile out">
            <span className="arx-tile-lbl">Due now</span>
            <span className="arx-tile-val">{money(sums.dueNow)}</span>
            <span className="arx-tile-sub">deposits + completion balances actually due</span>
          </div>
          <div className="arx-tile">
            <span className="arx-tile-lbl">Awaiting deposit</span>
            <span className="arx-tile-val">{money(sums.awaitingDepositVal)}</span>
            <span className="arx-tile-sub">{sums.counts.awaiting_deposit} signed · deposit unpaid</span>
          </div>
          <div className="arx-tile">
            <span className="arx-tile-lbl">Pending</span>
            <span className="arx-tile-val">{money(sums.pendingVal)}</span>
            <span className="arx-tile-sub">scheduled, not yet due</span>
          </div>
          <div className="arx-tile">
            <span className="arx-tile-lbl">Collected</span>
            <span className="arx-tile-val">{money(sums.collected)}</span>
            <span className="arx-tile-sub">of {money(sums.billed)} contracted</span>
          </div>
          <div className="arx-tile">
            <span className="arx-tile-lbl">Awaiting signature</span>
            <span className="arx-tile-val">{sums.counts.awaiting_signature}</span>
            <span className="arx-tile-sub">approved · not money due</span>
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
            {TABS.map((k) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{STATE[k].tab} {sums.counts[k]}</button>
            ))}
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
                  <th>State</th>
                  <th>Billed</th>
                  <th className="r sortable" onClick={() => setSort("total")}>Total{sort === "total" ? " ↓" : ""}</th>
                  <th className="r sortable" onClick={() => setSort("due")}>Due now{sort === "due" ? " ↓" : ""}</th>
                  <th className="r">Paid</th>
                  <th className="r sortable" onClick={() => setSort("balance")}>Balance{sort === "balance" ? " ↓" : ""}</th>
                  <th className="r sortable" onClick={() => setSort("aging")}>Aging{sort === "aging" ? " ↓" : ""}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const st = STATE[r.financialState] || STATE.pending;
                  const isClosed = r.financialState === "closed";
                  const isCollected = r.financialState === "collected";
                  const overAge = !isClosed && !isCollected && (r.agingDays || 0) > 30 && (r.amountDueNow > 0 || r.signatureOverdue);
                  return (
                    <tr key={r.access_id} className={isClosed || r.archived ? "dead" : ""}>
                      <td>
                        <Link className="arx-cust" href={`/project/${r.access_id}`}>{r.customer}</Link>
                        {r.address && <span className="arx-addr">{r.address}</span>}
                      </td>
                      <td><Link className="arx-pid" href={`/project/${r.access_id}`}>{r.access_id}</Link></td>
                      <td>
                        <span className={`arx-chip ${st.cls}`}>{st.label}</span>
                        {isClosed && r.closeReason && <span className="arx-closesub" title="Close reason">{r.closeReason}</span>}
                        {r.financialState === "awaiting_signature" && r.signatureDeadline && <span className="arx-closesub" title="Auto-closes if unsigned">by {r.signatureDeadline}</span>}
                        {r.pending > 0 && <span className="arx-chip pendpay" title="Customer-submitted, awaiting confirmation">{money(r.pending)} pending</span>}
                      </td>
                      <td className="arx-billed">{r.billedAt || "—"}</td>
                      <td className="r">{money(r.total)}</td>
                      <td className="r arx-due">{r.amountDueNow > 0 ? money(r.amountDueNow) : "—"}</td>
                      <td className="r arx-paid">{money(r.paid)}</td>
                      <td className={`r arx-bal${isClosed || isCollected ? " zero" : ""}`}>
                        {isClosed ? "—" : isCollected ? "Paid" : money(r.balance)}
                      </td>
                      <td className={`r arx-age${overAge ? " over" : ""}`}>{r.agingDays == null ? "—" : `${r.agingDays}d`}</td>
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
.apx .arx-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:4px 0 18px}
.apx .arx-tile{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:3px}
.apx .arx-tile.out{border-color:var(--gold,#C9A96E);background:#fbf7ef}
.apx .arx-tile-lbl{font-size:.68rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
.apx .arx-tile-val{font-size:1.6rem;font-weight:800;color:var(--ink);line-height:1.05}
.apx .arx-tile.out .arx-tile-val{color:var(--gold-deep,#b08f4f)}
.apx .arx-tile-sub{font-size:.72rem;color:var(--muted)}
.apx .arx-controls{flex-wrap:wrap;gap:10px}
.apx .arx-daterange{display:flex;align-items:center;gap:6px;font-size:.75rem;font-weight:700;color:var(--muted)}
.apx .arx-date{max-width:150px;height:36px}
.apx .arx-dash{color:var(--muted)}
.apx .arx-clear{height:32px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--muted);font-size:.72rem;font-weight:700;cursor:pointer;font-family:inherit}
.apx .arx-clear:hover{border-color:var(--gold);color:var(--gold-deep,#b08f4f)}
.apx .arx-tabs{display:flex;gap:6px;flex-wrap:wrap}
.apx .arx-tabs button{height:34px;padding:0 12px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
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
.apx .arx-chip.due{background:#c0392b}
.apx .arx-chip.dep{background:var(--gold-deep,#b08f4f)}
.apx .arx-chip.sig{background:#4b6a9b}
.apx .arx-chip.pend{background:#8a94ad}
.apx .arx-chip.dead{background:#8a94ad}
.apx .arx-chip.pendpay{background:#fff;color:#8a6d1e;border:1px solid #e6cf8a;margin-left:6px;text-transform:none;letter-spacing:0}
.apx .arx-closesub{display:inline-block;margin-left:6px;font-size:.68rem;color:var(--muted);font-weight:600}
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

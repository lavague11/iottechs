"use client";

// Payroll — locked daily logs grouped by technician for a pay period, with a CSV export
// (docs/WORK_ORDERS.md, requirement 27).
//
// Every figure here was frozen when a day was closed. Nothing is recomputed from the current payouts,
// which is the point: editing a line's payout tomorrow must not restate a week somebody was paid for.
import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "../components/admin-shell";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayText = (d) => { const m = String(d || "").match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${MON[+m[2] - 1]} ${+m[3]}` : String(d || ""); };

// One row per daily log, so the file reconciles line by line with what the office approved.
function csv(data) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Technician", "Day", "Project", "Lines", "Payout", "Locked at", "Locked by", "Note"]];
  for (const t of data.techs) for (const l of t.logs) {
    rows.push([t.name, l.day, l.project, l.lines_completed, (+l.payout_total || 0).toFixed(2), l.locked_at, l.locked_by, l.note]);
  }
  rows.push([]);
  rows.push(["Total", "", "", "", data.total.toFixed(2)]);
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export default function PayrollClient({ user, alerts, data, canExport }) {
  const router = useRouter();
  const [from, setFrom] = useState(data.from);
  const [to, setTo] = useState(data.to);
  const [open, setOpen] = useState(() => new Set());

  const apply = () => router.push(`/payroll?from=${from}&to=${to}`);
  function exportCsv() {
    const blob = new Blob([csv(data)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Payroll ${data.from} to ${data.to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const toggle = (k) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <AdminShell user={user} alerts={alerts} active="payroll">
      <style>{CSS}</style>
      <div className="pr-head">
        <h1>Payroll</h1>
        <div className="pr-period">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <span>→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          <button type="button" className="pr-apply" onClick={apply}>Apply</button>
          {canExport && data.techs.length > 0 && <button type="button" className="pr-exp" onClick={exportCsv}>Export</button>}
        </div>
      </div>

      {data.techs.length === 0 ? (
        <div className="pr-empty">No closed days in this period.</div>
      ) : (
        <>
          <div className="pr-total"><span>Total</span><b>{money(data.total)}</b></div>
          <div className="pr-techs">
            {data.techs.map((t) => {
              const k = t.userId != null ? `u${t.userId}` : `n${t.name}`;
              const isOpen = open.has(k);
              return (
                <div key={k} className="pr-tech">
                  <button type="button" className="pr-tech-hd" aria-expanded={isOpen} onClick={() => toggle(k)}>
                    <span className="pr-av">{(t.name || "?")[0].toUpperCase()}</span>
                    <span className="pr-nm">{t.name}</span>
                    <span className="pr-meta">{t.days} day{t.days === 1 ? "" : "s"} · {t.lines} line{t.lines === 1 ? "" : "s"}</span>
                    <span className="pr-amt">{money(t.total)}</span>
                    <svg className={`pr-chev${isOpen ? " on" : ""}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  {isOpen && (
                    <div className="pr-days">
                      {t.logs.map((l) => (
                        <div key={l.id} className="pr-day">
                          <span className="pr-d">{dayText(l.day)}</span>
                          <a className="pr-proj" href={`/project/${l.project_access_id}?view=workorder`}>{l.project}</a>
                          <span className="pr-ln">{l.lines_completed} line{l.lines_completed === 1 ? "" : "s"}</span>
                          <span className="pr-damt">{money(l.payout_total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </AdminShell>
  );
}

const CSS = `
.pr-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.pr-head h1{margin:0;font-size:1.35rem;font-weight:800;color:var(--dv-ink,#101418);letter-spacing:-.02em}
.pr-period{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.8rem;color:var(--dv-meta,#787D84)}
.pr-period input{height:36px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;color:var(--dv-ink,#101418);padding:0 10px;font:inherit;font-size:.82rem;outline:none}
.pr-period input:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pr-apply{height:36px;padding:0 15px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font:600 .8rem/1 inherit;cursor:pointer}
.pr-exp{height:36px;padding:0 16px;border:0;border-radius:8px;background:var(--dv-ink,#101418);color:#fff;font:700 .8rem/1 inherit;cursor:pointer}
.pr-total{display:flex;align-items:center;justify-content:space-between;padding:14px 17px;border-radius:12px;background:var(--dv-ink,#101418);color:#fff;font-size:.9rem;font-weight:700;margin-bottom:14px}
.pr-total b{color:var(--dv-gold,#C9A96E);font-size:1.25rem;font-variant-numeric:tabular-nums}
.pr-techs{display:flex;flex-direction:column;gap:9px}
.pr-tech{border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:#fff;overflow:hidden}
.pr-tech-hd{width:100%;display:grid;grid-template-columns:32px 1fr auto auto 16px;gap:11px;align-items:center;padding:13px 15px;border:0;background:none;font:inherit;text-align:left;cursor:pointer}
.pr-tech-hd:hover{background:var(--dv-raise,#FBFBFA)}
.pr-av{width:32px;height:32px;border-radius:50%;background:var(--dv-ink,#101418);color:#fff;display:grid;place-items:center;font-size:.82rem;font-weight:700}
.pr-nm{font-size:.94rem;font-weight:700;color:var(--dv-ink,#101418);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-meta{font-size:.76rem;color:var(--dv-meta,#787D84);white-space:nowrap}
.pr-amt{font-size:1rem;font-weight:800;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums;white-space:nowrap}
.pr-chev{color:var(--dv-faint,#A1A6AC);transition:transform .2s ease}
.pr-chev.on{transform:rotate(180deg)}
.pr-days{border-top:1px solid var(--dv-line-soft,#EDEDE9)}
.pr-day{display:grid;grid-template-columns:70px 1fr auto auto;gap:12px;align-items:baseline;padding:9px 15px;border-top:1px solid var(--dv-line-soft,#EDEDE9);font-size:.82rem;color:var(--dv-meta,#787D84)}
.pr-day:first-child{border-top:none}
.pr-d{font-weight:600;color:var(--dv-ink,#101418)}
.pr-proj{color:var(--dv-ink,#101418);text-decoration:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-proj:hover{text-decoration:underline}
.pr-ln{font-variant-numeric:tabular-nums;white-space:nowrap}
.pr-damt{font-weight:700;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums}
.pr-empty{padding:40px;text-align:center;color:var(--dv-meta,#787D84);font-size:.88rem;border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:#fff}
@media (max-width:600px){
  .pr-tech-hd{grid-template-columns:30px 1fr auto;row-gap:2px}
  .pr-meta{grid-column:2/3;grid-row:2}
  .pr-chev{display:none}
  .pr-day{grid-template-columns:1fr auto}
  .pr-ln{display:none}
}
`;

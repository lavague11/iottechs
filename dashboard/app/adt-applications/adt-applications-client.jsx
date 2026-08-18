"use client";

import { useState, useMemo, useTransition, Fragment } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";
import { adtSummary } from "../../lib/adt";
import { adminScheduleAdtAction, adminCompleteAdtAction } from "./actions";

const STAGES = {
  applied:   { label: "New — Applied", pill: "st-new" },
  scheduled: { label: "Scheduled",     pill: "st-sched" },
  completed: { label: "Completed",     pill: "st-done" },
};
const fmtDay = (d) => { if (!d) return ""; try { return new Date(String(d).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };

export default function AdtApplicationsClient({ user, alerts, apps }) {
  const [tab, setTab] = useState("all");
  const [q, setQ]     = useState("");
  const [open, setOpen] = useState(null);   // expanded adt_id

  const counts = useMemo(() => ({
    all: apps.length,
    applied:   apps.filter((a) => a.stage === "applied").length,
    scheduled: apps.filter((a) => a.stage === "scheduled").length,
    completed: apps.filter((a) => a.stage === "completed").length,
  }), [apps]);
  const totalPoints = useMemo(() => Math.round(apps.reduce((s, a) => s + (+a.points || 0), 0) * 10) / 10, [apps]);

  const query = q.trim().toLowerCase();
  const visible = useMemo(() => apps
    .filter((a) => tab === "all" ? true : a.stage === tab)
    .filter((a) => !query || [a.adt_id, a.name, a.phone, a.email, a.address].some((v) => (v || "").toLowerCase().includes(query))),
    [apps, tab, query]);

  return (
    <AdminShell user={user} alerts={alerts} active="adt">
      <div className="apx-wrap">
        <div className="page-head">
          <h1>24/7 Monitoring</h1>
          <div className="ph-sub">ADT applications · {counts.applied} new · {counts.scheduled} scheduled</div>
        </div>

        <div className="adta-tiles">
          <Tile n={counts.all} l="Applications" />
          <Tile n={counts.applied} l="New" cls="t-new" />
          <Tile n={counts.scheduled} l="Scheduled" cls="t-sched" />
          <Tile n={counts.completed} l="Completed" cls="t-done" />
          <Tile n={totalPoints} l="Total points" cls="t-pts" />
        </div>

        <div className="sec-head svc-head">
          <div className="filters">
            {[["all", "All"], ["applied", "New"], ["scheduled", "Scheduled"], ["completed", "Completed"]].map(([k, l]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l} <span style={{ opacity: .6 }}>{k === "all" ? counts.all : counts[k]}</span></button>
            ))}
          </div>
          <input className="apx-input" style={{ maxWidth: 320 }} placeholder="Search ID, customer, address…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">No applications{tab !== "all" ? ` in ${tab}` : ""}.</div></div>
        ) : (
          <div className="panel adta-panel">
            <table className="apx-table adta-table">
              <thead><tr><th>Application</th><th>Customer</th><th className="r">Points</th><th className="r">Items</th><th>Stage</th><th>Install</th><th></th></tr></thead>
              <tbody>
                {visible.map((a) => {
                  const st = STAGES[a.stage] || { label: a.stage, pill: "st-new" };
                  const sum = adtSummary(a.equipment || {});
                  const isOpen = open === a.adt_id;
                  return (
                    <Fragment key={a.adt_id}>
                      <tr className={isOpen ? "adta-row open" : "adta-row"} onClick={() => setOpen(isOpen ? null : a.adt_id)}>
                        <td><div className="adta-id mono">{a.adt_id}</div><div className="adta-when">{fmtDay(a.created_at)}</div></td>
                        <td><div className="adta-cust">{a.name || "—"} <span className={`adta-ptype ${a.property_type === "commercial" ? "comm" : "res"}`}>{a.property_type === "commercial" ? "Commercial" : "Residential"}</span></div><div className="adta-addr">{a.address || a.phone || "—"}</div></td>
                        <td className="r"><b>{a.points || 0}</b> <span className="adta-u">pts</span></td>
                        <td className="r">{sum.count}</td>
                        <td><span className={`spill ${st.pill}`}>{st.label}</span></td>
                        <td>{a.schedule_date ? <span className="adta-sched">{fmtDay(a.schedule_date)}{a.schedule_window ? <em>{a.schedule_window}</em> : null}</span> : <span className="adta-muted">—</span>}</td>
                        <td className="r"><Link href={`/adt-applications/${a.adt_id}`} className="adta-open" onClick={(e) => e.stopPropagation()}>Open →</Link><span className="adta-chev">{isOpen ? "▲" : "▼"}</span></td>
                      </tr>
                      {isOpen && (
                        <tr className="adta-detail-row">
                          <td colSpan={7}>
                            <DetailPanel app={a} summary={sum} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

function Tile({ n, l, cls = "" }) {
  return <div className={`adta-tile ${cls}`}><div className="adta-tile-n">{n}</div><div className="adta-tile-l">{l}</div></div>;
}

function DetailPanel({ app, summary }) {
  const [date, setDate] = useState(app.schedule_date || "");
  const [win, setWin]   = useState(app.schedule_window || "Morning (8am–12pm)");
  const [err, setErr]   = useState("");
  const [pending, startTx] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const WINDOWS = ["Morning (8am–12pm)", "Afternoon (12pm–4pm)", "Evening (4pm–7pm)"];

  const doSchedule = () => { setErr(""); startTx(async () => { const r = await adminScheduleAdtAction(app.adt_id, { date, window: win }); if (r?.error) setErr(r.error); }); };
  const doComplete = () => { setErr(""); startTx(async () => { const r = await adminCompleteAdtAction(app.adt_id); if (r?.error) setErr(r.error); }); };

  const ORDER = ["applied", "scheduled", "completed"];
  const LBL = { applied: "Applied", scheduled: "Scheduled", completed: "Completed" };
  const cur = ORDER.indexOf(app.stage);
  return (
    <div className="adta-detail">
      <div className="adta-track">
        {ORDER.map((s, i) => {
          const done = app.stage === "completed" || i < cur;
          const on = i === cur && app.stage !== "completed";
          return (
            <div key={s} className={`adta-track-step${done ? " done" : ""}${on ? " on" : ""}`}>
              <span className="adta-track-dot">{done ? "✓" : i + 1}</span>
              <span className="adta-track-lbl">{LBL[s]}</span>
            </div>
          );
        })}
      </div>
      <div className="adta-detail-cols">
        <div className="adta-equip">
          <div className="adta-sub">Equipment · <b>{summary.points} pts</b></div>
          {summary.lines.length === 0 ? <div className="adta-muted">No equipment on file.</div> : (
            <div className="adta-equip-list">
              {summary.lines.map((l) => (
                <div key={l.id} className="adta-equip-row"><span className="adta-q">{l.qty}×</span><span className="adta-n">{l.name}</span><span className="adta-p">{l.linePoints || 0} pts</span></div>
              ))}
            </div>
          )}
          {app.notes && <div className="adta-notes"><span>Notes</span>{app.notes}</div>}
        </div>

        <div className="adta-side">
          <div className="adta-contact">
            <div className="adta-sub">Contact</div>
            <div className="adta-crow">{app.name || "—"} <span className={`adta-ptype ${app.property_type === "commercial" ? "comm" : "res"}`}>{app.property_type === "commercial" ? "Commercial" : "Residential"}</span></div>
            {app.phone && <a className="adta-crow lnk" href={`tel:${app.phone}`}>{app.phone}</a>}
            {app.email && <a className="adta-crow lnk" href={`mailto:${app.email}`}>{app.email}</a>}
            {app.address && <a className="adta-crow lnk" href={`https://maps.google.com/?q=${encodeURIComponent(app.address)}`} target="_blank" rel="noopener noreferrer">{app.address}</a>}
            {app.access_pin && <div className="adta-crow"><span className="adta-muted">Access PIN</span> <b>{app.access_pin}</b></div>}
          </div>

          {app.stage !== "completed" && (
            <div className="adta-actions">
              <div className="adta-sub">{app.stage === "scheduled" ? "Reschedule / complete" : "Schedule install"}</div>
              <div className="adta-sched-form">
                <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="apx-input" />
                <select value={win} onChange={(e) => setWin(e.target.value)} className="apx-input">{WINDOWS.map((w) => <option key={w}>{w}</option>)}</select>
              </div>
              {err && <div className="adta-err">{err}</div>}
              <div className="adta-btns">
                <button className="adta-btn gold" disabled={pending || !date} onClick={doSchedule}>{app.stage === "scheduled" ? "Update date" : "Schedule"}</button>
                {app.stage === "scheduled" && <button className="adta-btn green" disabled={pending} onClick={doComplete}>Mark complete</button>}
              </div>
            </div>
          )}
          {app.stage === "completed" && <div className="adta-done-note">✓ Completed {fmtDay(app.completed_at)}</div>}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.apx .adta-tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0 20px}
.apx .adta-tile{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.apx .adta-tile-n{font-family:'Bricolage Grotesque',sans-serif;font-size:1.7rem;font-weight:800;color:var(--ink);line-height:1}
.apx .adta-tile-l{font-size:.72rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-top:5px}
.apx .adta-tile.t-new{border-left:3px solid #C9A96E}
.apx .adta-tile.t-sched{border-left:3px solid #3a4a72}
.apx .adta-tile.t-done{border-left:3px solid #2f7d5a}
.apx .adta-tile.t-pts .adta-tile-n{color:#a8894e}
.apx .adta-panel{padding:0;overflow:hidden}
.apx .adta-table td,.apx .adta-table th{vertical-align:middle}
.apx .adta-table th.r,.apx .adta-table td.r{text-align:right}
.apx .adta-row{cursor:pointer;transition:background .12s}
.apx .adta-row:hover{background:var(--bg-soft)}
.apx .adta-row.open{background:var(--bg-tint)}
.apx .adta-id{font-weight:800;color:var(--ink)}
.apx .adta-when{font-size:.72rem;color:var(--muted)}
.apx .adta-cust{font-weight:700;color:var(--ink)}
.apx .adta-ptype{font-size:.6rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:1px 7px;border-radius:100px;vertical-align:middle;margin-left:5px}
.apx .adta-ptype.res{background:#eef4ee;color:#2f7d5a}
.apx .adta-ptype.comm{background:#eef1f8;color:#3a4a72}
.apx .adta-addr{font-size:.74rem;color:var(--muted)}
.apx .adta-u{font-size:.7rem;color:var(--muted);font-weight:600}
.apx .adta-muted{color:var(--muted)}
.apx .adta-sched{font-weight:700;color:var(--ink);font-size:.84rem;display:flex;flex-direction:column}
.apx .adta-sched em{font-style:normal;font-size:.7rem;color:var(--muted);font-weight:500}
.apx .adta-chev{color:var(--muted);font-size:.7rem;margin-left:8px}
.apx .adta-open{font-size:.76rem;font-weight:800;color:#8a6d2f;text-decoration:none;white-space:nowrap}
.apx .adta-open:hover{text-decoration:underline}
.apx .spill.st-new{background:#f8f0e0;color:#a8894e}
.apx .spill.st-sched{background:#eef1f8;color:#3a4a72}
.apx .spill.st-done{background:var(--green-soft);color:var(--green)}
.apx .adta-detail-row td{background:var(--bg-tint);padding:0}
.apx .adta-detail{padding:16px 18px}
.apx .adta-track{display:flex;align-items:center;gap:0;margin-bottom:16px;max-width:520px}
.apx .adta-track-step{display:flex;align-items:center;gap:8px;flex:1;position:relative;color:var(--muted)}
.apx .adta-track-step:not(:last-child)::after{content:"";flex:1;height:2px;background:var(--line);margin:0 8px}
.apx .adta-track-step.done,.apx .adta-track-step.on{color:var(--ink)}
.apx .adta-track-step.done:not(:last-child)::after{background:#2f7d5a}
.apx .adta-track-dot{width:24px;height:24px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.74rem;font-weight:800;background:var(--line-soft,#eee);color:var(--muted);border:1px solid var(--line)}
.apx .adta-track-step.done .adta-track-dot{background:#2f7d5a;border-color:#2f7d5a;color:#fff}
.apx .adta-track-step.on .adta-track-dot{background:#C9A96E;border-color:#C9A96E;color:#0B0F1A}
.apx .adta-track-lbl{font-size:.78rem;font-weight:700;white-space:nowrap}
.apx .adta-detail-cols{display:grid;grid-template-columns:1.4fr 1fr;gap:22px}
.apx .adta-sub{font-size:.68rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.apx .adta-equip-list{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.apx .adta-equip-row{display:flex;align-items:center;gap:10px;padding:7px 12px;border-top:1px solid var(--line);font-size:.85rem}
.apx .adta-equip-row:first-child{border-top:none}
.apx .adta-q{font-weight:800;color:#a8894e;min-width:30px}
.apx .adta-n{flex:1;color:var(--ink)}
.apx .adta-p{color:var(--muted);font-weight:600}
.apx .adta-notes{margin-top:12px;font-size:.85rem;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:9px;padding:9px 12px}
.apx .adta-notes span{display:block;font-size:.66rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
.apx .adta-contact{background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:14px}
.apx .adta-crow{font-size:.85rem;color:var(--ink);padding:2px 0}
.apx .adta-crow.lnk{color:#8a6d2f;text-decoration:none;display:block}
.apx .adta-crow.lnk:hover{text-decoration:underline}
.apx .adta-actions{background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.apx .adta-sched-form{display:flex;gap:8px;flex-wrap:wrap}
.apx .adta-sched-form .apx-input{flex:1;min-width:120px}
.apx .adta-btns{display:flex;gap:8px;margin-top:10px}
.apx .adta-btn{height:34px;padding:0 16px;border:none;border-radius:8px;font-size:.82rem;font-weight:800;cursor:pointer;font-family:inherit}
.apx .adta-btn.gold{background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A}
.apx .adta-btn.green{background:#2f7d5a;color:#fff}
.apx .adta-btn:disabled{opacity:.5;cursor:default}
.apx .adta-err{font-size:.8rem;color:#c0392b;margin-top:8px}
.apx .adta-done-note{font-size:.86rem;font-weight:800;color:var(--green)}
@media(max-width:820px){.apx .adta-tiles{grid-template-columns:repeat(2,1fr)}.apx .adta-detail-cols{grid-template-columns:1fr}}
`;

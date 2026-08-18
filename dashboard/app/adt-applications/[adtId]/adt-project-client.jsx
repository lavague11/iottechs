"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell from "../../components/admin-shell";
import { adtSummary } from "../../../lib/adt";
import { adminScheduleAdtAction, adminCompleteAdtAction } from "../actions";

const fmtDay = (d) => { if (!d) return ""; try { return new Date(String(d).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
const ORDER = ["applied", "scheduled", "completed"];
const LBL = { applied: "Applied", scheduled: "Scheduled", completed: "Completed" };
const PILL = { applied: "st-new", scheduled: "st-sched", completed: "st-done" };
const WINDOWS = ["Morning (8am–12pm)", "Afternoon (12pm–4pm)", "Evening (4pm–7pm)"];

export default function AdtProjectClient({ user, alerts, app }) {
  const router = useRouter();
  const summary = adtSummary(app.equipment || {});
  const isComm = app.property_type === "commercial";
  const cur = ORDER.indexOf(app.stage);

  const [date, setDate] = useState(app.schedule_date || "");
  const [win, setWin]   = useState(app.schedule_window || WINDOWS[0]);
  const [err, setErr]   = useState("");
  const [pending, startTx] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  const doSchedule = () => startTx(async () => { setErr(""); const r = await adminScheduleAdtAction(app.adt_id, { date, window: win }); if (r?.error) setErr(r.error); else router.refresh(); });
  const doComplete = () => startTx(async () => { setErr(""); const r = await adminCompleteAdtAction(app.adt_id); if (r?.error) setErr(r.error); else router.refresh(); });

  return (
    <AdminShell user={user} alerts={alerts} active="adt">
      <div className="apx-wrap adtp">
        <Link href="/adt-applications" className="adtp-back">← All ADT applications</Link>

        <div className="adtp-head">
          <div className="adtp-id-row">
            <span className="adtp-id mono">{app.adt_id}</span>
            <span className={`adtp-ptype ${isComm ? "comm" : "res"}`}>{isComm ? "Commercial" : "Residential"}</span>
            <span className={`spill ${PILL[app.stage] || "st-new"}`}>{LBL[app.stage] || app.stage}</span>
          </div>
          <h1>{app.name || "ADT account"}</h1>
          <div className="adtp-sub">24/7 Monitoring · <b>{app.points || 0} pts</b> · {summary.count} item{summary.count === 1 ? "" : "s"} · opened {fmtDay(app.created_at)}</div>
        </div>

        {/* Stage rail — Applied → Scheduled → Completed */}
        <div className="adtp-track">
          {ORDER.map((s, i) => {
            const done = app.stage === "completed" || i < cur;
            const on = i === cur && app.stage !== "completed";
            return (
              <div key={s} className={`adtp-track-step${done ? " done" : ""}${on ? " on" : ""}`}>
                <span className="adtp-track-dot">{done ? "✓" : i + 1}</span>
                <span className="adtp-track-lbl">{LBL[s]}</span>
              </div>
            );
          })}
        </div>

        <div className="adtp-cols">
          <div className="adtp-main">
            <div className="adtp-card">
              <div className="adtp-card-h">Equipment <span className="adtp-card-x">{summary.points} pts</span></div>
              {summary.lines.length === 0 ? (
                <div className="adtp-empty">No equipment on file.</div>
              ) : (
                <div className="adtp-equip">
                  {summary.lines.map((l) => (
                    <div key={l.id} className="adtp-equip-row"><span className="adtp-q">{l.qty}×</span><span className="adtp-n">{l.name}</span><span className="adtp-p">{l.linePoints || 0} pts</span></div>
                  ))}
                </div>
              )}
            </div>
            {app.notes && (
              <div className="adtp-card">
                <div className="adtp-card-h">Notes</div>
                <div className="adtp-notes">{app.notes}</div>
              </div>
            )}
          </div>

          <div className="adtp-side">
            <div className="adtp-card">
              <div className="adtp-card-h">Contact</div>
              <div className="adtp-crow">{app.name || "—"}</div>
              {app.phone && <a className="adtp-crow lnk" href={`tel:${app.phone}`}>{app.phone}</a>}
              {app.email && <a className="adtp-crow lnk" href={`mailto:${app.email}`}>{app.email}</a>}
              {app.address && <a className="adtp-crow lnk" href={`https://maps.google.com/?q=${encodeURIComponent(app.address)}`} target="_blank" rel="noopener noreferrer">{app.address}</a>}
              {app.access_pin && <div className="adtp-crow"><span className="adtp-muted">Access PIN</span> <b>{app.access_pin}</b></div>}
            </div>

            {app.stage !== "completed" ? (
              <div className="adtp-card">
                <div className="adtp-card-h">{app.stage === "scheduled" ? "Reschedule / complete" : "Schedule install"}</div>
                <div className="adtp-sched">
                  <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="apx-input" />
                  <select value={win} onChange={(e) => setWin(e.target.value)} className="apx-input">{WINDOWS.map((w) => <option key={w}>{w}</option>)}</select>
                </div>
                {err && <div className="adtp-err">{err}</div>}
                <div className="adtp-btns">
                  <button className="adtp-btn gold" disabled={pending || !date} onClick={doSchedule}>{app.stage === "scheduled" ? "Update date" : "Schedule"}</button>
                  {app.stage === "scheduled" && <button className="adtp-btn green" disabled={pending} onClick={doComplete}>Mark complete</button>}
                </div>
              </div>
            ) : (
              <div className="adtp-card adtp-done">✓ Completed {fmtDay(app.completed_at)}</div>
            )}
          </div>
        </div>
      </div>
      <style>{CSS}</style>
    </AdminShell>
  );
}

const CSS = `
.apx .adtp-back{display:inline-block;font-size:.82rem;font-weight:700;color:var(--muted);text-decoration:none;margin:14px 0 10px}
.apx .adtp-back:hover{color:var(--ink)}
.apx .adtp-head{margin-bottom:18px}
.apx .adtp-id-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:6px}
.apx .adtp-id{font-weight:800;color:var(--ink);font-size:.9rem}
.apx .adtp-ptype{font-size:.62rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:2px 9px;border-radius:100px}
.apx .adtp-ptype.res{background:#eef4ee;color:#2f7d5a}
.apx .adtp-ptype.comm{background:#eef1f8;color:#3a4a72}
.apx .adtp-head h1{font-family:'Bricolage Grotesque',sans-serif;font-size:1.7rem;font-weight:800;letter-spacing:-.01em;margin:0 0 5px}
.apx .adtp-sub{font-size:.86rem;color:var(--muted)}
.apx .adtp-sub b{color:var(--ink)}
.apx .adtp-track{display:flex;align-items:center;gap:0;max-width:560px;margin-bottom:20px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 18px}
.apx .adtp-track-step{display:flex;align-items:center;gap:9px;flex:1;color:var(--muted)}
.apx .adtp-track-step:not(:last-child)::after{content:"";flex:1;height:2px;background:var(--line);margin:0 10px}
.apx .adtp-track-step.done,.apx .adtp-track-step.on{color:var(--ink)}
.apx .adtp-track-step.done:not(:last-child)::after{background:#2f7d5a}
.apx .adtp-track-dot{width:26px;height:26px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:800;background:#eee;color:var(--muted);border:1px solid var(--line)}
.apx .adtp-track-step.done .adtp-track-dot{background:#2f7d5a;border-color:#2f7d5a;color:#fff}
.apx .adtp-track-step.on .adtp-track-dot{background:#C9A96E;border-color:#C9A96E;color:#0B0F1A}
.apx .adtp-track-lbl{font-size:.82rem;font-weight:700;white-space:nowrap}
.apx .adtp-cols{display:grid;grid-template-columns:1.5fr 1fr;gap:18px;align-items:start}
.apx .adtp-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:16px}
.apx .adtp-card-h{display:flex;align-items:center;justify-content:space-between;font-size:.7rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.apx .adtp-card-x{color:#a8894e;font-weight:800}
.apx .adtp-empty{color:var(--muted);font-size:.86rem}
.apx .adtp-equip{border:1px solid var(--line);border-radius:10px;overflow:hidden}
.apx .adtp-equip-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--line);font-size:.88rem}
.apx .adtp-equip-row:first-child{border-top:none}
.apx .adtp-q{font-weight:800;color:#a8894e;min-width:32px}
.apx .adtp-n{flex:1;color:var(--ink)}
.apx .adtp-p{color:var(--muted);font-weight:600}
.apx .adtp-notes{font-size:.88rem;color:var(--ink);line-height:1.5;white-space:pre-wrap}
.apx .adtp-crow{font-size:.88rem;color:var(--ink);padding:3px 0}
.apx .adtp-crow.lnk{color:#8a6d2f;text-decoration:none;display:block}
.apx .adtp-crow.lnk:hover{text-decoration:underline}
.apx .adtp-muted{color:var(--muted)}
.apx .adtp-sched{display:flex;gap:8px;flex-wrap:wrap}
.apx .adtp-sched .apx-input{flex:1;min-width:130px}
.apx .adtp-btns{display:flex;gap:8px;margin-top:11px}
.apx .adtp-btn{height:36px;padding:0 18px;border:none;border-radius:8px;font-size:.84rem;font-weight:800;cursor:pointer;font-family:inherit}
.apx .adtp-btn.gold{background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A}
.apx .adtp-btn.green{background:#2f7d5a;color:#fff}
.apx .adtp-btn:disabled{opacity:.5;cursor:default}
.apx .adtp-err{font-size:.82rem;color:#c0392b;margin-top:8px}
.apx .adtp-done{font-size:.9rem;font-weight:800;color:var(--green)}
@media(max-width:820px){.apx .adtp-cols{grid-template-columns:1fr}}
`;

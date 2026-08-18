"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import DeckView from "../../project/[accessId]/deck-view";
import { adtSummary } from "../../../lib/adt";
import { adminScheduleAdtAction, adminCompleteAdtAction } from "../actions";

const fmtDay = (d) => { if (!d) return ""; try { return new Date(String(d).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
const fmtTax = (t, comm) => { const d = String(t || "").replace(/\D/g, ""); if (d.length !== 9) return t; return comm ? `${d.slice(0, 2)}-${d.slice(2)}` : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`; };
const WINDOWS = ["Morning (8am–12pm)", "Afternoon (12pm–4pm)", "Evening (4pm–7pm)"];

// The ADT account rendered on the SAME Deck as a project — Apply → Schedule → Complete as
// swipeable stages, each opening its tool inline. Reuses DeckView so the chrome matches 1:1.
export default function AdtProjectClient({ user, alerts, app }) {
  const router = useRouter();
  const summary = adtSummary(app.equipment || {});
  const isComm = app.property_type === "commercial";
  const scheduled = !!app.schedule_date;
  const done = app.stage === "completed";
  const [idx, setIdx] = useState(done ? 2 : scheduled ? 2 : 1);   // land on the next action

  const [date, setDate] = useState(app.schedule_date || "");
  const [win, setWin]   = useState(app.schedule_window || WINDOWS[0]);
  const [err, setErr]   = useState("");
  const [pending, startTx] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  const doSchedule = () => startTx(async () => { setErr(""); const r = await adminScheduleAdtAction(app.adt_id, { date, window: win }); if (r?.error) setErr(r.error); else router.refresh(); });
  const doComplete = () => startTx(async () => { setErr(""); const r = await adminCompleteAdtAction(app.adt_id); if (r?.error) setErr(r.error); else router.refresh(); });

  const pad = { padding: "16px 18px" };

  const applyNode = (
    <div style={pad} className="adtp">
      <div className="adtp-badge">{isComm ? "Commercial" : "Residential"} · {app.points || 0} pts · {summary.count} item{summary.count === 1 ? "" : "s"}</div>
      {summary.lines.length === 0 ? <div className="adtp-muted">No equipment on file.</div> : (
        <div className="adtp-list">
          {summary.lines.map((l) => (
            <div key={l.id} className="adtp-row"><span className="adtp-q">{l.qty}×</span><span className="adtp-n">{l.name}</span><span className="adtp-p">{l.linePoints || 0} pts</span></div>
          ))}
        </div>
      )}
      {app.notes && <div className="adtp-notes"><span>Notes</span>{app.notes}</div>}
    </div>
  );

  const scheduleNode = (
    <div style={pad} className="adtp">
      {scheduled && <div className="adtp-ok">Scheduled for <b>{fmtDay(app.schedule_date)}</b>{app.schedule_window ? ` · ${app.schedule_window}` : ""}</div>}
      {!done && (<>
        <div className="adtp-form">
          <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          <select value={win} onChange={(e) => setWin(e.target.value)}>{WINDOWS.map((w) => <option key={w}>{w}</option>)}</select>
        </div>
        {err && <div className="adtp-err">{err}</div>}
        <button className="adtp-btn gold" disabled={pending || !date} onClick={doSchedule}>{scheduled ? "Update date" : "Schedule install"}</button>
      </>)}
    </div>
  );

  const completeNode = (
    <div style={pad} className="adtp">
      {done ? <div className="adtp-ok">✓ Completed {fmtDay(app.completed_at)}</div> : (<>
        <div className="adtp-muted" style={{ marginBottom: 10 }}>Mark the install complete once the technician has finished on site.</div>
        {err && <div className="adtp-err">{err}</div>}
        <button className="adtp-btn green" disabled={pending || !scheduled} onClick={doComplete}>Mark complete</button>
        {!scheduled && <div className="adtp-muted" style={{ marginTop: 8 }}>Schedule the install first.</div>}
      </>)}
    </div>
  );

  const stages = [
    { name: "Apply", pill: "Applied", pct: 100, tint: "gold", turn: "idle", need: "",
      tools: [{ name: "Application", label: `${app.points || 0} pts · ${summary.count} item${summary.count === 1 ? "" : "s"}`, state: "done", node: applyNode }] },
    { name: "Schedule", pill: scheduled ? "Scheduled" : "Awaiting", pct: scheduled ? 100 : 0, tint: "blue",
      turn: done ? "idle" : "mine", need: "Schedule the install",
      tools: [{ name: "Schedule install", label: scheduled ? fmtDay(app.schedule_date) : "Pick a date", state: scheduled ? "done" : "active", node: scheduleNode }] },
    { name: "Complete", pill: done ? "Complete" : "Pending", pct: done ? 100 : 0, tint: "green",
      turn: done ? "idle" : "mine", need: "Mark the install complete",
      tools: [{ name: "Completion", label: done ? `Done ${fmtDay(app.completed_at)}` : "Finish up", state: done ? "done" : "active", node: completeNode }] },
  ];

  const customer = {
    code: app.adt_id,
    name: app.name || "ADT account",
    statusText: isComm ? "Commercial" : "Residential",
    fields: [
      { k: "Property", v: isComm ? "Commercial" : "Residential" },
      app.address && { k: "Address", v: app.address },
      app.phone && { k: "Phone", v: app.phone },
      app.email && { k: "Email", v: app.email },
      app.tax_id && { k: isComm ? "EIN" : "SSN", v: fmtTax(app.tax_id, isComm) },
      app.access_pin && { k: "Access PIN", v: app.access_pin },
      ...(app.emergency || []).filter((c) => c && (c.name || c.phone)).map((c, i) => ({ k: `Emergency ${i + 1}`, v: [c.name, c.phone].filter(Boolean).join(" · ") })),
      app.verbal_password && { k: "Verbal password", v: app.verbal_password },
    ].filter(Boolean),
    actions: [
      app.phone && { label: "Call", href: `tel:${app.phone}` },
      app.email && { label: "Email", href: `mailto:${app.email}` },
      app.address && { label: "Directions", href: `https://maps.google.com/?q=${encodeURIComponent(app.address)}` },
    ].filter(Boolean),
  };

  return (
    <>
      <DeckView
        stages={stages}
        idx={idx}
        onIdx={setIdx}
        canAdvance={false}
        customer={customer}
        roleLabel="24/7 Monitoring"
        menu={[{ label: "All ADT applications", onClick: () => router.push("/adt-applications") }]}
      />
      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.adtp{font-family:var(--font-sans),inherit}
.adtp-badge{display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.02em;color:var(--dv-gold-deep,#A8842F);background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;padding:4px 12px;margin-bottom:12px}
.adtp-muted{color:var(--dv-meta,#787D84);font-size:.86rem}
.adtp-list{border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;overflow:hidden}
.adtp-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--dv-line-soft,#EDEDE9);font-size:.88rem;color:var(--dv-ink,#101418)}
.adtp-row:first-child{border-top:none}
.adtp-q{font-weight:800;color:var(--dv-gold-deep,#A8842F);min-width:32px}
.adtp-n{flex:1}
.adtp-p{color:var(--dv-meta,#787D84);font-weight:600}
.adtp-notes{margin-top:12px;font-size:.86rem;color:var(--dv-ink,#101418);background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:10px 12px;line-height:1.5}
.adtp-notes span{display:block;font-size:.64rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-bottom:3px}
.adtp-ok{font-size:.9rem;font-weight:700;color:var(--dv-green,#2E7D5B);margin-bottom:12px}
.adtp-ok b{color:var(--dv-ink,#101418)}
.adtp-form{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:11px}
.adtp-form input,.adtp-form select{height:40px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:#fff;color:var(--dv-ink,#101418);padding:0 11px;font-size:.86rem;font-family:inherit;outline:none;flex:1;min-width:140px}
.adtp-form input:focus,.adtp-form select:focus{border-color:var(--dv-gold,#C9A96E)}
.adtp-btn{height:40px;padding:0 20px;border:none;border-radius:9px;font-size:.86rem;font-weight:700;cursor:pointer;font-family:inherit}
.adtp-btn.gold{background:var(--dv-ink,#101418);color:#fff}
.adtp-btn.green{background:var(--dv-green,#2E7D5B);color:#fff}
.adtp-btn:hover{filter:brightness(1.1)}
.adtp-btn:disabled{opacity:.5;cursor:default}
.adtp-err{font-size:.82rem;color:var(--dv-red,#C4553D);margin-bottom:8px}
`;

"use client";

import { useState, useEffect, useRef, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import DeckView from "../../project/[accessId]/deck-view";
import { adtSummary } from "../../../lib/adt";
import { adminScheduleAdtAction, adminCompleteAdtAction, saveAdtDealAction, shareAdtDealAction } from "../actions";

// The ADT Tool (commission calculator) embedded as a heavy Deck tool. The iframe carries its own
// vault-dark chrome; we only pass role + prefill and bridge its autosave back to the record so a
// reload — or another role — opens the same numbers. Sales gets Rep view (locked); office gets Admin.
function DealFrame({ adtId, view, locked, rep, cust, deal }) {
  const ref = useRef(null);
  const saveTimer = useRef(null);
  useEffect(() => {
    function onMsg(e) {
      const m = e.data || {};
      if (!m || m.adt !== adtId) return;
      if (m.type === "adt-ready") {
        try { ref.current?.contentWindow?.postMessage({ type: "adt-deal-load", deal: deal || null }, "*"); } catch {}
      } else if (m.type === "adt-deal-save") {
        clearTimeout(saveTimer.current);
        const payload = m.deal;
        saveTimer.current = setTimeout(() => { saveAdtDealAction(adtId, payload); }, 700);
      }
    }
    window.addEventListener("message", onMsg);
    return () => { window.removeEventListener("message", onMsg); clearTimeout(saveTimer.current); };
  }, [adtId, deal]);
  const qs = new URLSearchParams({ embed: "1", view, adt: adtId });
  if (locked) qs.set("lock", "1");
  if (rep) qs.set("rep", rep);
  if (cust) qs.set("cust", cust);
  const push = () => { try { ref.current?.contentWindow?.postMessage({ type: "adt-deal-load", deal: deal || null }, "*"); } catch {} };
  return <iframe ref={ref} title="ADT Tool" src={`/widgets/adt-calculator.html?${qs.toString()}`} onLoad={push}
    style={{ width: "100%", border: "none", display: "block", background: "#FAF8F4" }} />;
}

// Drawer action icons — DeckView renders drawer actions as icon-only buttons, so pass SVGs (bare
// text labels would collide inside the 36px icon box).
const DVI = {
  call: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  mail: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>,
  dir: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>,
};
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

  // The deal (ADT Tool): sales prices in Rep view (locked); office prices in Admin view.
  const dealView = user?.role === "sales" ? "rep" : "admin";
  const dealLocked = user?.role === "sales";
  const dealObj = useMemo(() => { try { return app.deal_json ? JSON.parse(app.deal_json) : null; } catch { return null; } }, [app.deal_json]);
  const hasDeal = !!app.deal_json;

  // Stages: Apply(0) → Deal(1) → Schedule(2) → Complete(3). Land on the earliest open staff action.
  const [idx, setIdx] = useState(done ? 3 : scheduled ? 3 : hasDeal ? 2 : 1);

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

  const prefDays = app.pref_days || [], prefWins = app.pref_windows || [];
  const scheduleNode = (
    <div style={pad} className="adtp">
      {(prefDays.length || prefWins.length) ? (
        <div className="adtp-pref">
          <span>Customer prefers</span>
          {prefDays.length ? <b>{prefDays.join(", ")}</b> : <b>any day</b>}
          {prefWins.length ? <> · <b>{prefWins.join(", ")}</b></> : null}
        </div>
      ) : null}
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

  const dealNode = <DealFrame adtId={app.adt_id} view={dealView} locked={dealLocked} rep={user?.name || ""} cust={app.name || ""} deal={dealObj} />;

  const [shared, setShared] = useState(!!app.deal_shared);
  const [shareErr, setShareErr] = useState("");
  const doShare = (on) => startTx(async () => { setShareErr(""); const r = await shareAdtDealAction(app.adt_id, on); if (r?.error) setShareErr(r.error); else { setShared(on); router.refresh(); } });
  const shareNode = (
    <div style={pad} className="adtp">
      {shared
        ? <div className="adtp-ok">✓ Shared — the customer sees their quote on the ADT portal</div>
        : <div className="adtp-muted" style={{ marginBottom: 10 }}>The customer sees no pricing until you share it. They'll get retail, activation, your applied credit, and due-at-install — never cost or commission.</div>}
      {shareErr && <div className="adtp-err">{shareErr}</div>}
      {shared
        ? <button className="adtp-btn ghost" disabled={pending} onClick={() => doShare(false)}>Unshare</button>
        : <button className="adtp-btn gold" disabled={pending || !hasDeal} onClick={() => doShare(true)}>Share with customer</button>}
      {!hasDeal && !shared && <div className="adtp-muted" style={{ marginTop: 8 }}>Price the deal first.</div>}
    </div>
  );

  const stages = [
    { name: "Apply", pill: "Applied", pct: 100, tint: "gold", turn: "idle", need: "",
      tools: [{ name: "Application", label: `${app.points || 0} pts · ${summary.count} item${summary.count === 1 ? "" : "s"}`, state: "done", node: applyNode }] },
    { name: "Deal", pill: hasDeal ? (shared ? "Shared" : "Priced") : "Open", pct: hasDeal ? 100 : 0, tint: "purple",
      turn: done ? "idle" : "mine", need: "Price the deal",
      tools: [
        { name: "ADT Tool", label: hasDeal ? (dealView === "rep" ? "Your commission" : "Priced") : "Price the deal", state: hasDeal ? "done" : "active", heavy: true, node: dealNode },
        { name: "Customer quote", label: shared ? "Shared with customer" : "Not shared", state: shared ? "done" : "active", node: shareNode },
      ] },
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
      app.phone && { label: "Call", icon: DVI.call, href: `tel:${app.phone}` },
      app.email && { label: "Email", icon: DVI.mail, href: `mailto:${app.email}` },
      app.address && { label: "Directions", icon: DVI.dir, href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(app.address)}` },
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
.adtp-pref{font-size:.84rem;color:var(--dv-ink,#101418);background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:9px 12px;margin-bottom:12px}
.adtp-pref span{display:block;font-size:.62rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-bottom:3px}
.adtp-pref b{color:var(--dv-gold-deep,#A8842F)}
.adtp-ok{font-size:.9rem;font-weight:700;color:var(--dv-green,#2E7D5B);margin-bottom:12px}
.adtp-ok b{color:var(--dv-ink,#101418)}
.adtp-form{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:11px}
.adtp-form input,.adtp-form select{height:40px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:#fff;color:var(--dv-ink,#101418);padding:0 11px;font-size:.86rem;font-family:inherit;outline:none;flex:1;min-width:140px}
.adtp-form input:focus,.adtp-form select:focus{border-color:var(--dv-gold,#C9A96E)}
.adtp-btn{height:40px;padding:0 20px;border:none;border-radius:9px;font-size:.86rem;font-weight:700;cursor:pointer;font-family:inherit}
.adtp-btn.gold{background:var(--dv-ink,#101418);color:#fff}
.adtp-btn.green{background:var(--dv-green,#2E7D5B);color:#fff}
.adtp-btn.ghost{background:#fff;border:1px solid var(--dv-line,#E4E4DF);color:var(--dv-ink,#101418)}
.adtp-btn:hover{filter:brightness(1.1)}
.adtp-btn:disabled{opacity:.5;cursor:default}
.adtp-err{font-size:.82rem;color:var(--dv-red,#C4553D);margin-bottom:8px}
`;

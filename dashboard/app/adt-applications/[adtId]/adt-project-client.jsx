"use client";

import { useState, useEffect, useRef, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import DeckView from "../../project/[accessId]/deck-view";
import { adtSummary, adtStatusMeta } from "../../../lib/adt";
import { adminScheduleAdtAction, adminCompleteAdtAction, saveAdtDealAction, shareAdtDealAction, setAdtStatusAction } from "../actions";

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
const fmtPhone = (s) => { const d = String(s || "").replace(/\D/g, "").slice(0, 10); if (d.length < 10) return s || ""; return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };
// Mask everything but the last 4 digits of a formatted tax id ("123-45-6789" → "•••-••-6789").
const maskTax = (formatted) => { const total = (String(formatted).match(/\d/g) || []).length; let seen = 0; return String(formatted).replace(/\d/g, (d) => (++seen <= total - 4 ? "•" : d)); };
const WINDOWS = ["Morning (8am–12pm)", "Afternoon (12pm–4pm)", "Evening (4pm–7pm)"];

// Sensitive value hidden until the operator taps View — SSN/EIN and the verbal password.
function RevealField({ value, mask }) {
  const [show, setShow] = useState(false);
  if (!value) return null;
  return (
    <span className="adtp-reveal">
      <span className="adtp-reveal-v">{show ? value : (mask || "••••••")}</span>
      <button type="button" className="adtp-reveal-btn" onClick={() => setShow((s) => !s)}>{show ? "Hide" : "View"}</button>
    </span>
  );
}

// The ADT account rendered on the SAME Deck as a project — Apply → Deal → Complete as swipeable
// stages (scheduling folded into Complete). Reuses DeckView so the chrome matches 1:1.
export default function AdtProjectClient({ user, alerts, app }) {
  const router = useRouter();
  const summary = adtSummary(app.equipment || {});
  const isComm = app.property_type === "commercial";
  const scheduled = !!app.schedule_date;
  const done = app.stage === "completed";
  const status = app.status || "submitted";
  const sm = adtStatusMeta(status);

  // The deal (ADT Tool): sales prices in Rep view (locked); office prices in Admin view.
  const dealView = user?.role === "sales" ? "rep" : "admin";
  const dealLocked = user?.role === "sales";
  const dealObj = useMemo(() => { try { return app.deal_json ? JSON.parse(app.deal_json) : null; } catch { return null; } }, [app.deal_json]);
  const hasDeal = !!app.deal_json;

  // Stages: Apply(0) → Deal(1) → Complete(2). Land on the earliest open staff action.
  const [idx, setIdx] = useState(done ? 2 : hasDeal ? 2 : 1);

  const [date, setDate] = useState(app.schedule_date || "");
  const [win, setWin]   = useState(app.schedule_window || WINDOWS[0]);
  const [err, setErr]   = useState("");
  const [pending, startTx] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  const doSchedule = () => startTx(async () => { setErr(""); const r = await adminScheduleAdtAction(app.adt_id, { date, window: win }); if (r?.error) setErr(r.error); else router.refresh(); });
  const doComplete = () => startTx(async () => { setErr(""); const r = await adminCompleteAdtAction(app.adt_id); if (r?.error) setErr(r.error); else router.refresh(); });
  const setStatus = (s) => startTx(async () => { setErr(""); const r = await setAdtStatusAction(app.adt_id, s); if (r?.error) setErr(r.error); else router.refresh(); });

  const pad = { padding: "16px 18px" };
  const prefDays = app.pref_days || [], prefWins = app.pref_windows || [];

  const applyNode = (
    <div style={pad} className="adtp">
      <div className="adtp-statusrow">
        <div className="adtp-statusrow-l"><span className="adtp-sub" style={{ margin: 0 }}>Credit status</span>
          <span className="adtp-status-badge" style={{ color: sm.color, background: sm.color + "1a", border: `1px solid ${sm.color}33` }}>{sm.label}</span></div>
        {status !== "installed" && (
          <div className="adtp-status-btns">
            {status !== "in_review" && <button className="adtp-chip" disabled={pending} onClick={() => setStatus("in_review")}>In review</button>}
            {status !== "approved" && <button className="adtp-chip green" disabled={pending} onClick={() => setStatus("approved")}>Approve</button>}
            {status !== "declined" && <button className="adtp-chip red" disabled={pending} onClick={() => setStatus("declined")}>Decline</button>}
          </div>
        )}
      </div>
      <div className="adtp-badge">{isComm ? "Commercial" : "Residential"} · ${summary.price.toLocaleString()} · {summary.points} pts · {summary.count} item{summary.count === 1 ? "" : "s"}</div>
      {summary.lines.length === 0 ? <div className="adtp-muted">No equipment on file.</div> : (
        <div className="adtp-list">
          {summary.lines.map((l) => (
            <div key={l.id} className="adtp-row"><span className="adtp-q">{l.qty}×</span><span className="adtp-n">{l.name}</span><span className="adtp-p">{l.linePrice ? `$${l.linePrice.toLocaleString()}` : ""}{l.linePrice && l.linePoints ? " · " : ""}{l.linePoints ? `${l.linePoints} pts` : (l.linePrice ? "" : "0 pts")}</span></div>
          ))}
        </div>
      )}
      {(prefDays.length || prefWins.length) ? (
        <div className="adtp-pref">
          <span>Preferred install times</span>
          {prefDays.length ? <b>{prefDays.join(", ")}</b> : <b>Any day</b>}
          {prefWins.length ? <> · <b>{prefWins.join(", ")}</b></> : null}
        </div>
      ) : null}
      {app.notes && <div className="adtp-notes"><span>Notes</span>{app.notes}</div>}
    </div>
  );

  // Complete = schedule the firm install date + mark it done (the old Schedule stage folded in here).
  const completeNode = (
    <div style={pad} className="adtp">
      {done ? <div className="adtp-ok">✓ Completed {fmtDay(app.completed_at)}</div> : (<>
        {scheduled && <div className="adtp-ok">Scheduled for <b>{fmtDay(app.schedule_date)}</b>{app.schedule_window ? ` · ${app.schedule_window}` : ""}</div>}
        <div className="adtp-sub">{scheduled ? "Update the date" : "Set the install date"}</div>
        <div className="adtp-form">
          <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          <select value={win} onChange={(e) => setWin(e.target.value)}>{WINDOWS.map((w) => <option key={w}>{w}</option>)}</select>
        </div>
        <button className="adtp-btn gold" disabled={pending || !date} onClick={doSchedule}>{scheduled ? "Update date" : "Schedule install"}</button>
        {err && <div className="adtp-err" style={{ marginTop: 10 }}>{err}</div>}
        <div className="adtp-sub" style={{ marginTop: 16 }}>Once the technician finishes on site</div>
        <button className="adtp-btn green" disabled={pending || !scheduled} onClick={doComplete}>Mark complete</button>
        {!scheduled && <div className="adtp-muted" style={{ marginTop: 8 }}>Set the install date first.</div>}
      </>)}
    </div>
  );

  const dealNode = <DealFrame adtId={app.adt_id} view={dealView} locked={dealLocked} rep={user?.name || ""} cust={app.name || ""} deal={dealObj} />;

  const [shared, setShared] = useState(!!app.deal_shared);
  const [shareErr, setShareErr] = useState("");
  const doShare = (on) => startTx(async () => { setShareErr(""); const r = await shareAdtDealAction(app.adt_id, on); if (r?.error) setShareErr(r.error); else { setShared(on); router.refresh(); } });
  const accepted = !!app.deal_accepted;
  const shareNode = (
    <div style={pad} className="adtp">
      {accepted && <div className="adtp-ok">✓ Customer accepted the quote</div>}
      {shared
        ? !accepted && <div className="adtp-ok">✓ Shared — the customer sees their quote on the ADT portal</div>
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
        { name: "Customer quote", label: accepted ? "Accepted by customer" : shared ? "Shared with customer" : "Not shared", state: shared ? "done" : "active", node: shareNode },
      ] },
    { name: "Complete", pill: done ? "Complete" : scheduled ? "Scheduled" : "Pending", pct: done ? 100 : scheduled ? 60 : 0, tint: "green",
      turn: done ? "idle" : "mine", need: "Schedule + complete the install",
      tools: [{ name: "Schedule & finish", label: done ? `Done ${fmtDay(app.completed_at)}` : scheduled ? fmtDay(app.schedule_date) : "Set install date", state: done ? "done" : "active", node: completeNode }] },
  ];

  const customer = {
    code: app.adt_id,
    name: app.name || "ADT account",
    statusText: isComm ? "Commercial" : "Residential",
    fields: [
      { k: "Property", v: isComm ? "Commercial" : "Residential" },
      app.address && { k: "Address", v: app.address },
      app.phone && { k: "Phone", v: fmtPhone(app.phone) },
      app.email && { k: "Email", v: app.email },
      app.tax_id && { k: isComm ? "EIN" : "SSN", v: <RevealField value={fmtTax(app.tax_id, isComm)} mask={maskTax(fmtTax(app.tax_id, isComm))} /> },
      app.access_pin && { k: "Access PIN", v: app.access_pin },
      app.verbal_password && { k: "Verbal password", v: <RevealField value={app.verbal_password} /> },
      ...(app.emergency || []).filter((c) => c && (c.name || c.phone)).map((c, i) => ({ k: `Emergency ${i + 1}`, v: c.name || "—", sub: c.phone ? fmtPhone(c.phone) : "" })),
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
        statusChip={sm}
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
.adtp-sub{font-size:.68rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin:0 0 8px}
.adtp-statusrow{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--dv-line-soft,#EDEDE9)}
.adtp-statusrow-l{display:flex;align-items:center;gap:10px}
.adtp-status-badge{font-size:.74rem;font-weight:800;padding:3px 11px;border-radius:100px}
.adtp-status-btns{display:flex;gap:6px}
.adtp-chip{font-size:.74rem;font-weight:700;padding:5px 12px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink,#101418);cursor:pointer}
.adtp-chip:hover:not(:disabled){border-color:var(--dv-gold,#C9A96E)}
.adtp-chip.green{border-color:#bfe3cb;color:#1c8a45}
.adtp-chip.red{border-color:#f0cfca;color:#c0392b}
.adtp-chip:disabled{opacity:.5;cursor:default}
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
.adtp-reveal{display:inline-flex;align-items:center;gap:8px}
.adtp-reveal-v{font-variant-numeric:tabular-nums}
.adtp-reveal-btn{font-size:.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-gold-deep,#A8842F);background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;padding:2px 9px;cursor:pointer}
.adtp-reveal-btn:hover{border-color:var(--dv-gold,#C9A96E)}
`;

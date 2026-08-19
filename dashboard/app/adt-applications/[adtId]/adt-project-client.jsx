"use client";

import { useState, useEffect, useRef, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import DeckView from "../../project/[accessId]/deck-view";
import { adtSummary, adtStatusMeta, adtQuoteSeed } from "../../../lib/adt";
import { fmtSignStamp } from "../../../lib/proposal";
import { adminScheduleAdtAction, adminCompleteAdtAction, saveAdtDealAction, shareAdtDealAction, setAdtStatusAction, updateAdtApplicationAction, setAdtDocsNoteAction } from "../actions";
import AdtIntake from "../../adt/adt-intake";

// The ADT Tool (commission calculator) embedded as a heavy Deck tool. The iframe carries its own
// vault-dark chrome; we only pass role + prefill and bridge its autosave back to the record so a
// reload — or another role — opens the same numbers. Sales gets Rep view (locked); office gets Admin.
function DealFrame({ adtId, view, locked, rep, cust, deal, seed, onSubmit }) {
  const ref = useRef(null);
  const saveTimer = useRef(null);
  // No saved deal yet → seed the calculator from the application's equipment (application → quote).
  const initial = deal || (seed && Object.keys(seed).length ? { seedByName: seed, cust } : null);
  useEffect(() => {
    function onMsg(e) {
      const m = e.data || {};
      if (!m || m.adt !== adtId) return;
      if (m.type === "adt-ready") {
        try { ref.current?.contentWindow?.postMessage({ type: "adt-deal-load", deal: initial }, "*"); } catch {}
      } else if (m.type === "adt-deal-save") {
        clearTimeout(saveTimer.current);
        const payload = m.deal;
        saveTimer.current = setTimeout(() => { saveAdtDealAction(adtId, payload); }, 700);
      } else if (m.type === "adt-deal-submit") {
        // Submit = flush the numbers now, then hand off to the Deck (share the quote with the customer).
        clearTimeout(saveTimer.current);
        if (m.deal) saveAdtDealAction(adtId, m.deal);
        onSubmit?.();
      }
    }
    window.addEventListener("message", onMsg);
    return () => { window.removeEventListener("message", onMsg); clearTimeout(saveTimer.current); };
  }, [adtId, deal, onSubmit]);
  const qs = new URLSearchParams({ embed: "1", view, adt: adtId });
  if (locked) qs.set("lock", "1");
  if (rep) qs.set("rep", rep);
  if (cust) qs.set("cust", cust);
  const push = () => { try { ref.current?.contentWindow?.postMessage({ type: "adt-deal-load", deal: initial }, "*"); } catch {} };
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

// Copy a value to the clipboard — the office fills ADT's own credit app from these fields.
function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  if (!text) return <span className="adtp-copy-sp" />;
  const copy = () => { try { navigator.clipboard.writeText(String(text)); setDone(true); setTimeout(() => setDone(false), 1200); } catch {} };
  return (
    <button type="button" className={"adtp-copy" + (done ? " ok" : "")} onClick={copy} title="Copy" aria-label="Copy">
      {done
        ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        : <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>}
    </button>
  );
}

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
  const emerg = (app.emergency || []).filter((c) => c && (c.name || c.phone));
  const office = ["admin", "manager"].includes(user?.role);   // edit is office-only
  const [editing, setEditing] = useState(false);
  const [docsNote, setDocsNote] = useState(app.docs_note || "");
  const [docsSaved, setDocsSaved] = useState(false);
  const saveEdit = async (payload) => { const r = await updateAdtApplicationAction(app.adt_id, payload); if (r?.ok) setEditing(false); return r; };
  const saveDocsNote = () => startTx(async () => {
    setErr("");
    const r = await setAdtDocsNoteAction(app.adt_id, docsNote);
    if (r?.error) { setErr(r.error); return; }
    setDocsSaved(true); setTimeout(() => setDocsSaved(false), 1800);
    router.refresh();
  });

  const applyNode = editing ? (
    <div className="adtp">
      <div className="adtp-editbar"><b>Edit application</b><button type="button" className="adtp-chip" onClick={() => setEditing(false)}>Cancel</button></div>
      <AdtIntake existing={app} submitLabel="Save changes →" onSubmit={saveEdit} />
    </div>
  ) : (
    <div style={pad} className="adtp">
      {office && <div className="adtp-editrow"><button type="button" className="adtp-chip" onClick={() => setEditing(true)}>Revise application</button></div>}
      <div className="adtp-statusrow">
        <div className="adtp-statusrow-l"><span className="adtp-sub" style={{ margin: 0 }}>Credit status</span>
          <span className="adtp-status-badge" style={{ color: sm.color, background: sm.color + "1a", border: `1px solid ${sm.color}33` }}>{sm.label}</span></div>
        {status !== "installed" && (
          <select className="adtp-status-sel" value={status} disabled={pending} onChange={(e) => setStatus(e.target.value)} style={{ color: sm.color }}>
            {["submitted", "in_review", "needs_docs", "approved", "declined"].map((s) => <option key={s} value={s} style={{ color: "#101418" }}>{adtStatusMeta(s).label}</option>)}
          </select>
        )}
      </div>
      {status === "needs_docs" && (
        <div className="adtp-docs">
          <span className="adtp-sub" style={{ margin: 0 }}>Which documents does the customer need to provide?</span>
          <textarea className="adtp-docs-in" rows={2} value={docsNote} onChange={(e) => setDocsNote(e.target.value)} placeholder="e.g. Articles of formation, EIN letter, proof of business address…" />
          <button type="button" className="adtp-chip" disabled={pending} onClick={saveDocsNote}>{docsSaved ? "Saved" : "Save request"}</button>
          {err && <span className="adtp-docs-err">{err}</span>}
        </div>
      )}
      {app.customer_docs?.length > 0 && (
        <div className="adtp-updocs">
          <span className="adtp-sub" style={{ margin: "0 0 7px" }}>Documents the customer uploaded</span>
          <div className="adtp-updocs-list">
            {app.customer_docs.map((d, i) => (
              <a key={i} className="adtp-updoc" href={d.data} download={d.name} target="_blank" rel="noreferrer">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/></svg>
                {d.name}
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="adtp-cd-sec">Customer details <em style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "var(--dv-meta,#787D84)" }}>· tap to copy</em></div>
      <div className="adtp-cd">
        <div className="adtp-cd-f"><CopyBtn text={app.name} /><div className="adtp-cd-v"><span>{isComm ? "Business" : "Name"}</span><b>{app.name || "—"}</b></div></div>
        {isComm && app.contact_name && <div className="adtp-cd-f"><CopyBtn text={app.contact_name} /><div className="adtp-cd-v"><span>Contact</span><b>{app.contact_name}</b></div></div>}
        <div className="adtp-cd-f"><span className="adtp-copy-sp" /><div className="adtp-cd-v"><span>Property</span><b>{isComm ? "Commercial" : "Residential"}</b></div></div>
        {app.phone && <div className="adtp-cd-f"><CopyBtn text={fmtPhone(app.phone)} /><div className="adtp-cd-v"><span>Phone</span><b>{fmtPhone(app.phone)}</b></div></div>}
        {app.email && <div className="adtp-cd-f"><CopyBtn text={app.email} /><div className="adtp-cd-v"><span>Email</span><b>{app.email}</b></div></div>}
        {app.address && <div className="adtp-cd-f full"><CopyBtn text={app.address} /><div className="adtp-cd-v"><span>Install address</span><b>{app.address}</b></div></div>}
        {app.tax_id && <div className="adtp-cd-f"><CopyBtn text={fmtTax(app.tax_id, isComm)} /><div className="adtp-cd-v"><span>{isComm ? "EIN" : "SSN"}</span><b><RevealField value={fmtTax(app.tax_id, isComm)} mask={maskTax(fmtTax(app.tax_id, isComm))} /></b></div></div>}
        {app.access_pin && <div className="adtp-cd-f"><CopyBtn text={app.access_pin} /><div className="adtp-cd-v"><span>Access PIN</span><b>{app.access_pin}</b></div></div>}
        {app.verbal_password && <div className="adtp-cd-f"><CopyBtn text={app.verbal_password} /><div className="adtp-cd-v"><span>Verbal password</span><b><RevealField value={app.verbal_password} /></b></div></div>}
        {emerg.flatMap((c, i) => [
          c.name && <div key={`en${i}`} className="adtp-cd-f"><CopyBtn text={c.name} /><div className="adtp-cd-v"><span>Emergency {i + 1} name</span><b>{c.name}</b></div></div>,
          c.phone && <div key={`ep${i}`} className="adtp-cd-f"><CopyBtn text={fmtPhone(c.phone)} /><div className="adtp-cd-v"><span>Emergency {i + 1} phone</span><b>{fmtPhone(c.phone)}</b></div></div>,
        ]).filter(Boolean)}
      </div>

      {app.verification_doc?.data && (<>
        <div className="adtp-cd-sec">Business verification</div>
        <a className="adtp-doc" href={app.verification_doc.data} download={app.verification_doc.name || "verification"} target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          <span className="adtp-doc-n">{app.verification_doc.name || "Document"}</span><em>Open</em>
        </a>
      </>)}

      {(prefDays.length || prefWins.length || app.asap) ? (
        <div className="adtp-pref">
          <span>Preferred install times</span>
          {app.asap ? <b className="adtp-asap">ASAP</b> : null}
          {app.asap && (prefDays.length || prefWins.length) ? " · " : null}
          {prefDays.length ? <b>{prefDays.join(", ")}</b> : (app.asap ? null : <b>Any day</b>)}
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

  const [shared, setShared] = useState(!!app.deal_shared);
  const [shareErr, setShareErr] = useState("");
  const doShare = (on) => startTx(async () => { setShareErr(""); const r = await shareAdtDealAction(app.adt_id, on); if (r?.error) setShareErr(r.error); else { setShared(on); router.refresh(); } });
  const accepted = !!app.deal_accepted;
  const signed = !!app.deal_signed;

  // Submit from inside the ADT Tool → share the quote with the customer (the "send it like the proposal" step).
  const dealNode = <DealFrame adtId={app.adt_id} view={dealView} locked={dealLocked} rep={user?.name || ""} cust={app.name || ""} deal={dealObj} seed={adtQuoteSeed(app.equipment)} onSubmit={() => doShare(true)} />;
  const shareNode = (
    <div style={pad} className="adtp">
      {signed ? (
        <div className="adtp-signrec">
          <div className="adtp-signrec-h">✓ Signed by customer</div>
          {app.deal_signature_data
            ? <img src={app.deal_signature_data} alt="Customer signature" className="adtp-signrec-img" />
            : <span className="adtp-signrec-typed">{app.deal_signed_name}</span>}
          <div className="adtp-signrec-meta">{app.deal_signed_name}{app.deal_signed_at ? ` · Signed ${fmtSignStamp(app.deal_signed_at)}` : ""}</div>
        </div>
      ) : accepted ? <div className="adtp-ok">✓ Customer accepted the quote</div> : null}
      {shared
        ? !signed && <div className="adtp-ok">✓ Shared — the customer sees their quote and can sign it on the ADT portal</div>
        : <div className="adtp-muted" style={{ marginBottom: 10 }}>The customer sees no pricing until you share it. They'll get retail, activation, your applied credit, and due-at-install — never cost or commission.</div>}
      {shareErr && <div className="adtp-err">{shareErr}</div>}
      {shared
        ? !signed && <button className="adtp-btn ghost" disabled={pending} onClick={() => doShare(false)}>Unshare</button>
        : <button className="adtp-btn gold" disabled={pending || !hasDeal} onClick={() => doShare(true)}>Share with customer</button>}
      {!hasDeal && !shared && <div className="adtp-muted" style={{ marginTop: 8 }}>Price the deal first.</div>}
    </div>
  );

  const stages = [
    { name: "Apply", pill: "Applied", pct: 100, tint: "gold", turn: "idle", need: "",
      mark: app.status === "needs_docs" ? "attention" : "complete",
      tools: [{ name: "Customer's application", label: isComm ? "Commercial" : "Residential", state: "done", node: applyNode }] },
    { name: "Deal", pill: hasDeal ? (shared ? "Shared" : "Priced") : "Open", pct: hasDeal ? 100 : 0, tint: "purple",
      turn: done ? "idle" : "mine", need: "Price the deal",
      // priced-not-shared = done (solid yellow); shared-not-signed = the customer owes a signature (blink red); signed = complete.
      mark: signed ? "complete" : shared ? "attention" : hasDeal ? "done" : "active",
      tools: [
        { name: "ADT Tool", label: hasDeal ? (dealView === "rep" ? "Your commission" : "Priced") : "Price the deal", state: hasDeal ? "done" : "active", heavy: true, node: dealNode },
        { name: "Customer quote", label: signed ? "Signed by customer" : shared ? "Shared with customer" : "Not shared", state: shared ? "done" : "active", node: shareNode },
      ] },
    { name: "Complete", pill: done ? "Complete" : scheduled ? "Scheduled" : "Pending", pct: done ? 100 : scheduled ? 60 : 0, tint: "green",
      turn: done ? "idle" : "mine", need: "Schedule + complete the install",
      // signed but not yet scheduled → the office needs to book the install (needs attention).
      mark: done ? "complete" : scheduled ? "active" : signed ? "attention" : "todo",
      tools: [{ name: "Schedule & finish", label: done ? `Done ${fmtDay(app.completed_at)}` : scheduled ? fmtDay(app.schedule_date) : "Set install date", state: done ? "done" : "active", node: completeNode }] },
  ];

  const customer = {
    code: app.adt_id,
    name: app.name || "ADT account",
    statusText: isComm ? "Commercial" : "Residential",
    fields: [
      { k: "Property", v: isComm ? "Commercial" : "Residential" },
      isComm && app.contact_name && { k: "Contact", v: app.contact_name },
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
        roleLabel={{ admin: "Admin view", manager: "Manager view", sales: "Sales view" }[user?.role] || "Staff view"}
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
.adtp-q{font-weight:800;color:var(--dv-ink,#101418);min-width:32px}
.adtp-n{flex:1}
.adtp-p{color:var(--dv-ink,#101418);font-weight:700}
.adtp-cd-sec{font-size:.64rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin:16px 0 9px}
.adtp-cd-sec em{font-style:normal;font-weight:700;color:var(--dv-ink,#101418);letter-spacing:0;margin-left:6px}
.adtp-cd{display:grid;grid-template-columns:1fr 1fr;gap:11px 20px;margin-bottom:4px}
.adtp-cd-f{min-width:0;display:flex;align-items:flex-start;gap:8px}
.adtp-cd-f.full{grid-column:1/-1}
.adtp-cd-v{min-width:0;flex:1}
.adtp-cd-v span{display:block;font-size:.62rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-bottom:2px}
.adtp-cd-v b{font-size:.88rem;font-weight:600;color:var(--dv-ink,#101418);word-break:break-word}
.adtp-copy{flex:none;width:24px;height:24px;margin-top:1px;display:grid;place-items:center;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:var(--dv-paper,#F4F4F2);color:var(--dv-meta,#787D84);cursor:pointer;transition:.12s}
.adtp-copy:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.adtp-copy.ok{border-color:var(--dv-green,#2E7D5B);color:var(--dv-green,#2E7D5B)}
.adtp-copy-sp{flex:none;width:24px}
.adtp-chip.amber{border-color:#f0d9bf;color:#c46a1a}
.adtp-status-sel{height:33px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:#fff;font-size:.8rem;font-weight:700;padding:0 12px;cursor:pointer;font-family:inherit;outline:none}
.adtp-status-sel:hover{border-color:var(--dv-gold,#C9A96E)}
.adtp-doc{display:flex;align-items:center;gap:10px;padding:11px 13px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-raise,#FBFBFA);color:var(--dv-gold-deep,#A8842F);text-decoration:none;transition:.12s}
.adtp-doc:hover{border-color:var(--dv-gold,#C9A96E);background:#fff}
.adtp-doc-n{flex:1;font-size:.86rem;font-weight:600;color:var(--dv-ink,#101418);word-break:break-all}
.adtp-doc em{font-style:normal;font-size:.74rem;font-weight:700;color:var(--dv-gold-deep,#A8842F)}
.adtp-docs{margin-bottom:14px;padding:12px 13px;border:1px solid #f0d9bf;background:#fdf6ec;border-radius:11px;display:flex;flex-direction:column;gap:9px;align-items:flex-start}
.adtp-docs-in{width:100%;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:9px 11px;font-size:.86rem;font-family:inherit;resize:vertical;outline:none;background:#fff;color:var(--dv-ink,#101418)}
.adtp-docs-in:focus{border-color:var(--dv-gold,#C9A96E)}
.adtp-docs-err{font-size:.78rem;color:#c0392b;font-weight:600}
.adtp-updocs{margin-bottom:14px}
.adtp-updocs-list{display:flex;flex-wrap:wrap;gap:8px}
.adtp-updoc{display:inline-flex;align-items:center;gap:7px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:8px 12px;font-size:.83rem;font-weight:600;color:var(--dv-ink,#101418);text-decoration:none}
.adtp-updoc:hover{border-color:var(--dv-gold,#C9A96E)}
.adtp-updoc svg{color:var(--dv-gold-deep,#9A7B43)}
.adtp-foot{display:flex;align-items:center;gap:10px;margin-top:16px;padding-top:14px;border-top:1px solid var(--dv-line,#E4E4DF)}
.adtp-foot span{font-size:.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.adtp-foot b{font-size:1.15rem;font-weight:800;color:var(--dv-ink,#101418)}
.adtp-foot i{font-style:normal;font-size:.8rem;color:var(--dv-meta,#787D84);margin-left:auto}
.adtp-row{transition:background .12s}
.adtp-row:hover{background:rgba(201,169,110,.08)}
.adtp-cd-f{border-radius:8px;transition:background .12s}
.adtp-cd-f:hover{background:rgba(201,169,110,.07)}
.adtp-notes{margin-top:12px;font-size:.86rem;color:var(--dv-ink,#101418);background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:10px 12px;line-height:1.5}
.adtp-notes span{display:block;font-size:.64rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-bottom:3px}
.adtp-pref{font-size:.84rem;color:var(--dv-ink,#101418);background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:9px 12px;margin-bottom:12px}
.adtp-pref .adtp-asap{color:var(--dv-gold-deep,#9A7B43)}
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
.adtp-editrow{display:flex;justify-content:flex-end;margin-bottom:12px}
.adtp-editbar{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 4px;font-size:.95rem;font-weight:800;color:var(--dv-ink,#101418)}
.adtp-ok{font-size:.9rem;font-weight:700;color:var(--dv-green,#2E7D5B);margin-bottom:12px}
.adtp-ok b{color:var(--dv-ink,#101418)}
.adtp-signrec{border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:var(--dv-raise,#FBFBFA);padding:13px 15px;margin-bottom:12px}
.adtp-signrec-h{font-size:.82rem;font-weight:800;color:var(--dv-green,#2E7D5B);margin-bottom:9px}
.adtp-signrec-img{max-height:64px;max-width:100%;display:block}
.adtp-signrec-typed{font-size:1.6rem;color:var(--dv-ink,#101418);font-family:"Segoe Script","Brush Script MT",cursive}
.adtp-signrec-meta{margin-top:8px;padding-top:8px;border-top:1px solid var(--dv-line-soft,#EDEDE9);font-size:.76rem;color:var(--dv-meta,#787D84)}
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

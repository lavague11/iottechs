"use client";

import { useState, useEffect, useRef, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import DeckView from "../../project/[accessId]/deck-view";
import { adtSummary, adtStatusMeta, adtQuoteSeed } from "../../../lib/adt";
import { fmtSignStamp } from "../../../lib/proposal";
import { adminCompleteAdtAction, saveAdtDealAction, shareAdtDealAction, reviseAdtDealAction, setAdtStatusAction, updateAdtApplicationAction, updateAdtContactAction, setAdtDocsNoteAction, lockAdtStaffAction, logAdtAppointmentAction, sendAdtAppointmentEmailAction } from "../actions";
import AdtIntake from "../../adt/adt-intake";
import SchedulingWidget from "../../project/[accessId]/scheduling-widget";

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
  card: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
  cal: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
};
// Download the customer as a .vcf contact — matches the project header's "Add to contact".
function downloadVCard(app) {
  const esc = (s) => String(s || "").replace(/([,;\\])/g, "\\$1");
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(app.name)}`, `N:${esc(app.name)};;;;`, "ORG:IOT TECHS · ADT"];
  if (app.phone) lines.push(`TEL;TYPE=CELL:${esc(app.phone)}`);
  if (app.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(app.email)}`);
  if (app.address) lines.push(`ADR;TYPE=HOME:;;${esc(app.address)};;;;`);
  lines.push(`NOTE:ADT ${esc(app.adt_id)}`, "END:VCARD");
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/vcard" }));
  const a = document.createElement("a"); a.href = url; a.download = `${(app.name || "contact").replace(/\s+/g, "_")}.vcf`; a.click();
  URL.revokeObjectURL(url);
}
// Parse a date-only string ("2026-08-20") as LOCAL midnight, not UTC — otherwise it renders a day early
// in Eastern (UTC-parsed midnight is the previous evening here). Datetimes keep their time.
const fmtDay = (d) => { if (!d) return ""; try { const s = String(d).trim(); const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T00:00:00" : s.replace(" ", "T"); return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
const fmtTax = (t, comm) => { const d = String(t || "").replace(/\D/g, ""); if (d.length !== 9) return t; return comm ? `${d.slice(0, 2)}-${d.slice(2)}` : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`; };
const fmtPhone = (s) => { const d = String(s || "").replace(/\D/g, "").slice(0, 10); if (d.length < 10) return s || ""; return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };
// Mask everything but the last 4 digits of a formatted tax id ("123-45-6789" → "•••-••-6789").
const maskTax = (formatted) => { const total = (String(formatted).match(/\d/g) || []).length; let seen = 0; return String(formatted).replace(/\d/g, (d) => (++seen <= total - 4 ? "•" : d)); };

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

// A faint em-dash for empty fields — so staff see the complete record, blanks included.
const DASH = <span className="adtp-f-empty">—</span>;
// One label/value cell in the Customer-details grid. Copy button is subtle and appears on hover.
function Field({ label, children, copy, full }) {
  return (
    <div className={"adtp-f" + (full ? " full" : "")}>
      <span className="adtp-f-l">{label}</span>
      <div className="adtp-f-v"><span className="adtp-f-t">{children}</span>{copy ? <CopyBtn text={copy} /> : null}</div>
    </div>
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

  const [err, setErr]   = useState("");
  const [pending, startTx] = useTransition();
  const [schedOpen, setSchedOpen] = useState(false);   // the shared "Schedule installation" modal (same as CCTV)

  const doComplete = () => startTx(async () => { setErr(""); const r = await adminCompleteAdtAction(app.adt_id); if (r?.error) setErr(r.error); else router.refresh(); });
  const setStatus = (s) => startTx(async () => { setErr(""); const r = await setAdtStatusAction(app.adt_id, s); if (r?.error) setErr(r.error); else router.refresh(); });

  const pad = { padding: "16px 18px" };
  const prefDays = app.pref_days || [], prefWins = app.pref_windows || [];
  const emerg = (app.emergency || []).filter((c) => c && (c.name || c.phone));
  const office = ["admin", "manager"].includes(user?.role);   // edit is office-only
  // Copy the whole submission as a clean text block — the office pastes it into ADT's own system.
  const [copiedAll, setCopiedAll] = useState(false);
  const copyAll = () => {
    const L = [`${isComm ? "Business" : "Name"}: ${app.name || ""}`];
    if (isComm && app.contact_name) L.push(`Contact: ${app.contact_name}`);
    L.push(`Property: ${isComm ? "Commercial" : "Residential"}`);
    if (app.phone) L.push(`Phone: ${fmtPhone(app.phone)}`);
    if (app.email) L.push(`Email: ${app.email}`);
    if (app.dob) L.push(`Date of birth: ${app.dob}`);
    if (app.address) L.push(`Address: ${app.address}`);
    if (app.tax_id) L.push(`${isComm ? "EIN" : "SSN"}: ${fmtTax(app.tax_id, isComm)}`);
    if (app.access_pin) L.push(`Access PIN: ${app.access_pin}`);
    if (app.verbal_password) L.push(`Verbal password: ${app.verbal_password}`);
    emerg.forEach((c, i) => { if (c.name || c.phone) L.push(`Emergency ${i + 1}: ${c.name || ""}${c.phone ? ` ${fmtPhone(c.phone)}` : ""}`); });
    try { navigator.clipboard.writeText(L.join("\n")); setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500); } catch {}
  };
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
      {office && <div className="adtp-editrow">
        <button type="button" className="adtp-chip" onClick={copyAll}>{copiedAll ? "Copied ✓" : "Copy details"}</button>
        <button type="button" className="adtp-chip" onClick={() => setEditing(true)}>Revise application</button>
      </div>}
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
      <div className="adtp-cd-sec">Account</div>
      <div className="adtp-cd">
        <Field label={isComm ? "Business" : "Name"} copy={app.name}>{app.name || DASH}</Field>
        {isComm && <Field label="Contact name" copy={app.contact_name}>{app.contact_name || DASH}</Field>}
        <Field label="Property">{isComm ? "Commercial" : "Residential"}</Field>
        <Field label="Applied">{app.created_at ? fmtDay(app.created_at) : DASH}</Field>
      </div>

      <div className="adtp-cd-sec">Contact</div>
      <div className="adtp-cd">
        <Field label="Phone" copy={app.phone ? fmtPhone(app.phone) : ""}>{app.phone ? <a href={`tel:${app.phone}`}>{fmtPhone(app.phone)}</a> : DASH}</Field>
        <Field label="Email" copy={app.email}>{app.email ? <a href={`mailto:${app.email}`}>{app.email}</a> : DASH}</Field>
        <Field label="Date of birth" copy={app.dob}>{app.dob ? fmtDay(app.dob) : DASH}</Field>
        <Field label="Install address" full copy={app.address}>{app.address ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(app.address)}`} target="_blank" rel="noreferrer">{app.address}</a> : DASH}</Field>
      </div>

      <div className="adtp-cd-sec">Security &amp; identity</div>
      <div className="adtp-cd">
        <Field label={isComm ? "EIN" : "SSN"} copy={app.tax_id ? fmtTax(app.tax_id, isComm) : ""}>{app.tax_id ? <RevealField value={fmtTax(app.tax_id, isComm)} mask={maskTax(fmtTax(app.tax_id, isComm))} /> : DASH}</Field>
        <Field label="Access PIN" copy={app.access_pin}>{app.access_pin || DASH}</Field>
        <Field label="Verbal password" copy={app.verbal_password}>{app.verbal_password ? <RevealField value={app.verbal_password} /> : DASH}</Field>
      </div>

      <div className="adtp-cd-sec">Emergency contacts</div>
      <div className="adtp-cd">
        {[0, 1].map((i) => { const c = emerg[i] || {}; return (
          <Field key={i} label={`Contact ${i + 1}`} copy={c.phone ? fmtPhone(c.phone) : ""}>
            {c.name || c.phone ? <>{c.name || DASH}{c.phone ? <span className="adtp-f-sub"> · {fmtPhone(c.phone)}</span> : null}</> : DASH}
          </Field>
        ); })}
      </div>

      <div className="adtp-cd-sec">Install preferences</div>
      <div className="adtp-cd">
        <Field label="Preferred days" full>{app.asap ? <b className="adtp-asap">ASAP</b> : (prefDays.length ? prefDays.join(", ") : "Any day")}</Field>
        <Field label="Preferred windows" full>{prefWins.length ? prefWins.join(", ") : DASH}</Field>
      </div>

      {app.verification_doc?.data && (<>
        <div className="adtp-cd-sec">Business verification</div>
        <a className="adtp-doc" href={app.verification_doc.data} download={app.verification_doc.name || "verification"} target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          <span className="adtp-doc-n">{app.verification_doc.name || "Document"}</span><em>Open</em>
        </a>
      </>)}

      {app.notes && (<>
        <div className="adtp-cd-sec">Notes</div>
        <div className="adtp-notes">{app.notes}</div>
      </>)}
    </div>
  );

  // Complete = schedule the firm install date + mark it done (the old Schedule stage folded in here).
  const completeNode = (
    <div style={pad} className="adtp">
      {done ? <div className="adtp-ok">✓ Completed {fmtDay(app.completed_at)}</div> : (<>
        {scheduled
          ? <div className="adtp-ok">Scheduled for <b>{fmtDay(app.schedule_date)}</b>{app.schedule_window ? ` · ${app.schedule_window}` : ""}</div>
          : <div className="adtp-sub">No install scheduled yet.</div>}
        {office && (
          <button className="adtp-btn gold" style={{ marginTop: 10 }} onClick={() => setSchedOpen(true)}>{scheduled ? "Reschedule" : "Schedule install"}</button>
        )}
        <div className="adtp-sub" style={{ marginTop: 16 }}>Once the technician finishes on site</div>
        <button className="adtp-btn green" disabled={pending || !scheduled} onClick={doComplete}>Mark complete</button>
        {!scheduled && <div className="adtp-muted" style={{ marginTop: 8 }}>Set the install date first.</div>}
        {err && <div className="adtp-err" style={{ marginTop: 10 }}>{err}</div>}
      </>)}
    </div>
  );

  const [shared, setShared] = useState(!!app.deal_shared);
  const [shareErr, setShareErr] = useState("");
  const doShare = (on) => startTx(async () => { setShareErr(""); const r = await shareAdtDealAction(app.adt_id, on); if (r?.error) setShareErr(r.error); else { setShared(on); router.refresh(); } });
  const accepted = !!app.deal_accepted;
  const signed = !!app.deal_signed;
  const [reviseArm, setReviseArm] = useState(false);
  const doRevise = () => startTx(async () => { setShareErr(""); const r = await reviseAdtDealAction(app.adt_id); if (r?.error) setShareErr(r.error); else { setReviseArm(false); setShared(false); router.refresh(); } });

  // Submit from inside the ADT Tool → share the quote with the customer (the "send it like the proposal" step).
  const dealNode = <DealFrame adtId={app.adt_id} view={dealView} locked={dealLocked} rep={user?.name || ""} cust={app.name || ""} deal={dealObj} seed={adtQuoteSeed(app.equipment)} onSubmit={() => doShare(true)} />;
  // One consolidated status + action bar that sits on the ADT Tool itself — no separate "Customer
  // quote" dropdown. Shows where the quote stands and the one relevant control (Share / Unshare /
  // Revise). Pricing + the primary Submit-to-share live inside the tool.
  const dealBar = (
    <div className={"adtp-dealbar" + ((signed || accepted) ? " ok" : shared ? " shared" : "")}>
      <div className="adtp-dealbar-row">
        <span className="adtp-dealbar-st">
          {signed ? <><b>Signed</b><em>{app.deal_signed_name}{app.deal_signed_at ? ` · ${fmtSignStamp(app.deal_signed_at)}` : ""}</em></>
            : accepted ? <b>Accepted by the customer</b>
            : shared ? <><b>Shared</b><em>The customer can review &amp; sign it on their portal</em></>
            : hasDeal ? <><b>Priced</b><em>Submit in the tool to share it with the customer</em></>
            : <><b>Draft</b><em>Price the deal, then Submit to share it</em></>}
        </span>
        <span className="adtp-dealbar-act">
          {(signed || accepted)
            ? (office
                ? (reviseArm
                    ? <><button className="adtp-btn ghost" disabled={pending} onClick={() => doRevise()}>Confirm revise</button><button className="adtp-chip" onClick={() => setReviseArm(false)}>Cancel</button></>
                    : <button className="adtp-btn ghost" disabled={pending} onClick={() => setReviseArm(true)}>Revise quote</button>)
                : <span className="adtp-muted">An admin can revise it</span>)
            : shared
              ? <button className="adtp-btn ghost" disabled={pending} onClick={() => doShare(false)}>Unshare</button>
              : <button className="adtp-btn gold" disabled={pending || !hasDeal} onClick={() => doShare(true)}>Share with customer</button>}
        </span>
      </div>
      {reviseArm && <div className="adtp-dealbar-warn">Revising voids the customer&rsquo;s {signed ? "signature" : "acceptance"} — they&rsquo;ll re-sign the revised quote.</div>}
      {shareErr && <div className="adtp-err" style={{ marginTop: 8 }}>{shareErr}</div>}
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
        { name: "ADT Tool", label: signed ? "Signed" : shared ? "Shared" : hasDeal ? (dealView === "rep" ? "Your commission" : "Priced") : "Price the deal", state: hasDeal ? "done" : "active", heavy: true, node: <div className="adtp-dealwrap">{dealBar}{dealNode}</div> },
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
      app.dob && { k: "Date of birth", v: fmtDay(app.dob) },
      app.tax_id && { k: isComm ? "EIN" : "SSN", v: <RevealField value={fmtTax(app.tax_id, isComm)} mask={maskTax(fmtTax(app.tax_id, isComm))} /> },
      app.access_pin && { k: "Access PIN", v: app.access_pin },
      app.verbal_password && { k: "Verbal password", v: <RevealField value={app.verbal_password} /> },
      ...(app.emergency || []).filter((c) => c && (c.name || c.phone)).map((c, i) => ({ k: `Emergency ${i + 1}`, v: c.name || "—", sub: c.phone ? fmtPhone(c.phone) : "" })),
    ].filter(Boolean),
    actions: [
      app.phone && { label: "Call", icon: DVI.call, href: `tel:${app.phone}` },
      app.email && { label: "Email", icon: DVI.mail, href: `mailto:${app.email}` },
      app.address && { label: "Directions", icon: DVI.dir, href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(app.address)}` },
      office && { label: "Schedule", icon: DVI.cal, onClick: (e) => { e.preventDefault(); setSchedOpen(true); } },
      { label: "Add to contact", icon: DVI.card, onClick: (e) => { e.preventDefault(); downloadVCard(app); } },
    ].filter(Boolean),
    // Inline quick-edit of the contact fields, mirroring the project header (the full form is still
    // "Revise application" on the Apply step). Office-only; leaves SSN/verbal/equipment untouched.
    contact: { contact_name: app.name || "", contact_phone: app.phone || "", contact_email: app.email || "", address: app.address || "" },
    canEdit: office,
    onSave: async (vals) => { const r = await updateAdtContactAction(app.adt_id, vals); if (r?.ok) router.refresh(); return r; },
  };

  // Lock → clear this browser's access (server), then hard-reload to the account gate (page.jsx). A
  // full navigation unmounts the Deck so none of its data lingers client-side until a PIN is re-entered.
  const doLock = () => startTx(async () => { await lockAdtStaffAction(); window.location.href = `/adt-applications/${app.adt_id}`; });

  const myView = { admin: "Admin view", manager: "Manager view", sales: "Sales view" }[user?.role] || "Staff view";
  return (
    <>
      <DeckView
        stages={stages}
        idx={idx}
        onIdx={setIdx}
        canAdvance={false}
        customer={customer}
        statusChip={sm}
        roleLabel={myView}
        roleMenu={[
          { label: myView, on: true },
          { label: "Customer view", onClick: () => router.push(`/adt?id=${app.adt_id}`) },
          { label: "Lock", onClick: doLock },
        ]}
        menu={[{ label: "All ADT applications", onClick: () => router.push("/adt-applications") }]}
      />

      {/* "Schedule installation" — the SAME shared SchedulingWidget the CCTV project uses, in the same
          modal chrome. Wrapped in .pvx so the project widget's tokens + styles resolve here, with an
          ADT-scoped save/email handler that mirrors the booking onto the record and sends the invite. */}
      {schedOpen && office && (
        <div className="pvx">
          <div className="pv-modal-bg" onClick={(e) => { if (e.target.classList.contains("pv-modal-bg")) { setSchedOpen(false); router.refresh(); } }}>
            <div className="pv-modal pv-sched-modal">
              <button className="pv-modal-x" aria-label="Close" onClick={() => { setSchedOpen(false); router.refresh(); }}>✕</button>
              <h2 className="pv-modal-title">Schedule installation</h2>
              <div className="pv-sched-body">
                <SchedulingWidget
                  accessId={app.adt_id}
                  assignments={app.email ? [{ user_name: app.name, user_email: app.email, role: "customer" }] : []}
                  staffUsers={[]}
                  currentUser={user}
                  project={{ access_id: app.adt_id, address: app.address, contact_name: app.name, contact_email: app.email, customer: app.name }}
                  view={user?.role}
                  apptKind="install"
                  defaultTitle="IOT TECHS — Installation"
                  autoOpen
                  logAppointment={logAdtAppointmentAction}
                  sendInvite={sendAdtAppointmentEmailAction}
                  onBooked={() => setTimeout(() => router.refresh(), 600)}
                />
              </div>
            </div>
          </div>
          <style>{SCHED_MODAL_CSS}</style>
        </div>
      )}

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
.adtp-cd-sec{font-size:.6rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin:22px 0 12px;padding-bottom:7px;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.adtp-cd-sec:first-of-type{margin-top:2px}
.adtp-cd{display:grid;grid-template-columns:1fr 1fr;gap:15px 28px;margin-bottom:2px}
.adtp-f{min-width:0;display:flex;flex-direction:column;gap:4px}
.adtp-f.full{grid-column:1/-1}
.adtp-f-l{font-size:.58rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.adtp-f-v{display:flex;align-items:center;gap:7px;min-height:20px}
.adtp-f-t{font-size:.92rem;font-weight:600;color:var(--dv-ink,#101418);word-break:break-word;line-height:1.35}
.adtp-f-t a{color:var(--dv-ink,#101418);text-decoration:none;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.adtp-f-t a:hover{border-color:var(--dv-gold,#C9A96E)}
.adtp-f-sub{color:var(--dv-meta,#787D84);font-weight:500}
.adtp-f-empty{color:var(--dv-faint,#A6ABB1)}
.adtp-asap{color:var(--dv-gold-deep,#A8842F);font-weight:700}
.adtp-copy{flex:none;width:20px;height:20px;display:grid;place-items:center;border:none;background:none;color:var(--dv-faint,#A6ABB1);cursor:pointer;opacity:0;transition:.12s}
.adtp-f:hover .adtp-copy{opacity:1}
.adtp-copy:hover{color:var(--dv-gold-deep,#A8842F)}
.adtp-copy.ok{color:var(--dv-green,#2E7D5B);opacity:1}
.adtp-copy-sp{display:none}
.adtp-dealwrap{display:flex;flex-direction:column;height:100%;min-height:0}
.adtp-dealwrap>.adtp-dealbar{flex:0 0 auto;margin:12px 14px 0}
.adtp-dealwrap>iframe{flex:1 1 auto;min-height:0;width:100%}
.adtp-dealbar{border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:var(--dv-raise,#FBFBFA);padding:12px 15px;margin:0 0 12px}
.adtp-dealbar.shared{background:#fbf6ea;border-color:#eadcb8}
.adtp-dealbar.ok{background:#eef5f0;border-color:#c4e0cf}
.adtp-dealbar-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.adtp-dealbar-st{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.adtp-dealbar-st b{font-size:.9rem;font-weight:800;color:var(--dv-ink,#101418)}
.adtp-dealbar-st em{font-style:normal;font-size:.78rem;color:var(--dv-meta,#787D84)}
.adtp-dealbar-act{display:flex;align-items:center;gap:8px;flex:none}
.adtp-dealbar-warn{margin-top:10px;font-size:.8rem;color:var(--dv-meta,#787D84);line-height:1.45}
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
.adtp-editrow{display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px}
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

// Styles for the shared SchedulingWidget + its modal chrome, copied verbatim (re-scoped under .pvx)
// from the project page's stylesheet so the ADT deck can host the exact same widget without pulling
// in — or altering — the CCTV project page. Kept in sync with gateway-client.jsx's ".sched-"/".pv-modal" block.
const SCHED_MODAL_CSS = `
.pvx{--bg-soft:#f6f7f9;--bg-tint:#f0f2f7;--bg-paper:#FAF8F4;--bg:#ffffff;--ink:#0B0F1A;--slate:#2C3347;--muted:#5b6275;--line:#e6e8ee;--line-warm:#d9d4ca;--gold:#C9A96E;--gold-deep:#b08f4f;--gold-hi:#E8CB94;--accent:#3257ff;--accent-soft:#eef1ff;--green:#2f7d5a;--green-soft:#e7f6ec;--red:#a8442f;--red-soft:#fdeaea;--amber:#b45309;--amber-soft:#fef3c7;--purple:#7c3aed;--purple-soft:#f3eeff;--font:'Hanken Grotesk',sans-serif;--font-title:'Bricolage Grotesque',sans-serif;font-family:var(--font);color:var(--ink)}
.pvx .pv-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
.pvx .pv-modal{background:#fff;border-radius:16px;padding:30px 28px 24px;max-width:420px;width:100%;position:relative;box-shadow:0 12px 40px rgba(0,0,0,.18)}
.pvx .pv-modal-x{position:absolute;top:14px;right:14px;width:28px;height:28px;background:var(--bg-soft);border:none;border-radius:7px;cursor:pointer;font-size:1rem;color:var(--muted);display:flex;align-items:center;justify-content:center;line-height:1}
.pvx .pv-modal-x:hover{background:var(--line)}
.pvx .pv-sched-modal{max-width:600px;width:100%;max-height:88vh;display:flex;flex-direction:column;padding:24px 24px 20px}
.pvx .pv-sched-modal .pv-modal-title{margin-bottom:14px}
.pvx .pv-sched-body{overflow-y:auto;flex:1;min-height:0;margin:0 -6px;padding:0 6px}
.pvx .pv-modal-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.18rem;margin:0 0 4px}
.pvx .sched-tool{display:flex;flex-direction:column;gap:12px}
.pvx .sched-sec-label{font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:4px}
.pvx .sched-add-btn{display:inline-flex;align-items:center;gap:6px;background:var(--ink);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:.84rem;font-weight:600;font-family:inherit;cursor:pointer;align-self:flex-start;transition:background .12s}
.pvx .sched-add-btn:hover{background:var(--slate)}
.pvx .sched-form{background:var(--bg-soft);border:1px solid var(--line);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px}
.pvx .sched-row{display:flex;flex-direction:column;gap:4px}
.pvx .sched-row-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.pvx .sched-lbl{font-size:.76rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.pvx .sched-input{border:1px solid var(--line);border-radius:7px;padding:7px 10px;font-size:.84rem;background:#fff;color:var(--ink);font-family:inherit;width:100%}
.pvx .sched-input:focus{outline:none;border-color:var(--accent)}
.pvx select.sched-input{height:38px;padding:0 10px}
.pvx .sched-ta{resize:vertical;min-height:60px}
.pvx .sched-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.pvx .sched-chip{display:inline-flex;align-items:center;gap:6px;font-size:.8rem;font-weight:600;color:var(--ink);padding:4px 6px 4px 11px;border:1px solid var(--line);border-radius:100px;background:var(--bg-tint)}
.pvx .sched-chip.cust{background:#F3E9D3;border-color:#d9c48f;color:#7a5f1f}
.pvx .sched-chip-role{font-size:.64rem;font-weight:700;color:var(--muted);text-transform:capitalize}
.pvx .sched-chip-role.cust{color:#8a6d2f}
.pvx .sched-chip-auto{font-size:.58rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#3a4a72;background:#e6eaf3;border-radius:100px;padding:1px 6px}
.pvx .sched-chip-x{border:none;background:none;color:var(--muted);cursor:pointer;font-size:.72rem;line-height:1;padding:2px 3px;border-radius:50%}
.pvx .sched-chip-x:hover{background:rgba(0,0,0,.06);color:#a8442f}
.pvx .sched-invsearch{position:relative}
.pvx .sched-invdd{position:absolute;z-index:30;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--line);border-radius:9px;box-shadow:0 14px 40px rgba(11,15,26,.16);overflow:hidden;max-height:240px;overflow-y:auto}
.pvx .sched-invopt{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:none;background:#fff;padding:9px 12px;cursor:pointer;font-family:inherit;border-bottom:1px solid var(--line)}
.pvx .sched-invopt:last-child{border-bottom:none}
.pvx .sched-invopt:hover{background:var(--bg-tint)}
.pvx .sched-invopt-name{font-size:.84rem;font-weight:600;color:var(--ink);flex-shrink:0}
.pvx .sched-invopt-email{font-size:.74rem;color:var(--muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pvx .sched-invadd{color:var(--gold-deep,#8a6d2f)}
.pvx .sched-invadd .sched-invopt-name{color:var(--gold-deep,#8a6d2f);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pvx .sched-invadd svg{color:var(--gold-deep,#8a6d2f);flex-shrink:0}
.pvx .sched-form-acts{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.pvx .sched-cancel-btn{background:none;border:none;color:var(--muted);font-size:.84rem;font-weight:600;font-family:inherit;cursor:pointer;padding:8px 4px}
.pvx .sched-cancel-btn:hover{color:var(--ink)}
.pvx .sched-cal-group{margin-left:auto;display:inline-flex;align-items:center;gap:8px}
.pvx .sched-cal-lbl{font-size:.72rem;font-weight:600;color:var(--muted);letter-spacing:.01em}
.pvx .sched-cal-ico{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:1.5px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);cursor:pointer;transition:.12s;text-decoration:none}
.pvx .sched-cal-ico:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .sched-cal-ico svg{width:16px;height:16px}
.pvx .sched-save-btn{background:var(--ink);color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:.84rem;font-weight:600;font-family:inherit;cursor:pointer}
.pvx .sched-save-btn:hover{background:var(--slate)}
.pvx .sched-save-btn:disabled{opacity:.4;cursor:not-allowed}
.pvx .sched-events{display:flex;flex-direction:column;gap:10px}
.pvx .sched-event{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;gap:14px;align-items:flex-start;box-shadow:0 1px 2px rgba(14,19,32,.03)}
.pvx .sched-ev-tile{flex-shrink:0;width:50px;height:54px;border-radius:9px;border:1px solid var(--line);background:var(--bg-soft);display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
.pvx .sched-ev-mon{font-size:.62rem;font-weight:700;letter-spacing:.08em;color:var(--gold-deep);background:#faf4e8;width:100%;text-align:center;padding:2px 0;line-height:1.2}
.pvx .sched-ev-day{font-family:'Bricolage Grotesque',sans-serif;font-size:1.3rem;font-weight:800;color:var(--ink);line-height:1;margin-top:5px}
.pvx .sched-ev-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.pvx .sched-ev-row{display:flex;align-items:flex-start;gap:8px}
.pvx .sched-ev-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.95rem;color:var(--ink);flex:1;line-height:1.3}
.pvx .sched-ev-confirmed{display:inline-block;margin-left:8px;font-family:var(--font-sans);font-size:.66rem;font-weight:700;letter-spacing:.03em;color:#2E7D5B;background:rgba(46,125,91,.1);border:1px solid rgba(46,125,91,.28);border-radius:999px;padding:2px 8px;vertical-align:middle;white-space:nowrap}
.pvx .sched-ev-acts{display:flex;gap:4px;flex-shrink:0}
.pvx .sched-ev-ico{width:28px;height:28px;border:1px solid var(--line);border-radius:7px;background:#fff;cursor:pointer;font-family:inherit;color:var(--muted);text-decoration:none;display:inline-flex;align-items:center;justify-content:center;transition:.12s}
.pvx .sched-ev-ico:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .sched-ev-addr{color:var(--accent);text-decoration:none}
.pvx .sched-ev-addr:hover{text-decoration:underline}
.pvx .sched-send-wrap{position:relative;display:inline-flex}
.pvx .sched-send-menu{position:absolute;z-index:40;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--line);border-radius:9px;box-shadow:0 14px 40px rgba(11,15,26,.16);overflow:hidden;min-width:150px;display:flex;flex-direction:column}
.pvx .sched-send-menu button{text-align:left;border:none;background:#fff;padding:9px 13px;cursor:pointer;font-family:inherit;font-size:.8rem;font-weight:600;color:var(--ink);white-space:nowrap;border-bottom:1px solid var(--line)}
.pvx .sched-send-menu button:last-child{border-bottom:none}
.pvx .sched-send-menu button:hover{background:var(--bg-tint)}
.pvx .sched-types{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.pvx .sched-type{border:1px solid var(--line);border-radius:100px;background:#fff;padding:4px 11px;font-size:.74rem;font-weight:600;color:var(--muted);cursor:pointer;font-family:inherit;transition:.12s}
.pvx .sched-type:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .sched-type.on{background:var(--ink);border-color:var(--ink);color:#fff}
.pvx .sched-cancel-appt{border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--red);font-size:.78rem;font-weight:600;padding:8px 12px;cursor:pointer;font-family:inherit}
.pvx .sched-cancel-appt:hover{border-color:var(--red);background:var(--red-soft)}
.pvx .sched-cancel-confirm{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
.pvx .sched-cancel-q{font-size:.78rem;font-weight:600;color:var(--ink)}
.pvx .sched-cancel-yes{border:1px solid var(--red);border-radius:8px;background:var(--red);color:#fff;font-size:.76rem;font-weight:700;padding:7px 12px;cursor:pointer;font-family:inherit}
.pvx .sched-cancel-no{border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--muted);font-size:.76rem;font-weight:600;padding:7px 12px;cursor:pointer;font-family:inherit}
.pvx .sched-ev-line{display:flex;align-items:center;gap:7px;font-size:.8rem;color:var(--muted)}
.pvx .sched-ev-line svg{flex-shrink:0;color:var(--gold-deep)}
.pvx .sched-ev-line span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.pvx .sched-ev-notes{font-size:.79rem;color:var(--slate);background:var(--bg-soft);border-left:2px solid var(--gold);padding:6px 10px;border-radius:0 6px 6px 0;margin-top:2px}
.pvx .sched-empty{font-size:.84rem;color:var(--muted);padding:8px 0}
.pvx .sched-rsvp{margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}
.pvx .sched-rsvp-head{display:flex;align-items:center;gap:7px;font-size:.76rem;font-weight:700;letter-spacing:.02em;color:var(--slate);margin-bottom:6px}
.pvx .sched-rsvp-head svg{flex-shrink:0;color:var(--gold-deep)}
.pvx .sched-rsvp-head .sched-rsvp-none{color:var(--gold-deep)}
.pvx .sched-rsvp-list{display:flex;flex-wrap:wrap;gap:6px}
.pvx .sched-rsvp-chip{display:inline-flex;align-items:center;gap:6px;font-size:.72rem;font-weight:600;color:var(--slate);background:var(--bg-soft);border:1px solid var(--line);border-radius:999px;padding:3px 10px 3px 8px}
.pvx .sched-rsvp-chip .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;background:var(--muted)}
.pvx .sched-rsvp-chip .rl{color:var(--muted);font-weight:500}
.pvx .sched-rsvp-chip.going{color:#2E7D5B;background:rgba(46,125,91,.08);border-color:rgba(46,125,91,.28)}
.pvx .sched-rsvp-chip.going .dot{background:#2E7D5B}
.pvx .sched-rsvp-chip.await .dot{animation:schedBlink 1.4s ease-in-out infinite}
.pvx .sched-row-3 .sched-input[type=date],.pvx .sched-row-3 .sched-input[type=time]{min-width:0}
@keyframes schedBlink{0%,100%{opacity:1}50%{opacity:.28}}
@media (max-width:560px){
  .pvx .pv-sched-modal{padding:18px 15px 15px;max-height:92vh}
  .pvx .sched-row-3{grid-template-columns:1fr 1fr}
  .pvx .sched-event{padding:12px;gap:10px}
  .pvx .sched-ev-tile{width:44px;height:48px}
  .pvx .sched-ev-row{flex-wrap:wrap}
  .pvx .sched-ev-title{flex:1 1 100%}
  .pvx .sched-ev-acts{margin-left:auto}
}
`;

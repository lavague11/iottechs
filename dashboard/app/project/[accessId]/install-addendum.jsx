"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { titleCase, addendumTotals } from "../../../lib/proposal";
import { saveToolDataAction } from "./proposal-actions";
import { logAddendumAction, sendAddendumApprovalAction, scheduleAddendumApprovalAction, cancelAddendumScheduleAction } from "./actions";
import ProposalSignModal from "./proposal-sign-modal";
import SendScheduler from "./send-scheduler";
import { can } from "../../../lib/roles";
import AddendumBuilder from "./addendum-builder";

// On-site addendum builder. Things change on the job (customer wants 3 more cameras) — the office
// builds an addendum right on the install page: extra line items with a customer price (and tech
// payout, internal). It's a separate change order the customer approves & signs; it never touches
// the originally-signed proposal. Stored in the "addendum" tool record.
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let _aid = 0;
const newId = () => `a${Date.now().toString(36)}${_aid++}`;

const Tick = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-1px", marginRight: 4 }}><polyline points="4 12 10 18 20 6"/></svg>;
const fmtStamp = (iso) => { if (!iso) return ""; try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
// Prefill the addendum title so the office has a sensible starting point: "Add-on · <today>".
const defaultTitle = () => `Add-on · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

// composeOnly: opened from the Proposal footer ("+ Addendum") — shows just the builder (the list lives under
// SENT VERSIONS) and calls onClose once it is done (created / cancelled / email prompt answered).
export default function InstallAddendum({ accessId, role, readOnly, customerName, onCount, embedded = false, composeOnly = false, onClose }) {
  const isCustomer = role === "customer";
  const isTech = role === "tech";
  // The technician can create an on-site add-on too, but only logs the WORK — pricing (customer charge
  // + payout) stays office-controlled, so a tech never sets or sees retail (project role rule #4).
  const canBuild = !readOnly && can(role, "addendum.build");
  const canPrice = can(role, "addendum.price");                   // admin/manager set customer price + payout
  const canVoid = !readOnly && canPrice;                          // admin/manager can void an addendum
  const showRetail = can(role, "addendum.retail.view");          // tech never sees the customer (retail) price — only their payout
  const showPayout = can(role, "addendum.payout.view");          // office + tech see the tech payout; customer + sales never do

  const [addendums, setAddendums] = useState([]);
  const [building, setBuilding] = useState(composeOnly);
  const [editingId, setEditingId] = useState(null);  // office is pricing an existing (tech-submitted) add-on
  const [draft, setDraft] = useState(() => (composeOnly ? { title: defaultTitle(), items: [], discount: "" } : null));      // { title, items, discount } the builder opens with
  const [signId, setSignId] = useState(null);
  const [signErr, setSignErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { id, action: 'delete'|'void' }
  // Part B — approval-email prompt after creating/pricing an add-on (office). `emailPrompt` = the add-on id
  // being prompted; the shared SendScheduler handles Send now / Schedule send (default next 8:30 AM).
  const [emailPrompt, setEmailPrompt] = useState(null);
  const [promptBusy, setPromptBusy] = useState(false);
  const first = useRef(true);
  const openPrompt = (id) => setEmailPrompt(id);

  // Read the add-on list from the stable API route (not a server action) — on the deploy host the
  // server-action read intermittently 404'd, so the panel rendered nothing and the customer couldn't
  // see the request to approve it (BUG #50).
  useEffect(() => {
    let live = true;
    fetch(`/api/addendum?project=${encodeURIComponent(accessId)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.ok && Array.isArray(j.addendums)) setAddendums(j.addendums); })
      .catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  // Report how many add-ons exist so the caller can hide the whole step until one is submitted.
  useEffect(() => { onCount?.(addendums.length); }, [addendums.length, onCount]);

  // Part B — the approval MAGIC LINK lands with ?approve=<id>: auto-open the sign modal for that pending
  // add-on so the customer is "straight to approve" (the no-PIN access was already granted by the route).
  const sp = useSearchParams();
  const autoApproved = useRef(false);
  useEffect(() => {
    if (autoApproved.current || !isCustomer || readOnly) return;
    const want = sp?.get("approve");
    if (!want) return;
    const a = addendums.find((x) => x.id === want && x.status === "pending" && !x.needsPricing);
    if (a) { autoApproved.current = true; setSignErr(null); setSignId(want); }
  }, [sp, addendums, isCustomer, readOnly]);

  async function persist(next) {
    setAddendums(next);
    setBusy(true);
    await saveToolDataAction(accessId, "addendum", JSON.stringify({ addendums: next }));
    setBusy(false);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("iot:addendum-changed"));   // SENT VERSIONS refetches
  }

  const custTotal = (a) => addendumTotals(a).total; // customer price, less any discount (shared formula)
  const techTotal = (a) => (a.items || []).reduce((s, it) => s + (+it.qty || 0) * (+it.techPay || 0), 0);
  const approvedTotal = addendums.filter((a) => a.status === "approved").reduce((s, a) => s + custTotal(a), 0);

  // ---- Builder (office) ---- the form itself is AddendumBuilder (the Proposal's item picker).
  useEffect(() => { if (composeOnly && !building && !emailPrompt) onClose?.(); }, [composeOnly, building, emailPrompt, onClose]);
  const closeBuilder = () => { setDraft(null); setBuilding(false); setEditingId(null); };
  // Office prices a tech-submitted add-on: load it into the builder (with any existing values) so the
  // office can fill in the customer price + payout, then Save writes back to the same record.
  function startEdit(a) {
    setDraft({ title: a.title || "", items: a.items || [], discount: a.discount ? String(a.discount) : "", taxRate: +a.taxRate || 0, pcpCredit: a.pcpCredit });
    setEditingId(a.id); setBuilding(true);
  }
  // `res` comes from AddendumBuilder: items already in the stored addendum shape (lib/addendum-items.js).
  function createAddendum(res) {
    const items = res.items;
    if (!items.length) return;
    if (editingId) {   // office pricing an existing add-on — update in place and clear the pricing flag
      // taxRate stays ABSENT when it's 0, so an untaxed add-on's stored shape (and therefore its
      // fingerprint) is exactly what it was before tax existed.
      const next = addendums.map((a) => a.id === editingId ? { ...a, title: res.title || a.title, items, discount: res.discount, taxRate: +res.taxRate || undefined, pcpCredit: res.pcpCredit || undefined, needsPricing: undefined } : a);
      persist(next);
      const upd = next.find((a) => a.id === editingId);
      if (upd) logAddendumAction(accessId, { verb: "priced", title: upd.title, amount: custTotal(upd) }).catch(() => {});
      closeBuilder();
      if (upd && upd.status === "pending" && !upd.needsPricing) openPrompt(editingId);   // now customer-ready → offer to email
      return;
    }
    // A tech logs the work only — flag it so the office knows to price it (and so it's held back from
    // the customer until priced). Office-built ones are priced on creation.
    const rec = { id: newId(), title: res.title || "Job-site add-on", items, discount: res.discount, taxRate: +res.taxRate || undefined, pcpCredit: res.pcpCredit || undefined, at: new Date().toISOString(), status: "pending", needsPricing: !canPrice ? true : undefined, createdByTech: isTech ? true : undefined };
    persist([...addendums, rec]);
    logAddendumAction(accessId, { verb: "created", title: rec.title, amount: custTotal(rec) }).catch(() => {});   // Job Log
    closeBuilder();
    if (canPrice) openPrompt(rec.id);   // office-created + priced → offer to send the approval email
  }
  // Part B handlers — Send now / Schedule / Cancel. Update local state optimistically (the server stamps too).
  async function sendNow(id) {
    setPromptBusy(true);
    const r = await sendAddendumApprovalAction(accessId, id).catch(() => null);
    setPromptBusy(false); setEmailPrompt(null);
    setAddendums((prev) => prev.map((a) => a.id === id ? { ...a, emailSentAt: new Date().toISOString(), scheduledSendAt: undefined } : a));
    if (r?.note) setSignErr(r.note);   // reuse the inline notice line for "demo — not sent" etc.
  }
  async function scheduleIt(id, iso) {
    if (!iso) return;
    setPromptBusy(true);
    const r = await scheduleAddendumApprovalAction(accessId, id, iso).catch(() => null);
    setPromptBusy(false); setEmailPrompt(null);
    if (r?.ok) setAddendums((prev) => prev.map((a) => a.id === id ? { ...a, scheduledSendAt: r.scheduledSendAt, emailSentAt: undefined } : a));
  }
  async function cancelSched(id) {
    setBusy(true);
    await cancelAddendumScheduleAction(accessId, id).catch(() => null);
    setBusy(false);
    setAddendums((prev) => prev.map((a) => a.id === id ? { ...a, scheduledSendAt: undefined } : a));
  }
  const removeAddendum = (id) => { const a = addendums.find((x) => x.id === id); persist(addendums.filter((x) => x.id !== id)); if (a) logAddendumAction(accessId, { verb: "removed", title: a.title }).catch(() => {}); };
  // Void an addendum (any status) — it stays on record with the date, but drops out of billing and
  // the install checklist (getApprovedAddons only counts status "approved").
  const voidAddendum = (id) => { const a = addendums.find((x) => x.id === id); persist(addendums.map((x) => (x.id === id ? { ...x, status: "voided", voidedAt: new Date().toISOString() } : x))); if (a) logAddendumAction(accessId, { verb: "voided", title: a.title }).catch(() => {}); };
  // Un-void: a voided addendum returns to pending (if never signed) or approved (if it had been signed).
  const unvoidAddendum = (id) => persist(addendums.map((a) => (a.id === id ? { ...a, status: a.signedName ? "approved" : "pending", voidedAt: undefined } : a)));

  // ---- Approval (customer) — POSTs to the stable /api/addendum route (binds the signature to the
  // add-on's content fingerprint, server-side). Uses an API route, not a server action, so a redeploy
  // can't 404 the approval; a network failure resets the button and shows a retry instead of hanging.
  async function approve(sign) {
    setBusy(true); setSignErr(null);
    let j;
    try {
      const res = await fetch("/api/addendum", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: accessId, addendumId: signId, sign }),
      });
      j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { setBusy(false); const m = String(j?.error || ""); setSignErr(m ? m.charAt(0).toUpperCase() + m.slice(1) : "Couldn't reach the server. Check your connection and try again — if it keeps happening, refresh the page."); return; }
    } catch {
      setBusy(false); setSignErr("Couldn't reach the server. Check your connection and try again — if it keeps happening, refresh the page."); return;
    }
    setBusy(false);
    if (Array.isArray(j.addendums)) setAddendums(j.addendums);
    setSignId(null);
  }
  const pending = addendums.filter((a) => a.status === "pending");
  if (!canBuild && addendums.length === 0) return null; // customer/tech see nothing until one exists

  return (
    <div className="adn-root">
      <style>{ADN_CSS}</style>
      {!embedded && (
        <div className="adn-head">
          <div><span className="adn-title">Job-Site Add-ons</span></div>
          {approvedTotal > 0 && <span className="adn-total-badge">Approved add-ons {money(approvedTotal)}</span>}
        </div>
      )}

      {/* The customer never sees an add-on still awaiting office pricing. */}
      {!composeOnly && addendums.filter((a) => !(isCustomer && a.needsPricing)).map((a) => {
        const ct = custTotal(a), tt = techTotal(a);
        return (
          <div key={a.id} className={`adn-card ${a.status}`}>
            <div className="adn-card-hd">
              <span className="adn-card-title">{a.title}</span>
              <span className={`adn-badge ${a.needsPricing && a.status === "pending" ? "pending" : a.status}`}>{a.status === "approved" ? <><Tick />Approved</> : a.status === "declined" ? "Declined" : a.status === "voided" ? "Voided" : a.needsPricing ? "Needs pricing" : a.resignRequired ? "Changed — re-sign" : "Pending approval"}</span>
            </div>
            <div className="adn-items">
              {(a.items || []).map((it) => (
                <div key={it.id} className="adn-item">
                  <span className="adn-item-name">{titleCase(it.name)}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>
                  <span className="adn-item-price">
                    {/* Tech never sees the customer/retail price — only what they'd be paid. */}
                    {showRetail && money((+it.qty || 0) * (+it.price || 0))}
                    {showPayout && it.techPay > 0 && <span className="adn-item-tech">{showRetail ? " · " : ""}{isTech ? "" : "tech "}{money((+it.qty || 0) * (+it.techPay || 0))}{isTech ? " payout" : ""}</span>}
                  </span>
                </div>
              ))}
            </div>
            {showRetail && +a.discount > 0 && (
              <div className="adn-disc-row"><span>Discount</span><b>− {money(+a.discount)}</b></div>
            )}
            {showRetail && addendumTotals(a).tax > 0 && (
              <div className="adn-disc-row"><span>Tax · {+a.taxRate}%</span><b>{money(addendumTotals(a).tax)}</b></div>
            )}
            <div className="adn-card-ft">
              <span className="adn-ct">
                {isTech
                  ? <>Your payout <b>{money(tt)}</b></>
                  : <>Add-on total <b>{money(ct)}</b>{showPayout && tt > 0 && <span className="adn-tt"> · tech payout {money(tt)}</span>}</>}
              </span>
              {a.status === "approved" && (
                <span className="adn-sign">
                  {a.signatureData && <img src={a.signatureData} alt="signature" />}
                  <em>Signed by {a.signedName}{a.signedAt ? ` · ${fmtStamp(a.signedAt)}` : ""}</em>
                </span>
              )}
              {a.status === "voided" && <span className="adn-void-note">Voided{a.voidedAt ? ` · ${fmtStamp(a.voidedAt)}` : ""}</span>}
              {a.status === "voided" && canVoid && confirm?.id !== a.id && (
                <button type="button" className="adn-unvoid" disabled={busy} onClick={() => unvoidAddendum(a.id)}>Restore</button>
              )}
              {/* Once voided, admin/manager can permanently delete it (it's off billing already). */}
              {a.status === "voided" && canVoid && confirm?.id !== a.id && (
                <button type="button" className="adn-del" disabled={busy} onClick={() => setConfirm({ id: a.id, action: "delete" })}>Delete</button>
              )}
              {/* Office prices a tech-submitted add-on before it can go to the customer. */}
              {a.needsPricing && a.status === "pending" && canBuild && canPrice && confirm?.id !== a.id && (
                <button type="button" className="adn-approve" disabled={busy} onClick={() => startEdit(a)}>Add pricing</button>
              )}
              {a.status === "pending" && isCustomer && !a.needsPricing && (
                <button type="button" className="adn-approve" disabled={readOnly} title={readOnly ? "The customer signs here" : undefined}
                        onClick={() => { if (!readOnly) { setSignErr(null); setSignId(a.id); } }}>
                  {readOnly ? "Customer signs here" : a.resignRequired ? "Review & Sign" : "Approve & Sign"}
                </button>
              )}
              {signErr && signId == null && <span className="adn-void-note">{signErr}</span>}
              {confirm && confirm.id === a.id ? (
                <span className="adn-confirm">
                  {confirm.action === "delete" ? "Delete this add-on?" : "Void this add-on?"}
                  <button type="button" className="adn-c-yes" disabled={busy}
                          onClick={() => { (confirm.action === "delete" ? removeAddendum : voidAddendum)(a.id); setConfirm(null); }}>
                    {confirm.action === "delete" ? "Delete" : "Void"}
                  </button>
                  <button type="button" className="adn-c-no" onClick={() => setConfirm(null)}>Keep</button>
                </span>
              ) : (
                <>
                  {a.status === "pending" && canBuild && (
                    <button type="button" className="adn-del" disabled={busy} onClick={() => setConfirm({ id: a.id, action: "delete" })}>Delete</button>
                  )}
                  {(a.status === "approved" || a.status === "pending") && canVoid && (
                    <button type="button" className="adn-del" disabled={busy} onClick={() => setConfirm({ id: a.id, action: "void" })}>Void</button>
                  )}
                </>
              )}
            </div>
            {/* Part B — approval-email state for the office: schedule / sent / send-for-later. */}
            {!isCustomer && !isTech && a.status === "pending" && !a.needsPricing && (
              <div className="adn-email-row">
                {a.scheduledSendAt ? (
                  <>
                    <span className="adn-email-sched">Email scheduled for {fmtStamp(a.scheduledSendAt)}</span>
                    <button type="button" className="adn-email-link" disabled={busy} onClick={() => openPrompt(a.id)}>Edit</button>
                    <button type="button" className="adn-email-link" disabled={busy} onClick={() => sendNow(a.id)}>Send now</button>
                    <button type="button" className="adn-email-link adn-email-cancel" disabled={busy} onClick={() => cancelSched(a.id)}>Cancel</button>
                  </>
                ) : a.emailSentAt ? (
                  <span className="adn-email-sent"><Tick />Approval email sent · {fmtStamp(a.emailSentAt)}</span>
                ) : (
                  <button type="button" className="adn-email-btn" disabled={busy} onClick={() => openPrompt(a.id)}>Send approval email</button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {canBuild && (building && draft ? (
        <AddendumBuilder key={editingId || "new"} accessId={accessId} canPrice={canPrice} editing={!!editingId} init={draft} busy={busy}
          submitLabel={editingId ? "Save pricing" : !canPrice ? "Submit add-on" : "Create addendum"}
          onSubmit={createAddendum} onCancel={closeBuilder} />
      ) : !composeOnly && (
        <button type="button" className="adn-newbtn" onClick={() => { setDraft({ title: defaultTitle(), items: [], discount: "" }); setBuilding(true); }}>+ New addendum</button>
      ))}

      {/* Part B — "Send approval email to <customer>?" via the shared Send-now / Schedule-send chooser. */}
      {emailPrompt && (() => {
        const a = addendums.find((x) => x.id === emailPrompt);
        const who = (customerName || "the customer").trim() || "the customer";
        return (
          <SendScheduler
            open
            title={`Send approval email to ${who}?`}
            subtitle={a ? `${a.title} · ${money(custTotal(a))}` : ""}
            busy={promptBusy}
            onSendNow={() => sendNow(emailPrompt)}
            onSchedule={(iso) => scheduleIt(emailPrompt, iso)}
            onClose={() => setEmailPrompt(null)}
          />
        );
      })()}

      <ProposalSignModal
        open={!!signId}
        heading="Approve Add-on"
        subheading={signId ? addendums.find((a) => a.id === signId)?.title : ""}
        defaultName={customerName || ""}
        agreeText="I approve this job-site add-on and authorize the additional work and charges shown above."
        accent="var(--green)"
        busy={busy}
        error={signErr}
        onConfirm={approve}
        onCancel={() => { setSignId(null); setSignErr(null); }}
      />
    </div>
  );
}

const ADN_CSS = `
.adn-root{background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;padding:16px;margin:16px 0 0;
  font-family:inherit}
.adn-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.adn-title{display:block;font-size:1rem;font-weight:600;color:var(--dv-ink,#101418);letter-spacing:-.01em}
.adn-sub{font-size:.78rem;color:var(--dv-meta,#787D84)}
.adn-total-badge{background:#e9f3ed;border:1px solid #cfe6d8;color:var(--dv-green,#2E7D5B);font-weight:600;font-size:.78rem;border-radius:100px;padding:6px 13px;white-space:nowrap}
.adn-card{border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;padding:12px 14px;margin-bottom:10px;background:var(--dv-raise,#FBFBFA)}
.adn-card.approved{background:#f2f9f4;border-color:#cfe6d8}
.adn-card-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.adn-card-title{font-size:.9rem;font-weight:600;color:var(--dv-ink,#101418)}
.adn-badge{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;border-radius:100px;padding:3px 10px}
.adn-badge.pending{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84)}
.adn-badge.approved{background:#e9f3ed;color:var(--dv-green,#2E7D5B)}
.adn-badge.declined{background:#fbe9e6;color:var(--dv-red,#C4553D)}
.adn-badge.voided{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84)}
.adn-card.voided{opacity:.62}
.adn-card.voided .adn-card-title{text-decoration:line-through;color:var(--dv-meta,#787D84)}
.adn-disc-row{display:flex;justify-content:space-between;gap:10px;font-size:.82rem;color:var(--dv-red,#C4553D);padding:2px 0 6px}
.adn-disc-row b{font-weight:600}
.adn-void-note{font-size:.74rem;color:var(--dv-faint,#A1A6AC);font-style:italic}
.adn-items{display:flex;flex-direction:column;gap:5px;padding:2px 0 8px}
.adn-item{display:flex;justify-content:space-between;gap:10px;font-size:.84rem;color:var(--dv-ink-soft,#3A4048)}
.adn-item-name{font-weight:600;color:var(--dv-ink,#101418)}
.adn-item-price{font-weight:600;font-variant-numeric:tabular-nums}
.adn-item-tech{color:var(--dv-gold-text,#8A6A1F);font-weight:500}
.adn-card-ft{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--dv-line-soft,#EDEDE9);padding-top:9px}
.adn-ct{font-size:.86rem;color:var(--dv-ink-soft,#3A4048)}
.adn-ct b{font-size:.98rem;color:var(--dv-ink,#101418);font-weight:600}
.adn-tt{color:var(--dv-gold-text,#8A6A1F)}
.adn-sign{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.adn-sign img{height:34px;max-width:150px;object-fit:contain}
.adn-sign em{font-size:.74rem;color:var(--dv-meta,#787D84);font-style:normal}
.adn-root .adn-approve{height:36px;padding:0 18px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-approve:hover{filter:brightness(1.12)}
.adn-del{height:32px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-red,#C4553D);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-unvoid{height:32px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-green,#2E7D5B);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-confirm{display:inline-flex;gap:8px;align-items:center;font-size:.76rem;color:var(--dv-meta,#787D84);font-weight:500}
.adn-root .adn-c-yes{height:30px;padding:0 12px;border:none;border-radius:8px;background:var(--dv-red,#C4553D);color:#fff;font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-c-no{height:30px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-newbtn{margin-top:6px;height:42px;width:100%;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-paper,#F4F4F2);color:var(--dv-ink,#101418);border-radius:10px;font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-newbtn:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.adn-cust-note{margin-top:10px;font-size:.8rem;color:var(--dv-ink-soft,#3A4048);background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:10px 12px;font-weight:500}
/* Part B — approval-email state row + the send prompt. */
.adn-email-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:9px;padding-top:9px;border-top:1px dashed var(--dv-line,#E4E4DF)}
.adn-root .adn-email-btn{height:32px;padding:0 14px;border:1px solid var(--dv-gold-text,#8A6A1F);border-radius:8px;background:#fff;color:var(--dv-gold-text,#8A6A1F);font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-email-btn:hover{background:rgba(176,141,76,.08)}
.adn-email-sched{font-size:.78rem;font-weight:600;color:#8a5a1f}
.adn-email-sent{font-size:.78rem;font-weight:600;color:var(--dv-green,#2E7D5B)}
.adn-email-link{height:28px;padding:0 10px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-ink-soft,#3A4048);font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-email-cancel{color:var(--dv-red,#C4553D)}
.adn-promptbg{position:fixed;inset:0;z-index:60;background:rgba(16,20,24,.42);display:flex;align-items:center;justify-content:center;padding:20px}
.adn-prompt{width:min(420px,94vw);background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-radius:16px;padding:18px;box-shadow:0 18px 50px -14px rgba(0,0,0,.4);font-family:inherit}
.adn-prompt-h{font-size:1rem;font-weight:700;color:var(--dv-ink,#101418)}
.adn-prompt-sub{font-size:.82rem;color:var(--dv-meta,#787D84);margin-top:3px}
.adn-prompt-acts{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}
.adn-root .adn-prompt-primary{height:40px;padding:0 20px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font-size:.84rem;font-weight:700;cursor:pointer;font-family:inherit}
.adn-root .adn-prompt-primary:disabled{opacity:.5;cursor:default}
.adn-prompt-ghost{height:40px;padding:0 16px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:#fff;color:var(--dv-ink,#101418);font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-prompt-text{height:40px;padding:0 10px;border:none;background:none;color:var(--dv-meta,#787D84);font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit;margin-left:auto}
.adn-prompt-sched{margin-top:14px}
.adn-prompt-sched .adn-b-title{margin-top:4px}
`;

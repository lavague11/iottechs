"use client";
import { useState, useEffect, useRef } from "react";
import { optionTotals, itemTotal, titleCase, serviceColor, fmtSignStamp, PAYMENT_PLANS } from "../../../lib/proposal";
import { downloadProposalPdf } from "../../../lib/proposal-pdf";
import { selectOptionAction, requestChangesAction, getProposalAction, submitProposalFlagsAction, declineOptionAction, approvePcpAction, voidPcpAgreementAction } from "./proposal-actions";
import { TaglinePill } from "../../components/brand";
import ProposalSignModal from "./proposal-sign-modal";
import { useAccordionItem, useAccordion } from "./flow-accordion";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-option accent so the customer can tell A / B / C apart at a glance.
const OPTION_TABCOLORS = { A: "#C9A96E", B: "#4b6a9b", C: "#2f7d5a" };

// Outdoor items get their "(O)" suffix colored red — an <input>'s value can't be partially
// colored (that's why the builder colors its whole name field instead), but here it's plain
// text so only the marker itself needs to stand out, not the whole name.
function itemNameNode(name, outdoor) {
  const title = titleCase(name);
  if (!outdoor) return title;
  const m = title.match(/^(.*?)(\s*\(O\))$/);
  if (!m) return <span style={{ color: "#8c2f2f", fontWeight: 700 }}>{title}</span>;
  return <>{m[1]}<span style={{ color: "#8c2f2f", fontWeight: 700 }}>{m[2]}</span></>;
}

// Customer review surface — HTML mirror of the brand PDF (lib/proposal-pdf.js): navy header
// banner, gold "SYSTEM PROPOSAL" tag, client info box, section headers, cost breakdown table,
// camera locations, payment terms, acceptance block. Same document the customer can Download
// as a PDF, just interactive (option tabs, expandable breakdowns, Select / Request changes).
// Receives the server-sanitized proposal (no cost/margin — stripped before it ever reaches
// the browser). `preview` = staff looking through the customer-view toggle → actions disabled.
export default function ProposalCustomerView({ accessId, proposal, preview, customerName, customerAddress, customerPhone, customerEmail, onAdvance, onStageSync, canVoid = false }) {
  const [p, setP] = useState(proposal);
  const [busy, setBusy] = useState(false);
  const [voidPcpOpen, setVoidPcpOpen] = useState(false);   // admin void of the PCP agreement signature
  const [err, setErr] = useState(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [note, setNote] = useState("");
  const [openItems, setOpenItems] = useState({});   // item id -> breakdown expanded
  const toggleItem = (id) => setOpenItems((o) => ({ ...o, [id]: !o[id] }));

  // ---- Revise mode: per-line change/remove requests (flags), not real edits ----
  const [reviseMode, setReviseMode] = useState(false);
  const [flags, setFlags] = useState(() => proposal?.customerFlags || {});
  const [menuFor, setMenuFor] = useState(null);   // item id whose action menu is open
  const [menuNote, setMenuNote] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [signFor, setSignFor] = useState(null);   // option id awaiting signature (accept flow)
  // Once accepted+signed, the full proposal document collapses to a summary so "Make Your Deposit"
  // is the focus. null = follow the lock state (auto-collapse on sign); true/false = user override.
  const [docOverride, setDocOverride] = useState(null);
  // Accordion: the proposal document and the deposit panel open one at a time. `done` = locked
  // (accepted+signed) so completing the proposal hands the open slot to the deposit below.
  const lockedEarly = !!p?.signed_name && (p?.accepted_options?.length > 0);
  const acc = useAccordionItem("proposal-doc", lockedEarly);
  const accCtx = useAccordion();   // to pop the deposit panel open right after signing (no page change)

  const isDraftPreview = preview && p?.status === "draft" && p?.payload;
  const [viewingOpt, setViewingOpt] = useState(() => p?.selected_option || p?.payload?.options?.[0]?.id);

  // Re-pull the current server state on mount so a proposal sent in this session (or after this
  // page was first rendered) shows immediately instead of the stale "in preparation" copy.
  useEffect(() => {
    let live = true;
    getProposalAction(accessId).then((r) => { if (live && r?.proposal) setP(r.proposal); }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);
  // Keep the working flag set in sync with whatever the server last stored.
  const savedFlagsKey = JSON.stringify(p?.customerFlags || {});
  useEffect(() => { setFlags(p?.customerFlags || {}); }, [savedFlagsKey]);
  // Close the per-line action menu on an outside click.
  useEffect(() => {
    if (menuFor == null) return;
    function onDown(e) { if (!e.target.closest(".pcv-linemenu") && !e.target.closest(".pcv-row")) setMenuFor(null); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuFor]);

  const flagCount = Object.keys(flags).length;
  function openMenu(id) { setMenuFor(id); setMenuNote(flags[id]?.note || ""); }
  // A per-line request (removal or relocation) files immediately — mark it, then send to the team.
  // The customer never deletes anything; staff review each request and action it on the proposal.
  async function submitFlags(next, toast) {
    setFlags(next); setMenuFor(null); setMenuNote("");   // optimistic mark
    if (preview) { showToast("Preview mode — requests disabled"); return; }
    setBusy(true); setErr(null);
    const r = await submitProposalFlagsAction(accessId, next);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setP(r.proposal);
    setFlags(r.proposal?.customerFlags || {});   // adopt the server-stored set as the new base
    showToast(toast);
  }
  // Base each edit on the server-confirmed set (p.customerFlags), never a possibly-stale render
  // closure — so a request never silently wipes the other flags.
  function applyFlag(id, type) {
    const base = { ...(p.customerFlags || {}) };
    submitFlags({ ...base, [id]: { type, note: menuNote.trim() } },
      type === "remove" ? "Removal request sent to our team" : "Relocation request sent to our team");
  }
  function clearFlag(id) {
    const n = { ...(p.customerFlags || {}) }; delete n[id];
    submitFlags(n, "Request withdrawn");
  }

  async function approvePcp() {
    if (busy) return;
    if (preview) { showToast("Preview mode — approval disabled"); return; }
    setBusy(true); setErr(null);
    const r = await approvePcpAction(accessId, customerName);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    if (r.proposal) setP(r.proposal);
    showToast("PCP agreement approved — thank you");
  }
  // Admin/manager correction: void the customer's PCP agreement signature so it can be re-approved.
  async function voidPcp() {
    setBusy(true); setErr(null);
    const r = await voidPcpAgreementAction(accessId);
    setBusy(false); setVoidPcpOpen(false);
    if (r?.error) { setErr(r.error); return; }
    if (r.proposal) setP(r.proposal);
    showToast("PCP signature voided — customer can re-approve");
  }

  if (!p || !p.payload) {
    return (
      <div className="pcv-root">
        <style>{PCV_CSS}</style>
        <div className="pcv-header">
          <div className="pcv-hd-left">
            <span className="pcv-brand">IOT TECHS</span>
            <TaglinePill tone="dark" className="pcv-pill" />
          </div>
          <span className="pcv-doctag">Proposal</span>
        </div>
        <div className="pcv-empty">Our team is preparing your proposal — mockups and pricing are on the way.</div>
      </div>
    );
  }

  const acceptedSet = new Set(p.accepted_options || []);
  const declinedMap = p.declined_options || {};
  const optName = (id) => p.payload.options.find((o) => o.id === id)?.name || `Option ${id}`;
  const opt = p.payload.options.find((o) => o.id === viewingOpt) || p.payload.options[0];
  const optAccepted = acceptedSet.has(opt.id);
  const optDeclined = Object.prototype.hasOwnProperty.call(declinedMap, opt.id);
  const t = optionTotals(opt, p.tax_rate, p.payload.discount, p.deposit_pct, p.payload.pcp_credit);
  const camSvc = opt.services.find((s) => s.key === "camera");
  const camBlocks = (camSvc?.items || []).filter((it) => (it.sub || []).length > 0);
  const depositPct = +p.deposit_pct || 50;
  const finalPct = 100 - depositPct;
  const payPlan = p.payload.payment_plan || "custom";
  const payPhases = payPlan === "50_30_20"
    ? [["Deposit", "To begin", 50], ["Progress", "At project midpoint", 30], ["Final", "Upon completion (or Net 30)", 20]]
    : payPlan === "50_50"
    ? [["Deposit", "Before we begin", 50], ["Final", "Upon completion", 50]]
    : [["Deposit", "Before project start", depositPct], ["Final", "Upon completion", finalPct]];
  const payTerms = PAYMENT_PLANS[payPlan]?.terms || "";
  // PCP (Performance Credit Program) — a pending, discretionary labor-subtotal credit.
  const pcpRaw = p.payload.pcp_credit;
  const pcpPct = (pcpRaw && typeof pcpRaw === "object" && pcpRaw.type === "pct") ? +pcpRaw.value || 0 : 0;
  const pcpAgreed = !!p.pcp_agreed_at;
  const pcpApproved = p.pcp_status === "approved";
  const propNum = "PROP-" + String(p.id || "0").padStart(4, "0") + "-v" + (p.version || 1);
  const propDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  // Customer can accept / decline / request changes while the proposal is out (not a draft
  // preview). Declined stays actionable so they can change their mind and accept an option.
  // Once SIGNED, the decision is locked: no more accept/remove/decline/request-change — the
  // toolbar collapses to "Accepted ✓" + Request Modification + Download, and the accept box
  // reduces to the next-step button (the signature block below is the record).
  const locked = !!p.signed_name && acceptedSet.size > 0;
  // Document body is open by default until the proposal is locked (accepted+signed), then it
  // auto-collapses to a summary the customer can re-expand. The accordion (one tool open at a time)
  // drives it when present; otherwise fall back to the local override / lock default.
  const docOpen = acc ? acc.open : (docOverride == null ? !locked : docOverride);
  const toggleDoc = () => { if (acc) acc.toggle(); else setDocOverride(!docOpen); };
  const canAct = !locked && !isDraftPreview && ["sent", "changes_requested", "accepted", "declined"].includes(p.status);
  // When the customer may file per-line removal/relocation requests: any actionable proposal (direct
  // ✕ on each line), or a signed one they've put into "Request Modification" mode.
  const canReq = canAct || reviseMode;

  // Accept toggles an option; customers may accept more than one (A + C, etc.). Accepting opens
  // the signature pop-up first (acceptance must be signed); removing an already-accepted option
  // just toggles it off, no signature needed.
  function choose(optId) {
    if (busy) return;
    if (acceptedSet.has(optId)) { doAccept(optId, null); }
    else { if (preview) return; setSignFor(optId); }
  }
  async function doAccept(optId, sign) {
    setBusy(true); setErr(null);
    const r = await selectOptionAction(accessId, optId, sign);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setP(r.proposal);
    setSignFor(null); setConfirmApprove(false);
    showToast(sign ? "Signed & accepted" : "Option removed");
    // After signing, stay on this page and pop the deposit panel open (it lives right below in the
    // same phase) — don't jump anywhere. The stage advances to approval_deposit, but that's the same
    // phase view, so nothing navigates.
    if (sign) accCtx?.open?.("deposit");
    if (r.stage && r.stage !== "proposal") onStageSync?.(r.stage);   // auto-advanced (same phase)
  }
  // Decline just the current option — never touches the others (accept A, decline B).
  async function decline(reason) {
    if (busy) return;
    setBusy(true); setErr(null);
    const r = await declineOptionAction(accessId, opt.id, reason);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setP(r.proposal);
    setDeclineOpen(false);
    showToast(`Option ${opt.id} declined`);
  }
  async function submitRequest() {
    if (preview || busy || !note.trim()) return;
    setBusy(true); setErr(null);
    const r = await requestChangesAction(accessId, note.trim());
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setP(r.proposal);
    setReqOpen(false);
    setNote("");
  }

  return (
    <div className="pcv-root">
      <style>{PCV_CSS}</style>

      {/* Fold header — same tool-card language as the rest of the page (icon + title + status chip
          + chevron). The whole proposal collapses; after accept+sign it auto-folds so "Make Your
          Deposit" is the focus, but the customer can reopen it anytime. */}
      <button type="button" className={`pcv-fold-hd${locked ? " done" : ""}`} onClick={toggleDoc} aria-expanded={docOpen}>
        <span className="pcv-fold-ic">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </span>
        <span className="pcv-fold-title">System Proposal</span>
        <span className={`pcv-fold-chip${locked ? " done" : acceptedSet.size > 0 ? " ok" : ""}`}>
          {locked ? "Accepted & Signed" : acceptedSet.size > 0 ? "Accepted" : "Review"}
        </span>
        <span className="pcv-fold-chev">{docOpen ? "▲" : "▼"}</span>
      </button>

      {docOpen && (
      <div className="pcv-foldwrap">
      <div className="pcv-header">
        <div className="pcv-hd-left">
          <span className="pcv-brand">IOT TECHS</span>
          <span className="pcv-tagline">Secure Tomorrow. Today.</span>
          <span className="pcv-contact">(646) 396-0775 · support@iot-techs.com · www.iot-techs.com</span>
        </div>
        <div className="pcv-hd-right">
          <span className="pcv-doctag">System Proposal</span>
          <span className="pcv-pill">Security &amp; Low Voltage</span>
          <span className="pcv-hd-meta">{propDate}</span>
          <span className="pcv-hd-meta">Proposal #: {propNum}</span>
        </div>
      </div>

      <div className="pcv-info-box">
        <div className="pcv-info-row">
          <div><span className="pcv-info-lbl">Prepared For</span><b>{customerName || "Client TBD"}</b></div>
          <div><span className="pcv-info-lbl">Project Address</span><b>{customerAddress || "Address TBD"}</b></div>
          <div><span className="pcv-info-lbl">Proposal #</span><b>{propNum}</b></div>
        </div>
        <div className="pcv-info-row">
          <div><span className="pcv-info-lbl">Client Name</span><b>{customerName || "Client TBD"}</b></div>
          <div><span className="pcv-info-lbl">Phone</span><b>{customerPhone || "—"}</b></div>
          <div><span className="pcv-info-lbl">Email</span><b>{customerEmail || "—"}</b></div>
        </div>
      </div>

      <div className="pcv-toolbar">
        <div className="pcv-tb-actions">
          {locked && (
            <>
              <span className="pcv-tb-locked">✓ Accepted &amp; Signed</span>
              <button type="button" className={`pcv-tb-btn revise${reviseMode ? " on" : ""}`}
                      onClick={() => { setReviseMode((m) => !m); setMenuFor(null); setDeclineOpen(false); }}>
                ✎ {reviseMode ? "Done" : "Request Modification"}
              </button>
            </>
          )}
          {canAct && (
            <>
              <button type="button" className={`pcv-tb-btn accept${optAccepted ? " on" : ""}`} disabled={busy}
                      onClick={() => { choose(opt.id); setReviseMode(false); setDeclineOpen(false); setMenuFor(null); }}>
                {optAccepted ? `✓ Accepted${p.payload.options.length > 1 ? ` ${opt.id}` : ""}` : `✓ Accept${p.payload.options.length > 1 ? ` ${opt.id}` : ""}`}
              </button>
              <button type="button" className={`pcv-tb-btn decline${optDeclined ? " on" : ""}`} disabled={busy}
                      onClick={() => { if (optDeclined) { decline(); return; } setDeclineOpen((v) => !v); setReviseMode(false); setMenuFor(null); }}>
                {optDeclined ? `✕ Declined${p.payload.options.length > 1 ? ` ${opt.id}` : ""}` : `✕ Decline${p.payload.options.length > 1 ? ` ${opt.id}` : ""}`}
              </button>
              <button type="button" className={`pcv-tb-btn revise${reviseMode ? " on" : ""}`}
                      onClick={() => { setReviseMode((m) => !m); setMenuFor(null); setDeclineOpen(false); }}>
                ✎ {reviseMode ? "Done" : "Request Change"}
              </button>
            </>
          )}
          <button type="button" className="pcv-dl"
                  onClick={() => downloadProposalPdf(p, { customerName, customerAddress, customerPhone, customerEmail })}
                  title="Download a PDF of this proposal">
            ⭳ Download PDF
          </button>
        </div>
      </div>

      {declineOpen && (
        <div className="pcv-confirm-strip">
          <span>Why are you declining?</span>
          {["Price is too high", "Need time — still shopping around", "I need some changes first"].map((r) => (
            <button key={r} className="pcv-btn" disabled={busy} onClick={() => decline(r)}>{r}</button>
          ))}
          <button className="pcv-btn" onClick={() => setDeclineOpen(false)}>Cancel</button>
        </div>
      )}
      {optDeclined && !declineOpen && (
        <div className="pcv-note-strip">You declined {optName(opt.id)}{declinedMap[opt.id] ? `: “${declinedMap[opt.id]}”` : ""}. Changed your mind? Accept it below.</div>
      )}
      {reviseMode && (
        <div className="pcv-revise-hint">
          <b>Revise mode</b> — tap any line item to request a change or removal. Nothing is deleted; our team reviews each request.
        </div>
      )}
      {!reviseMode && flagCount > 0 && p.status === "changes_requested" && (
        <div className="pcv-note-strip">You flagged {flagCount} item{flagCount !== 1 ? "s" : ""} for revision — our team is reviewing.</div>
      )}
      {p.status === "changes_requested" && p.change_note && (
        <div className="pcv-note-strip">Your request: “{p.change_note}” — our team is on it.</div>
      )}
      {err && <div className="pcv-note-strip err">{err}</div>}

      {p.payload.options.length > 1 && (
        <div className="pcv-opt-cards">
          {p.payload.options.map((o) => {
            // Colour each option by its dominant service so A/B/C read like the item palette
            // (cameras gold, toast orange, alarm blue, sound purple…).
            const oc = serviceColor(o.services?.[0]?.key) || OPTION_TABCOLORS[o.id] || "#C9A96E";
            const ot = optionTotals(o, p.tax_rate, p.payload.discount, p.deposit_pct, p.payload.pcp_credit);
            const on = o.id === opt.id;
            return (
              <button key={o.id} type="button" className={`pcv-opt-card${on ? " on" : ""}`} style={{ "--oc": oc }} onClick={() => setViewingOpt(o.id)}>
                <span className="pcv-opt-badge2">{o.id}</span>
                <span className="pcv-opt-info">
                  <span className="pcv-opt-nm">{o.name}
                    {acceptedSet.has(o.id) && <span className="pcv-opt-chk">✓ Accepted</span>}
                    {Object.prototype.hasOwnProperty.call(declinedMap, o.id) && <span className="pcv-opt-chk dec">✕ Declined</span>}
                  </span>
                  <span className="pcv-opt-tot">{money(ot.grand)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="pcv-section-hd">Project Cost Breakdown{p.payload.options.length > 1 ? ` — Option ${opt.id} (${opt.name})` : ""}</div>
      <div className="pcv-table">
        <div className="pcv-table-head">
          <span>#</span><span>Description</span><span className="r">Qty</span><span className="r">Unit</span><span className="r">Total</span>
        </div>
        {opt.services.map((s, i) => {
          if (!s.items?.length) return null;
          let blockN = 0;
          let secTotal = 0;
          const svcColor = serviceColor(s.key);
          return (
            <div key={i}>
              <div className="pcv-svc-head" style={{ background: "#0B0F1A", color: svcColor }}>{s.label.toUpperCase()}</div>
              {s.items.map((it, idx) => {
                const hasSub = (it.sub || []).length > 0;
                const expanded = !!openItems[it.id];
                const blockNum = ++blockN;
                secTotal += itemTotal(it);
                return (
                  <div key={it.id} className="pcv-row-wrap">
                    <div className={`pcv-row${idx % 2 ? " alt" : ""}${(reviseMode || hasSub) ? " expandable" : ""}${flags[it.id] ? " flagged flag-" + flags[it.id].type : ""}${reviseMode ? " revising" : ""}`}
                         onClick={reviseMode ? () => openMenu(it.id) : (hasSub ? () => toggleItem(it.id) : undefined)}
                         title={reviseMode ? "Request a change or removal" : (hasSub ? (expanded ? "Hide breakdown" : "Show breakdown") : (it.outdoor ? "Outdoor placement" : undefined))}>
                      <span className="pcv-rownum">{blockNum}</span>
                      <span className="pcv-rowdesc">
                        {reviseMode && <span className="pcv-flagdot">⚑</span>}
                        {!reviseMode && hasSub && <span className="pcv-chev">{expanded ? "▾" : "▸"}</span>}
                        {itemNameNode(it.name, it.outdoor)}{it.slot ? ` · Slot ${it.slot}` : ""}
                        {it.waived && <span className="pcv-waived-chip">Waived</span>}
                        {flags[it.id] && (
                          <span className={`pcv-flag-chip ${flags[it.id].type}`}>
                            {flags[it.id].type === "remove" ? "Removal requested" : "Relocation requested"}{flags[it.id].note ? `: ${flags[it.id].note}` : ""}
                          </span>
                        )}
                        {/* Direct per-line request control — the customer can't delete; the ✕ files a
                            removal/relocation request for the team. Shows a ↩ once a request is on. */}
                        {canReq && (
                          <button type="button" className={`pcv-x${flags[it.id] ? " on" : ""}`} title="Request removal or relocation"
                                  aria-label="Request removal or relocation" onClick={(e) => { e.stopPropagation(); openMenu(it.id); }}>
                            {flags[it.id] ? "↩" : "✕"}
                          </button>
                        )}
                      </span>
                      <span className="r">{hasSub ? "1" : (it.qty ?? 1)}</span>
                      <span className="r">{it.waived ? <s className="pcv-waived-strike">{money(hasSub ? itemTotal({ ...it, waived: false }) : it.price)}</s> : money(hasSub ? itemTotal(it) : it.price)}</span>
                      <span className="r b">{it.waived ? <s className="pcv-waived-strike">{money(itemTotal({ ...it, waived: false }))}</s> : money(itemTotal(it))}</span>
                    </div>

                    {menuFor === it.id && (
                      <div className="pcv-linemenu" onClick={(e) => e.stopPropagation()}>
                        <div className="pcv-linemenu-title">{titleCase(it.name)}</div>
                        <textarea className="pcv-linemenu-note" rows={2} placeholder="Add a note for our team (optional)…"
                                  value={menuNote} onChange={(e) => setMenuNote(e.target.value)} />
                        <div className="pcv-linemenu-actions">
                          <button type="button" className="pcv-lm-btn remove" onClick={() => applyFlag(it.id, "remove")}>Request Removal</button>
                          <button type="button" className="pcv-lm-btn change" onClick={() => applyFlag(it.id, "change")}>Request Relocation</button>
                          {flags[it.id] && <button type="button" className="pcv-lm-btn clear" onClick={() => clearFlag(it.id)}>Withdraw</button>}
                        </div>
                        <div className="pcv-linemenu-foot">Nothing is deleted — our team reviews and updates the proposal.</div>
                      </div>
                    )}

                    {!reviseMode && hasSub && expanded && it.sub.map((x) => (
                      <div key={x.id} className="pcv-row sub">
                        <span className="pcv-rownum" />
                        <span className="pcv-rowdesc">· {titleCase(x.name)}</span>
                        <span className="r">{x.qty}</span>
                        <span className="r">{money(x.price)}</span>
                        <span className="r b">{money((+x.qty || 0) * (+x.price || 0))}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
              {s.note && <div className="pcv-svc-note">{s.note}</div>}
              <div className="pcv-subtotal-row"><span>{s.label} Subtotal</span><span>{money(secTotal)}</span></div>
            </div>
          );
        })}
      </div>

      <div className="pcv-subtotal-row main"><span>Project Subtotal</span><span>{money(t.sub)}</span></div>
      {t.discount > 0 && <div className="pcv-subtotal-row main"><span>Discount</span><span>−{money(t.discount)}</span></div>}
      {t.pcpCredit > 0 && <div className="pcv-subtotal-row main"><span>PCP Credit{pcpApproved ? "" : " (pending)"}</span><span>−{money(t.pcpCredit)}</span></div>}
      {t.tax > 0 && <div className="pcv-subtotal-row main"><span>Sales Tax ({p.tax_rate}%)</span><span>+{money(t.tax)}</span></div>}
      <div className="pcv-grand"><span>Grand Total</span><span>{money(t.grand)}</span></div>

      {camBlocks.length > 0 && (
        <>
          <div className="pcv-section-hd">Camera Locations</div>
          <div className="pcv-loc-box">
            <div className="pcv-loc-list">
              {camBlocks.map((it) => (
                <span key={it.id} className="pcv-loc-item">• {titleCase(it.name).replace(/\s*—.*$/, "")}</span>
              ))}
            </div>
            <div className="pcv-loc-total">Total Camera Locations: {camBlocks.length}</div>
          </div>
        </>
      )}

      <div className="pcv-section-hd">Payment Terms</div>
      <div className="pcv-pay-table">
        <div className="pcv-pay-head"><span>Phase</span><span>Trigger</span><span className="r">%</span><span className="r">Amount</span></div>
        {payPhases.map(([ph, trig, pct], i) => (
          <div key={ph} className={"pcv-pay-row" + (i === 0 ? " first" : "")}>
            <span>{ph}</span><span>{trig}</span><span className="r">{pct}%</span><span className="r b">{money(t.grand * pct / 100)}</span>
          </div>
        ))}
      </div>
      {payTerms && <div className="pcv-pay-terms">{payTerms}</div>}
      <div className="pcv-fineprint">Price subject to applicable sales tax. Proposal valid 7 days from issue.</div>

      {t.pcpCredit > 0 && (
        <>
          <div className="pcv-section-hd">Performance Credit Program</div>
          <div className="pcv-pcp-box">
            <div className="pcv-pcp-head">
              <div>
                <div className="pcv-pcp-title">Pending Performance Credit{pcpPct ? ` · ${pcpPct}%` : ""} <span className="pcv-pcp-amt">−{money(t.pcpCredit)}</span></div>
                <div className="pcv-pcp-sub">A discretionary job‑performance credit of 2–10% on the labor subtotal, rewarding jobs that run efficiently — fewer visits, prompt payment, easy access, added value to IOT TECHS.</div>
              </div>
              <span className={`pcv-pcp-badge ${pcpAgreed ? "ok" : "pending"}`}>{pcpAgreed ? "✓ Agreement approved" : "Pending your approval"}</span>
            </div>
            <ul className="pcv-pcp-terms">
              <li>Shown as a <b>transparent line‑item deduction</b> — never baked into pricing.</li>
              <li>Must be agreed <b>before work begins</b>; it is not applied retroactively.</li>
              <li>The credit is <b>pending and discretionary</b> — the final amount is confirmed at completion and may be adjusted if job performance, payment timing, or site conditions differ from what was committed. You'll be notified of any change before final invoicing.</li>
              <li>Applies to the labor subtotal only. Deposit due before work; balance due on completion.</li>
            </ul>
            {pcpAgreed ? (
              <div className="pcv-pcp-agreed">
                {canVoid ? (
                  <button type="button" className="pcv-pcp-void-target" title="Click to void this signature" onClick={() => setVoidPcpOpen(true)}>
                    ✓ Approved{p.pcp_agreement_no ? ` · ${p.pcp_agreement_no}` : ""}{p.pcp_agreed_at ? ` · ${new Date(p.pcp_agreed_at.replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                  </button>
                ) : (
                  <>✓ Approved{p.pcp_agreement_no ? ` · ${p.pcp_agreement_no}` : ""}{p.pcp_agreed_at ? ` · ${new Date(p.pcp_agreed_at.replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}</>
                )}
                <span className="pcv-pcp-agreed-note">{pcpApproved ? "Credit confirmed by IOT TECHS." : "Credit remains pending final confirmation at completion."}</span>
                {canVoid && voidPcpOpen && (
                  <span className="pcv-void-confirm">
                    Are you sure you want to void this signature?
                    <button className="pcv-void-yes" disabled={busy} onClick={voidPcp}>Void</button>
                    <button className="pcv-void-no" onClick={() => setVoidPcpOpen(false)}>Keep</button>
                  </span>
                )}
              </div>
            ) : (
              <button className="pcv-select pcv-pcp-approve" disabled={busy} onClick={approvePcp}>Approve PCP Agreement</button>
            )}
          </div>
        </>
      )}

      {/* Acceptance box — after the totals, where the customer accepts / requests / declines.
          Once signed it collapses to the acceptance record + next step. */}
      <div className="pcv-section-hd">{locked ? "Accepted" : "Accept, Request Change, or Decline"}</div>
      <div className="pcv-accept-box">
        {reviseMode ? (
          <div className="pcv-send-bar">
            <span className="pcv-send-count">{flagCount ? `${flagCount} item${flagCount !== 1 ? "s" : ""} requested — our team is reviewing.` : "Tap ✕ on any line to request its removal or relocation."}</span>
            <button className="pcv-select" onClick={() => { setReviseMode(false); setMenuFor(null); }}>Done</button>
          </div>
        ) : (
          <>
            {acceptedSet.size > 0 && (
              <div className="pcv-accept-selected">
                {[...acceptedSet].sort().map((id) => (
                  <span key={id} className="pcv-accepted-line">✓ {optName(id)} accepted</span>
                ))}
                {locked && <span className="pcv-locked-note">Signed by {p.signed_name} — this agreement is locked. Need something changed? Use Request Modification above.</span>}
              </div>
            )}
            {canAct && (
              <>
                <p>Accept the option{p.payload.options.length > 1 ? "(s)" : ""} you want{p.payload.options.length > 1 ? " — you can pick more than one" : ""}, request a change, or decline.</p>
                <div className="pcv-accept-actions">
                  <button className={`pcv-select${optAccepted ? " outline" : ""}`} disabled={busy} onClick={() => choose(opt.id)}>
                    {optAccepted ? `Remove Option ${opt.id}` : `Accept Option ${opt.id} — ${money(t.grand)}`}
                  </button>
                  <button className="pcv-btn" onClick={() => { setReviseMode(true); setDeclineOpen(false); setMenuFor(null); }}>✎ Request Change</button>
                  <button className="pcv-btn" onClick={() => { setDeclineOpen(true); setReviseMode(false); }}>✕ Decline</button>
                </div>
              </>
            )}
            {/* No premature "next step" button here — once accepted, the deposit tool below is the
                next action, and advancement happens after the deposit is recorded (not on accept). */}
            {!canAct && acceptedSet.size === 0 && <p>This proposal isn’t open for action right now.</p>}
          </>
        )}
      </div>

      {p.signed_name && (
        <>
          <div className="pcv-section-hd">Authorized Signature</div>
          <div className="pcv-sign-box">
            <div className="pcv-sign-mark">
              {p.signature_data
                ? <img src={p.signature_data} alt="Signature" className="pcv-sign-img" />
                : <span className="pcv-sign-typed">{p.signed_name}</span>}
              <span className="pcv-sign-rule" />
              <span className="pcv-sign-cap">Authorized Signature</span>
            </div>
            <div className="pcv-sign-meta">
              <span className="pcv-sign-name">{p.signed_name}</span>
              {p.signed_at && <span className="pcv-sign-date">Signed {fmtSignStamp(p.signed_at)}</span>}
            </div>
          </div>
        </>
      )}

      <div className="pcv-footer">
        IOT TECHS · (646) 396-0775 · support@iot-techs.com · www.iot-techs.com · Confidential Proposal
      </div>
      </div>
      )}

      <ProposalSignModal
        open={!!signFor}
        heading={signFor ? `Accept & Sign — Option ${signFor}` : "Accept & Sign"}
        subheading={signFor ? `${optName(signFor)} · ${money(optionTotals(p.payload.options.find((o) => o.id === signFor), p.tax_rate, p.payload.discount, p.deposit_pct, p.payload.pcp_credit).grand)}` : ""}
        reference={propNum}
        defaultName={p.signed_name || customerName || ""}
        agreeText="I have reviewed and agree to the scope, terms, and pricing of this proposal, and I authorize it to proceed."
        accent="#C9A96E"
        busy={busy}
        onConfirm={(sign) => doAccept(signFor, sign)}
        onCancel={() => setSignFor(null)}
      />

      {toast && (
        <div className="pcv-toast">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}
    </div>
  );
}

const PCV_CSS = `
.pcv-root{background:#FAF8F4;border-radius:14px;border:1px solid #d9d4ca;overflow:hidden;
  box-shadow:0 10px 30px rgba(11,15,26,.08);
  font-family:"SF Pro Display",-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif}
.pcv-header{background:#0B0F1A;padding:20px 22px;display:flex;justify-content:space-between;
  align-items:flex-start;flex-wrap:wrap;gap:14px;border-top:4px solid #C9A96E}
.pcv-hd-left{display:flex;flex-direction:column;gap:3px}
.pcv-brand{font-size:1.3rem;font-weight:800;color:#fff;letter-spacing:.02em}
.pcv-pill{margin:2px 0}
.pcv-contact{font-size:.7rem;color:#9aa1af}
.pcv-hd-right{display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.pcv-doctag{font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;
  color:#C9A96E;border-bottom:1px solid #C9A96E;padding-bottom:2px}
.pcv-pill{background:#C9A96E;color:#0B0F1A;font-size:.66rem;font-weight:800;letter-spacing:.03em;
  text-transform:uppercase;padding:4px 12px;border-radius:100px}
.pcv-hd-meta{font-size:.7rem;color:#9aa1af}
.pcv-empty{color:#6f7686;font-size:.86rem;padding:30px 22px;text-align:center}

.pcv-info-box{margin:20px 22px;border:1px solid #d9d4ca;border-top:2px solid #C9A96E;border-radius:2px;background:#fff}
.pcv-info-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:10px 14px}
.pcv-info-row+.pcv-info-row{border-top:1px solid #ece8e0}
.pcv-info-row div{display:flex;flex-direction:column;gap:2px;min-width:0}
.pcv-info-row b{font-size:.82rem;color:#0B0F1A;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pcv-info-lbl{font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#4a5270}

.pcv-toolbar{margin:0 22px 6px;display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}
.pcv-dl{height:30px;padding:0 14px;border-radius:100px;border:1px solid #C9A96E;background:#fff;
  color:#8a6d2f;font-size:.74rem;font-weight:700;cursor:pointer;font-family:inherit}
.pcv-dl:hover{background:#C9A96E;color:#0B0F1A}
.pcv-note-strip{margin:0 22px 6px;background:#F3E9D3;border:1px solid #d9c48f;color:#7a5f1f;
  font-size:.78rem;font-weight:600;padding:9px 12px;border-radius:8px}
.pcv-note-strip.err{background:#FBE6E4;border-color:#e0b0a8;color:#a8442f}

/* Color-coded option cards (A/B/C) — the active one pops with its accent */
.pcv-opt-cards{margin:0 22px 8px;display:flex;gap:10px;flex-wrap:wrap}
.pcv-opt-card{flex:1;min-width:150px;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;
  border:1.5px solid #e2ddd2;background:#fff;cursor:pointer;font-family:inherit;transition:transform .12s,box-shadow .12s,border-color .12s}
.pcv-opt-card:hover{border-color:var(--oc);transform:translateY(-1px)}
.pcv-opt-card.on{border-color:var(--oc);box-shadow:0 6px 20px color-mix(in srgb,var(--oc) 35%,transparent),inset 0 0 0 1px var(--oc);transform:translateY(-2px)}
.pcv-opt-badge2{width:30px;height:30px;flex-shrink:0;border-radius:8px;background:var(--oc);color:#fff;
  display:flex;align-items:center;justify-content:center;font-size:.92rem;font-weight:800}
.pcv-opt-info{display:flex;flex-direction:column;gap:1px;min-width:0;text-align:left}
.pcv-opt-nm{font-size:.8rem;font-weight:800;color:#0B0F1A;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pcv-opt-chk{font-size:.6rem;font-weight:800;color:#1d7a3a;background:#E1F4E8;border-radius:100px;padding:1px 6px}
.pcv-opt-tot{font-size:.86rem;font-weight:800;color:var(--oc)}

.pcv-section-hd{margin:18px 22px 0;background:#2C3347;color:#FAF8F4;font-size:.76rem;font-weight:800;
  letter-spacing:.04em;text-transform:uppercase;padding:9px 12px;border-left:4px solid #C9A96E}
/* Fold header — collapses the whole proposal; matches the page's FlowStep tool-cards (white row,
   1px border with a status-colored left rule, soft-tint icon, status chip, chevron). Gold while in
   progress, green once accepted+signed — same "complete = green" convention as the other cards. */
.pcv-fold-hd{display:flex;align-items:center;gap:10px;width:100%;margin:0;background:#fff;
  border:1px solid #d9d4ca;border-left:3px solid #C9A96E;border-radius:12px;padding:11px 16px;
  cursor:pointer;text-align:left;font-family:inherit;transition:background .12s}
.pcv-fold-hd:hover{background:#faf7f1}
.pcv-fold-hd.done{border-left-color:#2f7d5a}
.pcv-fold-ic{flex-shrink:0;width:30px;height:30px;border-radius:8px;background:#f7f0df;color:#a3812f;display:grid;place-items:center}
.pcv-fold-hd.done .pcv-fold-ic{background:#e7f6ec;color:#2f7d5a}
.pcv-fold-title{font-size:.9rem;font-weight:800;color:#0B0F1A;letter-spacing:-.01em}
.pcv-fold-chip{font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#8a8578;
  background:#f2efe9;border:1px solid #e2ddd3;border-radius:999px;padding:3px 9px}
.pcv-fold-chip.ok{color:#a3812f;background:#f7f0df;border-color:#e8d9b3}
.pcv-fold-chip.done{color:#1c8a45;background:#e7f6ec;border-color:#bfe3cd}
.pcv-fold-chev{margin-left:auto;flex-shrink:0;font-size:.72rem;color:#9aa1af}
.pcv-table{margin:0 22px}
.pcv-table-head{display:grid;grid-template-columns:26px 1fr 60px 80px 90px;gap:6px;background:#2C3347;
  color:#FAF8F4;font-size:.72rem;font-weight:700;padding:8px 10px;border-bottom:2px solid #C9A96E}
.pcv-table-head .r{text-align:right}
.pcv-svc-head{font-size:.7rem;font-weight:800;letter-spacing:.04em;padding:6px 10px}
.pcv-row{display:grid;grid-template-columns:26px 1fr 60px 80px 90px;gap:6px;padding:7px 10px;
  font-size:.8rem;color:#0B0F1A;border-bottom:1px solid #ece8e0;align-items:center}
.pcv-row.alt{background:#F0ECE8}
.pcv-row.sub{background:#fff;color:#6f7686;font-size:.76rem;opacity:.85}
.pcv-row.expandable{cursor:pointer}
.pcv-row.expandable:hover{background:#F3E9D3}
.pcv-rownum{text-align:center;color:#6f7686;font-size:.74rem}
.pcv-rowdesc{display:flex;align-items:center;gap:5px;min-width:0}
.pcv-chev{font-size:.68rem;color:#8a6d2f;flex-shrink:0}
.r{text-align:right}
.b{font-weight:700}
.pcv-svc-note{padding:4px 10px;font-size:.72rem;color:#6f7686;white-space:pre-wrap}
.pcv-subtotal-row{margin:0 22px;display:flex;justify-content:space-between;background:#eef1f8;
  border-top:1px solid #2C3347;padding:8px 10px;font-size:.8rem;font-weight:700;color:#2C3347}
.pcv-subtotal-row.main{margin-top:4px}
.pcv-grand{margin:6px 22px 0;background:#0B0F1A;border-top:2px solid #C9A96E;display:flex;justify-content:space-between;
  padding:12px 14px;font-size:.92rem;font-weight:800;color:#FAF8F4}
.pcv-grand span:last-child{color:#C9A96E;font-size:1.05rem}

.pcv-loc-box{margin:0 22px}
.pcv-loc-list{display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;font-size:.8rem;color:#0B0F1A;padding:10px 4px 0}
.pcv-loc-total{font-weight:700;color:#2C3347;font-size:.8rem;padding:8px 4px 4px}

.pcv-pay-table{margin:0 22px}
.pcv-pay-head{display:grid;grid-template-columns:1fr 1.6fr 60px 100px;gap:6px;background:#2C3347;color:#FAF8F4;
  font-size:.72rem;font-weight:700;padding:8px 10px;border-bottom:2px solid #C9A96E}
.pcv-pay-head .r{text-align:right}
.pcv-pay-row{display:grid;grid-template-columns:1fr 1.6fr 60px 100px;gap:6px;padding:8px 10px;font-size:.8rem;
  color:#0B0F1A;background:#F0ECE8;border-bottom:1px solid #ece8e0;align-items:center}
.pcv-pay-row.first{background:#fff8ee;border-left:3px solid #C9A96E}
.pcv-pay-row.first span:first-child{color:#8a6d2f;font-weight:700}
.pcv-waived-chip{display:inline-block;margin-left:8px;font-size:.6rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#fff;background:#1c8a45;border-radius:100px;padding:2px 8px;vertical-align:middle}
.pcv-waived-strike{color:#8a94ad;text-decoration:line-through;text-decoration-color:#1c8a45}
.pcv-pay-terms{margin:10px 22px 0;font-size:.78rem;color:#2a3050;font-weight:600;line-height:1.45;border-left:3px solid var(--gold,#b08f4f);padding-left:12px}
.pcv-pcp-box{margin:0 22px;border:1px solid #d8e6dd;background:#f4faf6;border-radius:14px;padding:16px 18px}
.pcv-pcp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
.pcv-pcp-title{font-size:.98rem;font-weight:800;color:#12331f}
.pcv-pcp-amt{color:#1c8a45;font-weight:800}
.pcv-pcp-sub{font-size:.8rem;color:#3a5346;margin-top:3px;line-height:1.45;max-width:460px}
.pcv-pcp-badge{flex-shrink:0;font-size:.68rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:4px 11px;border-radius:100px;white-space:nowrap}
.pcv-pcp-badge.pending{color:#7a4f00;background:#faf0da;border:1px solid #e5cf95}
.pcv-pcp-badge.ok{color:#fff;background:#1c8a45}
.pcv-pcp-terms{margin:12px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:5px}
.pcv-pcp-terms li{font-size:.79rem;color:#2a3f33;line-height:1.4}
.pcv-pcp-approve{margin-top:14px;background:#1c8a45!important;border-color:#1c8a45!important}
.pcv-pcp-approve:hover:not(:disabled){background:#166e37!important}
.pcv-pcp-agreed{margin-top:12px;font-size:.82rem;font-weight:700;color:#12331f;display:flex;flex-direction:column;gap:2px}
.pcv-pcp-agreed-note{font-size:.76rem;font-weight:500;color:#3a5346}
.pcv-pcp-void-target{align-self:flex-start;background:none;border:1px dashed transparent;border-radius:8px;padding:3px 7px;margin:-3px -7px;cursor:pointer;font-family:inherit;font-size:.82rem;font-weight:700;color:#12331f;transition:background .12s,border-color .12s}
.pcv-pcp-void-target:hover{background:#fbece7;border-color:#e2c9c1}
.pcv-void-confirm{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px;font-size:.72rem;color:#7a5f1f}
.pcv-void-yes{height:24px;padding:0 10px;border-radius:100px;border:none;background:#a8442f;color:#fff;font-size:.68rem;font-weight:800;cursor:pointer;font-family:inherit}
.pcv-void-no{height:24px;padding:0 10px;border-radius:100px;border:1px solid #d9d4ca;background:#fff;color:#4a4f5a;font-size:.68rem;font-weight:700;cursor:pointer;font-family:inherit}
.pcv-fineprint{margin:6px 22px 0;font-size:.7rem;color:#4a5270;font-style:italic}

.pcv-accept-box{margin:0 22px;background:#fff;border:1px solid #d9d4ca;border-top:2px solid #C9A96E;
  padding:14px;display:flex;flex-direction:column;gap:10px}
.pcv-accept-box p{margin:0;font-size:.8rem;color:#4a5270}
.pcv-accept-selected{font-size:.86rem;font-weight:700;color:#1d7a3a}
.pcv-select{height:44px;border:none;border-radius:9px;background:linear-gradient(180deg,#E8CB94,#C9A96E);
  color:#0B0F1A;font-size:.86rem;font-weight:800;cursor:pointer;font-family:inherit}
.pcv-select:hover{filter:brightness(1.03)}
.pcv-select:disabled{opacity:.5;cursor:default}
.pcv-select.outline{background:#fff;border:1.5px solid #1d7a3a;color:#1d7a3a}

.pcv-actions{margin:16px 22px 0;display:flex;gap:10px}
.pcv-actions-col{flex-direction:column;align-items:stretch}
.pcv-actions-row{display:flex;gap:10px}
.pcv-btn{height:38px;padding:0 16px;border-radius:9px;border:1px solid #d9d4ca;background:#fff;
  color:#0B0F1A;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.pcv-btn:hover{border-color:#C9A96E;color:#8a6d2f}
.pcv-btn.gold{background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;border:none}
.pcv-btn:disabled{opacity:.5;cursor:default}
.pcv-textarea{border:1px solid #d9d4ca;border-radius:9px;background:#fff;color:#0B0F1A;padding:10px 12px;
  font-size:.82rem;font-family:inherit;outline:none;resize:vertical}
.pcv-textarea:focus{border-color:#C9A96E}

.pcv-footer{margin-top:20px;background:#0B0F1A;border-top:2px solid #C9A96E;color:#9aa1af;
  font-size:.7rem;text-align:center;padding:12px 22px}

/* ---- Approve / Revise ---- */
.pcv-tb-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pcv-tb-btn{height:30px;padding:0 14px;border-radius:100px;font-size:.74rem;font-weight:800;cursor:pointer;font-family:inherit;border:1px solid #d9d4ca;background:#fff;color:#0B0F1A}
.pcv-tb-btn.revise:hover{border-color:#8a6d2f;color:#8a6d2f}
.pcv-tb-btn.revise.on{background:#2C3347;border-color:#2C3347;color:#fff}
.pcv-tb-btn.accept{background:#1d7a3a;border-color:#1d7a3a;color:#fff}
.pcv-tb-btn.accept:hover{filter:brightness(1.08)}
.pcv-tb-btn.accept.on{background:#0f5a28;border-color:#0f5a28}
.pcv-tb-btn.decline{background:#fff;border-color:#e0b0a8;color:#a8442f}
.pcv-tb-btn.decline:hover{background:#fbeceb;border-color:#a8442f}
.pcv-tb-btn.decline.on{background:#8c2f2f;border-color:#8c2f2f;color:#fff}
.pcv-tb-locked{height:30px;display:inline-flex;align-items:center;padding:0 14px;border-radius:100px;background:#E1F4E8;border:1px solid #bcd8c6;color:#1d7a3a;font-size:.74rem;font-weight:800}
.pcv-locked-note{display:block;margin-top:4px;font-size:.74rem;font-weight:500;color:#6f7686}
.pcv-opt-chk.dec{background:#fbeceb;color:#8c2f2f}
.pcv-accepted-line{display:block;font-size:.86rem;font-weight:700;color:#1d7a3a}
.pcv-sign-box{margin:0 22px;background:#fff;border:1px solid #d9d4ca;border-top:2px solid #C9A96E;
  padding:16px 18px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
.pcv-sign-mark{display:flex;flex-direction:column;gap:2px;min-width:220px;flex:1}
.pcv-sign-img{max-height:70px;max-width:280px;object-fit:contain;align-self:flex-start}
.pcv-sign-typed{font-size:1.7rem;color:#0B0F1A;font-family:"Segoe Script","Brush Script MT",cursive;padding-left:4px}
.pcv-sign-rule{border-bottom:1px solid #0B0F1A;height:1px;width:100%;margin-top:4px}
.pcv-sign-cap{font-size:.62rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#4a5270;margin-top:4px}
.pcv-sign-meta{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.pcv-sign-name{font-size:.9rem;font-weight:800;color:#0B0F1A}
.pcv-sign-date{font-size:.72rem;color:#6f7686}
.pcv-tb-btn:disabled{opacity:.5;cursor:default}
.pcv-confirm-strip{margin:0 22px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#eaf1ec;border:1px solid #bcd8c6;border-radius:9px;padding:10px 12px;font-size:.82rem;font-weight:600;color:#1d5a2e}
.pcv-revise-hint{margin:0 22px;background:#2C3347;color:#e8ddc4;border-radius:9px;padding:9px 13px;font-size:.78rem}
.pcv-revise-hint b{color:#fff}

.pcv-row-wrap{position:relative}
.pcv-row.revising{cursor:pointer}
.pcv-row.revising:hover{background:#F3E9D3}
.pcv-flagdot{color:#8a6d2f;font-size:.8rem;flex-shrink:0}
.pcv-row.flagged.flag-remove .pcv-rowdesc{color:#8c2f2f}
.pcv-row.flagged.flag-remove{background:#fbeceb}
.pcv-row.flagged.flag-change{background:#fdf5e3}
.pcv-flag-chip{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:100px;font-size:.64rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;vertical-align:middle;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pcv-flag-chip.remove{background:#8c2f2f;color:#fff}
.pcv-flag-chip.change{background:#C9A96E;color:#0B0F1A}

.pcv-linemenu{position:absolute;z-index:40;left:34px;top:calc(100% - 2px);width:min(300px,80vw);background:#fff;border:1px solid #cfc8ba;border-radius:11px;box-shadow:0 16px 44px rgba(11,15,26,.24);padding:12px;display:flex;flex-direction:column;gap:9px}
.pcv-linemenu-title{font-size:.78rem;font-weight:800;color:#0B0F1A}
.pcv-linemenu-note{border:1px solid #d9d4ca;border-radius:8px;background:#faf8f4;color:#0B0F1A;padding:8px 10px;font-size:.78rem;font-family:inherit;outline:none;resize:vertical}
.pcv-linemenu-note:focus{border-color:#C9A96E}
.pcv-linemenu-actions{display:flex;gap:7px;flex-wrap:wrap}
.pcv-lm-btn{height:32px;padding:0 12px;border-radius:8px;border:1px solid #d9d4ca;background:#fff;font-size:.75rem;font-weight:700;cursor:pointer;font-family:inherit;color:#0B0F1A}
.pcv-lm-btn.change{background:#C9A96E;border-color:#C9A96E;color:#0B0F1A}
.pcv-lm-btn.remove{background:#8c2f2f;border-color:#8c2f2f;color:#fff}
.pcv-lm-btn.clear{color:#6f7686}
.pcv-lm-btn:hover{filter:brightness(1.05)}
.pcv-linemenu-foot{font-size:.68rem;color:#8a8578;line-height:1.4}
/* Per-line request control — a quiet ✕ that files a request (never a real delete); flips to ↩ once set. */
.pcv-x{margin-left:auto;flex-shrink:0;width:22px;height:22px;border-radius:6px;border:1px solid #d9d4ca;background:#fff;color:#8c2f2f;font-size:.8rem;font-weight:800;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-family:inherit;transition:background .12s,border-color .12s}
.pcv-x:hover{background:#fbeceb;border-color:#8c2f2f}
.pcv-x.on{background:#C9A96E;border-color:#C9A96E;color:#0B0F1A}

.pcv-accept-actions{display:flex;gap:10px;flex-wrap:wrap}
.pcv-accept-actions .pcv-select{flex:1;min-width:200px}
.pcv-send-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.pcv-send-count{font-size:.82rem;font-weight:700;color:#2C3347;flex:1;min-width:150px}
.pcv-send-bar .pcv-select{height:40px;padding:0 18px}

.pcv-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:11000;background:#0B0F1A;color:#fff;font-size:.82rem;font-weight:700;padding:11px 20px;border-radius:100px;box-shadow:0 12px 34px rgba(0,0,0,.32);display:flex;align-items:center;gap:8px;animation:pcvToastIn .22s ease}
.pcv-toast svg{color:#5FB88A}
@keyframes pcvToastIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
`;

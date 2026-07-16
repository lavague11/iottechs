"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { stagesForType, stageLabel, stageShortLabel, STAGES, phasesForType, masterToPhaseKey, phaseStatusWord, phaseLabelOf, ROLES, COST_SAFE_VIEWS } from "../../../lib/spec";
import { cellFor } from "../../../lib/matrix";
import { resolveAccess, setStage, techAdvanceStageAction, updateProjectInfoAction, setCustomerPinAction, addAssignmentAction, removeAssignmentAction, submitWorkOrderAction, approveWorkOrderAction, rejectWorkOrderAction, updateWorkOrderNotesAction, getPreviewTokenAction, closeProjectAction, setAttentionAction, setRestrictedAction, setCommissionAction, submitExpenseAction, payExpenseAction, declineExpenseAction, submitRequestAction, approveRequestAction, rejectRequestAction, completeProjectAction, lockProjectAction, reactivateProjectAction, markAnnouncementSeenAction } from "./actions";
import { startPinCanvas } from "./gateway-pin-canvas";
import ConfirmDialog from "../../components/confirm-dialog";
import SiteSurveyWidget  from "./site-survey-widget";
import SchedulingWidget  from "./scheduling-widget";
import LeadInfoStep      from "./lead-info-step";
import InfoConfirmModal  from "./info-confirm-modal";
import MockupWidget      from "./mockup-widget";
import ProposalPanel     from "./proposal-panel";
import WorkOrderCard    from "./work-order-card";
import ApprovalPanel     from "./approval-panel";
import { AccordionProvider, useAccordionItem } from "./flow-accordion";
import AddressAutocomplete from "../../components/address-autocomplete";
import { ToolApproveBar, ToolSubmitButton, SmoothSailing, surveySatisfied, toolAccepted } from "./survey-approve";
import SurveyComments from "./survey-comments";
import TechProjectBoard  from "./tech-board";
import InstallChecklist  from "./install-checklist";
import InstallAddendum   from "./install-addendum";
import SystemQrTool      from "./system-qr-tool";
import QCChecklist       from "./qc-checklist";
import CompletionPanel   from "./completion-panel";
import CustomerTour from "./customer-tour";
import { customerPointer, customerAnnouncement } from "../../../lib/customer-action";
import PublishAnnounce from "./publish-announce";
import InquiryExtras     from "./inquiry-extras";
import ShipmentTracking from "./schedule-tracking-panel";
import { missingReqs }   from "../../../lib/stage-flow";
import { getAcceptancesAction, getLiveSnapshotAction } from "./proposal-actions";
// (loadApproval import removed — the old survey-signature requirement now lives in
// lib/stage-flow.js as the customer's stage_acceptances-backed check)

const money = (n) => "$" + (n || 0).toLocaleString();

// Required actions per stage you're moving INTO. `check` (when present) verifies against
// real project data; items without a check are reminders we can't auto-verify (e.g. signatures).
// The requirements matrix lives in lib/stage-flow.js (shared with the server's auto-advance) —
// each entry is tagged with WHOSE job it is (customer vs internal) so every role sees their
// own to-do list. Returns [{ label, who }].
const missingReqsFor = (stageKey, project, assignments) => missingReqs(stageKey, project, assignments);
const roleLabel = (k) => ROLES.find((r) => r.key === k)?.label || k;
function fmtDate(d) {
  if (!d) return "—";
  try { const dt = new Date(d + "T00:00:00"); return dt.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); } catch(_) { return d; }
}
function fmtPhone(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 10);
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 7)  return `${d.slice(0,3)}-${d.slice(3)}`;
  return v;
}
// vCard escaping per RFC 6350 — commas, semicolons, and backslashes need escaping so a comma
// in an address (e.g. "Bronx, NY") doesn't get parsed as a field separator.
const vEsc = (v) => String(v ?? "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");
// Build + trigger a vCard download. iOS Safari's native "Add Contact" sheet only reliably
// fires off a `data:` URI navigation — the blob-URL + <a download> pattern that works
// everywhere else just saves an inert file to Files on iPhone instead of prompting to add it.
function downloadVcard(lp) {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${vEsc(lp.customer)}`, `N:${vEsc(lp.customer)};;;;`, "ORG:IOT TECHS"];
  if (lp.contact_phone) lines.push(`TEL;TYPE=WORK,VOICE:${vEsc(lp.contact_phone)}`);
  if (lp.contact_email) lines.push(`EMAIL;TYPE=PREF,INTERNET:${vEsc(lp.contact_email)}`);
  if (lp.address) lines.push(`ADR;TYPE=WORK:;;${vEsc(lp.address)};;;;`);
  lines.push(`NOTE:Project ${vEsc(lp.access_id)}`, "END:VCARD");
  const vcard = lines.join("\r\n");
  const isIOS = typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent);
  if (isIOS) {
    window.location.href = "data:text/vcard;charset=utf-8," + encodeURIComponent(vcard);
    return;
  }
  const blob = new Blob([vcard], { type: "text/vcard" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(lp.customer || "contact").replace(/\s+/g, "_")}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}

const LOGIN_ROLES = ["admin", "manager", "sales", "tech", "customer"];
const BUCKET_LABELS = { OPEN: "Open", IN_PROGRESS: "In Progress", CLOSED: "Closed" };

// ---- Notification data — role-filtered ----
const NOTIF_CLR = { payment:"#5DB87A", request:"#E09A3A", ticket:"#E05A5A", payout:"#C9A96E", stage:"#5BC4D8", signature:"#7a5ea8" };
const NOTIFS = [
  // Admin + Manager
  { id:1,  type:"payment",   title:"Payment Received",            short:"Lakeshore Pharmacy · $9,800 deposit cleared.",           body:"Lakeshore Pharmacy — $9,800 deposit has cleared. Project is funded and ready for scheduling.",                                        time:"2h ago",    unread:true,  roles:["admin","manager"] },
  { id:2,  type:"request",   title:"Equipment Request",           short:"Marco requesting 2× cameras for ASC005X.",               body:"Marco Diaz is requesting 2× Hikvision DS-2CD2T47G2-I cameras for Riverside Auto Body (ASC005X). Est. $480. Approve or reject.",      time:"4h ago",    unread:true,  roles:["admin","manager"] },
  { id:3,  type:"ticket",    title:"Open Service Ticket",         short:"Bayview Diner — Cam 3 offline. Marco dispatched.",        body:"Bayview Diner: Camera 3 offline. Marco dispatched 2026-06-24. Awaiting resolution update.",                                          time:"6h ago",    unread:false, roles:["admin","manager","tech"] },
  { id:4,  type:"payout",    title:"Tech Payout Pending",         short:"Devon · $1,240 · 3 jobs pending release.",               body:"Devon completed 3 jobs this cycle. Total payout $1,240 pending admin release. Jobs: ASC005V, BSC003K, ASC0102.",                      time:"Yesterday", unread:false, roles:["admin"] },
  { id:5,  type:"stage",     title:"Project Advanced",            short:"Park Plaza Mall moved to Install — Devon.",              body:"Park Plaza Mall (BSC003K) advanced to Install by Devon. Scheduled install: 2026-06-30.",                                              time:"Yesterday", unread:false, roles:["admin","manager","sales"] },
  { id:6,  type:"signature", title:"Proposal Signed",             short:"Greenfield Storage signed all services.",                body:"Greenfield Storage (ASC00SV) has signed all three services. Deposit invoice has been issued automatically. Awaiting deposit.",          time:"3h ago",    unread:true,  roles:["admin","manager","sales"] },
  // Tech-specific
  { id:7,  type:"stage",     title:"Job Assigned",                short:"ASC005X — Riverside Auto Body. Install Jun 25.",         body:"New job assigned: Riverside Auto Body (ASC005X), 2503 Jay Pl, Bronx. Install date Jun 25. Check your schedule for the full work order.", time:"3h ago",   unread:true,  roles:["tech"] },
  { id:8,  type:"request",   title:"Equipment Request Approved",  short:"2× Hikvision cameras approved for ASC005X.",            body:"Your equipment request for 2× Hikvision DS-2CD2T47G2-I cameras (ASC005X) has been approved. Available at warehouse by Jun 24.",           time:"1h ago",    unread:true,  roles:["tech"] },
  { id:9,  type:"payout",    title:"Payout Released",             short:"$420 released for job ASC005X — Jun 18.",               body:"Your payout of $420 for job ASC005X (Bayview Diner) has been released and is being processed. Allow 1–2 business days.",                  time:"2 days ago",unread:false, roles:["tech"] },
  // Sales-specific
  { id:10, type:"signature", title:"Deal Won — Signatures In",    short:"Lakeshore Pharmacy signed + $4,900 deposited.",         body:"Lakeshore Pharmacy (ASC005X) signed the proposal and submitted a $4,900 deposit. Project is now in the active pipeline.",                time:"5h ago",    unread:true,  roles:["sales"] },
  { id:11, type:"stage",     title:"New Lead Assigned",           short:"Metro Dental — 4 cameras, $2,900 estimate.",            body:"New lead assigned: Metro Dental, 55 Center Blvd, Jersey City. Service: Security Cameras, 4 units. Estimated value $2,900. Contact Dr. Carlos Ruiz.", time:"1 day ago", unread:false, roles:["sales"] },
  // Customer-specific
  { id:12, type:"stage",     title:"Your Proposal is Ready",      short:"Review your Security Cameras proposal.",                body:"Your Security Cameras proposal is ready for review. Please log in, select your preferred option, sign per service, and submit your deposit to get started.", time:"4h ago",  unread:true,  roles:["customer"] },
  { id:13, type:"stage",     title:"Installation Scheduled",      short:"Your installation is confirmed for Jun 27.",            body:"Your installation is confirmed for Jun 27, 2026. Our technician will arrive between 9 AM and 12 PM. Please ensure access to the building and all entry points.", time:"2h ago", unread:false, roles:["customer"] },
  { id:14, type:"signature", title:"Signature Confirmed",         short:"Your proposal signature has been recorded.",            body:"We've recorded your signature for the Security Cameras service. Your deposit invoice is now available — please submit payment to proceed.", time:"1 day ago",unread:false, roles:["customer"] },
];

// ---- Approval items — scoped to project stage ----
const APPROVALS = [
  { id:1, type:"payment", label:"Final Payment",     detail:"Balance due · $4,900",           stages:["payment","qc"] },
  { id:2, type:"payout",  label:"Tech Payout",       detail:"Devon · $1,240 · 3 jobs",        stages:["payment","completion"] },
  { id:3, type:"request", label:"Equipment Request", detail:"2× cameras · Marco",             stages:["schedule","install"] },
  { id:4, type:"request", label:"Tool Request",      detail:"Conduit bender · Devon",         stages:["install"] },
  { id:5, type:"ticket",  label:"Open Ticket",       detail:"Cam 3 offline — unresolved",     stages:["install","qc","schedule"] },
];

// ---- Activity log — role-aware ----
// label = staff view. cl = customer-facing label (null = hidden from customer).
// roles = who sees this entry.
const ACTIVITY = [
  { type:"inquiry",   label:"Inquiry received via web form",                     cl:"Your inquiry was received",                    who:"Customer",  when:"May 28", roles:["admin","manager","sales","customer"] },
  { type:"assign",    label:"Lead assigned to sales pipeline",                   cl:null,                                           who:"Admin",     when:"May 28", roles:["admin","manager","sales"] },
  { type:"stage",     label:"Site survey scheduled",                             cl:"We scheduled a site visit",                    who:"Admin",     when:"May 30", roles:["admin","manager","sales","tech","customer"] },
  { type:"stage",     label:"Survey completed — photos and measures filed",      cl:null,                                           who:"Marco",     when:"Jun 2",  roles:["admin","manager","sales","tech"] },
  { type:"stage",     label:"Proposal built — $9,800 across 2 services",        cl:null,                                           who:"Sales",     when:"Jun 7",  roles:["admin","manager","sales"] },
  { type:"stage",     label:"Proposal sent to customer",                         cl:"Your proposal is ready to review",             who:"Admin",     when:"Jun 7",  roles:["admin","manager","sales","customer"] },
  { type:"signature", label:"Customer signed — Security Cameras",               cl:"You signed the Security Cameras proposal",     who:"Diana Chen",when:"Jun 9",  roles:["admin","manager","sales","customer"] },
  { type:"signature", label:"Customer signed — Alarm System",                   cl:"You signed the Alarm System proposal",         who:"Diana Chen",when:"Jun 9",  roles:["admin","manager","sales","customer"] },
  { type:"stage",     label:"Deposit received — $4,900",                        cl:"Your deposit has been confirmed",              who:"System",    when:"Jun 10", roles:["admin","manager","sales","customer"] },
  { type:"assign",    label:"Technician assigned — Devon",                      cl:null,                                           who:"Admin",     when:"Jun 12", roles:["admin","manager","tech"] },
  { type:"stage",     label:"Install date confirmed — Jun 27",                  cl:"Your installation is scheduled for Jun 27",   who:"Devon",     when:"Jun 14", roles:["admin","manager","tech","customer"] },
  { type:"note",      label:"Field note: customer prefers 9 AM–12 PM window",  cl:null,                                           who:"Devon",     when:"Jun 20", roles:["admin","manager","tech"] },
];
const ROLE_PILL = {
  admin:    { bg: "#C9A96E", fg: "#0B0F1A" },
  manager:  { bg: "#C9A96E", fg: "#0B0F1A" },
  customer: { bg: "#4b6a9b", fg: "#fff" },
  tech:     { bg: "#2f7d5a", fg: "#fff" },
  sales:    { bg: "#7a5ea8", fg: "#fff" },
  vendor:   { bg: "#2f7d5a", fg: "#fff" },
  readonly: { bg: "#6f7686", fg: "#fff" },
};

// Progress-bar tint per role — so the bar's color tells you at a glance whose view you're in
// (gold = office, blue = customer, green = tech, purple = sales). Same hues as the role pill.
// c = main, cd = deep (gradient/text), glow = translucent ring for the current node.
const ROLE_BAR = {
  admin:    { c: "#0B0F1A", cd: "#2C3347", glow: "rgba(11,15,26,.16)" },
  manager:  { c: "#C9A96E", cd: "#b08f4f", glow: "rgba(201,169,110,.18)" },
  customer: { c: "#4b6a9b", cd: "#37547e", glow: "rgba(75,106,155,.18)" },
  tech:     { c: "#2f7d5a", cd: "#245f45", glow: "rgba(47,125,90,.18)" },
  sales:    { c: "#7a5ea8", cd: "#5f4884", glow: "rgba(122,94,168,.18)" },
};

// ---- Notification bell ----
function NotificationBell({ view }) {
  const roleNotifs = NOTIFS.filter((n) => n.roles.includes(view || ""));
  const [panelOpen, setPanelOpen] = useState(false);
  const [expanded,  setExpanded]  = useState(null);
  const [items,     setItems]     = useState(roleNotifs);
  const unread = items.filter((n) => n.unread).length;

  function openItem(id) {
    setExpanded((p) => (p === id ? null : id));
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, unread: false } : n));
  }
  function markAllRead() { setItems((prev) => prev.map((n) => ({ ...n, unread: false }))); }

  return (
    <div className="nb-wrap">
      <button className="nb-btn" onClick={() => setPanelOpen((o) => !o)} aria-label="Notifications">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && <span className="nb-badge">{unread}</span>}
      </button>
      {panelOpen && (
        <>
          <div className="nb-backdrop" onClick={() => setPanelOpen(false)} />
          <div className="nb-panel">
            <div className="nb-hd">
              <span className="nb-hd-title">Notifications</span>
              {unread > 0 && <button className="nb-mark-all" onClick={markAllRead}>Mark all read</button>}
              <button className="nb-x" onClick={() => setPanelOpen(false)}>✕</button>
            </div>
            <div className="nb-list">
              {items.map((n) => (
                <div key={n.id} className={`nb-item${n.unread ? " nb-unread" : ""}${expanded === n.id ? " nb-open" : ""}`} onClick={() => openItem(n.id)}>
                  <div className="nb-row">
                    <span className="nb-dot" style={{ background: NOTIF_CLR[n.type] || "#6f7686" }} />
                    <div className="nb-text">
                      <div className="nb-title">{n.title}</div>
                      <div className="nb-short">{n.short}</div>
                    </div>
                    <span className="nb-time">{n.time}</span>
                  </div>
                  {expanded === n.id && <div className="nb-body">{n.body}</div>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Inline project header ----
function ProjectHeader({ accessId, view, onReAuth, onViewChange, previewRole = null, onPreviewRole, viewingStageRef = null }) {
  const [open, setOpen] = useState(false);
  // The pill reflects the REAL login role, always. The eye-icon "preview" is a read-only overlay,
  // not a view change, so it must NOT relabel this pill (that was the old confusion — the pill said
  // CUSTOMER VIEW during a mere preview). Switching this pill's role is the real "view as" action.
  const effView = view;
  const col = effView ? ROLE_PILL[effView] : null;

  // Which roles show in the dropdown (null = plain lock pill, [] = dropdown with only Lock)
  const dropRoles =
    view === "admin"    ? LOGIN_ROLES :
    view === "manager"  ? LOGIN_ROLES.filter((r) => r !== "admin") :
    view === "sales"    ? ["customer"] :
    view === "customer" ? [] :
    null;

  async function pickView(role) {
    setOpen(false);
    // Selecting your own login role clears any active in-place preview.
    if (role === view) { if (previewRole && onPreviewRole) onPreviewRole(null); return; }
    // Every other role — customer, tech, or a peer/higher staff role — opens a REAL signed session in
    // a new tab: you "view AS that role," fully controllable, as if you'd logged in as them (no PIN
    // re-entry). This is deliberately different from the eye-icon "preview" menu, which is a
    // read-only, in-place peek you can't control. Two distinct things.
    const token = await getPreviewTokenAction(accessId, role);
    // Carry the step you're currently looking at into the new role's tab (so it lands on the
    // SAME stage, not that role's default). The target seeds viewingStage from ?stage=.
    const stage = viewingStageRef?.current;
    const qs = `preview=${role}&pt=${token}${stage ? `&stage=${encodeURIComponent(stage)}` : ""}`;
    window.open(`/project/${accessId}?${qs}`, "_blank");
  }

  const pillStyle = col ? { background: col.bg, color: col.fg, borderColor: col.bg } : {};

  // Role home — "Dashboard" button routes each staff role back to their portal.
  const HOME = { admin: "/dashboard", manager: "/manager", sales: "/sales", tech: "/tech" };
  const homeHref = HOME[view];

  return (
    <header className="masthead">
      <div className="masthead-inner">
        <Link href={homeHref || "/"} className="brand-link">
          <span className="brand-text">IOT <b>TECHS</b></span>
        </Link>
        <div className="doc-controls">
          {homeHref && (
            <Link href={homeHref} className="doc-pill doc-pill-dash" title="Back to dashboard">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:5}}>
                <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
              </svg>
              Dashboard
            </Link>
          )}
          <NotificationBell key={view} view={view} />

          {dropRoles ? (
            <div className="doc-pill-wrap">
              <button className="doc-pill doc-pill-btn" style={pillStyle} onClick={() => setOpen((o) => !o)}>
                {roleLabel(effView).toUpperCase()} VIEW
                <svg viewBox="0 0 10 6" width="9" height="9" fill="currentColor" style={{marginLeft:5,opacity:.7,transform:open?"rotate(180deg)":"none",transition:"transform .18s"}}>
                  <path d="M0 0l5 6 5-6z"/>
                </svg>
              </button>
              {open && (
                <>
                  <div className="doc-pill-backdrop" onClick={() => setOpen(false)} />
                  <div className="doc-pill-dd">
                    {dropRoles.map((r) => {
                      const c = ROLE_PILL[r];
                      const isCurrent = r === effView;
                      return (
                        <button key={r} className={`doc-pill-opt${isCurrent ? " active" : ""}`} onClick={() => pickView(r)}>
                          <span className="doc-pill-dot" style={{background: c?.bg || "#6f7686"}} />
                          {roleLabel(r)}
                          {!isCurrent && <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{marginLeft:"auto",opacity:.4}}><path d="M5 2H2v8h8V7"/><path d="M7 2h3v3"/><path d="M5 7l5-5"/></svg>}
                        </button>
                      );
                    })}
                    <div className="doc-pill-sep" />
                    <button className="doc-pill-opt doc-pill-lock-opt" onClick={() => { setOpen(false); onReAuth(); }}>
                      <span className="doc-pill-dot doc-pill-dot-lock" />
                      Lock
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button className="doc-pill doc-pill-btn" style={pillStyle} onClick={onReAuth} title="Lock — return to PIN screen">
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:5,opacity:.75}}>
                <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
              </svg>
              {view ? `${roleLabel(view).toUpperCase()} VIEW` : "SECURE LINK"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}


// ---- One step in a stage's numbered tool flow ----
// A rail bubble (✓ when done, else the step number) beside the tool card, so a stage's tools read
// as a guided 1-2-3 rhythm anyone can follow: done → collapsed check, active → open with a "Your
// next step" glow, upcoming → dimmed & collapsed. Re-flows automatically as steps complete.
// status: "done" (✓, collapsed) · "active" (open, glow, "Your next step") · "upcoming" (dimmed,
//   collapsed) · "open" (neutral numbered, available, no glow/dim — for work steps with no clean
//   completion signal). `bare` wraps a self-contained child card (install/inquiry tools that render
//   their own header) — just the numbered rail, no FlowStep header or collapse.
function FlowStep({ n, total, status, color, icon, title, sub, chip, headerAction, bare, completable, canComplete = true, cantHint, autoComplete, flowKey, children }) {
  const expandedByDefault = (s) => s === "active" || s === "open";   // current + available work expand; done/upcoming collapse
  const [localOpen, setLocalOpen] = useState(expandedByDefault(status));
  useEffect(() => { setLocalOpen(expandedByDefault(status)); }, [status]);   // re-flow when status changes (all still toggleable)
  const [marked, setMarked] = useState(false);   // manual "mark as complete" — shades the header
  // Auto-complete: some tools finish on a real-world signal (a package marked Delivered) rather than
  // a click. Fires when the signal flips true; the user can still Reopen (the dep won't re-fire).
  useEffect(() => { if (autoComplete) setMarked(true); }, [autoComplete]);
  const shaded = marked || status === "done";
  // Accordion: when this tool sits inside an <AccordionProvider>, exactly one tool is open at a time
  // and completing one opens the next. Falls back to local open state when there's no provider.
  const acc = useAccordionItem(flowKey || title, shaded);
  const open = acc ? acc.open : localOpen;
  const toggleOpen = () => { if (acc) acc.toggle(); else setLocalOpen((v) => !v); };
  const closeSelf = () => { if (acc) acc.complete(); else setLocalOpen(false); };   // done → hand off to next
  const tick = <span className="pv-tool-icon done"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>;
  // Footer at the bottom of an expanded tool — mark it complete (shades the header = done & ready to
  // publish) or reopen it. Only on tools that opt in via `completable`.
  const footer = completable ? (
    <div className="flow-complete-row">
      {marked ? (
        <button type="button" className="flow-reopen" onClick={() => setMarked(false)}>↺ Reopen</button>
      ) : canComplete ? (
        <button type="button" className="flow-complete-btn" onClick={() => { setMarked(true); closeSelf(); }}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Mark as complete
        </button>
      ) : (
        <span className="flow-cant" title={cantHint || ""}>{cantHint || "Not ready to complete"}</span>
      )}
    </div>
  ) : null;

  if (bare && title) {
    return (
      <div className={`flow-step ${status}${shaded ? " shaded" : ""}`} style={{ "--tool-c": color }}>
        <div className="flow-card flow-bare">
          <div className="flow-bare-head">
            <button type="button" className="flow-bare-toggle" onClick={toggleOpen}>
              {shaded ? tick : (icon && <span className="pv-tool-icon">{icon}</span>)}
              <span className="pv-tool-title">{title}</span>
              {shaded ? <span className="pv-tool-sub done">Complete</span> : (sub && <span className="pv-tool-sub">{sub}</span>)}
              {status === "active" && !shaded && <span className="flow-next-tag">Your next step</span>}
              {chip}
            </button>
            {headerAction}
            <button type="button" className="flow-bare-chev" onClick={toggleOpen}>{open ? "▲" : "▼"}</button>
          </div>
          {open && <div className="flow-bare-body">{children}{footer}</div>}
        </div>
      </div>
    );
  }
  if (bare) {   // title-less bare — just the child (backward-compatible)
    return (
      <div className={`flow-step ${status}`} style={{ "--tool-c": color }}>
        <div className="flow-card flow-bare">{children}</div>
      </div>
    );
  }
  return (
    <div className={`flow-step ${status}${shaded ? " shaded" : ""}`} style={{ "--tool-c": color }}>
      <div className="flow-card pv-tool-panel">
        <div className="pv-tool-head">
          <button type="button" className="pv-tool-toggle" onClick={toggleOpen}>
            {shaded ? tick : <span className="pv-tool-icon">{icon}</span>}
            <span className="pv-tool-title">{title}</span>
            {shaded ? <span className="pv-tool-sub done">Complete</span> : <span className="pv-tool-sub">{sub}</span>}
            {status === "active" && !shaded && <span className="flow-next-tag">Your next step</span>}
            {chip}
          </button>
          {headerAction}
          <button type="button" className="pv-tool-chev-btn" onClick={toggleOpen}>{open ? "▲" : "▼"}</button>
        </div>
        {open && <div className="pv-tool-body">{children}{footer}</div>}
      </div>
    </div>
  );
}

// ---- Progress bar ----
function ProgressBar({ type, projectStage, viewingStage, onBrowse, canControl, onJump, busy,
                       toast, setToast, stages: stagesProp, missingFor, role, techSigned, custApproved, pctOverride, justDone,
                       advanceInline = false }) {

  let stages = stagesProp || stagesForType(type);
  if (!stagesProp && !stages.some((s) => s.key === projectStage)) stages = STAGES;
  const rbar = ROLE_BAR[role] || ROLE_BAR.admin;   // bar tint follows the effective role

  const projectIdx  = stages.findIndex((s) => s.key === projectStage);
  // The connecting-line fill tracks the current dot; the % label can be overridden with an honest
  // master-lifecycle figure (condensed customer bar), else it derives from the dot position.
  const fillPct     = pctOverride != null ? pctOverride : Math.max(10, (projectIdx / (stages.length - 1)) * 100);
  const trackFillPct = projectStage === "completion"
    ? 100
    : stages.length > 1
      ? Math.min(((projectIdx + 0.5) / (stages.length - 1)) * 100, 100)
      : 0;

  const pbarRef = useRef(null);
  useEffect(() => {
    const bar = pbarRef.current;
    if (!bar) return;
    const current = bar.querySelector(".pstage.current");
    if (!current) return;
    // center the current step in the scroll container (mobile snap)
    const barW = bar.offsetWidth;
    const left = current.offsetLeft + current.offsetWidth / 2 - barW / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: "instant" });
  }, [projectStage]);

  function handleClick(s, canBrowse, canConfirm) {
    if (canBrowse) { onBrowse(s.key); setToast(null); return; }
    if (canConfirm) { setToast({ stageKey: s.key, label: s.label }); }
  }

  function confirmJump() {
    if (toast) { onJump(toast.stageKey); setToast(null); }
  }

  return (
    <>
      <div className="pbar-wrap" style={{ "--role-c": rbar.c, "--role-cd": rbar.cd, "--role-glow": rbar.glow }}>
        <div className="pbar" ref={pbarRef} style={{ "--stage-count": stages.length }}>
          <div className="pbar-track">
            <div className="pbar-fill" style={{ width: `${trackFillPct}%` }} />
          </div>
          {stages.map((s, i) => {
            const isDone    = i < projectIdx;
            const isCurrent = i === projectIdx;
            const isFuture  = i > projectIdx;
            // first click = browse (anything not already being viewed)
            // second click = confirm (admin viewing a non-current stage)
            const isViewing  = s.key === viewingStage;
            const canBrowse  = !isViewing;
            const canConfirm = canControl && isViewing && s.key !== projectStage;
            const isClickable = canBrowse || canConfirm;
            return (
              <button
                type="button"
                key={s.key}
                className={["pstage", isDone?"done":"", isCurrent?"current":"", isFuture?"future":"",
                  (isViewing && s.key !== projectStage)?"viewing":"", isClickable?"clickable":"",
                  (justDone && s.key === justDone)?"just-done":""].filter(Boolean).join(" ")}
                disabled={(!isClickable || busy)}
                onClick={isClickable ? () => handleClick(s, canBrowse, canConfirm) : undefined}
                title={canConfirm ? `Set step to ${s.label}` : canBrowse ? `View ${s.label}` : s.label}
              >
                <span className="pstage-num">{isDone ? "✓" : i + 1}</span>
                <span className="plabel">{s.short || s.label}</span>
              </button>
            );
          })}
        </div>
        <div className="pbar-pct-row">
          <div className="pbar-pct-bar" style={{ width: `${fillPct}%` }} />
          <span className="pbar-pct-label">
            <b>{Math.round(fillPct)}%</b> complete
            {projectIdx >= 0 && projectIdx < stages.length - 1 && (
              // Use the current step's own label from the (possibly condensed) bar — stageShortLabel
              // only knows master keys, so a phase key like "cx_install" would render raw.
              <span className="pbar-pct-cur"> · {stages[projectIdx]?.short || stages[projectIdx]?.label || stageShortLabel(projectStage)}</span>
            )}
          </span>
        </div>

        {/* Next-step CTA now lives at the bottom of the tool list (<StageAdvance/>), not under the
            progress bar. Kept here only if a caller opts back in via advanceInline. */}
        {advanceInline && (
          <StageAdvance role={role} busy={busy} techSigned={techSigned} custApproved={custApproved}
            missingFor={missingFor} projectStage={projectStage} stages={stages} canControl={canControl}
            onBrowse={onBrowse} onJump={onJump} />
        )}

        {(() => {
          const miss = toast && missingFor ? missingFor(toast.stageKey) : [];
          return (
            <div className={`stage-expand${toast ? " open" : ""}`}>
              <div className="stage-expand-inner">
                <span className="stage-toast-icon">⬡</span>
                <span className="stage-toast-msg">Set step to <b>{toast?.label}</b>?</span>
                <button className="stage-toast-confirm" onClick={confirmJump}>{miss.length ? "Set Anyway" : "Set Step"}</button>
                <button className="stage-toast-cancel" onClick={() => setToast(null)}>Cancel</button>
              </div>
              {miss.length > 0 && (
                <div className="stage-toast-missing">
                  <span className="stm-label">Still incomplete:</span> {miss.map((m) => m.label || m).join(" · ")}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </>
  );
}


// The stage's "next step" call-to-action — lives at the BOTTOM of the tool list (below the last
// tool card) instead of under the progress bar. Tells each role what's outstanding and advances
// once the stage is clear. Same look/logic as the old in-bar strip, just relocated.
function StageAdvance({ role, busy, techSigned, custApproved, missingFor, projectStage, stages, canControl, onBrowse, onJump }) {
  const projectIdx = stages.findIndex((s) => s.key === projectStage);
  if (role === "tech") {
    if (!techSigned) {
      return (
        <button type="button" className="pbar-advance todo bottom" disabled={busy} onClick={() => onBrowse("proposal")}>
          <span className="pba-check todo">!</span>
          <span className="pba-msg"><b>Next step:</b> Accept the work order <span className="pba-req">(required)</span></span>
          <span className="pba-arrow">→</span>
        </button>
      );
    }
    if (!custApproved) {
      return (
        <div className="pbar-advance wait bottom">
          <span className="pba-check wait"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
          <span className="pba-msg"><b>Customer has not approved yet</b> — you'll be notified the moment they sign.</span>
        </div>
      );
    }
    const nextT = projectIdx >= 0 && projectIdx < stages.length - 1 ? stages[projectIdx + 1] : null;
    return (
      <button type="button" className="pbar-advance bottom" disabled={busy} onClick={() => onBrowse(nextT ? nextT.key : projectStage)}>
        <span className="pba-check">✓</span>
        <span className="pba-msg"><b>Work order accepted.</b> Go on to the next step</span>
        <span className="pba-arrow">→</span>
      </button>
    );
  }
  // Customer's next step is carried by their hero action card — don't double up.
  if (!missingFor || !["admin", "manager", "sales"].includes(role)) return null;
  const remaining = missingFor(projectStage) || [];   // [{ label, who }]
  const mine   = remaining.filter((r) => r.who !== "customer");
  const theirs = remaining.filter((r) => r.who === "customer");
  if (mine.length) {
    return (
      <button type="button" className="pbar-advance todo bottom" disabled={busy}
              onClick={() => onBrowse(projectStage)}
              title={mine.length > 1 ? `Also: ${mine.slice(1).map((m) => m.label).join(" · ")}` : undefined}>
        <span className="pba-check todo">!</span>
        <span className="pba-msg"><b>Next step:</b> {mine[0].label} <span className="pba-req">(required)</span>{mine.length > 1 ? ` +${mine.length - 1} more` : ""}</span>
        <span className="pba-arrow">→</span>
      </button>
    );
  }
  if (theirs.length) {
    return (
      <button type="button" className="pbar-advance wait bottom" disabled={busy} onClick={() => onBrowse(projectStage)}>
        <span className="pba-check wait">⏳</span>
        <span className="pba-msg"><b>Awaiting customer</b> — {theirs[0].label}{theirs.length > 1 ? ` +${theirs.length - 1} more` : ""}</span>
      </button>
    );
  }
  if (!canControl) return null;   // all clear — customers just watch it advance
  const nextStage = projectIdx >= 0 && projectIdx < stages.length - 1 ? stages[projectIdx + 1] : null;
  if (!nextStage) {
    return (
      <div className="pbar-advance done bottom">
        <span className="pba-check">✓</span>
        <span className="pba-msg"><b>All steps complete.</b> This project is finished.</span>
      </div>
    );
  }
  return (
    <button type="button" className="pbar-advance bottom" disabled={busy} onClick={() => onJump(nextStage.key)}>
      <span className="pba-check">✓</span>
      <span className="pba-msg"><b>{stageShortLabel(projectStage)} complete.</b> Continue to {nextStage.short || nextStage.label}</span>
      <span className="pba-arrow">→</span>
    </button>
  );
}


// ---- Work order approval queue (admin/manager) + tech submit form ----
function WorkOrderPanel({ accessId, workOrders, view }) {
  const [items, setItems]       = useState(workOrders);
  const [woNotes, setWoNotes]   = useState("");
  const [submitting, setSub]    = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [rejectId, setRejectId]   = useState(null);
  const [rejectMsg, setRejectMsg] = useState("");
  const [modifyId, setModifyId]   = useState(null);
  const [modifyNotes, setModifyNotes] = useState("");

  const pending  = items.filter(w => w.status === "pending");
  const resolved = items.filter(w => w.status !== "pending");
  const canApprove = view === "admin" || view === "manager";
  const canSubmit  = view === "tech";

  async function handleApprove(id) {
    const r = await approveWorkOrderAction(accessId, id);
    if (r.ok) setItems(prev => prev.map(w => w.id === id ? {...w, status:"approved"} : w));
  }
  async function handleReject(id) {
    const r = await rejectWorkOrderAction(accessId, id, rejectMsg);
    if (r.ok) { setItems(prev => prev.map(w => w.id === id ? {...w, status:"rejected", review_notes:rejectMsg} : w)); setRejectId(null); setRejectMsg(""); }
  }
  function startModify(w) { setModifyId(w.id); setModifyNotes(w.notes || ""); setRejectId(null); }
  async function handleModify(id) {
    const r = await updateWorkOrderNotesAction(accessId, id, modifyNotes);
    if (r.ok) { setItems(prev => prev.map(w => w.id === id ? {...w, notes: modifyNotes} : w)); setModifyId(null); }
  }
  async function handleSubmit() {
    setSub(true);
    const r = await submitWorkOrderAction(accessId, { notes: woNotes });
    if (r.ok) { setItems(prev => [{id:r.id, project_access_id:accessId, notes:woNotes, status:"pending", submitted_by_name:"You", submitted_at:"just now"}, ...prev]); setWoNotes(""); setShowForm(false); }
    setSub(false);
  }

  if (!canApprove && !canSubmit) return null;
  // Render only when real (DoD #5): approvers (admin/manager) don't see an empty "No work
  // orders" shell — the panel appears the moment a tech submits one. Techs still see it so
  // they have the Submit affordance.
  if (canApprove && items.length === 0) return null;

  return (
    <div className="wo-panel">
      <div className="wo-panel-head">
        <span className="wo-panel-title">Work Orders {pending.length > 0 && <span className="wo-panel-badge">{pending.length} pending</span>}</span>
        {canSubmit && <button className="wo-submit-btn" onClick={() => setShowForm(v => !v)}>{showForm ? "Cancel" : "+ Submit Work Order"}</button>}
      </div>

      {canSubmit && showForm && (
        <div className="wo-form">
          <textarea className="wo-textarea" rows={3} placeholder="Describe the work completed, any issues, materials used…" value={woNotes} onChange={e => setWoNotes(e.target.value)} />
          <button className="wo-form-submit" disabled={submitting || !woNotes.trim()} onClick={handleSubmit}>{submitting ? "Submitting…" : "Submit for Approval"}</button>
        </div>
      )}

      {pending.length === 0 && resolved.length === 0 && (
        <div className="wo-empty">{canSubmit ? "No work orders submitted yet." : "No work orders for this project."}</div>
      )}

      {pending.map(w => (
        <div key={w.id} className="wo-item wo-pending">
          <div className="wo-item-top">
            <span className="wo-item-badge pending">Pending Review</span>
            <span className="wo-item-who">{w.submitted_by_name || "Tech"} · {w.submitted_at?.slice(0,16) || "—"}</span>
          </div>
          {w.notes && <div className="wo-item-notes">{w.notes}</div>}
          {canApprove && modifyId === w.id ? (
            <div className="wo-modify-form">
              <textarea className="wo-textarea" rows={3} value={modifyNotes} onChange={e=>setModifyNotes(e.target.value)} />
              <div className="wo-modify-btns">
                <button className="wo-btn-approve" onClick={() => handleModify(w.id)}>Save Changes</button>
                <button className="wo-btn-cancel" onClick={() => setModifyId(null)}>Cancel</button>
              </div>
            </div>
          ) : canApprove && rejectId === w.id ? (
            <div className="wo-reject-form">
              <input className="wo-reject-input" placeholder="Reason for rejection (optional)" value={rejectMsg} onChange={e=>setRejectMsg(e.target.value)} />
              <button className="wo-btn-reject" onClick={() => handleReject(w.id)}>Confirm Reject</button>
              <button className="wo-btn-cancel" onClick={() => setRejectId(null)}>Cancel</button>
            </div>
          ) : canApprove && (
            <div className="wo-item-actions">
              <button className="wo-btn-approve" onClick={() => handleApprove(w.id)}>✓ Approve</button>
              <button className="wo-btn-modify" onClick={() => startModify(w)}>✎ Modify</button>
              <button className="wo-btn-reject" onClick={() => setRejectId(w.id)}>✕ Reject</button>
            </div>
          )}
        </div>
      ))}

      {resolved.map(w => (
        <div key={w.id} className={`wo-item wo-${w.status}`}>
          <div className="wo-item-top">
            <span className={`wo-item-badge ${w.status}`}>{w.status === "approved" ? "✓ Approved" : "✕ Rejected"}</span>
            <span className="wo-item-who">{w.submitted_by_name || "Tech"} · {w.submitted_at?.slice(0,10) || "—"}</span>
          </div>
          {w.notes && <div className="wo-item-notes">{w.notes}</div>}
          {w.review_notes && <div className="wo-item-review-note">Note: {w.review_notes}</div>}
          <div className="wo-item-reviewer">Reviewed by {w.reviewed_by_name || "Admin"}</div>
        </div>
      ))}
    </div>
  );
}

// ---- Expense Panel ----
const EXP_CATS    = ["Gas","Tools","Meals","Other"];
const PAY_METHODS = ["Cash","Check","Card","Zelle","ACH","Wire","Other"];

const normExpStatus = (s) => s === "approved" ? "paid" : s === "rejected" ? "declined" : (s || "pending");

function ExpenseStatusControl({ accessId, expense, onUpdate }) {
  const [sel, setSel]       = useState(normExpStatus(expense.status));
  const [reason, setReason] = useState(expense.review_notes || "");
  const [payDate, setPayDate] = useState(expense.payment_date || "");
  const [payMethod, setPayMethod] = useState(expense.payment_method || "Cash");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    let r;
    if (sel === "paid")     r = await payExpenseAction(accessId, expense.id, { paymentDate: payDate, paymentMethod: payMethod });
    else if (sel === "declined") r = await declineExpenseAction(accessId, expense.id, reason);
    else r = { ok: true };
    if (r?.ok) onUpdate(expense.id, sel, { review_notes: reason, payment_date: payDate, payment_method: payMethod });
    setSaving(false);
  }

  const changed = sel !== (expense.status || "pending");

  return (
    <div className="exp-status-ctrl">
      <select className="exp-status-sel" value={sel} data-status={sel} onChange={e => setSel(e.target.value)}>
        <option value="pending">Pending</option>
        <option value="paid">Paid</option>
        <option value="declined">Declined</option>
      </select>
      {sel === "declined" && (
        <input className="wo-input exp-reason" placeholder="Reason for declining…" value={reason} onChange={e => setReason(e.target.value)} />
      )}
      {sel === "paid" && (
        <div className="exp-pay-fields">
          <input className="wo-input" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
          <select className="wo-select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
            {PAY_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
      )}
      {changed && <button className="exp-save-btn" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>}
    </div>
  );
}

function ExpensePanel({ accessId, expenses: init, view, startOpen }) {
  const [items, setItems] = useState(init);
  const [showForm, setShowForm] = useState(!!startOpen);
  const [form, setForm] = useState({ description:"", category:"Gas", customCat:"", amount:"", vendor:"" });
  const [saving, setSaving] = useState(false);

  const canSubmit  = ["tech","admin","manager"].includes(view);
  const canApprove = view === "admin" || view === "manager";
  const pending    = items.filter(e => e.status === "pending");
  const resolved   = items.filter(e => e.status !== "pending");

  function handleUpdate(id, status, fields) {
    setItems(prev => prev.map(e => e.id === id ? { ...e, status, ...fields } : e));
  }

  async function handleSubmit() {
    if (!form.description.trim() || !form.amount) return;
    const category = form.category === "Other" && form.customCat.trim() ? form.customCat.trim() : form.category;
    const payload = { description: form.description, category, amount: form.amount, vendor: form.vendor };
    setSaving(true);
    const r = await submitExpenseAction(accessId, payload);
    if (r.ok) {
      setItems(prev => [{ id:r.id, ...payload, amount:Number(payload.amount), status:"pending", submitted_by_name:"You", created_at:"just now" }, ...prev]);
      setForm({ description:"", category:"Gas", customCat:"", amount:"", vendor:"" });
      setShowForm(false);
    }
    setSaving(false);
  }

  if (!canSubmit && !canApprove) return null;
  return (
    <div className="wo-panel">
      <div className="wo-panel-head">
        <span className="wo-panel-title">Expenses {pending.length > 0 && <span className="wo-panel-badge">{pending.length} pending</span>}</span>
        {canSubmit && <button className="wo-submit-btn" onClick={() => setShowForm(v => !v)}>{showForm ? "Cancel" : "+ Submit Expense"}</button>}
      </div>
      {canSubmit && showForm && (
        <div className="wo-form">
          <input className="wo-input" placeholder="Description *" value={form.description} onChange={e => setForm(p=>({...p, description:e.target.value}))} />
          <div className="wo-presets">
            {EXP_CATS.map(c => (
              <button key={c} type="button" className={`wo-preset${form.category===c?" on":""}`} onClick={()=>setForm(p=>({...p, category:c}))}>{c}</button>
            ))}
          </div>
          {form.category === "Other" && (
            <input className="wo-input" placeholder="Custom category" value={form.customCat} onChange={e => setForm(p=>({...p, customCat:e.target.value}))} />
          )}
          <input className="wo-input wo-amount" type="number" min="0" placeholder="Amount ($) *" value={form.amount} onChange={e => setForm(p=>({...p, amount:e.target.value}))} />
          <input className="wo-input" placeholder="Vendor (optional)" value={form.vendor} onChange={e => setForm(p=>({...p, vendor:e.target.value}))} />
          <button className="wo-form-submit" disabled={saving || !form.description.trim() || !form.amount} onClick={handleSubmit}>{saving ? "Submitting…" : "Submit for Approval"}</button>
        </div>
      )}
      {pending.length === 0 && resolved.length === 0 && <div className="wo-empty">{canSubmit ? "No expenses submitted yet." : "No expenses for this project."}</div>}
      {[...pending, ...resolved].map(e => (
        <div key={e.id} className={`wo-item wo-${normExpStatus(e.status) === "paid" ? "approved" : normExpStatus(e.status) === "declined" ? "rejected" : "pending"}`}>
          <div className="wo-item-top">
            <span className="wo-item-who">{e.submitted_by_name || "Tech"} · {e.created_at?.slice(0,10) || "—"}</span>
          </div>
          <div className="wo-item-notes">
            <strong>{e.category}</strong> — {e.description}{e.vendor ? ` · ${e.vendor}` : ""}
            <span className="wo-amount-tag">${Number(e.amount||0).toLocaleString()}</span>
          </div>
          {e.status === "paid" && e.payment_date && <div className="wo-item-reviewer">Paid {e.payment_date}{e.payment_method ? ` · ${e.payment_method}` : ""}</div>}
          {e.status === "declined" && e.review_notes && <div className="wo-item-review-note">Reason: {e.review_notes}</div>}
          {canApprove && <ExpenseStatusControl accessId={accessId} expense={e} onUpdate={handleUpdate} />}
        </div>
      ))}
    </div>
  );
}

// ---- Request Panel ----
const REQ_TYPES = ["Tools","Equipment","Other"];
function RequestPanel({ accessId, requests: init, view, startOpen }) {
  const [items, setItems] = useState(init);
  const [showForm, setShowForm] = useState(!!startOpen);
  const [form, setForm] = useState({ requestType:"Tools", customType:"", description:"", notes:"" });
  const [saving, setSaving] = useState(false);
  const [rejectId, setRejectId] = useState(null);
  const [rejectMsg, setRejectMsg] = useState("");

  const canSubmit  = ["tech","admin","manager"].includes(view);
  const canApprove = view === "admin" || view === "manager";
  const pending    = items.filter(r => r.status === "pending");
  const resolved   = items.filter(r => r.status !== "pending");

  async function handleSubmit() {
    if (!form.description.trim()) return;
    const requestType = form.requestType === "Other" && form.customType.trim() ? form.customType.trim() : form.requestType;
    const payload = { requestType, description: form.description, notes: form.notes };
    setSaving(true);
    const r = await submitRequestAction(accessId, payload);
    if (r.ok) {
      setItems(prev => [{ id:r.id, ...payload, status:"pending", submitted_by_name:"You", created_at:"just now" }, ...prev]);
      setForm({ requestType:"Tools", customType:"", description:"", notes:"" });
      setShowForm(false);
    }
    setSaving(false);
  }
  async function handleApprove(id) {
    const r = await approveRequestAction(accessId, id);
    if (r.ok) setItems(prev => prev.map(req => req.id===id ? {...req, status:"approved"} : req));
  }
  async function handleReject(id) {
    const r = await rejectRequestAction(accessId, id, rejectMsg);
    if (r.ok) { setItems(prev => prev.map(req => req.id===id ? {...req, status:"rejected", review_notes:rejectMsg} : req)); setRejectId(null); setRejectMsg(""); }
  }

  if (!canSubmit && !canApprove) return null;
  return (
    <div className="wo-panel">
      <div className="wo-panel-head">
        <span className="wo-panel-title">Requests {pending.length > 0 && <span className="wo-panel-badge">{pending.length} pending</span>}</span>
        {canSubmit && <button className="wo-submit-btn" onClick={() => setShowForm(v => !v)}>{showForm ? "Cancel" : "+ New Request"}</button>}
      </div>
      {canSubmit && showForm && (
        <div className="wo-form">
          <div className="wo-presets">
            {REQ_TYPES.map(t => (
              <button key={t} type="button" className={`wo-preset${form.requestType===t?" on":""}`} onClick={()=>setForm(p=>({...p, requestType:t}))}>{t}</button>
            ))}
          </div>
          {form.requestType === "Other" && (
            <input className="wo-input" placeholder="Custom type" value={form.customType} onChange={e => setForm(p=>({...p, customType:e.target.value}))} />
          )}
          <input className="wo-input" placeholder="What do you need? *" value={form.description} onChange={e => setForm(p=>({...p, description:e.target.value}))} />
          <textarea className="wo-textarea" rows={2} placeholder="Additional notes (optional)" value={form.notes} onChange={e => setForm(p=>({...p, notes:e.target.value}))} />
          <button className="wo-form-submit" disabled={saving || !form.description.trim()} onClick={handleSubmit}>{saving ? "Submitting…" : "Submit Request"}</button>
        </div>
      )}
      {pending.length === 0 && resolved.length === 0 && <div className="wo-empty">{canSubmit ? "No requests yet." : "No requests for this project."}</div>}
      {pending.map(req => (
        <div key={req.id} className="wo-item wo-pending">
          <div className="wo-item-top">
            <span className="wo-item-badge pending">Pending Review</span>
            <span className="wo-item-who">{req.submitted_by_name || "Tech"} · {req.created_at?.slice(0,10) || "—"}</span>
          </div>
          <div className="wo-item-notes"><strong>{req.request_type || req.requestType}</strong> — {req.description}</div>
          {req.notes && <div className="wo-item-review-note">{req.notes}</div>}
          {canApprove && rejectId === req.id ? (
            <div className="wo-reject-form">
              <input className="wo-reject-input" placeholder="Reason (optional)" value={rejectMsg} onChange={ev=>setRejectMsg(ev.target.value)} />
              <button className="wo-btn-reject" onClick={() => handleReject(req.id)}>Confirm Reject</button>
              <button className="wo-btn-cancel" onClick={() => setRejectId(null)}>Cancel</button>
            </div>
          ) : canApprove && (
            <div className="wo-item-actions">
              <button className="wo-btn-approve" onClick={() => handleApprove(req.id)}>✓ Approve</button>
              <button className="wo-btn-reject" onClick={() => setRejectId(req.id)}>✕ Reject</button>
            </div>
          )}
        </div>
      ))}
      {resolved.map(req => (
        <div key={req.id} className={`wo-item wo-${req.status}`}>
          <div className="wo-item-top">
            <span className={`wo-item-badge ${req.status}`}>{req.status === "approved" ? "✓ Approved" : "✕ Rejected"}</span>
            <span className="wo-item-who">{req.submitted_by_name || "Tech"} · {req.created_at?.slice(0,10) || "—"}</span>
          </div>
          <div className="wo-item-notes"><strong>{req.request_type || req.requestType}</strong> — {req.description}</div>
          {req.review_notes && <div className="wo-item-review-note">Note: {req.review_notes}</div>}
          {req.reviewed_by_name && <div className="wo-item-reviewer">Reviewed by {req.reviewed_by_name}</div>}
        </div>
      ))}
    </div>
  );
}

// ---- Tech Action Bar — stage advances techs can trigger ----
function TechActionBar({ accessId, projectStage, onStageChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");

  if (projectStage !== "schedule" && projectStage !== "install") return null;

  const config = projectStage === "schedule"
    ? { label: "Accept Job", sub: "Confirm you're taking this installation", next: "Install" }
    : { label: "Complete Installation", sub: "Push this job to QC for review", next: "QC" };

  async function handleAdvance() {
    setBusy(true); setErr("");
    const r = await techAdvanceStageAction(accessId, projectStage);
    setBusy(false);
    if (r.ok) onStageChange(r.stage);
    else setErr(r.error || "Could not advance.");
  }

  return (
    <div className="tech-action-bar">
      <div className="tab-action-info">
        <div className="tab-action-label">{config.label}</div>
        <div className="tab-action-sub">{config.sub} → <strong>{config.next}</strong></div>
      </div>
      <button className="tab-action-btn" disabled={busy} onClick={handleAdvance}>
        {busy ? "Saving…" : `${config.label} →`}
      </button>
      {err && <div className="tab-action-err">{err}</div>}
    </div>
  );
}

// ---- Proposal View Log (eye icon) — admin/manager see all views, sales sees customer views ----
// Proposal-view log, shown as a small header-icon modal (opened from the sh-actions row).
function ProposalViews({ views, view, onClose }) {
  if (!["admin", "manager", "sales"].includes(view)) return null;

  const isSales = view === "sales";
  const heading = isSales ? "Customer Proposal Views" : "Proposal Views";
  const empty = isSales ? "The customer hasn't opened the proposal yet." : "No one has opened the proposal yet.";

  const fmt = (s) => {
    if (!s) return "";
    try { return new Date(s.includes("T") ? s : s.replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
    catch (_) { return s; }
  };
  const ROLE_LABEL = { admin: "Admin", manager: "Manager", sales: "Sales Rep", tech: "Technician", customer: "Customer" };

  return (
    <div className="pv-modal-bg" onClick={(e) => { if (e.target.classList.contains("pv-modal-bg")) onClose(); }}>
      <div className="pv-modal pv-ta-modal">
        <button className="pv-modal-x" onClick={onClose}>✕</button>
        <h2 className="pv-modal-title">{heading} <span className="pv-ap-count">{views.length}</span></h2>
        <div className="pvw-list" style={{ maxHeight: "60vh", overflowY: "auto", marginTop: 12 }}>
          {views.length === 0 ? (
            <div className="wo-empty">{empty}</div>
          ) : (
            views.map((v) => (
              <div className="pvw-row" key={v.id}>
                <span className={`pvw-role pvw-${v.viewer_role}`}>{ROLE_LABEL[v.viewer_role] || v.viewer_role}</span>
                <div className="pvw-row-body">
                  <div className="pvw-who">{v.viewer_name || ROLE_LABEL[v.viewer_role] || "Someone"}</div>
                  <div className="pvw-meta">{fmt(v.viewed_at)}{v.ip ? ` · ${v.ip}` : ""}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Commission Panel (admin/manager only) ----
function CommissionPanel({ project }) {
  const [rate, setRate]   = useState(String(project.commission_rate || ""));
  const [status, setStatus] = useState(project.commission_status || "pending");
  const [rep, setRep]     = useState(project.sales_rep || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]     = useState("");

  const amount = project.value && parseFloat(rate) > 0
    ? Math.round(project.value * parseFloat(rate) / 100)
    : 0;

  async function save() {
    setSaving(true);
    const r = await setCommissionAction(project.access_id, { rate: parseFloat(rate)||0, status, salesRep: rep });
    setSaving(false);
    setMsg(r.ok ? "Saved." : (r.error || "Error."));
    setTimeout(() => setMsg(""), 2500);
  }

  return (
    <div className="wo-panel">
      <div className="wo-panel-head">
        <span className="wo-panel-title">Commission</span>
        {amount > 0 && <span className="wo-panel-badge">${amount.toLocaleString()} ({rate}%)</span>}
      </div>
      <div className="wo-form" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
        <label style={{ fontSize:".76rem", color:"var(--muted)", display:"flex", flexDirection:"column", gap:4 }}>
          Sales Rep
          <input className="wo-input" placeholder="Name" value={rep} onChange={e => setRep(e.target.value)} style={{ margin:0 }} />
        </label>
        <label style={{ fontSize:".76rem", color:"var(--muted)", display:"flex", flexDirection:"column", gap:4 }}>
          Rate (%)
          <input className="wo-input" type="number" min="0" max="100" step="0.5" placeholder="e.g. 5" value={rate} onChange={e => setRate(e.target.value)} style={{ margin:0 }} />
        </label>
        <label style={{ fontSize:".76rem", color:"var(--muted)", display:"flex", flexDirection:"column", gap:4 }}>
          Status
          <select className="wo-select" value={status} onChange={e => setStatus(e.target.value)} style={{ margin:0 }}>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
        </label>
      </div>
      <div style={{ padding:"0 16px 14px", display:"flex", alignItems:"center", gap:12 }}>
        <button className="wo-form-submit" style={{ marginTop:0 }} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Commission"}</button>
        {msg && <span style={{ fontSize:".8rem", color:"var(--muted)" }}>{msg}</span>}
      </div>
    </div>
  );
}

// ---- Activity icons ----
const ACT_COLOR = { inquiry:"gold", assign:"blue", stage:"green", signature:"purple", note:"amber", payment:"green" };
function ActIcon({ type }) {
  const s = { width:"14", height:"14", viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", strokeWidth:"2", strokeLinecap:"round", strokeLinejoin:"round" };
  if (type === "inquiry")
    return <svg {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
  if (type === "assign")
    return <svg {...s}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (type === "signature")
    return <svg {...s}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>;
  if (type === "note")
    return <svg {...s}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
  if (type === "payment")
    return <svg {...s}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
  // stage / default
  return <svg {...s}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
}

// ---- Activity log — role-filtered ----
function ActivityLog({ view }) {
  const all = ACTIVITY.filter((a) => {
    if (!a.roles.includes(view || "")) return false;
    if (view === "customer" && a.cl === null) return false;
    return true;
  });
  const visible = all.slice(-3);
  const hasMore = all.length > 3;
  const isCustomer = view === "customer";
  const hd = isCustomer ? "Your Project Journey" : "Activity Log";
  return (
    <div className="actlog-section">
      <div className="actlog-section-hd">
        <span className="actlog-section-title">{hd}</span>
        {hasMore && <span className="actlog-view-all">+{all.length - 3} earlier entries</span>}
      </div>
      <div className="actlog-card">
        {visible.map((a, i) => {
          const label = isCustomer ? (a.cl || a.label) : a.label;
          const who   = isCustomer ? null : a.who;
          const clr   = ACT_COLOR[a.type] || "blue";
          return (
            <div key={i} className={`actlog-row${i === visible.length-1?" last":""}`}>
              <span className={`actlog-ic actlog-ic-${clr}`}><ActIcon type={a.type} /></span>
              <div className="actlog-body">
                <div className="actlog-label">{label}</div>
                <div className="actlog-meta">{who ? `${who} · ` : ""}{a.when}</div>
              </div>
            </div>
          );
        })}
        {!visible.length && <div className="actlog-empty">No activity yet on this project.</div>}
      </div>
    </div>
  );
}

// ---- Inquiry stage card — shows real intake data ----
// Customer inquiry availability options.
const CIQ_DAYS  = ["Any","Weekdays","Weekends","Other"];
const CIQ_TIMES = ["Any","Morning","Afternoon","Evening"];
const CIQ_WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
function CustomerInquiryPanel({ project, accessId }) {
  const [notes, setNotes]   = useState("");
  const [days, setDays]     = useState(["Any"]);
  const [otherDays, setOtherDays] = useState([]);
  const [times, setTimes]   = useState(["Any"]);
  const [date, setDate]     = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [urgent, setUrgent] = useState(!!project.needs_attention);
  const [urgSaving, setUrgSaving] = useState(false);

  // Default the preferred date to tomorrow (client-only to avoid hydration mismatch).
  useEffect(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    setDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
  }, []);

  const touched = useRef(false);
  const mark = () => { touched.current = true; };

  // "Any" is exclusive; picking a specific option clears it (and vice-versa).
  const toggle = (set) => (v) => { mark(); set(p => {
    if (v === "Any") return ["Any"];
    const next = p.filter(x => x !== "Any");
    const res = next.includes(v) ? next.filter(x => x !== v) : [...next, v];
    return res.length ? res : ["Any"];
  }); };
  const daysDisplay = days.includes("Other")
    ? [...days.filter(d => d !== "Other"), ...otherDays]
    : days;
  const availText = [daysDisplay.join(", "), times.join(", "), date ? `Date: ${date}` : ""].filter(Boolean).join(" · ");

  // Auto-save details + availability to the project (debounced) so the admin side sees it live.
  useEffect(() => {
    if (!touched.current) return;
    setSaving(true); setSaved(false);
    const t = setTimeout(async () => {
      const combined = [notes.trim(), availText ? `Preferred availability: ${availText}` : ""].filter(Boolean).join("\n\n");
      await updateProjectInfoAction(accessId, { contact_message: combined });
      setSaving(false); setSaved(true);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, days, otherDays, times, date]);
  async function toggleUrgent() {
    setUrgSaving(true);
    if (urgent) {
      await setAttentionAction(accessId, false, "");
      setUrgent(false);
    } else {
      const note = `URGENT (customer)${notes.trim() ? `: ${notes.trim()}` : ""}${availText ? ` · Avail: ${availText}` : ""}`;
      await setAttentionAction(accessId, true, note);
      setUrgent(true);
    }
    setUrgSaving(false);
  }

  return (
    <div className="ciq">
      <div className="ciq-hero">
        <div className="ciq-glow" />
        <div className="ciq-badge">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div className="ciq-pill">Inquiry received · <span className="mono">{project.access_id}</span></div>
        <h2 className="ciq-title">You&apos;re in. We&apos;ve got it from here.</h2>
        <p className="ciq-sub">Someone will reach out within <b>one business day</b> to schedule your free walkthrough &amp; demo.</p>
        <a className="ciq-call" href="tel:6463960775">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Can&apos;t wait? Call 646-396-0775
        </a>
      </div>

      <div className="ciq-form">
        <div className="ciq-form-h">Help us prep — anything we should know?</div>
        <label className="ciq-lbl">Details or notes</label>
        <textarea className="ciq-textarea" rows={3}
          placeholder="Tell us about your space — number of cameras, problem areas, gate/access codes, parking…"
          value={notes} onChange={e=>{mark(); setNotes(e.target.value);}} />

        <label className="ciq-lbl">Preferred availability</label>
        <div className="ciq-avail-grp">
          <span className="ciq-avail-cap">Days</span>
          <div className="ciq-chips">
            {CIQ_DAYS.map(d => (
              <button key={d} type="button" className={`ciq-chip${days.includes(d)?" on":""}`} onClick={()=>toggle(setDays)(d)}>{d}</button>
            ))}
          </div>
        </div>
        {days.includes("Other") && (
          <div className="ciq-avail-grp ciq-weekdays">
            <span className="ciq-avail-cap" />
            <div className="ciq-chips">
              {CIQ_WEEKDAYS.map(d => (
                <button key={d} type="button" className={`ciq-chip ciq-chip-sm${otherDays.includes(d)?" on":""}`}
                  onClick={()=>{ mark(); setOtherDays(p => p.includes(d) ? p.filter(x=>x!==d) : [...p, d]); }}>{d}</button>
              ))}
            </div>
          </div>
        )}
        <div className="ciq-avail-grp">
          <span className="ciq-avail-cap">Time</span>
          <div className="ciq-chips">
            {CIQ_TIMES.map(t => (
              <button key={t} type="button" className={`ciq-chip${times.includes(t)?" on":""}`} onClick={()=>toggle(setTimes)(t)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="ciq-avail-grp">
          <span className="ciq-avail-cap">Date</span>
          <input className="ciq-date" type="date" value={date} onChange={e=>{mark(); setDate(e.target.value);}} />
          {date && <button type="button" className="ciq-date-clear" onClick={()=>{mark(); setDate("");}}>Clear</button>}
        </div>

        <div className="ciq-acts">
          <span className="ciq-autosave">
            {saving
              ? <><span className="ciq-dot-anim" /> Saving…</>
              : saved
                ? <>✓ Saved · sent to our team</>
                : <>Auto-saves as you type</>}
          </span>
          <button className={`ciq-urgent${urgent?" done":""}`} disabled={urgSaving} onClick={toggleUrgent}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="none"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>
            {urgSaving ? "…" : urgent ? "Flagged" : "Urgent"}
          </button>
        </div>
        {urgent && <div className="ciq-urgent-note">⚡ Our team has been alerted and will prioritize your project.</div>}
      </div>
    </div>
  );
}

function InquiryCard({ project, view }) {
  if (view === "customer") {
    return (
      <div className="iq-card customer">
        <div className="iq-check">✓</div>
        <div className="iq-h">Inquiry Received</div>
        <div className="iq-ref">Reference: <span className="mono">{project.access_id}</span></div>
        <p className="iq-body">
          Thank you for reaching out to IOT TECHS! A member of our team will contact you within
          one business day to schedule your free walkthrough and system demo.
        </p>
        {project.contact_email && (
          <div className="iq-note">We&apos;ll reach you at: <b>{project.contact_email}</b></div>
        )}
      </div>
    );
  }
  if (view === "tech") return <div className="pv-passive">No tech view at this stage.</div>;

  return (
    <div className="iq-card staff">
      <div className="iq-card-title">Lead Card</div>
      <div className="iq-fields">
        {project.contact_name && <div className="iq-field"><span className="iq-lbl">Contact</span><span className="iq-val">{project.contact_name}</span></div>}
        {project.contact_email && <div className="iq-field"><span className="iq-lbl">Email</span><a href={`mailto:${project.contact_email}`} className="iq-val iq-link">{project.contact_email}</a></div>}
        {project.contact_phone && <div className="iq-field"><span className="iq-lbl">Phone</span><a href={`tel:${project.contact_phone}`} className="iq-val iq-link">{project.contact_phone}</a></div>}
        <div className="iq-field"><span className="iq-lbl">Business</span><span className="iq-val">{project.customer}</span></div>
        <div className="iq-field"><span className="iq-lbl">Address</span><span className="iq-val">{project.address}</span></div>
        <div className="iq-field"><span className="iq-lbl">Service</span><span className="iq-val">{project.service || project.service_code}</span></div>
        {project.contact_message && (
          <div className="iq-field full"><span className="iq-lbl">Notes</span><span className="iq-val">{project.contact_message}</span></div>
        )}
        <div className="iq-field"><span className="iq-lbl">Source</span><span className="iq-val" style={{ textTransform: "capitalize" }}>{project.source || "Internal"}</span></div>
      </div>
    </div>
  );
}

// Project-header status pill → its color class per phase status word.
const STATUS_CLASS = { "Pending": "sh-pending", "Reviewing": "sh-reviewing", "In Progress": "sh-inprogress", "Finalizing": "sh-finalizing" };

// ---- Upcoming step lookup ----
const UPCOMING = {
  inquiry:          { label: "Site Survey",       sub: "Pending scheduling"   },
  site_survey:      { label: "Proposal",          sub: "In preparation"       },
  proposal:         { label: "Client Approval",   sub: "Awaiting signature"   },
  approval_deposit: { label: "Deposit",           sub: "Awaiting payment"     },
  schedule:         { label: "Installation",      sub: "To be scheduled"      },
  install:          { label: "Installation",      sub: "In progress"          },
  qc:               { label: "QC Inspection",     sub: "Pending"              },
  payment:          { label: "Final Payment",     sub: "Awaiting"             },
  completion:       { label: "Project Complete",  sub: "All done!"            },
};

// ---- Google Places loader (singleton) + address autocomplete input ----
// Address autocomplete now comes from the shared, race-safe component (imported at the top).

// ---- Map thumbnail for project header ----
function MapThumb({ address }) {
  const [mapKey, setMapKey] = useState(null);
  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(j => { if (j.googleMapsApiKey) setMapKey(j.googleMapsApiKey); }).catch(() => {});
  }, []);

  const displayAddr = address || "2503 Jay Pl, Bronx, NY 10462";
  const href = `https://maps.google.com/?q=${encodeURIComponent(displayAddr)}`;
  const src = mapKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(displayAddr)}&zoom=15&size=800x500&maptype=roadmap&markers=color:0x1a2340%7Csize:mid%7C${encodeURIComponent(displayAddr)}&key=${mapKey}`
    : null;

  return (
    <a href={href} target="_blank" rel="noreferrer" className="pv-map-col">
      {src ? (
        <>
          <img src={src} alt={address ? "Project location" : "Service area"} className="pv-map-img" />
          {!address && <div className="pv-map-area-label">NYC / NJ Metro Service Area</div>}
        </>
      ) : (
        <div className="pv-map-placeholder">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .35 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
          </svg>
          <span style={{ fontSize: ".78rem" }}>{address ? "Open in Maps ↗" : "NYC / NJ Metro"}</span>
        </div>
      )}
    </a>
  );
}

// ---- Searchable person picker ----
function PersonSearch({ candidates, value, onSelect, placeholder }) {
  const [q, setQ]       = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef         = useRef(null);
  const selectedUser    = value ? candidates.find(u => String(u.id) === String(value)) : null;
  const filtered        = q.trim()
    ? candidates.filter(u => (u.name || "").toLowerCase().includes(q.toLowerCase()))
    : candidates;

  useEffect(() => {
    function close(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={wrapRef} className="pv-psearch">
      <input
        className="pv-ap-input"
        value={selectedUser ? selectedUser.name : q}
        placeholder={placeholder || "Search by name…"}
        autoComplete="off"
        onChange={e => { setQ(e.target.value); onSelect(null); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <div className="pv-psearch-dd">
          {filtered.map(u => (
            <button
              key={u.id}
              type="button"
              className="pv-psearch-opt"
              onMouseDown={e => { e.preventDefault(); onSelect(u); setQ(""); setOpen(false); }}
            >
              <span className="pv-psearch-name">
                {u.name}
                {u.role && <span className={`pv-ap-role pv-role-${u.role}`} style={{ marginLeft: 7 }}>{u.role}</span>}
              </span>
              {u.email && <span className="pv-psearch-email">{u.email}</span>}
            </button>
          ))}
        </div>
      )}
      {open && q.trim() && filtered.length === 0 && (
        <div className="pv-psearch-dd">
          <span className="pv-psearch-empty">No match for "{q}"</span>
        </div>
      )}
    </div>
  );
}

// Unified add-member search: matches staff by name/email, and lets you invite a new
// external customer by email. Dropdown only appears after typing.
function MemberSearch({ staffUsers, onPickStaff, onPickCustomer }) {
  const [q, setQ]       = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef         = useRef(null);

  useEffect(() => {
    function close(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const ql       = q.trim().toLowerCase();
  const digits   = q.replace(/\D/g, "");
  const matches  = ql ? staffUsers.filter(u => {
    const hay = `${u.name || ""} ${u.email || ""} ${u.username || ""}`.toLowerCase();
    if (hay.includes(ql)) return true;
    if (digits && u.phone && String(u.phone).replace(/\D/g, "").includes(digits)) return true;
    return false;
  }) : [];
  const isEmail  = /\S+@\S+\.\S+/.test(q.trim());
  const dupEmail = !!ql && staffUsers.some(u => (u.email || "").toLowerCase() === ql);
  const showCust = isEmail && !dupEmail;
  const showDD   = open && !!ql && (matches.length > 0 || showCust);

  return (
    <div ref={wrapRef} className="pv-psearch">
      <input
        className="pv-ap-input"
        value={q}
        placeholder="Search user"
        autoComplete="off"
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {showDD && (
        <div className="pv-psearch-dd">
          {matches.map(u => (
            <button key={u.id} type="button" className="pv-psearch-opt pv-psearch-opt-row"
              onMouseDown={e => { e.preventDefault(); onPickStaff(u); setQ(""); setOpen(false); }}>
              <span className="pv-psearch-name">{u.name || u.email}</span>
              {u.role && <span className={`pv-ap-role pv-role-${u.role}`}>{u.role}</span>}
            </button>
          ))}
          {showCust && (
            <button type="button" className="pv-psearch-opt"
              onMouseDown={e => { e.preventDefault(); onPickCustomer(q.trim()); setQ(""); setOpen(false); }}>
              <span className="pv-psearch-name">
                Invite as customer
                <span className="pv-ap-role pv-role-customer" style={{ marginLeft: 7 }}>customer</span>
              </span>
              <span className="pv-psearch-email">{q.trim()}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Resolved project view ----
function ResolvedView({ project, view, currentUser = null, projectStage, onProjectStage, viewingStageRef = null, assignments = [], staffUsers = [], workOrders = [], expenses = [], requests = [], proposalViews = [], proposal = null, previewRole = null, onPreviewRole }) {
  const [proposalData, setProposalData] = useState(proposal);
  // A role switch (the pill) opens this tab with ?stage=<the step they were on> so it lands on
  // the SAME step. Consumed once; the customer re-center effect below skips its first run when set.
  const stageParamRef = useRef(typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("stage") : null);
  const [viewingStage, setViewingStage] = useState(() => stageParamRef.current || projectStage);
  const [busy, setBusy]                 = useState(false);
  const [err,  setErr]                  = useState("");
  const [jumpToast, setJumpToast]       = useState(null);
  const [acceptances, setAcceptances]   = useState({});   // { site_survey:{by,at,fingerprint}, mockup:{…} }
  const [toolMeta, setToolMeta]         = useState(null);  // { survey:{has,fingerprint}, mockup:{…} } — server-authoritative
  const [acceptLoaded, setAcceptLoaded] = useState(false);
  const [gateMsg, setGateMsg]           = useState(null);  // shown when a gated nav is blocked
  const [tourOpen, setTourOpen]         = useState(false); // first-time guided tour (customer)
  // Load acceptances + per-tool data meta together, and expose a refresher so the survey stage
  // re-reads them after the customer approves (or after staff change a tool → void).
  async function refreshAcceptances() {
    const r = await getAcceptancesAction(project.access_id);
    if (r?.ok) { setAcceptances(r.acceptances || {}); setToolMeta(r.toolMeta || null); }
    return r;
  }
  useEffect(() => {
    let live = true;
    getAcceptancesAction(project.access_id)
      .then((r) => { if (live && r?.ok) { setAcceptances(r.acceptances || {}); setToolMeta(r.toolMeta || null); } })
      .finally(() => { if (live) setAcceptLoaded(true); });
    return () => { live = false; };
  }, [project.access_id]);
  // While viewing the survey stage, poll the tool meta so the Submit button enables shortly after
  // the office draws/uploads (the widget autosyncs to the server; this picks the change up).
  useEffect(() => {
    if (viewingStage !== "site_survey") return;
    const id = setInterval(() => { refreshAcceptances(); }, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingStage, project.access_id]);

  // ---- Live updates: poll for changes made by the OTHER party (staff moves the stage, or the
  // customer signs/pays/approves) while this page is open, and surface them without a manual
  // reload. No real activity-log table exists for the project, so this diffs a compact snapshot
  // against the previous poll instead of consuming an event feed. Runs for every role; pauses
  // while the tab is hidden so it doesn't burn cycles/requests in a backgrounded tab.
  const [liveToast, setLiveToast] = useState(null);
  const liveToastTimer = useRef(null);
  const showLiveToast = (msg) => {
    setLiveToast(msg);
    if (liveToastTimer.current) clearTimeout(liveToastTimer.current);
    liveToastTimer.current = setTimeout(() => setLiveToast(null), 4200);
  };
  // Stage-advance celebration — the "you moved forward" moment. A slim gold pill slides up and
  // the just-finished dot pops a check, so every role FEELS the progress (not just sees a number
  // change). Fires for local moves and remote ones alike; the plain "stage moved" toast is retired
  // in favour of this. `celebrate` = the label to show; `justDone` = the bar key that just completed.
  const [celebrate, setCelebrate] = useState(null);
  const [justDone, setJustDone]   = useState(null);
  const celebrateTimer = useRef(null);
  const justDoneTimer  = useRef(null);
  const lastSnapshot = useRef(null);   // null until the first poll lands (baseline — never toasts)
  useEffect(() => {
    let live = true;
    async function poll() {
      if (document.visibilityState === "hidden") return;
      const snap = await getLiveSnapshotAction(project.access_id).catch(() => null);
      if (!live || !snap?.ok) return;
      const prev = lastSnapshot.current;
      lastSnapshot.current = snap;
      if (!prev) return;   // first poll just establishes the baseline

      if (snap.stage !== prev.stage) {
        onProjectStage(snap.stage);
        // Staff/tech following the live stage move along with it; a customer stays on their own
        // journey pointer (they should never be dragged to a step ops opened but they haven't earned).
        if (cView !== "customer") setViewingStage((vs) => (vs === prev.stage ? snap.stage : vs));
        // The stage-advance celebration effect (keyed on projectStage) handles the toast/animation
        // for both local and remote moves — no separate "stage moved" toast here (would double up).
      }
      if (snap.proposal && prev.proposal) {
        if (snap.proposal.signed_at && !prev.proposal.signed_at) {
          setProposalData((p) => (p ? { ...p, signed_name: snap.proposal.signed_name, signed_at: snap.proposal.signed_at } : p));
          showLiveToast(`Agreement signed${snap.proposal.signed_name ? ` by ${snap.proposal.signed_name}` : ""}`);
        }
        if (snap.proposal.accepted_options.length > prev.proposal.accepted_options.length) {
          showLiveToast("Proposal option accepted");
        }
        if (snap.proposal.pcp_agreed_at && !prev.proposal.pcp_agreed_at) {
          showLiveToast("PCP agreement approved");
        }
        if (snap.proposal.tech_signed_name && !prev.proposal.tech_signed_name) {
          showLiveToast(`Work order accepted by ${snap.proposal.tech_signed_name}`);
        }
      }
      if (snap.paymentsCount > prev.paymentsCount) {
        const added = snap.paymentsConfirmedTotal - prev.paymentsConfirmedTotal;
        showLiveToast(added > 0 ? `Payment received — ${money(added)}` : "Payment submitted, awaiting confirmation");
      } else if (snap.paymentsConfirmedTotal > prev.paymentsConfirmedTotal) {
        showLiveToast("Payment confirmed — balance updated");
      }
      let acceptanceChanged = false;
      for (const key of Object.keys(snap.acceptances || {})) {
        if (snap.acceptances[key] && !prev.acceptances?.[key]) {
          acceptanceChanged = true;
          showLiveToast(`${key === "site_survey" ? "Site survey" : key === "mockup" ? "Mockup" : key} approved`);
        }
      }
      if (acceptanceChanged) refreshAcceptances();
      if (snap.completed_at && !prev.completed_at) {
        setLocalProj((p) => ({ ...p, completed_at: snap.completed_at }));
        showLiveToast("Project marked complete 🎉");
      }
    }
    poll();
    const id = setInterval(poll, 8000);
    document.addEventListener("visibilitychange", poll);
    return () => { live = false; clearInterval(id); document.removeEventListener("visibilitychange", poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.access_id]);

  // ---- Customer inactivity auto-lock ----
  // A customer's PIN grant already expires server-side 5 minutes after issuance (lib/auth.js
  // ACCESS_TTL_MS) — that catches them on their next reload/request. This covers the gap where
  // they leave the tab open without reloading: 15 minutes with no mouse/keyboard/touch/scroll
  // activity drops the grant and reloads, which lands them back on the PIN gate. Staff previewing
  // the customer view are exempt — this only fires for an actual PIN/session-authenticated customer.
  useEffect(() => {
    if (view !== "customer" || previewRole) return;
    let idleTimer;
    const IDLE_MS = 15 * 60 * 1000;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(async () => {
        await lockProjectAction(project.access_id).catch(() => {});
        window.location.reload();
      }, IDLE_MS);
    };
    const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    EVENTS.forEach((e) => document.addEventListener(e, resetIdle, { passive: true }));
    resetIdle();
    return () => { clearTimeout(idleTimer); EVENTS.forEach((e) => document.removeEventListener(e, resetIdle)); };
  }, [view, previewRole, project.access_id]);

  const [hCollapsed, setHCollapsed]     = useState(true);
  const [mapHidden, setMapHidden]       = useState(true);
  const [hEditing,   setHEditing]       = useState(false);
  const [hVals,      setHVals]          = useState({});
  const [hSaving,    setHSaving]        = useState(false);
  const [pinVal,     setPinVal]         = useState("");     // admin PIN editor
  const [pinCustom,  setPinCustom]      = useState(false);  // is the current PIN a custom override?
  const [pinBusy,    setPinBusy]        = useState(false);
  const [localProj,  setLocalProj]      = useState(project);
  const [localAssignments, setLocalAssignments] = useState(assignments);
  const [installDone, setInstallDone]   = useState(false);   // install checklist reports "every device done"
  const [installEvents, setInstallEvents] = useState(null);  // scheduling widget event count (install phase) — gate "done" on a real booking
  const [shipStatus, setShipStatus]     = useState({ count: 0, delivered: false }); // shipment tracker: hide until a #, auto-complete on delivered
  const [addonCount, setAddonCount]     = useState(0);       // job-site add-ons count — hide the step until one is submitted
  const [surveyHasLocal, setSurveyHasLocal] = useState(false); // survey widget reports live content → enable Submit instantly
  const [mockupHasLocal, setMockupHasLocal] = useState(false); // mockup widget reports a photo landed → enable Submit instantly
  const [leadConfirmed, setLeadConfirmed]   = useState(!!project.info_confirmed_at); // customer confirmed their lead info (welcome modal / Survey step ①)
  const [restricted, setRestricted]     = useState(!!project.restricted);
  const [pendingMove, setPendingMove]   = useState(null);
  const [taOpen, setTaOpen]             = useState(false);
  const [addingRole, setAddingRole]     = useState(null);
  const [addEmail,   setAddEmail]       = useState("");
  const [addUserId,  setAddUserId]      = useState("");
  const [addSaving,  setAddSaving]      = useState(false);
  const [verifyCust, setVerifyCust]     = useState(null); // pending external customer awaiting identity confirmation
  const [expOpen,    setExpOpen]        = useState(false);
  const [reqOpen,    setReqOpen]        = useState(false);
  const [pvwOpen,    setPvwOpen]        = useState(false);   // Proposal Views modal (header icon)
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeSaving,    setCloseSaving]    = useState(false);
  const [closeErr,       setCloseErr]       = useState("");
  const [attention,      setAttention]      = useState(!!project.needs_attention);
  const [attentionNote,  setAttentionNote]  = useState(project.attention_note || "");
  const [showNoteBox,    setShowNoteBox]    = useState(false);
  const [attSaving,      setAttSaving]      = useState(false);
  // Inquiry scheduling open/collapse now lives in its <FlowStep> (open while unbooked, done once set).
  // Survey/mockup tool open state now lives inside each <FlowStep> (driven by its done/active status).
  // null | "customer" | "tech" — admin/manager can preview the page as either role. Lifted to
  // GatewayClient so the masthead pill and this subheader eye share one source of truth.
  const setPreviewRole = onPreviewRole || (() => {});
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false);
  const previewMenuRef = useRef(null);
  useEffect(() => {
    function close(e) { if (previewMenuRef.current && !previewMenuRef.current.contains(e.target)) setPreviewMenuOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const lp = localProj;

  useEffect(() => { setJumpToast(null); }, [projectStage]);

  const canControl = view === "admin" || view === "manager";
  const hasSalesRep = localAssignments.some((a) => a.role === "sales") || !!lp.sales_rep;
  const isBrowsing = viewingStage !== projectStage;

  // Admins always have access to every project and can never be removed — shown as permanent,
  // locked members (computed live from staff). Managers & the customer are auto-added but removable.
  const alwaysMembers = staffUsers.filter((u) => u.role === "admin");
  const alwaysIds = new Set(alwaysMembers.map((u) => u.id));
  const MEMBER_ROLE_ORDER = { manager: 0, tech: 1, sales: 2, customer: 3 };
  const removableAssignments = localAssignments
    .filter((a) => !(a.user_id && alwaysIds.has(a.user_id)))
    .sort((a, b) => (MEMBER_ROLE_ORDER[a.role] ?? 99) - (MEMBER_ROLE_ORDER[b.role] ?? 99));
  const teamCount = alwaysMembers.length + removableAssignments.length;
  // When admin/manager pick a preview role, render the stage content as that role instead.
  const cView = (previewRole && ["admin","manager"].includes(view)) ? previewRole : view;
  const cell = cellFor(viewingStage, cView);
  // A completed project is locked: its stage tools go read-only so a closed job can't be
  // silently re-edited. Admin/manager can Reopen from the Completion panel to make changes.
  const locked = !!lp.completed_at;

  // ---- Customer journey pointer ----
  // The customer's view follows THEIR outstanding to-do, not how far the office has pushed the
  // internal stage — so they always land on exactly the thing they need to do next, never on a step
  // that's ahead of them. `custStage` = their first unmet obligation; once caught up it just follows
  // the real project (watch install; pay the final balance at closeout). surveyOk is the canonical
  // "survey done" check (every tool with data approved, or no data at all → smooth sailing).
  const surveyOk = surveySatisfied(toolMeta, acceptances);
  const proposalAccepted = (proposalData?.accepted_options?.length > 0) || proposalData?.status === "accepted";
  const custFacts = {
    appt_date:         lp.date,
    survey_ok:         surveyOk,
    survey_accepted:   lp.survey_accepted,
    survey_submitted:  !!acceptances?.submit_site_survey,
    proposal_status:   proposalAccepted ? "accepted" : (proposalData?.status || lp.proposal_status || ""),
    proposal_signed:   !!proposalData?.signed_name || !!lp.proposal_signed,
    deposit_submitted: lp.deposit_submitted,
    deposit_recorded:  lp.deposit_recorded,
    install_date:      lp.install_date || lp.date,
    install_date_fmt:  fmtDate(lp.install_date || lp.date),
    // Per-tool "published (office submitted) / has data / done (customer approved)" — drives the
    // celebratory "X has been published" pop-up below.
    survey_has:        !!toolMeta?.survey?.has,
    survey_published:  !!acceptances?.submit_site_survey,
    survey_done:       !!acceptances?.site_survey,
    mockup_has:        !!toolMeta?.mockup?.has,
    mockup_published:  !!acceptances?.submit_mockup,
    mockup_done:       !!acceptances?.mockup,
    proposal_version:  proposalData?.version || null,
  };
  // Only trust the pointer once acceptances have loaded (before that we'd read a half-empty picture).
  const custPointer = (cView === "customer" && acceptLoaded) ? customerPointer(custFacts) : null;
  const custStage   = custPointer || projectStage;   // their current step, else follow the real project

  // "It's been published!" pop-up — the current office-published review item (one at a time). Only for
  // a real customer, once they're past the welcome + tour, and only if this exact item hasn't popped
  // before (DB: announced_seen). Clicking it takes them straight there; each item pops once.
  const announcedSeen = (() => { try { return JSON.parse(lp.announced_seen || "[]"); } catch { return []; } })();
  const announcement  = (cView === "customer" && !previewRole && acceptLoaded && lp.info_confirmed_at && lp.tour_seen_at && !tourOpen)
    ? customerAnnouncement(custFacts) : null;
  const showAnnounce  = !!announcement && !announcedSeen.includes(announcement.key);
  async function ackAnnouncement(key, go) {
    setLocalProj((p) => {
      let seen = []; try { seen = JSON.parse(p.announced_seen || "[]"); } catch {}
      if (!Array.isArray(seen)) seen = [];
      if (!seen.includes(key)) seen.push(key);
      return { ...p, announced_seen: JSON.stringify(seen) };
    });
    if (go) browse(go);
    try { await markAnnouncementSeenAction(lp.access_id, key); } catch (_) {}
  }

  // Keep a real customer parked on their current step: re-center on load and each time they finish an
  // item (which advances custStage). Between progressions they can still click the bar freely — this
  // fires only when custStage itself changes, so browsing around doesn't yank them back.
  useEffect(() => {
    if (!acceptLoaded || previewRole || cView !== "customer") return;
    // Honor a carried-in step on first load (a role switch that landed here), then resume
    // normal re-centering as the customer progresses.
    if (stageParamRef.current) { stageParamRef.current = null; return; }
    setViewingStage(custStage);
    setGateMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custStage, acceptLoaded]);

  // Publish the currently-shown step so the header's role switcher can carry it into a new tab.
  useEffect(() => { if (viewingStageRef) viewingStageRef.current = viewingStage; }, [viewingStage, viewingStageRef]);

  // First-time guided tour: auto-opens once (DB flag tour_seen_at) right after the customer confirms
  // their details, giving the page a beat to render the bar + tools before we spotlight them.
  const tourFiredRef = useRef(false);
  useEffect(() => {
    if (tourFiredRef.current) return;
    if (cView === "customer" && !previewRole && lp.info_confirmed_at && !lp.tour_seen_at) {
      tourFiredRef.current = true;
      const t = setTimeout(() => setTourOpen(true), 650);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lp.info_confirmed_at, lp.tour_seen_at, cView, previewRole]);

  // Every role now sees the unified 4-phase bar (view-merge, 2026-07-13). The backend still runs all
  // 9 stages — these dots are phase GROUPS, and browsing/gating still resolves to real master keys.
  // The current-dot marker maps the master projectStage into its phase.
  const masterStages    = stagesForType(project.project_type);   // the real per-type master lifecycle
  const phaseList       = phasesForType(project.project_type);   // the 4 phases present for this type
  // The bar renders phases for everyone; technicians get their own wording for the same dots
  // (Survey → Accept → Install → Completion) since their phase-2 job is accepting the work order.
  const stageList       = cView === "tech"
    ? phaseList.map((p) => ({ ...p, label: p.techLabel || p.label, short: p.techLabel || p.short }))
    : phaseList;
  // The "you are here" marker: for a customer it sits on THEIR pointer (custStage) so the bar reflects
  // their journey, not how far ops has pushed the internal stage; staff/tech see the real stage.
  const barMarker       = cView === "customer" ? custStage : projectStage;
  const barProjectStage = masterToPhaseKey(barMarker);
  const vPhase          = masterToPhaseKey(viewingStage);        // which phase's tools are on screen
  // browse()/gating validate against real master keys; a phase-dot click resolves to a master landing.
  const typeKeys        = masterStages.map((s) => s.key);
  const projectIdx      = typeKeys.indexOf(projectStage);
  const prevProjectKey  = projectIdx > 0 ? typeKeys[projectIdx - 1] : null;
  const nextProjectKey  = projectIdx >= 0 && projectIdx < typeKeys.length - 1 ? typeKeys[projectIdx + 1] : null;

  // Which real master stage a phase-dot opens: the current stage when the project is inside that
  // phase (so the active work — review survey, pay balance — is reachable), else the phase's primary.
  function phaseLanding(key) {
    if (key && !String(key).startsWith("ph_")) return key;   // already a master stage — pass through
    const phase = phaseList.find((p) => p.key === key);
    if (!phase) return projectStage;
    if (masterToPhaseKey(projectStage) === key) return projectStage;   // land on the active sub-stage
    return phase.primary;
  }
  // Honest completion % based on real 9-stage position (not the 4 phases) — so "at payment" reads
  // ~88%, not a misleading 100% just because it's the last phase. 100% is reserved for the true
  // finish line: the balance is paid AND the system is released (completed_at is stamped).
  const phasePct = (() => {
    if (lp.completed_at) return 100;
    // % tracks the "you are here" marker — the customer's own pointer for them, the real stage for staff —
    // so a customer who still owes their deposit never sees a misleading "80%" from ops running ahead.
    const i = masterStages.findIndex((s) => s.key === barMarker);
    const raw = i >= 0 && masterStages.length > 1 ? Math.round((i / (masterStages.length - 1)) * 100) : 0;
    return Math.min(97, Math.max(10, raw));
  })();

  // Fire the celebration whenever the project moves forward into a NEW phase (the bar-level
  // milestone everyone sees). Intra-phase stage moves stay quiet; a backward move (admin correcting
  // course) gets a quiet neutral toast, never a party.
  const prevStageRef = useRef(projectStage);
  useEffect(() => {
    const prev = prevStageRef.current;
    if (prev === projectStage) return;
    prevStageRef.current = projectStage;
    const pIdx = STAGES.findIndex((s) => s.key === prev);
    const cIdx = STAGES.findIndex((s) => s.key === projectStage);
    if (cIdx < 0 || pIdx < 0) return;
    const forward = cIdx > pIdx;
    const prevPhase = masterToPhaseKey(prev);
    const curPhase  = masterToPhaseKey(projectStage);
    if (prevPhase === curPhase) return;             // same phase — no bar-level milestone
    const label = phaseList.find((p) => p.key === curPhase)?.label || "the next step";
    if (!forward) { showLiveToast(`Back to ${label}`); return; }
    setCelebrate(label); setJustDone(prevPhase);
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    if (justDoneTimer.current)  clearTimeout(justDoneTimer.current);
    celebrateTimer.current = setTimeout(() => setCelebrate(null), 3600);
    justDoneTimer.current  = setTimeout(() => setJustDone(null), 1100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectStage]);

  // When the effective viewing role changes (toggling the preview eye between customer/tech/
  // admin), snap the viewed stage to the CURRENT step of that role's own timeline. Without this,
  // a stage from the previous role's bar lingers — e.g. leaving tech preview (viewing the tech-
  // only "Work Order" stage) for customer preview left the customer on a stage their bar doesn't
  // have, so the page looked blank until they re-clicked the current step. (Bug fix 2026-07-07.)
  // useLayoutEffect (not useEffect) so the snap lands BEFORE paint — otherwise the switch flashes
  // one frame of the previously-browsed stage (e.g. Install) before jumping to the current step.
  const prevCViewRef = useRef(cView);
  useLayoutEffect(() => {
    if (prevCViewRef.current === cView) return;   // not a role switch (deps also cover stage changes)
    prevCViewRef.current = cView;
    setViewingStage(projectStage);
    setGateMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cView]);

  // Server actions return the (possibly auto-advanced) stage — adopt it so the bar and
  // panels move the moment the last requirement lands, no reload needed.
  function syncStage(s) {
    if (s && s !== projectStage) { onProjectStage(s); setViewingStage(s); setGateMsg(null); }
  }

  async function doMove(stageKey) {
    if (!stageKey || busy) return;
    setBusy(true); setErr("");
    const res = await setStage(project.access_id, view, stageKey);
    setBusy(false);
    if (res.ok) { onProjectStage(res.stage); setViewingStage(res.stage); }
    else setErr(res.error || "Could not move the step.");
  }

  // Pre-flight: warn if the target stage has unmet/unverifiable requirements before advancing.
  function requestMove(stageKey) {
    if (!stageKey || busy) return;
    const missing = missingReqsFor(stageKey, lp, localAssignments);
    if (missing.length) setPendingMove({ stageKey, missing });
    else doMove(stageKey);
  }

  // Customer gate: they must accept the site survey before viewing the proposal, and accept a
  // proposal option before the approval page. Staff/preview aren't gated. Never blocks the
  // default landing (only explicit forward clicks) so a customer can't get stranded.
  function browse(stageKey) {
    if (!typeKeys.includes(stageKey)) return;
    if (cView === "customer" && !previewRole) {
      if (stageKey === "proposal" && !surveyOk) {
        setGateMsg("Please review and approve your site survey first.");
        setViewingStage("site_survey");
        return;
      }
      if (stageKey === "approval_deposit" && !(proposalData?.accepted_options?.length)) {
        setGateMsg("Please accept a proposal option before the approval step.");
        setViewingStage("proposal");
        return;
      }
    }
    // Technicians can browse ahead, but a stage that isn't active yet shows what's still needed
    // (soft gate — the page still opens so they can look).
    if (cView === "tech") {
      const msg = techStepBlockMessage(stageKey);
      setGateMsg(msg);
      setViewingStage(stageKey);
      return;
    }
    setGateMsg(null);
    setViewingStage(stageKey);
  }
  // What (if anything) blocks a technician from ACTING in a stage yet. Null = clear to work.
  function techStepBlockMessage(stageKey) {
    const woAccepted = !!proposalData?.tech_signed_name;
    const iDate = lp.install_date || lp.date || null;
    const dOpen = iDate ? (new Date(iDate + "T00:00:00") <= new Date(new Date().setHours(0, 0, 0, 0))) : false;
    if (stageKey === "install") {
      if (!woAccepted) return "We're not at this step yet — accept the work order (Work Order Created) before the install.";
      if (!dOpen) return iDate ? `We're not at this step yet — the install opens on ${fmtDate(iDate)}.` : "We're not at this step yet — an install date needs to be scheduled first.";
      return null;
    }
    if (stageKey === "qc") {
      if (!woAccepted) return "We're not at this step yet — accept the work order and complete the install first.";
      return "We're not at this step yet — finish the installation before QC.";
    }
    if (stageKey === "payment") return "We're not at this step yet — QC has to be approved before payout.";
    return null;
  }

  const showInquiryCard = viewingStage === "inquiry";

  return (
    <>
      <div className={`roleband ${cView}`} />
      <div className="pv-head">
        <div className="pv-project-card">
        <div className="pv-toggle-row">
          <button className={`pv-card-toggle${!hCollapsed?" open":""}`} onClick={()=>setHCollapsed(v=>!v)}>
            <div className="pct-left">
              <span className="pct-id">{lp.access_id}</span>
              <span className="pct-title">{lp.company_name || lp.customer}<span className="pct-stage"> · {stageShortLabel(barMarker)}</span></span>
            </div>
            <div className="pct-right">
              <span className="pct-active">Active</span>
              <span className="pct-arrow"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg></span>
            </div>
          </button>
          <button className="pct-map-btn" title={mapHidden?"Show map":"Hide map"} onClick={()=>setMapHidden(v=>!v)}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
            {mapHidden ? "Map" : "Map"}
          </button>
        </div>
        {(!hCollapsed || !mapHidden) && (
          <div className="pv-hcard" style={{gridTemplateColumns: hCollapsed?"1fr": (!mapHidden?"1fr 1fr":"1fr")}}>
            {!hCollapsed && <div className="pv-hinfo">
              {hEditing ? (
                <>
                  <div className="pv-efields">
                    <div className="pv-efield"><label className="pv-hfl">Company</label><input className="pv-einput" value={hVals.company_name||""} onChange={e=>setHVals(v=>({...v,company_name:e.target.value}))} placeholder="Company name" /></div>
                    <div className="pv-efield"><label className="pv-hfl">Contact</label><input className="pv-einput" value={hVals.contact_name||""} onChange={e=>setHVals(v=>({...v,contact_name:e.target.value}))} placeholder="Contact name" /></div>
                    <div className="pv-efield"><label className="pv-hfl">Phone</label><input className="pv-einput" value={hVals.contact_phone||""} onChange={e=>setHVals(v=>({...v,contact_phone:e.target.value}))} placeholder="(xxx) xxx-xxxx" /></div>
                    <div className="pv-efield"><label className="pv-hfl">Email</label><input className="pv-einput" value={hVals.contact_email||""} onChange={e=>setHVals(v=>({...v,contact_email:e.target.value}))} placeholder="email@example.com" /></div>
                    <div className="pv-efield pv-efield-full"><label className="pv-hfl">Address</label><AddressAutocomplete className="pv-einput" value={hVals.address||""} onChange={addr=>setHVals(v=>({...v,address:addr}))} placeholder="Start typing an address…" /></div>
                    {["admin","manager"].includes(cView) && (
                      <div className="pv-efield pv-efield-full">
                        <label className="pv-hfl">Customer PIN <span style={{marginLeft:6,fontSize:".64rem",fontWeight:800,letterSpacing:".03em",textTransform:"uppercase",padding:"2px 8px",borderRadius:100,background:pinCustom?"#f7f0df":"#eef1f6",color:pinCustom?"#7a5f1f":"#5b6275"}}>{pinCustom?"Custom":"Auto · last 4 of phone"}</span></label>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                          <input className="pv-einput" style={{maxWidth:120,letterSpacing:".3em",fontWeight:700}} value={pinVal} maxLength={4} inputMode="numeric" placeholder="0000" onChange={e=>setPinVal(e.target.value.replace(/\D/g,"").slice(0,4))} />
                          <button className="pv-hact" disabled={pinBusy||pinVal.length!==4||pinVal===lp.customer_pin} onClick={async()=>{setPinBusy(true);const r=await setCustomerPinAction(lp.access_id,pinVal);setPinBusy(false);if(r?.ok){setLocalProj(p=>({...p,customer_pin:r.pin,pin_custom:r.custom?1:0}));setPinVal(r.pin);setPinCustom(!!r.custom);}else alert(r?.error||"Failed to set PIN.");}}>Set PIN</button>
                          {pinCustom && <button className="pv-hact" disabled={pinBusy} onClick={async()=>{setPinBusy(true);const r=await setCustomerPinAction(lp.access_id,"");setPinBusy(false);if(r?.ok){setLocalProj(p=>({...p,customer_pin:r.pin,pin_custom:0}));setPinVal(r.pin);setPinCustom(false);}else alert(r?.error||"Failed.");}}>↺ Reset to phone</button>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="pv-hactions">
                    <button className="pv-hact primary" disabled={hSaving} onClick={async()=>{setHSaving(true);const r=await updateProjectInfoAction(lp.access_id,hVals);setHSaving(false);if(r.ok){setLocalProj(p=>({...p,...hVals}));setHEditing(false);}else alert(r.error||"Save failed.");}}>
                      {hSaving?"Saving…":"Save Changes"}
                    </button>
                    <button className="pv-hact" onClick={()=>setHEditing(false)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="pv-hcust-row">
                    <div className="pv-hav">{(lp.customer||"?").trim().split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase()}</div>
                    <div className="pv-hcust-info">
                      <span className="pv-hcust-name">{lp.customer}</span>
                      <span className="pv-hcust-role">Owner</span>
                    </div>
                    <span className="pv-id-badge">{lp.access_id}</span>
                  </div>
                  <div className="pv-htype-row">
                    <span className="pv-htype-title">{lp.project_type==="A"?"New System":lp.project_type==="B"?"Upgrade":"Service Call"}</span>
                    <span className="pv-type-chip">{lp.project_type==="A"?"New System":lp.project_type==="B"?"Upgrade":"Service Call"}</span>
                  </div>
                  <div className="pv-hfields">
                    {(lp.service||lp.service_code) && <div className="pv-hfield"><span className="pv-hfl">Service</span><span className="pv-hfv">{lp.service||lp.service_code}</span></div>}
                    <div className="pv-hfield"><span className="pv-hfl">Opened</span><span className="pv-hfv">{fmtDate(lp.date)}</span></div>
                    {lp.contact_name && <div className="pv-hfield"><span className="pv-hfl">Contact</span><span className="pv-hfv">{lp.contact_name}</span></div>}
                    {lp.contact_phone && <div className="pv-hfield"><span className="pv-hfl">Phone</span><a className="pv-hfv link" href={`tel:${lp.contact_phone}`}>{fmtPhone(lp.contact_phone)}</a></div>}
                    {lp.company_name && <div className="pv-hfield"><span className="pv-hfl">Company</span><span className="pv-hfv">{lp.company_name}</span></div>}
                    {lp.contact_email && <div className="pv-hfield"><span className="pv-hfl">Email</span><a className="pv-hfv link" href={`mailto:${lp.contact_email}`}>{lp.contact_email}</a></div>}
                    {lp.source && <div className="pv-hfield"><span className="pv-hfl">Source</span><span className="pv-hfv" style={{textTransform:"capitalize"}}>{lp.source}</span></div>}
                    {lp.contact_message && <div className="pv-hfield pv-hfield-full"><span className="pv-hfl">Notes</span><span className="pv-hfv">{lp.contact_message}</span></div>}
                  </div>
                  <a className="pv-addr-row" href={`https://maps.google.com/?q=${encodeURIComponent(lp.address||"2503 Jay Pl, Bronx, NY 10462")}`} target="_blank" rel="noreferrer">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,color:"var(--accent)"}}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span className="pv-addr-text">{lp.address||"2503 Jay Pl, Bronx, NY 10462"}</span>
                    {UPCOMING[projectStage] && (
                      <span className="pv-addr-tag">
                        {(projectStage==="schedule"||projectStage==="install") && lp.install_date
                          ? `${fmtDate(lp.install_date)} · Confirmed`
                          : UPCOMING[projectStage].sub}
                      </span>
                    )}
                    <span className="pv-addr-arrow">→</span>
                  </a>
                  <div className="pv-hactions">
                    {["admin","manager","sales","tech","customer"].includes(view) && (
                      <button className="pv-hact" onClick={()=>{setHVals({company_name:lp.company_name||"",contact_name:lp.contact_name||"",contact_phone:lp.contact_phone||"",contact_email:lp.contact_email||"",address:lp.address||""});setPinVal(lp.customer_pin||"");setPinCustom(!!lp.pin_custom);setHEditing(true);}}>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Edit info
                      </button>
                    )}
                    <button className="pv-hact primary" onClick={()=>{const lines=["BEGIN:VCARD","VERSION:3.0",`FN:${lp.customer}`,`N:${lp.customer};;;;`,"ORG:IOT TECHS"];if(lp.contact_phone)lines.push(`TEL;TYPE=WORK,VOICE:${lp.contact_phone}`);if(lp.contact_email)lines.push(`EMAIL;TYPE=PREF,INTERNET:${lp.contact_email}`);if(lp.address)lines.push(`ADR;TYPE=WORK:;;${lp.address};;;;`);lines.push(`NOTE:Project ${lp.access_id}`);"END:VCARD";const blob=new Blob([lines.join("\n")],{type:"text/vcard"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${(lp.customer||"contact").replace(/\s+/g,"_")}.vcf`;a.click();URL.revokeObjectURL(url);}}>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                      Add to contacts
                    </button>
                    <a className="pv-hact" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lp.address||"2503 Jay Pl, Bronx, NY 10462")}`} target="_blank" rel="noreferrer">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                      Directions
                    </a>
                  </div>
                </>
              )}
            </div>}
            {!mapHidden && <MapThumb address={lp.address} />}
          </div>
        )}
        </div>{/* end pv-project-card */}
      </div>

      {/* Role-preview banner — marks the start of the previewed view. Kept in ONE consistent spot for
          every phase: right under the project/customer info card and above everything else (status
          pill, progress bar, tools), so all of it reads clearly as "what this role sees." Read-only
          (eye-icon preview); the real, controllable "view as" session opens from the header role pill. */}
      {previewRole && ["admin","manager"].includes(view) && (
        <div className="pv-custview-hint-bar">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          {previewRole === "customer"
            ? "Customer preview — read-only view of what the customer sees"
            : "Technician preview — read-only view of what the technician sees"}
        </div>
      )}

      <div className="section-head">
        <div className="sh-left">
          {(() => {
            // Terminal state: balance paid + system released (completed_at) → Complete, whatever phase is on screen.
            if (lp.completed_at) return <span className="sh-status sh-complete">Complete</span>;
            // While browsing another phase, the pill describes THAT phase (its status word + phase name,
            // e.g. "Finalizing · Completion" — not the internal "QC" sub-stage). Live view describes the
            // project's real phase; attention overrides it.
            if (isBrowsing) {
              const w = phaseStatusWord(vPhase);
              return <><span className={`sh-status ${STATUS_CLASS[w] || "sh-pending"}`}>{w}</span><span className="sh-stage-name">{phaseLabelOf(vPhase)}</span></>;
            }
            if (attention) return <span className="sh-status sh-attention">Needs Attention</span>;
            const w = phaseStatusWord(barProjectStage);
            return <span className={`sh-status ${STATUS_CLASS[w] || "sh-pending"}`}>{w}</span>;
          })()}
          {attention && attentionNote && !showNoteBox && (
            <span className="sh-note-preview" title={attentionNote}>"{attentionNote}"</span>
          )}
          {/* Internal aging signal — how long this stage has sat. Staff only; lives here (not on the
              progress bar) so it informs without distracting. Amber ≥3d, red ≥7d. */}
          {cView !== "customer" && !isBrowsing && lp.days_in_stage != null && (
            <span className={`sh-age${lp.days_in_stage >= 7 ? " red" : lp.days_in_stage >= 3 ? " amber" : ""}`}
                  title="Days in the current stage">
              {lp.days_in_stage}d in stage
            </span>
          )}
        </div>
        <div className="sh-actions">
          {["admin","manager","tech"].includes(cView) && (
            <button className="sh-icon-btn" title="Expenses" aria-label="Expenses" onClick={() => setExpOpen(true)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </button>
          )}
          {["admin","manager","tech"].includes(cView) && (
            <button className="sh-icon-btn" title="Requests" aria-label="Requests" onClick={() => setReqOpen(true)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
          )}
          {["admin","manager"].includes(cView) && (
            <button className="sh-icon-btn" title="Team & Access" aria-label="Team & Access" onClick={() => setTaOpen(true)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span className="sh-icon-count">{teamCount}</span>
            </button>
          )}
          {["admin","manager","sales"].includes(cView) && (
            <button className="sh-icon-btn" title="Proposal Views" aria-label="Proposal Views" onClick={() => setPvwOpen(true)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {proposalViews.length > 0 && <span className="sh-icon-count">{proposalViews.length}</span>}
            </button>
          )}
          {["admin","manager"].includes(view) && (
            <div className="sh-preview-pick" ref={previewMenuRef}>
              <button className={`sh-icon-btn${previewRole ? " on" : ""}`}
                      title={previewRole ? `Exit ${previewRole} preview` : "Preview a role (read-only)"}
                      aria-label="Preview a role (read-only)"
                      onClick={() => setPreviewMenuOpen((v) => !v)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              {previewMenuOpen && (
                <div className="sh-preview-menu">
                  <button className={previewRole === "customer" ? "on" : ""}
                          onClick={() => { setPreviewRole(previewRole === "customer" ? null : "customer"); setPreviewMenuOpen(false); }}>
                    Customer Preview
                  </button>
                  <button className={previewRole === "tech" ? "on" : ""}
                          onClick={() => { setPreviewRole(previewRole === "tech" ? null : "tech"); setPreviewMenuOpen(false); }}>
                    Technician Preview
                  </button>
                  {previewRole && (
                    <button className="exit" onClick={() => { setPreviewRole(null); setPreviewMenuOpen(false); }}>
                      Exit preview
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {["admin","manager","sales"].includes(cView) && !isBrowsing && (
            <button
              className={`sh-flag-btn-icon${attention ? " on" : ""}`}
              title={attention ? "Clear attention flag" : "Flag for attention"}
              aria-label={attention ? "Clear attention flag" : "Flag for attention"}
              onClick={() => {
                if (attention) {
                  setAttSaving(true);
                  setAttentionAction(lp.access_id, false, "").then(() => {
                    setAttention(false); setAttentionNote(""); setShowNoteBox(false); setAttSaving(false);
                  });
                } else {
                  setShowNoteBox(true);
                }
              }}
              disabled={attSaving}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill={attention ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                <line x1="4" y1="22" x2="4" y2="15"/>
              </svg>
            </button>
          )}
          {["admin","manager","sales"].includes(cView) && !lp.lost_reason && (
            <button
              className="sh-icon-btn sh-close-btn"
              title="Close project"
              aria-label="Close project"
              onClick={() => setShowCloseModal(true)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </button>
          )}
        </div>
      </div>

      {showNoteBox && !isBrowsing && (
        <div className="sh-notebox">
          <textarea
            className="sh-textarea"
            placeholder="What needs attention? (optional)"
            value={attentionNote}
            onChange={(e) => setAttentionNote(e.target.value)}
            rows={2}
            autoFocus
          />
          <div className="sh-notebox-actions">
            <button className="sh-flag-btn" disabled={attSaving} onClick={() => {
              setAttSaving(true);
              setAttentionAction(lp.access_id, true, attentionNote).then(() => {
                setAttention(true); setShowNoteBox(false); setAttSaving(false);
              });
            }}>
              {attSaving ? "Saving…" : "Flag as Needs Attention"}
            </button>
            <button className="sh-cancel-btn" onClick={() => setShowNoteBox(false)}>Cancel</button>
          </div>
        </div>
      )}



      <ProgressBar
        type={project.project_type}
        stages={stageList}
        projectStage={barProjectStage}
        viewingStage={masterToPhaseKey(viewingStage)}
        onBrowse={(k) => browse(phaseLanding(k))}
        pctOverride={phasePct}
        justDone={justDone}
        canControl={canControl && !previewRole}
        onJump={(k) => doMove(phaseLanding(k))}
        missingFor={(k) => missingReqsFor(phaseLanding(k), lp, localAssignments)}
        role={cView}
        techSigned={!!proposalData?.tech_signed_name}
        custApproved={proposalData?.status === "accepted" || (proposalData?.accepted_options?.length > 0)}
        busy={busy}
        toast={jumpToast}
        setToast={setJumpToast}
      />
      {err && <div className="gw-error">{err}</div>}
      {view === "tech" && !isBrowsing && (
        <TechActionBar
          accessId={project.access_id}
          projectStage={projectStage}
          onStageChange={(s) => { onProjectStage(s); setViewingStage(s); }}
        />
      )}
      {!previewRole && (view === "admin" || view === "manager" || view === "tech") && projectStage === "qc" && (
        <WorkOrderPanel accessId={project.access_id} workOrders={workOrders} view={view} />
      )}
      {/* (Removed the "Your next step" hero — redundant with the tool card's own next-step tag.
          custStage/custPointer still drive the bar marker, landing, and % below.) */}
      {cView === "customer" && (
        <button type="button" onClick={() => setTourOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px auto 8px", padding: "4px 8px", background: "none", border: "none", color: "#9aa1af", fontSize: ".78rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Show me around
        </button>
      )}
      {tourOpen && (
        <CustomerTour accessId={lp.access_id} phone="(646) 396-0775"
          onClose={() => { setTourOpen(false); setLocalProj((p) => ({ ...p, tour_seen_at: p.tour_seen_at || new Date().toISOString() })); }} />
      )}
      {showAnnounce && (
        <PublishAnnounce
          announcement={announcement}
          onGo={() => ackAnnouncement(announcement.key, announcement.target)}
          onDismiss={() => ackAnnouncement(announcement.key, null)}
        />
      )}
      {locked && !previewRole && cView !== "customer" && (
        <div className="pv-lockbanner">
          <span className="pv-lockbanner-txt">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Project complete — locked for edits.
          </span>
          {["admin", "manager"].includes(view) && (
            <button type="button" className="pv-lockbanner-btn" onClick={async () => {
              const r = await completeProjectAction(lp.access_id, false);
              if (r?.ok) setLocalProj((p) => ({ ...p, completed_at: null }));
            }}>Reopen</button>
          )}
        </div>
      )}
      {["admin","manager","sales"].includes(cView) && pvwOpen && (
        <ProposalViews views={proposalViews} view={cView} onClose={() => setPvwOpen(false)} />
      )}
      {["admin","manager"].includes(view) && taOpen && (
        <div className="pv-modal-bg" onClick={(e) => { if (e.target.classList.contains("pv-modal-bg")) setTaOpen(false); }}>
          <div className="pv-modal pv-ta-modal">
            <button className="pv-modal-x" onClick={() => setTaOpen(false)}>✕</button>
            <div className="pv-ta-modal-head">
              <h2 className="pv-modal-title">Team &amp; Access</h2>
              <div className="pv-ap-head-right">
                <button
                  className={`pv-vis-toggle${restricted ? " restricted" : ""}`}
                  onClick={async () => {
                    const next = !restricted;
                    setRestricted(next);
                    await setRestrictedAction(lp.access_id, next);
                  }}
                  title={restricted ? "Restricted — assigned members only" : "Visible to all staff"}
                >
                  {restricted
                    ? <><span className="pv-vis-dot locked" />Restricted</>
                    : <><span className="pv-vis-dot open" />All Staff</>}
                </button>
                <span className="pv-ap-count">{teamCount} member{teamCount === 1 ? "" : "s"}</span>
              </div>
            </div>
            <div className="pv-ta-modal-body">
              <div className="pv-ap-list">
                {alwaysMembers.map(u => (
                  <div key={`always-${u.id}`} className="pv-ap-row pv-ap-row-link" onClick={() => window.open(`/users/${u.id}`, "_blank")} title="View profile">
                    <div className={`pv-ap-av pv-av-${u.role}`}>{(u.name||u.email||"?")[0].toUpperCase()}</div>
                    <div className="pv-ap-info">
                      <span className="pv-ap-name">{u.name || u.email}<span className="pv-ap-auto">always</span></span>
                    </div>
                    <span className={`pv-ap-role pv-role-${u.role}`}>{u.role}</span>
                    <span className="pv-ap-lock" title="Admins always have access and can't be removed">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>
                  </div>
                ))}
                {removableAssignments.map(a => {
                  const profileHref = a.user_id
                    ? `/users/${a.user_id}`
                    : a.role === "customer"
                      ? `/customers/${encodeURIComponent(lp.customer || lp.company_name || a.user_name || "")}`
                      : null;
                  return (
                  <div key={a.id}
                    className={`pv-ap-row${profileHref ? " pv-ap-row-link" : ""}`}
                    onClick={profileHref ? (e) => { if (!e.target.closest(".pv-ap-rm")) window.open(profileHref, "_blank"); } : undefined}
                    title={profileHref ? "View profile" : undefined}
                  >
                    <div className={`pv-ap-av pv-av-${a.role}`}>{(a.user_name||a.user_email||"?")[0].toUpperCase()}</div>
                    <div className="pv-ap-info">
                      <span className="pv-ap-name">{a.user_name || a.user_email}{a.role === "customer" && <span className="pv-ap-auto">inquiry contact</span>}</span>
                    </div>
                    <span className={`pv-ap-role pv-role-${a.role}`}>{a.role}</span>
                    <button className="pv-ap-rm" onClick={async(e)=>{
                      e.stopPropagation();
                      const r = await removeAssignmentAction(lp.access_id, a.id);
                      if (r.ok) setLocalAssignments(prev => prev.filter(x=>x.id!==a.id));
                    }}>✕</button>
                  </div>
                );
                })}
              </div>
            </div>
            <div className="pv-ta-modal-foot">
              <div className="pv-ap-add">
                {(() => {
                  const selStaff = addUserId ? staffUsers.find(u=>String(u.id)===String(addUserId)) : null;
                  const hasSel = !!selStaff || !!addEmail;
                  if (!hasSel) {
                    return (
                      <MemberSearch
                        staffUsers={staffUsers}
                        onPickStaff={u => { setAddUserId(String(u.id)); setAddEmail(""); }}
                        onPickCustomer={email => { setAddEmail(email); setAddUserId(""); }}
                      />
                    );
                  }
                  const role = selStaff ? (selStaff.role || "tech") : "customer";
                  const label = selStaff ? (selStaff.name || selStaff.email) : addEmail;
                  return (
                    <>
                      <div className="pv-ap-picked">
                        <div className={`pv-ap-av pv-av-${role}`}>{(label||"?")[0].toUpperCase()}</div>
                        <div className="pv-ap-info">
                          <span className="pv-ap-name">{label}</span>
                        </div>
                        <span className={`pv-ap-role pv-role-${role}`}>{role}</span>
                        <button className="pv-ap-picked-x" title="Clear" onClick={()=>{setAddUserId("");setAddEmail("");}}>✕</button>
                      </div>
                      <button className="pv-ap-grant" disabled={addSaving} onClick={async()=>{
                        // External customers must be identity-verified first; staff are added directly.
                        if (role === "customer") {
                          setVerifyCust({
                            userId: selStaff?.id ?? null,
                            name:   selStaff?.name ?? null,
                            email:  selStaff ? (selStaff.email ?? null) : addEmail,
                            phone:  selStaff?.phone ?? null,
                            address: lp.address || null,
                          });
                          return;
                        }
                        setAddSaving(true);
                        const r = await addAssignmentAction(lp.access_id, {
                          userId: selStaff?.id??null,
                          userName: selStaff?.name??null,
                          userEmail: selStaff ? (selStaff.email??null) : addEmail,
                          role
                        });
                        if (r.ok && !r.existed) {
                          setLocalAssignments(prev=>[...prev, {id:r.id, user_id:selStaff?.id??null, user_name:selStaff?.name??null, user_email:selStaff?(selStaff.email??null):addEmail, role}]);
                        }
                        setAddSaving(false); setAddUserId(""); setAddEmail("");
                      }}>{addSaving?"…":"Grant Access"}</button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {verifyCust && (
        <div className="pv-modal-bg" onClick={(e) => { if (e.target.classList.contains("pv-modal-bg")) setVerifyCust(null); }}>
          <div className="pv-modal pv-verify-modal">
            <button className="pv-modal-x" onClick={() => setVerifyCust(null)}>✕</button>
            <div className="pv-verify-icon">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
            </div>
            <h2 className="pv-modal-title">Verify customer identity</h2>
            <p className="pv-modal-sub">Confirm these details before granting an external customer access — this prevents adding the wrong person.</p>
            <div className="pv-verify-rows">
              <div className="pv-verify-row"><span>Name</span><b>{verifyCust.name || <em>— not on file —</em>}</b></div>
              <div className="pv-verify-row"><span>Email</span><b>{verifyCust.email || <em>—</em>}</b></div>
              <div className="pv-verify-row"><span>Phone</span><b>{verifyCust.phone ? fmtPhone(verifyCust.phone) : <em>— not on file —</em>}</b></div>
              <div className="pv-verify-row"><span>Address</span><b>{verifyCust.address || <em>— not on file —</em>}</b></div>
            </div>
            <div className="pv-verify-acts">
              <button className="pv-verify-confirm" disabled={addSaving} onClick={async () => {
                setAddSaving(true);
                const c = verifyCust;
                const r = await addAssignmentAction(lp.access_id, { userId: c.userId, userName: c.name, userEmail: c.email, role: "customer" });
                if (r.ok && !r.existed) {
                  setLocalAssignments(prev => [...prev, { id: r.id, user_id: c.userId, user_name: c.name, user_email: c.email, role: "customer" }]);
                }
                setAddSaving(false); setVerifyCust(null); setAddUserId(""); setAddEmail("");
              }}>{addSaving ? "Adding…" : "Confirm & Grant Access"}</button>
              <button className="pv-verify-cancel" onClick={() => setVerifyCust(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {gateMsg && ["customer", "tech"].includes(cView) && (
        <div className="pv-custview-hint-bar" style={{ background: "#F3E9D3", color: "#7a5f1f" }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
          {gateMsg}
        </div>
      )}

      {/* First-login welcome — the customer confirms their contact details once, before anything else. */}
      {cView === "customer" && !previewRole && !lp.info_confirmed_at && (
        <InfoConfirmModal
          accessId={lp.access_id}
          project={lp}
          onDone={() => { setLocalProj((p) => ({ ...p, info_confirmed_at: new Date().toISOString() })); setLeadConfirmed(true); }}
        />
      )}

      {/* ============ SURVEY phase (inquiry + site_survey merged) ============
          Customer flow: ① confirm/edit their info → ② schedule the appointment → then the Site
          Survey + Mockup review below. Staff keep the scheduling + notes/POC tools. */}
      {vPhase === "ph_survey" && cView === "customer" && (
        <div className="pv-survey-tools flow-wrap" style={{ marginBottom: 14 }}>
          <FlowStep n={1} total={2} status={leadConfirmed ? "done" : "active"} color="#C9A96E"
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
            title="Your Information" sub="Confirm the details we have — or fix anything that's wrong.">
            <LeadInfoStep accessId={lp.access_id} project={lp} preview={!!previewRole} onConfirmed={() => setLeadConfirmed(true)} />
          </FlowStep>
          <FlowStep n={2} total={2} status={lp.date ? "done" : leadConfirmed ? "active" : "upcoming"} color="#C9A96E"
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
            title="Schedule Your Appointment" sub="Pick a time for your free walkthrough & demo."
            chip={lp.date ? <span className="pv-tool-chip">Scheduled · {fmtDate(lp.date)}</span> : null} completable>
            <SchedulingWidget
              accessId={lp.access_id}
              assignments={localAssignments}
              staffUsers={staffUsers}
              currentUser={currentUser}
              project={lp}
              view={view}
              customerView={!!previewRole}
            />
          </FlowStep>
        </div>
      )}
      {vPhase === "ph_survey" && cView !== "customer" && (
        <div className="pv-survey-tools flow-wrap" style={{ marginBottom: 14 }}>
          {/* Survey Scheduling + Details & Notes merged into one card (booking + POC + questions). */}
          <FlowStep status={lp.date ? "done" : "active"} color="#C9A96E"
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
            title="Survey Scheduling &amp; Notes" sub="Book the visit · Point of contact · Questions"
            chip={lp.date ? <span className="pv-tool-chip">Scheduled · {fmtDate(lp.date)}</span> : null} completable>
            <SchedulingWidget
              accessId={lp.access_id}
              assignments={localAssignments}
              staffUsers={staffUsers}
              currentUser={currentUser}
              project={lp}
              view={view}
              customerView={!!previewRole}
            />
            <div style={{ height: 1, background: "var(--line,#e6e8ee)", margin: "16px 0 4px" }} />
            <InquiryExtras accessId={lp.access_id} project={lp} role={cView} preview={!!previewRole} />
          </FlowStep>
        </div>
      )}

      {/* Site Survey + Mockup (numbered flow) — the rest of the Survey phase. */}
      {vPhase === "ph_survey" && (
        (() => {
          // Data-aware survey review. Customer only sees a tool if it has data to review, and
          // approves each such tool at its own footer. If NOTHING has data → smooth sailing.
          const isCust = cView === "customer";
          const svMeta = toolMeta?.survey || { has: false };
          const mkMeta = toolMeta?.mockup || { has: false };
          // The office's Submit gates on "has data". Server tool-meta lags a poll behind an edit, so
          // fold in the widget's live signal — Submit lights up the instant a device/background lands.
          const svMetaEff = { ...svMeta, has: svMeta.has || surveyHasLocal };
          const mkMetaEff = { ...mkMeta, has: mkMeta.has || mockupHasLocal };
          const showSurvey = isCust ? svMeta.has : true;   // staff always see both to build them
          const showMockup = isCust ? mkMeta.has : true;
          const onApprove = (a) => { setAcceptances(a); setGateMsg(null); refreshAcceptances(); };
          if (isCust && acceptLoaded && !svMeta.has && !mkMeta.has) {
            return <SmoothSailing preview={!!previewRole} onContinue={() => browse("proposal")} />;
          }
          // Numbered tool flow: survey → mockup, each a step that's done / active / upcoming.
          // "Done" = customer approved (or, for staff building, submitted) AND the tool hasn't
          // changed since — toolAccepted() is fingerprint-aware, so editing a tool after approval
          // re-opens its step (matches the "review & approve again" gate).
          const order = [];
          if (showSurvey) order.push("survey");
          if (showMockup) order.push("mockup");
          const doneMap = {
            survey: isCust ? toolAccepted(svMeta, acceptances.site_survey) : toolAccepted(svMeta, acceptances.submit_site_survey),
            mockup: isCust ? toolAccepted(mkMeta, acceptances.mockup)      : toolAccepted(mkMeta, acceptances.submit_mockup),
          };
          const firstActive = order.find((k) => !doneMap[k]);
          const stepStatus  = (k) => (doneMap[k] ? "done" : k === firstActive ? "active" : "upcoming");
          const stepNum     = (k) => order.indexOf(k) + 1;
          const stepTotal   = order.length;
          return (
        <AccordionProvider key="survey">
        <div className="pv-survey-tools flow-wrap">
          {/* Site Survey tool */}
          {showSurvey && (
            <FlowStep n={stepNum("survey")} total={stepTotal} status={stepStatus("survey")} color="#C9A96E"
              icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>}
              title="Site Survey" sub="Floor plans · Device placement · Multi-floor · Auto-save"
              chip={svMeta.has && isCust ? <span className="pv-tool-chip go">Review &amp; approve</span> : null}
              headerAction={<ToolSubmitButton accessId={lp.access_id} stageKey="site_survey" meta={svMetaEff}
                acceptance={acceptances.site_survey} submission={acceptances.submit_site_survey} role={cView} preview={!!previewRole} onChange={onApprove} />}>
              <SiteSurveyWidget
                accessId={lp.access_id}
                view={view}
                customerView={!!previewRole}
                noApproval
                customerName={lp.contact_name || lp.customer}
                onHasData={setSurveyHasLocal}
              />
              <ToolApproveBar accessId={lp.access_id} stageKey="site_survey" meta={svMetaEff}
                acceptance={acceptances.site_survey} submission={acceptances.submit_site_survey} role={cView} preview={!!previewRole} onChange={onApprove} />
              <SurveyComments accessId={lp.access_id} role={cView} preview={!!previewRole} />
            </FlowStep>
          )}

          {/* Camera Mockup — Admin/Manager/Sales build it; every other role (Customer, Technician, …) sees it read-only. */}
          {showMockup && (
            <FlowStep n={stepNum("mockup")} total={stepTotal} status={stepStatus("mockup")} color="#C9A96E"
              icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>}
              title="Mockups" sub="System diagrams · Product photos · Design references"
              chip={mkMeta.has && isCust ? <span className="pv-tool-chip go">Review &amp; approve</span> : null}
              headerAction={<ToolSubmitButton accessId={lp.access_id} stageKey="mockup" meta={mkMetaEff}
                acceptance={acceptances.mockup} submission={acceptances.submit_mockup} role={cView} preview={!!previewRole} onChange={onApprove} />}>
              <MockupWidget
                accessId={lp.access_id}
                view={view}
                customerView={!!previewRole}
                noApproval
                customerName={lp.contact_name || lp.customer}
                onHasData={setMockupHasLocal}
              />
              <ToolApproveBar accessId={lp.access_id} stageKey="mockup" meta={mkMetaEff}
                acceptance={acceptances.mockup} submission={acceptances.submit_mockup} role={cView} preview={!!previewRole} onChange={onApprove} />
            </FlowStep>
          )}

          {/* Continue — customer only, once everything with data is approved */}
          {isCust && (svMeta.has || mkMeta.has) && (
            <div className="pv-survey-continue">
              {surveyOk ? (
                <button className="pv-continue-btn" disabled={!!previewRole} onClick={() => browse("proposal")}>
                  Everything approved — Continue to Proposal →
                </button>
              ) : (
                <div className="pv-continue-hint">Open each item above and approve it to continue to your proposal.</div>
              )}
            </div>
          )}
        </div>
        </AccordionProvider>
          );
        })()
      )}
      {/* Lead Card removed — its fields (incl. Source + intake Notes) now live in the
          "Customer Information" collapsible at the top of the page. */}

      {/* ============ PROPOSAL phase (proposal + approval & deposit merged) ============ */}
      {/* Proposal Views moved to the header icon row (setPvwOpen) — the modal is mounted below. */}
      {/* Accordion: the proposal document and the deposit panel open one at a time — accept+sign the
          proposal and the deposit takes over as the open step. */}
      {vPhase === "ph_proposal" && (
      <AccordionProvider key="proposal">
      {vPhase === "ph_proposal" && ["admin", "manager", "sales", "customer", "tech"].includes(cView) && (
        <>
          {/* Tech's "Work Order Created" page: general job overview above the work order itself */}
          {cView === "tech" && <TechProjectBoard project={lp} />}
          <ProposalPanel
            accessId={lp.access_id}
            view={view}
            cView={cView}
            custView={!!previewRole}
            proposal={proposalData}
            onProposalChange={setProposalData}
            onAdvance={(stageKey) => browse(stageKey)}
            onStageSync={syncStage}
            customerName={lp.contact_name || lp.customer}
            customerAddress={lp.address}
            customerPhone={lp.contact_phone}
            customerEmail={lp.contact_email}
            signerName={currentUser?.name || currentUser?.email || ""}
            assignedTech={lp.tech || null}
          />
        </>
      )}
      {vPhase === "ph_proposal" && ["admin", "manager", "customer"].includes(cView) && (
        <ApprovalPanel
          accessId={lp.access_id}
          role={cView}
          stage="approval_deposit"
          customerName={lp.contact_name || lp.customer}
          customerAddress={lp.address}
          onStageChange={(s) => { onProjectStage(s); setViewingStage(s); }}
          onBrowseStage={(s) => browse(s)}
        />
      )}
      {/* Third card: Create Work Order — assign the technician(s), set their payout (the pricing
          editor, moved here from Install), and create the work order once signed + deposit are in. */}
      {vPhase === "ph_proposal" && ["admin", "manager"].includes(cView) && proposalData?.payload?.options?.length > 0 && (
        <WorkOrderCard
          accessId={lp.access_id}
          proposal={proposalData}
          onProposalChange={setProposalData}
          assignments={localAssignments}
          staffUsers={staffUsers}
          onAssignmentsChange={setLocalAssignments}
          onStageChange={(s) => { onProjectStage(s); setViewingStage(s); }}
        />
      )}
      </AccordionProvider>
      )}

      {/* ============ CLOSEOUT phase (step 4: System QR handover → QC → final payment) ============ */}
      {vPhase === "ph_wrap" && ["admin", "manager", "tech"].includes(cView) && (
        // System QR handover — moved here from Install so it sits at the top of the closeout steps.
        <SystemQrTool accessId={lp.access_id} customerName={lp.company_name || lp.contact_name || lp.customer} systemQr={lp.system_qr} />
      )}
      {vPhase === "ph_wrap" && (
        // Quality-control checklist — office/tech verify each device; customer sees a read-only summary.
        <QCChecklist
          accessId={lp.access_id}
          proposal={proposalData}
          customerName={lp.contact_name || lp.customer}
          role={cView}
          readOnly={!!previewRole || cView === "customer" || locked}
          userName={currentUser?.name || currentUser?.email || ""}
          onStageChange={(s) => { onProjectStage(s); setViewingStage(s); }}
        />
      )}
      {vPhase === "ph_wrap" && ["admin", "manager", "customer"].includes(cView) && (
        <ApprovalPanel
          accessId={lp.access_id}
          role={cView}
          stage="payment"
          customerName={lp.contact_name || lp.customer}
          customerAddress={lp.address}
          onStageChange={(s) => { onProjectStage(s); setViewingStage(s); }}
          onBrowseStage={(s) => browse(s)}
        />
      )}

      {/* ============ COMPLETION phase (step 5: read-only "all done" wrap-up) ============ */}
      {vPhase === "ph_complete" && (
        // Completion — certificate, warranty, welcome guide (customer) + internal wrap-up (staff).
        <CompletionPanel
          project={lp}
          proposal={proposalData}
          role={cView}
          readOnly={!!previewRole || cView === "tech"}
          onStageChange={(s) => { onProjectStage(s); setViewingStage(s); }}
          onBrowseStage={(s) => browse(s)}
          onCompletedChange={(ts) => setLocalProj((p) => ({ ...p, completed_at: ts }))}
        />
      )}

      {/* ============ INSTALL phase (fulfillment + install) ============ */}
      {vPhase === "ph_install" && cView === "tech" && (
        // Numbered flow: ① Equipment checklist (locked until WO accepted + install day) → ② Addendum.
        // (System QR handover moved to the Closeout phase.)
        (() => {
          const woAccepted = !!proposalData?.tech_signed_name;
          const iDate = lp.install_date || lp.date || null;
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const dOpen = iDate ? (new Date(iDate + "T00:00:00") <= today) : false;
          const unlocked = woAccepted && dOpen;
          const total = unlocked ? 2 : 1;
          return (
            <AccordionProvider key="install-tech">
            <div className="pv-survey-tools flow-wrap">
              {!unlocked ? (
                <FlowStep n={1} total={total} status="upcoming" color="#C9A96E" bare>
                  {!woAccepted
                    ? <div className="pv-lockcard"><b>Accept the work order first.</b><span>Head back to <a onClick={() => browse("proposal")}>Work Order Created</a> and sign to accept — the equipment checklist unlocks after that.</span></div>
                    : <div className="pv-lockcard"><b>{iDate ? `Opens on install day — ${fmtDate(iDate)}.` : "Install date not scheduled yet."}</b><span>Your equipment checklist becomes available the day of the install.</span></div>}
                </FlowStep>
              ) : (
                <>
                  <FlowStep n={1} total={2} status={installDone ? "done" : "active"} color="#C9A96E" title="Installation Work Order" completable bare>
                    <InstallChecklist accessId={lp.access_id} proposal={proposalData} customerName={lp.contact_name || lp.customer} customerAddress={lp.address} role="tech" readOnly={!!previewRole || locked} userName={currentUser?.name || currentUser?.email || ""} onProgress={(p) => setInstallDone(!!p.allDone)} staffUsers={staffUsers} />
                  </FlowStep>
                  <FlowStep n={2} total={2} status="open" color="#C9A96E" title="Job-Site Add-ons" completable bare>
                    <InstallAddendum accessId={lp.access_id} role="tech" readOnly customerName={lp.contact_name || lp.customer} />
                  </FlowStep>
                </>
              )}
            </div>
            </AccordionProvider>
          );
        })()
      )}
      {vPhase === "ph_install" && ["admin", "manager"].includes(cView) && (
        // Office builds/customizes the install work order (add/delete line items, payout toggle).
        <AccordionProvider key="install-staff">
        <div className="pv-survey-tools flow-wrap">
          <FlowStep status={installEvents > 0 ? "done" : "active"} color="#C9A96E" title="Install Scheduling"
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
            sub="Book the install visit · Pick a time window" bare>
            <SchedulingWidget
              accessId={lp.access_id}
              assignments={localAssignments}
              staffUsers={staffUsers}
              currentUser={currentUser}
              project={lp}
              view={view}
              customerView={!!previewRole}
              defaultTitle="IOT TECHS — Installation"
              onCount={setInstallEvents}
            />
          </FlowStep>
          <FlowStep status="open" color="#C9A96E" title="Shipment Tracking"
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="15" height="10" rx="1"/><path d="M16 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="1.5"/><circle cx="18" cy="18" r="1.5"/></svg>}
            sub="Package tracking · equipment received" completable autoComplete={shipStatus.delivered}
            canComplete={shipStatus.count > 0} cantHint="Add a tracking number first" bare>
            <ShipmentTracking accessId={lp.access_id} role={cView} preview={!!previewRole} proposal={proposalData} onStatus={setShipStatus} />
          </FlowStep>
          <FlowStep n={1} total={2} status={installDone ? "done" : "active"} color="#C9A96E" title="Installation Work Order" completable bare>
            <InstallChecklist accessId={lp.access_id} proposal={proposalData} customerName={lp.contact_name || lp.customer} customerAddress={lp.address} role={cView} readOnly={!!previewRole || locked} userName={currentUser?.name || currentUser?.email || ""} onProgress={(p) => setInstallDone(!!p.allDone)} staffUsers={staffUsers} />
          </FlowStep>
          <FlowStep n={2} total={2} status="open" color="#C9A96E" title="Job-Site Add-ons" completable bare>
            <InstallAddendum accessId={lp.access_id} role={cView} readOnly={!!previewRole || locked} customerName={lp.contact_name || lp.customer} onCount={setAddonCount} />
          </FlowStep>
        </div>
        </AccordionProvider>
      )}
      {vPhase === "ph_install" && cView === "customer" && (
        // Customer just watches the install progress — no editing, no pricing.
        <AccordionProvider key="install-cust">
        <div className="pv-survey-tools flow-wrap">
          <FlowStep status={installEvents > 0 ? "done" : "active"} color="#C9A96E" title="Install Scheduling"
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
            sub="Your install visit" bare>
            <SchedulingWidget
              accessId={lp.access_id}
              assignments={localAssignments}
              staffUsers={staffUsers}
              currentUser={currentUser}
              project={lp}
              view={view}
              customerView={!!previewRole}
              defaultTitle="IOT TECHS — Installation"
              onCount={setInstallEvents}
            />
          </FlowStep>
          {/* Shipment Tracking — the customer only sees it once the office posts a tracking number. */}
          {(toolMeta?.tracking?.count > 0) && (
          <FlowStep status="open" color="#C9A96E" title="Shipment Tracking"
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="15" height="10" rx="1"/><path d="M16 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="1.5"/><circle cx="18" cy="18" r="1.5"/></svg>}
            sub="Package tracking · equipment received" completable
            autoComplete={shipStatus.delivered || toolMeta?.tracking?.delivered} bare>
            <ShipmentTracking accessId={lp.access_id} role={cView} preview={!!previewRole} proposal={proposalData} onStatus={setShipStatus} />
          </FlowStep>
          )}
          <FlowStep n={1} total={2} status={installDone ? "done" : "active"} color="#C9A96E" title="Installation Work Order" completable bare>
            <InstallChecklist accessId={lp.access_id} proposal={proposalData} customerName={lp.contact_name || lp.customer} customerAddress={lp.address} role="customer" readOnly onProgress={(p) => setInstallDone(!!p.allDone)} />
          </FlowStep>
          {/* Job-Site Add-ons — hidden until the office submits a change order for them to approve. */}
          {(toolMeta?.addendum?.count > 0) && (
          <FlowStep n={2} total={2} status="open" color="#C9A96E" title="Job-Site Add-ons" completable bare>
            <InstallAddendum accessId={lp.access_id} role="customer" readOnly={!!previewRole} customerName={lp.contact_name || lp.customer} onCount={setAddonCount} />
          </FlowStep>
          )}
        </div>
        </AccordionProvider>
      )}

      {/* Next-step CTA — moved out from under the progress bar to the bottom of the tool list. */}
      {!lp.lost_reason && (
        <StageAdvance
          role={cView}
          busy={busy}
          techSigned={!!proposalData?.tech_signed_name}
          custApproved={proposalData?.status === "accepted" || (proposalData?.accepted_options?.length > 0)}
          missingFor={(k) => missingReqsFor(phaseLanding(k), lp, localAssignments)}
          projectStage={barProjectStage}
          stages={stageList}
          canControl={canControl && !previewRole}
          onBrowse={(k) => browse(phaseLanding(k))}
          onJump={(k) => doMove(phaseLanding(k))}
        />
      )}
      {["admin","manager","sales"].includes(view) && lp.lost_reason && (
        <div className="pv-close-bar" style={{ gap: 10 }}>
          <div className="pv-lost-notice">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Project closed · <strong>{lp.lost_reason}</strong>
            {lp.lost_at && <span className="pv-lost-when"> · {new Date(lp.lost_at + "Z").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>}
          </div>
          {["admin","manager"].includes(view) && (
            <button className="pv-reopen-btn" disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await reactivateProjectAction(lp.access_id);
              setBusy(false);
              if (!r?.error) setLocalProj((p) => ({ ...p, lost_reason: null, lost_at: null }));
            }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
              Reopen project
            </button>
          )}
        </div>
      )}

      {showCloseModal && (
        <div className="pv-modal-bg" onClick={(e) => { if (e.target.classList.contains("pv-modal-bg")) setShowCloseModal(false); }}>
          <div className="pv-modal">
            <button className="pv-modal-x" onClick={() => setShowCloseModal(false)}>✕</button>
            <div className="pv-modal-icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#e74c3c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <h2 className="pv-modal-title">Close Project</h2>
            <p className="pv-modal-sub">Why is {lp.customer || "this customer"} not moving forward?</p>
            <div className="pv-close-reasons">
              {[
                ["Price / Budget",      "Price / Budget"],
                ["Scheduling Conflict", "Scheduling Conflict"],
                ["Ghosted",             "Ghosted"],
                ["No Answer",           "No Answer"],
                ["Needs More Time",     "Needs More Time"],
                ["Went with Competitor","Went with Competitor"],
                ["Job Too Small",       "Job Too Small"],
                ["Project Cancelled",   "Project Cancelled"],
              ].map(([label, value]) => (
                <button
                  key={value}
                  className="pv-reason-chip"
                  disabled={closeSaving}
                  onClick={async () => {
                    setCloseSaving(true);
                    setCloseErr("");
                    const r = await closeProjectAction(lp.access_id, value);
                    if (r.ok) {
                      setLocalProj(p => ({ ...p, lost_reason: value, lost_at: new Date().toISOString().slice(0,19) }));
                      setShowCloseModal(false);
                    } else {
                      setCloseErr(r.error || "Could not close project.");
                    }
                    setCloseSaving(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {closeErr && <div className="pv-close-err">{closeErr}</div>}
          </div>
        </div>
      )}

      {expOpen && (view === "admin" || view === "manager" || view === "tech") && (
        <div className="pv-modal-bg" onClick={(e) => { if (e.target.classList.contains("pv-modal-bg")) setExpOpen(false); }}>
          <div className="pv-modal pv-wo-modal">
            <button className="pv-modal-x" onClick={() => setExpOpen(false)}>✕</button>
            <ExpensePanel accessId={project.access_id} expenses={expenses} view={view} startOpen />
          </div>
        </div>
      )}
      {reqOpen && (view === "admin" || view === "manager" || view === "tech") && (
        <div className="pv-modal-bg" onClick={(e) => { if (e.target.classList.contains("pv-modal-bg")) setReqOpen(false); }}>
          <div className="pv-modal pv-wo-modal">
            <button className="pv-modal-x" onClick={() => setReqOpen(false)}>✕</button>
            <RequestPanel accessId={project.access_id} requests={requests} view={view} startOpen />
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingMove}
        title={pendingMove ? `Set step to ${stageLabel(pendingMove.stageKey)}?` : ""}
        message={pendingMove && (
          <>
            Before advancing, these still look incomplete:
            <ul style={{ margin: "10px 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {pendingMove.missing.map((m) => <li key={m} style={{ color: "#c0392b", fontWeight: 600 }}>{m}</li>)}
            </ul>
            You can set the step anyway, or cancel and finish them first.
          </>
        )}
        confirmLabel="Set step anyway"
        busy={busy}
        onConfirm={() => { const k = pendingMove.stageKey; setPendingMove(null); doMove(k); }}
        onCancel={() => setPendingMove(null)}
      />
      {/* Activity Log hidden per owner (2026-07-07) — it's demo data anyway; bring back once
          the real per-project event feed exists. Component + styles kept: <ActivityLog view={view} /> */}

      {/* Live-update toast — something changed on the other end (staff moved the stage, the
          customer signed/paid/approved) while this page was open. Picked up by the poll above. */}
      {liveToast && (
        <div className="live-toast">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {liveToast}
        </div>
      )}

      {/* Stage-advance celebration — the forward-motion moment, one notch above a plain toast. */}
      {celebrate && (
        <div className="stage-burst" key={celebrate}>
          <span className="sbx-check"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
          <span className="sbx-msg">{cView === "customer" ? "You've reached" : "Advanced to"} <b>{celebrate}</b></span>
        </div>
      )}
    </>
  );
}

function speedStatus(mbps) {
  const n = parseFloat(mbps);
  if (isNaN(n)) return null;
  if (n < 20)  return { label: "Slow",      color: "#7E8699" };
  if (n < 60)  return { label: "Moderate",  color: "#E09A3A" };
  if (n < 100) return { label: "Good",      color: "#C9A96E" };
  if (n < 200) return { label: "Great",     color: "#5DB87A" };
  return              { label: "Excellent", color: "#5BC4D8" };
}

// ---- Email / phone + password login form (inside gateway) ----
function LoginForm({ busy, onSubmit }) {
  const [cred, setCred]   = useState("");
  const [pass, setPass]   = useState("");
  const [err,  setErr]    = useState(null);
  const [sub,  setSub]    = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!cred.trim() || !pass) return;
    setErr(null); setSub(true);
    const res = await onSubmit(cred.trim(), pass);
    setSub(false);
    if (!res.ok) setErr(res.error || "Invalid credentials.");
  }

  return (
    <form className="gw2-lf" onSubmit={handleSubmit}>
      <div className="gw2-prompt">Sign in</div>
      <div className="gw2-lf-fields">
        <input
          className="gw2-lf-input"
          type="text"
          autoComplete="username"
          value={cred}
          onChange={(e) => setCred(e.target.value)}
          disabled={busy || sub}
        />
        <input
          className="gw2-lf-input"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          disabled={busy || sub}
        />
      </div>
      {err && <div className="gw2-lf-err">{err}</div>}
      <button className="gw2-lf-btn" type="submit" disabled={busy || sub || !cred.trim() || !pass}>
        {sub ? "Signing in…" : "Sign In →"}
      </button>
    </form>
  );
}

// ---- New dark PIN gateway screen ----
function GatewayScreen({ onAuthenticated, attemptAccess }) {
  const [pin, setPin]             = useState("");
  const [dotState, setDotState]   = useState(""); // "" | "ok" | "err"
  const [attempts, setAttempts]   = useState(0);
  const [locked, setLocked]       = useState(false);
  const [busy, setBusy]           = useState(false);
  const [bannerMsg, setBannerMsg] = useState("");
  const [mode, setMode]           = useState("pin");
  const [showHelp, setShowHelp]   = useState(false);
  const [showLoc,     setShowLoc]     = useState(false);
  const [speedTesting, setSpeedTesting] = useState(false);
  const [locData,  setLocData]    = useState({ city: "—", state: "—", lat: null, lng: null, ip: "—", provider: "—", speed: null, device: null });
  const speedRunId = useRef(0);
  const [cardWarp, setCardWarp]   = useState(false);
  const [granted, setGranted]     = useState(false);
  const [needsClear, setNeedsClear] = useState(false);
  const canvasRef    = useRef(null);
  const canvasCtrl   = useRef(null);
  // use refs so rapid taps read current value without waiting for re-render
  const pinRef       = useRef("");
  const needsClearRef = useRef(false);
  const lockedRef    = useRef(false);
  const busyRef      = useRef(false);

  function syncPin(v)    { pinRef.current = v;        setPin(v); }
  function syncLocked(v) { lockedRef.current = v;     setLocked(v); }
  function syncBusy(v)   { busyRef.current = v;       setBusy(v); }
  function syncClear(v)  { needsClearRef.current = v; setNeedsClear(v); }

  useEffect(() => {
    const ctrl = startPinCanvas(canvasRef.current);
    canvasCtrl.current = ctrl;
    return ctrl.cleanup;
  }, []);

  function addDigit(d) {
    if (lockedRef.current || busyRef.current) return;
    let base = pinRef.current;
    if (needsClearRef.current) { syncClear(false); setDotState(""); setBannerMsg(""); base = ""; syncPin(""); }
    if (base.length >= 4) return;
    const next = base + d;
    syncPin(next);
    if (next.length === 4) setTimeout(() => doSubmit(next), 0);
  }

  function delDigit() {
    if (lockedRef.current || busyRef.current) return;
    const next = pinRef.current.slice(0, -1);
    syncPin(next);
  }

  async function doSubmit(code) {
    syncBusy(true);
    const res = await attemptAccess({ pinValue: code });
    if (res.ok) {
      setDotState("ok");
      syncBusy(false);
      setTimeout(() => { setCardWarp(true); if (canvasCtrl.current) canvasCtrl.current.startWarp(); }, 240);
      setTimeout(() => setGranted(true), 1550);
      setTimeout(() => onAuthenticated(res.view), 2400);
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setDotState("err");
      const left = 3 - next;
      if (left <= 0) {
        setBannerMsg("Account locked — contact support");
        syncLocked(true);
        setTimeout(() => setShowHelp(true), 550);
      } else {
        setBannerMsg(left + (left === 1 ? " attempt" : " attempts") + " left");
        setTimeout(() => { syncClear(true); syncBusy(false); }, 3000);
      }
    }
  }

  // Background prefetch on mount — data ready before modal opens
  useEffect(() => {
    let cancelled = false;

    // Detect device type synchronously
    const ua = navigator.userAgent;
    const isTablet = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    const isMobile = !isTablet && /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    setLocData((prev) => ({ ...prev, device: isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop" }));

    // Fetch IP/location — ipinfo.io first, ipapi.co as fallback
    async function fetchIp() {
      const apis = [
        { url: "https://ipinfo.io/json", parse: (d) => ({
          city: d.city || "—", state: d.region || "—",
          lat: d.loc ? parseFloat(d.loc.split(",")[0]) : null,
          lng: d.loc ? parseFloat(d.loc.split(",")[1]) : null,
          ip: d.ip || "—", provider: d.org || "—",
        })},
        { url: "https://ipapi.co/json/", parse: (d) => ({
          city: d.city || "—", state: d.region_code || "—",
          lat: d.latitude || null, lng: d.longitude || null,
          ip: d.ip || "—", provider: d.org || "—",
        })},
      ];
      for (const api of apis) {
        try {
          const r = await fetch(api.url, { cache: "no-store" });
          if (!r.ok) continue;
          const d = await r.json();
          const parsed = api.parse(d);
          if (!cancelled && (parsed.ip !== "—" || parsed.city !== "—")) {
            setLocData((prev) => ({ ...prev, ...parsed }));
            return;
          }
        } catch {}
      }
    }
    fetchIp();

    runSpeedTest();
    return () => { cancelled = true; speedRunId.current++; };
  }, []);

  async function runSpeedTest() {
    const runId = ++speedRunId.current;
    const gone  = () => speedRunId.current !== runId;
    setSpeedTesting(true);
    setLocData((prev) => ({ ...prev, speed: null }));

    async function measurePhase(parallel, size) {
      const t0 = performance.now();
      const bytes = await Promise.all(
        Array.from({ length: parallel }, () =>
          fetch(`https://speed.cloudflare.com/__down?bytes=${size}`, { cache: "no-store" })
            .then((r) => r.arrayBuffer()).then((b) => b.byteLength).catch(() => 0)
        )
      );
      const total = bytes.reduce((a, b) => a + b, 0);
      const secs  = (performance.now() - t0) / 1000;
      return total > 0 ? (total * 8) / 1e6 / secs : null;
    }

    try { await fetch("https://speed.cloudflare.com/__down?bytes=200000", { cache: "no-store" }); } catch {}
    if (gone()) return;
    const p1 = await measurePhase(4, 1000000);
    if (!gone() && p1) setLocData((prev) => ({ ...prev, speed: p1.toFixed(1) }));
    if (gone()) return;
    const p2 = await measurePhase(4, 3000000);
    if (!gone()) {
      if (p2) setLocData((prev) => ({ ...prev, speed: (p1 ? (p1 + p2) / 2 : p2).toFixed(1) }));
      setSpeedTesting(false);
    }
  }

  function openLoc() { setShowLoc(true); }

  async function loginAs(role) {
    setBusy(true);
    const res = await attemptAccess({ loginRole: role });
    setBusy(false);
    if (res.ok) { setGranted(true); setTimeout(() => onAuthenticated(res.view), 700); }
  }

  async function loginWithCredentials(emailOrPhone, password) {
    setBusy(true);
    const res = await attemptAccess({ emailOrPhone, password });
    setBusy(false);
    if (res.ok) {
      setDotState("ok");
      setTimeout(() => { setCardWarp(true); if (canvasCtrl.current) canvasCtrl.current.startWarp(); }, 240);
      setTimeout(() => setGranted(true), 1550);
      setTimeout(() => onAuthenticated(res.view), 2400);
    }
    return res;
  }

  // keyboard support
  useEffect(() => {
    function onKey(e) {
      if (mode !== "pin" || showHelp || locked || busy) return;
      if (e.key >= "0" && e.key <= "9") addDigit(e.key);
      else if (e.key === "Backspace") { e.preventDefault(); delDigit(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const displayPin = needsClear ? "" : pin;

  return (
    <div className="gw2-root">
      <div className="gw2-aura" />
      <div className="gw2-grid" />
      <canvas ref={canvasRef} className="gw2-net" />

      {granted && (
        <div className="gw2-granted">
          <div className="gw2-gck">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.2 4.2L19 7"/>
            </svg>
          </div>
          <h2>ACCESS GRANTED</h2>
          <p>Welcome back</p>
        </div>
      )}

      <div className={`gw2-card${cardWarp ? " gw2-warp" : ""}${dotState === "ok" ? " gw2-unlocked" : ""}`}>
        <div className="gw2-ring" />
        <div className="gw2-brand">
          <div className="gw2-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3"/><circle cx="12" cy="15.5" r="1.4"/>
            </svg>
          </div>
          <h1>IOT&nbsp;TECHS</h1>
          <div className="gw2-subtag">Secure Access</div>
        </div>

        {mode === "pin" ? (
          <>
            <div className={`gw2-prompt${dotState === "ok" ? " ok" : dotState === "err" ? " err" : ""}`}>
              {dotState === "ok" ? "Access granted" : dotState === "err" ? "Incorrect PIN" : "Enter your PIN"}
            </div>
            {bannerMsg && <div className="gw2-banner">{bannerMsg}</div>}
            <div className="gw2-dots">
              {[0,1,2,3].map((i) => (
                <div key={i} className={`gw2-dot${displayPin.length > i ? " fill" : ""}${displayPin.length > i && dotState ? " " + dotState : ""}`} />
              ))}
            </div>
            <div className={`gw2-keys${locked ? " gw2-locked" : ""}`}>
              {[1,2,3,4,5,6,7,8,9].map((n) => (
                <button key={n} className="gw2-key" onClick={() => addDigit(String(n))} disabled={locked || busy}>{n}</button>
              ))}
              <button className="gw2-key gw2-loc" onClick={openLoc} aria-label="Network diagnostics">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" opacity="0.5"/>
                </svg>
              </button>
              <button className="gw2-key" onClick={() => addDigit("0")} disabled={locked || busy}>0</button>
              <button className="gw2-key gw2-del" onClick={delDigit} disabled={locked || busy}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 5H9.2a2 2 0 0 0-1.5.7l-4.4 5.6a1.1 1.1 0 0 0 0 1.4l4.4 5.6a2 2 0 0 0 1.5.7H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z"/><path d="M17 9.5l-5 5M12 9.5l5 5"/>
                </svg>
              </button>
            </div>
          </>
        ) : (
          <LoginForm busy={busy} onSubmit={loginWithCredentials} />
        )}

        <div className="gw2-actions">
          <button className="gw2-lbtn" onClick={() => setMode(mode === "pin" ? "login" : "pin")}>
            {mode === "pin" ? "Log in instead" : "← Use PIN"}
          </button>
          <button className="gw2-lbtn gw2-help-btn" onClick={() => setShowHelp(true)}>Need help?</button>
        </div>
      </div>

      {showLoc && (
        <div className="gw2-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowLoc(false); }}>
          <div className="gw2-modal">
            <div className="gw2-mhd">
              <span>NETWORK DIAGNOSTICS</span>
              <button className="gw2-mclose" onClick={() => setShowLoc(false)}>✕</button>
            </div>
            <div className="gw2-mbd gw2-loc-bd">
              <div className="gw2-lrow">
                <div className="gw2-lk">Location</div>
                <div className="gw2-lv">
                  <div className="gw2-lv-main">{locData.city !== "—" ? `${locData.city}, ${locData.state}` : <span className="gw2-lskel" style={{width:120}} />}</div>
                  {locData.lat && <div className="gw2-lv-sub">{locData.lat.toFixed(4)}, {locData.lng.toFixed(4)}</div>}
                </div>
              </div>
              <div className="gw2-lrow">
                <div className="gw2-lk">Network Provider</div>
                <div className="gw2-lv"><div className="gw2-lv-main">{locData.provider !== "—" ? locData.provider : <span className="gw2-lskel" style={{width:140}} />}</div></div>
              </div>
              <div className="gw2-lrow">
                <div className="gw2-lk">Speed</div>
                <div className="gw2-lv">
                  <div className="gw2-speed-row">
                    {locData.speed !== null && (() => { const s = speedStatus(locData.speed); return s ? <span className="gw2-speed-badge" style={{color: s.color, borderColor: s.color + "55"}}>{s.label}</span> : null; })()}
                    <div className="gw2-lv-main">{locData.speed === null ? <span className="gw2-lskel" style={{width:70}} /> : `${locData.speed} Mbps`}</div>
                    <button className="gw2-speed-reload" onClick={runSpeedTest} disabled={speedTesting} title="Re-test speed">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={speedTesting ? {animation:"gw2SpinIcon 0.9s linear infinite"} : {}}>
                        <path d="M20 8A8.5 8.5 0 1 0 20.8 15"/><path d="M20 2v6h-6"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div className="gw2-lrow">
                <div className="gw2-lk">IP Address</div>
                <div className="gw2-lv"><div className="gw2-lv-main mono">{locData.ip !== "—" ? locData.ip.split(".").map((p,i) => i < 2 ? p : "***").join(".") : <span className="gw2-lskel" style={{width:90}} />}</div></div>
              </div>
              <div className="gw2-lrow last">
                <div className="gw2-lk">Device Type</div>
                <div className="gw2-lv"><div className="gw2-lv-main">{locData.device || <span className="gw2-lskel" style={{width:70}} />}</div></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="gw2-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowHelp(false); }}>
          <div className="gw2-modal">
            <div className="gw2-mhd">
              <span>Need help signing in?</span>
              <button className="gw2-mclose" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <div className="gw2-mbd">
              <p>Your PIN is the <strong>last 4 digits of your phone number</strong>. Still stuck? Reach our team and we&apos;ll get you back in fast.</p>
              <a className="gw2-hrow" href="mailto:support@iot-techs.com?subject=Login%20help%20-%20IOT%20TECHS">
                <div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg></div>
                <div><div className="gw2-hk">Email support</div><div className="gw2-hv">support@iot-techs.com</div></div>
              </a>
              <a className="gw2-hrow" href="sms:+16463960775">
                <div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg></div>
                <div><div className="gw2-hk">Text us</div><div className="gw2-hv">646-396-0775</div></div>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Root export ----
export default function GatewayClient({ project, initialView = null, currentUser = null, assignments = [], staffUsers = [], workOrders = [], expenses = [], requests = [], proposalViews = [], proposal = null }) {
  const [view, setView]                 = useState(initialView);
  const [projectStage, setProjectStage] = useState(project.stage);
  // Last stage the body is actually showing — shared so a role switch (the pill) can carry it
  // into the new role's tab, landing them on the SAME step instead of that role's default.
  const viewingStageRef                 = useRef(project.stage);
  // In-place preview role (admin/manager viewing as customer/tech) — lifted here so BOTH the
  // masthead pill and the subheader eye drive the same state and the page snaps in one tab.
  const [previewRole, setPreviewRole]   = useState(null);

  async function attemptAccess({ loginRole, pinValue, emailOrPhone, password }) {
    return resolveAccess(project.access_id, { loginRole, pin: pinValue, emailOrPhone, password });
  }

  if (!view) {
    return <GatewayScreen onAuthenticated={setView} attemptAccess={attemptAccess} />;
  }

  return (
    <div className="pvx">
      <style>{PV_CSS}</style>
      <ProjectHeader accessId={project.access_id} view={view} onReAuth={() => setView(null)} onViewChange={setView}
                     previewRole={previewRole} onPreviewRole={setPreviewRole} viewingStageRef={viewingStageRef} />
      <div className="wrap">
        {view === "customer" && (
          <Link href="/my-projects" className="pv-back">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to My Projects
          </Link>
        )}
        <ResolvedView
          project={project}
          view={view}
          currentUser={currentUser}
          projectStage={projectStage}
          onProjectStage={setProjectStage}
          viewingStageRef={viewingStageRef}
          previewRole={previewRole}
          onPreviewRole={setPreviewRole}
          assignments={assignments}
          staffUsers={staffUsers}
          workOrders={workOrders}
          expenses={expenses}
          requests={requests}
          proposalViews={proposalViews}
          proposal={proposal}
        />
      </div>
    </div>
  );
}

// Light "dashboard theme" re-skin for the authenticated project view.
// Pure restyle — every override is scoped under .pvx so it wins over globals.css
// without changing any JSX, text, or logic. The dark PIN gateway is untouched.
const PV_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
.pvx{--bg-soft:#f6f7f9;--bg-tint:#f0f2f7;--ink:#0e1320;--slate:#2C3347;--muted:#5b6275;--line:#e6e8ee;--gold:#C9A96E;--gold-deep:#b08f4f;--accent:#3257ff;--accent-soft:#eef1ff;--green:#1c8a45;--green-soft:#e7f6ec;--red:#d23c3c;--red-soft:#fdeaea;--amber:#b45309;--amber-soft:#fef3c7;--purple:#7c3aed;--purple-soft:#f3eeff;
  background:var(--bg-soft);min-height:100vh;font-family:'Hanken Grotesk',sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased;padding-bottom:50px}
.pvx .wrap{max-width:1180px;margin:0 auto;padding:0 26px 60px}
.pvx .mono{font-family:Menlo,Consolas,monospace;letter-spacing:.3px}
/* Google Places autocomplete — new web component (PlaceAutocompleteElement) */
.pvx .pv-pac-host{width:100%}
.pvx .pv-pac-host gmp-place-autocomplete,.pvx .pv-pac-el{width:100%;display:block}
/* legacy .pac-container dropdown (fallback path, rendered on <body>) */
.pac-container{z-index:9999;border-radius:10px;border:1px solid #e6e8ee;box-shadow:0 8px 28px rgba(14,19,32,.14);font-family:'Hanken Grotesk',sans-serif;margin-top:4px}
.pac-item{padding:7px 12px;font-size:.85rem;color:#2C3347;cursor:pointer;border-top:1px solid #f0f2f7}
.pac-item:hover,.pac-item-selected{background:#f6f7f9}
.pac-item-query{font-size:.85rem;color:#0e1320}
.pac-logo:after{margin:6px 10px}

/* Header → light sticky nav */
.pvx .masthead{position:sticky;top:0;z-index:60;background:rgba(255,255,255,.92);backdrop-filter:blur(14px);border-bottom:1px solid var(--line);padding:0;margin-bottom:8px}
.pvx .masthead-inner{max-width:1180px;margin:0 auto;padding:12px 26px;display:flex;justify-content:space-between;align-items:center;gap:16px}
.pvx .brand-link{display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit}
.pvx .brand-text{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.1rem;letter-spacing:-.02em}
.pvx .brand-text b{color:#C9A96E}
.pvx .brand .name{color:var(--ink);font-family:'Bricolage Grotesque',sans-serif;font-size:1.2rem;font-weight:700;letter-spacing:-.02em}
.pvx .brand-logo-link{text-decoration:none}
.pvx .brand-tag{color:var(--muted);font-size:11px;letter-spacing:1.5px;margin-top:3px}
.pvx .brand-rule{display:none}
.pvx .contact{color:var(--muted);font-size:11px;margin-top:2px}
.pvx .doc{text-align:right;display:flex;align-items:center;gap:12px}
.pvx .doc-uline{display:none}
.pvx .doc-date{color:var(--muted);font-size:12px;margin:0;font-family:Menlo,Consolas,monospace}
.pvx .doc-controls{display:inline-flex;align-items:center;gap:10px}
.pvx .doc-pill{background:var(--bg-tint);color:var(--slate);border:1px solid var(--line);border-radius:7px;font-size:11px;letter-spacing:.04em;padding:7px 12px;font-weight:700}
.pvx .doc-pill-btn{background:#fff;border:1px solid var(--line);color:var(--ink);border-radius:9px;font-size:11px;letter-spacing:.04em;padding:8px 13px;font-weight:700;transition:border-color .15s,box-shadow .15s}
.pvx .doc-pill-btn:hover{border-color:var(--gold);box-shadow:0 6px 16px -10px rgba(14,19,32,.3);opacity:1}
.pvx .doc-pill-dash{display:inline-flex;align-items:center;background:#fff;border:1px solid var(--line);color:var(--ink);border-radius:9px;font-size:11px;letter-spacing:.04em;padding:8px 13px;font-weight:700;text-decoration:none;transition:border-color .15s,box-shadow .15s}
.pvx .doc-pill-dash:hover{border-color:var(--gold);box-shadow:0 6px 16px -10px rgba(14,19,32,.3)}
.pvx .doc-pill-dash svg{color:var(--gold-deep)}
.pvx .doc-pill-dd{background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 24px 50px -18px rgba(14,19,32,.3);padding:6px;min-width:170px;top:calc(100% + 8px)}
.pvx .doc-pill-opt{color:var(--slate);font-size:13px;border-radius:8px;padding:9px 12px}
.pvx .doc-pill-opt:hover{background:var(--bg-soft);color:var(--ink)}
.pvx .doc-pill-opt.active{color:var(--gold-deep);font-weight:600}
.pvx .doc-pill-sep{background:var(--line)}
.pvx .doc-pill-lock-opt{color:var(--muted)!important}
.pvx .doc-pill-lock-opt:hover{background:var(--red-soft)!important;color:var(--red)!important}
.pvx .doc-pill-dot-lock{background:#fff!important;border:1.5px solid var(--line)}

/* Notification bell → light */
.pvx .nb-btn{background:#fff;border:1px solid var(--line);border-radius:50%;width:38px;height:38px;color:var(--ink)}
.pvx .nb-btn:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .nb-badge{background:var(--red);border:2px solid #fff}
.pvx .nb-panel{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 24px 50px -18px rgba(14,19,32,.3);width:320px}
.pvx .nb-hd{border-bottom:1px solid var(--line)}
.pvx .nb-hd-title{color:var(--muted)}
.pvx .nb-mark-all{color:var(--muted)}.pvx .nb-mark-all:hover{color:var(--gold-deep)}
.pvx .nb-x{color:var(--muted)}
.pvx .nb-item{border-bottom:1px solid var(--line)}
.pvx .nb-item:hover{background:var(--bg-soft)}
.pvx .nb-item.nb-unread{background:rgba(50,87,255,.03)}
.pvx .nb-title{color:var(--slate)}
.pvx .nb-item.nb-unread .nb-title{color:var(--ink)}
.pvx .nb-short{color:var(--muted)}
.pvx .nb-time{color:var(--muted)}
.pvx .nb-body{background:var(--bg-soft);color:var(--slate);border-left:2px solid var(--gold)}

/* Section head → light banner */
.pvx .section-head{margin:16px 0 4px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:transparent;color:var(--ink);border-left:none;padding:0;letter-spacing:normal;text-transform:none;font-size:inherit;font-weight:normal}
.pvx .sh-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pvx .sh-status{display:inline-flex;align-items:center;gap:6px;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;padding:5px 13px;border-radius:100px;border:1.5px solid}
.pvx .sh-status::before{content:'';width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.pvx .sh-pending{background:#fff;color:#2980b9;border-color:rgba(41,128,185,.25)}
.pvx .sh-pending::before{background:#2980b9}
.pvx .sh-attention{background:#fff;color:#e74c3c;border-color:rgba(231,76,60,.3)}
.pvx .sh-attention::before{background:#e74c3c}
.pvx .sh-complete{background:#fff;color:#1c8a45;border-color:rgba(28,138,69,.25)}
.pvx .sh-complete::before{background:#1c8a45}
.pvx .sh-reviewing{background:#fff;color:#8a6d2f;border-color:rgba(201,169,110,.35)}
.pvx .sh-reviewing::before{background:#C9A96E}
.pvx .sh-inprogress{background:#fff;color:#b06a1f;border-color:rgba(201,132,49,.3)}
.pvx .sh-inprogress::before{background:#d68a2e}
.pvx .sh-finalizing{background:#fff;color:#7c4dc4;border-color:rgba(124,77,196,.28)}
.pvx .sh-finalizing::before{background:#8a5cd0}
.pvx .sh-stage-name{font-size:.82rem;color:var(--muted);font-weight:500}
.pvx .sh-note-preview{font-size:.78rem;color:var(--muted);font-style:italic;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pvx .sh-toggle{font-size:.75rem;font-weight:700;font-family:inherit;padding:4px 12px;border-radius:100px;cursor:pointer;border:1.5px solid rgba(231,76,60,.35);color:#e74c3c;background:#fff;transition:background .12s,border-color .12s,box-shadow .12s;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.pvx .sh-toggle:hover{border-color:#e74c3c;box-shadow:0 2px 6px rgba(231,76,60,.15)}
.pvx .sh-toggle.sh-toggle-on{border-color:rgba(99,117,155,.3);color:var(--muted)}
.pvx .sh-toggle.sh-toggle-on:hover{background:var(--bg-soft)}
.pvx .sh-toggle:disabled{opacity:.5;cursor:not-allowed}
.pvx .sh-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.pvx .sh-icon-btn{position:relative;display:inline-grid;place-items:center;width:32px;height:32px;border-radius:9px;cursor:pointer;border:1.5px solid var(--line);color:var(--slate);background:#fff;transition:.12s;flex-shrink:0}
.pvx .sh-icon-btn:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .sh-icon-btn.on{background:var(--purple);border-color:var(--purple);color:#fff}
.pvx .sh-preview-pick{position:relative}
.pvx .sh-preview-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:60;min-width:170px;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.16);padding:6px;display:flex;flex-direction:column;gap:2px}
.pvx .sh-preview-menu button{height:34px;padding:0 12px;border:none;border-radius:7px;background:none;color:var(--slate);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit;text-align:left}
.pvx .sh-preview-menu button:hover{background:var(--bg-soft,#f5f5f7)}
.pvx .sh-preview-menu button.on{background:var(--purple);color:#fff}
.pvx .sh-preview-menu button.exit{border-top:1px solid var(--line);border-radius:0;margin-top:2px;padding-top:8px;color:var(--muted)}
.pvx .sh-close-btn{border-color:rgba(231,76,60,.35);color:#e74c3c}
.pvx .sh-close-btn:hover{background:rgba(231,76,60,.08);border-color:#e74c3c;color:#e74c3c}
.pvx .sh-icon-count{position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 4px;border-radius:100px;background:var(--ink);color:#fff;font-size:.6rem;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1}
.pvx .pv-ta-modal{max-width:560px;width:100%;padding:0;max-height:88vh;display:flex;flex-direction:column;overflow:hidden}
.pvx .pv-ta-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap;flex-shrink:0}
.pvx .pv-ta-modal-head .pv-modal-title{margin:0}
.pvx .pv-ta-modal-body{overflow-y:auto;flex:1;min-height:0;order:2}
.pvx .pv-ta-modal-foot{flex-shrink:0;order:1;border-bottom:1px solid var(--line);background:var(--bg-soft)}
.pvx .pv-ta-modal-foot .pv-ap-add{border-radius:0}
.pvx .pv-custview-hint-bar{display:flex;align-items:center;gap:8px;font-size:.8rem;font-weight:600;color:var(--purple);background:var(--purple-soft);border:1px solid #e0d4f7;border-radius:10px;padding:9px 14px;margin-bottom:4px}
/* Customer identity verification */
.pvx .pv-verify-modal{max-width:420px;text-align:center}
.pvx .pv-verify-icon{width:52px;height:52px;border-radius:50%;background:var(--purple-soft);color:var(--purple);display:grid;place-items:center;margin:0 auto 12px}
.pvx .pv-verify-rows{display:flex;flex-direction:column;gap:1px;text-align:left;background:var(--bg-soft);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:16px 0 18px}
.pvx .pv-verify-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 14px;border-bottom:1px solid var(--line)}
.pvx .pv-verify-row:last-child{border-bottom:none}
.pvx .pv-verify-row span{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);flex-shrink:0}
.pvx .pv-verify-row b{font-size:.86rem;color:var(--ink);text-align:right;word-break:break-word}
.pvx .pv-verify-row b em{color:var(--muted);font-weight:400;font-style:italic}
.pvx .pv-verify-acts{display:flex;flex-direction:column;gap:8px}
.pvx .pv-verify-confirm{background:var(--ink);color:#fff;border:none;border-radius:10px;padding:11px 16px;font-size:.88rem;font-weight:600;font-family:inherit;cursor:pointer}
.pvx .pv-verify-confirm:hover{background:var(--slate)}
.pvx .pv-verify-confirm:disabled{opacity:.5;cursor:not-allowed}
.pvx .pv-verify-cancel{background:none;border:none;color:var(--muted);font-size:.84rem;font-weight:600;font-family:inherit;cursor:pointer;padding:4px}
.pvx .pv-verify-cancel:hover{color:var(--ink)}
/* Expenses / Requests modal + preset chips */
.pvx .pv-wo-modal{max-width:460px;width:100%;padding:22px 20px;max-height:86vh;overflow-y:auto}
.pvx .pv-wo-modal .wo-panel{margin:0}
.pvx .wo-presets{display:flex;flex-wrap:wrap;gap:6px}
.pvx .wo-preset{padding:6px 13px;border:1.5px solid var(--line);border-radius:100px;background:#fff;font-size:.8rem;font-weight:600;font-family:inherit;color:var(--muted);cursor:pointer;transition:.12s}
.pvx .wo-preset:hover{border-color:var(--gold);color:var(--ink)}
.pvx .wo-preset.on{background:var(--ink);border-color:var(--ink);color:#fff}
.pvx .sh-flag-btn-icon{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:9px;cursor:pointer;border:1.5px solid rgba(231,76,60,.35);color:#e74c3c;background:#fff;transition:background .12s,border-color .12s,box-shadow .12s;flex-shrink:0}
.pvx .sh-flag-btn-icon:hover{border-color:#e74c3c;background:rgba(231,76,60,.06);box-shadow:0 2px 6px rgba(231,76,60,.15)}
.pvx .sh-flag-btn-icon.on{border-color:#e74c3c;background:rgba(231,76,60,.1);color:#e74c3c}
.pvx .sh-flag-btn-icon.on:hover{background:rgba(231,76,60,.16)}
.pvx .sh-flag-btn-icon:disabled{opacity:.5;cursor:not-allowed}
.pvx .sh-notebox{background:#fff;border:1.5px solid rgba(231,76,60,.25);border-radius:12px;padding:12px 14px;margin-bottom:12px}
.pvx .sh-textarea{width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:inherit;font-size:.86rem;resize:none;color:var(--ink);background:var(--bg-soft);box-sizing:border-box}
.pvx .sh-textarea:focus{outline:none;border-color:rgba(231,76,60,.4)}
.pvx .sh-notebox-actions{display:flex;gap:8px;margin-top:9px;align-items:center}
.pvx .sh-flag-btn{background:#e74c3c;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:.82rem;font-weight:700;font-family:inherit;cursor:pointer;transition:background .12s}
.pvx .sh-flag-btn:hover:not(:disabled){background:#c0392b}
.pvx .sh-flag-btn:disabled{opacity:.5;cursor:not-allowed}
.pvx .sh-cancel-btn{background:transparent;border:none;color:var(--muted);font-size:.82rem;font-family:inherit;cursor:pointer;padding:7px 8px}

/* Project head */
.pvx .pv-head{margin-top:20px;margin-bottom:20px}
.pvx .pv-project-card{flex:1 1 100%;width:100%;min-width:0;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}
.pvx .pv-hcard{display:grid;grid-template-columns:1fr 1fr;min-height:260px;overflow:hidden}
/* Customer identity row */
.pvx .pv-hcust-row{display:flex;align-items:center;gap:11px}
.pvx .pv-hav{width:38px;height:38px;border-radius:50%;background:var(--accent-soft);color:var(--accent);font-family:'Bricolage Grotesque',sans-serif;font-size:.92rem;font-weight:700;display:flex;align-items:center;justify-content:center;letter-spacing:.3px;flex-shrink:0}
.pvx .pv-hcust-info{display:flex;flex-direction:column;gap:0;min-width:0}
.pvx .pv-hcust-name{font-weight:600;font-size:.95rem;color:var(--ink);line-height:1.25}
.pvx .pv-hcust-role{font-size:.76rem;color:var(--muted);line-height:1.2}
.pvx .pv-id-badge{margin-left:auto;background:var(--bg-tint);border:1px solid var(--line);color:var(--muted);font-family:Menlo,Consolas,monospace;font-size:.68rem;font-weight:700;letter-spacing:.5px;padding:3px 9px;border-radius:6px;white-space:nowrap}
/* Type heading row */
.pvx .pv-htype-row{display:flex;align-items:center;gap:10px;margin-top:4px}
.pvx .pv-htype-title{font-family:'Bricolage Grotesque',sans-serif;font-size:1.3rem;font-weight:700;color:var(--ink);letter-spacing:-.01em}
.pvx .pv-type-chip{background:var(--green-soft);border:1px solid rgba(28,138,69,.15);color:var(--green);font-size:.7rem;font-weight:700;padding:3px 9px;border-radius:100px;white-space:nowrap}
.pvx .pv-hcollapse-inline{margin-left:auto;background:none;border:1px solid var(--line);border-radius:6px;color:var(--muted);width:24px;height:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
.pvx .pv-hcollapse-inline:hover{background:var(--bg-tint);color:var(--slate)}
/* Details col */
.pvx .pv-hinfo{padding:20px 22px;display:flex;flex-direction:column;min-width:0;gap:13px;border-right:1px solid var(--line)}
.pvx .pv-hfields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px 24px;margin-top:2px}
.pvx .pv-hfield{display:flex;flex-direction:column;gap:3px}
.pvx .pv-hfield-full{grid-column:1 / -1}
.pvx .pv-hfl{font-size:.67rem;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--muted)}
.pvx .pv-hfv{font-size:.87rem;color:var(--slate);font-weight:500}
.pvx .pv-hfv.link{color:var(--accent);text-decoration:none}
.pvx .pv-hfv.link:hover{text-decoration:underline}
.pvx .pv-hactions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:4px}
.pvx .pv-hact{background:var(--bg-tint);border:1px solid var(--line);color:var(--slate);font-size:.79rem;font-weight:600;padding:7px 13px;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;transition:border-color .15s,color .15s}
.pvx .pv-hact:hover{border-color:var(--gold-deep);color:var(--ink)}
.pvx .pv-hact.primary{background:var(--ink);color:#fff;border-color:var(--ink)}
.pvx .pv-hact.primary:hover{background:#2C3347;border-color:#2C3347}
/* Full-width address row */
.pvx .pv-addr-row{display:flex;align-items:center;gap:9px;padding:10px 13px;background:var(--bg-soft);border:1px solid var(--line);border-radius:11px;font-size:.85rem;text-decoration:none;color:var(--ink);transition:border-color .15s,background .15s;margin-top:2px}
.pvx .pv-addr-row:hover{border-color:var(--gold);background:#fafaf8}
.pvx .pv-addr-text{flex:1;font-weight:500;color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pvx .pv-addr-tag{font-size:.68rem;font-weight:700;padding:3px 9px;border-radius:100px;background:var(--amber-soft);color:var(--amber);white-space:nowrap;flex-shrink:0}
.pvx .pv-addr-arrow{color:var(--muted);font-size:.9rem;flex-shrink:0;margin-left:2px}
/* Map col */
.pvx .pv-map-col{overflow:hidden;display:block;position:relative;min-height:260px}
.pvx .pv-map-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s,opacity .2s}
.pvx .pv-map-col:hover .pv-map-img{transform:scale(1.04);opacity:.92}
.pvx .pv-map-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--muted);gap:8px;text-decoration:none;background:var(--bg-tint)}
.pvx .pv-map-area-label{position:absolute;bottom:0;left:0;right:0;background:rgba(26,35,64,.72);color:rgba(255,255,255,.88);font-size:.7rem;font-weight:600;letter-spacing:.4px;padding:5px 10px;text-align:center}
/* Collapsed strip */
/* Card collapse bar — per inspo HTML (.card-collapse-btn) */
.pvx .pv-card-toggle{display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 24px;background:#fff;border:none;border-bottom:1px solid transparent;cursor:pointer;font-family:inherit;transition:background .15s,border-color .15s}
.pvx .pv-card-toggle.open{border-bottom-color:var(--line)}
.pvx .pv-card-toggle:hover{background:var(--bg-soft)}
.pvx .pct-left{display:flex;align-items:center;gap:12px;min-width:0}
.pvx .pct-id{font-size:.72rem;font-weight:700;letter-spacing:.06em;padding:3px 9px;border-radius:6px;background:var(--bg-tint);color:var(--muted);border:1px solid var(--line);white-space:nowrap;flex-shrink:0}
.pvx .pct-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pvx .pct-stage{font-size:.78rem;color:var(--muted);margin-left:4px;font-weight:400}
.pvx .pct-right{display:flex;align-items:center;gap:10px;flex-shrink:0}
.pvx .pct-active{font-size:.7rem;font-weight:700;padding:3px 9px;border-radius:100px;background:var(--green-soft);color:var(--green)}
.pvx .pv-toggle-row{display:flex;align-items:center}
.pvx .pv-toggle-row .pv-card-toggle{flex:1}
.pvx .pct-map-btn{display:flex;align-items:center;gap:5px;font-size:.7rem;font-weight:600;padding:6px 12px;border-radius:0;border:none;border-left:1px solid var(--line);background:transparent;color:var(--muted);cursor:pointer;transition:all .15s;height:100%;flex-shrink:0}
.pvx .pct-map-btn:hover{background:var(--bg-tint);color:var(--ink)}
.pvx .pct-arrow{width:28px;height:28px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;transition:transform .25s,background .15s,border-color .15s;flex-shrink:0}
.pvx .pct-arrow svg{stroke:var(--muted);transition:transform .25s}
.pvx .pv-card-toggle.open .pct-arrow{border-color:var(--gold);background:rgba(201,169,110,.1)}
.pvx .pv-card-toggle.open .pct-arrow svg{transform:rotate(180deg);stroke:var(--gold-deep)}
.pvx .pv-htoggle{margin-left:auto;display:flex;align-items:center;gap:5px;background:var(--bg-tint);border:1px solid var(--line);color:var(--slate);font-size:.78rem;font-weight:600;padding:6px 12px;border-radius:7px;cursor:pointer}
.pvx .pv-htoggle:hover{border-color:var(--gold);color:var(--ink)}
/* Company in dark col */
.pvx .pv-hid-co{color:rgba(255,255,255,.5);font-size:.78rem;margin-top:-4px;margin-bottom:2px}
/* Collapse btn */
.pvx .wo-btn-modify{background:var(--accent-soft);color:var(--accent);border:1px solid rgba(50,87,255,.2);border-radius:7px;padding:5px 14px;font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer}
.pvx .wo-btn-modify:hover{background:var(--accent);color:#fff}
.pvx .wo-modify-form{margin-top:8px}
.pvx .wo-modify-btns{display:flex;gap:8px;margin-top:8px}
/* Edit form */
.pvx .pv-efields{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px 20px;flex:1}
.pvx .pv-efield{display:flex;flex-direction:column;gap:4px}
.pvx .pv-efield-full{grid-column:1/-1}
.pvx .pv-einput{border:1px solid var(--line);border-radius:8px;padding:7px 10px;font-size:.85rem;color:var(--ink);background:#fff;outline:none;font-family:'Hanken Grotesk',sans-serif;transition:border-color .15s}
.pvx .pv-einput:focus{border-color:var(--accent)}
.pvx .pv-back{background:#fff;border:1px solid var(--line);color:var(--slate)}
.pvx .pv-back:hover{border-color:var(--gold);color:var(--ink)}

/* Progress bar → light card + stepper */
.pvx .pbar-wrap{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 2px rgba(14,19,32,.04);padding:22px 20px 16px}
.pvx .pbar-track{background:var(--line)}
.pvx .pbar-fill{background:linear-gradient(90deg,var(--role-c,var(--gold)),var(--role-cd,var(--gold-deep)))}
.pvx .pstage-num{background:#fff;border:1.5px solid var(--line);color:var(--muted)}
.pvx .pstage.done .pstage-num{background:var(--role-c,var(--gold));border-color:var(--role-c,var(--gold));color:#fff}
.pvx .pstage.current .pstage-num{background:#fff;border-color:var(--role-c,var(--gold));border-width:2px;color:var(--role-cd,var(--gold-deep));box-shadow:0 0 0 3px var(--role-glow,rgba(201,169,110,.18))}
.pvx .pstage.viewing .pstage-num{background:var(--role-glow,rgba(201,169,110,.18));border-color:var(--role-c,var(--gold));color:var(--role-cd,var(--gold-deep))}
.pvx .plabel{color:var(--muted)}
.pvx .pstage.done .plabel{color:var(--role-cd,var(--gold-deep))}
.pvx .pstage.current .plabel{color:var(--ink)}
.pvx .pstage.future .plabel{color:#c2c7d2}
.pvx .pstage.clickable:hover .pstage-num{border-color:var(--role-c,var(--gold));color:var(--role-cd,var(--gold-deep))}
.pvx .pstage.clickable:hover .plabel{color:var(--role-cd,var(--gold-deep))}
.pvx .pbar-pct-row{background:var(--bg-tint);border:1px solid var(--line)}
.pvx .pbar-pct-bar{background:repeating-linear-gradient(-55deg,var(--role-glow,rgba(201,169,110,.18)) 0,var(--role-glow,rgba(201,169,110,.18)) 6px,transparent 6px,transparent 14px),linear-gradient(90deg,var(--role-glow,rgba(201,169,110,.35)),var(--role-glow,rgba(201,169,110,.18)));border-right:2px solid var(--role-c,var(--gold))}
.pvx .pbar-pct-label{color:var(--muted)}
.pvx .pbar-pct-label b{color:var(--role-cd,var(--gold-deep))}
/* Days-in-stage aging chip — lives in the section header (staff only), not on the progress bar. */
.pvx .sh-age{font-size:.68rem;font-weight:800;padding:2px 9px;border-radius:100px;background:var(--bg-tint);color:#5a6d8a;white-space:nowrap}
.pvx .sh-age.amber{background:rgba(224,154,58,.14);color:#8a5f00}
.pvx .sh-age.red{background:rgba(231,76,60,.12);color:#c0392b}
.pvx .pbar-pct-cur{color:var(--muted)}
.pvx .stage-expand-inner{background:#faf4e8;border:1px solid rgba(201,169,110,.3);border-top:none}
.pvx .stage-toast-msg{color:var(--slate)}.pvx .stage-toast-msg b{color:var(--gold-deep)}
.pvx .stage-toast-confirm{background:var(--gold);color:var(--ink)}
.pvx .stage-toast-cancel{border:1px solid var(--line);color:var(--muted)}
.pvx .stage-toast-cancel:hover{color:var(--ink);border-color:var(--gold)}
.pvx .stage-toast-missing{background:#faf4e8;border:1px solid rgba(201,169,110,.3);border-top:none;padding:8px 14px 11px;font-size:.8rem;color:#8a5f00;line-height:1.5}
.pvx .stage-toast-missing .stm-label{font-weight:700;color:#c0392b}

/* Live-update toast — a remote change (staff or the other party) picked up by the poll */
.pvx .live-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:11000;background:#0B0F1A;color:#fff;font-size:.82rem;font-weight:700;padding:11px 20px;border-radius:100px;box-shadow:0 12px 34px rgba(0,0,0,.32);display:flex;align-items:center;gap:8px;max-width:90vw}
.pvx .live-toast svg{color:#5FB88A;flex-shrink:0}
@keyframes liveToastIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
.pvx .live-toast{animation:liveToastIn .22s ease}

/* Progress bar — mobile snap-scroll (≤640px only, desktop untouched) */
@media(max-width:640px){
  .pvx .pbar-wrap{padding:14px 0 12px}
  .pvx .pbar{overflow-x:auto;overflow-y:visible;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;scrollbar-width:none;padding:8px 30% 12px;gap:0}
  .pvx .pbar::-webkit-scrollbar{display:none}
  .pvx .pbar-track{display:none}
  .pvx .pstage{flex:0 0 28%;min-width:80px;scroll-snap-align:center;padding:6px 4px 8px}
  .pvx .pstage-num{width:34px;height:34px;font-size:.88rem}
  .pvx .plabel{font-size:.65rem;line-height:1.2;text-align:center;max-width:72px;white-space:normal}
  .pvx .pbar-pct-row{margin:0 16px;border-radius:8px}
}

/* Cards */
.pvx .pv-grid{gap:18px}
.pvx .pv-card{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 2px rgba(14,19,32,.04);padding:20px}
.pvx .pv-card-h{color:var(--muted)}
.pvx .pv-see{color:var(--ink)}
.pvx .pv-value b{color:var(--green)}
.pvx .pv-actions .vaction{background:var(--bg-soft);border:1px solid var(--line);color:var(--slate);border-radius:9px;padding:9px 14px}
.pvx .pv-actions .vaction.primary{background:var(--gold);border-color:var(--gold);color:var(--ink)}
.pvx .pv-passive{color:var(--muted)}

/* Inquiry / lead cards */
.pvx .iq-card{border-radius:12px}
.pvx .iq-card.customer{background:var(--green-soft);border:1px solid #bfe6cf}
.pvx .iq-card.staff{background:var(--bg-soft);border:1px solid var(--line)}
/* Revamped customer inquiry experience */
.pvx .ciq{display:grid;grid-template-columns:1.1fr 1fr;gap:16px;margin-top:4px}
@media(max-width:760px){.pvx .ciq{grid-template-columns:1fr}}
.pvx .ciq-hero{position:relative;overflow:hidden;border-radius:18px;padding:30px 26px;color:#fff;background:linear-gradient(150deg,#2C3347 0%,#0e1320 100%);display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.pvx .ciq-glow{position:absolute;top:-60px;right:-50px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(201,169,110,.45),transparent 70%);pointer-events:none}
.pvx .ciq-badge{position:relative;width:56px;height:56px;border-radius:16px;background:linear-gradient(145deg,var(--gold),var(--gold-deep));color:#0e1320;display:grid;place-items:center;box-shadow:0 10px 26px -8px rgba(201,169,110,.6)}
.pvx .ciq-pill{position:relative;font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);background:rgba(201,169,110,.14);border:1px solid rgba(201,169,110,.3);border-radius:100px;padding:5px 12px}
.pvx .ciq-pill .mono{color:#fff}
.pvx .ciq-title{position:relative;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.5rem;line-height:1.15;margin:2px 0 0}
.pvx .ciq-sub{position:relative;font-size:.9rem;line-height:1.55;color:#c7cdda;margin:0}
.pvx .ciq-sub b{color:#fff}
.pvx .ciq-call{position:relative;display:inline-flex;align-items:center;gap:8px;margin-top:6px;font-size:.84rem;font-weight:700;color:#0e1320;background:linear-gradient(135deg,var(--gold),var(--gold-deep));border-radius:100px;padding:9px 16px;text-decoration:none;box-shadow:0 8px 20px -10px rgba(201,169,110,.7);transition:.15s}
.pvx .ciq-call:hover{filter:brightness(1.05)}
.pvx .ciq-form{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px;display:flex;flex-direction:column}
.pvx .ciq-form-h{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.02rem;color:var(--ink);margin-bottom:14px}
.pvx .ciq-lbl{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:10px 0 6px}
.pvx .ciq-textarea{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:11px;padding:11px 13px;font-family:inherit;font-size:.88rem;color:var(--ink);resize:vertical;background:var(--bg-soft)}
.pvx .ciq-textarea:focus{outline:none;border-color:var(--gold);background:#fff}
.pvx .ciq-avail-grp{display:flex;align-items:center;gap:10px;margin-bottom:7px;flex-wrap:wrap}
.pvx .ciq-avail-cap{font-size:.72rem;font-weight:700;color:var(--muted);min-width:42px}
.pvx .ciq-date{border:1.5px solid var(--line);border-radius:100px;padding:6px 14px;font-family:inherit;font-size:.82rem;color:var(--ink);background:#fff;cursor:pointer}
.pvx .ciq-date:focus{outline:none;border-color:var(--gold)}
.pvx .ciq-date-clear{background:none;border:none;color:var(--muted);font-size:.78rem;font-weight:600;font-family:inherit;cursor:pointer}
.pvx .ciq-date-clear:hover{color:var(--red)}
.pvx .ciq-chips{display:flex;flex-wrap:wrap;gap:7px}
.pvx .ciq-chip{padding:7px 14px;border:1.5px solid var(--line);border-radius:100px;background:#fff;font-size:.82rem;font-weight:600;font-family:inherit;color:var(--muted);cursor:pointer;transition:.12s}
.pvx .ciq-chip:hover{border-color:var(--gold);color:var(--ink)}
.pvx .ciq-chip.on{background:var(--ink);border-color:var(--ink);color:#fff}
.pvx .ciq-chip-sm{padding:5px 11px;font-size:.78rem}
.pvx .ciq-weekdays{margin-top:-2px}
.pvx .ciq-acts{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:18px;flex-wrap:wrap}
.pvx .ciq-autosave{display:inline-flex;align-items:center;gap:6px;font-size:.78rem;font-weight:600;color:var(--muted)}
.pvx .ciq-dot-anim{width:7px;height:7px;border-radius:50%;background:var(--gold);animation:ciqPulse 1s ease-in-out infinite}
@keyframes ciqPulse{0%,100%{opacity:.3}50%{opacity:1}}
.pvx .ciq-urgent{display:inline-flex;align-items:center;gap:6px;background:#fff;color:#e0533a;border:1.5px solid rgba(224,83,58,.4);border-radius:11px;padding:12px 16px;font-size:.88rem;font-weight:700;font-family:inherit;cursor:pointer;transition:.15s}
.pvx .ciq-urgent:hover{background:rgba(224,83,58,.07);border-color:#e0533a}
.pvx .ciq-urgent.done{background:rgba(224,83,58,.1);color:#e0533a;cursor:default;border-color:rgba(224,83,58,.3)}
.pvx .ciq-urgent-note{margin-top:12px;font-size:.82rem;font-weight:600;color:#c0392b;background:rgba(224,83,58,.08);border:1px solid rgba(224,83,58,.2);border-radius:10px;padding:9px 13px}
.pvx .iq-link{color:var(--gold-deep);border-bottom-color:var(--line)}
.pvx .iq-link:hover{border-bottom-color:var(--gold)}

/* Approvals */
.pvx .approv-label{color:var(--gold-deep)}
.pvx .approv-cnt{background:#faf4e8;color:var(--gold-deep)}
.pvx .approv-card{background:#fff;border:1px solid var(--line);border-radius:12px}
.pvx .approv-type{color:var(--muted)}
.pvx .approv-name{color:var(--ink)}
.pvx .approv-detail{color:var(--muted)}
.pvx .approv-ok{background:var(--green-soft);border:1px solid #bfe6cf;color:var(--green)}
.pvx .approv-no{background:var(--red-soft);border:1px solid #f3c9c9;color:var(--red)}
.pvx .approv-empty{color:var(--muted)}

/* Activity log → light timeline */
/* Activity log */
.pvx .actlog-section{margin-top:20px}
.pvx .actlog-section-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.pvx .actlog-section-title{font-family:'Bricolage Grotesque',sans-serif;font-size:1rem;font-weight:700;color:var(--ink)}
.pvx .actlog-view-all{font-size:.8rem;font-weight:600;color:var(--muted)}
.pvx .actlog-card{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}
.pvx .actlog-row{display:flex;align-items:flex-start;gap:14px;padding:14px 20px;border-bottom:1px solid var(--line)}
.pvx .actlog-row.last{border-bottom:none}
.pvx .actlog-ic{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.pvx .actlog-ic-gold{background:rgba(201,169,110,.12);color:var(--gold-deep)}
.pvx .actlog-ic-blue{background:var(--accent-soft);color:var(--accent)}
.pvx .actlog-ic-green{background:var(--green-soft);color:var(--green)}
.pvx .actlog-ic-purple{background:var(--purple-soft);color:var(--purple)}
.pvx .actlog-ic-amber{background:var(--amber-soft);color:var(--amber)}
.pvx .actlog-body{flex:1;min-width:0}
.pvx .actlog-label{font-size:.88rem;font-weight:500;color:var(--ink);line-height:1.4}
.pvx .actlog-meta{font-size:.74rem;color:var(--muted);margin-top:2px}
.pvx .actlog-empty{padding:24px 20px;font-size:.85rem;color:var(--muted);font-style:italic;text-align:center}

.pvx .gw-error{background:var(--red-soft);color:var(--red);border:1px solid #f3c9c9;border-radius:9px}
.pvx .roleband{border-radius:3px}

/* Assignment panel */
.pvx .pv-access-panel{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:visible;margin:16px 0}
.pvx .pv-ap-head{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--line)}
.pvx .pv-ap-toggle{display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;font-family:inherit;padding:0}
.pvx .pv-ap-chev{color:var(--muted);font-size:.8rem;width:12px}
.pvx .pv-ap-auto{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#3257ff;background:rgba(50,87,255,.1);padding:1px 6px;border-radius:5px;margin-left:7px;vertical-align:middle}
.pvx .pv-ap-lock{display:inline-grid;place-items:center;width:26px;height:26px;color:var(--muted);opacity:.55;flex-shrink:0}
.pvx .pv-ap-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.95rem}
.pvx .pv-ap-head-right{display:flex;align-items:center;gap:12px}
.pvx .pv-ap-count{font-size:.78rem;color:var(--muted)}
.pvx .pv-vis-toggle{display:flex;align-items:center;gap:6px;font-size:.76rem;font-weight:600;padding:4px 11px;border-radius:20px;border:1.5px solid var(--line);background:#fff;cursor:pointer;transition:.15s;font-family:inherit;color:var(--ink)}
.pvx .pv-vis-toggle:hover{border-color:var(--accent-primary,#C9A96E)}
.pvx .pv-vis-toggle.restricted{background:rgba(231,76,60,.07);border-color:#e74c3c;color:#c0392b}
.pvx .pv-vis-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.pvx .pv-vis-dot.open{background:#1c8a45}
.pvx .pv-vis-dot.locked{background:#e74c3c}
.pvx .pv-ap-list{padding:4px 0}
.pvx .pv-ap-empty{padding:12px 16px;font-size:.85rem;color:var(--muted)}
.pvx .pv-ap-row{display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--line)}
.pvx .pv-ap-row:last-child{border-bottom:none}
.pvx .pv-ap-row-link{cursor:pointer;transition:background .12s}
.pvx .pv-ap-row-link:hover{background:var(--bg-tint)}
.pvx .pv-ap-av{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--slate),var(--ink));color:var(--gold);font-weight:700;font-size:.82rem;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.pvx .pv-av-admin{background:var(--ink);color:#fff}
.pvx .pv-av-manager{background:var(--gold-deep);color:#fff}
.pvx .pv-av-tech{background:var(--accent);color:#fff}
.pvx .pv-av-sales{background:var(--green);color:#fff}
.pvx .pv-av-customer{background:var(--purple);color:#fff}
.pvx .pv-ap-info{flex:1;min-width:0}
.pvx .pv-ap-name{font-weight:600;font-size:.88rem;display:block}
.pvx .pv-ap-email{font-size:.76rem;color:var(--muted)}
.pvx .pv-ap-role{font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:100px;text-transform:uppercase;letter-spacing:.04em}
.pvx .pv-role-tech{background:var(--accent-soft);color:var(--accent)}
.pvx .pv-role-manager{background:#faf4e8;color:var(--gold-deep)}
.pvx .pv-role-sales{background:var(--green-soft);color:var(--green)}
.pvx .pv-role-customer{background:var(--purple-soft);color:var(--purple)}
.pvx .pv-role-admin{background:var(--bg-tint);color:var(--muted)}
.pvx .pv-ap-rm{width:22px;height:22px;border-radius:5px;background:var(--red-soft);border:none;color:var(--red);font-size:.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1}
.pvx .pv-ap-rm:hover{background:var(--red);color:#fff}
.pvx .pv-ap-add{display:flex;align-items:center;gap:8px;padding:10px 16px;background:var(--bg-soft);flex-wrap:wrap;border-radius:0 0 13px 13px}
.pvx .pv-ap-sel{border:1px solid var(--line);border-radius:7px;padding:6px 10px;font-size:.82rem;background:#fff;color:var(--ink);font-family:inherit;cursor:pointer}
.pvx .pv-ap-input{border:1px solid var(--line);border-radius:7px;padding:6px 10px;font-size:.82rem;background:#fff;color:var(--ink);font-family:inherit;flex:1;min-width:180px}
.pvx .pv-ap-input:focus{outline:none;border-color:var(--accent)}
.pvx .pv-ap-grant{background:var(--ink);color:#fff;border:none;border-radius:7px;padding:6px 14px;font-size:.82rem;font-weight:600;font-family:inherit;cursor:pointer}
.pvx .pv-ap-grant:hover{background:var(--slate)}
.pvx .pv-ap-grant:disabled{opacity:.4;cursor:not-allowed}
.pvx .pv-psearch{position:relative;flex:1;min-width:180px;width:100%}
.pvx .pv-psearch .pv-ap-input{width:100%;box-sizing:border-box}
.pvx .pv-psearch-dd{position:absolute;top:calc(100% + 6px);bottom:auto;left:0;right:0;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.16);z-index:400;max-height:260px;overflow-y:auto}
.pvx .pv-psearch-opt{display:flex;flex-direction:column;width:100%;text-align:left;padding:8px 12px;background:none;border:none;border-bottom:1px solid var(--line);cursor:pointer;font-family:inherit;gap:1px}
.pvx .pv-psearch-opt:last-child{border-bottom:none}
.pvx .pv-psearch-opt:hover{background:var(--bg-tint)}
.pvx .pv-psearch-opt-row{flex-direction:row;align-items:center;justify-content:space-between;gap:8px}
.pvx .pv-psearch-name{font-size:.84rem;font-weight:600;color:var(--ink)}
.pvx .pv-psearch-email{font-size:.74rem;color:var(--muted)}
.pvx .pv-psearch-empty{display:block;padding:10px 12px;font-size:.82rem;color:var(--muted)}
.pvx .pv-ap-picked{display:flex;align-items:center;gap:10px;flex:1;min-width:180px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:5px 10px}
.pvx .pv-ap-picked-x{width:22px;height:22px;border-radius:5px;background:var(--bg-tint);border:none;color:var(--muted);font-size:.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1}
.pvx .pv-ap-picked-x:hover{background:var(--red-soft);color:var(--red)}
/* Close project */
.pvx .pv-close-bar{display:flex;align-items:center;justify-content:flex-end;padding:8px 0 4px}
.pvx .pv-close-btn{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1.5px solid rgba(231,76,60,.35);color:#e74c3c;border-radius:8px;padding:7px 14px;font-size:.82rem;font-weight:600;font-family:inherit;cursor:pointer;transition:background .15s,border-color .15s}
.pvx .pv-close-btn:hover{background:rgba(231,76,60,.06);border-color:#e74c3c}
.pvx .pv-lost-notice{display:inline-flex;align-items:center;gap:7px;font-size:.82rem;color:#e74c3c;font-weight:600;padding:6px 12px;background:rgba(231,76,60,.06);border:1px solid rgba(231,76,60,.2);border-radius:8px}
.pvx .pv-lost-when{font-weight:400;color:var(--muted)}
.pvx .pv-reopen-btn{display:inline-flex;align-items:center;gap:6px;background:var(--green,#1c8a45);border:none;color:#fff;border-radius:8px;padding:7px 14px;font-size:.82rem;font-weight:700;font-family:inherit;cursor:pointer;transition:background .15s}
.pvx .pv-reopen-btn:hover:not(:disabled){background:#166e37}
.pvx .pv-reopen-btn:disabled{opacity:.55;cursor:default}
.pvx .pv-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
.pvx .pv-modal{background:#fff;border-radius:16px;padding:30px 28px 24px;max-width:420px;width:100%;position:relative;box-shadow:0 12px 40px rgba(0,0,0,.18)}
.pvx .pv-modal-x{position:absolute;top:14px;right:14px;width:28px;height:28px;background:var(--bg-soft);border:none;border-radius:7px;cursor:pointer;font-size:1rem;color:var(--muted);display:flex;align-items:center;justify-content:center;line-height:1}
.pvx .pv-modal-x:hover{background:var(--line)}
.pvx .pv-modal-icon{margin-bottom:12px}
.pvx .pv-modal-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.18rem;margin:0 0 4px}
.pvx .pv-modal-sub{font-size:.86rem;color:var(--muted);margin:0 0 18px}
.pvx .pv-close-reasons{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}
.pvx .pv-reason-chip{background:var(--bg-soft);border:1.5px solid var(--line);border-radius:100px;padding:7px 15px;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit;color:var(--ink);transition:background .12s,border-color .12s,color .12s}
.pvx .pv-reason-chip:hover{background:#fff0ee;border-color:#e74c3c;color:#e74c3c}
.pvx .pv-reason-chip:disabled{opacity:.5;cursor:not-allowed}
.pvx .pv-close-err{font-size:.8rem;color:var(--red);margin-top:8px}
/* Work order panel */
.pvx .tech-action-bar{display:flex;align-items:center;gap:14px;background:#fff;border:2px solid var(--accent-primary,#C9A96E);border-radius:14px;padding:14px 20px;margin:16px 0;flex-wrap:wrap}
.pvx .tab-action-info{flex:1;min-width:0}
.pvx .tab-action-label{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem}
.pvx .tab-action-sub{font-size:.8rem;color:var(--muted);margin-top:2px}
.pvx .tab-action-btn{background:var(--accent-primary,#C9A96E);color:#fff;border:none;border-radius:9px;padding:10px 20px;font-size:.88rem;font-weight:700;font-family:inherit;cursor:pointer;white-space:nowrap}
.pvx .tab-action-btn:disabled{opacity:.5;cursor:default}
.pvx .tab-action-err{width:100%;font-size:.8rem;color:var(--red,#c0392b);margin-top:4px}
.pvx .wo-panel{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;margin:16px 0}
.pvx .pvw-head{display:flex;align-items:center;justify-content:space-between;width:100%;padding:12px 16px;background:#fff;border:none;border-bottom:1px solid transparent;cursor:pointer;font-family:inherit}
.pvx .pvw-title{display:flex;align-items:center;gap:8px;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.95rem;color:var(--ink)}
.pvx .pvw-title svg{stroke:var(--gold-deep)}
.pvx .pvw-count{background:var(--bg-soft);color:var(--muted);font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:100px}
.pvx .pvw-chev{color:var(--muted);font-size:.8rem}
.pvx .pvw-list{border-top:1px solid var(--line)}
.pvx .pvw-row{display:flex;align-items:center;gap:11px;padding:11px 16px;border-bottom:1px solid var(--line)}
.pvx .pvw-row:last-child{border-bottom:none}
.pvx .pvw-role{font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:3px 8px;border-radius:6px;white-space:nowrap;flex-shrink:0}
.pvx .pvw-customer{background:rgba(50,87,255,.1);color:#3257ff}
.pvx .pvw-admin,.pvx .pvw-manager{background:rgba(201,169,110,.16);color:#8a6d2f}
.pvx .pvw-sales{background:rgba(155,89,182,.12);color:#7d3c98}
.pvx .pvw-tech{background:rgba(28,138,69,.1);color:#1c8a45}
.pvx .pvw-who{font-weight:600;font-size:.86rem}
.pvx .pvw-meta{font-size:.75rem;color:var(--muted);margin-top:1px}
.pvx .wo-panel-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--line)}
.pvx .wo-panel-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.95rem;display:flex;align-items:center;gap:8px}
.pvx .wo-panel-badge{background:var(--amber-soft);color:var(--amber);font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:100px}
.pvx .wo-submit-btn{background:var(--ink);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer}
.pvx .wo-submit-btn:hover{background:var(--slate)}
.pvx .wo-form{padding:14px 16px;border-bottom:1px solid var(--line);background:var(--bg-soft)}
.pvx .wo-textarea{width:100%;border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:.85rem;font-family:inherit;resize:vertical;background:#fff;color:var(--ink);margin-bottom:10px}
.pvx .wo-textarea:focus{outline:none;border-color:var(--accent)}
.pvx .wo-input{width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 12px;font-size:.85rem;font-family:inherit;background:#fff;color:var(--ink);margin-bottom:8px;box-sizing:border-box}
.pvx .wo-input:focus{outline:none;border-color:var(--accent)}
.pvx .wo-select{flex:1;height:38px;border:1px solid var(--line);border-radius:8px;padding:0 10px;font-size:.85rem;font-family:inherit;background:#fff;color:var(--ink);margin-bottom:8px}
.pvx .wo-select:focus{outline:none;border-color:var(--accent)}
.pvx .wo-row{display:flex;gap:8px;align-items:flex-start}
.pvx .wo-amount{flex:1;margin-bottom:8px}
.pvx .wo-amount-tag{font-weight:700;color:var(--accent);margin-left:6px}
.pvx .exp-status-ctrl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}
.pvx .exp-status-sel{height:38px;padding:0 10px;border-radius:8px;border:1.5px solid var(--line);font-size:.82rem;font-family:inherit;background:#fff;cursor:pointer;font-weight:600}
.pvx .exp-status-sel[data-status="pending"]{color:var(--muted);border-color:var(--line)}
.pvx .exp-status-sel[data-status="paid"]{color:#1c8a45;border-color:rgba(28,138,69,.35)}
.pvx .exp-status-sel[data-status="declined"]{color:#e74c3c;border-color:rgba(231,76,60,.35)}
.pvx .exp-reason{margin-bottom:0;flex:1;min-width:160px}
.pvx .exp-pay-fields{display:flex;gap:8px;flex-wrap:wrap;flex:1}
.pvx .exp-pay-fields .wo-input{margin-bottom:0;min-width:120px;flex:1}
.pvx .exp-pay-fields .wo-select{margin-bottom:0;min-width:100px;flex:0}
.pvx .exp-save-btn{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:.8rem;font-weight:700;font-family:inherit;cursor:pointer;white-space:nowrap}
.pvx .exp-save-btn:disabled{opacity:.5;cursor:not-allowed}
.pvx .wo-form-submit{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:.82rem;font-weight:600;font-family:inherit;cursor:pointer}
.pvx .wo-form-submit:disabled{opacity:.4;cursor:not-allowed}
.pvx .wo-empty{padding:14px 16px;font-size:.84rem;color:var(--muted)}
.pvx .wo-item{padding:13px 16px;border-bottom:1px solid var(--line)}
.pvx .wo-item:last-child{border-bottom:none}
.pvx .wo-item-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.pvx .wo-item-badge{font-size:.68rem;font-weight:700;padding:2px 9px;border-radius:100px}
.pvx .wo-item-badge.pending{background:var(--amber-soft);color:var(--amber)}
.pvx .wo-item-badge.approved{background:var(--green-soft);color:var(--green)}
.pvx .wo-item-badge.rejected{background:var(--red-soft);color:var(--red)}
.pvx .wo-item-who{font-size:.76rem;color:var(--muted)}
.pvx .wo-item-notes{font-size:.84rem;color:var(--slate);margin-bottom:10px;line-height:1.5}
.pvx .wo-item-review-note{font-size:.78rem;color:var(--red);margin-bottom:4px;font-style:italic}
.pvx .wo-item-reviewer{font-size:.74rem;color:var(--muted)}
.pvx .wo-item-actions{display:flex;gap:8px;margin-top:8px}
.pvx .wo-btn-approve{background:var(--green-soft);color:var(--green);border:1px solid rgba(28,138,69,.2);border-radius:7px;padding:5px 14px;font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer}
.pvx .wo-btn-approve:hover{background:var(--green);color:#fff}
.pvx .wo-btn-reject{background:var(--red-soft);color:var(--red);border:1px solid rgba(210,60,60,.2);border-radius:7px;padding:5px 14px;font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer}
.pvx .wo-btn-reject:hover{background:var(--red);color:#fff}
.pvx .wo-btn-cancel{background:var(--bg-tint);color:var(--muted);border:1px solid var(--line);border-radius:7px;padding:5px 12px;font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer}
.pvx .wo-reject-form{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
.pvx .wo-reject-input{flex:1;min-width:160px;border:1px solid var(--line);border-radius:7px;padding:5px 10px;font-size:.82rem;font-family:inherit;background:#fff}
.pvx .wo-reject-input:focus{outline:none;border-color:var(--red)}

/* ---- Survey tool panels ---- */
.pvx .pv-survey-tools{display:flex;flex-direction:column;gap:12px;margin:16px 0}
.pvx .pv-lockcard{background:#fff;border:1px solid var(--line);border-top:3px solid #C9A96E;border-radius:14px;padding:22px;text-align:center;display:flex;flex-direction:column;gap:6px;margin:16px 0}
.pvx .pv-lockcard b{font-size:1rem;color:var(--ink)}
.pvx .pv-lockcard span{font-size:.84rem;color:var(--muted)}
.pvx .pv-lockbanner{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:#f3eee3;border:1px solid #e2d3ad;border-left:4px solid #C9A96E;border-radius:10px;padding:10px 16px;margin:12px 0}
.pvx .pv-lockbanner-txt{display:inline-flex;align-items:center;gap:8px;font-size:.84rem;font-weight:700;color:#7a5f1f}
.pvx .pv-lockbanner-btn{height:30px;padding:0 14px;border:1px solid #C9A96E;background:#fff;color:#7a5f1f;border-radius:8px;font-size:.78rem;font-weight:800;cursor:pointer;font-family:inherit}
.pvx .pv-lockbanner-btn:hover{background:#fbf7ee}
.pvx .pv-lockcard a{color:#8a6d2f;font-weight:700;cursor:pointer;text-decoration:underline}
.pvx .pv-survey-continue{margin-top:4px}
.pvx .pv-continue-btn{width:100%;height:48px;border:none;border-radius:11px;background:#0B0F1A;color:#fff;font-size:.9rem;font-weight:800;cursor:pointer;font-family:inherit}
.pvx .pv-continue-btn:hover{background:#2C3347}
.pvx .pv-continue-btn:disabled{opacity:.5;cursor:default}
.pvx .pv-continue-hint{text-align:center;font-size:.82rem;color:var(--muted);padding:12px;background:var(--bg-tint);border:1px dashed var(--line);border-radius:10px}
.pvx .pv-tool-panel{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
/* Numbered tool flow (FlowStep) — the guided 1-2-3 rhythm on a stage. */
.pvx .flow-wrap{display:flex;flex-direction:column;gap:14px;margin:16px 0}
.pvx .flow-step{display:block}
.pvx .flow-bare{display:flex;flex-direction:column;gap:12px}
/* Collapsible tool — a single bar (title + optional action + chevron), no numbered rail. */
.pvx .flow-bare-head{display:flex;align-items:center;gap:10px;padding:11px 16px;background:#fff;border:1px solid var(--line);border-left:3px solid var(--tool-c,var(--line));border-radius:12px;transition:background .12s}
.pvx .flow-bare-toggle{flex:1;min-width:0;display:flex;align-items:center;gap:10px;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;padding:0;color:inherit}
.pvx .flow-bare-head:hover{background:var(--bg-soft)}
.pvx .flow-bare-head .pv-tool-title{font-size:.9rem;font-weight:800;color:var(--ink)}
.pvx .flow-bare-head .pv-tool-sub{font-size:.76rem;color:var(--muted)}
.pvx .flow-bare-chev{margin-left:6px;background:none;border:none;cursor:pointer;font-size:.7rem;color:var(--muted);flex-shrink:0;padding:2px 4px;font-family:inherit}
.pvx .flow-bare-body{display:flex;flex-direction:column;gap:12px;margin-top:12px}
.pvx .flow-card{min-width:0;transition:opacity .3s}
.pvx .flow-step.upcoming .flow-card{opacity:.5}
.pvx .flow-step.upcoming .flow-card:hover{opacity:1}
.pvx .flow-next-tag{flex-shrink:0;font-size:.6rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase;padding:4px 10px;border-radius:100px;background:var(--tool-c,var(--gold));color:#fff;white-space:nowrap}
/* Shaded = done / marked complete — background stays white (matches System QR); only the left
   border + icon + sub-label flip green, so it reads "done & ready" without a full color fill. */
.pvx .flow-step.shaded .flow-bare-head,.pvx .flow-step.shaded .pv-tool-head,.pvx .flow-step.shaded .pv-tool-panel{border-left-color:#2f7d5a}
.pvx .pv-tool-icon.done{background:#e7f6ec;color:#2f7d5a}
.pvx .pv-tool-sub.done{color:#1c8a45;font-weight:800}
/* "Mark as complete" footer at the bottom of an expanded tool. */
.pvx .flow-complete-row{display:flex;justify-content:flex-end;padding-top:4px;border-top:1px dashed var(--line);margin-top:2px}
.pvx .flow-complete-btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;border:1px solid #bfe0c9;border-radius:9px;background:#eef7f0;color:#1d5a2e;font-size:.82rem;font-weight:800;cursor:pointer;font-family:inherit}
.pvx .flow-complete-btn:hover{background:#2f7d5a;border-color:#2f7d5a;color:#fff}
.pvx .flow-reopen{height:34px;padding:0 14px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .flow-reopen:hover{border-color:var(--gold);color:var(--ink)}
.pvx .flow-cant{display:inline-flex;align-items:center;height:34px;padding:0 12px;font-size:.78rem;font-weight:700;color:#9aa1af;font-style:italic}
.pvx .pv-tool-head{width:100%;display:flex;align-items:center;gap:10px;padding:14px 18px;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;transition:background .12s}
.pvx .pv-tool-head:hover{background:var(--bg-soft)}
.pvx .pv-tool-toggle{flex:1;min-width:0;display:flex;align-items:center;gap:10px;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;padding:0;color:inherit}
.pvx .pv-tool-chev-btn{flex-shrink:0;background:none;border:none;cursor:pointer;padding:2px 4px;font-size:.7rem;color:var(--muted)}
.pvx .pv-tool-submit{flex-shrink:0;height:30px;padding:0 15px;border:none;border-radius:8px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.74rem;font-weight:800;cursor:pointer;font-family:inherit}
.pvx .pv-tool-submit:hover{filter:brightness(1.04)}
.pvx .pv-tool-submit:disabled{opacity:.5;cursor:default}
.pvx .pv-tool-chip.sent{background:#eef2fb;color:#2b4a86;border-color:#c5d5f0}
.pvx .pv-tool-icon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;
  color:var(--tool-c,var(--slate));background:color-mix(in srgb,var(--tool-c,var(--slate)) 14%,#fff);
  border:1px solid color-mix(in srgb,var(--tool-c,var(--slate)) 30%,transparent)}
.pvx .pv-tool-panel{border-left:3px solid var(--tool-c,var(--line))}
.pvx .pv-tool-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.97rem;color:var(--ink)}
.pvx .pv-tool-sub{font-size:.78rem;color:var(--muted);flex:1}
.pvx .pv-tool-chip{flex-shrink:0;font-size:.68rem;font-weight:800;letter-spacing:.02em;padding:4px 11px;border-radius:100px;
  background:color-mix(in srgb,var(--tool-c,var(--gold)) 14%,#fff);color:color-mix(in srgb,var(--tool-c,var(--gold)) 75%,#000);
  border:1px solid color-mix(in srgb,var(--tool-c,var(--gold)) 35%,transparent);white-space:nowrap}
.pvx .pv-tool-chip.go{background:#eef7f0;color:#1d5a2e;border-color:#bfe0c9}
.pvx .pv-tool-chip.warn{background:#fdf0ef;color:#a8442f;border-color:#e0b0a8;cursor:help}
.pvx .pv-tool-chev{font-size:.7rem;color:var(--muted);flex-shrink:0}
.pvx .pv-tool-body{border-top:1px solid var(--line);padding:16px 18px}
/* Customer view toggle */
.pvx .pv-custview-bar{display:flex;align-items:center;gap:10px;padding:10px 18px;background:#fff;border:1px solid var(--line);border-radius:10px;margin-bottom:4px}
.pvx .pv-custview-label{font-size:.82rem;font-weight:600;color:var(--muted);flex:1}
.pvx .pv-custview-hint{font-size:.76rem;color:var(--purple);font-weight:600}
.pvx .pv-custview-toggle{width:42px;height:24px;border-radius:100px;border:1.5px solid var(--line);background:var(--bg-tint);cursor:pointer;position:relative;transition:background .2s,border-color .2s;flex-shrink:0}
.pvx .pv-custview-toggle.pv-cv-on{background:var(--purple);border-color:var(--purple)}
.pvx .pv-cv-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.pvx .pv-custview-toggle.pv-cv-on .pv-cv-knob{transform:translateX(18px)}

/* ---- Site Survey embed (iframe) ---- */
.pvx .ss-embed{display:flex;flex-direction:column;gap:8px}
.pvx .ss-embed-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.pvx .ss-embed-tag{font-size:.78rem;color:var(--muted);font-weight:600}
.pvx .ss-embed-open{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg-soft);color:var(--ink);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit;text-decoration:none}
.pvx .ss-embed-open:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .ss-embed-frame{width:100%;height:660px;border:none;border-radius:12px;background:var(--bg-soft);display:block}
.pvx .ss-embed-fs{position:fixed;inset:0;z-index:9999;margin:0;background:var(--bg-soft);padding:10px 14px;display:flex;flex-direction:column;gap:8px}
.pvx .ss-embed-fs .ss-embed-frame{flex:1;height:auto;border-radius:10px}
.pvx .ss-embed-close{color:var(--red)!important;font-weight:700}
/* Native Camera-Mockup toolbar (lifted out of the tool's own chrome) */
.pvx .mk-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pvx .mk-count{display:flex;align-items:center;gap:6px;font-size:.68rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.pvx .mk-count input{width:52px;height:30px;padding:0 6px;text-align:center;border:1px solid var(--line);border-radius:8px;background:var(--bg-soft);color:var(--ink);font-size:.82rem;font-weight:700;font-family:inherit;outline:none}
.pvx .mk-count input:focus{border-color:var(--gold)}
.pvx .mk-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg-soft);color:var(--ink);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .mk-danger{border-color:#e0b0a8;background:#fdf0ef;color:#a8442f}
.pvx .mk-danger:hover{background:#a8442f;border-color:#a8442f;color:#fff}
.pvx .mk-btn:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .mk-seg{display:inline-flex;gap:2px;padding:2px;border:1px solid var(--line);border-radius:9px;background:var(--bg-soft)}
.pvx .mk-seg-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:26px;border:none;border-radius:6px;background:transparent;color:var(--muted);cursor:pointer;transition:.12s}
.pvx .mk-seg-btn:hover{color:var(--ink)}
.pvx .mk-seg-btn.on{background:var(--gold);color:#fff}
.pvx .mk-pagenav{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:2px}
.pvx .mk-parrow{width:32px;height:32px;border:1px solid var(--line);border-radius:8px;background:var(--bg-soft);color:var(--gold-deep);font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center}
.pvx .mk-parrow:hover:not(:disabled){border-color:var(--gold)}
.pvx .mk-parrow:disabled{opacity:.35;cursor:default}
.pvx .mk-pageind{font-size:.78rem;font-weight:700;color:var(--ink);min-width:96px;text-align:center}
/* Customer approval + e-signature panel (Site Survey / Camera Mockup) */
.pvx .sig-panel{margin-top:14px;padding-top:14px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:12px}
.pvx .sig-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.pvx .sig-title{font-size:.8rem;font-weight:800;color:var(--ink)}
.pvx .sig-status{font-size:.76rem;font-weight:700;padding:4px 10px;border-radius:100px}
.pvx .sig-status.ok{background:var(--green-soft);color:var(--green)}
.pvx .sig-status.warn{background:var(--amber-soft);color:var(--amber)}
.pvx .sig-status.pending{background:var(--bg-tint);color:var(--muted)}
.pvx .sig-required-banner{background:var(--amber-soft);color:var(--amber);font-size:.78rem;font-weight:700;padding:9px 12px;border-radius:9px}
.pvx .sig-requests{display:flex;flex-direction:column;gap:6px;background:var(--bg-soft);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.pvx .sig-req-label{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.pvx .sig-req-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.78rem}
.pvx .sig-req-tag{font-size:.66rem;font-weight:800;padding:2px 8px;border-radius:100px}
.pvx .sig-req-tag.change{background:var(--amber-soft);color:var(--amber)}
.pvx .sig-req-tag.remove{background:var(--red-soft);color:var(--red)}
.pvx .sig-req-item{color:var(--ink);font-weight:600}
.pvx .sig-req-note{color:var(--muted);font-style:italic}
.pvx .sig-items{border:1px solid var(--line);border-radius:10px;overflow:hidden}
.pvx .sig-items-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;background:var(--bg-soft);font-size:.74rem;font-weight:700;color:var(--muted)}
.pvx .sig-items-toggle{display:flex;align-items:center;gap:7px;background:none;border:none;padding:0;color:var(--muted);font-size:.74rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .sig-items-toggle:hover{color:var(--ink)}
.pvx .sig-items-chev{color:var(--gold-deep);font-size:.7rem}
.pvx .sig-approve-all{height:26px;padding:0 10px;border:1px solid var(--gold);border-radius:7px;background:#fff;color:var(--gold-deep);font-size:.72rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .sig-approve-all:hover{background:var(--gold);color:#fff}
.pvx .sig-item-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-top:1px solid var(--line);flex-wrap:wrap}
.pvx .sig-item-name{font-size:.8rem;color:var(--ink);font-weight:600}
.pvx .sig-item-actions{display:flex;gap:6px;flex-wrap:wrap}
.pvx .sig-item-btn{height:26px;padding:0 10px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);font-size:.72rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .sig-item-btn:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .sig-item-btn.approve{border-color:var(--green);color:var(--green)}
.pvx .sig-item-btn.approve:hover{background:var(--green);color:#fff}
.pvx .sig-item-btn.danger{border-color:var(--red);color:var(--red)}
.pvx .sig-item-btn.danger:hover{background:var(--red);color:#fff}
.pvx .sig-item-badge-row{display:flex;align-items:center;gap:8px}
.pvx .sig-item-badge{font-size:.7rem;font-weight:700;padding:3px 9px;border-radius:100px}
.pvx .sig-item-badge.approved{background:var(--green-soft);color:var(--green)}
.pvx .sig-item-badge.change{background:var(--amber-soft);color:var(--amber)}
.pvx .sig-item-badge.remove{background:var(--red-soft);color:var(--red)}
.pvx .sig-item-change{background:none;border:none;padding:0;color:var(--gold-deep);font-size:.72rem;font-weight:700;cursor:pointer;font-family:inherit;text-decoration:underline}
.pvx .sig-item-change:hover{color:var(--gold)}
.pvx .sig-sign-btn{align-self:flex-start;height:38px;padding:0 20px;border:none;border-radius:9px;background:var(--gold);color:#fff;font-size:.84rem;font-weight:800;cursor:pointer;font-family:inherit}
.pvx .sig-sign-btn:hover{background:var(--gold-deep)}
.pvx .sig-sign-btn:disabled{background:var(--line);color:var(--muted);cursor:default}
.pvx .sig-sign-hint{font-size:.74rem;color:var(--muted);font-weight:600}
.pvx .sig-override-btn{align-self:flex-start;height:30px;padding:0 12px;border:1px solid var(--red);border-radius:8px;background:#fff;color:var(--red);font-size:.76rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .sig-override-btn:hover{background:var(--red);color:#fff}
.pvx .sig-modal-backdrop{position:fixed;inset:0;z-index:10500;background:rgba(11,15,26,.5);display:flex;align-items:center;justify-content:center;padding:20px}
.pvx .sig-modal{background:#fff;border-radius:14px;padding:22px;width:min(380px,92vw);box-shadow:0 24px 70px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:14px}
.pvx .sig-modal-title{font-size:1rem;font-weight:800;color:var(--ink)}
.pvx .sig-modal-field{display:flex;flex-direction:column;gap:6px;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.pvx .sig-modal-field input,.pvx .sig-modal-field select,.pvx .sig-modal-field textarea{font-family:inherit;font-size:.9rem;font-weight:600;text-transform:none;letter-spacing:normal;color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:10px 12px;outline:none;resize:vertical}
.pvx .sig-modal-field input,.pvx .sig-modal-field select{height:38px;padding:0 12px}
.pvx .sig-modal-field input:focus,.pvx .sig-modal-field select:focus,.pvx .sig-modal-field textarea:focus{border-color:var(--gold)}
.pvx .sig-modal-stamp{font-size:.78rem;color:var(--muted);font-weight:600}
.pvx .sig-modal-acts{display:flex;align-items:center;gap:10px;margin-top:4px}
.pvx .sig-modal-cancel{background:none;border:none;color:var(--muted);font-weight:700;font-size:.82rem;cursor:pointer;font-family:inherit}
.pvx .sig-modal-confirm{flex:1;height:40px;border:none;border-radius:9px;background:var(--gold);color:#fff;font-weight:800;font-size:.86rem;cursor:pointer;font-family:inherit}
.pvx .sig-modal-confirm:disabled{opacity:.45;cursor:default}
.pvx .sig-modal-confirm:hover:not(:disabled){background:var(--gold-deep)}
.pvx .sig-preview-label{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.pvx .sig-preview-box{border:1px dashed var(--line);border-radius:9px;padding:16px 14px 10px;background:var(--bg-soft);display:flex;align-items:flex-end}
.pvx .sig-preview-script{font-family:'Segoe Script','Brush Script MT','Lucida Handwriting',cursive;font-size:1.7rem;color:var(--ink);line-height:1}
.pvx .sig-disclosure{font-size:.72rem;line-height:1.5;color:var(--muted);background:var(--bg-soft);border:1px solid var(--line);border-radius:9px;padding:10px 12px;max-height:110px;overflow-y:auto}
.pvx .sig-disclosure-toggle{background:none;border:none;padding:0;color:var(--gold-deep);font-weight:800;font-size:inherit;cursor:pointer;text-decoration:underline;font-family:inherit}
.pvx .sig-consent-row{display:flex;align-items:flex-start;gap:9px;font-size:.8rem;font-weight:600;color:var(--ink);cursor:pointer}
.pvx .sig-consent-row input{width:16px;height:16px;margin-top:1px;cursor:pointer;accent-color:var(--gold);flex-shrink:0}
.pvx .sig-block{margin-top:2px;padding:18px 18px 14px;border:1px solid var(--line);border-radius:12px;background:var(--bg-soft)}
.pvx .sig-block-script{font-family:'Segoe Script','Brush Script MT','Lucida Handwriting',cursive;font-size:2.1rem;color:var(--ink);line-height:1}
.pvx .sig-block-line{height:1px;background:var(--line);margin-top:8px}
.pvx .sig-block-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px;font-size:.74rem;font-weight:700;color:var(--muted)}
.pvx .sig-block-foot{margin-top:8px;font-size:.68rem;color:var(--green);font-weight:700}
/* Customer floor-plan zoom lightbox */
.pvx .ss-zoom{position:fixed;inset:0;z-index:10000;background:rgba(11,15,26,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px}
.pvx .ss-zoom-x{position:fixed;top:16px;right:18px;width:40px;height:40px;border-radius:50%;background:#fff;border:none;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--ink);z-index:10001;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.pvx .ss-zoom-x:hover{background:var(--red-soft);color:var(--red)}
.pvx .ss-zoom-scroll{max-width:96vw;max-height:86vh;overflow:auto;border-radius:10px;display:flex;align-items:center;justify-content:center}
.pvx .ss-zoom-img{display:block;max-width:96vw;max-height:86vh;object-fit:contain;cursor:zoom-in;transition:transform .12s;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.pvx .ss-zoom-img.zoomed{max-width:none;max-height:none;width:200%;cursor:zoom-out}
.pvx .ss-zoom-hint{color:#fff;opacity:.65;font-size:.8rem;margin-top:12px}

/* ---- Scheduling widget ---- */
.pvx .sched-tool{display:flex;flex-direction:column;gap:12px}
.pvx .sched-sec-label{font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:4px}
.pvx .sched-team{}
.pvx .sched-avatars{display:flex;gap:8px;flex-wrap:wrap}
.pvx .sched-av{display:flex;align-items:center;gap:8px;padding:7px 12px;background:var(--bg-soft);border:1px solid var(--line);border-radius:9px;min-width:0}
.pvx .sched-av-init{width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,var(--slate),var(--ink));color:var(--gold);font-weight:700;font-size:.82rem;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.pvx .sched-av-info{display:flex;flex-direction:column;min-width:0}
.pvx .sched-av-name{font-size:.82rem;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px}
.pvx .sched-av-role{font-size:.68rem;color:var(--muted);text-transform:capitalize}
.pvx .sched-av-admin .sched-av-init{background:var(--ink);color:#fff}
.pvx .sched-av-manager .sched-av-init{background:var(--gold-deep);color:#fff}
.pvx .sched-av-tech .sched-av-init{background:var(--accent);color:#fff}
.pvx .sched-av-sales .sched-av-init{background:var(--green);color:#fff}
.pvx .sched-av-customer .sched-av-init{background:var(--purple);color:#fff}
.pvx .sched-ev-dir{display:inline-flex;align-items:center;gap:4px;margin-left:8px;font-size:.74rem;font-weight:600;color:var(--accent);text-decoration:none;flex-shrink:0}
.pvx .sched-ev-dir:hover{text-decoration:underline}
.pvx .sched-ev-dir svg{color:var(--accent)}
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
.pvx .sched-checks{display:flex;gap:8px;flex-wrap:wrap}
.pvx .sched-check{display:inline-flex;align-items:center;gap:6px;font-size:.82rem;cursor:pointer;padding:5px 10px;border:1px solid var(--line);border-radius:7px;background:#fff}
.pvx .sched-check-role{font-size:.68rem;color:var(--muted);text-transform:capitalize}
/* Invite: chips + member/customer search */
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
.pvx .sched-form-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.pvx .sched-save-btn{background:var(--ink);color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:.84rem;font-weight:600;font-family:inherit;cursor:pointer}
.pvx .sched-save-btn:hover{background:var(--slate)}
.pvx .sched-save-btn:disabled{opacity:.4;cursor:not-allowed}
.pvx .sched-gcal-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1.5px solid var(--line);border-radius:8px;font-size:.82rem;font-weight:600;color:var(--ink);text-decoration:none;background:#fff;transition:.12s;font-family:inherit}
.pvx .sched-gcal-btn:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .sched-events{display:flex;flex-direction:column;gap:10px}
.pvx .sched-event{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;gap:14px;align-items:flex-start;box-shadow:0 1px 2px rgba(14,19,32,.03)}
.pvx .sched-ev-tile{flex-shrink:0;width:50px;height:54px;border-radius:9px;border:1px solid var(--line);background:var(--bg-soft);display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
.pvx .sched-ev-mon{font-size:.62rem;font-weight:700;letter-spacing:.08em;color:var(--gold-deep);background:#faf4e8;width:100%;text-align:center;padding:2px 0;line-height:1.2}
.pvx .sched-ev-day{font-family:'Bricolage Grotesque',sans-serif;font-size:1.3rem;font-weight:800;color:var(--ink);line-height:1;margin-top:5px}
.pvx .sched-ev-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.pvx .sched-ev-row{display:flex;align-items:flex-start;gap:8px}
.pvx .sched-ev-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.95rem;color:var(--ink);flex:1;line-height:1.3}
.pvx .sched-ev-acts{display:flex;gap:4px;flex-shrink:0}
.pvx .sched-ev-ico{width:28px;height:28px;border:1px solid var(--line);border-radius:7px;background:#fff;cursor:pointer;font-family:inherit;color:var(--muted);text-decoration:none;display:inline-flex;align-items:center;justify-content:center;transition:.12s}
.pvx .sched-ev-ico:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .sched-ev-del:hover{border-color:var(--red)!important;color:var(--red)!important;background:var(--red-soft)!important}
.pvx .sched-ev-line{display:flex;align-items:center;gap:7px;font-size:.8rem;color:var(--muted)}
.pvx .sched-ev-line svg{flex-shrink:0;color:var(--gold-deep)}
.pvx .sched-ev-line span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.pvx .sched-ev-notes{font-size:.79rem;color:var(--slate);background:var(--bg-soft);border-left:2px solid var(--gold);padding:6px 10px;border-radius:0 6px 6px 0;margin-top:2px}
.pvx .sched-empty{font-size:.84rem;color:var(--muted);padding:8px 0}

/* ---- Mockup widget ---- */
.pvx .mkp-tool{display:flex;flex-direction:column;gap:12px}
.pvx .mkp-top{display:flex;align-items:center;gap:10px}
.pvx .mkp-upload-btn{display:inline-flex;align-items:center;gap:6px;background:var(--ink);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:.84rem;font-weight:600;font-family:inherit;cursor:pointer;transition:background .12s}
.pvx .mkp-upload-btn:hover{background:var(--slate)}
.pvx .mkp-upload-btn:disabled{opacity:.5;cursor:not-allowed}
.pvx .mkp-count{font-size:.78rem;color:var(--muted)}
.pvx .mkp-empty{font-size:.84rem;color:var(--muted);padding:12px 0}
.pvx .mkp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.pvx .mkp-card{border:1.5px solid var(--line);border-radius:10px;overflow:hidden;cursor:pointer;transition:.12s;background:#fff}
.pvx .mkp-card:hover{border-color:var(--gold)}
.pvx .mkp-card-sel{border-color:var(--accent)!important;box-shadow:0 0 0 3px var(--accent-soft)}
.pvx .mkp-thumb-wrap{height:120px;background:var(--bg-tint);display:flex;align-items:center;justify-content:center;overflow:hidden}
.pvx .mkp-thumb{width:100%;height:100%;object-fit:cover}
.pvx .mkp-card-foot{display:flex;align-items:center;gap:6px;padding:6px 8px;border-top:1px solid var(--line)}
.pvx .mkp-card-name{font-size:.72rem;color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pvx .mkp-card-acts{display:flex;gap:3px;flex-shrink:0}
.pvx .mkp-act{width:22px;height:22px;border-radius:5px;border:1px solid var(--line);background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted);transition:.1s}
.pvx .mkp-act:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .mkp-del:hover{border-color:var(--red)!important;color:var(--red)!important}
.pvx .mkp-notes{width:100%;border:1px solid var(--line);border-radius:9px;padding:10px 13px;font-family:inherit;font-size:.84rem;color:var(--ink);background:#fff;resize:vertical;min-height:60px}
.pvx .mkp-notes:focus{outline:none;border-color:var(--accent)}
.pvx .mkp-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:300;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;cursor:pointer}
.pvx .mkp-lb-close{position:fixed;top:16px;right:16px;width:36px;height:36px;border-radius:50%;background:#fff;border:none;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--ink);z-index:301}
.pvx .mkp-lb-img{max-width:90vw;max-height:80vh;object-fit:contain;border-radius:8px;cursor:default;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.pvx .mkp-lb-name{color:#fff;font-size:.82rem;margin-top:10px;opacity:.7}
`;


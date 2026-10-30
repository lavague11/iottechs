"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { optionTotals, itemTotal, titleCase, serviceColor, fmtSignStamp, PAYMENT_PLANS, planScheduleRows, planDepositPct, displayOptionName, cameraNameOverrides, lineRole } from "../../../lib/proposal";
import { skipOutsideClose } from "../../../lib/outside-click";
import { lineConditionBadges } from "../../../lib/proposal-terms";
import { saveFillableProposalPdf } from "../../../lib/proposal-acroform";
import { exportSurvey2Images } from "../../../lib/survey2-export";
import { parseSurveyFloors, surveyDevices } from "../../../lib/survey2-model";
import { downloadSurveyPdf } from "../../../lib/survey-pdf";
import { exportMockupImages } from "../../../lib/mockup-export";
import { compactAppendix } from "../../../lib/image-compact";
import { survey2HasData } from "../../../lib/tool-data";
import { selectOptionAction, requestChangesAction, getProposalAction, submitProposalFlagsAction, declineOptionAction, approvePcpAction, voidPcpAgreementAction, getToolDataAction, proposalLayoutMetaAction, getProposalDiffAction, customerActionsAction } from "./proposal-actions";

// What changed since the customer last signed (ledger P4) — structured, never raw JSON. Rendered
// above the acceptance box only when the current version supersedes a signed one.
function ProposalDiff({ diff, fromVersion, toVersion, signedAt, fmtMoney }) {
  if (!diff?.any) return null;
  const $ = (n) => fmtMoney ? fmtMoney(n) : "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
  const line = (it, cls) => <li key={cls + it.name + it.svc} className={`pcv-diff-li ${cls}`}><span>{it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}</span><b>{$(it.qty * it.price)}</b></li>;
  return (
    <div className="pcv-diff">
      <div className="pcv-section-hd">What changed <span className="pcv-diff-v">v{fromVersion} → v{toVersion}</span></div>
      {diff.options.map((o) => (
        <div key={o.id} className="pcv-diff-opt">
          {diff.options.length > 1 && <div className="pcv-diff-opt-h">{o.name}{o.optionAdded ? " — new" : o.optionRemoved ? " — removed" : ""}</div>}
          {o.added?.length > 0 && <ul className="pcv-diff-list"><li className="pcv-diff-k">Added</li>{o.added.map((it) => line(it, "add"))}</ul>}
          {o.changed?.length > 0 && <ul className="pcv-diff-list"><li className="pcv-diff-k">Changed</li>{o.changed.map((c) => (
            <li key={"chg" + c.name + c.svc} className="pcv-diff-li chg"><span>{c.name}</span><b>{c.from.qty !== c.to.qty ? `×${c.from.qty} → ×${c.to.qty}` : ""}{c.from.price !== c.to.price ? ` ${$(c.from.price)} → ${$(c.to.price)}` : ""}{c.from.waived !== c.to.waived ? (c.to.waived ? " waived" : " no longer waived") : ""}</b></li>
          ))}</ul>}
          {o.removed?.length > 0 && <ul className="pcv-diff-list"><li className="pcv-diff-k">Removed</li>{o.removed.map((it) => line(it, "rm"))}</ul>}
          {o.discount && <div className="pcv-diff-li"><span>Discount</span><b>changed</b></div>}
          {o.pcp && <div className="pcv-diff-li"><span>PCP credit</span><b>{o.pcp.from}% → {o.pcp.to}%</b></div>}
          {o.total && o.total.from !== o.total.to && <div className="pcv-diff-total"><span>Total</span><b><s>{$(o.total.from)}</s> {$(o.total.to)}</b></div>}
        </div>
      ))}
      {diff.tax && <div className="pcv-diff-li"><span>Tax</span><b>{diff.tax.from}% → {diff.tax.to}%</b></div>}
      {diff.deposit && <div className="pcv-diff-li"><span>Deposit</span><b>{diff.deposit.from}% → {diff.deposit.to}%</b></div>}
      <div className="pcv-diff-note">Your earlier signature{signedAt ? ` (${fmtSignStamp(signedAt)})` : ""} stays on record for v{fromVersion}. Any deposit already paid carries forward.</div>
    </div>
  );
}
import { TaglinePill, Wordmark } from "../../components/brand";
import EsignSigner from "./esign/esign-signer";
import ProposalItemsEditor from "./proposal-items-editor";
import ProposalFinancialSummary from "./proposal-financial-summary";
import ProposalPaymentPlan from "./proposal-payment-plan";
import PaymentOptions from "./payment-options";
import SystemWalkthrough from "./system-walkthrough";
import { useAccordionItem, useAccordion } from "./flow-accordion";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// A customer write is a server action (POST to /project/<id>). The call can fail to DISPATCH — a
// network blip, or a stale page after a redeploy whose action id now 404s — which REJECTS the promise
// instead of returning {error}. Without this, the awaiting handler never clears `busy` and the customer
// is stuck on a dead "Signing…/Sending…" button with no feedback. Fold a throw into the normal {error}
// path so the control resets and a retry message shows. Mirrors the esign signer's own .catch pattern.
const CONN_ERR = "Couldn't reach the server. Check your connection and try again — if it keeps happening, refresh the page.";
const callAction = (promise) => promise.catch(() => ({ error: CONN_ERR }));
// Per-option accent so the customer can tell A / B / C apart at a glance.
const OPTION_TABCOLORS = { A: "var(--gold)", B: "#4b6a9b", C: "var(--green)" };

// Outdoor items get their "(O)" suffix colored red — an <input>'s value can't be partially
// colored (that's why the builder colors its whole name field instead), but here it's plain
// text so only the marker itself needs to stand out, not the whole name.
function itemNameNode(name, outdoor) {
  const title = titleCase(name);
  if (!outdoor) return title;
  const m = title.match(/^(.*?)(\s*\(O\))$/);
  if (!m) return <span style={{ color: "var(--red)", fontWeight: 700 }}>{title}</span>;
  return <>{m[1]}<span style={{ color: "var(--red)", fontWeight: 700 }}>{m[2]}</span></>;
}

// Customer review surface — HTML mirror of the brand PDF (lib/proposal-pdf.js): navy header
// banner, gold "SYSTEM PROPOSAL" tag, client info box, section headers, cost breakdown table,
// camera locations, payment terms, acceptance block. Same document the customer can Download
// as a PDF, just interactive (option tabs, expandable breakdowns, Select / Request changes).
// Receives the server-sanitized proposal (no cost/margin — stripped before it ever reaches
// the browser). `preview` = staff looking through the customer-view toggle → actions disabled.
// Pretty US phone: (xxx) xxx-xxxx. Leaves anything non-standard as-is.
const fmtPhone = (v) => {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return v;
};

export default function ProposalCustomerView({ fileBase = null, accessId, proposal, preview, customerName, customerAddress, customerPhone, customerEmail, onAdvance, onStageSync, canVoid = false, embedded = false }) {
  const [p, setP] = useState(proposal);
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);             // building the PDF (survey rasterize can take a moment)
  const [copied, setCopied] = useState(false);             // "Copied" flash after Share
  const [voidPcpOpen, setVoidPcpOpen] = useState(false);   // admin void of the PCP agreement signature
  const [err, setErr] = useState(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [note, setNote] = useState("");
  const [openItems, setOpenItems] = useState({});   // item id -> breakdown expanded
  const toggleItem = (id) => setOpenItems((o) => ({ ...o, [id]: !o[id] }));
  // Summary-first: the customer reads a calm system summary + the one number up top; the full
  // itemized cost table lives behind "View detailed breakdown" (collapsed by default). Staff looking
  // through the preview toggle, or the full-screen deck overlay, get the detail open so nothing hides.
  const [detailOpen, setDetailOpen] = useState(true);   // the line-item breakdown is core proposal info — visible by default; "Hide details" is the only control

  // ---- Revise mode: per-line change/remove requests (flags), not real edits ----
  const [reviseMode, setReviseMode] = useState(false);
  const [flags, setFlags] = useState(() => proposal?.customerFlags || {});
  const [menuFor, setMenuFor] = useState(null);   // item id whose action menu is open
  const [menuNote, setMenuNote] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // ---- "Your System Layout": the customer's floor plan(s) with cameras placed + the mockup photos,
  // rendered straight from the saved survey2 / mockup data (no off-screen render). Collapsible.
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [hasLayout, setHasLayout]   = useState(false);   // light mount check — is there anything to show?
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [survey2Raw, setSurvey2Raw] = useState(null);
  const [mockupRaw, setMockupRaw]   = useState(null);
  const [focusCid, setFocusCid]     = useState(null);   // camera the customer asked to locate (View Placement)
  const rootRef = useRef(null);
  // Guided-review spotlight targets (Cost → Payment terms → Review & Sign).
  const costRef = useRef(null);
  const payRef = useRef(null);
  const signRef = useRef(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);   // big → compact for this version (per device)
  const [reqActions, setReqActions] = useState(null);   // canonical outstanding customer actions (server resolver)
  const [camRoster, setCamRoster] = useState([]);   // survey camera roster → camera line-item location names
  useEffect(() => {   // booleans only — the heavy survey/mockup blobs are NOT fetched here
    let live = true;
    proposalLayoutMetaAction(accessId).then((r) => { if (live && r?.ok) setHasLayout(!!(r.hasSurvey || r.hasMockup)); });
    // The camera location names come from the survey (single source of truth) — lightweight roster.
    fetch(`/api/project-cameras?accessId=${encodeURIComponent(accessId)}`).then((r) => r.json())
      .then((j) => { if (live && j?.ok) setCamRoster(Array.isArray(j.cameras) ? j.cameras : []); }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);
  async function ensureLayoutLoaded() {
    if (layoutLoaded) return;
    setLayoutLoaded(true); setLayoutBusy(true);   // fetch the full data only the first time it's opened
    const [sv, mk] = await Promise.all([
      getToolDataAction(accessId, "survey2").catch(() => null),
      getToolDataAction(accessId, "mockup").catch(() => null),
    ]);
    setSurvey2Raw(sv?.saved?.data || null); setMockupRaw(mk?.saved?.data || null); setLayoutBusy(false);
  }
  function toggleLayout() {
    const next = !layoutOpen; setLayoutOpen(next);
    if (next) ensureLayoutLoaded();
  }
  // "View Placement" on a camera line: open the layout, load it, and locate that exact camera by its
  // stable id (camera_id → survey camera cid). Read-only — the customer sees where it goes, nothing to edit.
  async function viewPlacement(cid) {
    if (!cid) return;
    setLayoutOpen(true);
    await ensureLayoutLoaded();
    setFocusCid(cid);
  }
  // Once the located dot exists in the DOM, scroll it into view and let the pulse play; then release
  // the focus so tapping the same camera again re-triggers it.
  useEffect(() => {
    if (!focusCid) return;
    const t = setTimeout(() => {
      // Walkthrough mode: the tour jumps to the camera (by cid) — bring the tour into view. Static
      // mode (no placed cameras / plain plans): scroll to the matching dot.
      const el = rootRef.current?.querySelector(`[data-cid="${focusCid}"]`) || rootRef.current?.querySelector(".swk");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    const clear = setTimeout(() => setFocusCid(null), 2200);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [focusCid, layoutBusy, survey2Raw]);
  const layoutFloors = useMemo(() => {
    const floors = parseSurveyFloors(survey2Raw);
    const devs = surveyDevices(floors);
    return floors.map((f, fi) => ({ name: f.name, bg: f.bg, scale: f.scale || null, aerial: f.aerial || null, devices: f.devices || [], zones: f.zones || [], boundary: f.boundary || null, sides: f.sides || null, plan: f.plan || null, ctx: f.ctx || null, cams: (f.devices || []).filter((x) => x.k === "cam"),
      // Every placed device (speakers, readers, APs…) for the plan view — same model as the PDF.
      markers: devs.filter((d) => d.floor === fi && !d.annotation) }));
  }, [survey2Raw]);
  // With placed cameras, the interactive walkthrough replaces the static floor grid (it IS the map,
  // one camera at a time). Floor plans with no cameras still render as plain plans.
  const hasCams = layoutFloors.some((f) => (f.cams || []).length > 0);
  const layoutPhotos = useMemo(() => {
    try { const d = JSON.parse(mockupRaw); return (d.photos || [])
      .map((url, i) => ({ url, name: (d.names && d.names[i]) || `Camera ${i + 1}` }))
      .filter((x) => typeof x.url === "string" && x.url.startsWith("data:image")); }
    catch { return []; }
  }, [mockupRaw]);
  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [esignFor, setEsignFor] = useState(null);   // option id open in the PDF signer (lib/esign): Approve & Sign → the actual proposal PDF
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

  // Canonical outstanding customer actions (proposal signature, change orders, PCP approval) — drives the
  // multi-document action center. Re-pulled whenever the proposal state changes (sign / revise / new version).
  useEffect(() => {
    if (preview || embedded) return;   // customer surface only
    let live = true;
    customerActionsAction(accessId).then((r) => { if (live && r?.ok) setReqActions(Array.isArray(r.actions) ? r.actions : []); }).catch(() => {});
    return () => { live = false; };
  }, [accessId, preview, embedded, p?.signed_at, p?.status, p?.version, p?.pcp_agreed_at]);
  // Direct signing deep-link — /project/<id>?open=proposal&sign=<optKey>. The admin "Request Signature"
  // share/email and the Send workflow point here; the customer lands after the PIN gate (the deck only
  // mounts this once access is granted) and the signer auto-opens on the current revision. Captured at
  // first render so the deck's param-strip can't race it, consumed once, then stripped from the URL. It
  // never forces a signature: if the proposal isn't currently signable we just surface a note. Outdated /
  // revised / already-signed proposals are rejected downstream by the e-sign version+fingerprint binding.
  const signWanted = useRef(undefined);
  if (signWanted.current === undefined) {
    try { signWanted.current = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("sign") : null; }
    catch { signWanted.current = null; }
  }
  const signConsumed = useRef(false);
  useEffect(() => {
    // NOT gated on `embedded`: the deck renders the real customer proposal surface embedded, so the link
    // must still open the signer there. Only a staff preview-as-customer (`preview`) is skipped.
    if (signConsumed.current || preview) return;
    const want = signWanted.current;
    if (!want || !p || !p.payload || !Array.isArray(p.payload.options)) return;
    signConsumed.current = true;
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("sign")) { u.searchParams.delete("sign"); window.history.replaceState({}, "", u.pathname + u.search + u.hash); }
    } catch { /* history API unavailable — harmless */ }
    const accepted = new Set(p.accepted_options || []);
    const signable = !(p.signed_name && accepted.size > 0) && ["sent", "changes_requested", "accepted", "declined"].includes(p.status);
    if (!signable) { showToast("This proposal isn’t awaiting a signature right now."); return; }
    const opts = p.payload.options;
    const match = opts.find((o) => String(o.id) === String(want)) || (opts.length === 1 ? opts[0] : null);
    if (match && accepted.has(match.id)) showToast("That option is already signed.");
    else if (match) setEsignFor(match.id);
    else showToast("Open a proposal option to review and sign.");
  }, [p, preview]);

  // Keep the working flag set in sync with whatever the server last stored.
  const savedFlagsKey = JSON.stringify(p?.customerFlags || {});
  useEffect(() => { setFlags(p?.customerFlags || {}); }, [savedFlagsKey]);
  // Close the per-line action menu on an outside click.
  useEffect(() => {
    if (menuFor == null) return;
    function onDown(e) { if (skipOutsideClose(e)) return; if (!e.target.closest(".pcv-linemenu") && !e.target.closest(".pcv-row")) setMenuFor(null); }
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
    const r = await callAction(submitProposalFlagsAction(accessId, next));
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
    const r = await callAction(approvePcpAction(accessId, customerName));
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    if (r.proposal) setP(r.proposal);
    showToast("PCP agreement approved — thank you");
  }
  // Admin/manager correction: void the customer's PCP agreement signature so it can be re-approved.
  async function voidPcp() {
    setBusy(true); setErr(null);
    const r = await callAction(voidPcpAgreementAction(accessId));
    setBusy(false); setVoidPcpOpen(false);
    if (r?.error) { setErr(r.error); return; }
    if (r.proposal) setP(r.proposal);
    showToast("PCP signature voided — customer can re-approve");
  }

  // Rasterize BOTH tools exactly as they render on screen — each mockup page (iPhone frame + camera grid)
  // and each site-survey floor plan (pinned) — into the appendix the proposal PDF carries. Shared by the
  // Download button AND the signer (so the customer signs the SAME survey/mockup pages they can download).
  // All best-effort: a missing/empty tool just means fewer appendix pages, never a failure.
  async function buildAppendix() {
    let mockupImages = [], surveyImages = [], surveyFloors = [];
    try {
      const [mk, sv] = await Promise.all([
        getToolDataAction(accessId, "mockup").catch(() => null),
        getToolDataAction(accessId, "survey2").catch(() => null),
      ]);
      const jobs = [];
      // Only render the mockup when it was actually built — i.e. it has at least one placed photo. A
      // photo is an inline data: URL OR (the normal path) a small /api/media URL, so count any non-empty
      // string — not just data: (checking only data: wrongly skipped mockups whose photos are URLs).
      let hasMockupPhoto = false;
      try {
        const md = mk?.saved?.data ? JSON.parse(mk.saved.data) : null;
        hasMockupPhoto = Array.isArray(md?.photos) && md.photos.some((x) => typeof x === "string" && x.length > 0);
      } catch { /* bad mockup blob */ }
      if (hasMockupPhoto && mk?.saved?.data) {
        jobs.push(exportMockupImages(accessId, mk.saved.data).then((r) => { mockupImages = r; }).catch(() => {}));
      }
      // Only render the Site Survey ("views") when it has real content — a built floor plan, not an empty
      // default survey. Otherwise the customer's proposal is padded with blank survey pages.
      if (sv?.saved?.data && survey2HasData(sv.saved.data)) {
        surveyFloors = parseSurveyFloors(sv.saved.data);
        jobs.push(exportSurvey2Images(sv.saved.data).then((r) => { surveyImages = r; }).catch(() => {}));
      }
      await Promise.all(jobs);
    } catch { /* fetch failed — proceed numbers-only */ }
    // Shrink the appendix (2400px PNG floor plans → capped JPEG) so the proposal PDF stays light and the
    // signer / download load fast. Best-effort: on any hiccup the originals pass through unchanged.
    try { ({ surveyImages, mockupImages } = await compactAppendix({ surveyImages, mockupImages })); } catch { /* keep originals */ }
    return { mockupImages, surveyImages, surveyFloors };
  }

  // Build & download the PDF (best-effort appendix as above).
  async function handleDownload(mode = "standard") {
    if (dlBusy) return;
    setDlBusy(true);
    const { mockupImages, surveyImages, surveyFloors } = await buildAppendix();
    try {
      if (mode === "survey") downloadSurveyPdf({ fileBase, customerName, customerAddress, projectId: accessId, surveyImages });
      else await saveFillableProposalPdf(p, { customerName, customerAddress, customerPhone, customerEmail, mode, fileBase, projectId: accessId }, { mockupImages, surveyImages, surveyFloors });
    } finally {
      setDlBusy(false);
    }
  }

  // Share a link that opens straight to this proposal (still PIN-gated at the door).
  async function shareProposal() {
    const url = `${window.location.origin}/project/${accessId}?stage=proposal&open=proposal`;
    try { if (navigator.share) { await navigator.share({ title: "IOT TECHS proposal", url }); return; } } catch { /* share sheet cancelled — fall through to copy */ }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt("Copy this link to share the proposal:", url); }
  }

  // A proposal row can exist with empty / missing options — cloned, imported or legacy rows that the
  // write-time validatePayload never normalized. Treat that exactly like "not ready yet" (the Preparing
  // state) so the customer view never dereferences a missing option and crashes the whole page
  // ("This page couldn't load"). Guard here covers every p.payload.options / opt use below.
  if (!p || !p.payload || !Array.isArray(p.payload.options) || !p.payload.options.length) {
    return (
      <div className="pcv-root">
        <style>{PCV_CSS}</style>
        <div className="pcv-header">
          <div className="pcv-hd-left">
            <a href="/go" className="pcv-brand" aria-label="IOT TECHS home" style={{ display: "inline-flex", color: "inherit", textDecoration: "none" }}><Wordmark height={20} /></a>
            <TaglinePill tone="dark" className="pcv-pill" />
          </div>
          <span className="pcv-doctag">Proposal</span>
        </div>
        <div className="pcv-empty">Preparing your proposal…</div>
      </div>
    );
  }

  const acceptedSet = new Set(p.accepted_options || []);
  const declinedMap = p.declined_options || {};
  const optName = (id) => displayOptionName(p.payload.options.find((o) => o.id === id)?.name) || `Option ${id}`;
  const opt = p.payload.options.find((o) => o.id === viewingOpt) || p.payload.options[0];
  const optAccepted = acceptedSet.has(opt.id);
  const optDeclined = Object.prototype.hasOwnProperty.call(declinedMap, opt.id);
  const t = optionTotals(opt, p.tax_rate, p.payload.discount, p.deposit_pct, p.payload.pcp_credit);
  // Conditional disclosure: Subtotal earns its place only when a modifier moves the price between it and the
  // grand total. With no discount/credit/tax, Project Subtotal === Grand Total, so it's dropped (Total alone).
  const hasMods = t.discount > 0 || t.pcpCredit > 0 || t.tax > 0;
  // A per-section subtotal is a sub-grouping — it only means something when there are two+ priced sections.
  // With a single section its number equals the grand total, so the section-subtotal line is dropped.
  const pricedSvcCount = (opt.services || []).filter((s) => s.items?.length).length;
  const depositPct = planDepositPct(p.payload, p.deposit_pct);   // the up-front % from the PAYMENT PLAN (not the legacy deposit_pct) — keeps this summary consistent with the Payment Terms table below
  const camSvc = (opt.services || []).find((s) => s.key === "camera");
  const camBlocks = (camSvc?.items || []).filter((it) => (it.sub || []).length > 0);
  // Camera line items show the survey's location name (Side Yard, Front Driveway…) — synced from the
  // one source of truth — instead of a generic "Full Camera Install".
  const camNames = cameraNameOverrides(opt.services || [], camRoster);
  const payPlan = p.payload.payment_plan || "custom";
  const fullDate = p.payload.full_date || null;
  const payBase = p.signed_at || p.sent_at || p.created_at || null;
  const payBaseDate = payBase ? new Date(String(payBase).replace(" ", "T")) : new Date();
  const dueOn = (days) => { const d = new Date(payBaseDate); d.setDate(d.getDate() + (+days || 0)); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
  // ONE schedule source (shared with the PDF + builder): milestones → rows. A pay-in-full plan is
  // ONE row (before we begin / upon completion / by a chosen date), never a Deposit+Final split.
  const payWhen = (when) => {
    const w = (when || "").toLowerCase();
    if (w.includes("before")) return "Before we begin";     // pay-in-full prepaid → words, not a date
    if (w.startsWith("by ")) return when.slice(3);           // chosen date
    if (w.includes("midpoint")) return dueOn(14);
    if (w.includes("completion")) return "Upon completion";
    if (w.includes("begin")) return dueOn(0);                // "to begin" (50/50 deposit) → the date
    return when || dueOn(0);
  };
  const payPhase = (when, i, n) => {
    if (n === 1) return "Payment";
    const w = (when || "").toLowerCase();
    if (w.includes("midpoint")) return "Progress";
    if (w.includes("completion") || i === n - 1) return "Final";
    if (i === 0) return "Deposit";
    return "Progress";
  };
  const paySched = planScheduleRows(payPlan, p.payload.custom_plan?.rows, t.grand, fullDate);
  // [phase, trigger, pctLabel, amount] — ready-to-render strings.
  const payPhases = paySched.map((r, i) => [payPhase(r.when, i, paySched.length), payWhen(r.when), r.pctLabel, r.amount || 0]);
  const payTerms = (fullDate && (payPlan === "100" || payPlan === "100_end") && paySched[0])
    ? "Paid in full " + paySched[0].when + "."
    : (PAYMENT_PLANS[payPlan]?.terms || "");
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
  // In the deck's full-screen tool overlay (embedded) the proposal IS the whole screen, so there's
  // nothing to make room for — the document stays expanded even once signed, instead of auto-folding
  // to the acceptance summary. The chevron still lets the viewer collapse it by hand.
  // The proposal content is ALWAYS visible — the only collapsible layer is the PROJECT HEADER above.
  // The old per-proposal "Review" / collapse toolbar was removed, so nothing toggles this any more.
  const docOpen = true;
  const toggleDoc = () => {};
  const canAct = !locked && !isDraftPreview && ["sent", "changes_requested", "accepted", "declined"].includes(p.status);
  // ---- Signature-request attention (customer only) ------------------------------------------------
  // A new, actionable, unsigned version → the customer is guided to it instead of hunting. Version-aware:
  // keyed to the proposal id + version so a refresh never re-nags and a NEW version re-arms. The signed
  // state (server truth) switches it off; this is attention only — it never signs/approves anything.
  // The real customer surface = NOT a staff "preview as customer" (custView). `embedded` is only the deck
  // layout context (the customer's proposal renders inside the deck), so it must NOT suppress the attention.
  const isCustomerView = !preview;
  const needsSig = isCustomerView && canAct && !locked && p?.status !== "declined";
  const verKey = p ? `docrev:${accessId}:prop:v${p.version || 1}:${p.id}` : null;
  // Big banner on first sight of THIS version; collapses to a compact pill once seen/dismissed/started.
  useEffect(() => {
    if (!needsSig || !verKey) return;
    try { if (localStorage.getItem(verKey) === "seen") setBannerDismissed(true); } catch { /* private mode */ }
  }, [needsSig, verKey]);
  const markSeen = () => { setBannerDismissed(true); try { if (verKey) localStorage.setItem(verKey, "seen"); } catch { /* ignore */ } };
  // Review → straight to the PDF signer (no guided spotlight). The customer opens the actual document and
  // signs; nothing to walk through.
  const startReview = () => { markSeen(); if (opt) choose(opt.id); else showToast("Open a proposal option to review and sign."); };
  // Multi-document action center: when more than one customer action is outstanding on this surface
  // (proposal signature + PCP approval), list them in ONE center instead of competing banners. Each routes
  // to its own action (proposal → the signer, PCP → scroll to the agreement). Change orders resolve on their
  // own surface (the resolver still returns them for the project-level center).
  const pageActions = (reqActions || []).filter((a) => a.documentType === "proposal" || a.documentType === "pcp");
  const showActionCenter = needsSig && !bannerDismissed && pageActions.length > 1;
  const actionLabel = (a) => a.documentType === "pcp" ? "Performance Credit" : "Proposal";
  const actionVerb = (a) => a.action === "approval" ? "Approval required" : "Signature required";
  const runAction = (a) => {
    markSeen();
    if (a.documentType === "pcp") { const el = rootRef.current?.querySelector(".pcv-pcp-box"); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }
    else if (opt) choose(opt.id);   // proposal → straight to the signer (no spotlight)
  };
  // When the customer may file per-line removal/relocation requests: any actionable proposal (direct
  // ✕ on each line), or a signed one they've put into "Request Modification" mode.
  const canReq = canAct || reviseMode;

  // Accept toggles an option; customers may accept more than one (A + C, etc.). Accepting opens
  // the signature pop-up first (acceptance must be signed); removing an already-accepted option
  // just toggles it off, no signature needed.
  function choose(optId) {
    if (busy) return;
    if (acceptedSet.has(optId)) { doAccept(optId, null); }
    else { if (preview) return; setEsignFor(optId); }
  }
  async function doAccept(optId, sign) {
    setBusy(true); setErr(null);
    const r = await callAction(selectOptionAction(accessId, optId, sign));
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setP(r.proposal);
    setConfirmApprove(false);
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
    const r = await callAction(declineOptionAction(accessId, opt.id, reason));
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setP(r.proposal);
    setDeclineOpen(false);
    showToast(`Option ${opt.id} declined`);
  }
  // Diff before re-sign: fetched only when this version is unsigned and a previous one was signed.
  const [diffInfo, setDiffInfo] = useState(null);
  useEffect(() => {
    let live = true;
    if (!p || p.signed_name || (p.version || 1) < 2) { setDiffInfo(null); return; }
    getProposalDiffAction(accessId).then((r) => { if (live) setDiffInfo(r?.ok && r.diff?.any ? r : null); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessId, p?.id, p?.version, p?.signed_name]);

  async function submitRequest() {
    if (preview || busy || !note.trim()) return;
    setBusy(true); setErr(null);
    const r = await callAction(requestChangesAction(accessId, note.trim()));
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setP(r.proposal);
    setReqOpen(false);
    setNote("");
  }

  return (
    <div className="pcv-root" ref={rootRef}>
      <style>{PCV_CSS}</style>

      {/* Multi-document action center — more than one thing needs the customer (proposal + PCP). One
          calm list, each routing to its own action, instead of competing banners. */}
      {showActionCenter && (
        <div className="pcv-actctr" role="region" aria-label="Documents that need your attention">
          <button type="button" className="pcv-sigbanner-x" aria-label="Dismiss" onClick={markSeen}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <div className="pcv-actctr-k">{pageActions.length} documents need your attention</div>
          <div className="pcv-actctr-list">
            {pageActions.map((a, idx) => (
              <div key={a.documentType + idx} className="pcv-actctr-row">
                <span className="pcv-actctr-info">
                  <span className="pcv-actctr-name">{actionLabel(a)}</span>
                  <span className="pcv-actctr-verb">{actionVerb(a)}</span>
                </span>
                <button type="button" className="pcv-actctr-go" onClick={() => runAction(a)}>Review</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Signature-request attention — the customer never has to hunt for a new, actionable document.
          Big card on first sight of this version; collapses to a compact pill once seen/dismissed; gone
          once signed. "Review & sign" opens the actual PDF signer directly. */}
      {needsSig && !bannerDismissed && !showActionCenter && (
        <div className="pcv-sigbanner" role="region" aria-label="Signature requested">
          <button type="button" className="pcv-sigbanner-x" aria-label="Dismiss" onClick={markSeen}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <span className="pcv-sigbanner-ic">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><polyline points="14 3 14 8 19 8" /><path d="M8.5 16.5c1-1.3 2-1.3 3 0s2 1.3 3 0" /></svg>
          </span>
          <div className="pcv-sigbanner-k">Signature requested</div>
          <div className="pcv-sigbanner-ttl">Your proposal is ready to sign</div>
          <div className="pcv-sigbanner-sub">Open the document and sign when you’re ready.</div>
          <button type="button" className="pcv-sigbanner-cta" onClick={startReview}>Review</button>
        </div>
      )}
      {needsSig && bannerDismissed && (
        <button type="button" className="pcv-sigpill" onClick={startReview} aria-label="Signature required — review your proposal">
          <span className="pcv-sigpill-dot" />
          <span className="pcv-sigpill-lbl">Signature required</span>
          <span className="pcv-sigpill-go">Review ›</span>
        </button>
      )}

      {/* Fold header — same tool-card language as the rest of the page (icon + title + status chip
          + chevron). The whole proposal collapses; after accept+sign it auto-folds so "Make Your
          Deposit" is the focus, but the customer can reopen it anytime. */}
      {/* No per-proposal "Review" toolbar / collapse — the customer is already inside the proposal, so it
          flows straight into the content below. Share + Download live on the "Your System" row. */}
      {docOpen && (
      <div className="pcv-foldwrap">
      {/* The PDF masthead (logo/tagline/contact) and the Prepared-For/address/phone/email box are REMOVED
          from the on-screen customer view — the project header above already carries company + customer
          context, so repeating it here was redundant. The downloaded PDF keeps the full formal masthead. */}

      {/* Your System Layout removed from the customer proposal view (per owner) — the walkthrough is still
          reachable via the per-camera "Placement" chips, and the layout lives on the dedicated tool. */}
      {false && hasLayout && (
        <div className="pcv-layout">
          <button type="button" className="pcv-layout-hd" onClick={toggleLayout} aria-expanded={layoutOpen}>
            <span className="pcv-layout-ic">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </span>
            <span className="pcv-layout-title">Your System Layout</span>
            <span className="pcv-layout-sub">
              {layoutLoaded
                ? [layoutFloors.length && `${layoutFloors.length} floor plan${layoutFloors.length !== 1 ? "s" : ""}`,
                   layoutPhotos.length && `${layoutPhotos.length} camera photo${layoutPhotos.length !== 1 ? "s" : ""}`].filter(Boolean).join(" · ")
                : "Floor plan & camera preview"}
            </span>
            <span className="pcv-fold-chev">{layoutOpen ? "▲" : "▼"}</span>
          </button>
          {layoutOpen && (
            <div className="pcv-layout-body">
              {layoutBusy && <div className="pcv-layout-caption" style={{ textAlign: "center", padding: "12px 0" }}>Loading your layout…</div>}
              {!layoutBusy && layoutLoaded && layoutFloors.length === 0 && layoutPhotos.length === 0 && (
                <div className="pcv-layout-caption" style={{ textAlign: "center", padding: "12px 0" }}>Your system layout will appear here.</div>
              )}
              {hasCams ? (
                <SystemWalkthrough floors={layoutFloors} photos={layoutPhotos} focusCid={focusCid} />
              ) : layoutFloors.map((f, i) => (
                <div className="pcv-layout-floor" key={"f" + i}>
                  {layoutFloors.length > 1 && <div className="pcv-layout-floor-nm">{f.name}</div>}
                  <div className="pcv-layout-plan">
                    <img src={f.bg} alt={f.name} loading="lazy" />
                    {f.markers.map((m) => (
                      <span className="pcv-layout-dev" key={m.code} style={{ left: `${m.x}%`, top: `${m.y}%`, background: m.color }} title={m.label} data-kind={m.k}>{m.code}</span>
                    ))}
                  </div>
                  {f.markers.length > 0 && <div className="pcv-layout-devlist">{f.markers.map((m) => <span key={m.code}><b>{m.code}</b> {m.label}</span>)}</div>}
                </div>
              ))}
              {layoutPhotos.length > 0 && (
                <>
                  <div className="pcv-layout-sec">Camera Preview</div>
                  <div className="pcv-layout-mocks">
                    {layoutPhotos.map((m, i) => (
                      <div className="pcv-layout-mock" key={"m" + i}>
                        <img src={m.url} alt={m.name} loading="lazy" />
                        <span className="pcv-layout-mock-nm">{m.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions (Accept / Decline / Request / Download) live at the BOTTOM of the proposal now —
          read first, act at the end. See the acceptance box below the totals. */}

      {optDeclined && !declineOpen && (
        <div className="pcv-note-strip">Declined {optName(opt.id)}{declinedMap[opt.id] ? `: “${declinedMap[opt.id]}”` : ""} — accept below to change.</div>
      )}
      {reviseMode && (
        <div className="pcv-revise-hint">
          <b>Revise mode</b> — tap a line to request a change.
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
            const oc = serviceColor(o.services?.[0]?.key) || OPTION_TABCOLORS[o.id] || "var(--gold)";
            const ot = optionTotals(o, p.tax_rate, p.payload.discount, p.deposit_pct, p.payload.pcp_credit);
            const on = o.id === opt.id;
            const isFirst = o.id === p.payload.options[0].id;   // the first option is always the recommended one
            return (
              <button key={o.id} type="button" className={`pcv-opt-card${on ? " on" : ""}${isFirst ? " rec" : ""}`} style={{ "--oc": oc }} onClick={() => setViewingOpt(o.id)}>
                <span className="pcv-opt-badge2">{o.id}</span>
                <span className="pcv-opt-info">
                  <span className="pcv-opt-optlbl">Option {o.id}{on ? " · Viewing" : ""}{isFirst && <span className="pcv-opt-rec">Recommended</span>}</span>
                  <span className="pcv-opt-nm">{displayOptionName(o.name)}
                    {acceptedSet.has(o.id) && <span className="pcv-opt-chk"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Accepted</span>}
                    {Object.prototype.hasOwnProperty.call(declinedMap, o.id) && <span className="pcv-opt-chk dec"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>Declined</span>}
                  </span>
                  <span className="pcv-opt-tot">{money(ot.grand)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* The service + line items, straight away — the old scope/total summary card and the cost-breakdown
          header above it were removed per owner (signature-required, then the service). Share + Download
          stay as a quiet right-aligned action cluster. */}
      {(() => {
      // Share/Download ride the FIRST service header line (headerRight) — same line as "Security Cameras ·
      // N cameras" — instead of a separate row above the items.
      const firstSvcIdx = (opt.services || []).findIndex((s) => s.items?.length);
      const headerActions = (
        <span className="pcv-sec-acts">
          <button type="button" className="pcv-sec-act" onClick={shareProposal} title="Copy a link that opens straight to this proposal" aria-label={copied ? "Link copied" : "Share"}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></svg>
          </button>
          <button type="button" className="pcv-sec-act" onClick={() => handleDownload("detailed")} disabled={dlBusy} title="Download the full proposal (PDF)" aria-label="Download PDF">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </button>
        </span>
      );
      return (<>
      <div className="pcv-cost-region" ref={costRef}>
      {/* Line items — the SAME renderer staff build with, in read-only customer mode (grouped NVR/Displays,
          A/B/C children, condition badges, alignment). The per-line pen opens a change request; Placement
          jumps to the floor-plan map. Share + Download ride the first service header line (headerRight). */}
      <div className="pcv-items">
        {(opt.services || []).map((s, i) => (
          s.items?.length ? (
            <ProposalItemsEditor
              key={s.key + i}
              svc={s}
              showCost={false}
              readOnly
              customer
              onChange={() => {}}
              cameraNames={camNames}
              payload={p.payload}
              activeOptId={opt.id}
              optionCount={p.payload.options.length}
              hasLayout={hasLayout}
              onViewPlacement={viewPlacement}
              requestFlags={flags}
              onRequestChange={canReq ? openMenu : undefined}
              headerRight={i === firstSvcIdx ? headerActions : undefined}
            />
          ) : null
        ))}
      </div>

      {/* Change-request modal — opened by the per-line pen. Same handlers/flow as before (applyFlag /
          clearFlag); centred instead of an inline popover now that the rows are the shared renderer. */}
      {menuFor && (() => {
        const it = (opt.services || []).flatMap((s) => s.items || []).find((x) => x.id === menuFor);
        if (!it) return null;
        return (
          <div className="pcv-reqov" onMouseDown={(e) => { if (e.target === e.currentTarget) setMenuFor(null); }}>
            <div className="pcv-linemenu pcv-linemenu-modal" onClick={(e) => e.stopPropagation()}>
              <div className="pcv-linemenu-head">
                <span className="pcv-linemenu-title">{titleCase(it.name)}</span>
                <button type="button" className="pcv-linemenu-x" aria-label="Close" title="Close" onClick={() => setMenuFor(null)}>✕</button>
              </div>
              <textarea className="pcv-linemenu-note" rows={2} placeholder="Add a note for our team (optional)…"
                        value={menuNote} onChange={(e) => setMenuNote(e.target.value)} />
              <div className="pcv-linemenu-actions">
                <button type="button" className="pcv-lm-btn remove" onClick={() => applyFlag(it.id, "remove")}>Request Removal</button>
                <button type="button" className="pcv-lm-btn change" onClick={() => applyFlag(it.id, "change")}>Request Relocation</button>
                {flags[it.id] && <button type="button" className="pcv-lm-btn clear" onClick={() => clearFlag(it.id)}>Withdraw</button>}
              </div>
              <div className="pcv-linemenu-foot">Our team reviews each request.</div>
            </div>
          </div>
        );
      })()}

      {/* Financial summary — the SAME read-only renderer the staff workspace uses, so the customer sees
          the identical conditional rows (Subtotal only when a modifier moves the price) + Total. */}
      <div className="pcv-fin"><ProposalFinancialSummary totals={t} taxRate={p.tax_rate} pcpPending={!pcpApproved} /></div>

      {camBlocks.length > 0 && (
        <>
          <div className="pcv-section-hd">Camera Locations</div>
          <div className="pcv-loc-box">
            <div className="pcv-loc-list">
              {camBlocks.map((it) => {
                const conds = lineConditionBadges(it);
                return (
                  <span key={it.id} className="pcv-loc-item">
                    {conds.length
                      ? conds.map((c) => <span key={c.key} className={`pcv-loc-dot ${c.tone}`} title={c.label} />)
                      : <span className="pcv-loc-dot" aria-hidden="true" />}
                    {titleCase(it.name).replace(/\s*—.*$/, "")}
                  </span>
                );
              })}
            </div>
            <div className="pcv-loc-total">Total Camera Locations: {camBlocks.length}</div>
            {(() => {
              const legend = []; const seen = new Set();
              camBlocks.forEach((it) => lineConditionBadges(it).forEach((c) => { if (!seen.has(c.key)) { seen.add(c.key); legend.push(c); } }));
              return legend.length ? (
                <div className="pcv-loc-legend">
                  {legend.map((c) => (
                    <span key={c.key} className="pcv-loc-leg"><span className={`pcv-loc-dot ${c.tone}`} />{c.label}</span>
                  ))}
                </div>
              ) : null;
            })()}
          </div>
        </>
      )}
      </div>{/* /pcv-cost-region */}
      </>); })()}

      <div className="pcv-pay-region" ref={payRef}>
      {/* Payment plan — the SAME compact read-only plan staff see (PAYMENT PLAN · 50 / 50, a column per
          milestone), replacing the old stacked payment cards. Its own label is the section header. */}
      <div className="pcv-fin"><ProposalPaymentPlan sched={paySched} plan={payPlan} grand={t.grand} deposit={t.deposit} fullDate={fullDate} /></div>
      <div className="pcv-fineprint">Price subject to applicable sales tax. Proposal valid 7 days from issue.</div>
      </div>{/* /pcv-pay-region */}

      {/* Primary action lives here, directly under the money — bold gold so it's unmistakable. The label
          is "Review & Sign" (not "Approve & Sign"): tapping it OPENS the signer, it doesn't silently accept. */}
      {canAct && (
        <button ref={signRef} className="pcv-signbar" disabled={busy} onClick={() => choose(opt.id)}>
          {optAccepted ? `Remove Option ${opt.id}` : (
            <>
              <svg className="pcv-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M15.5 4.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>
              Review &amp; Sign
            </>
          )}
        </button>
      )}

      {t.pcpCredit > 0 && (
        <>
          <div className="pcv-section-hd">Performance Credit Program</div>
          <div className="pcv-pcp-box">
            <div className="pcv-pcp-head">
              <div>
                <div className="pcv-pcp-title">Pending Performance Credit{pcpPct ? ` · ${pcpPct}%` : ""} <span className="pcv-pcp-amt">−{money(t.pcpCredit)}</span></div>
                <div className="pcv-pcp-sub">2–10% labor credit for jobs that run efficiently.</div>
              </div>
              <span className={`pcv-pcp-badge ${pcpAgreed ? "ok" : "pending"}`}>{pcpAgreed ? "✓ Agreement approved" : "Pending your approval"}</span>
            </div>
            <ul className="pcv-pcp-terms">
              <li>Shown as a <b>transparent line‑item deduction</b> — never baked into pricing.</li>
              <li>Must be agreed <b>before work begins</b>; it is not applied retroactively.</li>
              <li>The credit is <b>pending and discretionary</b> — confirmed at completion.</li>
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
                <span className="pcv-pcp-agreed-note">{pcpApproved ? "Credit confirmed." : "Pending confirmation at completion."}</span>
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
      {diffInfo && !locked && <ProposalDiff diff={diffInfo.diff} fromVersion={diffInfo.fromVersion} toVersion={diffInfo.toVersion} signedAt={diffInfo.signedAt} />}
      {/* Once signed, the ACCEPTED summary box is gone (per owner) — the Authorized Signature block below
          carries the record, and TAPPING the signature is how the customer requests a modification. While
          unsigned, this is the Request-a-Change/Decline box; it also shows the revise send-bar when active. */}
      {!locked && <div className="pcv-section-hd">Request a Change or Decline</div>}
      {(!locked || reviseMode) && (
      <div className="pcv-accept-box">
        {reviseMode ? (
          <div className="pcv-send-bar">
            <span className="pcv-send-count">{flagCount ? `${flagCount} item${flagCount !== 1 ? "s" : ""} requested` : "Tap ✕ to request a change"}</span>
            <button className="pcv-select" onClick={() => { setReviseMode(false); setMenuFor(null); }}>Done</button>
          </div>
        ) : (
          <>
            {canAct && (
              <>
                <p>{diffInfo ? "Review the changes and use Review & Sign under Payment Terms — or request a change / decline here." : "Use Review & Sign under Payment Terms to accept. You can also request a change or decline here."}</p>
                <div className="pcv-accept-actions secondary">
                  <button className="pcv-btn" onClick={() => { setReviseMode(true); setDeclineOpen(false); setMenuFor(null); }}>
                    <svg className="pcv-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    Request Change
                  </button>
                  <button className="pcv-btn" onClick={() => { setDeclineOpen(true); setReviseMode(false); }}>
                    <svg className="pcv-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    Decline
                  </button>
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
              </>
            )}
            {/* No premature "next step" button here — once accepted, the deposit tool below is the
                next action, and advancement happens after the deposit is recorded (not on accept). */}
            {!canAct && acceptedSet.size === 0 && <p>Not open for action.</p>}
          </>
        )}
      </div>
      )}

      {p.signed_name && (() => {
        // Tapping the signature is how the customer requests a modification now (the old Request-Modification
        // button lived in the removed ACCEPTED box). Staff/preview just see the record, not a click target.
        const canReqMod = locked && isCustomerView;
        const reqMod = () => { setReviseMode(true); setMenuFor(null); setDeclineOpen(false); };
        return (
        <>
          <div className="pcv-section-hd">Authorized Signature</div>
          <div className={`pcv-sign-box${canReqMod ? " pcv-sign-click" : ""}`}
               {...(canReqMod ? { role: "button", tabIndex: 0, title: "Request a modification", "aria-label": "Request a modification",
                 onClick: reqMod, onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reqMod(); } } } : {})}>
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
          {canReqMod && <div className="pcv-sign-hint">Tap the signature to request a change.</div>}
        </>
        );
      })()}

      {/* Unified PAY flow — lives UNDER the signature (per owner). One "Pay Balance · $X" button → a pop-up
          modal (Zelle / Card·Apple·Google Pay / I already paid), amount editable, proof photos. NOT gated by
          signature; shows whenever there's a balance on a live (non-declined) proposal. */}
      {t.grand > 0 && p?.status !== "declined" && (
        <PaymentOptions accessId={accessId} preview={preview} showToast={showToast} balanceDue={t.grand} kind="deposit" />
      )}
      </div>
      )}

      {esignFor && (
        <EsignSigner accessId={accessId} optKey={esignFor} optLabel={optName(esignFor)} reference={propNum} defaultName={customerName || ""}
          prepareAppendix={buildAppendix}
          onClose={() => setEsignFor(null)}
          onDone={(r) => {
            setEsignFor(null); setP(r.proposal); setConfirmApprove(false);
            showToast("Signed & accepted");
            accCtx?.open?.("deposit");   // stay on the page and pop the deposit panel open, as the old flow did
            if (r.stage && r.stage !== "proposal") onStageSync?.(r.stage);
          }} />
      )}

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
/* Signature-request attention banner + compact pill (customer only) */
.pcv-sigbanner{position:relative;margin:4px 0 18px;background:#fffdf8;border:1px solid #ece4d2;border-radius:16px;padding:20px 20px 18px;box-shadow:0 10px 34px -16px rgba(16,17,18,.3);text-align:left}
.pcv-sigbanner-x{position:absolute;top:10px;right:10px;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:#a79a80;border-radius:8px;cursor:pointer}
.pcv-sigbanner-x:hover{background:#f0ead9;color:#161821}
.pcv-sigbanner-ic{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:11px;background:#fbf3df;color:#8A6512;margin-bottom:12px}
.pcv-sigbanner-k{font:700 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.15em;text-transform:uppercase;color:#B4945C}
.pcv-sigbanner-ttl{font:650 19px/1.25 system-ui,-apple-system,"Segoe UI",sans-serif;color:#141821;letter-spacing:-.01em;margin-top:6px}
.pcv-sigbanner-sub{font:400 14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#6b6555;margin-top:5px;max-width:46ch}
.pcv-sigbanner-cta{display:inline-flex;align-items:center;gap:8px;margin-top:15px;background:#161821;color:#F0E7D4;border:0;border-radius:11px;padding:12px 22px;font:650 14.5px system-ui,sans-serif;cursor:pointer}
.pcv-sigbanner-cta:hover{background:#000}
.pcv-sigpill{position:sticky;top:8px;z-index:30;display:flex;align-items:center;gap:9px;margin:0 0 14px;width:100%;background:#fffdf8;border:1px solid #e7dfcd;border-radius:12px;padding:10px 14px;box-shadow:0 6px 20px -10px rgba(16,17,18,.28);cursor:pointer;font:inherit;text-align:left}
.pcv-sigpill-dot{width:9px;height:9px;border-radius:50%;background:#C9A14A;box-shadow:0 0 0 4px rgba(201,161,74,.18);flex:none;animation:pcvpulse 1.8s ease-in-out infinite}
@keyframes pcvpulse{0%,100%{opacity:1}50%{opacity:.45}}
.pcv-sigpill-lbl{font:650 13.5px system-ui,sans-serif;color:#141821}
.pcv-sigpill-go{margin-left:auto;font:700 13px system-ui,sans-serif;color:#8A6512}
@media (prefers-reduced-motion: reduce){ .pcv-sigpill-dot{animation:none} }
.pcv-actctr{position:relative;margin:4px 0 18px;background:#fffdf8;border:1px solid #ece4d2;border-radius:16px;padding:18px 18px 10px;box-shadow:0 10px 34px -16px rgba(16,17,18,.3)}
.pcv-actctr-k{font:700 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#B4945C;margin-bottom:10px}
.pcv-actctr-list{display:flex;flex-direction:column}
.pcv-actctr-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid #f0ead9}
.pcv-actctr-info{display:flex;flex-direction:column;gap:2px;min-width:0}
.pcv-actctr-name{font:650 15px system-ui,sans-serif;color:#141821}
.pcv-actctr-verb{font:600 12px system-ui,sans-serif;color:#B4945C}
.pcv-actctr-go{margin-left:auto;flex:none;background:#161821;color:#F0E7D4;border:0;border-radius:10px;padding:9px 18px;font:650 13.5px system-ui,sans-serif;cursor:pointer}
.pcv-actctr-go:hover{background:#000}
/* Diff before re-sign */
.pcv-doclinks{display:inline-flex;gap:8px;flex-wrap:wrap}
.pcv-doclinks a{text-decoration:none}
.pcv-diff{margin:0 0 4px}
.pcv-diff-v{font-weight:500;color:var(--dv-meta,#787D84);margin-left:6px}
.pcv-diff-opt{padding:8px 22px 0}
.pcv-diff-opt-h{font-size:.82rem;font-weight:700;margin:6px 0 2px}
.pcv-diff-list{list-style:none;margin:6px 0;padding:0;display:flex;flex-direction:column;gap:3px}
.pcv-diff-k{font-size:.66rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-top:4px}
.pcv-diff-li{display:flex;justify-content:space-between;gap:12px;font-size:.86rem;padding:5px 10px;border-radius:8px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF)}
.pcv-diff-li.add{border-left:3px solid var(--dv-green,#2E7D5B)}
.pcv-diff-li.rm{border-left:3px solid var(--dv-red,#C4553D);text-decoration:line-through;color:var(--dv-meta,#787D84)}
.pcv-diff-li.chg{border-left:3px solid var(--dv-gold,#C9A96E)}
.pcv-diff-total{display:flex;justify-content:space-between;font-size:.95rem;font-weight:700;padding:8px 10px 2px}
.pcv-diff-total s{color:var(--dv-meta,#787D84);font-weight:500;margin-right:6px}
.pcv-diff-note{font-size:.76rem;color:var(--dv-meta,#787D84);padding:6px 22px 0}
/* One continuous document rail — no giant outer card. Sections flow through it, sharing the same 22px
   gutters and separated by thin hairlines, so the proposal reads as one page, not a stack of cards. */
/* Fill the deck pane the SAME way the staff proposal does (no narrow centered "PDF sheet"). As a flex
   item in .prop-wrap, auto side margins with no width shrank this to its content (~650px) and left big
   empty side bands; width:100% makes it stretch to the pane, capped + centred only on ultra-wide. */
.pcv-root{background:transparent;border:0;border-radius:0;overflow:visible;width:100%;max-width:1500px;margin:0 auto;
  font-family:var(--font-sans,inherit)}
.pcv-header{background:transparent;padding:4px 22px 16px;display:flex;justify-content:space-between;
  align-items:flex-start;flex-wrap:wrap;gap:14px;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.pcv-hd-left{display:flex;flex-direction:column;gap:3px}
.pcv-brand{font-size:.9rem;font-weight:600;color:var(--dv-ink,#101418);letter-spacing:.02em}
.pcv-pill{margin:2px 0}
.pcv-contact{font-size:.7rem;color:var(--dv-meta,#787D84)}
.pcv-hd-right{display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.pcv-hd-actions{display:flex;gap:8px;margin-bottom:4px}
.pcv-hd-ic{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 11px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.pcv-hd-ic:hover{background:var(--dv-paper,#F4F4F2);border-color:var(--dv-faint,#A1A6AC)}
.pcv-hd-ic:disabled{opacity:.5;cursor:default}
.pcv-doctag{font-size:.72rem;font-weight:500;letter-spacing:.05em;text-transform:uppercase;
  color:var(--dv-meta,#787D84);border-bottom:1px solid var(--dv-line,#E4E4DF);padding-bottom:2px}
.pcv-pill{background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);border:1px solid var(--dv-line,#E4E4DF);font-size:.66rem;font-weight:500;letter-spacing:.03em;
  text-transform:uppercase;padding:4px 12px;border-radius:100px}
.pcv-hd-meta{font-size:.7rem;color:var(--dv-faint,#A1A6AC)}
.pcv-empty{color:var(--dv-meta,#787D84);font-size:.86rem;padding:30px 22px;text-align:center}

.pcv-info-box{margin:18px 22px 4px;border:0;border-radius:0;background:transparent;border-bottom:1px solid var(--dv-line-soft,#EDEDE9);padding-bottom:16px}
.pcv-info-row{display:grid;grid-template-columns:1fr 1fr;gap:12px 32px;padding:8px 0}
.pcv-info-row+.pcv-info-row{border-top:0}
.pcv-info-row div{display:flex;flex-direction:column;gap:2px;min-width:0}
.pcv-info-row b{font-size:.82rem;color:var(--dv-ink,#101418);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pcv-info-lbl{font-size:.62rem;font-weight:500;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.pcv-info-link{font-size:.82rem;font-weight:600;color:var(--dv-blue,#3E6C9E);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.pcv-info-link:hover{text-decoration:underline}
/* Your System Layout — floor plan(s) with cameras + mockup photos */
.pcv-layout{margin:16px 22px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;overflow:hidden;background:#fff}
.pcv-layout-hd{width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--dv-raise,#FBFBFA);border:none;cursor:pointer;font-family:inherit;text-align:left}
.pcv-layout-hd:hover{background:var(--dv-paper,#F4F4F2)}
.pcv-layout-ic{width:28px;height:28px;flex-shrink:0;border-radius:7px;display:flex;align-items:center;justify-content:center;color:var(--gold,#b08f4f);background:#f6efdf;border:1px solid #e7d6ad}
.pcv-layout-title{font-weight:700;font-size:.9rem;color:var(--dv-ink,#101418)}
.pcv-layout-sub{font-size:.72rem;color:var(--dv-meta,#787D84);margin-left:auto;text-align:right}
.pcv-layout-body{padding:14px 16px;display:flex;flex-direction:column;gap:16px}
.pcv-layout-floor-nm{font-size:.78rem;font-weight:700;color:var(--dv-ink,#101418);margin-bottom:6px}
.pcv-layout-plan{position:relative;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;overflow:hidden;line-height:0;background:#f4f4f2}
.pcv-layout-plan img{width:100%;display:block}
/* "Placement" chip on a camera line item — opens the walkthrough at that camera (View Placement). */
.pcv-place{display:inline-flex;align-items:center;gap:4px;margin-left:8px;height:22px;padding:0 9px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-blue,#3E6C9E);font-size:.68rem;font-weight:600;cursor:pointer;font-family:inherit;vertical-align:middle}
.pcv-place:hover{border-color:var(--dv-blue,#3E6C9E);background:rgba(62,108,158,.06)}
.pcv-place svg{flex:0 0 auto}
.pcv-layout-caption{font-size:.72rem;color:var(--dv-meta,#787D84);margin-top:6px}
.pcv-layout-sec{font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.pcv-layout-mocks{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.pcv-layout-mock{border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;overflow:hidden;background:#0B0F1A}
.pcv-layout-mock img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}
.pcv-layout-mock-nm{display:block;padding:5px 8px;font-size:.72rem;font-weight:600;color:#fff;background:rgba(11,15,26,.9)}

.pcv-toolbar{margin:0 22px 6px;display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}
.pcv-dl{height:30px;padding:0 14px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:transparent;
  color:var(--dv-meta,#787D84);font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.pcv-dl:hover{background:var(--dv-paper,#F4F4F2);color:var(--dv-ink,#101418)}
.pcv-note-strip{margin:0 22px 6px;background:rgba(201,169,110,.08);border:1px solid var(--dv-line,#E4E4DF);color:var(--dv-ink-soft,#3A4048);
  font-size:.78rem;font-weight:500;padding:9px 12px;border-radius:8px}
.pcv-note-strip.err{background:rgba(196,85,61,.08);border-color:rgba(196,85,61,.28);color:var(--dv-red,#C4553D)}

/* Color-coded option cards (A/B/C) — the active one pops with its accent */
.pcv-opt-cards{margin:0 22px 8px;display:flex;gap:10px;flex-wrap:wrap}
.pcv-opt-card{flex:1;min-width:150px;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;
  border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);cursor:pointer;font-family:inherit;transition:transform .12s,box-shadow .12s,border-color .12s}
.pcv-opt-card:hover{border-color:var(--oc);transform:translateY(-1px)}
.pcv-opt-card.on{border-color:var(--oc);box-shadow:inset 0 0 0 1px var(--oc);transform:translateY(-1px)}
.pcv-opt-badge2{width:30px;height:30px;flex-shrink:0;border-radius:8px;background:var(--oc);color:#fff;
  display:flex;align-items:center;justify-content:center;font-size:.92rem;font-weight:600}
.pcv-opt-info{display:flex;flex-direction:column;gap:1px;min-width:0;text-align:left}
.pcv-opt-optlbl{font-size:.56rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--oc)}
.pcv-opt-rec{margin-left:6px;font-size:.54rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-green,#2E7D5B);background:rgba(46,125,91,.12);border-radius:100px;padding:1px 6px}
.pcv-opt-card.rec{box-shadow:inset 0 0 0 1px rgba(46,125,91,.35)}
.pcv-opt-card.rec.on{box-shadow:inset 0 0 0 2px var(--oc)}
.pcv-opt-nm{font-size:.8rem;font-weight:600;color:var(--dv-ink,#101418);display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pcv-opt-chk{display:inline-flex;align-items:center;gap:3px;font-size:.6rem;font-weight:500;color:var(--dv-green,#2E7D5B);background:rgba(46,125,91,.08);border-radius:100px;padding:1px 6px}
.pcv-opt-tot{font-size:.86rem;font-weight:600;color:var(--oc)}

/* Quiet Share/Download cluster that rides the first service header line (passed to ProposalItemsEditor
   as headerRight; the old scope/total summary card was removed). */
.pcv-sec-acts{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto}
.pcv-sec-act{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);cursor:pointer;font-family:inherit;flex:0 0 auto}
.pcv-sec-act:hover{background:var(--dv-paper,#F4F4F2);border-color:var(--dv-faint,#A1A6AC)}
.pcv-sec-act:disabled{opacity:.5;cursor:default}

.pcv-section-hd{margin:30px 22px 8px;background:transparent;color:var(--dv-ink,#101418);font-size:.72rem;font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;padding:0 0 7px;border-left:0;border-bottom:1px solid var(--dv-line,#E4E4DF)}
/* Fold header — collapses the whole proposal; matches the page's FlowStep tool-cards (raised row,
   1px border with a status-colored left rule, soft-tint icon, status chip, chevron). Gold while in
   progress, green once accepted+signed — same "complete = green" convention as the other cards. */
.pcv-fold-row{display:flex;align-items:center;gap:8px}
.pcv-fold-chev-btn{flex:0 0 auto;border:none;background:none;color:var(--dv-faint,#A1A6AC);cursor:pointer;font-size:.72rem;padding:6px 4px;font-family:inherit}
.pcv-fold-hd{display:flex;align-items:center;gap:10px;flex:1;min-width:0;margin:0;background:var(--dv-raise,#FBFBFA);
  border:1px solid var(--dv-line,#E4E4DF);border-left:3px solid var(--dv-gold,#C9A96E);border-radius:12px;padding:11px 16px;
  cursor:pointer;text-align:left;font-family:inherit;transition:background .12s}
.pcv-fold-hd:hover{background:var(--dv-paper,#F4F4F2)}
.pcv-fold-hd.done{border-left-color:var(--dv-green,#2E7D5B)}
.pcv-fold-ic{flex-shrink:0;width:30px;height:30px;border-radius:8px;background:rgba(201,169,110,.12);color:var(--dv-gold-text,#8A6A1F);display:grid;place-items:center}
.pcv-fold-hd.done .pcv-fold-ic{background:rgba(46,125,91,.08);color:var(--dv-green,#2E7D5B)}
.pcv-fold-title{font-size:.9rem;font-weight:600;color:var(--dv-ink,#101418);letter-spacing:-.01em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pcv-fold-chip{flex-shrink:0;white-space:nowrap;font-size:.68rem;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-meta,#787D84);
  background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:999px;padding:3px 9px}
.pcv-fold-chip.ok{color:var(--dv-gold-text,#8A6A1F);background:rgba(201,169,110,.10);border-color:rgba(201,169,110,.30)}
.pcv-fold-chip.done{color:var(--dv-green,#2E7D5B);background:rgba(46,125,91,.08);border-color:rgba(46,125,91,.28)}
.pcv-fold-chev{margin-left:auto;flex-shrink:0;font-size:.72rem;color:var(--dv-faint,#A1A6AC)}
.pcv-hd-lbl{display:inline}
/* Narrow screens: the title + status chip + Share/PDF collided. Drop the button text (icon-only,
   still labelled for screen readers) and let the icons hold their own so nothing overlaps. */
@media (max-width:560px){
  /* One compact toolset (like the admin deck toolbar): status pill · share · download · collapse,
     centered. Drop the raised tool-card bar + file-icon badge here — they stay on desktop. */
  .pcv-fold-row{gap:7px;justify-content:center;flex-wrap:wrap;margin:0 16px}
  .pcv-hd-lbl{display:none}
  .pcv-hd-ic{padding:0 9px;gap:0;height:30px}
  .pcv-fold-hd{flex:0 0 auto;padding:0;height:30px;border:none;background:none;gap:0}
  .pcv-fold-hd:hover{background:none}
  .pcv-fold-ic{display:none}
  .pcv-fold-chip{height:30px;display:inline-flex;align-items:center;font-size:.7rem;padding:0 12px}
  .pcv-fold-chev-btn{padding:6px 6px}
  /* 16px mobile gutter across the one rail; metadata stacks; the total shrinks so nothing overflows the page. */
  .pcv-header,.pcv-info-box,.pcv-section-hd,.pcv-table,.pcv-pay-list,.pcv-accept-box,.pcv-subtotal-row,.pcv-grand,.pcv-pay-terms,.pcv-fineprint,.pcv-note-strip,.pcv-opt-cards,.pcv-layout,.pcv-loc-box,.pcv-pcp-box,.pcv-actions{margin-left:16px;margin-right:16px}
  button.pcv-signbar{width:auto;margin-left:16px;margin-right:16px}
  /* Cost breakdown reads as a clean 3-column list on a phone: drop the # and Unit columns, give the
     description the room, keep the amount right-aligned. (The detailed breakdown is opt-in anyway.) */
  .pcv-table-head,.pcv-row{grid-template-columns:1fr 84px !important}
  .pcv-table-head > :first-child,.pcv-row > :first-child{display:none}
  .pcv-info-row{grid-template-columns:1fr;gap:10px}
  .pcv-info-link,.pcv-contact{word-break:break-word;overflow-wrap:anywhere}
  /* ----- compact customer proposal on mobile: less repeated branding, tighter rhythm, price is the moment ----- */
  /* The portal already shows company + project context above, so drop the PDF masthead's repeated tagline/contact. */
  .pcv-header{padding:2px 16px 12px;gap:6px}
  .pcv-tagline,.pcv-contact{display:none}
  .pcv-brand svg{height:17px}
  .pcv-hd-right{flex-direction:row;flex-wrap:wrap;align-items:center;gap:4px 10px}
  .pcv-pill{padding:3px 9px;font-size:.58rem}
  .pcv-hd-meta{font-size:.66rem}
  .pcv-info-box{margin-top:12px;padding-bottom:12px}
  .pcv-info-lbl{font-size:.58rem}
  /* price becomes a clear, prominent moment */
  .pcv-grand{margin-top:12px;padding:14px 16px;font-size:.9rem;border-radius:12px;align-items:baseline}
  .pcv-grand span:last-child{font-size:1.5rem;font-weight:800}
  /* quieter section rhythm + lighter cards so it reads as a document, not stacked tiles */
  .pcv-layout{border-radius:10px}
  .pcv-pcp-box{padding:14px}
  /* keep the proposal inside the mobile column: let dense tables scroll internally instead of forcing
     the whole document wider than the viewport (which was clipping the price + right-edge content). */
  .pcv-root{min-width:0;max-width:100%}
  .pcv-table,.pcv-loc-box{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .pcv-fold-row{min-width:0}
  .pcv-fold-title,.pcv-info-row b,.pcv-info-link{min-width:0}
}
.pcv-table{margin:0 22px}
.pcv-table-head{display:grid;grid-template-columns:26px 1fr 96px;gap:6px;background:var(--dv-paper,#F4F4F2);
  color:var(--dv-meta,#787D84);font-size:.72rem;font-weight:600;padding:8px 10px;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.pcv-table-head .r{text-align:right}
.pcv-svc-head{font-size:.7rem;font-weight:600;letter-spacing:.04em;padding:6px 10px;background:var(--dv-line-soft,#EDEDE9);color:var(--dv-ink,#101418);border-radius:0 6px 6px 0}
/* Compact customer breakdown: Description → Total. No Qty/Unit columns; a qty>1 reads as secondary math. */
.pcv-row{display:grid;grid-template-columns:26px 1fr 96px;gap:6px;padding:7px 10px;
  font-size:.8rem;color:var(--dv-ink,#101418);border-bottom:1px solid var(--dv-line-soft,#EDEDE9);align-items:center}
.pcv-row.alt{background:var(--dv-line-soft,#EDEDE9)}
.pcv-row.sub{background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font-size:.76rem;opacity:.85}
.pcv-row.expandable{cursor:pointer}
.pcv-row.expandable:hover{background:rgba(201,169,110,.08)}
.pcv-rownum{text-align:center;color:var(--dv-meta,#787D84);font-size:.74rem}
.pcv-rowdesc{display:flex;align-items:center;gap:5px;min-width:0;flex-wrap:wrap}
.pcv-rowblurb{flex-basis:100%;font-size:12px;font-style:italic;line-height:1.35;color:var(--dv-muted,#6a7085);margin-top:1px}
.pcv-rowmath{flex-basis:100%;font-size:11.5px;line-height:1.3;color:var(--dv-muted,#6a7085);margin-top:1px}
.pcv-chev{font-size:.68rem;color:var(--dv-gold-text,#8A6A1F);flex-shrink:0}
.r{text-align:right}
.b{font-weight:600}
.pcv-svc-note{padding:4px 10px;font-size:.72rem;color:var(--dv-meta,#787D84);white-space:pre-wrap}
.pcv-subtotal-row{margin:0 22px;display:flex;justify-content:space-between;background:var(--dv-paper,#F4F4F2);
  border-top:1px solid var(--dv-line,#E4E4DF);padding:8px 10px;font-size:.8rem;font-weight:600;color:var(--dv-ink-soft,#3A4048)}
.pcv-subtotal-row.main{margin-top:4px}
.pcv-grand{margin:6px 22px 0;background:var(--dv-ink,#101418);display:flex;justify-content:space-between;
  padding:12px 14px;font-size:.92rem;font-weight:600;color:#fff}
.pcv-grand span:last-child{color:var(--dv-gold-text,#8A6A1F);font-size:1.05rem}

.pcv-loc-box{margin:0 22px}
.pcv-loc-list{display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;font-size:.8rem;color:var(--dv-ink,#101418);padding:10px 4px 0}
.pcv-loc-item{display:flex;align-items:center}
/* Location dot: neutral bullet by default; gold = customer-provided, orange = existing cable (one per condition) */
.pcv-loc-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:7px;flex:0 0 auto;background:var(--dv-muted,#9aa0ab)}
.pcv-loc-dot+.pcv-loc-dot{margin-left:-3px}
.pcv-loc-dot.gold{background:#C79A1E}
.pcv-loc-dot.orange{background:#C56B2C}
.pcv-loc-legend{display:flex;flex-wrap:wrap;gap:4px 16px;padding:6px 4px 2px}
.pcv-loc-leg{display:flex;align-items:center;font-size:.68rem;color:var(--dv-muted,#6a7085)}
.pcv-loc-total{font-weight:600;color:var(--dv-ink-soft,#3A4048);font-size:.8rem;padding:8px 4px 4px}

/* Payment Terms — stacked milestones, no table. Each milestone is a row: phase + % on the left,
   the due date beneath it, and the amount right-aligned. First (deposit) gets the gold accent. */
.pcv-pay-list{margin:0 22px;display:flex;flex-direction:column;gap:8px}
.pcv-pay-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;
  background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:10px}
.pcv-pay-item.first{background:rgba(201,169,110,.08);border-color:rgba(201,169,110,.30);border-left:3px solid var(--dv-gold,#C9A96E)}
.pcv-pay-left{display:flex;flex-direction:column;gap:2px;min-width:0}
.pcv-pay-phase{font-size:.88rem;font-weight:700;color:var(--dv-ink,#101418)}
.pcv-pay-phase em{font-style:normal;font-weight:600;color:var(--dv-meta,#787D84)}
.pcv-pay-item.first .pcv-pay-phase{color:var(--dv-gold-text,#8A6A1F)}
.pcv-pay-due{font-size:.76rem;font-weight:500;color:var(--dv-meta,#787D84)}
.pcv-pay-amt{flex-shrink:0;font-size:1rem;font-weight:800;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums}
/* Primary accept action — bold gold, high-specificity + !important so no deck/button reset flattens it. */
button.pcv-signbar{display:flex;align-items:center;justify-content:center;gap:10px;width:calc(100% - 44px);margin:14px 22px 0;
  min-height:52px;padding:0 20px;border-radius:12px;cursor:pointer;font-family:inherit;font-size:1.02rem;letter-spacing:.01em;
  background:#F7DC6F !important;color:#1f1a05 !important;border:2px solid #C9A96E !important;font-weight:800 !important;
  box-shadow:0 2px 10px rgba(201,169,110,.35)}
button.pcv-signbar:hover:not(:disabled){background:#F2D45A !important}
button.pcv-signbar:disabled{opacity:.5;cursor:default}
button.pcv-signbar .pcv-ico{color:#1f1a05 !important}
.pcv-waived-chip{display:inline-block;margin-left:8px;font-size:.6rem;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-green,#2E7D5B);background:rgba(46,125,91,.08);border-radius:100px;padding:2px 8px;vertical-align:middle}
/* Line-item condition chips (customer-facing): spelled-out label + semantic tone, subtle under the name */
.pcv-cond{display:inline-block;margin-left:8px;font-size:.6rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;border-radius:100px;padding:2px 8px;vertical-align:middle;white-space:nowrap}
.pcv-cond.gold{color:#8A6A1F;background:rgba(199,154,30,.12)}
.pcv-cond.orange{color:#B45B22;background:rgba(197,107,44,.12)}
.pcv-waived-strike{color:var(--dv-red,#C4553D);text-decoration:line-through;text-decoration-color:var(--dv-red,#C4553D)}
.pcv-pay-terms{margin:10px 22px 0;font-size:.78rem;color:var(--dv-ink-soft,#3A4048);font-weight:500;line-height:1.45;border-left:3px solid var(--dv-gold,#C9A96E);padding-left:12px}
.pcv-pcp-box{margin:0 22px;border:1px solid var(--dv-line,#E4E4DF);background:rgba(46,125,91,.05);border-radius:14px;padding:16px 18px}
.pcv-pcp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
.pcv-pcp-title{font-size:.98rem;font-weight:600;color:var(--dv-ink,#101418)}
.pcv-pcp-amt{color:var(--dv-green,#2E7D5B);font-weight:600}
.pcv-pcp-sub{font-size:.8rem;color:var(--dv-meta,#787D84);margin-top:3px;line-height:1.45;max-width:460px}
.pcv-pcp-badge{flex-shrink:0;font-size:.68rem;font-weight:500;letter-spacing:.03em;text-transform:uppercase;padding:4px 11px;border-radius:100px;white-space:nowrap}
.pcv-pcp-badge.pending{color:var(--dv-gold-text,#8A6A1F);background:rgba(201,169,110,.10);border:1px solid rgba(201,169,110,.30)}
.pcv-pcp-badge.ok{color:var(--dv-green,#2E7D5B);background:rgba(46,125,91,.08);border:1px solid rgba(46,125,91,.28)}
.pcv-pcp-terms{margin:12px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:5px}
.pcv-pcp-terms li{font-size:.79rem;color:var(--dv-ink-soft,#3A4048);line-height:1.4}
.pcv-pcp-approve{margin-top:14px;padding:0 22px;background:linear-gradient(180deg,#E8CB94,#C9A96E)!important;border:none!important;color:#0B0F1A!important;font-weight:800!important}
.pcv-pcp-approve:hover:not(:disabled){filter:brightness(1.04)}
.pcv-pcp-agreed{margin-top:12px;font-size:.82rem;font-weight:600;color:var(--dv-ink,#101418);display:flex;flex-direction:column;gap:2px}
.pcv-pcp-agreed-note{font-size:.76rem;font-weight:500;color:var(--dv-meta,#787D84)}
.pcv-pcp-void-target{align-self:flex-start;background:none;border:1px dashed transparent;border-radius:8px;padding:3px 7px;margin:-3px -7px;cursor:pointer;font-family:inherit;font-size:.82rem;font-weight:600;color:var(--dv-ink,#101418);transition:background .12s,border-color .12s}
.pcv-pcp-void-target:hover{background:rgba(196,85,61,.08);border-color:rgba(196,85,61,.28)}
.pcv-void-confirm{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px;font-size:.72rem;color:var(--dv-meta,#787D84)}
.pcv-void-yes{height:24px;padding:0 10px;border-radius:100px;border:none;background:var(--dv-red,#C4553D);color:#fff;font-size:.68rem;font-weight:500;cursor:pointer;font-family:inherit}
.pcv-void-no{height:24px;padding:0 10px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:transparent;color:var(--dv-meta,#787D84);font-size:.68rem;font-weight:500;cursor:pointer;font-family:inherit}
.pcv-fineprint{margin:6px 22px 0;font-size:.7rem;color:var(--dv-faint,#A1A6AC);font-style:italic}

.pcv-accept-box{margin:0 22px;background:transparent;border:0;
  padding:12px 0 0;display:flex;flex-direction:column;gap:10px}
.pcv-accept-box p{margin:0;font-size:.8rem;color:var(--dv-meta,#787D84)}
.pcv-accept-selected{font-size:.86rem;font-weight:600;color:var(--dv-green,#2E7D5B)}
.pcv-select{height:44px;border:none;border-radius:9px;background:var(--dv-ink,#101418);
  color:#fff;font-size:.86rem;font-weight:600;cursor:pointer;font-family:inherit;
  display:inline-flex;align-items:center;justify-content:center;gap:9px}
.pcv-select:hover{filter:brightness(1.03)}
.pcv-select:disabled{opacity:.5;cursor:default}
.pcv-select.outline{background:transparent;border:1px solid var(--dv-green,#2E7D5B);color:var(--dv-green,#2E7D5B)}
/* The "Approve & Sign" CTA — DocuSign signing-field style: soft yellow fill, blue field border. */
.pcv-accept-actions .pcv-select:not(.outline){background:#F7DC6F;color:#1f1a05;padding:0 22px;font-weight:600;border:2px solid #3E6FB0;box-shadow:none}
.pcv-accept-actions .pcv-select:not(.outline):hover:not(:disabled){background:#F2D45A;filter:none}
.pcv-ico{flex:0 0 auto;display:inline-block;vertical-align:-2px}
.pcv-btn,.pcv-dl{display:inline-flex;align-items:center;gap:6px}

.pcv-actions{margin:16px 22px 0;display:flex;gap:10px}
.pcv-actions-col{flex-direction:column;align-items:stretch}
.pcv-actions-row{display:flex;gap:10px}
.pcv-btn{height:38px;padding:0 16px;border-radius:9px;border:1px solid var(--dv-line,#E4E4DF);background:transparent;
  color:var(--dv-meta,#787D84);font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit}
.pcv-btn:hover{border-color:var(--dv-ink,#101418);color:var(--dv-ink,#101418)}
.pcv-btn.gold{background:var(--dv-ink,#101418);color:#fff;border:none}
.pcv-btn:disabled{opacity:.5;cursor:default}
.pcv-textarea{border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);padding:10px 12px;
  font-size:.82rem;font-family:inherit;outline:none;resize:vertical}
.pcv-textarea:focus{border-color:var(--dv-gold-text,#8A6A1F)}

.pcv-footer{margin-top:20px;background:var(--dv-paper,#F4F4F2);border-top:1px solid var(--dv-line,#E4E4DF);color:var(--dv-faint,#A1A6AC);
  font-size:.7rem;text-align:center;padding:12px 22px}

/* ---- Approve / Revise ---- */
.pcv-tb-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pcv-tb-btn{height:30px;padding:0 14px;border-radius:100px;font-size:.74rem;font-weight:500;cursor:pointer;font-family:inherit;border:1px solid var(--dv-line,#E4E4DF);background:transparent;color:var(--dv-meta,#787D84)}
.pcv-tb-btn.revise:hover{border-color:var(--dv-ink,#101418);color:var(--dv-ink,#101418)}
.pcv-tb-btn.revise.on{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.pcv-tb-btn.accept{background:var(--dv-green,#2E7D5B);border-color:var(--dv-green,#2E7D5B);color:#fff}
.pcv-tb-btn.accept:hover{filter:brightness(1.08)}
.pcv-tb-btn.accept.on{background:var(--dv-green,#2E7D5B);border-color:var(--dv-green,#2E7D5B)}
.pcv-tb-btn.decline{background:transparent;border-color:rgba(196,85,61,.30);color:var(--dv-red,#C4553D)}
.pcv-tb-btn.decline:hover{background:rgba(196,85,61,.08);border-color:var(--dv-red,#C4553D)}
.pcv-tb-btn.decline.on{background:var(--dv-red,#C4553D);border-color:var(--dv-red,#C4553D);color:#fff}
.pcv-tb-locked{height:30px;display:inline-flex;align-items:center;padding:0 14px;border-radius:100px;background:rgba(46,125,91,.08);border:1px solid rgba(46,125,91,.28);color:var(--dv-green,#2E7D5B);font-size:.74rem;font-weight:500}
.pcv-locked-note{display:block;margin-top:4px;font-size:.74rem;font-weight:500;color:var(--dv-meta,#787D84)}
.pcv-opt-chk.dec{background:rgba(196,85,61,.08);color:var(--dv-red,#C4553D)}
.pcv-accepted-line{display:block;font-size:.86rem;font-weight:600;color:var(--dv-green,#2E7D5B)}
.pcv-sign-box{margin:0 22px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);
  padding:16px 18px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
.pcv-sign-mark{display:flex;flex-direction:column;gap:2px;min-width:220px;flex:1}
.pcv-sign-img{max-height:42px;max-width:190px;object-fit:contain;align-self:flex-start}
.pcv-sign-typed{font-size:1.2rem;color:var(--dv-ink,#101418);font-family:"Segoe Script","Brush Script MT",cursive;padding-left:4px}
.pcv-sign-click{cursor:pointer;transition:border-color .12s,background .12s}
.pcv-sign-click:hover{border-color:var(--dv-faint,#A1A6AC);background:var(--dv-paper,#F4F4F2)}
.pcv-sign-click:focus-visible{outline:2px solid var(--dv-gold-text,#8A6A1F);outline-offset:2px}
.pcv-sign-hint{margin:6px 22px 0;font-size:.72rem;color:var(--dv-meta,#787D84)}
.pcv-sign-rule{border-bottom:1px solid var(--dv-ink,#101418);height:1px;width:100%;margin-top:4px}
.pcv-sign-cap{font-size:.62rem;font-weight:500;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-top:4px}
.pcv-sign-meta{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.pcv-sign-name{font-size:.9rem;font-weight:600;color:var(--dv-ink,#101418)}
.pcv-sign-date{font-size:.72rem;color:var(--dv-meta,#787D84)}
.pcv-tb-btn:disabled{opacity:.5;cursor:default}
.pcv-confirm-strip{margin:0 22px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:rgba(46,125,91,.06);border:1px solid rgba(46,125,91,.28);border-radius:9px;padding:10px 12px;font-size:.82rem;font-weight:500;color:var(--dv-green,#2E7D5B)}
.pcv-revise-hint{margin:0 22px;background:var(--dv-paper,#F4F4F2);color:var(--dv-ink-soft,#3A4048);border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:9px 13px;font-size:.78rem}
.pcv-revise-hint b{color:var(--dv-ink,#101418)}

.pcv-row-wrap{position:relative}
.pcv-row.revising{cursor:pointer}
.pcv-row.revising:hover{background:rgba(201,169,110,.08)}
.pcv-flagdot{color:var(--dv-gold-text,#8A6A1F);font-size:.8rem;flex-shrink:0}
.pcv-row.flagged.flag-remove .pcv-rowdesc{color:var(--dv-red,#C4553D)}
.pcv-row.flagged.flag-remove{background:rgba(196,85,61,.08)}
.pcv-row.flagged.flag-change{background:rgba(201,169,110,.10)}
.pcv-flag-chip{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:100px;font-size:.64rem;font-weight:500;text-transform:uppercase;letter-spacing:.03em;vertical-align:middle;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pcv-flag-chip.remove{background:var(--dv-red,#C4553D);color:#fff}
.pcv-flag-chip.change{background:rgba(201,169,110,.14);color:var(--dv-gold-text,#8A6A1F)}

.pcv-linemenu{position:absolute;z-index:40;left:34px;top:calc(100% - 2px);width:min(300px,80vw);background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;box-shadow:0 1px 2px rgba(16,20,24,.04);padding:12px;display:flex;flex-direction:column;gap:9px}
/* Centred change-request modal (opened by the per-line pen on the shared renderer). */
.pcv-reqov{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;background:rgba(16,20,24,.42);padding:20px}
.pcv-linemenu-modal{position:static;left:auto;top:auto;width:min(380px,100%);box-shadow:0 18px 48px rgba(16,20,24,.22);padding:16px}
@media(max-width:640px){.pcv-reqov{align-items:flex-end;padding:0}.pcv-linemenu-modal{width:100%;border-radius:14px 14px 0 0}}
.pcv-linemenu-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.pcv-linemenu-title{font-size:.78rem;font-weight:600;color:var(--dv-ink,#101418)}
.pcv-linemenu-x{border:none;background:none;color:var(--dv-meta,#787D84);font-size:.9rem;line-height:1;cursor:pointer;padding:2px 4px;border-radius:6px}
.pcv-linemenu-x:hover{background:var(--dv-paper,#F4F4F2);color:var(--dv-ink,#101418)}
.pcv-linemenu-note{border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-paper,#F4F4F2);color:var(--dv-ink,#101418);padding:8px 10px;font-size:.78rem;font-family:inherit;outline:none;resize:vertical}
.pcv-linemenu-note:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pcv-linemenu-actions{display:flex;gap:7px;flex-wrap:wrap}
.pcv-lm-btn{height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--dv-line,#E4E4DF);background:transparent;font-size:.75rem;font-weight:600;cursor:pointer;font-family:inherit;color:var(--dv-meta,#787D84)}
.pcv-lm-btn.change{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.pcv-lm-btn.remove{background:var(--dv-red,#C4553D);border-color:var(--dv-red,#C4553D);color:#fff}
.pcv-lm-btn.clear{color:var(--dv-meta,#787D84)}
.pcv-lm-btn:hover{filter:brightness(1.05)}
.pcv-linemenu-foot{font-size:.68rem;color:var(--dv-faint,#A1A6AC);line-height:1.4}
/* Per-line request control — a quiet ✕ that files a request (never a real delete); flips to ↩ once set. */
.pcv-x{margin-left:auto;flex-shrink:0;width:22px;height:22px;border-radius:6px;border:1px solid var(--dv-line,#E4E4DF);background:transparent;color:var(--dv-meta,#787D84);line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-family:inherit;transition:background .12s,border-color .12s,color .12s}
.pcv-x:hover{background:rgba(201,169,110,.1);border-color:rgba(201,169,110,.4);color:var(--dv-gold-text,#8A6A1F)}
.pcv-x.on{background:rgba(201,169,110,.14);border-color:rgba(201,169,110,.40);color:var(--dv-gold-text,#8A6A1F)}

.pcv-accept-actions{display:flex;gap:10px;flex-wrap:wrap}
.pcv-accept-actions .pcv-select{flex:1;min-width:200px}
.pcv-locked-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:6px}
.pcv-locked-row .pcv-locked-note{margin-top:0;flex:1;min-width:180px}
.pcv-accept-dl{margin-top:12px;padding-top:12px;border-top:1px solid var(--dv-line,#E4E4DF);display:flex;justify-content:flex-end;gap:8px}
.pcv-send-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.pcv-send-count{font-size:.82rem;font-weight:600;color:var(--dv-ink-soft,#3A4048);flex:1;min-width:150px}
.pcv-send-bar .pcv-select{height:40px;padding:0 18px}

.pcv-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:11000;background:var(--dv-ink,#101418);color:#fff;font-size:.82rem;font-weight:600;padding:11px 20px;border-radius:100px;box-shadow:0 4px 14px rgba(16,20,24,.18);display:flex;align-items:center;gap:8px;animation:pcvToastIn .22s ease}
.pcv-toast svg{color:var(--dv-green,#2E7D5B)}
@keyframes pcvToastIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
`;


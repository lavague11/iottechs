"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { skipOutsideClose } from "../../../lib/outside-click";
import {
  OPTION_LETTERS, PROPOSAL_SERVICES, blankPayload, blankPayloadForService, blankOption,
  optionTotals, itemTotal, surveyToImport, surveyFloorSummary, serviceLabel, savePriceOverrides,
  toastBaselineItems, cameraBaselineItems, loadPriceBook, PAYMENT_PLANS, planScheduleRows, projectFinancials, fmtSignStamp, cameraNameOverrides,
} from "../../../lib/proposal";
import ProposalItemsEditor from "./proposal-items-editor";
import { ProposalConfig } from "./proposal-pricing";
import { getProposalAction, saveProposalDraftAction, sendProposalAction, reviseProposalAction, emailProposalAction, requestSignatureEmailAction, markProposalReviewedAction, getPriceBookAction, resolveFlagAction, getToolDataAction, getProjectAddonsAction, getProposalChangeStateAction } from "./proposal-actions";
import ProposalFooter from "./proposal-footer";
import { saveFillableProposalPdf } from "../../../lib/proposal-acroform";
import { ProposalStart, PricingReview, UseForAnother } from "./proposal-start";
import { applyPrices } from "../../../lib/proposal-reuse";
import { applyBulkSub } from "../../../lib/proposal-bulk";
import { can } from "../../../lib/roles";
import { exportMockupImages } from "../../../lib/mockup-export";
import { exportSurvey2Images } from "../../../lib/survey2-export";
import { compactAppendix } from "../../../lib/image-compact";
import { survey2HasData } from "../../../lib/tool-data";
import { parseSurveyFloors } from "../../../lib/survey2-model";
import { downloadSurveyPdf } from "../../../lib/survey-pdf";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The deck's Site Survey tool saves to `survey2` (floors[].devices[] with {k, name}); the older
// tool used `sitesurvey_v2` (floors[].markers[] with {kind, name, mode}). Read survey2 first and
// adapt it to the marker shape surveyToImport expects — so every camera's NAME (IC1, IC2, …) and
// the full camera COUNT flow into the proposal. Falls back to the legacy store.
function loadSurveyForImport(accessId) {
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
  const s2 = read(`iottechs_survey2_${accessId}`);
  if (s2 && Array.isArray(s2.floors) && s2.floors.some((f) => (f.devices || []).length)) {
    // Name = the on-plan tag the user sees (IC1, IC2…) unless they gave a real custom name.
    // The survey's default name is "<Type> <n>" (e.g. "Camera 1"), so treat that as "no custom".
    const nameFor = (d) => {
      const nm = String(d.name || "").trim();
      const isDefault = /^[A-Za-z].* \d+$/.test(nm);
      return (nm && !isDefault) ? nm : (d.tag || nm);
    };
    return { floors: s2.floors.map((f) => ({ ...f, markers: (f.devices || []).map((d) => ({ kind: d.k, name: nameFor(d), mode: d.mode || d.io || "in", cid: d.cid || null })) })) };
  }
  return read(`iottechs_sitesurvey_v2_${accessId}`);
}

// Stamp a stable id (cid) onto every survey camera that lacks one, and persist it back to the
// survey2 blob (localStorage → autosynced to the server). Done once, at proposal-import time, so a
// proposal camera line item can carry camera_id = that cid and "View Placement" can map it back to
// the exact placed camera — never by name. Idempotent: a camera keeps its cid across re-imports.
// cid is NOT part of the survey fingerprint (lib/tool-data.js), so stamping never voids an approval.
function ensureSurveyCameraIds(accessId) {
  const key = `iottechs_survey2_${accessId}`;
  let d;
  try { d = JSON.parse(localStorage.getItem(key) || "null"); } catch { return; }
  if (!d || !Array.isArray(d.floors)) return;
  const seen = new Set();
  d.floors.forEach((f) => (f.devices || []).forEach((dev) => { if (dev && dev.cid) seen.add(dev.cid); }));
  const mint = () => { let id; do { id = "c" + Math.random().toString(36).slice(2, 9); } while (seen.has(id)); seen.add(id); return id; };
  let changed = false;
  d.floors.forEach((f) => (f.devices || []).forEach((dev) => {
    if (dev && dev.k === "cam" && !dev.cid) { dev.cid = mint(); changed = true; }
  }));
  if (changed) { try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* quota/private mode — link just won't persist this pass */ } }
}

// Staff proposal builder (admin / manager / sales). Sales get no Cost column and no
// margin strip — and the server strips cost from their reads AND writes regardless.
export default function ProposalBuilder({ fileBase = null, accessId, role, initial, onProposalChange, viewCount = 0, onShowViews, customerName, customerAddress, customerPhone, customerEmail, embedded = false, defaultService }) {
  const showCost = false; // cost/margin removed from the builder; pricing lives in the gear (default price book)
  const [dlBusy, setDlBusy] = useState(false);
  const [dlError, setDlError] = useState("");                // building the proposal PDF
  const [copied, setCopied] = useState(false);                // "Copied" flash after Share
  const [meta, setMeta] = useState(initial || null);          // server row (status, version, sent_at…)
  // A brand-new proposal opens scoped to the project's service (Toast job → Toast tab), so it always
  // reflects what the customer inquired about instead of defaulting to an empty/camera proposal.
  const [payload, setPayload] = useState(() => initial?.payload || blankPayloadForService(defaultService));
  const [taxRate, setTaxRate] = useState(initial?.tax_rate ?? 0);
  const [depositPct, setDepositPct] = useState(initial?.deposit_pct ?? 50);
  const [cadOpen, setCadOpen] = useState(false);   // custom-plan cadence gear menu
  const [addons, setAddons] = useState({ total: 0, list: [] });   // approved job-site add-ons (amend the contract)
  const [activeOpt, setActiveOpt] = useState(initial?.payload?.options?.[0]?.id || "A");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [dragSvc, setDragSvc] = useState(null);   // index of the service section being dragged
  const [overSvc, setOverSvc] = useState(null);   // index currently hovered as the drop target
  const [dragItem, setDragItem] = useState(null); // cross-section line-item drag: { svcIdx, id }
  const [confirmSend, setConfirmSend] = useState(false);
  const [changeState, setChangeState] = useState(null);   // proposalChangeState — working draft vs published (drives the footer)
  const changeReq = useRef(0);
  const [importMsg, setImportMsg] = useState(null);
  const [toast, setToast] = useState(null);   // string | { text, onUndo }
  const toastTimer = useRef(null);
  function showToast(msg, onUndo = null) {
    setToast(onUndo ? { text: msg, onUndo } : msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), onUndo ? 6000 : 2800);   // longer when there's an Undo
  }
  const [savedAt, setSavedAt] = useState(null);
  const [authBlocked, setAuthBlocked] = useState(false); // PIN-only session — stop autosave retries
  // null = closed; "__all__" = the header gear (every service); a service key = that
  // service's own gear (opened from ProposalItemsEditor), scoped to just that catalog.
  const [pricingOpen, setPricingOpen] = useState(null);
  const [priceBookVersion, setPriceBookVersion] = useState(0);
  const [surveyFloors, setSurveyFloors] = useState([]); // [{index, name, count}] for the import picker
  const [camRoster, setCamRoster] = useState([]);        // survey camera roster → live location names on camera lines
  const [syncConfirm, setSyncConfirm] = useState(false); // two-tap confirm for the destructive "Sync from survey" rebuild
  const [waiveOpen, setWaiveOpen] = useState(false);     // waiver tool panel
  const [bodyOpenState, setBodyOpen] = useState(true);   // whole-card collapse (matches the other proposal-phase cards)
  // Reuse a previous proposal: the start strip on an empty draft, the post-copy pricing review,
  // and the "use for another project" destination picker (see proposal-start.jsx).
  const [startHidden, setStartHidden] = useState(false);
  const [reviewDiffs, setReviewDiffs] = useState([]);
  const [useForOpen, setUseForOpen] = useState(false);
  // New Project → Import Proposal lands here with ?import=<mediaId>: the file is already uploaded and
  // extracted, so the sheet opens straight on IMPORT REVIEW (candidate stashed in sessionStorage by
  // the modal; if it's gone, the sheet re-runs extraction on the stored file).
  const searchParams = useSearchParams();
  const importId = searchParams?.get("import") || null;
  const initialImport = useMemo(() => {
    if (!importId || typeof window === "undefined") return null;
    let stash = null; try { stash = JSON.parse(sessionStorage.getItem(`iot_import_${importId}`) || "null"); } catch {}
    return { mediaId: importId, candidate: stash?.candidate || null, fileName: stash?.fileName || "" };
  }, [importId]);
  const canReuse = can(role, "proposal.reuse");
  const hasItems = payload.options.some((o) => (o.services || []).some((s) => (s.items || []).length));
  function onReuseCreated(r) {
    if (r?.proposal) adopt(r.proposal);
    setReviewDiffs(Array.isArray(r?.review) ? r.review : []);
    setStartHidden(true);
    showToast(r?.source ? `Copied from ${r.source.accessId}` : "Draft created");
  }
  const bodyOpen = embedded ? true : bodyOpenState;      // in the deck overlay the card is always open (no self-collapse)

  // Refresh with a role-appropriate copy on mount (covers PIN-resolved sessions that got
  // the customer-safe variant from the server render). If the draft is still empty and
  // this device has survey data, auto-import the devices once (idempotent — see importSurvey).
  const autoImportedRef = useRef(false);
  const rosterReloadRef = useRef(null);   // re-fetch the survey camera roster after a rename writes back
  useEffect(() => {
    try { setSurveyFloors(surveyFloorSummary(loadSurveyForImport(accessId))); } catch {}
    let live = true;
    const loadRoster = () => fetch(`/api/project-cameras?accessId=${encodeURIComponent(accessId)}`).then((r) => r.json())
      .then((j) => { if (live && j?.ok) setCamRoster(Array.isArray(j.cameras) ? j.cameras : []); }).catch(() => {});
    loadRoster();
    rosterReloadRef.current = loadRoster;
    // Sync the company-wide price book to the local cache FIRST, so auto-import prices correctly.
    getPriceBookAction()
      .then((pb) => { if (live && pb?.ok && pb.prices) savePriceOverrides(pb.prices); })
      .catch(() => {})
      .finally(() => getProposalAction(accessId).then((r) => {
        if (!live || dirty) return;
        if (r?.proposal) adopt(r.proposal);
        const p = r?.proposal;
        const empty = !p?.payload || !p.payload.options?.some((o) => o.services?.length);
        const isDraft = !p || !p.status || p.status === "draft";
        if (empty && isDraft && !autoImportedRef.current) {
          autoImportedRef.current = true;
          importSurvey(true);
        }
      }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessId]);

  // Approved job-site add-ons — poll so an addendum approved/voided at the Install stage flows into the
  // proposal's current-contract total without a manual reload (same feed the deposit/closeout use).
  useEffect(() => {
    let live = true;
    const load = () => getProjectAddonsAction(accessId).then((a) => { if (live && a) setAddons({ total: +a.total || 0, list: a.list || [] }); }).catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => { live = false; clearInterval(id); };
  }, [accessId]);

  // Auto-save: debounce edits into the DB (like the survey tools' autosave, but server-side).
  useEffect(() => {
    if (!dirty || busy || authBlocked) return;
    const t = setTimeout(() => { save(); }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, taxRate, depositPct, dirty, authBlocked]);

  function adopt(p) {
    setMeta(p);
    if (p?.payload) {
      setPayload(p.payload);
      setTaxRate(p.tax_rate ?? 0);
      setDepositPct(p.deposit_pct ?? 50);
      if (!p.payload.options.some((o) => o.id === activeOpt)) setActiveOpt(p.payload.options[0]?.id || "A");
    }
    setDirty(false);
    // Propagate server truth up so sibling read-surfaces (customer preview, tech work order)
    // reflect a proposal built/sent in this same session instead of the stale page-load copy.
    onProposalChange?.(p);
  }

  // Footer state: refresh the working-vs-published change state on mount and after every adopt() (save, send,
  // revise all return a new meta) — read-only, staff-gated server side; the latest request wins.
  const isStaffDock = ["admin", "manager", "sales"].includes(role);
  useEffect(() => {
    if (!embedded || !isStaffDock) return;
    const id = ++changeReq.current;
    getProposalChangeStateAction(accessId).then((r) => { if (id === changeReq.current && r?.ok) setChangeState(r.changeState); }).catch(() => {});
  }, [accessId, meta, embedded, isStaffDock]);

  const status = meta?.status && meta.payload ? meta.status : (meta?.status || "draft");
  const readOnly = status !== "draft";
  const opt = payload.options.find((o) => o.id === activeOpt) || payload.options[0];
  // Services actually in this proposal (union across options — config is project-wide). Proposal
  // Configuration only surfaces these, never the whole company catalog. Reactive: adding/removing a
  // service updates it immediately.
  const activeServices = useMemo(() => {
    const keys = new Set();
    (payload.options || []).forEach((o) => (o.services || []).forEach((s) => s.key && keys.add(s.key)));
    return PROPOSAL_SERVICES.filter((s) => keys.has(s.key));
  }, [payload]);
  // Camera lines display the survey's live location name. Prefer the camera_id link (the single source
  // of truth); on this staff-only editable surface fall back to a best-effort position match (Nth camera
  // block ↔ Nth surveyed camera) so survey-imported blocks read "Kitchen 1" etc. instead of the generic
  // "Full Camera Install" even before they're explicitly linked — a wrong guess here is visible + correctable.
  const camNames = cameraNameOverrides(opt?.services, camRoster, { byPosition: true });

  function patchPayload(next) { setPayload(next); setDirty(true); setErr(null); }
  // Smart bulk-update apply: the editor hands back the already-propagated payload + the undo set. We commit it
  // through the canonical path (patchPayload → autosave → totals recompute) and offer a single atomic Undo that
  // sets every affected sub-item (the matches + the one you edited) back to the old value.
  function applyBulkUpdate(nextPayload, info) {
    patchPayload(nextPayload);
    const fmt = (v) => (info.field === "price"
      ? "$" + (Math.round((+v || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(Math.round((+v || 0) * 100) / 100));
    // Undo sets the SAME targets back to the old value, re-derived from the LIVE payload (functional update) —
    // not the captured post-bulk snapshot — so any edit made in the 6s the toast is up is never discarded.
    showToast(`${info.name} updated on ${info.count} item${info.count === 1 ? "" : "s"} · ${fmt(info.newValue)}`,
      () => { setPayload((prev) => applyBulkSub(prev, info.undoTargets, info.field, info.oldValue)); setDirty(true); setErr(null); });
  }
  function patchOption(patch) {
    patchPayload({ ...payload, options: payload.options.map((o) => (o.id === opt.id ? { ...o, ...patch } : o)) });
  }
  function addOption() {
    if (payload.options.length >= 3) return;
    const used = new Set(payload.options.map((o) => o.id));
    const idx = OPTION_LETTERS.findIndex((l) => !used.has(l));
    const o = blankOption(idx);
    patchPayload({ ...payload, options: [...payload.options, o] });
    setActiveOpt(o.id);
  }
  function removeOption(id) {
    if (payload.options.length <= 1) return;
    const next = payload.options.filter((o) => o.id !== id);
    patchPayload({ ...payload, options: next });
    if (activeOpt === id) setActiveOpt(next[0].id);
  }
  function addService(key) {
    if (!key) return;   // a service type can appear more than once (e.g. two separate camera systems)
    // Toast POS always brings ISP / Pronto-Meraki / Network Switch along, even added
    // manually with no survey markers — same baseline surveyToImport seeds on import.
    const items = key === "toast" ? toastBaselineItems(loadPriceBook())
      : key === "camera" ? cameraBaselineItems(loadPriceBook()) : [];
    patchOption({ services: [...opt.services, { key, label: serviceLabel(key), items, note: "" }] });
  }
  // Drag-to-reorder whole service sections within the active option.
  function moveService(from, to) {
    if (from == null || to == null || from === to) return;
    const next = opt.services.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    patchOption({ services: next });
  }
  // Move a top-level line item from the service it's being dragged from into another service
  // (before `toId`, or appended when toId is null). Same-section drops are handled inside the editor.
  function moveLineItem(toSvcIdx, toId) {
    const src = dragItem;
    if (!src || src.svcIdx === toSvcIdx) { setDragItem(null); return; }
    const services = opt.services.map((s) => ({ ...s, items: (s.items || []).slice() }));
    const fromItems = services[src.svcIdx]?.items; const toItems = services[toSvcIdx]?.items;
    if (!fromItems || !toItems) { setDragItem(null); return; }
    const fi = fromItems.findIndex((x) => x.id === src.id);
    if (fi < 0) { setDragItem(null); return; }
    const [moved] = fromItems.splice(fi, 1);
    let at = toId ? toItems.findIndex((x) => x.id === toId) : toItems.length;
    if (at < 0) at = toItems.length;
    toItems.splice(at, 0, moved);
    patchOption({ services });
    setDragItem(null);
  }

  // ---- Import from the site survey (per-camera blocks w/ labor sub-items + locations) ----
  // `auto` = fired on first open of an empty draft. `floorIndex` = a single floor index, an
  // array of indices (the floor-plan checkbox picker), or null for every floor.
  function importSurvey(auto = false, floorIndex = null) {
    ensureSurveyCameraIds(accessId);   // stamp stable cids first, so imported camera line items carry camera_id
    const survey = loadSurveyForImport(accessId);
    const groups = survey ? surveyToImport(survey, floorIndex) : [];
    const picked = floorIndex == null ? null : (Array.isArray(floorIndex) ? floorIndex : [floorIndex]);
    const floorName = picked ? picked.map((i) => surveyFloors.find((f) => f.index === i)?.name).filter(Boolean).join(", ") || null : null;
    if (!groups.length) { if (!auto) setImportMsg(floorName ? `No importable devices on ${floorName}.` : "No survey devices found on this device."); return; }
    // Count what will actually be added (auto replaces → all; manual dedupes → only new names).
    let added = 0;
    if (auto) added = groups.reduce((s, g) => s + g.items.length, 0);
    else {
      const optNow = payload.options.find((o) => o.id === activeOpt) || payload.options[0];
      groups.forEach((g) => {
        const ex = optNow.services.find((s) => s.key === g.key);
        const have = ex ? new Set(ex.items.map((it) => it.name)) : new Set();
        added += g.items.filter((it) => !have.has(it.name)).length;
      });
    }
    setPayload((prev) => {
      const optId = prev.options.some((o) => o.id === activeOpt) ? activeOpt : prev.options[0].id;
      return {
        ...prev,
        options: prev.options.map((o) => {
          if (o.id !== optId) return o;
          // Auto-import is IDEMPOTENT: it replaces the option's services with the survey's,
          // so a remount that races the autosave can't stack duplicate copies. It only ever
          // fires on an empty draft, so nothing manual is lost.
          if (auto) return { ...o, services: groups };
          // Manual import MERGES but never duplicates: an item already present (by name) is skipped.
          const services = o.services.map((s) => ({ ...s, items: [...s.items] }));
          groups.forEach((g) => {
            const ex = services.find((s) => s.key === g.key);
            if (ex) {
              const have = new Set(ex.items.map((it) => it.name));
              const fresh = g.items.filter((it) => !have.has(it.name));
              ex.items = [...ex.items, ...fresh];
              if (g.note && !(ex.note || "").includes(g.note)) ex.note = (ex.note ? ex.note + "\n" : "") + g.note;
            } else {
              services.push(g);
            }
          });
          return { ...o, services };
        }),
      };
    });
    setDirty(true);
    setImportMsg(added === 0
      ? `${floorName || "The survey"} is already imported — nothing new to add.`
      : `${auto ? "Auto-imported" : "Imported"} ${added} item${added !== 1 ? "s" : ""} from ${floorName || "the survey"}.`);
  }

  // Rebuild from survey: the survey is the source of truth for the camera LIST — replace this option's
  // camera service with the survey's cameras (each named by location + linked by camera_id), so the
  // proposal mirrors the survey exactly. Other services are kept. Changes the camera count/total.
  function syncCamerasFromSurvey() {
    ensureSurveyCameraIds(accessId);
    const survey = loadSurveyForImport(accessId);
    const groups = survey ? surveyToImport(survey, null) : [];
    const camGroup = groups.find((g) => g.key === "camera");
    if (!camGroup) { setImportMsg("No survey cameras to sync."); return; }
    setPayload((prev) => {
      const optId = prev.options.some((o) => o.id === activeOpt) ? activeOpt : prev.options[0].id;
      return { ...prev, options: prev.options.map((o) => o.id !== optId ? o
        : { ...o, services: [camGroup, ...o.services.filter((s) => s.key !== "camera")] }) };
    });
    setDirty(true);
    const n = (camGroup.items || []).filter((it) => (it.sub || []).length).length;
    setImportMsg(`Cameras rebuilt from the survey — ${n} camera${n !== 1 ? "s" : ""}.`);
  }

  // A rename on a camera line writes through to the survey (single source of truth, by cid), so the
  // new name shows on the survey, the mockup, and here. Only linked camera lines write back.
  async function writeCameraName(cid, name) {
    if (!cid) return;
    try {
      await fetch("/api/project-cameras", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessId, cid, name }) });
      rosterReloadRef.current?.();
    } catch { /* keep the local edit; a later save/reload reconciles */ }
  }

  async function save() {
    setBusy(true); setErr(null);
    // Optimistic concurrency (Phase 5): send the updated_at we loaded so the server can reject a save that
    // would clobber a concurrent edit (another tab/user) instead of silently overwriting it.
    const r = await saveProposalDraftAction(accessId, { payload, taxRate: +taxRate, depositPct: +depositPct, expectedUpdatedAt: meta?.updated_at });
    setBusy(false);
    if (r?.conflict) {
      // Reload the latest so the workspace reflects reality; the user re-applies their change on top.
      try { const latest = await getProposalAction(accessId); if (latest?.proposal) adopt(latest.proposal); } catch { /* best-effort reload */ }
      setErr("This proposal was changed elsewhere — reloaded the latest. Re-apply your change and save again.");
      return false;
    }
    if (r?.error) {
      if (/Unauthorized|authenticated/i.test(r.error)) {
        setAuthBlocked(true);
        setErr("Log in to save — PIN preview can't write changes.");
      } else setErr(r.error);
      return false;
    }
    adopt(r.proposal);
    setSavedAt(new Date());
    return true;
  }
  async function send() {
    setConfirmSend(false);
    if (dirty && !(await save())) return;
    setBusy(true); setErr(null);
    const r = await sendProposalAction(accessId);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    adopt(r.proposal);
    showToast("Proposal submitted to customer");
  }
  async function resolveFlag(itemId, label) {
    const r = await resolveFlagAction(accessId, itemId);
    if (r?.error) { setErr(r.error); return; }
    adopt(r.proposal);
    showToast(label === "discard" ? "Request discarded" : "Marked done");
  }
  async function revise() {
    setBusy(true); setErr(null);
    const r = await reviseProposalAction(accessId);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    adopt(r.proposal);
  }
  // Manually email the customer their proposal link (in addition to the auto-send on Submit) — lets
  // staff re-send it any time so the customer can view it easier.
  async function emailToCustomer() {
    setBusy(true); setErr(null);
    const r = await emailProposalAction(accessId);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    showToast(r.sent ? "Proposal emailed to customer" : (r.note || "Email isn’t configured yet"));
  }
  // Internal admin review of a signed contract — an acknowledgment, not a second customer approval.
  async function markReviewed() {
    setBusy(true);
    const r = await markProposalReviewedAction(accessId, true);
    setBusy(false);
    if (r?.error) { showToast(r.error); return; }
    if (r?.proposal) adopt(r.proposal);
    showToast("Marked reviewed");
  }
  // Download the same brand PDF the customer gets — built from the CURRENT edits (payload + tax +
  // deposit merged onto the server row), with the mockup photos and survey floor plans appended.
  async function handleDownload(mode = "standard") {
    setDlError("");
    if (dlBusy) return;
    setDlBusy(true);
    const p = { ...(meta || {}), payload, tax_rate: taxRate, deposit_pct: depositPct };
    let mockupImages = [], surveyImages = [], plannerFloors = [];
    try {
      const [mk, sv] = await Promise.all([
        getToolDataAction(accessId, "mockup").catch(() => null),
        getToolDataAction(accessId, "survey2").catch(() => null),
      ]);
      const jobs = [];
      let hasMockupPhoto = false;
      // A placed photo is either an inline data: URL or (normal path) a small /api/media URL — count both.
      try { const md = mk?.saved?.data ? JSON.parse(mk.saved.data) : null; hasMockupPhoto = Array.isArray(md?.photos) && md.photos.some((x) => typeof x === "string" && x.length > 0); } catch { /* bad blob */ }
      if (hasMockupPhoto && mk?.saved?.data) jobs.push(exportMockupImages(accessId, mk.saved.data).then((r) => { mockupImages = r; }).catch(() => {}));
      // Only include the Site Survey when it's actually built (real content), not an empty default survey.
      if (sv?.saved?.data && survey2HasData(sv.saved.data)) { plannerFloors = parseSurveyFloors(sv.saved.data); jobs.push(exportSurvey2Images(sv.saved.data).then((r) => { surveyImages = r; }).catch(() => {})); }
      await Promise.all(jobs);
    } catch { /* download numbers-only on any fetch failure */ }
    try {
      if (mode === "survey") {
        // Site Survey on its own: the planner's floors with every device, named "… - Site Survey.pdf".
        const out = downloadSurveyPdf({ fileBase, customerName, customerAddress, projectId: accessId, surveyImages });
        if (!out) setDlError("No site survey on this project yet.");
      } else {
        // Shrink the appendix so the proposal PDF stays light (fast signer + download). Best-effort.
        let sImgs = surveyImages, mImgs = mockupImages;
        try { ({ surveyImages: sImgs, mockupImages: mImgs } = await compactAppendix({ surveyImages, mockupImages })); } catch { /* keep originals */ }
        await saveFillableProposalPdf(p, { customerName, customerAddress, customerPhone, customerEmail, mode, fileBase, projectId: accessId }, { mockupImages: mImgs, surveyImages: sImgs, surveyFloors: plannerFloors });
      }
    }
    finally { setDlBusy(false); }
  }

  // Share a link that opens the customer straight to THIS proposal (still PIN-gated at the door).
  async function shareProposal() {
    const url = `${window.location.origin}/project/${accessId}?stage=proposal&open=proposal`;
    try { if (navigator.share) { await navigator.share({ title: "Your IOT TECHS proposal", url }); return; } } catch { /* share sheet cancelled — fall through to copy */ }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt("Copy this link to share the proposal:", url); }
  }

  // Request Signature — the admin-side equivalent of the customer's "Review & Sign". Opens a share sheet
  // with two paths: share the DIRECT signing link (?sign=<opt> → the signer auto-opens after the PIN gate),
  // or email it. Sharing via the OS sheet gives no delivery proof, so it NEVER marks the customer notified
  // or logs — only a real email (requestSignatureEmailAction, staff-only + debounced + logged) does that.
  const [sigSheet, setSigSheet] = useState(false);
  const [sigBusy, setSigBusy] = useState(false);
  const [sigCopied, setSigCopied] = useState(false);
  const signingUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/project/${accessId}?open=proposal&sign=${opt?.id ?? ""}`;
  // Copy the signing link straight to the clipboard and close the sheet — the fast path when you just want the URL.
  async function copySigningLink() {
    try { await navigator.clipboard.writeText(signingUrl); showToast("Signing link copied"); }
    catch { try { window.prompt("Copy this signing link:", signingUrl); } catch { /* noop */ } }
    setSigSheet(false);
  }
  async function shareSigningLink() {
    try { if (navigator.share) { await navigator.share({ title: "Review & sign your IOT TECHS proposal", url: signingUrl }); return; } } catch { /* cancelled — fall through to copy */ }
    try { await navigator.clipboard.writeText(signingUrl); setSigCopied(true); setTimeout(() => setSigCopied(false), 1800); }
    catch { window.prompt("Copy this signing link:", signingUrl); }
  }
  async function requestViaEmail() {
    if (sigBusy) return;                    // guard against duplicate emails from repeated taps
    setSigBusy(true);
    const r = await requestSignatureEmailAction(accessId, opt?.id).catch(() => null);
    setSigBusy(false);
    setSigSheet(false);
    if (r?.error) { showToast(r.error); return; }
    showToast(r?.sent ? "Signature request emailed" : (r?.note || "Email isn’t configured yet"));
  }

  const totals = optionTotals(opt, taxRate, payload.discount, depositPct, payload.pcp_credit);
  // Canonical contract math: base proposal (this doc) + approved add-ons = current contract total.
  // The base proposal is never rewritten — add-ons show as a separate amendment line.
  const fin = projectFinancials(totals.grand, addons.total, 0, depositPct);
  // Conditional financial disclosure (presentation only — canonical values, no recalculation): in a read-only
  // proposal, a row earns its place only when it actually moves the price. When subtotal === total with no
  // non-zero modifier, Subtotal and Tax collapse away and only Total shows, then straight into Payment Terms.
  // Edit mode always keeps the Subtotal/Tax/Discount/PCP controls so staff can add an adjustment.
  const hasTax = totals.tax > 0;
  const hasAdjustments = totals.discount > 0 || totals.pcpCredit > 0 || hasTax || fin.hasAddons;
  // Progressive disclosure: don't show a finished proposal's controls before there's a proposal. The current
  // option drives the empty state; the pricing engine + payment terms only render once there's something to price.
  const servicesEmpty = opt.services.length === 0;
  const optHasItems = opt.services.some((s) => (s.items || []).length > 0);
  const priceable = optHasItems || totals.sub > 0;
  const disc = payload.discount || { type: "flat", value: 0 };
  const pcp = (payload.pcp_credit && typeof payload.pcp_credit === "object") ? payload.pcp_credit : { type: "flat", value: +payload.pcp_credit || 0 };
  const plan = payload.payment_plan || "custom";
  function setDiscount(patch) { patchPayload({ ...payload, discount: { ...disc, ...patch } }); }
  function setPcp(patch) { patchPayload({ ...payload, pcp_credit: { ...pcp, ...patch } }); }

  // ---- Custom multi-payment schedule ----
  // First payment defaults to 50%; the rest split the remainder evenly. Editing any row re-splits the
  // OTHER rows so the total always lands on 100%. Due dates follow a cadence (biweekly / monthly) or
  // are entered by hand (custom). A gear switches the cadence.
  const fmtISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDaysISO = (iso, days) => { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); d.setDate(d.getDate() + days); return fmtISO(d); };
  const addMonthsISO = (iso, n) => { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); d.setMonth(d.getMonth() + n); return fmtISO(d); };
  const fmtShortDate = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return ""; const d = new Date(+m[1], +m[2] - 1, +m[3]); return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} '${String(m[1]).slice(2)}`; };
  // Cascade FORWARD: edits prioritize the earlier payments. Pinning row `editedIdx` to `value` keeps
  // every earlier row fixed and re-splits only the LATER rows evenly so the whole schedule still sums
  // to 100%. (e.g. 50 · [30] · _ · _  →  50 · 30 · 10 · 10). Editing the last row just closes the gap.
  const r2 = (x) => Math.round((+x || 0) * 100) / 100;   // 2-decimal precision so exact dollar amounts survive round-trips
  function cascadePct(rows, editedIdx, value) {
    const n = rows.length;
    const pcts = rows.map((r) => Math.max(0, r2(r.pct)));
    const before = r2(pcts.slice(0, editedIdx).reduce((a, b) => a + b, 0));
    const v = Math.max(0, Math.min(100 - before, r2(value)));   // never let the total exceed 100
    pcts[editedIdx] = v;
    const after = n - 1 - editedIdx;
    if (after > 0) {
      const each = r2(Math.max(0, 100 - before - v) / after);
      for (let j = editedIdx + 1; j < n; j++) pcts[j] = each;
      const sum = r2(pcts.reduce((a, b) => a + b, 0));
      if (sum !== 100) pcts[n - 1] = Math.max(0, r2(pcts[n - 1] + (100 - sum)));   // last row absorbs rounding drift
    } else {
      pcts[editedIdx] = Math.max(0, r2(100 - before));   // last row is whatever closes the schedule
    }
    return pcts;
  }
  // Default split: first payment 50%, the rest cascade evenly across the remaining rows.
  const defaultPcts = (n) => cascadePct(Array.from({ length: n }, () => ({ pct: 0 })), 0, 50);
  const dueDatesFor = (n, cadence, start) => { const base = start || fmtISO(new Date()); return Array.from({ length: n }, (_, i) => cadence === "biweekly" ? addDaysISO(base, i * 14) : addMonthsISO(base, i)); };
  // Dates must run in order — a later payment can never fall before an earlier one. A forward pass
  // pushes any date that precedes its predecessor up to match (earlier payments stay fixed).
  const enforceDateOrder = (dates) => { const d = dates.slice(); for (let j = 1; j < d.length; j++) if (d[j] && d[j - 1] && d[j] < d[j - 1]) d[j] = d[j - 1]; return d; };
  function buildSchedule(n, cadence, start, pcts) {
    const p = pcts || defaultPcts(n); const dates = dueDatesFor(n, cadence, start);
    return { rows: p.map((pct, i) => ({ pct, due: dates[i] })), cadence };
  }
  const custPlan = (payload.custom_plan && Array.isArray(payload.custom_plan.rows) && payload.custom_plan.rows.length) ? payload.custom_plan : buildSchedule(3, "monthly");
  // Normalize whatever is stored: chronological dates (older plans may have out-of-order dates) and
  // clean 2-decimal percentages (older plans may hold float garbage like 12.959999999999994).
  const custRows = (() => { const rows = custPlan.rows; const ordered = enforceDateOrder(rows.map((r) => r.due)); return rows.map((r, i) => ({ ...r, pct: r2(+r.pct || 0), due: ordered[i] })); })();
  const custCadence = custPlan.cadence === "biweekly" ? "biweekly" : "monthly";
  const custSumPct = r2(custRows.reduce((s, r) => s + (+r.pct || 0), 0));
  // Canonical payment schedule for DISPLAY (same function + base the customer view uses). The signature is just the
  // schedule's own percentages: "100%" for one milestone, "50 / 50" / "50 / 30 / 20" for several.
  const planSched = planScheduleRows(plan, custRows, fin.current, payload.full_date || null);
  const planSig = planSched.length === 1 ? planSched[0].pctLabel : planSched.map((r) => r.pctLabel.replace("%", "")).join(" / ");
  function commitPlan(next) {
    patchPayload({ ...payload, payment_plan: "custom", custom_plan: next });
    setDepositPct(+next.rows[0]?.pct || 0); setDirty(true);   // deposit = the first scheduled payment
  }
  const setCustCount = (n) => { const c = Math.max(2, Math.min(12, n | 0)); commitPlan(buildSchedule(c, custCadence, custRows[0]?.due)); };
  const setCadence = (cad) => { setCadOpen(false); const dates = dueDatesFor(custRows.length, cad, custRows[0]?.due); commitPlan({ rows: custRows.map((r, i) => ({ ...r, due: dates[i] })), cadence: cad }); };
  const setCustPct = (i, v) => { const pcts = cascadePct(custRows, i, v); commitPlan({ rows: custRows.map((r, j) => ({ ...r, pct: pcts[j] })), cadence: custCadence }); };
  // Editing the dollar amount drives the percentage (amount ÷ grand total), then cascades forward like a % edit.
  const setCustAmt = (i, dollars) => { const g = totals.grand || 0; if (!g) return; setCustPct(i, (Math.max(0, +dollars || 0) / g) * 100); };
  const setCustDue = (i, v) => { const ordered = enforceDateOrder(custRows.map((r, j) => j === i ? v : r.due)); commitPlan({ rows: custRows.map((r, j) => ({ ...r, due: ordered[j] })), cadence: custCadence }); };
  // If a stored plan has out-of-order dates (from before the ordering rule), persist the corrected
  // order once so save/PDF/customer view all agree — not just the on-screen builder.
  useEffect(() => {
    if (plan !== "custom") return;
    const rows = payload.custom_plan?.rows;
    if (!rows?.length) return;
    const ordered = enforceDateOrder(rows.map((r) => r.due));
    if (ordered.some((d, i) => d !== rows[i].due)) {
      patchPayload({ ...payload, custom_plan: { ...payload.custom_plan, rows: rows.map((r, i) => ({ ...r, due: ordered[i] })) } });
      setDirty(true);
    }
  }, [plan, payload.custom_plan]);   // eslint-disable-line react-hooks/exhaustive-deps

  function setPlan(key, fullDate) {
    const patch = { ...payload, payment_plan: key };
    // full_date only applies to the pay-in-full plans (100 / 100_end): a chosen date renders as
    // "by <date>" instead of before/upon. Clear it for every other plan so it never lingers.
    patch.full_date = (key === "100" || key === "100_end") ? (fullDate || null) : null;
    if (key === "custom" && !(payload.custom_plan && payload.custom_plan.rows?.length)) patch.custom_plan = buildSchedule(3, "monthly");
    patchPayload(patch);
    if (key === "custom") { setDepositPct(+patch.custom_plan.rows[0]?.pct || 0); setDirty(true); return; }
    const pp = PAYMENT_PLANS[key];
    if (pp && pp.depositPct != null) { setDepositPct(pp.depositPct); setDirty(true); }
  }

  // ---- Waiver tool: comp a whole line item off the invoice (keeps it visible at $0) ----
  // A line is "waivable" if it carries real value (or is already waived). NVR/drives live in the
  // camera sysbar (slot) and aren't individually waivable; displays (displaySlot) CAN be comped.
  const canWaive = (it) => it.slot == null && (it.waived || itemTotal({ ...it, waived: false }) > 0);
  const waivable = [];
  opt.services.forEach((s) => (s.items || []).forEach((it) => { if (canWaive(it)) waivable.push({ svcLabel: s.label, it }); }));
  const waivedCount = waivable.filter((w) => w.it.waived).length;
  function setWaived(id, waived) {
    patchOption({ services: opt.services.map((s) => ({ ...s, items: (s.items || []).map((it) => (it.id === id ? { ...it, waived } : it)) })) });
  }
  function waiveAll(v) {
    patchOption({ services: opt.services.map((s) => ({ ...s, items: (s.items || []).map((it) => (canWaive(it) ? { ...it, waived: v } : it)) })) });
  }

  // Lifted to component scope so BOTH the card header and the new bottom action dock use one definition.
  const statusChip = (
    <span className={`prop-status ${status === "changes_requested" ? "changes" : status}`}>
      {status === "draft" && (dirty ? "Draft · unsaved" : "Draft")}
      {status === "sent" && (() => {
        const by = meta?.sent_by_name ? (String(meta.sent_by_name).includes("@") ? String(meta.sent_by_name).split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : meta.sent_by_name) : "";
        const when = meta?.sent_at ? fmtSignStamp(meta.sent_at).replace(/,\s*\d{4}/, "").replace(/\s*\bET\b/, "").trim() : "";
        return <><i className="prop-sent-dot" /><b className="prop-sent-lbl">Sent</b>{when && <span className="prop-sent-seg">· {when}</span>}{by && <span className="prop-sent-seg">· {by}</span>}</>;
      })()}
      {status === "changes_requested" && "Changes requested"}
      {status === "accepted" && `Accepted · Option ${meta?.selected_option || ""}`}
    </span>
  );
  // Contextual save state for the dock (draft only): "Saved HH:MM" / "Unsaved…" / "Saving…".
  const saveStateEl = !readOnly && !authBlocked && (busy || dirty || savedAt) ? (
    <span className={`prop-dock-save${busy || dirty ? " pending" : ""}`}>· {busy ? "Saving…" : dirty ? "Unsaved…" : `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</span>
  ) : null;

  return (
    <>
    <div className="prop-card" style={{ "--prop-accent": status === "accepted" ? "#2f7d5a" : status === "sent" ? "#C9A96E" : "#D64545" }}>
      {/* Card header — matches the one project-page tool-card format: icon · title · status chip
          on the left, actions + collapse chevron on the right (same as FlowStep / the other cards).
          Left accent follows the red/gold/green rule: red = draft/changes (staff action needed),
          gold = sent (awaiting customer), green = accepted (done). */}
      {(() => {
        // PIN-preview notice — a quiet chip beside the status, not a full-width row (permission ≠ content).
        const previewChip = authBlocked && (
          <span className="prop-preview-chip" title="You're viewing by PIN — log in to save changes">Preview · log in to edit</span>
        );
        const gear = !readOnly && (
          <button className="prop-gear" title="Configuration — pricing &amp; presets" onClick={() => setPricingOpen("__all__")}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        );
        // Eye icon (staff only, once sent) → how many times the customer opened the proposal and when.
        const isStaff = ["admin", "manager", "sales"].includes(role);
        const eye = isStaff && onShowViews && ["sent", "accepted", "changes_requested"].includes(status) && (
          <button className="prop-eye" title={viewCount ? `Customer opened this ${viewCount} time${viewCount === 1 ? "" : "s"} — see when` : "Customer hasn't opened it yet"} onClick={onShowViews}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
            <span className="prop-eye-n">{viewCount}</span>
          </button>
        );
        // Share a link straight to this proposal (PIN-gated) + download the PDF — up here so staff can
        // send it to collect the signature fast, without scrolling to the bottom.
        const shareBtn = (
          <button className="prop-eye" onClick={shareProposal} title="Copy a link that opens straight to this proposal">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>
            {copied && <span className="prop-eye-n">Copied</span>}
          </button>
        );
        // Reverse entry: this proposal as the starting point for ANOTHER project (same clone service).
        const useFor = canReuse && meta?.id && hasItems && (
          <button className="prop-eye" onClick={() => setUseForOpen(true)} title="Use for another project" aria-label="Use for another project">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        );
        const download = (
          <button className="prop-eye" disabled={dlBusy} onClick={() => handleDownload("standard")} title="Download the proposal PDF (with mockup & survey)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        );
        // Primary action up top too, same handlers/conditions as the footer — so staff never have to
        // scroll to act. Revise on a sent (readOnly) proposal; Submit on an editable draft. Revising a
        // sent proposal flips it to a draft, so the button naturally becomes Submit for the re-send.
        const reviseBtn = readOnly && (
          <button type="button" className="prop-head-cta prop-head-edit" disabled={busy} onClick={revise} title="Edit — reopen an editable version of this proposal">Edit</button>
        );
        const submitBtn = !readOnly && (
          <button type="button" className="prop-head-cta" disabled={busy} onClick={send} title="Submit this proposal to the customer">Submit</button>
        );
        // Request Signature — gold, matching the customer's "Review & Sign". Shown on a sent proposal that's
        // still awaiting a signature (hidden once accepted/signed). Opens the share sheet (link or email).
        const requestSignBtn = isStaff && ["sent", "changes_requested"].includes(status) && (
          <button type="button" className="prop-head-cta prop-head-sign" disabled={busy} onClick={() => setSigSheet(true)} title="Request the customer’s signature">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M15.5 4.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            Request Signature
          </button>
        );
        // Embedded (deck overlay): the bar already says "Proposal" — drop the "Proposal builder"
        // title + self-collapse; keep just the status chip, the views eye, and the pricing gear on a slim row.
        if (embedded) {
          // One compact toolset (matches the mobile mockup): Sent · Edit · views · share · download.
          // Copy ("use for another project") is not in the primary toolbar. On mobile the Sent stamp
          // compacts to just "● Sent" (CSS) and the row centers; desktop keeps the full date/sender stamp.
          // The top band only carries the PIN-preview chip + "+ Option"; when neither applies it is empty and
          // collapses (CSS :empty) — no standalone strip. The customer open-count (eye) moved into the dock's
          // ••• menu (Views). The status and EVERY action live in the dock.
          return <div className="prop-head-slim prop-head-toolbar prop-head-info">{previewChip}</div>;
        }
        return (
          <div className="pv-tool-head prop-head" style={{ "--tool-c": "var(--prop-accent)" }}>
            <button type="button" className="pv-tool-toggle" onClick={() => setBodyOpen((o) => !o)} title={bodyOpen ? "Collapse" : "Expand"}>
              <span className="pv-tool-icon">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
              </span>
              <span className="pv-tool-title">Proposal builder{meta?.version ? ` · v${meta.version}` : ""}</span>
              {statusChip}
            </button>
            {shareBtn}
            {download}
            {useFor}
            {eye}
            {gear}
            {requestSignBtn}
            {reviseBtn}
            {submitBtn}
            <button type="button" className="pv-tool-chev-btn" onClick={() => setBodyOpen((o) => !o)} title={bodyOpen ? "Collapse" : "Expand"}>{bodyOpen ? "▲" : "▼"}</button>
          </div>
        );
      })()}

      {bodyOpen && (<div className="prop-body">
      {/* Internal review of a signed contract — admin/manager only; separate from the customer's acceptance. */}
      {["admin", "manager"].includes(role) && status === "accepted" && meta?.signed_name && (
        <div className={`prop-review-bar ${meta?.admin_reviewed_at ? "done" : "pending"}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{meta?.admin_reviewed_at ? <path d="M20 6 9 17l-5-5" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></>}</svg>
          <span className="prr-tx">
            <b>{meta?.admin_reviewed_at ? "Signed — Reviewed" : "Signed — Pending review"}</b>
            <small>{meta?.admin_reviewed_at ? `Reviewed${meta.admin_reviewed_by ? ` by ${meta.admin_reviewed_by}` : ""}` : "Customer signed. Internal review only — not another customer approval."}</small>
          </span>
          {!meta?.admin_reviewed_at && <button type="button" className="prr-btn" disabled={busy} onClick={markReviewed}>Mark Reviewed</button>}
        </div>
      )}
      {status === "changes_requested" && meta?.change_note && (
        <div className="prop-note-strip">Customer: “{meta.change_note}”</div>
      )}
      {/* A PIN-preview "log in to edit" notice lives as a compact chip in the toolbar (see previewChip), not a
          full-width row — so permission state never looks like proposal content. Other errors still strip here. */}
      {err && !authBlocked && <div className="prop-note-strip">{err}</div>}
      {importMsg && <div className="prop-svc-sub">{importMsg}</div>}
      {!readOnly && reviewDiffs.length > 0 && (
        <PricingReview diffs={reviewDiffs} onDismiss={() => setReviewDiffs([])}
          onApply={(updates) => { if (Object.keys(updates).length) { setPayload((p) => applyPrices(p, updates)); setDirty(true); } }} />
      )}
      {useForOpen && meta?.id && <UseForAnother accessId={accessId} proposalId={meta.id} onClose={() => setUseForOpen(false)} />}

      {/* Request Signature share sheet — the admin equivalent of the customer's "Review & Sign". */}
      {sigSheet && (
        <div className="prop-sig-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setSigSheet(false); }}>
          <div className="prop-sig-sheet" role="dialog" aria-modal="true" aria-label="Request signature">
            <div className="prop-sig-head">
              <span className="prop-sig-title">Request Signature</span>
              <button type="button" className="prop-sig-x" onClick={() => setSigSheet(false)} aria-label="Close">×</button>
            </div>
            <button type="button" className="prop-sig-act" onClick={copySigningLink}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Copy Link</span>
            </button>
            <button type="button" className="prop-sig-act" onClick={shareSigningLink}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>
              <span>{sigCopied ? "Link copied" : "Share Signing Link"}</span>
            </button>
            <button type="button" className="prop-sig-act" disabled={sigBusy} onClick={requestViaEmail}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
              <span>{sigBusy ? "Sending…" : "Request via Email"}</span>
            </button>
            <div className="prop-sig-note">Opens their proposal to sign — identity is confirmed at the door.</div>
          </div>
          <style>{SIG_SHEET_CSS}</style>
        </div>
      )}

      {/* Option tabs — only meaningful when there's a CHOICE (2+ options). A lone option is redundant, so
          the row is hidden for a single option; "+ Option" now lives in the top toolbar. */}
      {payload.options.length > 1 && (
      <div className="prop-tabs">
        {payload.options.length > 1 && payload.options.map((o) => {
          const active = o.id === activeOpt;
          if (active && !readOnly) return (
            <div key={o.id} className="prop-tab on prop-tab-edit">
              <span className="prop-tab-letter">{o.id}</span>
              <input className="prop-tab-name" value={o.name} maxLength={60}
                size={Math.max(6, (o.name || "").length)}
                onChange={(e) => patchOption({ name: e.target.value })} placeholder="Option name" />
              <span className="prop-tab-x" onClick={() => removeOption(o.id)} title="Remove option">✕</span>
            </div>
          );
          return (
            <button key={o.id} className={`prop-tab${active ? " on" : ""}`} onClick={() => setActiveOpt(o.id)}>
              {o.id} · {o.name}
            </button>
          );
        })}
      </div>
      )}

      {!readOnly && !servicesEmpty && surveyFloors.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <FloorImportPicker floors={surveyFloors} onImport={(indices) => importSurvey(false, indices)} />
          {syncConfirm ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: ".76rem", color: "var(--muted)" }}>Replace the cameras with the survey&apos;s?</span>
              <button className="prop-tab" onClick={() => { setSyncConfirm(false); syncCamerasFromSurvey(); }}>Rebuild</button>
              <button className="prop-tab" onClick={() => setSyncConfirm(false)}>Cancel</button>
            </span>
          ) : (
            <button className="prop-tab" title="Replace this option's cameras with the survey's — named + linked to each surveyed camera" onClick={() => setSyncConfirm(true)}>Sync from survey</button>
          )}
        </div>
      )}

      {/* Services */}
      {opt.services.map((s, i) => (
        <ProposalItemsEditor
          key={s.key + i}
          svc={s}
          showCost={showCost}
          readOnly={readOnly}
          customerFlags={meta?.customerFlags}
          onResolveFlag={resolveFlag}
          onChange={(next) => patchOption({ services: opt.services.map((x, j) => (j === i ? next : x)) })}
          onRemove={() => patchOption({ services: opt.services.filter((_, j) => j !== i) })}
          payload={payload}
          activeOptId={opt.id}
          optionCount={payload.options.length}
          onBulkApply={applyBulkUpdate}
          onOpenPricing={readOnly ? undefined : setPricingOpen}
          priceBookVersion={priceBookVersion}
          cameraNames={camNames}
          onCameraRename={writeCameraName}
          svcDrag={readOnly ? undefined : {
            dragging: dragSvc != null,
            over: overSvc === i && dragSvc !== i,
            onHandleDragStart: () => setDragSvc(i),
            onHandleDragEnd: () => { setDragSvc(null); setOverSvc(null); },
            onDragOver: () => { if (dragSvc != null && dragSvc !== i) setOverSvc(i); },
            onDrop: () => { moveService(dragSvc, i); setDragSvc(null); setOverSvc(null); },
          }}
          itemDrag={readOnly ? undefined : {
            active: dragItem,
            svcIdx: i,
            onStart: (id) => setDragItem({ svcIdx: i, id }),
            onEnd: () => setDragItem(null),
            onDrop: (toId) => moveLineItem(i, toId),
          }}
        />
      ))}
      {/* EMPTY STATE — an intentional "build your proposal" start, not a blank builder. Shows only when the
          current option has no services; the pricing engine + payment terms stay hidden until there's content. */}
      {!readOnly && servicesEmpty && (
        <div className="prop-build">
          <div className="prop-build-h">Build your proposal</div>
          <div className="prop-build-sub">Start from the site survey or add a service.</div>
          <div className="prop-build-acts">
            {surveyFloors.length > 0 && <FloorImportPicker floors={surveyFloors} onImport={(indices) => importSurvey(false, indices)} label="Import Survey" primary />}
            <ServiceAdder label="+ Add Service" primary={surveyFloors.length === 0} onPick={addService} />
            {payload.options.length === 1 && <button type="button" className="prop-build-opt" onClick={addOption}>+ Option</button>}
          </div>
          {canReuse && (
            <ProposalStart accessId={accessId} serviceKey={defaultService} initialImport={initialImport} onCreated={onReuseCreated} onBlank={() => setStartHidden(true)} compact />
          )}
        </div>
      )}

      {/* Once building — a clean "+ Add Service" menu (no empty select box). */}
      {!readOnly && !servicesEmpty && (
        <div className="prop-tabs">
          <ServiceAdder label="+ Add Service" onPick={addService} />
        </div>
      )}


      {/* Waiver tool — comp select line items off the invoice. Only shows items that carry value. */}
      {!readOnly && waivable.length > 0 && (
        <div className="prop-waiver">
          <button type="button" className="prop-waiver-head" onClick={() => setWaiveOpen((v) => !v)}>
            <span className="prop-chev">{waiveOpen ? "▾" : "▸"}</span>
            <span>Waive items</span>
            {waivedCount > 0 && <span className="prop-waiver-count">{waivedCount} waived</span>}
          </button>
          {waiveOpen && (
            <div className="prop-waiver-body">
              <div className="prop-waiver-bulk">
                <button type="button" onClick={() => waiveAll(true)}>Waive all</button>
                <button type="button" onClick={() => waiveAll(false)}>Reset all</button>
              </div>
              {waivable.map(({ svcLabel, it }) => (
                <label key={it.id} className={`prop-waiver-row${it.waived ? " on" : ""}`}>
                  <input type="checkbox" checked={!!it.waived} onChange={(e) => setWaived(it.id, e.target.checked)} />
                  <span className="prop-waiver-name">{it.name || "Untitled item"}<span className="prop-waiver-svc">{svcLabel}</span></span>
                  <span className="prop-waiver-amt">{it.waived ? "Waived" : money(itemTotal({ ...it, waived: false }))}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pricing engine + payment terms — revealed only once there's something to price. Before that, a single
          quiet line stands in for the whole $0 subtotal→discount→tax→total→plan→deposit stack. */}
      {!priceable ? (!readOnly && <div className="prop-price-hint">Pricing will appear after you add a service.</div>) : (
      <div className="prop-totals">
        {(!readOnly || hasAdjustments) && (
          <div className="prop-trow"><span>Subtotal</span><b>{money(totals.sub)}</b></div>
        )}
        {(!readOnly || totals.discount > 0) && (
          <div className="prop-trow">
            <span>Discount</span>
            {readOnly ? <b>{totals.discount > 0 ? `−${money(totals.discount)}` : "—"}</b> : (
              <span className="prop-adj">
                {totals.discount > 0 && <b className="prop-minus">−{money(totals.discount)}</b>}
                <button type="button" className={`prop-tax-btn${disc.type === "flat" ? " on" : ""}`} onClick={() => setDiscount({ type: "flat" })}>$</button>
                <button type="button" className={`prop-tax-btn${disc.type === "pct" ? " on" : ""}`} onClick={() => setDiscount({ type: "pct" })}>%</button>
                <input className="tin" type="number" min="0" step="0.01" value={disc.value || 0} onChange={(e) => setDiscount({ value: e.target.value })} />
              </span>
            )}
          </div>
        )}
        {(!readOnly || totals.pcpCredit > 0) && (
          <div className="prop-trow">
            <span>PCP Credit</span>
            {readOnly ? <b>{totals.pcpCredit > 0 ? `−${money(totals.pcpCredit)}` : "—"}</b> : (
              <span className="prop-adj">
                {totals.pcpCredit > 0 && <b className="prop-minus">−{money(totals.pcpCredit)}</b>}
                <button type="button" className={`prop-tax-btn${pcp.type === "pct" && +pcp.value === 5 ? " on" : ""}`} onClick={() => setPcp({ type: "pct", value: +pcp.value === 5 ? 0 : 5 })}>5%</button>
                <button type="button" className={`prop-tax-btn${pcp.type === "pct" && +pcp.value === 10 ? " on" : ""}`} onClick={() => setPcp({ type: "pct", value: +pcp.value === 10 ? 0 : 10 })}>10%</button>
                <input className="tin" type="number" min="0" max="10" step="0.5" title="Credit % (2–10%)" value={pcp.value || 0} onChange={(e) => setPcp({ type: "pct", value: e.target.value })} />
              </span>
            )}
          </div>
        )}
        {(!readOnly || hasTax) && (
          <div className="prop-trow">
            <span>Tax{readOnly ? ` · ${taxRate}%` : ""}</span>
            {readOnly ? <b>{money(totals.tax)}</b> : (
              <span className="prop-adj">
                <button type="button" className={`prop-tax-btn${+taxRate === 6.625 ? " on" : ""}`} onClick={() => { setTaxRate(+taxRate === 6.625 ? 0 : 6.625); setDirty(true); }}>NJ</button>
                <button type="button" className={`prop-tax-btn${+taxRate === 8.875 ? " on" : ""}`} onClick={() => { setTaxRate(+taxRate === 8.875 ? 0 : 8.875); setDirty(true); }}>NY</button>
                <input className="tin" type="number" min="0" max="30" step="0.01" value={taxRate} onChange={(e) => { setTaxRate(e.target.value); setDirty(true); }} />
              </span>
            )}
          </div>
        )}

        {/* An approved add-on amends the contract: keep the original proposal total visible and show the
            current contract total below it — never silently rewrite the signed proposal. */}
        {fin.hasAddons ? (
          <>
            <div className="prop-trow"><span>Original proposal</span><b>{money(fin.base)}</b></div>
            <div className="prop-trow prop-trow-addon"><span>Approved addendums{addons.list?.length > 1 ? ` (${addons.list.length})` : ""}</span><b className="prop-plus">+{money(fin.addons)}</b></div>
            <div className="prop-total-big"><span>Current total</span><b>{money(fin.current)}</b></div>
          </>
        ) : (
          <div className="prop-total-big"><span>Total</span><b>{money(totals.grand)}</b></div>
        )}

        {/* Payment plan — the canonical schedule (planScheduleRows) as columns: each milestone's amount sits directly
            under its own term. Read-only shows the plan signature (50 / 50); edit mode shows the preset picker instead.
            Presentation only — the schedule, amounts and deposit all come from the existing canonical values. */}
        <div className="prop-plan">
          <div className="prop-plan-head">
            <span className="prop-plan-lbl">Payment plan</span>
            {readOnly && planSched.length > 0 && <span className="prop-plan-sig">{planSig}</span>}
          </div>
          {!readOnly && (
            <div className="prop-plan-edit">
              <div className="prop-plan-opts">
                <button type="button" className={`prop-plan-btn${plan === "100" || plan === "100_end" ? " on" : ""}`} onClick={() => setPlan("100")}>100</button>
                <button type="button" className={`prop-plan-btn${plan === "50_50" ? " on" : ""}`} onClick={() => setPlan("50_50")}>50 / 50</button>
                <button type="button" className={`prop-plan-btn${plan === "50_30_20" ? " on" : ""}`} onClick={() => setPlan("50_30_20")}>50 / 30 / 20</button>
                <button type="button" className={`prop-plan-btn${plan === "custom" ? " on" : ""}`} onClick={() => setPlan("custom")}>Custom</button>
              </div>
              {(plan === "100" || plan === "100_end") && (
                <div className="prop-plan-timing">
                  <button type="button" className={`prop-time-btn${plan === "100" && !payload.full_date ? " on" : ""}`} onClick={() => setPlan("100")}>Before we begin</button>
                  <button type="button" className={`prop-time-btn${plan === "100_end" && !payload.full_date ? " on" : ""}`} onClick={() => setPlan("100_end")}>Upon completion</button>
                  <label className={`prop-time-date${payload.full_date ? " on" : ""}`} onClick={(e) => { const inp = e.currentTarget.querySelector("input"); try { inp?.showPicker?.(); } catch { } }}>
                    <span>{payload.full_date ? fmtShortDate(payload.full_date) : "By a date"}</span>
                    <input type="date" value={payload.full_date || ""} onChange={(e) => setPlan("100", e.target.value || undefined)} />
                  </label>
                </div>
              )}
            </div>
          )}
          {planSched.length > 0 && !(plan === "custom" && !readOnly) && (
            <div className="prop-plan-cols">
              {planSched.map((r, i) => (
                <div className="prop-plan-col" key={i}>
                  <span className="prop-plan-term"><b>{r.pctLabel}</b>{r.when ? ` ${/begin/i.test(r.when) ? "due before we begin" : r.when}` : ""}</span>
                  {r.amount != null && <span className="prop-plan-amt">{money(r.amount)}</span>}
                </div>
              ))}
            </div>
          )}
          {readOnly && planSched.length === 0 && <b className="prop-plan-ro">{PAYMENT_PLANS[plan]?.label || `${depositPct}% deposit`}</b>}
        </div>
        {plan === "custom" && !readOnly && (
          <div className="prop-cplan">
            <div className="prop-cplan-head">
              <span>Payments</span>
              <div className="prop-cplan-step">
                <button type="button" onClick={() => setCustCount(custRows.length - 1)} disabled={custRows.length <= 2}>−</button>
                <b>{custRows.length}</b>
                <button type="button" onClick={() => setCustCount(custRows.length + 1)} disabled={custRows.length >= 12}>+</button>
              </div>
              <div className="prop-cplan-cad">
                <button type="button" className="prop-cplan-gear" onClick={() => setCadOpen((o) => !o)} title="Payment cadence">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                  {custCadence === "monthly" ? "Monthly" : "Biweekly"}
                </button>
                {cadOpen && (
                  <div className="prop-cplan-cadmenu">
                    <button type="button" className={custCadence === "biweekly" ? "on" : ""} onClick={() => setCadence("biweekly")}>Biweekly</button>
                    <button type="button" className={custCadence === "monthly" ? "on" : ""} onClick={() => setCadence("monthly")}>Monthly</button>
                  </div>
                )}
              </div>
            </div>
            {custRows.map((r, i) => (
              <div className="prop-cplan-row" key={i}>
                <span className="prop-cplan-n">{i + 1}</span>
                <input className="tin" type="number" min="0" max="100" value={r.pct} onChange={(e) => setCustPct(i, e.target.value)} /><span className="prop-cplan-pc">%</span>
                <label className="prop-cplan-date" onClick={(e) => { const inp = e.currentTarget.querySelector("input"); try { inp?.showPicker?.(); } catch { } }}>
                  <span>{fmtShortDate(r.due) || "Set date"}</span>
                  <input type="date" value={r.due || ""} min={i > 0 ? (custRows[i - 1]?.due || undefined) : undefined} onChange={(e) => setCustDue(i, e.target.value)} />
                </label>
                <span className="prop-cplan-amt"><span className="prop-cplan-amt-s">$</span><input className="prop-cplan-amtin" type="number" min="0" step="1" value={Math.round(totals.grand * (+r.pct || 0) / 100)} onChange={(e) => setCustAmt(i, e.target.value)} /></span>
              </div>
            ))}
            <div className={`prop-cplan-sum${custSumPct === 100 ? "" : " bad"}`}>{custSumPct}%{custSumPct !== 100 ? " — should total 100%" : " scheduled"}</div>
          </div>
        )}
        {/* Fallback only: with no renderable schedule, keep the one-line terms + deposit so the plan is never silent.
            When the schedule is showing it already states every milestone — no second "Deposit due" row or terms box. */}
        {planSched.length === 0 && !(plan === "custom" && !readOnly) && (() => {
          const payFull = plan === "100" || plan === "100_end";
          const whenLabel = payload.full_date ? `by ${fmtShortDate(payload.full_date)}` : plan === "100_end" ? "upon completion" : "before we begin";
          const termsText = payFull ? `Paid in full ${whenLabel}.` : (plan !== "custom" ? PAYMENT_PLANS[plan]?.terms : null);
          return (
            <>
              {termsText && <div className="prop-plan-terms">{termsText}</div>}
              <div className="prop-trow"><span>{payFull ? `Due ${whenLabel}` : "Deposit due"}</span><b>{money(payFull ? totals.grand : totals.deposit)}</b></div>
            </>
          );
        })()}
      </div>
      )}

      {/* Actions — drafts auto-save (debounced); the status text replaces a manual Save. Hidden in the empty
          state (nothing to submit/download yet) — the one Submit/Download lives in the top toolbar. */}
      {!embedded && (priceable || readOnly) && (
      <div className="prop-actions">
        <details className="prop-dl" onClick={(e) => { const b = e.target.closest("button[data-mode]"); if (b) { e.currentTarget.removeAttribute("open"); handleDownload(b.dataset.mode); } }}>
          <summary className="prop-mini" title="Download the proposal PDF (with mockup & survey)">{dlBusy ? "Preparing…" : "⭳ Download"}</summary>
          <div className="prop-dl-menu">
            <button type="button" data-mode="standard" disabled={dlBusy}>Standard PDF</button>
            <button type="button" data-mode="detailed" disabled={dlBusy} title="Every package expanded into its components, with a system summary">Detailed PDF</button>
            <button type="button" data-mode="survey" disabled={dlBusy} title="The planner's floors with every device">Site Survey PDF</button>
          </div>
        </details>
        {dlError && <span className="prop-dl-err" role="alert" onAnimationEnd={() => setDlError("")}>{dlError}</span>}
        {!readOnly ? (
          <>
            <span className={`prop-savestat${busy || dirty ? " saving" : ""}`}>
              {authBlocked ? "" : busy ? "Saving…" : dirty ? "Unsaved changes…" : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
            </span>
            {confirmSend ? (
              <>
                <span className="prop-svc-sub" style={{ marginLeft: "auto" }}>Are you sure you want to submit?</span>
                <button className="prop-mini gold" disabled={busy} onClick={send}>Submit</button>
                <button className="prop-mini" onClick={() => setConfirmSend(false)}>Cancel</button>
              </>
            ) : (
              <button className="prop-mini gold" disabled={busy} onClick={() => setConfirmSend(true)} style={{ marginLeft: "auto" }}>Submit</button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="prop-mini" disabled={busy} onClick={emailToCustomer} title="Email the customer a link to their proposal" style={{ marginLeft: "auto" }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: "-2px" }}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
              Email
            </button>
            <button className="prop-mini gold" disabled={busy} onClick={revise}>Revise</button>
          </>
        )}
      </div>
      )}

      {toast && (
        <div className="prop-toast">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {typeof toast === "string" ? toast : (
            <>
              <span>{toast.text}</span>
              <button type="button" className="prop-toast-undo" onClick={() => { toast.onUndo(); setToast(null); }}>Undo</button>
            </>
          )}
        </div>
      )}
      </div>)}

      {/* ONE Configuration Center (top gear): Default Pricing · Service Pricing · Presets. A service's
          "Configure pricing" (if surfaced) opens it straight to the Service tab via setPricingOpen(key).
          Stays open on Save so you can configure more than one tab in a sitting. */}
      {pricingOpen && (
        <ProposalConfig
          services={activeServices}
          startTab={pricingOpen === "__all__" ? "default" : "service"}
          startService={pricingOpen === "__all__"
            ? (activeServices.find((s) => s.key === defaultService)?.key || activeServices[0]?.key || "camera")
            : pricingOpen}
          onClose={() => setPricingOpen(null)}
          onSaved={() => {
            setPriceBookVersion((v) => v + 1); // refreshes every service's quick-add catalog
            setImportMsg("Pricing saved — applies to new imports & items, not what's already placed.");
          }}
        />
      )}
    </div>
    {/* ONE stable action footer (deck/embedded), inline below the document — never floating. Three
        states (draft / published / unsent changes) live in proposal-footer.jsx; handlers are reused
        verbatim (send / revise / setSigSheet / shareProposal / emailToCustomer / handleDownload / setPricingOpen). */}
    {embedded && (
      <ProposalFooter status={status} version={meta?.version ?? null} readOnly={readOnly} authBlocked={authBlocked}
        isStaff={isStaffDock} busy={busy} statusChip={statusChip} saveStateEl={saveStateEl}
        changeState={changeState} confirmSend={confirmSend} setConfirmSend={setConfirmSend}
        onSend={send} onRevise={revise} onRequestSign={() => setSigSheet(true)}
        dlBusy={dlBusy} copied={copied} onDownload={handleDownload} onCopyLink={shareProposal}
        onEmail={emailToCustomer} onConfig={() => setPricingOpen("__all__")}
        viewCount={viewCount} onViews={isStaffDock && onShowViews && ["sent", "accepted", "changes_requested"].includes(status) ? onShowViews : null} />
    )}
    </>
  );
}

// "+ Add Service" as a compact menu button (replaces the empty select box). Opens the service list; picking one
// adds it to the current option. Mirrors FloorImportPicker's dropdown behavior (outside-click close).
function ServiceAdder({ label = "+ Add Service", primary = false, onPick }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onDocDown(e) { if (skipOutsideClose(e)) return; if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);
  return (
    <div className="prop-fp" ref={boxRef}>
      <button type="button" className={`prop-fp-btn${primary ? " primary" : ""}`} onClick={() => setOpen((o) => !o)}>{label}</button>
      {open && (
        <div className="prop-fp-menu prop-svc-menu">
          {/* Every type stays addable — a proposal can carry two camera systems, two custom blocks, etc. */}
          {PROPOSAL_SERVICES.map((s) => (
            <button type="button" key={s.key} className="prop-svc-opt" onClick={() => { onPick(s.key); setOpen(false); }}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Floor-plan import as a checkbox dropdown: check any number of floor plans, then Import
// pulls all of them in at once (rather than one floor per pick, as the old single-select did).
function FloorImportPicker({ floors, onImport, label, primary = false }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e) { if (skipOutsideClose(e)) return; if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  function toggle(idx) {
    setChecked((s) => {
      const next = new Set(s);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }
  function doImport() {
    if (!checked.size) return;
    onImport([...checked]);
    setChecked(new Set());
    setOpen(false);
  }

  return (
    <div className="prop-fp" ref={boxRef}>
      <button type="button" className={`prop-fp-btn${primary ? " primary" : ""}`} onClick={() => setOpen((o) => !o)}>
        {label || "⭳ Import from floor plan"}{checked.size ? ` (${checked.size})` : ""}
      </button>
      {open && (
        <div className="prop-fp-menu">
          {floors.map((f) => (
            <label key={f.index} className="prop-fp-opt">
              <input type="checkbox" checked={checked.has(f.index)} onChange={() => toggle(f.index)} />
              <span>{f.name}</span>
              <span className="prop-fp-count">{f.count} item{f.count !== 1 ? "s" : ""}</span>
            </label>
          ))}
          <div className="prop-fp-acts">
            <button type="button" className="prop-fp-all" onClick={() => setChecked(new Set(floors.map((f) => f.index)))}>Select all</button>
            <button type="button" className="prop-fp-go" disabled={!checked.size} onClick={doImport}>
              Import{checked.size ? ` (${checked.size})` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const SIG_SHEET_CSS = `
.prop-sig-overlay{position:fixed;inset:0;z-index:70;background:rgba(14,18,30,.46);display:flex;align-items:flex-end;justify-content:center;padding:0}
.prop-sig-sheet{width:100%;max-width:460px;background:var(--dv-bg,#fff);border:1px solid var(--dv-line,#E4E4DF);border-bottom:0;border-radius:16px 16px 0 0;box-shadow:0 -12px 40px rgba(14,18,30,.3);padding:14px 16px calc(16px + env(safe-area-inset-bottom))}
@media (min-width:560px){.prop-sig-overlay{align-items:center}.prop-sig-sheet{border-radius:16px;border-bottom:1px solid var(--dv-line,#E4E4DF)}}
.prop-sig-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.prop-sig-title{font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:var(--dv-meta,#787D84);font-weight:700}
.prop-sig-x{border:0;background:transparent;color:var(--dv-meta,#787D84);font-size:20px;line-height:1;cursor:pointer;padding:2px 6px}
.prop-sig-act{display:flex;align-items:center;gap:12px;width:100%;margin:8px 0 0;padding:14px 14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.9rem;font-weight:600;font-family:inherit;cursor:pointer;text-align:left}
.prop-sig-act:hover{border-color:#C9A96E}
.prop-sig-act:disabled{opacity:.5;cursor:default}
.prop-sig-act svg{color:#C9A96E;flex-shrink:0}
.prop-sig-note{font-size:11.5px;color:var(--dv-meta,#787D84);padding:10px 2px 2px}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .prop-sig-sheet{background:#14171f}}
`;


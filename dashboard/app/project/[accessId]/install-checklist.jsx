"use client";
import { useState, useEffect, useRef } from "react";
import { titleCase, techItemTotal } from "../../../lib/proposal";
import { getToolDataAction, saveToolDataAction, getRatesAction } from "./proposal-actions";
import RateLibrary from "./rate-library";
import { ICL_CSS } from "./install-checklist.css.js";
import {
  stepsFor, colorFor, money, fmtLogTime, estHoursFor, weightedInc,
  CAMERA_STEP_PAY, POS_STEP_PAY,
} from "../../../lib/install-checklist-model";

// Install work order + live status. List style: each line has a tappable progress ring (advance
// a step), undo, and a note. It's also a builder for the office/tech — add & delete line items,
// and a $ toggle reveals the technician payout per item + total. The customer sees progress
// only (no editing, no pricing). Step definitions, colors, and pay math live in
// lib/install-checklist-model.js.
const LABOR_RX = /(cat6 drop|termination|mounting|programming|waterproof|cabling|tuning|wire run|setup|\blabor\b)/i;
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const eodTime = (iso) => { if (!iso) return ""; try { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
const DEFAULT_CAMERA_PAY = CAMERA_STEP_PAY.reduce((a, b) => a + b, 0); // $52 fully installed
const DEFAULT_POS_PAY    = POS_STEP_PAY.reduce((a, b) => a + b, 0);    // $52 fully installed
const DEFAULT_NVR_PAY    = 10; // NVR setup payout
// Client-side mirror of the DB default rates — the effective rates (from the library, per assigned
// tech) override these at runtime.
const DEFAULT_RATES = { cam_drop: CAMERA_STEP_PAY[0], cam_mgmt: CAMERA_STEP_PAY[1], cam_term: CAMERA_STEP_PAY[2], cam_mount: CAMERA_STEP_PAY[3], pos_drop: POS_STEP_PAY[0], pos_mgmt: POS_STEP_PAY[1], pos_term: POS_STEP_PAY[2], pos_install: POS_STEP_PAY[3], nvr_setup: DEFAULT_NVR_PAY };
// Camera bulk-fill targets — jump every camera up to a milestone in one tap.
const CAMERA_BULK = [
  { label: "Wiring", to: 2 },       // Cable Dropped + Cable Managed
  { label: "Terminated", to: 3 },
  { label: "Mounted", to: 4 },
  { label: "All online", to: 5 },
];
let _cid = 0;
const newId = () => `c${Date.now().toString(36)}${_cid++}`;

export default function InstallChecklist({ accessId, proposal, customerName, customerAddress, role, readOnly, userName, onProgress }) {
  const isCustomer = role === "customer";
  const canEdit  = !readOnly && !isCustomer;   // tech / admin / manager may mark + add + delete
  const canPrice = !isCustomer;                // can SEE pricing (tech + office)
  const canEditPay = canEdit && role !== "tech"; // can CHANGE pay amounts — office only, never tech

  // Items derived from the accepted option — carries tech payout when the proposal has it.
  const derived = (() => {
    const out = [];
    const opt = proposal?.payload?.options?.find(o => o.id === proposal.selected_option) || proposal?.payload?.options?.[0];
    (opt?.services || []).forEach((s) => {
      (s.items || []).forEach((it) => {
        const hasSub = (it.sub || []).length > 0;
        const tech = hasSub ? techItemTotal(it) : (+(it.qty ?? 1) || 1) * (+it.techPrice || 0);
        if (s.key === "camera" && hasSub) { out.push({ id: it.id, name: it.name, outdoor: it.outdoor, type: "camera", tech, derived: true }); return; }
        // Toast POS / network devices (service key "toast"/"pos") run the cable-drop install path.
        if ((s.key === "toast" || s.key === "pos") && hasSub) { out.push({ id: it.id, name: it.name, outdoor: it.outdoor, type: "pos", tech, derived: true }); return; }
        if (/\bnvr\b|recorder/i.test(it.name)) { out.push({ id: it.id, name: it.name, type: "nvr", tech, derived: true }); return; }
        if (!hasSub && !LABOR_RX.test(it.name)) { out.push({ id: it.id, name: it.name, type: "equip", tech, derived: true }); }
      });
    });
    // Only ONE recorder — collapse stale double-NVR data to the highest channel count.
    const nvrs = out.filter((e) => e.type === "nvr");
    if (nvrs.length > 1) {
      const chanOf = (n) => { const m = String(n).match(/(\d+)\s*-?\s*channel/i); return m ? +m[1] : 0; };
      const best = nvrs.reduce((a, b) => (chanOf(b.name) > chanOf(a.name) ? b : a));
      return out.filter((e) => e.type !== "nvr" || e === best);
    }
    return out;
  })();

  const [steps, setSteps]   = useState({});
  const [notes, setNotes]   = useState({});
  const [custom, setCustom] = useState([]);   // added line items
  const [removed, setRemoved] = useState([]); // derived ids the office deleted
  const [payouts, setPayouts] = useState({}); // per-item payout overrides {id: $}
  const [estHours, setEstHours] = useState(null); // office override for the hour estimate
  const [payoutOverride, setPayoutOverride] = useState(null); // admin override of the project total
  const [dayLogs, setDayLogs] = useState([]);  // end-of-day snapshots {date, closed, pay, pct, ...}
  const [requests, setRequests] = useState([]); // tech-submitted line-item requests awaiting pricing
  const [reqAdding, setReqAdding] = useState(false);
  const [reqDraft, setReqDraft] = useState({ name: "", type: "equip", note: "" });
  const [reqPrice, setReqPrice] = useState({}); // admin's price entry per pending request {id: $}
  const [stepLog, setStepLog] = useState([]); // audit log: who completed which step + when
  const [eodDate, setEodDate] = useState(""); // chosen End-of-Day date (preset to today on mount)
  const [logOpen, setLogOpen] = useState(false);
  const [rates, setRates] = useState(DEFAULT_RATES); // effective rates for the assigned tech
  const [ratesOpen, setRatesOpen] = useState(false);
  const assignedTech = proposal?.tech_signed_name || null;
  // Load the assigned technician's effective rates (company defaults ← default ← per-tech override).
  const loadRates = () => getRatesAction(accessId, assignedTech).then((r) => { if (r?.ok && r.effective) setRates({ ...DEFAULT_RATES, ...r.effective }); }).catch(() => {});
  useEffect(() => { if (!isCustomer) loadRates(); /* eslint-disable-next-line */ }, [accessId, assignedTech]);
  // Preset the End-of-Day date to today (client-only to avoid an SSR/hydration date mismatch).
  useEffect(() => { setEodDate((v) => v || localToday()); }, []);
  const [editNote, setEditNote] = useState(null);
  const [showPrice, setShowPrice] = useState(role === "tech"); // tech sees their pay by default
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", type: "equip", tech: "" });
  const [confirmDel, setConfirmDel] = useState(null); // item id pending delete confirmation
  const [confirmEod, setConfirmEod] = useState(null); // EOD entry pending delete confirmation
  const [hist, setHist] = useState([]);   // undo stack of prior snapshots
  const saveTimer = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    let live = true;
    getToolDataAction(accessId, "install").then((r) => {
      if (!live || !r?.ok || !r.saved?.data) return;
      try {
        const d = JSON.parse(r.saved.data);
        setSteps(d.steps || {}); setNotes(d.notes || {}); setCustom(d.custom || []); setRemoved(d.removed || []);
        setPayouts(d.payouts || {}); setEstHours(d.estHours ?? null);
        setPayoutOverride(d.payoutOverride ?? null); setDayLogs(d.dayLogs || []); setRequests(d.requests || []); setStepLog(d.stepLog || []);
      } catch { /* bad blob */ }
    }).catch(() => {});
    return () => { live = false; if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [accessId]);

  // Approved job-site add-ons become installable lines in the checklist (expanded by quantity).
  const [addonRaw, setAddonRaw] = useState([]);
  useEffect(() => {
    let live = true;
    getToolDataAction(accessId, "addendum").then((r) => {
      if (!live || !r?.ok || !r.saved?.data) return;
      try { setAddonRaw((JSON.parse(r.saved.data).addendums || []).filter((a) => a.status === "approved")); } catch { /* bad blob */ }
    }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);
  const addonItems = addonRaw.flatMap((a) => (a.items || []).flatMap((it) => {
    const qty = Math.max(1, +it.qty || 1);
    return Array.from({ length: qty }, (_, n) => ({ id: `${it.id}#${n}`, name: qty > 1 ? `${it.name} #${n + 1}` : it.name, type: it.type || "equip", tech: +it.techPay || 0, addon: true }));
  }));

  // Debounced save whenever any editable state changes (skip the initial hydrate).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (isCustomer) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveToolDataAction(accessId, "install", JSON.stringify({ steps, notes, custom, removed, payouts, estHours, payoutOverride, dayLogs, requests, stepLog })); }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, notes, custom, removed, payouts, estHours, payoutOverride, dayLogs, requests, stepLog]);

  const items = [...derived.filter(d => !removed.includes(d.id)), ...addonItems.filter(a => !removed.includes(a.id)), ...custom];
  // Undo: snapshot the full editable state before each change; the header Undo pops it back.
  const snap = () => ({ steps, notes, custom, removed, payouts, estHours, payoutOverride, requests, stepLog });
  const pushHist = () => setHist(h => [...h.slice(-24), snap()]);
  const undo = () => setHist(h => {
    if (!h.length) return h;
    const prev = h[h.length - 1];
    setSteps(prev.steps); setNotes(prev.notes); setCustom(prev.custom);
    setRemoved(prev.removed); setPayouts(prev.payouts); setEstHours(prev.estHours);
    if (prev.payoutOverride !== undefined) setPayoutOverride(prev.payoutOverride);
    if (prev.requests !== undefined) setRequests(prev.requests);
    if (prev.stepLog !== undefined) setStepLog(prev.stepLog);
    setConfirmDel(null);
    return h.slice(0, -1);
  });
  // Who's acting right now — used to attribute each completed step in the work-order log.
  const actor = userName || (role === "tech" ? "Technician" : "Office");
  const nowISO = () => new Date().toISOString();
  // Log the steps newly completed on an item (crossing indexes [from, to)) to the audit log.
  const logAdvance = (item, from, to) => {
    if (to <= from) return;
    const labels = stepsFor(item.type);
    const add = [];
    for (let c = from; c < to; c++) add.push({ item: item.id, name: item.name, type: item.type, stepIdx: c, step: labels[c], by: actor, at: nowISO() });
    setStepLog(l => [...l, ...add]);
  };
  // Remove log entries for an item at/after a step index (a step was undone / reset).
  const logRevert = (itemId, fromStep) => setStepLog(l => l.filter(e => !(e.item === itemId && e.stepIdx >= fromStep)));

  // Per-step pay weights come from the assigned tech's effective rates (the Rate Library), so
  // payouts vary tech-to-tech. camPay[4]=0 (Camera Online is a $0 verification step).
  const camPay = [+rates.cam_drop || 0, +rates.cam_mgmt || 0, +rates.cam_term || 0, +rates.cam_mount || 0, 0];
  const posPay = [+rates.pos_drop || 0, +rates.pos_mgmt || 0, +rates.pos_term || 0, +rates.pos_install || 0];
  const WPAY = { camera: camPay, pos: posPay };
  const defCameraPay = camPay.reduce((a, b) => a + b, 0);
  const defPosPay = posPay.reduce((a, b) => a + b, 0);
  const defNvrPay = +rates.nvr_setup || 0;
  // Defaults from the rate library per camera / POS device / NVR; other equipment uses the proposal
  // price. The office can edit any individual line.
  const typeDefault = (type) => (type === "camera" ? defCameraPay : type === "pos" ? defPosPay : type === "nvr" ? defNvrPay : 0);
  const payoutOf = (item) => (payouts[item.id] != null ? +payouts[item.id]
    // Add-on lines carry the office-set payout from the addendum; fall back to the type rate if 0.
    : item.addon ? (+item.tech > 0 ? +item.tech : typeDefault(item.type))
    : item.type === "camera" ? defCameraPay
    : item.type === "pos" ? defPosPay
    : item.type === "nvr" ? defNvrPay
    : (+item.tech || 0));
  const setPayout = (id, val) => setPayouts(p => ({ ...p, [id]: val === "" ? "" : +val }));
  // $ earned toward a line at `done` steps, using the assigned tech's weights.
  const earnedForItem = (type, done, payout) => {
    const steps = stepsFor(type).length;
    const d = Math.min(done, steps);
    const w = WPAY[type];
    if (w) { const sum = w.reduce((a, b) => a + b, 0) || 1; return payout * (w.slice(0, d).reduce((a, b) => a + b, 0) / sum); }
    return steps ? payout * (d / steps) : 0;
  };

  const bump = (item, dir) => {
    if (!canEdit) return;
    const max = stepsFor(item.type).length;
    const cur = Math.min(steps[item.id] || 0, max);
    const next = Math.max(0, Math.min(max, cur + dir));
    if (next === cur) return;
    pushHist();
    setSteps(s => ({ ...s, [item.id]: next }));
    if (next > cur) logAdvance(item, cur, next); else logRevert(item.id, next);
  };
  const setNote = (id, text) => setNotes(n => ({ ...n, [id]: text }));
  const removeItem = (item) => {
    if (!canEdit) return;
    pushHist();
    if (item.derived || item.addon) setRemoved(r => [...r, item.id]);
    else setCustom(c => c.filter(x => x.id !== item.id));
    setSteps(s => { const n = { ...s }; delete n[item.id]; return n; });
    setConfirmDel(null);
  };
  const addItem = () => {
    const name = draft.name.trim(); if (!name) return;
    pushHist();
    setCustom(c => [...c, { id: newId(), name, type: draft.type, tech: +draft.tech || 0 }]);
    setDraft({ name: "", type: "equip", tech: "" }); setAdding(false);
  };
  // Add-line-item request flow: the tech asks for an addition (no pay set); the office prices it
  // and approves → it drops into the work order as a payable line credited to the requester.
  const submitRequest = () => {
    const name = reqDraft.name.trim(); if (!name || !canEdit) return;
    pushHist();
    setRequests(r => [...r, { id: newId(), name, type: reqDraft.type, note: reqDraft.note.trim(), by: userName || (role === "tech" ? "Technician" : "Staff"), at: new Date().toISOString(), status: "pending" }]);
    setReqDraft({ name: "", type: "equip", note: "" }); setReqAdding(false);
  };
  const approveRequest = (req) => {
    if (!canEditPay) return;
    const pay = +reqPrice[req.id] || 0;
    pushHist();
    setCustom(c => [...c, { id: newId(), name: req.name, type: req.type, tech: pay, requestedBy: req.by }]);
    setRequests(r => r.filter(x => x.id !== req.id));
    setReqPrice(p => { const n = { ...p }; delete n[req.id]; return n; });
  };
  const declineRequest = (req) => {
    if (!canEditPay) return;
    pushHist();
    setRequests(r => r.filter(x => x.id !== req.id));
  };
  const pendingReqs = requests.filter(r => r.status === "pending");
  // Equipment (NVR / drives / displays) on top, then cameras, then POS, then approved add-ons.
  const equipment = items.filter(i => !i.addon && (i.type === "nvr" || i.type === "equip"));
  const cameras   = items.filter(i => !i.addon && i.type === "camera");
  const posItems  = items.filter(i => !i.addon && i.type === "pos");
  const addonInstalls = items.filter(i => i.addon);
  const dropItems = items.filter(i => i.type === "camera" || i.type === "pos");   // cable-drop path (incl. add-ons)
  // Bulk fill: bring every cable-drop item UP TO a milestone (never regress, cap at its last step).
  const bulkCameras = (to) => { if (!canEdit || !dropItems.length) return; pushHist(); dropItems.forEach(c => { const max = stepsFor(c.type).length; const cur = Math.min(steps[c.id] || 0, max); const nx = Math.min(Math.max(cur, to), max); if (nx > cur) logAdvance(c, cur, nx); }); setSteps(s => { const n = { ...s }; dropItems.forEach(c => { n[c.id] = Math.min(Math.max(n[c.id] || 0, to), stepsFor(c.type).length); }); return n; }); };
  const completeAll = () => { if (!canEdit || !items.length) return; pushHist(); items.forEach(it => { const max = stepsFor(it.type).length; const cur = Math.min(steps[it.id] || 0, max); if (max > cur) logAdvance(it, cur, max); }); setSteps(s => { const n = { ...s }; items.forEach(it => { n[it.id] = stepsFor(it.type).length; }); return n; }); };
  const resetAll = () => { if (!canEdit || !items.length) return; pushHist(); setStepLog([]); setSteps(s => { const n = { ...s }; items.forEach(it => { n[it.id] = 0; }); return n; }); };

  const doneOf = (it) => Math.min(steps[it.id] || 0, stepsFor(it.type).length);
  const totalSteps = items.reduce((a, it) => a + stepsFor(it.type).length, 0);
  const doneSteps  = items.reduce((a, it) => a + doneOf(it), 0);
  const stepPct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;
  const allDone = totalSteps > 0 && doneSteps === totalSteps;
  // Report completion up so the stage's tool-flow step can flip to a green check when every
  // device is fully installed (raw step completion — role-independent, unlike the pay %).
  const onProgRef = useRef(onProgress); onProgRef.current = onProgress;
  useEffect(() => { onProgRef.current?.({ allDone, pct: stepPct, items: items.length }); }, [allDone, stepPct, items.length]);
  // Pay-weighted progress: every step is worth its slice of the line's payout, so progress tracks
  // dollars earned, not raw step count. This is the % the tech and office see.
  const payTotalItems = items.reduce((a, it) => a + (payoutOf(it) || 0), 0);
  const payEarnedItems = items.reduce((a, it) => a + earnedForItem(it.type, doneOf(it), payoutOf(it)), 0);
  const payFraction = payTotalItems > 0 ? payEarnedItems / payTotalItems : 0;
  // The office can override the headline project payout; earned/hours scale to whatever's shown.
  const estPayout = payoutOverride != null && payoutOverride !== "" ? +payoutOverride : payTotalItems;
  const earnedShown = estPayout * payFraction;
  const payPct = Math.round(payFraction * 100);
  const pct = canPrice ? payPct : stepPct;   // customers see plain work progress; office sees pay
  const nvrCount = items.filter(i => i.type === "nvr").length;
  const hoursVal = estHours != null && estHours !== "" ? estHours : estHoursFor(cameras.length, nvrCount, posItems.length);
  const hourlyRate = hoursVal > 0 ? estPayout / hoursVal : 0;
  const hoursDone = Math.round(hoursVal * payFraction * 10) / 10;
  const hoursLeft = Math.round((hoursVal - hoursDone) * 10) / 10;
  const itemsClosed = items.filter(it => doneOf(it) >= stepsFor(it.type).length).length;

  // Pay follows completion: each logged step credits its slice of the line's payout to whoever did
  // it (weightedInc uses this tech's WPAY weights). Sum by person for the per-technician breakdown.
  const payByTech = (() => {
    const m = {};
    stepLog.forEach((e) => {
      const it = items.find((x) => x.id === e.item); if (!it) return;
      m[e.by] = (m[e.by] || 0) + weightedInc(it.type, e.stepIdx, payoutOf(it), WPAY);
    });
    return Object.entries(m).map(([name, amt]) => ({ name, amt })).sort((a, b) => b.amt - a.amt);
  })();

  // End of day — snapshot progress and the delta since the last close, dated to the chosen day
  // (defaults to today so a tech can still log yesterday's work a day late).
  function closeDay() {
    if (!canEdit) return;
    const d = eodDate ? new Date(eodDate + "T12:00:00") : new Date();
    const date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const prev = dayLogs[dayLogs.length - 1] || null;
    setDayLogs([...dayLogs, {
      date, at: new Date().toISOString(), for: eodDate || null, by: actor,
      closed: itemsClosed, pay: Math.round(earnedShown * 100) / 100, pct: payPct,
      closedDelta: itemsClosed - (prev?.closed || 0),
      payDelta: Math.round((earnedShown - (prev?.pay || 0)) * 100) / 100,
    }]);
    setEodDate(localToday());
  }

  const Row = (item) => {
    const stepList = stepsFor(item.type);
    const done = Math.min(steps[item.id] || 0, stepList.length);
    const complete = done >= stepList.length;
    const note = notes[item.id] || "";
    const color = colorFor(item.type);
    const nm = titleCase(item.name);
    const noteOpen = editNote === item.id;
    const confirming = confirmDel === item.id;
    return (
      <div key={item.id} className={`icl-row${complete ? " done" : ""}`} style={{ "--icl-c": color }}>
        <div className="icl-main">
          <button type="button" className="icl-ring" disabled={!canEdit} onClick={() => bump(item, +1)} title={complete ? "Complete" : `Tap: ${stepList[done]}`}>
            <ProgressRing done={done} total={stepList.length} color={color} complete={complete} />
          </button>
          <div className="icl-info">
            <span className="icl-name">{nm}</span>
            <span className={`icl-step${complete ? " done" : ""}`}>
              {complete ? "✓ Complete" : done === 0 ? <>Next: <b>{stepList[done]}</b></> : <><span className="icl-step-done">{stepList[done - 1]} ✓</span> · Next: <b>{stepList[done]}</b></>}
            </span>
          </div>
          {canPrice && showPrice && (() => {
            const total = payoutOf(item);
            const earned = earnedForItem(item.type, done, total);
            return (
              <div className="icl-paywrap">
                {canEditPay && <span className="icl-pay-edit">$<input className="icl-pay-in" type="number" min="0" step="1" value={total} onFocus={pushHist} onChange={(e) => setPayout(item.id, e.target.value)} title="Payout for this line" /></span>}
                {/* Pay progress: $ earned so far out of the line's payout (e.g. $10 / $52). */}
                <span className={`icl-earn${complete ? " done" : ""}`} title="Earned so far / line payout">
                  {money(earned)}<span className="icl-earn-of">/{money(total)}</span>
                </span>
              </div>
            );
          })()}
          <div className="icl-acts">
            {/* Notes are internal — hidden from the customer's view-only progress. */}
            {!isCustomer && (
            <button type="button" className={`icl-noteb${note ? " has" : ""}`} title={note ? "Edit note" : "Add note"} onClick={() => setEditNote(noteOpen ? null : item.id)}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
            </button>
            )}
            {done > 0 && canEdit && (
              <button type="button" className="icl-undo" title="Undo last step" onClick={() => bump(item, -1)}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
              </button>
            )}
            {canEdit && (
              <button type="button" className="icl-del" title="Remove line item" onClick={() => setConfirmDel(confirming ? null : item.id)}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
        </div>
        {confirming && (
          <div className="icl-confirm">
            <span>Delete <b>{nm}</b>?</span>
            <button type="button" className="icl-cf-yes" onClick={() => removeItem(item)}>Delete</button>
            <button type="button" className="icl-cf-no" onClick={() => setConfirmDel(null)}>Cancel</button>
          </div>
        )}
        {!isCustomer && (noteOpen || note) && (
          <div className="icl-note">
            {!canEdit ? (
              <span className="icl-note-ro">{note || "—"}</span>
            ) : noteOpen ? (
              <textarea className="icl-note-in" rows={2} autoFocus placeholder="Note for this item — access, issue, model, etc." value={note} onChange={(e) => setNote(item.id, e.target.value)} onBlur={() => setEditNote(null)} />
            ) : (
              <button type="button" className="icl-note-show" onClick={() => setEditNote(item.id)}>📝 {note}</button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="icl-root">
      <style>{ICL_CSS}</style>
      <div className="icl-head">
        <div className="icl-head-l">
          <span className="icl-title">Installation Work Order</span>
          <span className="icl-sub">{customerName || "Customer"}{customerAddress ? ` · ${customerAddress}` : ""}</span>
        </div>
        <div className="icl-head-r">
          {canEditPay && (
            <button type="button" className="icl-undoall" onClick={() => setRatesOpen(true)} title="Edit the work order rate library"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px", marginRight: 4 }}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Rates</button>
          )}
          {canEdit && hist.length > 0 && (
            <button type="button" className="icl-undoall" onClick={undo} title="Undo last change">↺ Undo</button>
          )}
          {canPrice && (
            <button type="button" className={`icl-pricebtn${showPrice ? " on" : ""}`} onClick={() => setShowPrice(v => !v)} title="Show technician payout">
              {showPrice ? "$ Hide pay" : "$ Show pay"}
            </button>
          )}
          <div className="icl-progress">
            <span className={`icl-pct${allDone ? " done" : ""}`}>{allDone ? "✓ Complete" : `${pct}%`}</span>
            <div className="icl-bar"><div className="icl-bar-fill" style={{ width: `${pct}%` }} /></div>
          </div>
        </div>
      </div>

      {/* Estimated project payout + hours — internal only; payout figure follows the pay toggle. */}
      {canPrice && (
        <div className="icl-summary">
          {showPrice && (
            <div className="icl-sum-cell">
              <span className="icl-sum-k">{role === "tech" ? "Your project payout" : "Est. project payout"}</span>
              {canEditPay ? (
                <span className="icl-sum-v">$<input className="icl-hrs-in wide" type="number" min="0" step="1" value={estPayout} onFocus={pushHist}
                  onChange={(e) => setPayoutOverride(e.target.value === "" ? null : +e.target.value)} title="Override the project payout" /></span>
              ) : (
                <span className="icl-sum-v">{money(estPayout)}</span>
              )}
              {cameras.length > 0 && <span className="icl-sum-sub">{cameras.length} cameras · {money(defCameraPay)}/ea{assignedTech ? ` · ${assignedTech}'s rate` : ""}{payoutOverride != null && payoutOverride !== "" ? " · edited" : ""}</span>}
            </div>
          )}
          <div className="icl-sum-cell">
            <span className="icl-sum-k">Est. project hours</span>
            {canEditPay ? (
              <span className="icl-sum-v"><input className="icl-hrs-in" type="number" min="0" step="0.5" value={hoursVal} onFocus={pushHist} onChange={(e) => setEstHours(e.target.value === "" ? "" : +e.target.value)} /> hrs</span>
            ) : (
              <span className="icl-sum-v">{hoursVal} hrs</span>
            )}
          </div>
          {showPrice && (
            <div className="icl-sum-cell">
              <span className="icl-sum-k">Avg hourly rate</span>
              <span className="icl-sum-v">{money(hourlyRate)}<span className="icl-sum-unit">/hr</span></span>
            </div>
          )}
        </div>
      )}

      {/* Live pay progress — $ earned, %, hours done/left, line items closed. Tech sees their own. */}
      {canPrice && showPrice && items.length > 0 && (
        <div className="icl-payprog">
          <div className="icl-pp-top">
            <span className="icl-pp-earned">{money(earnedShown)}<span className="icl-pp-of"> of {money(estPayout)} earned</span></span>
            <span className="icl-pp-pct">{payPct}%</span>
          </div>
          <div className="icl-pp-bar"><div className="icl-pp-fill" style={{ width: `${payPct}%` }} /></div>
          <div className="icl-pp-stats">
            <span><b>{hoursDone}</b> hrs done · <b>{hoursLeft}</b> hrs left</span>
            <span><b>{itemsClosed}</b>/{items.length} line items closed</span>
          </div>
        </div>
      )}

      {!items.length ? (
        <div className="icl-empty">No line items yet.{canEdit ? " Add one below." : ""}</div>
      ) : (
        <>
          {/* Quick-fill: complete the whole order or every camera step in one tap. */}
          {canEdit && (
            <div className="icl-bulk">
              <span className="icl-bulk-lbl">Quick fill:</span>
              {dropItems.length > 0 && CAMERA_BULK.map((b) => (
                <button key={b.label} type="button" className="icl-bulk-btn" onClick={() => bulkCameras(b.to)} title={`Mark all cameras & POS: ${b.label}`}>{b.label}</button>
              ))}
              <button type="button" className="icl-bulk-btn all" onClick={completeAll} title="Mark every line item complete">Complete all</button>
              <button type="button" className="icl-bulk-btn reset" onClick={resetAll} title="Reset every line item back to the start">Reset all</button>
            </div>
          )}
          {equipment.length > 0 && <div className="icl-sec">Equipment &amp; Recorders <span className="icl-sec-n">{equipment.length}</span></div>}
          <div className="icl-list">{equipment.map(Row)}</div>
          {cameras.length > 0 && <div className="icl-sec">Cameras <span className="icl-sec-n">{cameras.length}</span></div>}
          <div className="icl-list">{cameras.map(Row)}</div>
          {posItems.length > 0 && <div className="icl-sec">POS &amp; Network <span className="icl-sec-n">{posItems.length}</span></div>}
          <div className="icl-list">{posItems.map(Row)}</div>
          {addonInstalls.length > 0 && <div className="icl-sec icl-sec-addon">Add-on Installs <span className="icl-sec-n">{addonInstalls.length}</span></div>}
          <div className="icl-list">{addonInstalls.map(Row)}</div>
        </>
      )}

      {/* Pending add-line-item requests — tech asks, office prices & approves. */}
      {canPrice && pendingReqs.length > 0 && (
        <div className="icl-reqs">
          <div className="icl-sec">Line-item Requests <span className="icl-sec-n">{pendingReqs.length}</span></div>
          {pendingReqs.map((req) => (
            <div key={req.id} className="icl-req">
              <div className="icl-req-info">
                <span className="icl-req-name">{titleCase(req.name)} <span className="icl-req-type">{req.type}</span></span>
                <span className="icl-req-meta">Requested by {req.by}{req.note ? ` — ${req.note}` : ""}</span>
              </div>
              {canEditPay ? (
                <div className="icl-req-act">
                  <span className="icl-pay-edit">$<input className="icl-pay-in" type="number" min="0" step="1" placeholder="0" value={reqPrice[req.id] ?? ""} onChange={(e) => setReqPrice(p => ({ ...p, [req.id]: e.target.value }))} title="Set the payout" /></span>
                  <button type="button" className="icl-req-yes" onClick={() => approveRequest(req)}>Approve</button>
                  <button type="button" className="icl-req-no" onClick={() => declineRequest(req)}>Decline</button>
                </div>
              ) : (
                <span className="icl-req-wait">Awaiting pricing</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Office adds line items directly (with payout); technicians submit a request instead. */}
      {canEditPay && (adding ? (
        <div className="icl-addform">
          <input className="icl-add-in" placeholder="Line item name (e.g. Extra Camera, 4TB Drive, 55&quot; Display)" value={draft.name} autoFocus onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addItem()} />
          <select className="icl-add-sel" value={draft.type} onChange={(e) => setDraft(d => ({ ...d, type: e.target.value }))}>
            <option value="camera">Camera</option><option value="nvr">NVR / Recorder</option><option value="pos">POS / Network</option><option value="equip">Equipment</option>
          </select>
          <input className="icl-add-pay" type="number" min="0" step="1" placeholder="Payout $" value={draft.tech} onChange={(e) => setDraft(d => ({ ...d, tech: e.target.value }))} />
          <button type="button" className="icl-add-save" disabled={!draft.name.trim()} onClick={addItem}>Add</button>
          <button type="button" className="icl-add-cancel" onClick={() => { setAdding(false); setDraft({ name: "", type: "equip", tech: "" }); }}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="icl-addbtn" onClick={() => setAdding(true)}>+ Add line item</button>
      ))}

      {/* Technician: request an addition — the office sets the pay. */}
      {canEdit && !canEditPay && (reqAdding ? (
        <div className="icl-addform">
          <input className="icl-add-in" placeholder="What needs adding? (e.g. Extra PoE injector, extra drop)" value={reqDraft.name} autoFocus onChange={(e) => setReqDraft(d => ({ ...d, name: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && submitRequest()} />
          <select className="icl-add-sel" value={reqDraft.type} onChange={(e) => setReqDraft(d => ({ ...d, type: e.target.value }))}>
            <option value="camera">Camera</option><option value="nvr">NVR / Recorder</option><option value="pos">POS / Network</option><option value="equip">Equipment / Other</option>
          </select>
          <input className="icl-add-in" style={{ flex: "1 1 160px" }} placeholder="Note (why / where)" value={reqDraft.note} onChange={(e) => setReqDraft(d => ({ ...d, note: e.target.value }))} />
          <button type="button" className="icl-add-save" disabled={!reqDraft.name.trim()} onClick={submitRequest}>Request</button>
          <button type="button" className="icl-add-cancel" onClick={() => { setReqAdding(false); setReqDraft({ name: "", type: "equip", note: "" }); }}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="icl-addbtn req" onClick={() => setReqAdding(true)}>+ Request line item</button>
      ))}

      {/* Tech sees the status of their own pending requests. */}
      {canEdit && !canEditPay && pendingReqs.length > 0 && (
        <div className="icl-eod-log" style={{ marginTop: 10 }}>
          {pendingReqs.map((req) => (
            <div key={req.id} className="icl-eod-row">
              <span className="icl-eod-date">{titleCase(req.name)}</span>
              <span className="icl-req-wait">Requested — awaiting pricing</span>
            </div>
          ))}
        </div>
      )}

      {/* Payout by technician — pay follows completion, so each person is credited what they did. */}
      {canPrice && showPrice && payByTech.length > 0 && (
        <div className="icl-bytech">
          <span className="icl-bytech-hd">Payout by technician</span>
          {payByTech.map((t) => (
            <div key={t.name} className="icl-bytech-row"><span>{t.name}</span><b>{money(t.amt)}</b></div>
          ))}
        </div>
      )}

      {/* Work Order Log — who completed which step, when. Internal only. */}
      {canPrice && stepLog.length > 0 && (
        <div className="icl-wolog">
          <button type="button" className="icl-wolog-hd" onClick={() => setLogOpen(o => !o)}>
            <span>Work Order Log <span className="icl-sec-n">{stepLog.length}</span></span>
            <span className="icl-wolog-caret">{logOpen ? "▲" : "▼"}</span>
          </button>
          {logOpen && (
            <div className="icl-wolog-list">
              {stepLog.slice().reverse().slice(0, 60).map((e, i) => (
                <div key={(e.at || "") + i} className="icl-wolog-row">
                  <span className="icl-wolog-dot" style={{ background: colorFor(e.type) }} />
                  <span className="icl-wolog-body">
                    <span className="icl-wolog-main"><b>{e.by}</b> · {e.step} — {titleCase(e.name)}</span>
                    <span className="icl-wolog-time">{fmtLogTime(e.at)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* End of Day — snapshot what got closed; date defaults to today but can be backdated. */}
      {canEdit && items.length > 0 && (
        <div className="icl-eod">
          <div className="icl-eod-bar">
            <button type="button" className="icl-eod-btn" onClick={closeDay}>✓ End of Day</button>
            <label className="icl-eod-for">for <input type="date" className="icl-eod-date-in" value={eodDate} onChange={(e) => setEodDate(e.target.value)} title="Backdate this close if needed" /></label>
          </div>
          {dayLogs.length > 0 && (
            <div className="icl-eod-log">
              {dayLogs.slice().reverse().map((d, i) => (
                <div key={d.at || i} className="icl-eod-row">
                  <span className="icl-eod-date">{d.date}{d.at ? <span className="icl-eod-time"> · {eodTime(d.at)}</span> : null}</span>
                  <span className="icl-eod-meta">
                    {d.closedDelta >= 0 ? "+" : ""}{d.closedDelta} closed · {money(d.payDelta)} earned
                    <span className="icl-eod-cum"> ({d.closed} total · {d.pct}%{d.by ? ` · ${d.by}` : ""})</span>
                  </span>
                  {canEditPay && (confirmEod === d ? (
                    <span className="icl-eod-confirm">
                      <button type="button" className="icl-eod-yes" onClick={() => { setDayLogs(dayLogs.filter((x) => x !== d)); setConfirmEod(null); }}>Delete</button>
                      <button type="button" className="icl-eod-no" onClick={() => setConfirmEod(null)}>Keep</button>
                    </span>
                  ) : (
                    <button type="button" className="icl-eod-del" title="Delete this end-of-day entry" onClick={() => setConfirmEod(d)}>✕</button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(isCustomer || readOnly) && <div className="icl-ro">Live install progress — view only.</div>}

      {canEditPay && (
        <RateLibrary open={ratesOpen} accessId={accessId} onClose={() => setRatesOpen(false)} onSaved={() => loadRates()} />
      )}
    </div>
  );
}

function ProgressRing({ done, total, color, complete }) {
  const r = 15, C = 2 * Math.PI * r;
  const frac = total ? done / total : 0;
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" className="icl-ring-svg">
      <circle cx="20" cy="20" r={r} fill="none" stroke="#e6e1d6" strokeWidth="4" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={complete ? "#2f7d5a" : color} strokeWidth="4" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 20 20)" style={{ transition: "stroke-dashoffset .35s ease" }} />
      <text x="20" y="21" textAnchor="middle" dominantBaseline="middle" fontSize={complete ? "15" : "11"} fontWeight="800" fill={complete ? "#2f7d5a" : "#0B0F1A"}>{complete ? "✓" : `${done}/${total}`}</text>
    </svg>
  );
}

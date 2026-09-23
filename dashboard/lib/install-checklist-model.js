// Installation Work Order — pure model + helpers. Extracted verbatim from
// app/project/[accessId]/install-checklist.jsx to keep that component under the file-size
// guideline. No DB, no React, no component state: same constants and pure functions, just
// colocated here so they can be shared and unit-reasoned about.
//
// Camera:  Cable Dropped → Cable Managed → Wires Terminated → Camera Mounted → Camera Online
// NVR:     Programmed → Online → Recording Verified
// Equipment/Displays/Drives: Installed (single tap)
export const CAMERA_STEPS = ["Cable Dropped", "Cable Managed", "Wires Terminated", "Camera Mounted", "Camera Online"];
export const NVR_STEPS    = ["Programmed", "Online", "Recording Verified"];
export const EQUIP_STEPS  = ["Installed"];
// Toast POS / network devices (switches, terminals, printers, KDS, kiosks) run the same cabling
// path as a camera: dropped → managed → terminated → installed.
export const POS_STEPS    = ["Cable Dropped", "Cable Managed", "Wires Terminated", "Device Installed"];
const STEPS_BY_TYPE = { camera: CAMERA_STEPS, nvr: NVR_STEPS, pos: POS_STEPS, equip: EQUIP_STEPS };
export const stepsFor = (type) => STEPS_BY_TYPE[type] || EQUIP_STEPS;
export const colorFor = (type) => (type === "camera" ? "#C9A96E" : type === "nvr" ? "#4b6a9b" : type === "pos" ? "#7c3aed" : "#6FBF73");
export const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtLogTime = (t) => { if (!t) return ""; try { return new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
// Per-step payout breakdown (labor): each step earns a slice of the total.
//   Cameras:  Dropped $10 · Managed $18 · Terminated $12 · Mounted $12 · Online $0   → $52
//   Toast POS: Dropped $10 · Managed $18 · Terminated $12 · Installed $12            → $52
export const CAMERA_STEP_PAY = [10, 18, 12, 12, 0];
export const POS_STEP_PAY    = [10, 18, 12, 12];
const WEIGHTED_PAY = { camera: CAMERA_STEP_PAY, pos: POS_STEP_PAY };
// $ earned toward a line item at `done` steps. Cameras/POS use the weighted breakdown (scaled to
// the item's actual payout); NVR/equipment split their payout evenly across their steps.
export const earnedFor = (type, done, total, payout) => {
  const steps = stepsFor(type).length;
  const d = Math.min(done, steps);
  const weights = WEIGHTED_PAY[type];
  if (weights) {
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const frac = weights.slice(0, d).reduce((a, b) => a + b, 0) / sum;
    return payout * frac;
  }
  return steps ? payout * (d / steps) : 0;
};
// Default hour estimate when the office hasn't set one: 2 hours a camera or POS device + 30 min an NVR.
export const estHoursFor = (cams, nvrs = 0, pos = 0) => Math.max(1, cams * 2 + pos * 2 + nvrs * 0.5);
// Pay follows completion: a single step credits its slice of the line's payout. `wpay` is the
// assigned tech's per-step weight map ({ camera: [...], pos: [...] }); NVR/equipment split evenly.
export const weightedInc = (type, stepIdx, payout, wpay) => {
  const w = wpay[type];
  if (w) { const sum = w.reduce((a, b) => a + b, 0) || 1; return (w[stepIdx] || 0) / sum * payout; }
  const steps = stepsFor(type).length; return steps ? payout / steps : 0;
};

// ---- Installed-item derivation (shared by the work order, the QC checklist AND the server gate) ----
// Which proposal lines are physical devices to install / verify: cameras + POS lines that carry a
// labor sub-bundle, the recorder, and any plain equipment that isn't a labor line. The two
// checklists historically kept slightly different "labor" regexes — both are preserved here so the
// server derives exactly the list each surface shows.
import { addendumSignatureCurrent } from "./proposal.js";
export const INSTALL_LABOR_RX = /(cat6 drop|termination|mounting|programming|waterproof|cabling|tuning|wire run|setup|\blabor\b)/i;
export const QC_LABOR_RX      = /drop|cable|run|termination|mount|management|program|setup|labor|install|per diem|test|tone|waterproof/i;
const parseJson = (v) => { if (v == null) return null; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return null; } };
export function installItemsFromProposal(proposal, laborRx = INSTALL_LABOR_RX) {
  const payload = parseJson(proposal?.payload);
  const opt = payload?.options?.find((o) => o.id === proposal?.selected_option) || payload?.options?.[0];
  const out = [];
  (opt?.services || []).forEach((s) => {
    (s.items || []).forEach((it) => {
      const hasSub = (it.sub || []).length > 0;
      if (s.key === "camera" && hasSub) { out.push({ id: it.id, name: it.name, type: "camera" }); return; }
      if ((s.key === "toast" || s.key === "pos") && hasSub) { out.push({ id: it.id, name: it.name, type: "pos" }); return; }
      if (/\bnvr\b|recorder/i.test(it.name)) { out.push({ id: it.id, name: it.name, type: "nvr" }); return; }
      if (!hasSub && !laborRx.test(it.name)) out.push({ id: it.id, name: it.name, type: "equip" });
    });
  });
  const nvrs = out.filter((e) => e.type === "nvr");
  if (nvrs.length > 1) {   // one recorder only — collapse a stale double-NVR to the highest channel count
    const chanOf = (n) => { const m = String(n).match(/(\d+)\s*-?\s*channel/i); return m ? +m[1] : 0; };
    const best = nvrs.reduce((a, b) => (chanOf(b.name) > chanOf(a.name) ? b : a));
    return out.filter((e) => e.type !== "nvr" || e === best);
  }
  return out;
}
// Work-order completion from the persisted "install" blob (+ approved add-ons from "addendum"):
// every line item — derived, add-on, custom — sits at its last step. Mirrors the checklist's own math.
// Approved (and still fingerprint-current) add-on lines, expanded by quantity — the same list the
// work order installs and QC verifies.
export function approvedAddonItems(addendumRaw) {
  return ((parseJson(addendumRaw) || {}).addendums || []).filter((a) => addendumSignatureCurrent(a))
    .flatMap((a) => (a.items || []).flatMap((it) => {
      const qty = Math.max(1, +it.qty || 1);
      return Array.from({ length: qty }, (_, n) => ({ id: `${it.id}#${n}`, name: qty > 1 ? `${it.name} #${n + 1}` : it.name, type: it.type || "equip", addon: true }));
    }));
}
export function installProgress(proposal, installRaw, addendumRaw) {
  const d = parseJson(installRaw) || {};
  const removed = Array.isArray(d.removed) ? d.removed : [];
  const custom = Array.isArray(d.custom) ? d.custom : [];
  const steps = d.steps || {};
  const addons = approvedAddonItems(addendumRaw);
  const items = [...installItemsFromProposal(proposal).filter((i) => !removed.includes(i.id)), ...addons.filter((a) => !removed.includes(a.id)), ...custom];
  const total = items.reduce((a, it) => a + stepsFor(it.type).length, 0);
  const done  = items.reduce((a, it) => a + Math.min(steps[it.id] || 0, stepsFor(it.type).length), 0);
  return { items: items.length, total, done, allDone: total > 0 && done === total };
}
// ---- Install issue flags (Phase 1) — canonical vocabulary shared by the UI and the server actions ----
export const ISSUE_REASONS = ["Incomplete", "Poor workmanship", "Wrong location", "Wrong device", "Damaged", "Failed test", "Missing material", "Blocked", "Other"];
export const ISSUE_STATES = {
  NEEDS_REVIEW: "Needs Review",
  NEEDS_REWORK: "Needs Rework",
  RESOLVED:     "Resolved",
  DISMISSED:    "Dismissed",
};
export const issueOpen = (i) => i && (i.status === "NEEDS_REVIEW" || i.status === "NEEDS_REWORK");
// Claimed-work display state for one line item: the step count is the technician's claim; an open
// flag overlays it without erasing it. VERIFIED arrives with per-item QC (Phase 3).
export function itemWorkState(done, max, itemIssues = []) {
  const open = itemIssues.filter(issueOpen);
  if (open.some((i) => i.status === "NEEDS_REWORK")) return "NEEDS_REWORK";
  if (open.length) return "NEEDS_REVIEW";
  if (max > 0 && done >= max) return "COMPLETE";
  return done > 0 ? "IN_PROGRESS" : "NOT_STARTED";
}

// QC: standard checks per device type; an item passes only when ALL of its checks are ticked.
export const QC_CHECKS = {
  camera: ["Online", "Angle OK", "Recording", "Night Vision"],
  nvr:    ["Powered On", "Recording", "Remote Access"],
  pos:    ["Online", "Recording"],
  equip:  ["Working"],
};
export const qcChecksFor = (type) => QC_CHECKS[type] || QC_CHECKS.equip;
// `openIssues` = open install issue flags (Phase 1): a device with an unresolved flag cannot pass QC
// until the flag is resolved or dismissed — one canonical status, no second "disputed" state.
// QC covers every installed device: the proposal's lines PLUS approved add-on lines (same list
// the work order installs), minus lines the office removed from the work order.
export function qcItemStates(proposal, qcRaw, installRaw, openIssues = [], addendumRaw = null) {
  const d = parseJson(qcRaw) || {};
  const checks = d.checks || {};
  const inst = parseJson(installRaw) || {};
  const steps = inst.steps || {};
  const removed = Array.isArray(inst.removed) ? inst.removed : [];
  const list = [...installItemsFromProposal(proposal, QC_LABOR_RX), ...approvedAddonItems(addendumRaw)].filter((i) => !removed.includes(i.id));
  return list.map((it) => {
    const flagged = openIssues.filter((i) => i.target_id === it.id).length;
    const ticked = qcChecksFor(it.type).every((c) => checks[it.id]?.[c]);
    const installed = Math.min(steps[it.id] || 0, stepsFor(it.type).length) >= stepsFor(it.type).length;
    return {
      id: it.id, name: it.name, type: it.type, installed,
      ticked, openIssues: flagged, pass: ticked && flagged === 0,
      // What a per-item acceptance binds to: the device's identity, its install state, its checks
      // and its issue note — rename it, un-install a step, or change a check and the acceptance voids.
      meaning: { n: it.name || "", t: it.type, inst: installed, checks: checks[it.id] || {}, issue: (d.issues || {})[it.id] || "" },
    };
  });
}
export function qcProgress(proposal, qcRaw, installRaw = null, openIssues = [], addendumRaw = null) {
  const items = qcItemStates(proposal, qcRaw, installRaw, openIssues, addendumRaw);
  const passed = items.filter((it) => it.pass).length;
  return { items: items.length, passed, allPass: items.length > 0 && passed === items.length };
}

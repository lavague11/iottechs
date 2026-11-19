// What a technician does to a work order line in the field (docs/WORK_ORDERS.md, Stage 3) — PURE.
// Two owner decisions of 2026-11-19 shape every rule here:
//
//   A. The three-state line (Complete / Needs attention / Incomplete) keeps the install checklist's
//      STEP path inside it. A camera is still dropped → managed → terminated → mounted → online;
//      Complete means every step, and Incomplete can still say how far the crew got. Partial work
//      keeps paying, which it would not if a line were only ever done-or-not.
//   B. Each STEP credits whoever tapped it. A line's credit is the sum of its steps, so one technician
//      is never paid for another's cabling. An admin may still reassign or split on top.
//
// The step vocabulary and the weights are the install checklist's — imported, never re-listed, so the
// two surfaces cannot disagree about what a camera install is or what a drop pays.
import { stepsFor, weightedInc } from "./install-checklist-model.js";

export const LINE_STATUS = { INCOMPLETE: "incomplete", ATTENTION: "attention", COMPLETE: "complete" };
export const LINE_STATUSES = [LINE_STATUS.COMPLETE, LINE_STATUS.ATTENTION, LINE_STATUS.INCOMPLETE];
export const isLineStatus = (s) => LINE_STATUSES.includes(s);

// A line's step path. Labor and add-on lines are one-tap ("Installed"); devices follow their path.
export const lineSteps = (kind) => stepsFor(kind);
export const stepCount = (kind) => lineSteps(kind).length;

// Per-step pay weights for the acting technician, from their effective rate book — the same mapping
// install-checklist.jsx builds, in one place now. A kind with no weights splits its payout evenly,
// which is what weightedInc does when it is handed none.
export function stepWeights(rates = {}) {
  const n = (v) => +v || 0;
  const cam = [n(rates.cam_drop), n(rates.cam_mgmt), n(rates.cam_term), n(rates.cam_mount), 0];
  const pos = [n(rates.pos_drop), n(rates.pos_mgmt), n(rates.pos_term), n(rates.pos_install)];
  return { camera: cam, speaker: cam, pos };          // speakers pay exactly like cameras (owner's rule)
}
// What crossing step `stepIdx` on this line earns, for the person who crossed it (decision B).
export const stepCredit = (kind, stepIdx, payout, rates) => {
  const amt = weightedInc(kind, stepIdx, +payout || 0, stepWeights(rates));
  return Math.round((+amt || 0) * 100) / 100;
};
// What the whole line pays out when every step is done. Rounding is applied once, at the line, so a
// line's credits always add up to its payout instead of drifting a cent per step.
export function creditsForAdvance(kind, from, to, payout, rates) {
  const out = [];
  for (let i = Math.max(0, from); i < Math.min(to, stepCount(kind)); i++) out.push({ stepIdx: i, step: lineSteps(kind)[i], amount: stepCredit(kind, i, payout, rates) });
  return out;
}

// ---- The gate on a status change -------------------------------------------------------------
// Returns null when the change is allowed, else the reason to show. Every rule here is also enforced
// server-side by the same function — the popup calls it to grey a button, the action calls it to refuse.
//
//   16. Nothing can be marked until the acting technician has checked in ON SITE today.
//   18. "Needs attention" needs a note OR a photo — a flag with no evidence is not a report.
//   19. A key line (camera / recorder / speaker / display) needs a BEFORE and an AFTER photo before it
//       can be called Complete. That is the only proof the work was done properly.
export function lineStatusGate({ status, checkedInToday, line, photos = [], note = "" }) {
  if (!isLineStatus(status)) return "Unknown status.";
  if (!checkedInToday) return "Check in on site first.";
  const has = (slot) => photos.some((p) => p.slot === slot);
  if (status === LINE_STATUS.ATTENTION && !String(note || "").trim() && !photos.length) {
    return "Add a note or a photo so the office knows what's wrong.";
  }
  if (status === LINE_STATUS.COMPLETE && line?.needsPhotos) {
    if (!has("before")) return "A before photo is required on this line.";
    if (!has("after")) return "An after photo is required on this line.";
  }
  return null;
}

// Moving INTO complete fills the step path; moving out of it rewinds to where the crew actually is.
// An explicit step count wins (the "how far did you get?" picker), which is how decision A survives
// a three-state popup.
export function stepsAfterStatus(kind, status, { stepsDone = 0, pickStep = null } = {}) {
  const total = stepCount(kind);
  if (status === LINE_STATUS.COMPLETE) return total;
  if (pickStep != null) return Math.max(0, Math.min(total, +pickStep || 0));
  return Math.max(0, Math.min(total, +stepsDone || 0));
}

// ---- Offline replay (requirement 21) ---------------------------------------------------------
// A tap taken with no signal is queued on the device and replayed later. The key below is what makes a
// replay safe: the same technician, the same line, the same action, at the same DEVICE clock reading is
// one act however many times it arrives, which is enforced by a UNIQUE index on wo_events. The device
// clock is used, not the server's, because that is the only value that is stable across a retry.
//
// This key identifies the op to the PHONE, so the phone can settle its queue from the reply — the
// actor is deliberately not in it, because the device never sends one (the server derives who is
// acting from the session). The database's own idempotence is wider: wo_events is unique on
// (wo_id, line_key, action, actor_name, client_at), which is what actually stops a double credit.
export const opKey = (op) => [op.lineKey || "", op.action || "", op.clientAt || ""].join("|");
// Normalize and validate a queued op before it is sent. Returns { op } or { error }.
export function normalizeOp(raw) {
  const op = {
    action: String(raw?.action || ""),
    lineKey: raw?.lineKey == null ? null : String(raw.lineKey),
    status: raw?.status == null ? null : String(raw.status),
    pickStep: raw?.pickStep == null ? null : +raw.pickStep,
    note: String(raw?.note || "").slice(0, 2000),
    clientAt: String(raw?.clientAt || ""),
  };
  if (!["status", "checkin", "note"].includes(op.action)) return { error: "Unknown action." };
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(op.clientAt)) return { error: "Bad timestamp." };
  if (op.action === "status") {
    if (!op.lineKey) return { error: "Missing line." };
    if (!isLineStatus(op.status)) return { error: "Unknown status." };
  }
  return { op };
}
// Oldest first: a queue must replay in the order the technician actually worked, or a line's history
// reads backwards and the step credits land on the wrong taps.
export const sortQueue = (ops) => [...(ops || [])].sort((a, b) => String(a.clientAt).localeCompare(String(b.clientAt)));

// ---- Progress ---------------------------------------------------------------------------------
// Raw step completion across the work order — role-independent, which is what the stage flow reads.
// (The pay-weighted figure the office sees is derived from the credits, not from this.)
export function fieldProgress(lines) {
  let total = 0, done = 0, complete = 0, attention = 0;
  for (const l of lines || []) {
    const n = stepCount(l.kind);
    total += n;
    done += Math.min(+l.state?.steps_done || 0, n);
    if (l.state?.status === LINE_STATUS.COMPLETE) complete += 1;
    if (l.state?.status === LINE_STATUS.ATTENTION) attention += 1;
  }
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0, complete, attention, lines: (lines || []).length,
    allDone: total > 0 && done === total };
}

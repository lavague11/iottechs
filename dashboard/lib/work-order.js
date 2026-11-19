// Work order model (PURE) — the internal labor document the technician works from and signs.
//
// A work order is a COPY of ONE published proposal option, re-valued at technician payout. It is its own
// document from the moment it is created: editing it never writes the proposal row back (that was the old
// `saveTechPricingAction` behaviour, which edited `proposals.payload` in place and so could not carry
// versions, revisions or per-line field state). See docs/WORK_ORDERS.md.
//
// Shape: the payload is deliberately the SAME shape as a proposal payload — `{ options: [one option] }`
// with `services → items → sub` — for two reasons:
//   1. `ProposalItemsEditor` renders it unchanged (one renderer, payout mode).
//   2. `techItemTotal` / `techSvcSubtotal` / `techOptionTotal` in proposal.js already define payout math,
//      so no money formula is duplicated here.
// The per-line payout therefore keeps the field name `techPrice` it has everywhere else in the codebase.
//
// What is NOT copied: every customer-facing figure. `price`, `cost`, `desc`, line conditions and the
// option's customer terms are dropped at snapshot time, so a tech payload has no retail number in it to
// leak — the same belt-and-braces rule as sanitizeProposal, applied at the source instead of on the way out.
import {
  defaultTechPayout, techItemTotal, techOptionTotal, titleCase,
  waiverCausesOf, isWaived, hasWaiverCause, WAIVER_CAUSES, stableKey, stableHash,
} from "./proposal.js";

const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const parseJson = (v) => { if (v == null) return null; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return null; } };

// A line's device kind, used for the install step path and for which lines demand before/after photos.
// Same vocabulary as lib/install-checklist-model.js so the two surfaces can't disagree about a camera.
export const LABOR_RX = /(cat6 drop|termination|mounting|programming|waterproof|cabling|tuning|wire run|setup|\blabor\b)/i;
export function lineKind(name, svcKey, hasSub) {
  const n = String(name || "").toLowerCase();
  if (svcKey === "toast") return "pos";
  if (/\bnvr\b|recorder/.test(n)) return "nvr";
  if (/speaker/.test(n)) return "speaker";
  if (svcKey === "camera" && hasSub) return "camera";
  if (/camera/.test(n)) return "camera";
  if (LABOR_RX.test(n)) return "labor";
  return "equip";
}
// Requirement 19: the lines where a photo is the only proof the work was done properly.
export const PHOTO_KINDS = new Set(["camera", "nvr", "speaker"]);
export const needsPhotos = (kind, name) => PHOTO_KINDS.has(kind) || /display|monitor|\btv\b/i.test(String(name || ""));

// ---- Snapshot: proposal option → work order payload -------------------------------------------
// `rates` is the effective rate book (getEffectiveRates). A line that already carries a positive
// techPrice keeps it — an admin override is never clobbered by a re-seed. A line with none is seeded
// from the standard rate; anything the rate book has no answer for lands at 0 so the office prices it
// by hand, exactly like seedTechPricingMap.
//
// CPE and waived lines are KEPT (requirement 2/3): the customer isn't charged for the Display + Mount,
// but a technician still has to install it, so it must be on the sheet with its badge. This is the one
// place the work order deliberately diverges from the customer document.
function copyLine(it, svcKey, rates) {
  const sub = (it.sub || []).map((x) => copyLine(x, svcKey, rates));
  const causes = waiverCausesOf(it);
  const seeded = +it.techPrice > 0 ? +it.techPrice : defaultTechPayout(it.name, svcKey, rates);
  return {
    id: String(it.id),
    name: it.name || "",
    qty: +it.qty || 0,
    techPrice: r2(seeded),
    ...(it.outdoor ? { outdoor: true } : null),
    ...(causes.length ? { waived: true, waiverCauses: [...causes] } : null),
    ...(sub.length ? { sub } : null),
  };
}
export function workOrderPayloadFrom(proposal, { optionId = null, rates = null } = {}) {
  const payload = parseJson(proposal?.payload);
  const opts = payload?.options || [];
  const opt = opts.find((o) => o.id === (optionId ?? proposal?.selected_option)) || opts[0];
  if (!opt) return null;
  const services = (opt.services || []).map((s) => ({
    key: s.key,
    label: s.label || "",
    ...(s.note ? { note: s.note } : null),
    items: (s.items || []).map((it) => copyLine(it, s.key, rates)),
  })).filter((s) => s.items.length);
  return { options: [{ id: opt.id, name: opt.name || `Option ${opt.id}`, services }] };
}

// Re-pull the standard rates onto every line, overriding whatever is there. Unlike the snapshot seed
// this one DOES clobber manual edits — it is the explicit "Reset to standard" action, not a seed.
export function reseedPayouts(payload, rates) {
  const p = JSON.parse(JSON.stringify(parseJson(payload) || {}));
  (p.options?.[0]?.services || []).forEach((s) => (s.items || []).forEach((it) => {
    it.techPrice = r2(defaultTechPayout(it.name, s.key, rates));
    (it.sub || []).forEach((x) => { x.techPrice = r2(defaultTechPayout(x.name, s.key, rates)); });
  }));
  return p;
}

// ---- Reads over a work order payload ----------------------------------------------------------
export const woOption = (payload) => parseJson(payload)?.options?.[0] || null;
// Payout total. Waived lines DO count here (techItemTotal never zeroes a waived line) — the tech is paid
// for work the customer wasn't charged for.
export const woTotal = (payload) => { const o = woOption(payload); return o ? techOptionTotal(o) : 0; };
export const woLineTotal = (it) => r2(techItemTotal(it));

// Flat list of every line a technician acts on: parents and their sub-lines, each with a stable key.
// `key` is the proposal line id it was copied from, so completion state, photos and payout credits
// survive a revision (requirement 13: "completed lines keep their status").
export function woLines(payload) {
  const opt = woOption(payload);
  const out = [];
  (opt?.services || []).forEach((s) => {
    (s.items || []).forEach((it) => {
      const subs = it.sub || [];
      const kind = lineKind(it.name, s.key, subs.length > 0);
      out.push({
        key: String(it.id), parentKey: null, svc: s.key, svcLabel: s.label || "",
        name: titleCase(it.name), qty: +it.qty || 0, payout: r2(+it.techPrice || 0),
        total: woLineTotal(it), kind,
        waived: isWaived(it), cpe: hasWaiverCause(it, WAIVER_CAUSES.CPE),
        needsPhotos: needsPhotos(kind, it.name), hasSub: subs.length > 0,
      });
      subs.forEach((x) => {
        const k = lineKind(x.name, s.key, false);
        out.push({
          key: String(x.id), parentKey: String(it.id), svc: s.key, svcLabel: s.label || "",
          name: titleCase(x.name), qty: +x.qty || 0, payout: r2(+x.techPrice || 0),
          total: r2((+x.qty || 0) * (+x.techPrice || 0)), kind: k,
          waived: isWaived(x), cpe: hasWaiverCause(x, WAIVER_CAUSES.CPE),
          needsPhotos: false, hasSub: false,
        });
      });
    });
  });
  return out;
}

// ---- Signature binding ------------------------------------------------------------------------
// What the technician agreed to: the scope (every line's name and quantity) and the money (every
// payout). Changing any of it voids the signature and demands a re-sign (requirement 13). Field state
// is deliberately NOT in here — marking a line complete must never void the signature on the scope.
export function workOrderFingerprint(payload) {
  const lines = woLines(payload).map((l) => ({ k: l.key, n: l.name, q: l.qty, p: l.payout }));
  return stableHash(stableKey({ lines }));
}

// ---- Revision state (requirement 13) ---------------------------------------------------------
// Deliberately the same SHAPE as proposalChangeState so the footer that renders "Unsubmitted ·
// N unsent changes · ±$" is one component family: the only difference is that the delta is payout,
// not retail. Read-only; it never mutates, sends or signs.
export function workOrderDiff(prevPayload, curPayload) {
  const prev = new Map(woLines(prevPayload).map((l) => [l.key, l]));
  const cur = new Map(woLines(curPayload).map((l) => [l.key, l]));
  const added = [], removed = [], changed = [];
  for (const [k, l] of cur) if (!prev.has(k)) added.push(l);
  for (const [k, l] of prev) if (!cur.has(k)) removed.push(l);
  for (const [k, c] of cur) {
    const p = prev.get(k); if (!p) continue;
    if (p.name !== c.name || p.qty !== c.qty || p.payout !== c.payout) {
      changed.push({ key: k, name: c.name, svc: c.svcLabel, from: { name: p.name, qty: p.qty, payout: p.payout }, to: { name: c.name, qty: c.qty, payout: c.payout } });
    }
  }
  const from = woTotal(prevPayload), to = woTotal(curPayload);
  return { any: added.length > 0 || removed.length > 0 || changed.length > 0 || r2(from) !== r2(to), added, removed, changed, total: { from: r2(from), to: r2(to) } };
}
export function workOrderChangeState(sentVersion, working) {
  const publishedVersion = sentVersion?.version ?? null;
  const none = { hasUnsentChanges: false, publishedVersion, changeCount: 0, structuredChanges: null, payoutDelta: null };
  if (!sentVersion || !working) return none;
  const diff = workOrderDiff(sentVersion.payload, working.payload);
  if (!diff.any) return none;
  const changeCount = diff.added.length + diff.removed.length + diff.changed.length || 1;
  return {
    hasUnsentChanges: true, publishedVersion, changeCount, structuredChanges: diff,
    payoutDelta: r2(diff.total.to - diff.total.from),
  };
}

// ---- Validation (server boundary) -------------------------------------------------------------
// Mirrors the proposal's payload validator in spirit: a bad draft is rejected at the action, never
// written. Returns null when valid, else a message.
export function validateWorkOrderPayload(payload) {
  const p = parseJson(payload);
  const opts = p?.options;
  if (!Array.isArray(opts) || opts.length !== 1) return "A work order holds exactly one option.";
  const opt = opts[0];
  if (!Array.isArray(opt?.services)) return "Bad services.";
  if (opt.services.length > 40) return "Too many services.";
  const seen = new Set();
  const checkLine = (it, depth) => {
    if (!it || typeof it !== "object") return "Bad line.";
    const id = String(it.id || "");
    if (!id || id.length > 80) return "Bad line id.";
    if (seen.has(id)) return "Duplicate line id.";
    seen.add(id);
    if (typeof it.name !== "string" || it.name.length > 200) return "Bad line name.";
    if (!(+it.qty >= 0) || +it.qty > 100000) return "Bad quantity.";
    if (!(+it.techPrice >= 0) || +it.techPrice > 1000000) return "Bad payout.";
    const sub = it.sub;
    if (sub != null) {
      if (depth > 0) return "Lines nest one level only.";
      if (!Array.isArray(sub) || sub.length > 60) return "Bad sub-lines.";
      for (const x of sub) { const e = checkLine(x, depth + 1); if (e) return e; }
    }
    return null;
  };
  for (const s of opt.services) {
    if (!Array.isArray(s?.items) || s.items.length > 300) return "Bad items.";
    for (const it of s.items) { const e = checkLine(it, 0); if (e) return e; }
  }
  return null;
}

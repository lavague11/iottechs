// Addendum <-> Proposal line-item boundary (PURE — no React, no DB).
//
// The Addendum builder reuses the Proposal's real item editor (ProposalItemsEditor: + Add Service, + Item
// type-ahead, preset chips). That editor speaks PROPOSAL LINES; an addendum stores a flat `items[]` blob
// that customer signatures bind to (addendumFingerprint = title + discount + name/qty/price per item). This
// module is the one place the two shapes meet, so the stored blob keeps its exact shape.
//
// Field mapping (money — keep explicit):
//   proposal line `techPrice`  <->  addendum item `techPay`   (per unit; internal payout)
//   proposal line `price`      <->  addendum item `price`     (customer; retail)
//   proposal line `cost`       ->   dropped (addendum items carry no cost)
//   proposal block (header + `sub[]`, e.g. a "Full Camera Install" preset) collapses to ONE addendum line:
//   qty 1, price = itemTotal(block), techPay = sum of its parts — so one block = one installable device,
//   exactly how the install checklist already reads a proposal block (installItemsFromProposal).
//
// The add-on TOTAL is never computed here: callers use addendumTotals from lib/proposal.js.
import { itemTotal, defaultTechPayout, serviceLabel } from "./proposal.js";
import { INSTALL_LABOR_RX, QC_LABOR_RX } from "./install-checklist-model.js";

const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const qtyOf = (v) => (v == null || v === "" || !Number.isFinite(+v) ? 1 : +v);   // 0 stays 0 (legacy rows hash with it)
const hasSub = (it) => Array.isArray(it?.sub) && it.sub.length > 0;
const CAMERA_HW_RX = /\b(camera|dome|bullet|turret|ptz|fisheye)\b/i;

// Service a stored add-on line belongs to when it carries no explicit `service` (legacy / tech-built rows).
const SERVICE_OF_TYPE = { camera: "camera", nvr: "camera", speaker: "sound", pos: "toast", equip: "custom" };

// Install-checklist type for a collapsed line. Mirrors installItemsFromProposal so an add-on line
// installs/pays like the same line on a proposal; a flat camera device in the camera service is a camera.
export function addendumTypeOf(it, serviceKey) {
  const name = String(it?.name || "");
  if (hasSub(it)) {
    if (serviceKey === "camera") return "camera";
    if (serviceKey === "sound") return "speaker";
    if (serviceKey === "toast" || serviceKey === "pos") return "pos";
  }
  if (/\bnvr\b|recorder/i.test(name)) return "nvr";
  const hardware = !INSTALL_LABOR_RX.test(name) && !QC_LABOR_RX.test(name);   // a labor line (drop, mounting, wire run...) is equipment-typed, not a device
  if (serviceKey === "camera" && CAMERA_HW_RX.test(name) && hardware) return "camera";
  if (serviceKey === "sound" && /\bspeaker/i.test(name) && hardware) return "speaker";
  if ((serviceKey === "toast" || serviceKey === "pos") && hardware) return "pos";
  return "equip";
}

const ownPay = (x, serviceKey, rates) => (+x?.techPrice > 0 ? +x.techPrice : defaultTechPayout(x?.name, serviceKey, rates));

// Tech pay for ONE addendum line (per unit for a flat line; per block for a collapsed bundle).
export function techPayOf(it, serviceKey, rates) {
  if (hasSub(it)) {
    if (+it.techPrice > 0) return r2(it.techPrice);   // explicit total on the block (round-trip of a saved add-on)
    return r2(it.sub.reduce((s, x) => s + (+x.qty || 0) * ownPay(x, serviceKey, rates), 0));
  }
  return r2(ownPay(it, serviceKey, rates));
}

// One proposal line -> one addendum item. `priced:false` (a role that may not price — tech/sales) writes
// price 0 / techPay 0: the server (reconcileAddendumWrite) enforces that again, this just never sends a
// number the writer was not allowed to set. `payOverrides[id]` is an office-typed per-line payout.
export function lineToAddendumItem(it, serviceKey, { rates, priced = true, payOverrides } = {}) {
  const collapsed = hasSub(it);   // only a bundle collapses; a waived flat line keeps its quantity (price 0)
  const ov = payOverrides ? payOverrides[it.id] : undefined;
  const hasOv = ov != null && ov !== "";
  const price = collapsed ? r2(itemTotal(it)) : (it.waived ? 0 : (+it.price || 0));
  return {
    id: it.id,
    name: String(it.name || "").trim(),
    type: addendumTypeOf(it, serviceKey),
    service: serviceKey,
    qty: collapsed ? 1 : qtyOf(it.qty),
    price: priced ? price : 0,
    techPay: priced ? (hasOv ? (+ov || 0) : techPayOf(it, serviceKey, rates)) : 0,
  };
}

// The editor's services[] -> the addendum's flat items[].
// Signature safety: a customer signature binds to name/qty/price IN ORDER, so `opts.original` (the add-on's
// stored items, when editing one) makes this an identity map for anything the office did not touch: an
// unchanged line is emitted as the original object (legacy name, qty, type and position untouched; only
// `techPay` follows the payout rules), items keep their stored order, and only new lines are appended.
export function servicesToAddendumItems(services, opts = {}) {
  const original = Array.isArray(opts.original) ? opts.original : [];
  const origById = new Map(original.map((o) => [o.id, o]));
  const baseline = new Map();
  addendumItemsToServices(original).forEach((sv) => sv.items.forEach((l) => baseline.set(l.id, JSON.stringify(l))));
  const made = new Map(), fresh = [];
  (services || []).forEach((sv) => (sv.items || []).forEach((it) => {
    const o = origById.get(it.id);
    if (!o && !String(it?.name || "").trim()) return;
    const p = lineToAddendumItem(it, sv.key, opts);
    if (o) made.set(it.id, baseline.get(it.id) === JSON.stringify(it) ? { ...o, techPay: opts.priced === false ? o.techPay : p.techPay } : p);
    else fresh.push(p);
  }));
  return [...original.filter((o) => made.has(o.id)).map((o) => made.get(o.id)), ...fresh];
}

// A saved addendum's items[] -> editor services[] (to price a tech-submitted add-on). Ids are preserved so
// the server's per-id price reconciliation and the install checklist ids keep lining up; `techPay` comes back
// as the line's `techPrice` so a stored payout survives a round trip.
export function addendumItemsToServices(items) {
  const order = [], by = {};
  (items || []).forEach((it) => {
    const key = it.service || SERVICE_OF_TYPE[it.type] || "custom";
    if (!by[key]) { by[key] = { key, label: serviceLabel(key), items: [], note: "" }; order.push(key); }
    by[key].items.push({ id: it.id, name: it.name == null ? "" : it.name, qty: qtyOf(it.qty), price: +it.price || 0, cost: 0, techPrice: +it.techPay || 0 });
  });
  return order.map((k) => by[k]);
}

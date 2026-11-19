"use client";

// The technician's offline queue (docs/WORK_ORDERS.md, requirement 21): "never lose a tap".
//
// Every field act is written to IndexedDB FIRST and sent second. With no signal the send fails, the op
// stays queued, and the phone shows how many are waiting; when the connection comes back the queue
// replays oldest-first. The server makes a replay safe — each op carries the DEVICE clock, and
// (line, action, actor, client_at) is unique on wo_events — so a retry can never double-pay.
//
// IndexedDB, not localStorage: a long day on a big job is hundreds of ops, and localStorage's ~5MB cap
// is shared with everything else the tools store. Both reads and writes are wrapped, and a device with
// no IndexedDB at all degrades to sending straight through rather than failing.
import { idbGet, idbSet, idbAvailable } from "./idb-store";

const KEY = (accessId) => `wo_queue_${accessId}`;

export async function readQueue(accessId) {
  try { const raw = await idbGet(KEY(accessId)); const list = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list : []; }
  catch { return []; }
}
async function writeQueue(accessId, ops) {
  try { await idbSet(KEY(accessId), JSON.stringify(ops.slice(-500))); } catch { /* the send below is still attempted */ }
}
export async function enqueue(accessId, op) {
  const q = await readQueue(accessId);
  const next = [...q, op];
  await writeQueue(accessId, next);
  return next.length;
}
// Drop the ops the server accepted (or rejected for good — a bad op must not retry forever).
export async function settle(accessId, results) {
  const done = new Set((results || []).filter((r) => r.ok || r.error).map((r) => r.key));
  const q = await readQueue(accessId);
  const left = q.filter((op) => !done.has(opKeyOf(op)));
  await writeQueue(accessId, left);
  return left.length;
}
// Must match lib/work-order-field.js `opKey` — the server echoes this back per op. The actor is not in
// it: the device never sends one, the server derives it from the session.
export const opKeyOf = (op) => [op.lineKey || "", op.action || "", op.clientAt || ""].join("|");

export const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);
export const hasOfflineStore = () => idbAvailable();

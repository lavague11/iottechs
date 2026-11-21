// Smart bulk-update for repeated proposal SUB-ITEMS (a camera block's "Camera Mounting", "Cat6 Termination", …).
// PURE + deterministic, operating on the proposal payload, so the matching rules are unit-testable and the UI
// (prompt + apply + undo) can't drift from them. The canonical rule, enforced here:
//
//   MATCH = same canonical sub-item type  +  same OLD value  +  same service  +  the CURRENT editable payload
//
// "Same canonical type" uses the stable baseName when a sub-item carries one, falling back to its display name
// (legacy sub-items have no baseName). "Same old value" is what preserves intentional overrides — a sub-item
// that was deliberately set to a different price is never touched. Scope is the current option or all options.
// This file never does pricing arithmetic (optionTotals recomputes from the returned payload) and never mutates
// in place — every function returns a new payload.

// Normalize a numeric field for comparison (money/qty): 2-dp rounded number. "20", 20, "20.00" → 20.
export function numEq(a, b) {
  const n = (v) => Math.round((+v || 0) * 100) / 100;
  return n(a) === n(b);
}

// Canonical identity for a line: its stable baseName if present, else its (trimmed, lowercased) display
// name. Matching on this — never on raw display text alone — keeps unrelated items with a similar name apart
// once they carry baseName, while still working for legacy sub-items that only have a name. Used at BOTH
// levels (sub-items and top-level items), which is why the shape it reads is just {baseName?, name}.
export function subKey(sub) {
  return String(sub?.baseName || sub?.name || "").trim().toLowerCase();
}

// Find the OTHER sub-items that the edit should offer to update: same canonical type, still on the OLD value,
// within the chosen scope, excluding the just-edited sub. Returns [{ optionId, itemId, subId }]. Pure.
//   payload     — the CURRENT editable payload (already carrying the single edit)
//   serviceKey  — only this service is searched (a sub-item type lives in one service)
//   matchKey    — subKey(editedSub)
//   field       — "price" | "qty" | …
//   oldValue    — the value BEFORE the edit (what siblings must still have to be offered)
//   excludeSubId— the edited sub's id (already at the new value)
//   allOptions  — false = only `optionId`; true = every option
export function bulkSubMatches(payload, { optionId, serviceKey, matchKey, field, oldValue, excludeSubId, allOptions = false } = {}) {
  if (!payload || !matchKey) return [];
  const opts = (payload.options || []).filter((o) => allOptions || o.id === optionId);
  const out = [];
  for (const o of opts) {
    for (const s of (o.services || [])) {
      if (serviceKey != null && s.key !== serviceKey) continue;
      for (const it of (s.items || [])) {
        for (const sub of (it.sub || [])) {
          if (sub.id === excludeSubId) continue;
          if (subKey(sub) !== matchKey) continue;
          if (!numEq(sub[field], oldValue)) continue;   // only still-OLD values → intentional overrides survive
          out.push({ optionId: o.id, itemId: it.id, subId: sub.id });
        }
      }
    }
  }
  return out;
}

// The same rule one level up: the OTHER top-level LINE ITEMS the edit should offer to update. A work order's
// repeated lines ("JBL Speaker Upgrade" ×8) are items, not sub-items, so payout editing needs this twin.
// Two deliberate differences from the sub-item matcher:
//   · a line that HAS sub-items is never a target — its figure is a computed sum of its children, not an
//     editable number, so writing a price onto it would be meaningless.
//   · `excludeItemId` is the edited line.
// Everything else is identical: same canonical name, same still-OLD value, same service, chosen scope.
export function bulkItemMatches(payload, { optionId, serviceKey, matchKey, field, oldValue, excludeItemId, allOptions = false } = {}) {
  if (!payload || !matchKey) return [];
  const opts = (payload.options || []).filter((o) => allOptions || o.id === optionId);
  const out = [];
  for (const o of opts) {
    for (const s of (o.services || [])) {
      if (serviceKey != null && s.key !== serviceKey) continue;
      for (const it of (s.items || [])) {
        if (it.id === excludeItemId) continue;
        if ((it.sub || []).length) continue;             // container line — its amount is a sum, never set
        if (subKey(it) !== matchKey) continue;
        if (!numEq(it[field], oldValue)) continue;       // only still-OLD values → intentional overrides survive
        out.push({ optionId: o.id, itemId: it.id });
      }
    }
  }
  return out;
}

// Apply `field = value` to exactly the targeted lines. A target with a `subId` addresses a SUB-ITEM; one
// without addresses the top-level ITEM itself — so a single primitive drives both levels, and both their
// undos. Returns a NEW payload; everything else is untouched. Used for the bulk apply (→ newValue) and its
// undo (→ oldValue), so the whole operation reverses atomically.
export function applyBulkTargets(payload, targets, field, value) {
  if (!payload || !targets?.length) return payload;
  const subs = new Set(targets.filter((t) => t.subId != null).map((t) => `${t.optionId}|${t.itemId}|${t.subId}`));
  const items = new Set(targets.filter((t) => t.subId == null).map((t) => `${t.optionId}|${t.itemId}`));
  return {
    ...payload,
    options: (payload.options || []).map((o) => ({
      ...o,
      services: (o.services || []).map((s) => ({
        ...s,
        items: (s.items || []).map((it) => {
          const next = items.has(`${o.id}|${it.id}`) ? { ...it, [field]: value } : it;
          if (!(next.sub || []).length) return next;
          return { ...next, sub: next.sub.map((sub) => (subs.has(`${o.id}|${it.id}|${sub.id}`) ? { ...sub, [field]: value } : sub)) };
        }),
      })),
    })),
  };
}

// Sub-item-only alias, kept so existing callers/tests read as before. Targets always carry a subId here.
export function applyBulkSub(payload, targets, field, value) {
  return applyBulkTargets(payload, targets, field, value);
}

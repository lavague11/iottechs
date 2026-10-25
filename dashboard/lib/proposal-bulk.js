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

// Canonical identity for a sub-item: its stable baseName if present, else its (trimmed, lowercased) display
// name. Matching on this — never on raw display text alone — keeps unrelated items with a similar name apart
// once they carry baseName, while still working for legacy sub-items that only have a name.
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

// Apply `field = value` to exactly the targeted sub-items (by {optionId,itemId,subId}). Returns a NEW payload;
// everything else is untouched. Used for both the bulk apply (→ newValue) and its undo (→ oldValue), so the
// whole operation reverses atomically with the same primitive.
export function applyBulkSub(payload, targets, field, value) {
  if (!payload || !targets?.length) return payload;
  const set = new Set(targets.map((t) => `${t.optionId}|${t.itemId}|${t.subId}`));
  return {
    ...payload,
    options: (payload.options || []).map((o) => ({
      ...o,
      services: (o.services || []).map((s) => ({
        ...s,
        items: (s.items || []).map((it) => ({
          ...it,
          sub: (it.sub || []).map((sub) => (set.has(`${o.id}|${it.id}|${sub.id}`) ? { ...sub, [field]: value } : sub)),
        })),
      })),
    })),
  };
}

// Phase 2.5 / Phase-4 groundwork — the reusable DEVICE RESOLVER. Given a natural reference ("camera 3",
// "the front entrance camera", "the camera on the left") and a project's normalized device list (from
// surveyDevices() — the ONE survey device model, never duplicated here), it returns the single device the
// person means, a short list to disambiguate, or nothing. It NEVER guesses: an ambiguous reference comes
// back as { candidates } so the caller asks which one; an unknown reference comes back as { none }. It keys
// off each device's STABLE id (d.id) and its deterministic code ("C3" = the 3rd camera), never an array
// position. Pure: devices are injected, so it's reused by issue-flagging now and by customer feedback /
// survey annotations / device questions later, and is fully unit-testable.
//
// Device shape (from survey2-model surveyDevices): { id, k, kindName, code, identity, label, loc, floor,
//   floorName, x, y, ... }. x/y are PERCENT of the floor image (0–100).

import { kindOf } from "./survey2-model.js";

const norm = (s) => String(s || "").toLowerCase();
const tokensOf = (s) => norm(s).match(/[a-z0-9]+/g) || [];
// Singularize a simple plural so "cameras" matches the kind word "camera".
const sing = (w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

// Words that carry no selection meaning — dropped from the reference before matching.
const REF_STOP = new Set([
  "the", "a", "an", "that", "this", "it", "its", "to", "on", "in", "at", "of", "by", "near", "next",
  "is", "im", "i", "m", "we", "need", "sure", "think", "about", "please", "flag", "issue", "problem",
  "with", "for", "and", "or", "device", "unit", "one", "there", "here", "my", "our", "your", "not",
]);

// Extra kind synonyms beyond the device's own kindName words (which are always matched). Keyed by the
// survey kind `k`. Kept small + unambiguous; the kindName ("Camera", "Speaker", …) does most of the work.
const KIND_SYN = {
  cam: ["cctv"], nvr: ["recorder", "dvr"], disp: ["tv", "monitor", "screen"], amp: ["amplifier"],
  door: ["window", "contact", "sensor"], motion: ["pir"], glass: ["glassbreak"], pos: ["register", "terminal"],
  kprint: ["printer"], ssk: ["kiosk"], fire: ["smoke", "co"],
};

// Spatial region predicates on a device's x/y percent. Used only as a narrower (never to invent a match).
const REGIONS = {
  left: (d) => d.x <= 40, right: (d) => d.x >= 60,
  top: (d) => d.y <= 40, upper: (d) => d.y <= 40, back: (d) => d.y <= 40,
  bottom: (d) => d.y >= 60, lower: (d) => d.y >= 60, front: (d) => d.y >= 60,
  center: (d) => d.x >= 35 && d.x <= 65 && d.y >= 35 && d.y <= 65,
  middle: (d) => d.x >= 35 && d.x <= 65 && d.y >= 35 && d.y <= 65,
};

// The trailing number of a device code ("C3" → 3, "IC12"→12), or null.
function codeNum(code) { const m = String(code || "").match(/(\d+)\s*$/); return m ? Number(m[1]) : null; }

// A compact candidate view for a clarify prompt.
export function candidateView(d) {
  const where = d.loc || d.label || "";
  return { id: d.id, code: d.code, kindName: d.kindName, label: d.label, loc: d.loc, floor: d.floor, floorName: d.floorName,
    display: [d.code, d.kindName, where && where !== d.code ? `(${where})` : ""].filter(Boolean).join(" ").trim() };
}

// Resolve a reference against a device list. Returns:
//   { device }           — one confident match (keyed by stable id)
//   { candidates: [...] } — 2+ plausible matches (caller asks which)
//   { none: true }        — nothing matched (caller says it couldn't find it)
export function resolveDevice(reference, devices) {
  const list = Array.isArray(devices) ? devices.filter((d) => d && d.id != null) : [];
  if (!list.length) return { none: true };
  const refTokens = tokensOf(reference);
  const words = refTokens.filter((w) => w.length >= 2 && !REF_STOP.has(w)).map(sing);
  // Kinds present in THIS project + all their words — used for the kind filter AND quantity detection.
  const presentKinds = [...new Set(list.map((d) => d.k))];
  const allKindWords = new Set();
  for (const k of presentKinds) for (const w of [...tokensOf(kindOf(k).name), ...(KIND_SYN[k] || [])]) allKindWords.add(sing(w));
  // ORDINAL numbers = a number NOT immediately followed by a kind word: "camera 3" is a selector; "3
  // cameras" is a QUANTITY, not device #3. Keeps a count from being mistaken for a device number.
  const ordinals = [];
  for (let i = 0; i < refTokens.length; i++)
    if (/^\d+$/.test(refTokens[i]) && !allKindWords.has(sing(refTokens[i + 1] || ""))) ordinals.push(Number(refTokens[i]));

  // 0) EXACT code token ("c3", "s1") → that device (the deterministic survey code).
  const codeHit = list.filter((d) => d.code && refTokens.includes(norm(d.code)));
  if (codeHit.length === 1) return { device: codeHit[0] };
  if (codeHit.length > 1) return { candidates: codeHit.map(candidateView) };

  // 1) KIND filter — only kinds that actually exist in THIS project (never invent a type).
  const matchedKinds = new Set();
  for (const k of presentKinds) {
    const kw = new Set([...tokensOf(kindOf(k).name), ...(KIND_SYN[k] || [])].map(sing));
    if (words.some((w) => kw.has(w))) matchedKinds.add(k);
  }
  let pool = matchedKinds.size ? list.filter((d) => matchedKinds.has(d.k)) : list.slice();
  // Content words left after removing the kind words (so "camera" doesn't count as a name match for every cam).
  const kindWords = new Set();
  for (const k of matchedKinds) for (const w of [...tokensOf(kindOf(k).name), ...(KIND_SYN[k] || [])].map(sing)) kindWords.add(w);
  const nameWords = words.filter((w) => !kindWords.has(w));

  // 2) ORDINAL — "camera 3" → the pooled device whose code trailing number is 3 (the STABLE code, never an
  // array position: survey codes are per-group and non-contiguous after deletes, so position would lie). A
  // number that matches no code is NOT resolved to a neighbour — we clarify instead (never guess).
  let ordinalUnmatched = false;
  if (ordinals.length) {
    for (const n of ordinals) {
      const byCode = pool.filter((d) => codeNum(d.code) === n);
      if (byCode.length === 1) return { device: byCode[0] };
      if (byCode.length > 1) return { candidates: byCode.map(candidateView) };
    }
    ordinalUnmatched = true;
  }

  // 3) NAME / LOCATION score over the remaining content words (identity, label, loc, floorName).
  let scored = pool.map((d) => {
    const hay = new Set([...tokensOf(d.identity), ...tokensOf(d.label), ...tokensOf(d.loc), ...tokensOf(d.floorName)].map(sing));
    let s = 0; for (const w of nameWords) if (hay.has(w)) s++;
    return { d, s };
  });
  const maxS = scored.reduce((m, x) => Math.max(m, x.s), 0);
  if (maxS > 0) pool = scored.filter((x) => x.s === maxS).map((x) => x.d);

  // 4) SPATIAL narrower — apply only if a region word is present AND it leaves at least one.
  const region = words.map((w) => REGIONS[w]).find(Boolean);
  if (region) { const narrowed = pool.filter(region); if (narrowed.length) pool = narrowed; }

  // 5) DECIDE — one is confident; several is a clarify; zero (with a real discriminator) is none. If nothing
  // discriminated at all (no kind, no name hit, no region) we refuse rather than guess, UNLESS there is
  // exactly one device of the matched kind ("the camera" with a single camera).
  const hadDiscriminator = matchedKinds.size || maxS > 0 || !!region || ordinals.length;
  if (!hadDiscriminator) return { none: true };
  // A named device number that matched no code, with nothing else narrowing, is not a confident single hit —
  // clarify among the kind pool rather than guess a neighbour.
  if (ordinalUnmatched && maxS === 0 && !region)
    return pool.length ? { candidates: pool.slice(0, 6).map(candidateView) } : { none: true };
  if (pool.length === 1) return { device: pool[0] };
  if (pool.length > 1) return { candidates: pool.slice(0, 6).map(candidateView) };
  return { none: true };
}

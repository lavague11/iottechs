// ONE EDITOR AT A TIME — the pure rules.
//
// Why this exists, in one paragraph. The survey lives in the editor's localStorage and a 5-second
// loop pushes that copy to the server. There was a stale-write guard (B14, `baseRev`), but it only
// fired when the client SENT a claim: `toolWriteIsStale` returns false for a missing baseRev —
// "no claim made -> nothing to check" — so a tab that never successfully read the row could push
// its own copy straight over a newer one. ASC0055 lost six named cameras off Floor 1 that way, in a
// single write, after every other fix had shipped.
//
// Two things close it, and both are server-side, because a guard that lives in the browser does not
// stop the stale browser:
//   1. A write to a survey that ALREADY EXISTS must carry a claim. No claim, no write. (db.js,
//      toolWriteNeedsClaim — a client that has genuinely read the row always has one.)
//   2. While somebody is editing, nobody else may write. That is this file: a short lease, held by
//      one editor, renewed by a heartbeat, taken over only deliberately.
//
// The lease is NOT a permission system. It stops two editors writing the same row at once; it says
// nothing about who is allowed to open the survey, which roles.js already decides.

// A lease outlives a heartbeat several times over, so one missed beat (a tunnel, a locked phone)
// never hands the survey to somebody else mid-edit. It is short enough that a closed laptop frees
// the row within a couple of minutes.
export const CLAIM_TTL_MS = 90_000;
export const CLAIM_HEARTBEAT_MS = 25_000;

// Tools where losing the row is unrecoverable and the editor is a person, not a background writer.
// Everything else keeps the old behaviour — this is a targeted fix, not a new regime for every blob.
export const CLAIMED_TOOLS = new Set(["survey", "survey2"]);
export const isClaimedTool = (tool) => CLAIMED_TOOLS.has(String(tool || ""));

const ms = (v) => { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : 0; };

// What a claim row means right now, from the point of view of `meId`.
//   free  — nobody holds it, or the holder stopped renewing and it lapsed
//   mine  — I hold it
//   held  — somebody else holds it, and it has not lapsed
export function claimStatus(row, meId, now = Date.now()) {
  const holder = row && row.editor_id ? String(row.editor_id) : null;
  const renewed = row ? ms(row.renewed_at || row.acquired_at) : 0;
  const expiresAt = renewed ? renewed + CLAIM_TTL_MS : 0;
  if (!holder || !renewed || now >= expiresAt) {
    return { state: "free", holder: null, holderName: null, expiresAt: 0, msLeft: 0 };
  }
  const mine = meId != null && String(meId) === holder;
  return {
    state: mine ? "mine" : "held",
    holder,
    holderName: (row && row.editor_name) || null,
    expiresAt,
    msLeft: expiresAt - now,
  };
}

// May `meId` write this tool right now? Free and mine both yes; somebody else's live lease, no.
export function claimAllowsWrite(row, meId, now = Date.now()) {
  return claimStatus(row, meId, now).state !== "held";
}

// Can `meId` take the lease without a deliberate takeover? Only when it is free or already theirs.
export function claimIsAvailable(row, meId, now = Date.now()) {
  return claimStatus(row, meId, now).state !== "held";
}

// What the UI says. One short line, no instructions: the person either has the survey or they do
// not, and the only question worth asking is whether they want it.
export function claimBanner(status) {
  if (!status || status.state !== "held") return null;
  const who = status.holderName ? status.holderName : "Someone else";
  return `${who} is editing this survey`;
}

// A per-browser-tab editor id. Two tabs belonging to the same person are two EDITORS — which is the
// case that actually loses data, because the stale copy is a stale tab, not a stale colleague.
export function newEditorId() {
  return "ed_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

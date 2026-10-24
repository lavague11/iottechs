// Phase 3.2 — structured feedback / objection capture. PURE: classify a customer objection/feedback utterance
// into a small taxonomy and decide whether it's a capture command, so the AI can turn a conversation into a
// categorized, reviewable project note (never a free-text blob). The device REFERENCE (if any) is resolved
// separately by the device resolver in ai-actions, so the owner's headline works: "not sure we need that
// entrance camera" → an objection:need recorded against that exact camera. No DB, fully unit-testable.

// The review/resolution lifecycle for a captured item (forward-only; admin/manager advance it).
export const FEEDBACK_STATUS = ["open", "reviewed", "resolved"];

// Taxonomy: a "<type>:<category>" string. Types: objection (a reason to hesitate), feedback (a reaction or
// ask), question. Kept small + concrete; unknown → "feedback:other" (never invented beyond this set).
export const FEEDBACK_KINDS = [
  "objection:price", "objection:timeline", "objection:scope", "objection:need", "objection:trust",
  "feedback:request", "feedback:praise", "feedback:concern", "feedback:other",
];

const has = (t, re) => re.test(t);

// Classify the utterance → one FEEDBACK_KIND. Most specific objection wins; then feedback reactions; else
// a generic concern/other. Deterministic and order-sensitive.
export function classifyFeedback(text) {
  const t = String(text || "").toLowerCase();
  // Objections — a concrete reason to hesitate.
  if (has(t, /\b(price|cost|costs|expensive|pricey|budget|afford|too much money|overpriced|charge too)\b/)) return "objection:price";
  if (has(t, /\b(timeline|how long|too long|delay|delayed|take weeks|take months|wait|schedule|turnaround|slow)\b/)) return "objection:timeline";
  if (has(t, /\b(not sure (?:we|they|i) need|don'?t (?:think|need)|do (?:we|they|i) (?:really )?need|unnecessary|overkill|too many|really need|necessary)\b/)) return "objection:need";
  if (has(t, /\b(trust|reliable|reliability|reputation|reviews|guarantee|warranty|proven|track record)\b/)) return "objection:trust";
  if (has(t, /\b(scope|too much equipment|reduce|fewer|less coverage|remove some|cut back)\b/)) return "objection:scope";
  // Feedback — a reaction or an ask.
  if (has(t, /\b(please add|can (?:we|you) add|would like|we want|they want|prefer|instead|change (?:it|this) to|request|move the|relocate)\b/)) return "feedback:request";
  if (has(t, /\b(love|loves|great job|excellent|impressed|very happy|really happy|thrilled|fantastic|appreciate)\b/)) return "feedback:praise";
  if (has(t, /\b(worried|concerned|concern|nervous|hesitant|unsure|uneasy|anxious|uncomfortable)\b/)) return "feedback:concern";
  return "feedback:other";
}

// Does this utterance explicitly reference a DEVICE (so the capture should try to bind it)? A kind word or a
// code/number. (ai-actions does the actual resolution; this only decides whether to attempt it.)
export function mentionsDevice(text) {
  const t = String(text || "").toLowerCase();
  return /\b(camera|cam|cctv|nvr|recorder|speaker|amp|display|monitor|tv|door|window|sensor|motion|glass|keypad|fire|smoke|kiosk|printer|pos|terminal|switch|router|device|entrance)\b/.test(t) || /\b[csatm]\d+\b/.test(t);
}

// Parse a capture command → { kind, body, ref, wantsDevice } or null. Fires on an EXPLICIT capture verb
// ("log/record/capture/note/track … objection/feedback/concern/comment"), on REPORTED speech ("the customer
// is worried / thinks / wants …"), or on the distinctive device-need objection ("not sure we need that
// camera"). It is NOT a question to answer and NOT one of the other action verbs (flag/resolve/send/…), so it
// won't hijack those. `ref` is the full utterance (the device resolver pulls the device out if present).
export function parseFeedback(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return null;
  // Don't swallow the other actions or plain questions.
  if (/\b(flag|raise an issue|resolve|dismiss|send the|advance|assign|record a \$?\d|pay)\b/.test(t)) return null;
  const explicit = /\b(log|record|capture|note|track|jot|save)\b.*\b(objection|feedback|complaint|concern)\b/.test(t)
    || /\b(objection|feedback|complaint)\b.*\b(from|by)\b.*\b(customer|client)\b/.test(t);
  const reported = /\b(customer|client|they|she|he|the owner|buyer)\b.*\b(said|says|thinks|feels|felt|worried|concerned|objected|objects|wants|asked|complained|loves?|happy|unhappy|not sure|doesn'?t (?:think|want))\b/.test(t);
  const deviceNeed = /\b(not sure (?:we|they|i)|don'?t (?:think|see why)|do (?:we|they|i) (?:really )?need|why (?:do )?(?:we|they) need)\b/.test(t) && mentionsDevice(t);
  if (!(explicit || reported || deviceNeed)) return null;
  return { kind: classifyFeedback(t), body: String(text).trim().slice(0, 1000), ref: String(text), wantsDevice: mentionsDevice(t) };
}

// #7 — the staff next-step a DEVICE-BOUND objection suggests, so a captured concern becomes a ready-to-confirm
// revision: a "don't need it" / "too much" objection → drop the line (remove_line); a price objection → revise
// the price (propose_change). Other kinds have no obvious one-click change. Pure.
export function suggestedActionFor(kind) {
  const k = String(kind || "");
  if (k === "objection:need" || k === "objection:scope") return "remove";
  if (k === "objection:price") return "revise";
  return null;
}

// A short human label for a kind ("Price objection", "Concern", "Request"). Pure display.
export function feedbackLabel(kind) {
  const [type, cat] = String(kind || "feedback:other").split(":");
  const C = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  if (type === "objection") return `${C(cat)} objection`;
  if (cat === "other") return "Feedback";
  return C(cat);
}

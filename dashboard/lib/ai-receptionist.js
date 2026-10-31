// Item 2 — the PUBLIC receptionist. An unauthenticated website visitor can ask about services and start a
// quote/service request. This is the highest-injection-risk surface, so it is DELIBERATELY deterministic:
//
//   • No model call on public text, ever. No project/customer reads. No writes except creating a LEAD
//     (name + contact + what they need) through the one canonical entry (db.createLeadProject, server-side).
//   • Answers come only from the approved PUBLIC help library (audience 'customer') — admin-authored, never
//     invented. An unknown question → an honest "I'll have the team follow up" + offer to capture contact.
//   • Everything here is PURE (no I/O): the server action does the gating, rate-limit, persistence, and the
//     actual createLeadProject. This file only recognizes intent and drives the capture state machine.
//
// Capture state is a tiny object { need, name, contact } the caller threads turn-to-turn; the server is the
// authority on when it's complete and on creating the lead.

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;
// A US-style phone: 10 digits, tolerant of (), -, ., spaces, optional +1.
const PHONE_RE = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;

export function extractEmail(text) {
  const m = String(text || "").match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}
export function extractPhone(text) {
  const m = String(text || "").match(PHONE_RE);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? digits : null;
}
// A name only when the visitor clearly gives one ("I'm Sam", "this is Dana Lee", "name is Jo") or the whole
// short message is a plain 1–3 word proper-ish name. Never scraped from a sentence — we'd rather ask again.
export function extractName(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const lead = t.match(/\b(?:i'?m|i am|this is|name'?s|name is|it'?s)\s+([A-Za-z][A-Za-z'.\-]+(?:\s+[A-Za-z][A-Za-z'.\-]+){0,2})/i);
  if (lead) return cleanName(lead[1]);
  if (/^[A-Za-z][A-Za-z'.\-]+(?:\s+[A-Za-z][A-Za-z'.\-]+){0,2}$/.test(t) && !EMAIL_RE.test(t) && !PHONE_RE.test(t) && t.length <= 40 && !LOOKS_LIKE_QUESTION.test(t))
    return cleanName(t);
  return null;
}
const LOOKS_LIKE_QUESTION = /\b(what|how|when|where|why|who|can|do|does|is|are|cost|price|quote|install|camera|help)\b/i;
function cleanName(s) {
  return String(s || "").trim().replace(/\s+/g, " ")
    .split(" ").map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ").slice(0, 60) || null;
}

// What service the visitor wants, mapped to a label db.createLeadProject understands (serviceCodeFromText
// turns it into the 2-letter code). Conservative — unknown stays null and the office classifies it.
const SERVICE_CUES = [
  [/\b(cameras?|cctv|surveillance|security cams?|nvr|dvr)\b/i, "CCTV"],
  [/\b(alarms?|intrusion|burglar|motion sensors?|adt)\b/i, "Alarm"],
  [/\b(access control|door (?:access|entry|locks?)|key\s?fobs?|keypads?|intercoms?)\b/i, "Access Control"],
  [/\b(networks?|wifi|wi-?fi|routers?|cabling|data drops?|structured wiring)\b/i, "Networking"],
  [/\b(audio|speakers?|sound systems?|music)\b/i, "Audio"],
  [/\b(tvs?|televisions?|displays?|mounts?|home theater|theatre)\b/i, "Display"],
];
export function detectService(text) {
  const t = String(text || "");
  for (const [re, label] of SERVICE_CUES) if (re.test(t)) return label;
  return null;
}

// The visitor wants a quote / someone to reach out / to get started.
const QUOTE_INTENT = /\b(quote|estimate|pricing|how much|cost|get started|sign up|interested|install|appointment|schedule|consultation|reach out|call me|contact me|someone (?:to )?call|free (?:quote|estimate))\b/i;
export function wantsQuote(text) { return QUOTE_INTENT.test(String(text || "")); }

// The visitor wants a human / is upset / has an emergency → handoff (the server notifies the team).
const HANDOFF_INTENT = /\b(talk|speak|chat)\s+to\s+(?:a\s+)?(?:person|human|someone|rep|representative|agent|the\s+owner|staff)\b|\b(real\s+person|customer\s+service|emergency|urgent)\b|\bi'?m\s+(?:angry|furious|upset|frustrated)\b/i;
export function receptionistHandoff(text) {
  const t = String(text || "");
  if (!HANDOFF_INTENT.test(t)) return null;
  return { urgent: /\b(emergency|urgent|asap|right now)\b/i.test(t) };
}

// A customer who is ALREADY a client asking about THEIR project ("where's my proposal", "my balance",
// "project ASC0123") — the public receptionist has no account context, so it points them to sign in rather
// than guessing. Pure recognizer.
const EXISTING_CLIENT = /\b(my (?:project|proposal|quote|install|appointment|balance|account)|existing (?:customer|client)|already (?:a )?(?:customer|client)|sign in|log ?in|my portal|track my)\b/i;
export function looksLikeExistingClient(text) { return EXISTING_CLIENT.test(String(text || "")); }

// Merge newly-found fields into the capture state (immutably). Never overwrites a field already set.
export function mergeLead(state = {}, text) {
  const next = { ...state };
  if (!next.contact) {
    const email = extractEmail(text), phone = extractPhone(text);
    if (email) next.contact = { kind: "email", value: email };
    else if (phone) next.contact = { kind: "phone", value: phone };
  }
  if (!next.name) { const n = extractName(text); if (n) next.name = n; }
  if (!next.need) { const s = detectService(text); if (s) next.need = s; }
  return next;
}
export function leadComplete(state = {}) { return !!(state.name && state.contact && state.contact.value); }
export function missingLeadField(state = {}) {
  if (!state.need) return "need";
  if (!state.name) return "name";
  if (!state.contact) return "contact";
  return null;
}

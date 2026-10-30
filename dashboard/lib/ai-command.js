// AI command center — interpreter core (Phase 1, proposal builder). PURE + isomorphic: a deterministic
// router handles the common phrasings with ZERO tokens, and only what it can't parse falls through to a
// small Claude (Haiku) call that returns the SAME structured-intent shape. Nothing here executes a write —
// it only turns text into a validated intent; the server action applies it through existing, role-guarded
// paths (saveProposalDraft / addProjectNote), and the UI previews every write before it lands.
//
// Intent shapes (the one contract the router, Claude and the executor all speak):
//   { type: "navigate_project", query }
//   { type: "add_items", name, qty, price }      price optional (null → price book)
//   { type: "set_discount", pct }                0–100
//   { type: "add_note", body }
//   { type: "unsupported", reason }              understood, but not a Phase-1 capability
//   { type: "unknown" }                          couldn't parse

import { detectAction } from "./ai-project-actions.js";
import { isExplainItem } from "./quote-glossary.js";

const MONEY = (s) => { const n = parseFloat(String(s).replace(/[,$\s]/g, "")); return Number.isFinite(n) ? n : null; };
const clampQty = (n) => Math.max(1, Math.min(999, Math.round(n)));

// Map free text to a lifecycle stage key (the same keys ai-answer's projects_by_stage understands). Most
// specific phrasings first; returns null when no stage word is present so a plain "projects" nav isn't stolen.
const STAGE_WORDS = [
  [/\b(qc|quality[\s-]*control)\b/i, "qc"],
  [/\b(site[\s-]*survey|survey)\b/i, "site_survey"],
  [/\b(approval|deposit)\b/i, "approval_deposit"],
  [/\b(install(ation|ing|ed)?)\b/i, "install"],
  [/\b(schedul(e|ed|ing))\b/i, "schedule"],
  [/\b(payment|paid|collect(?:ing)?\s+payment)\b/i, "payment"],
  [/\b(completion|complete[d]?|finished|done)\b/i, "completion"],
  [/\b(inquiry|lead|leads)\b/i, "inquiry"],
  [/\b(proposal|proposals)\b/i, "proposal"],
];
function stageFromText(text) {
  const t = String(text || "");
  for (const [re, stage] of STAGE_WORDS) if (re.test(t)) return stage;
  return null;
}

// Deterministic router: exact enough to be safe, forgiving enough to be useful. Returns an intent or null
// (null = hand it to Claude). Order matters — the most specific patterns first.
export function routeCommand(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  // "add 8 cameras at $300", "add 8 cameras", "add a camera for 300"
  let m = t.match(/\badd\s+(\d+|a|an|one)\s+(camera|cameras|cam|cams)\b(?:.*?(?:at|for|@|each)\s*\$?\s*([\d,.]+))?/i);
  if (m) {
    const qtyWord = m[1].toLowerCase();
    const qty = clampQty(/^(a|an|one)$/.test(qtyWord) ? 1 : parseInt(qtyWord, 10));
    const price = m[3] != null ? MONEY(m[3]) : null;
    return { type: "add_items", name: "Camera", qty, price };
  }

  // "15% discount", "give them 15% off", "discount 15%", "15 percent discount"
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:discount|off)?/i);
  if (/\b(discount|off)\b/i.test(t) && m) {
    const pct = parseFloat(m[1]);
    if (pct >= 0 && pct <= 100) return { type: "set_discount", pct };
  }

  // "change the cameras to $275", "set the pool camera to $250 each" — price edit on existing item(s).
  // Requires a $ so it reads as a price, and excludes the discount phrasings handled above.
  m = t.match(/^(?:change|set|update|make)\s+(?:the\s+|all\s+(?:the\s+)?)?(.{2,40}?)\s+to\s+\$\s*([\d,.]+)(?:\s*(?:each|apiece|a\s*piece))?\.?$/i);
  if (m && !/\b(discount|off|deposit|tax)\b/i.test(t)) {
    const price = MONEY(m[2]);
    if (price != null) return { type: "edit_item", match: { name: m[1].replace(/s$/i, "").trim() }, set: { price } };
  }

  // "rename camera 3 to Front Door", "rename the pool camera to Backyard Cam", "call the dvr Main Recorder"
  // — rename an EXISTING line item. Distinct verbs from the price edit above; refuse if the new value is a $.
  m = t.match(/^(?:rename|relabel|call)\s+(?:the\s+)?(.{2,40}?)\s+(?:to|as)\s+(.{1,80})$/i);
  if (m && !/\$|\bpercent\b|%/.test(m[2])) {
    const newName = m[2].trim().replace(/^["']|["'.]+$/g, "").trim();
    const ref = m[1].replace(/s$/i, "").trim();
    if (newName && ref) return { type: "edit_item", match: { name: ref }, set: { name: newName } };
  }

  // "move the cameras section to the top", "put audio last", "move software up" — reorder whole sections.
  m = t.match(/^(?:move|put|send|bring)\s+(?:the\s+)?(.{2,40}?)\s+(?:section\s+)?(?:to\s+(?:the\s+)?)?(top|bottom|up|down|first|last)\b/i);
  if (m) {
    const to = { first: "top", last: "bottom" }[m[2].toLowerCase()] || m[2].toLowerCase();
    return { type: "reorder_section", match: { name: m[1].replace(/\s+section$/i, "").trim() }, to };
  }

  // "note: wants two more cameras", "add a note that ...", "log that ..." — but a STRUCTURED capture/flag/
  // payment phrased as "log …" (e.g. "log the customer's objection about price", "log a $500 payment") is an
  // ACTION, not a plain note, so detectAction wins here before we fall back to a free-text note.
  m = t.match(/^(?:add\s+a\s+)?(?:note|log)\b(?:\s+that\b|\s*[:\-])?\s*(.+)/i);
  if (m && m[1].trim().length > 1) {
    const a = detectAction(t);
    if (a) return { type: "action", name: a.name, ...(a.args ? { args: a.args } : {}), target: "this" };
    return { type: "add_note", body: m[1].trim() };
  }

  // ---- Questions → RETRIEVE + answer (never navigate). High-confidence phrasings only; the rest go to Claude.
  // "how much is the Crazy Cars proposal", "what's the proposal total", "how much is their proposal"
  m = t.match(/^how much(?:'s|\s+is|\s+are)?\s+(?:the\s+)?(.*?)\s*(?:proposal|quote|total|cost)\b/i);
  if (m) { const tg = m[1].replace(/\b(the|their|this|that|project|customer|'s)\b/gi, "").replace(/\s+/g, " ").trim(); return { type: "answer", query: "proposal_total", ...(tg ? { target: tg } : { target: "this" }) }; }
  // "who needs a signature nudge", "signature reminders due", "who should I chase for signatures" → the cadence
  // QUEUE (sent-but-unsigned + due for a reminder). Must come before the plain awaiting_signature read below.
  // Needs a QUERY cue (who/which/any/list) so an imperative like "remind the customer to sign" stays the
  // request_signature ACTION (handled later in detectAction), not this list read.
  if (/\b(who|which|any|list|show|how many)\b/i.test(t) && /\b(nudge|nudges|chase|chasing|remind|reminder|reminders|follow[-\s]?up)\b/i.test(t) && /\b(sign|signature|signatures|proposal|proposals)\b/i.test(t))
    return { type: "answer", query: "signature_nudges" };
  // "who owes money", "which deposits are unpaid", "who's due for a payment reminder" → the collections
  // QUEUE (unpaid deposit/balance due for a reminder). Query-cue-gated like the nudge read. Needs all three
  // groups (cue + collections verb + money noun); bare "collections due" falls to the Haiku whitelist.
  if (/\b(who|which|any|list|show|how many|collections?)\b/i.test(t) && /\b(owe|owes|owing|outstanding|unpaid|overdue|collect|collections|chase|nudge|remind|reminder|reminders)\b/i.test(t) && /\b(deposit|deposits|balance|balances|payment|payments|pay|money)\b/i.test(t))
    return { type: "answer", query: "collections_queue" };
  // "which proposals aren't signed", "who hasn't signed", "unsigned proposals", "what's awaiting signature"
  if (/\b(unsigned|not signed|aren'?t signed|haven'?t signed|hasn'?t signed|awaiting (?:a )?signature|still need(?:s)? (?:a )?signature|need(?:s)? to sign)\b/i.test(t) && /\b(proposal|proposals|sign|signed|signature|who|which|how many)\b/i.test(t))
    return { type: "answer", query: "awaiting_signature" };
  // "what needs QC", "which projects need quality control", "anything in QC"
  if (/\b(qc|quality[\s-]*control)\b/i.test(t) && /\b(need|needs|in|which|what|any|how many|require)\b/i.test(t))
    return { type: "answer", query: "projects_by_stage", stage: "qc" };
  // "which projects are in install", "what's in the schedule stage", "how many projects need payment" — any stage.
  if (/\bprojects?\b/i.test(t) && /\b(which|what|how many|list|show|any|anything|in|at|need|needs|require)\b/i.test(t)) {
    const st = stageFromText(t);
    if (st) return { type: "answer", query: "projects_by_stage", stage: st };
  }
  // "what does camera 3 cover", "coverage of the entrance camera", "where is camera 3 aimed", "why is there a
  // camera at the entrance", "what does the lobby camera see" → explain a device's coverage from the survey.
  // BEFORE project_status, so "where is camera 3 aimed" is a device read, not a project-status lookup.
  if (/\b(camera|cam|speaker|sensor|motion|glass|keypad|nvr|device)\b/i.test(t)
      && /\b(cover|covers|coverage|aim|aimed|facing|field of view|fov|range|reach|what (?:area|part|direction)|why (?:is|are|do|does) (?:there|we|they))\b/i.test(t)
      && !/\b(flag|report|raise|resolve|dismiss|assign|send|record|pay|add|remove)\b/i.test(t))   // an action verb → not a coverage read (e.g. "flag the camera covering X" → raise_issue)
    return { type: "answer", query: "device_coverage", ref: t, target: "this" };

  // #6 Explain-the-quote — AFTER device_coverage so "what does camera 3 cover" stays a coverage read.
  // "what's an NVR", "why do I need the drop", "what does the labor cover" → explain ONE line from the glossary,
  // grounded in their package. isExplainItem = an explain cue AND a known glossary term (so it never hijacks FAQ).
  if (isExplainItem(t)) return { type: "answer", query: "explain_item", ref: t, target: "this" };
  // "compare the options", "difference between A and B", "what are my options" → compare the proposal's options.
  if (/\b(compare|difference|differ|versus|vs\.?|which (?:option|package) (?:is|should)|what(?:'?s| is| are)?\s+(?:my|the)\s+options?|two options|both options|other option|option\s+[ab]\b)\b/i.test(t)
      && /\b(option|options|package|packages|quote|proposal|a and b|a or b)\b/i.test(t))
    return { type: "answer", query: "compare_options", target: "this" };
  // "how does the deposit work", "payment terms", "what's the PCP credit", "how much up front" → explain terms.
  // Excludes the balance/owed phrasings (those are project_money, handled below).
  if (/\b(deposit|payment (?:plan|terms|schedule)|pcp|up ?front|financing|how much (?:to start|down))\b/i.test(t)
      && /\b(how|what|explain|work|works|mean|means|terms|plan|schedule|credit|do i|is the|are the)\b/i.test(t)
      && !/\b(balance|owed|owe|left to pay|amount due|paid so far|remaining)\b/i.test(t))
    return { type: "answer", query: "explain_terms", ref: t, target: "this" };

  // "what's the feedback", "any objections", "open concerns", "feedback summary" → summarize captured feedback.
  // (Capturing — "log the objection …" — is handled earlier in the note branch as an action, not here.)
  if (/\b(feedback|objections?|concerns?)\b/i.test(t) && /\b(summary|summarize|open|outstanding|any|what|which|list|show|logged|review|so far)\b/i.test(t))
    return { type: "answer", query: "feedback_summary", target: "this" };

  // "what's going on with Crazy Cars", "status of Crazy Cars", "where is Crazy Cars at"
  m = t.match(/^(?:what'?s\s+(?:going on|happening|the status)\s+(?:with|on|for)|status\s+(?:of|on|for)|where(?:'?s|\s+is)|how'?s)\s+(.+?)\s*(?:\bat\b)?[.?!]*$/i);
  if (m) { const tg = m[1].replace(/'s\s*$/, "").trim(); if (tg) return { type: "answer", query: "project_status", target: /^(it|this|that|the project)$/i.test(tg) ? "this" : tg }; }

  // Project-page intelligence (default to THIS project). "what's next / holding us up / whose turn /
  // what else can we do / what should I focus on" → the operational brain. The rest are scoped reads.
  if (/\b(what'?s? next|next step|what should (?:i|we) (?:do|focus on)|what(?:'?s| is) (?:holding|blocking)|what'?s the blocker|why (?:is|are) (?:this|we|it) (?:stuck|blocked|waiting)|whose turn|who('?s| is| are we)?\s*(?:waiting|up|owe)|what else can we do|what can we (?:do|work on)|move this forward)\b/i.test(t))
    return { type: "answer", query: "project_next", target: "this" };
  if (/\b(balance|owed|how much (?:is )?(?:left|paid|remaining)|amount due|paid so far)\b/i.test(t) && !/\b(proposal|invoices?|receivables?)\b/i.test(t))
    return { type: "answer", query: "project_money", target: "this" };
  if (/\b(my payout|what(?:'?s| is) my (?:pay|payout|cut)|what do i (?:get paid|make)|my pay on)\b/i.test(t))
    return { type: "answer", query: "project_payout", target: "this" };
  if (/\b(open issues|any (?:issues|problems)|issues? (?:on|with) (?:this|it)|any flags)\b/i.test(t))
    return { type: "answer", query: "project_issues", target: "this" };
  if (/\b(how long (?:has|in|at)|days in (?:this )?stage|how long (?:have we|has this) been)\b/i.test(t))
    return { type: "answer", query: "project_timeline", target: "this" };

  // Bug report → Maya files it in the bug portal (page/role/browser auto-captured server-side). Project-
  // agnostic: works from any screen, with or without a project open. The FULL utterance is the description.
  if (/^(?:report|file|log|submit|raise)\s+(?:a\s+)?bug\b/i.test(t) || /\b(there'?s\s+a\s+bug|found\s+a\s+bug|this\s+(?:is|isn'?t)\s+(?:broken|working)|something(?:'s| is)\s+(?:broken|not\s+working|wrong|glitch\w*)|it'?s\s+broken)\b/i.test(t))
    return { type: "report_bug", text: t };

  // Phase-2 project ACTIONS (mutations) — a confirmed, guarded intent. "send the proposal" → send_proposal;
  // "record a $1,530 deposit" → record_payment with args. The server re-validates args + state on apply.
  { const a = detectAction(t); if (a) return { type: "action", name: a.name, ...(a.args ? { args: a.args } : {}), target: "this" }; }

  // "take me to the proposal", "open the site survey", "go to Crazy Cars", "open up Crazy Cars",
  // "can you pull up Crazy Cars", "let's look at the car dealership project". Spoken navigation comes with a
  // lot of filler — a polite lead-in, a two-word verb ("open up", "pull up", "take me to"), and trailing
  // words ("...project", "...for me"). We strip ALL of it so only the entity name is searched; otherwise the
  // particle leaks into the query ("up Crazy Cars") and nothing matches. A known SECTION wins (in-project
  // nav); anything else is a project/customer name.
  m = t.match(NAV_RE);
  if (m) {
    const tgt = cleanTarget(m[1]);
    if (tgt.length >= 2) {
      const sec = resolveSection(tgt);
      // A bare section phrase ("the proposal") → that section. But a NAME before a section word
      // ("Crazy Cars proposal") means open THAT project — not the current project's proposal.
      const residue = sec ? cleanTarget(tgt.replace(SECTION_WORDS, " ")) : tgt;
      if (sec && !residue) return { type: "navigate_section", stage: sec.stage, open: sec.open, label: sec.label };
      const name = (residue || tgt).replace(/\s+(?:project|account|job|file|customer|client)$/i, "").trim();
      if (name.length >= 2 && !/\b(invoice|invoices|payments?)\b/i.test(name)) return { type: "navigate_project", query: name };
      if (sec) return { type: "navigate_section", stage: sec.stage, open: sec.open, label: sec.label };
    }
  }

  return null;
}
// Section keywords, to tell "the proposal" (a section) from "Crazy Cars proposal" (a named project).
const SECTION_WORDS = /\b(site\s*survey|survey|mock\s*ups?|proposals?|approvals?|deposits?|schedul\w*|install\w*|qc|quality\s*control|payments?|completions?|signatures?|signing)\b/ig;

// Spoken navigation grammar: [optional politeness] [verb + optional particle] <target>.
const NAV_RE = /^(?:(?:please|hey|ok|okay|so|now)\s+)*(?:(?:can|could|would|will)\s+you\s+|i(?:'?d|\s+would)?\s+(?:like|want|wanna)(?:\s+to)?\s+|let'?s\s+|lemme\s+|let\s+me\s+)?(?:open|pull|bring|take|show|go|jump|navigate|load|look|view|find)(?:\s+(?:up|to|at|into|me|me\s+to|over\s+to))*\s+(.{2,})/i;
// Strip leading particles/filler ("up", "the", "uh,") — punctuation-aware so "up, uh, Crazy Cars" cleans to
// "Crazy Cars" — plus trailing politeness. Keeps "proposal"/"survey" etc. so a bare section name still routes.
const NAV_LEAD = /^(?:up|to|at|into|over\s+to|the|a|an|me|my|our|your|that|this|some|uh+|um+|er+|like|please|for\s+me)[\s,.]+/i;
const edgePunct = (s) => s.replace(/^[\s,.?!]+|[\s,.?!]+$/g, "");
function cleanTarget(raw) {
  let s = edgePunct(String(raw || "").trim());
  s = s.replace(/\s+(?:please|for\s+me|thanks|thank\s+you|real\s+quick|again)$/i, "").trim();
  let prev;
  do { prev = s; s = edgePunct(s.replace(NAV_LEAD, "")); } while (s !== prev);
  return s;
}

// --- Line-item reference resolver: turn a natural-language reference ("the 8 cameras I just added",
// "the DVR") into the SPECIFIC item(s) it points at. Pure, so the server (preview) and client (apply)
// resolve identically. Searches the first option's items (single-option proposals are the common case).
const norm = (s) => String(s || "").toLowerCase().trim();
const NAME_SYN = { dvr: "nvr", recorder: "nvr", cam: "camera", cams: "camera", cameras: "camera", mic: "microphone", speakers: "speaker" };
function nameMatches(itemName, q) {
  const a = norm(itemName), b = norm(q);
  if (!b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const syn = NAME_SYN[b]; if (syn && a.includes(syn)) return true;
  // Token overlap — a multi-word reference matches when every meaningful word is present (so
  // "side door sensor" → "Side Door Door/Window Sensor", "pool camera" → "Pool (Yard Side) Camera").
  const toks = b.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (toks.length >= 2 && toks.every((w) => a.includes(w) || (NAME_SYN[w] && a.includes(NAME_SYN[w])))) return true;
  return false;
}
export function describeMatch(m = {}) {
  const bits = [];
  if (m.qty != null) bits.push(`${m.qty}`);
  if (m.name) bits.push(`"${m.name}"`);
  if (m.priceEach != null) bits.push(`at $${m.priceEach}`);
  return bits.length ? bits.join(" ") : "that item";
}
export function resolveItems(payload, match = {}, { optionId } = {}) {
  const opts = payload?.options || [];
  const opt = optionId ? opts.find((o) => o.id === optionId) : opts[0];
  if (!opt) return [];
  const out = [];
  (opt.services || []).forEach((s, svcIdx) => (s.items || []).forEach((it, itemIdx) => {
    out.push({ optionId: opt.id, svcIdx, itemIdx, id: it.id, name: it.name, qty: +it.qty || 0, price: +it.price || 0, serviceKey: s.key, serviceLabel: s.label });
  }));
  return out.filter((c) => {
    if (match.id) return c.id === match.id;
    if (match.name && !nameMatches(c.name, match.name)) return false;
    if (match.qty != null && c.qty !== +match.qty) return false;
    if (match.priceEach != null && c.price !== +match.priceEach) return false;
    return true;
  });
}

// Find a proposal SECTION (service) by name — label or key, fuzzy. Returns its index in the first option.
export function resolveServiceIndex(payload, match = {}, { optionId } = {}) {
  const opts = payload?.options || [];
  const opt = optionId ? opts.find((o) => o.id === optionId) : opts[0];
  if (!opt) return -1;
  const name = norm(match.name);
  if (!name) return -1;
  const svcs = opt.services || [];
  const exact = svcs.findIndex((s) => norm(s.label) === name || norm(s.key) === name);
  if (exact >= 0) return exact;
  return svcs.findIndex((s) => nameMatches(s.label, name) || nameMatches(s.key, name));
}

// In-project navigation targets: a phrase → the deck deep-link (?stage= + optional ?open=<tool>) that the
// gateway understands. Pure + data-driven so "take me to the proposal / survey / payment" resolves the same
// in the router and the Haiku fallback. Stage keys are lib/stage-flow MASTER_ORDER; open slugs are the
// gateway's OPEN_TOOL_NAMES.
const SECTION_NAV = [
  { re: /\b(site[\s-]*survey|survey|floor[\s-]*plan|consulting)\b/, stage: "site_survey", open: "survey", label: "Site Survey" },
  { re: /\b(mock[\s-]?up|mockups?|camera[\s-]*views?|\bviews\b|layout)\b/, stage: "site_survey", open: "mockup", label: "Mockups" },
  { re: /\b(proposal|quote|pricing)\b/, stage: "proposal", open: "proposal", label: "Proposal" },
  { re: /\b(approval|deposit|sign[\s-]?off|signature|accept)\b/, stage: "approval_deposit", open: "deposit", label: "Approval & Deposit" },
  { re: /\b(schedule|appointment|booking)\b/, stage: "schedule", open: null, label: "Schedule" },
  { re: /\b(install(?:ation)?|work[\s-]*order)\b/, stage: "install", open: null, label: "Install" },
  { re: /\b(quality[\s-]*control|\bqc\b|quality)\b/, stage: "qc", open: null, label: "Quality Control" },
  { re: /\b(final[\s-]*payment|payment|invoice|balance)\b/, stage: "payment", open: "payment", label: "Payment" },
  { re: /\b(completion|wrap[\s-]?up|warranty|certificate)\b/, stage: "completion", open: null, label: "Completion" },
];
export function resolveSection(text) {
  const t = norm(text);
  for (const s of SECTION_NAV) if (s.re.test(t)) return { stage: s.stage, open: s.open || null, label: s.label };
  return null;
}

// Apply an intent to a proposal payload — PURE, returns a NEW payload + a one-line change summary, or an
// error. The server recomputes this from the CURRENT stored proposal so a stale/forged client payload can
// never drive the write; the same function runs client-side only to preview.
export function applyIntentToPayload(payload, intent, { priceOf } = {}) {
  const p = structuredClone(payload || {});
  if (!Array.isArray(p.options) || !p.options.length) return { error: "This proposal has no options to edit yet." };

  if (intent.type === "add_items") {
    const qty = clampQty(intent.qty || 1);
    const price = intent.price != null ? +intent.price : (priceOf ? +priceOf(intent.name) || 0 : 0);
    const opt = p.options[0];
    opt.services = Array.isArray(opt.services) ? opt.services : [];
    let svc = opt.services.find((s) => s.key === "camera");
    if (!svc) { svc = { key: "camera", label: "Security Cameras", items: [] }; opt.services.push(svc); }
    svc.items = Array.isArray(svc.items) ? svc.items : [];
    svc.items.push({ id: "ai-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: intent.name || "Camera", qty, price, cost: 0 });
    return { payload: p, summary: `Add ${qty} × ${intent.name || "Camera"} at $${price.toFixed(2)}` };
  }

  if (intent.type === "set_discount") {
    const pct = Math.max(0, Math.min(100, +intent.pct || 0));
    p.discount = { type: "pct", value: pct };
    return { payload: p, summary: `Set discount to ${pct}%` };
  }

  if (intent.type === "edit_item") {
    const opt = p.options[0];
    const matches = resolveItems(p, intent.match || {}, { optionId: opt.id });
    if (!matches.length) return { error: `No line item matching ${describeMatch(intent.match)}.` };
    const set = intent.set || {};
    const renaming = set.name != null, moving = intent.moveToService != null;
    // A rename or a move must target exactly ONE item — otherwise hand back the candidates to disambiguate.
    if ((renaming || moving) && matches.length > 1) {
      return { ambiguous: matches.map((m) => ({ id: m.id, label: `${m.name} · qty ${m.qty} · $${m.price.toFixed(2)}` })), action: renaming ? "rename" : "move" };
    }
    const oldName = matches.length === 1 ? matches[0].name : null;
    const parts = [];
    for (const m of matches) {
      const it = opt.services[m.svcIdx].items[m.itemIdx];
      if (set.qty != null) it.qty = clampQty(set.qty);
      if (set.price != null) it.price = Math.max(0, +set.price);
      if (set.name != null) it.name = String(set.name).slice(0, 80);   // price/qty untouched — a rewrite never changes them
    }
    if (set.price != null) parts.push(`$${(+set.price).toFixed(2)}`);
    if (set.qty != null) parts.push(`qty ${clampQty(set.qty)}`);
    if (set.name != null) parts.push(oldName ? `"${oldName}" → "${String(set.name).slice(0, 48)}"` : `renamed to "${String(set.name).slice(0, 48)}"`);
    if (moving) {
      const m = matches[0], from = opt.services[m.svcIdx];
      const [it] = from.items.splice(m.itemIdx, 1);
      const key = norm(intent.moveToService);
      let dest = opt.services.find((s) => norm(s.key) === key || norm(s.label).includes(key));
      if (!dest) { dest = { key: intent.moveToService, label: intent.moveToService.replace(/\b\w/g, (c) => c.toUpperCase()), items: [] }; opt.services.push(dest); }
      dest.items.push(it);
      parts.push(`moved to ${dest.label}`);
    }
    const label = matches.length > 1 ? `${matches.length} items` : `"${oldName}"`;
    return { payload: p, summary: `Set ${label} — ${parts.join(", ")}`, count: matches.length };
  }

  if (intent.type === "set_desc") {
    const opt = p.options[0];
    const matches = resolveItems(p, intent.match || {}, { optionId: opt.id });
    if (!matches.length) return { error: `No line item matching ${describeMatch(intent.match)}.` };
    const desc = String(intent.desc || "").trim().slice(0, 600);
    if (!desc) return { error: "No description to write." };
    for (const m of matches) opt.services[m.svcIdx].items[m.itemIdx].desc = desc;   // name/price/qty untouched
    const label = matches.length > 1 ? `${matches.length} items` : `"${matches[0].name}"`;
    return { payload: p, summary: `Describe ${label}`, desc, count: matches.length };
  }

  if (intent.type === "reorder_section") {
    const opt = p.options[0];
    const svcs = Array.isArray(opt.services) ? opt.services : [];
    if (svcs.length < 2) return { error: "There's only one section — nothing to reorder." };
    const idx = resolveServiceIndex(p, intent.match || {}, { optionId: opt.id });
    if (idx < 0) return { error: `No section matching ${describeMatch(intent.match)}.` };
    const to = intent.to;
    const target = to === "top" ? 0 : to === "bottom" ? svcs.length - 1 : to === "up" ? Math.max(0, idx - 1) : to === "down" ? Math.min(svcs.length - 1, idx + 1) : -1;
    if (target < 0) return { error: "Say top, bottom, up or down." };
    const name = svcs[idx].label || svcs[idx].key;
    if (target === idx) return { error: `"${name}" is already ${to === "up" || to === "top" ? "at the top" : "at the bottom"}.` };
    const [m] = svcs.splice(idx, 1);
    svcs.splice(target, 0, m);
    return { payload: p, summary: `Move "${name}" ${to === "top" || to === "bottom" ? "to the " : ""}${to}`, reorder: true };
  }

  if (intent.type === "remove_item") {
    const opt = p.options[0];
    const matches = resolveItems(p, intent.match || {}, { optionId: opt.id });
    if (!matches.length) return { error: `No line item matching ${describeMatch(intent.match)}.` };
    // A remove must target exactly ONE line unless the caller passed a specific id — otherwise disambiguate.
    if (matches.length > 1 && !intent.match?.id) return { ambiguous: matches.map((m) => ({ id: m.id, label: `${m.name} · qty ${m.qty} · $${m.price.toFixed(2)}` })), action: "remove" };
    const ids = new Set(matches.map((m) => m.id));
    const removed = matches.map((m) => m.name);
    opt.services.forEach((s) => { s.items = (s.items || []).filter((it) => !ids.has(it.id)); });
    return { payload: p, summary: `Remove ${removed.join(", ")}`, removed };
  }

  return { error: "That isn't a proposal edit." };
}

// ---- Claude fallback: parse free-form text into the SAME intent shape ----
// Two-tier model routing (owner, 2026-10-30): a fast/cheap model handles everyday chat; a stronger model
// handles the heavy asks — invoicing, large quotes, complex diagnostics, and multi-step requests. The
// router's 0-token path still runs first, so neither model is touched for the common commands.
export const AI_MODEL_FAST = "claude-haiku-4-5";
export const AI_MODEL_SMART = "claude-sonnet-4-6";   // matches the Sonnet the rest of the app uses (read-licence, verify-document)
export const AI_MODEL = AI_MODEL_FAST;               // back-compat default
// Pick the model for a free-form command. Pure + tested. Escalates on cues for the four heavy classes; a
// long / clearly multi-step utterance (several chained actions) also escalates. Everything else stays fast.
const SMART_CUES = /\b(invoice|invoicing|bill(?:ing)?|addendum|diagnos(?:e|is|tic)|troubleshoot|why\s+(?:is|are|isn'?t|aren'?t).*(?:not working|offline|fail|down|no\s+(?:signal|feed|video)))\b/i;
// A real quote/proposal DRAFTING ask (create/draft/build a quote, or a large/full one) — not "how much is
// the quote" (that's a read the router answers). Escalates to the strong model.
const QUOTE_CUES = /\b(draft|create|build|write|prepare|generate|put together)\b.{0,30}\b(quote|proposal|estimate)\b|\b(large|big|full|whole|entire|detailed|complex)\b.{0,24}\b(quote|proposal|system|job)\b/i;
const MULTISTEP = /\b(then|after that|also|and then|followed by)\b/i;
export function pickModel(text) {
  const t = String(text || "");
  if (SMART_CUES.test(t) || QUOTE_CUES.test(t)) return AI_MODEL_SMART;
  // multi-step: an explicit sequencing word, OR several "and"-joined action verbs, OR a long request.
  const actionVerbs = (t.match(/\b(add|remove|change|set|send|create|make|rename|move|waive|assign|record|email|draft|update|flag|resolve)\b/gi) || []).length;
  if (MULTISTEP.test(t) || actionVerbs >= 3 || t.length > 180) return AI_MODEL_SMART;
  return AI_MODEL_FAST;
}

const TOOL = {
  name: "proposal_command",
  description: "Turn a staff member's natural-language command into one structured proposal/project action.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["add_items", "edit_item", "set_desc", "reorder_section", "set_discount", "add_note", "answer", "clarify", "navigate_project", "navigate_section", "unsupported", "unknown"] },
      query: { type: "string", enum: ["proposal_total", "project_status", "project_next", "project_money", "project_payout", "project_issues", "project_timeline", "awaiting_signature", "projects_by_stage"], description: "answer: which read-only fact to RETRIEVE (don't navigate). project_next = what's blocking / whose turn / what to do next / what else can proceed. project_money = balance/paid. project_payout = the tech's own pay. project_issues = open install issues. project_timeline = days in stage. These + proposal_total/project_status take a `target` (a project name, or 'this'); projects_by_stage takes a `stage`." },
      target: { type: "string", description: "answer: which project the question is about — a name (\"Crazy Cars\"), an access id, or \"this\"/\"that\" for the current/last project in context." },
      stage: { type: "string", description: "answer projects_by_stage: survey, proposal, approval, schedule, install, qc, payment or completion." },
      ask: { type: "string", description: "clarify: ONE short question to get a missing detail (e.g. which project, how many), instead of refusing." },
      name: { type: "string", description: "line-item name for add_items, e.g. Camera" },
      qty: { type: "integer", description: "quantity for add_items" },
      price: { type: ["number", "null"], description: "unit price for add_items; null to use the price book" },
      match: { type: "object", description: "edit_item / set_desc: find the EXISTING line item(s); reorder_section: find the section by name", properties: { name: { type: "string" }, qty: { type: "integer" }, priceEach: { type: "number" } } },
      set: { type: "object", description: "edit_item: new values. RENAME a product → set.name (the exact new name the user gave). This does NOT write a description — use set_desc for that.", properties: { qty: { type: "integer" }, price: { type: "number" }, name: { type: "string" } } },
      desc: { type: "string", description: "set_desc: a short, customer-friendly DESCRIPTION of the matched item(s). Ground it ONLY in the product name/type — never state resolution, megapixels, warranty, night-vision, IP rating, codec or any spec/feature unless those exact words appear in the product name." },
      moveToService: { type: "string", description: "edit_item: move the matched item into this service (e.g. camera, sound, software)" },
      to: { type: "string", enum: ["top", "bottom", "up", "down"], description: "reorder_section: where to move the section" },
      target: { type: "string", description: "navigate_section: which section of THIS project to open — survey, mockups, proposal, approval, schedule, install, qc, payment or completion" },
      pct: { type: "number", description: "discount percent 0-100 for set_discount" },
      body: { type: "string", description: "note text for add_note" },
      query: { type: "string", description: "project/customer name for navigate_project" },
      reason: { type: "string", description: "for unsupported: what was asked that isn't a proposal edit / note / navigation" },
    },
    required: ["type"],
  },
};

// Compact rolling memory for the model: the sticky context (active project, last customer, retrieved facts,
// pending change) is ALWAYS kept; the raw transcript is trimmed to a char budget — so a long chat about one
// customer never "forgets" who. `context.memory` is preferred; `context.projectName`/`recent` still work.
export function buildMemoryBlock(context = {}) {
  const m = context.memory || null;
  const lines = [];
  const projName = m?.project?.name || context.projectName || null;
  const projId = m?.project?.accessId || null;
  if (projName) lines.push(`Active project: ${projName}${projId ? ` (${projId})` : ""}. "this"/"the proposal"/"them" refer to it.`);
  else lines.push("No project is open.");
  if (m?.customer && m.customer !== projName) lines.push(`Most recent customer referenced: ${m.customer}. "that customer"/"their proposal" mean this one.`);
  if (Array.isArray(m?.facts) && m.facts.length) lines.push(`Facts already retrieved this chat: ${m.facts.slice(-6).join("; ")}.`);
  const pending = m?.pending || null;
  if (pending) lines.push(`A change is PENDING (previewed, not yet applied): ${pending}. A correction like "make it 15% instead" / "actually 10" updates THIS pending change — don't start over.`);
  else if (context.recent) lines.push(`Previous command: "${String(context.recent).slice(0, 160)}". A follow-up like "make it 10" refers to the same item(s).`);
  if (Array.isArray(m?.turns) && m.turns.length) {
    let budget = 1200, conv = [];
    for (let k = m.turns.length - 1; k >= 0; k--) {
      const x = m.turns[k]; const line = `${x.role === "user" ? "User" : "Assistant"}: ${String(x.text || "").slice(0, 200)}`;
      if (budget - line.length < 0) break;
      budget -= line.length + 1; conv.unshift(line);
    }
    if (conv.length) lines.push(`Recent conversation:\n${conv.join("\n")}`);
  }
  return lines.join("\n");
}

export function buildClaudeBody(text, context = {}, opts = {}) {
  return {
    model: opts.model || AI_MODEL,
    max_tokens: 300,
    system:
      "You are Maya, the AI assistant for IOT TECHS, a security-install company — a sharp, warm, efficient executive secretary to the staff. Non-negotiable: never invent prices, inventory, availability, dates, or promises; business facts come only from a real retrieval. Only ever propose the company's approved services and pricing. If you're unsure or lack a supported path, ask (clarify) or say you'll check — never guess. Turn the user's message into ONE structured action via the proposal_command tool. Be genuinely helpful: if they ASK for information, retrieve it; if a command is missing one detail, ask; only refuse when there's truly no supported path. Actions:\n" +
      "- answer: the user is ASKING for a business fact, not giving a command — RETRIEVE it and tell them; do NOT navigate or open anything unless they explicitly say to. Set `query`: proposal_total (\"how much is X's proposal\", \"what's the total\"), project_status (\"what's going on with X\", \"status of X\"), awaiting_signature (\"which proposals aren't signed\", \"who hasn't signed\"), projects_by_stage (\"what needs QC\", \"which jobs are in install\" → set `stage`). Put the project in `target` (a name, or \"this\" for the current one).\n" +
      "- add_items: add line items like cameras.\n" +
      "- edit_item: change an EXISTING line item's price/qty, MOVE it to another section, or RENAME the product (set.name = the exact new name). match = the user's reference, set = only the changes. A rename is NOT a description.\n" +
      "- set_desc: write/improve a line item's customer-facing DESCRIPTION (match + desc). Ground it ONLY in the product name — never invent specs, resolution, warranty, night-vision, IP rating or codecs. Never changes name/price/qty.\n" +
      "- reorder_section: move a whole section (match by name) to top/bottom/up/down.\n" +
      "- set_discount: percent off. - add_note: save a project log note.\n" +
      "- navigate_project: OPEN a different customer/project by name (`query`) — only when they ask to open/go/pull up. - navigate_section: open a section of the current project (`target`: survey, mockups, proposal, approval, schedule, install, qc, payment, completion).\n" +
      "- clarify: a command missing ONE key detail (which project, how many) → ask a short question in `ask` instead of refusing.\n" +
      "- unsupported: understood, but no supported action/read fits (sending messages, recording payments, booking appointments, or a company question like warranty/policy you can't retrieve) → a short honest `reason`; suggest a real alternative when one exists. - unknown: not a command.\n" +
      "RULES: Prefer answer/edit over navigate. NEVER invent data — totals, names, counts, dates or outcomes must come from a real read; if you can't get it, use clarify or unsupported, never a guess. Never invent a price; omit it unless the user stated one.\n" +
      buildMemoryBlock(context),
    tools: [TOOL],
    tool_choice: { type: "tool", name: "proposal_command" },
    messages: [{ role: "user", content: String(text || "").slice(0, 400) }],
  };
}

// Pull the tool-use intent out of a Claude messages response; always returns a valid intent object.
export function parseClaudeResult(json) {
  try {
    const block = (json?.content || []).find((b) => b.type === "tool_use" && b.name === "proposal_command");
    const i = block?.input;
    if (!i || !i.type) return { type: "unknown" };
    switch (i.type) {
      case "add_items": return { type: "add_items", name: String(i.name || "Camera").slice(0, 60), qty: clampQty(+i.qty || 1), price: i.price == null ? null : +i.price };
      case "edit_item": {
        const match = {};
        if (i.match?.id) match.id = String(i.match.id);
        if (i.match?.name) match.name = String(i.match.name).slice(0, 60);
        if (i.match?.qty != null) match.qty = +i.match.qty;
        if (i.match?.priceEach != null) match.priceEach = +i.match.priceEach;
        const set = {};
        if (i.set?.qty != null) set.qty = clampQty(+i.set.qty);
        if (i.set?.price != null) set.price = Math.max(0, +i.set.price);
        if (i.set?.name) set.name = String(i.set.name).slice(0, 80);
        const out = { type: "edit_item", match, set };
        if (i.moveToService) out.moveToService = String(i.moveToService).slice(0, 40);
        // Needs something to find the item AND something to change.
        if (!Object.keys(match).length || (!Object.keys(set).length && !out.moveToService)) return { type: "unknown" };
        return out;
      }
      case "set_desc": {
        const match = {};
        if (i.match?.id) match.id = String(i.match.id);
        if (i.match?.name) match.name = String(i.match.name).slice(0, 60);
        if (i.match?.qty != null) match.qty = +i.match.qty;
        if (i.match?.priceEach != null) match.priceEach = +i.match.priceEach;
        const desc = i.desc ? String(i.desc).replace(/\s+/g, " ").trim().slice(0, 600) : "";
        return Object.keys(match).length && desc ? { type: "set_desc", match, desc } : { type: "unknown" };
      }
      case "reorder_section": {
        const name = i.match?.name ? String(i.match.name).slice(0, 60) : (i.name ? String(i.name).slice(0, 60) : "");
        const to = ["top", "bottom", "up", "down"].includes(i.to) ? i.to : null;
        return name && to ? { type: "reorder_section", match: { name }, to } : { type: "unknown" };
      }
      case "navigate_section": {
        const sec = resolveSection(i.target || i.query || "");
        return sec ? { type: "navigate_section", stage: sec.stage, open: sec.open, label: sec.label }
          : { type: "unsupported", reason: `I can open: Survey, Mockups, Proposal, Approval, Schedule, Install, QC, Payment or Completion.` };
      }
      case "answer": {
        const query = ["proposal_total", "project_status", "project_next", "project_money", "project_payout", "project_issues", "project_timeline", "device_coverage", "explain_item", "compare_options", "explain_terms", "feedback_summary", "awaiting_signature", "signature_nudges", "collections_queue", "projects_by_stage"].includes(i.query) ? i.query : null;
        if (!query) return { type: "unknown" };
        const out = { type: "answer", query };
        if (i.target) out.target = String(i.target).slice(0, 80);
        if (i.stage) out.stage = String(i.stage).slice(0, 40);
        if (query === "device_coverage") out.ref = String(i.ref || i.target || "").slice(0, 160);
        return out;
      }
      case "clarify": return i.ask ? { type: "clarify", ask: String(i.ask).slice(0, 200) } : { type: "unknown" };
      case "set_discount": return { type: "set_discount", pct: Math.max(0, Math.min(100, +i.pct || 0)) };
      case "add_note": return i.body ? { type: "add_note", body: String(i.body).slice(0, 2000) } : { type: "unknown" };
      case "navigate_project": return i.query ? { type: "navigate_project", query: String(i.query).slice(0, 120) } : { type: "unknown" };
      case "unsupported": return { type: "unsupported", reason: String(i.reason || "").slice(0, 200) };
      default: return { type: "unknown" };
    }
  } catch { return { type: "unknown" }; }
}

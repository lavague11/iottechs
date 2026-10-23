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

const MONEY = (s) => { const n = parseFloat(String(s).replace(/[,$\s]/g, "")); return Number.isFinite(n) ? n : null; };
const clampQty = (n) => Math.max(1, Math.min(999, Math.round(n)));

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

  // "note: wants two more cameras", "add a note that ...", "log that ..."
  m = t.match(/^(?:add\s+a\s+)?(?:note|log)\b(?:\s+that\b|\s*[:\-])?\s*(.+)/i);
  if (m && m[1].trim().length > 1) return { type: "add_note", body: m[1].trim() };

  // ---- Questions → RETRIEVE + answer (never navigate). High-confidence phrasings only; the rest go to Claude.
  // "how much is the Crazy Cars proposal", "what's the proposal total", "how much is their proposal"
  m = t.match(/^how much(?:'s|\s+is|\s+are)?\s+(?:the\s+)?(.*?)\s*(?:proposal|quote|total|cost)\b/i);
  if (m) { const tg = m[1].replace(/\b(the|their|this|that|project|customer|'s)\b/gi, "").replace(/\s+/g, " ").trim(); return { type: "answer", query: "proposal_total", ...(tg ? { target: tg } : { target: "this" }) }; }
  // "which proposals aren't signed", "who hasn't signed", "unsigned proposals", "what's awaiting signature"
  if (/\b(unsigned|not signed|aren'?t signed|haven'?t signed|hasn'?t signed|awaiting (?:a )?signature|still need(?:s)? (?:a )?signature|need(?:s)? to sign)\b/i.test(t) && /\b(proposal|proposals|sign|signed|signature|who|which|how many)\b/i.test(t))
    return { type: "answer", query: "awaiting_signature" };
  // "what needs QC", "which projects need quality control", "anything in QC"
  if (/\b(qc|quality[\s-]*control)\b/i.test(t) && /\b(need|needs|in|which|what|any|how many|require)\b/i.test(t))
    return { type: "answer", query: "projects_by_stage", stage: "qc" };
  // "what's going on with Crazy Cars", "status of Crazy Cars", "where is Crazy Cars at"
  m = t.match(/^(?:what'?s\s+(?:going on|happening|the status)\s+(?:with|on|for)|status\s+(?:of|on|for)|where(?:'?s|\s+is)|how'?s)\s+(.+?)\s*(?:\bat\b)?[.?!]*$/i);
  if (m) { const tg = m[1].replace(/'s\s*$/, "").trim(); if (tg) return { type: "answer", query: "project_status", target: /^(it|this|that|the project)$/i.test(tg) ? "this" : tg }; }

  // "take me to the proposal", "open the site survey", "go to Crazy Cars". A known SECTION of THIS project
  // wins (in-project navigation); anything else is treated as a project/customer name.
  m = t.match(/^(?:open|go\s+to|take\s+me\s+to|pull\s+up|show\s+me|jump\s+to)\s+(.{2,})/i);
  if (m) {
    const sec = resolveSection(m[1]);
    if (sec) return { type: "navigate_section", stage: sec.stage, open: sec.open, label: sec.label };
    if (!/\b(invoice|invoices|payments?)\b/i.test(m[1])) return { type: "navigate_project", query: m[1].trim().replace(/[.?!]+$/, "") };
  }

  return null;
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

  return { error: "That isn't a proposal edit." };
}

// ---- Claude (Haiku) fallback: parse free-form text into the SAME intent shape ----
export const AI_MODEL = "claude-haiku-4-5";

const TOOL = {
  name: "proposal_command",
  description: "Turn a staff member's natural-language command into one structured proposal/project action.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["add_items", "edit_item", "set_desc", "reorder_section", "set_discount", "add_note", "answer", "clarify", "navigate_project", "navigate_section", "unsupported", "unknown"] },
      query: { type: "string", enum: ["proposal_total", "project_status", "awaiting_signature", "projects_by_stage"], description: "answer: which read-only business fact to RETRIEVE and tell the user (don't navigate). proposal_total/project_status take a `target`; projects_by_stage takes a `stage`." },
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

export function buildClaudeBody(text, context = {}) {
  return {
    model: AI_MODEL,
    max_tokens: 300,
    system:
      "You are the assistant for a security-install company's staff dashboard. Turn the user's message into ONE structured action via the proposal_command tool. Be genuinely helpful: if they ASK for information, retrieve it; if a command is missing one detail, ask; only refuse when there's truly no supported path. Actions:\n" +
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
        const query = ["proposal_total", "project_status", "awaiting_signature", "projects_by_stage"].includes(i.query) ? i.query : null;
        if (!query) return { type: "unknown" };
        const out = { type: "answer", query };
        if (i.target) out.target = String(i.target).slice(0, 80);
        if (i.stage) out.stage = String(i.stage).slice(0, 40);
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

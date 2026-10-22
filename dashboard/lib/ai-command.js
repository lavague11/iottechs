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

  // "note: wants two more cameras", "add a note that ...", "log that ..."
  m = t.match(/^(?:add\s+a\s+)?(?:note|log)\b(?:\s+that\b|\s*[:\-])?\s*(.+)/i);
  if (m && m[1].trim().length > 1) return { type: "add_note", body: m[1].trim() };

  // "open Crazy Cars", "go to Crazy Cars", "pull up Crazy Cars"
  m = t.match(/^(?:open|go\s+to|pull\s+up|show\s+me)\s+(.{2,})/i);
  if (m && !/\b(invoice|invoices|payment|payments|survey|proposal)\b/i.test(m[1])) {
    return { type: "navigate_project", query: m[1].trim().replace(/[.?!]+$/, "") };
  }

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
      type: { type: "string", enum: ["add_items", "set_discount", "add_note", "navigate_project", "unsupported", "unknown"] },
      name: { type: "string", description: "line-item name for add_items, e.g. Camera" },
      qty: { type: "integer", description: "quantity for add_items" },
      price: { type: ["number", "null"], description: "unit price for add_items; null to use the price book" },
      pct: { type: "number", description: "discount percent 0-100 for set_discount" },
      body: { type: "string", description: "note text for add_note" },
      query: { type: "string", description: "project/customer name for navigate_project" },
      reason: { type: "string", description: "for unsupported: what was asked that Phase 1 can't do" },
    },
    required: ["type"],
  },
};

export function buildClaudeBody(text, context = {}) {
  const ctx = context.projectName ? `The user is currently viewing project "${context.projectName}". "this"/"them"/"the proposal" refer to it.` : "No project is open.";
  return {
    model: AI_MODEL,
    max_tokens: 300,
    system:
      "You convert a security-install company staff member's command into ONE structured action via the proposal_command tool. " +
      "Phase 1 supports ONLY: add_items (add line items like cameras), set_discount (percent), add_note (project log), navigate_project (open a customer/project). " +
      "Anything else (scheduling, payments, sending messages, surveys) → type \"unsupported\" with a short reason. If it's not a command at all → \"unknown\". " +
      ctx + " Never invent a price; omit it (null) unless the user stated one.",
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
      case "set_discount": return { type: "set_discount", pct: Math.max(0, Math.min(100, +i.pct || 0)) };
      case "add_note": return i.body ? { type: "add_note", body: String(i.body).slice(0, 2000) } : { type: "unknown" };
      case "navigate_project": return i.query ? { type: "navigate_project", query: String(i.query).slice(0, 120) } : { type: "unknown" };
      case "unsupported": return { type: "unsupported", reason: String(i.reason || "").slice(0, 200) };
      default: return { type: "unknown" };
    }
  } catch { return { type: "unknown" }; }
}

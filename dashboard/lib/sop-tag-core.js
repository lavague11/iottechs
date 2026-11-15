import { SOP_TAG_SYSTEM, sopTagUserMessage, parseTagResult, fallbackTags } from "./sop-model.js";

// Pure auto-tag core (no DB import → testable with a stubbed fetch + recording write).
// Anthropic request shape / retries / error mapping mirror /api/sop/build.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const realSleep = (ms) => new Promise((s) => setTimeout(s, ms));

export function tagFail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// One Messages call → raw text. Throws an Error with `.status`.
async function callClaude({ key, model, batch, fetchImpl, sleep }) {
  let lastErr = "AI error";
  for (let attempt = 0; attempt < 3; attempt++) {
    let r;
    try {
      r = await fetchImpl(ANTHROPIC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 4096, system: SOP_TAG_SYSTEM, messages: [{ role: "user", content: sopTagUserMessage(batch) }] }),
      });
    } catch {
      if (attempt < 2) { await sleep(1500); continue; }
      throw tagFail(502, "Couldn’t reach the AI — check the connection and try again.");
    }
    const j = await r.json().catch(() => ({}));
    if (r.ok) return (j.content || []).map((c) => c.text || "").join("");
    const msg = j?.error?.message || `AI error ${r.status}`;
    if (r.status === 401) throw tagFail(502, "The Anthropic key is invalid.");
    if (/credit|quota|billing|insufficient/i.test(msg)) throw tagFail(402, "AI is paused — the Anthropic account is out of credits.");
    lastErr = msg;
    if ([429, 500, 529].includes(r.status) && attempt < 2) { await sleep(2500 * (attempt + 1)); continue; }
    break;
  }
  throw tagFail(502, lastErr);
}

// rows: [{ id, title, instruction, guide }]; write(stepId, tags) → stored array | null.
// Only short numeric ids (1..n) go to the model; writes use the real row ids.
// Attempt 1 covers all rows. Zero parsed entries → throw 502, write NOTHING. Rows missing from the answer get
// ONE more attempt (re-numbered 1..m, best-effort: a failed/empty attempt 2 keeps attempt 1's results). Only rows
// still missing after that get fallbackTags(title, instruction), then fallbackTags(guide) as a last resort;
// if still empty the row stays untagged.
export async function runAutoTag({ rows, key, model, fetchImpl = fetch, write, sleep = realSleep }) {
  const ask = async (list) => {
    const batch = list.map((r, i) => ({ id: String(i + 1), title: r.title, instruction: r.instruction, guide: r.guide }));
    const text = await callClaude({ key, model, batch, fetchImpl, sleep });
    return parseTagResult(text, batch.map((b) => b.id)) || {};
  };

  const parsed1 = await ask(rows);
  if (!Object.keys(parsed1).length) throw tagFail(502, "The AI returned an unreadable result — try again.");
  const tagsById = new Map(); // real id → tags
  const missing = [];
  rows.forEach((row, i) => {
    const t = parsed1[String(i + 1)];
    if (t && t.length) tagsById.set(row.id, t); else missing.push(row);
  });

  if (missing.length) {
    try {
      const parsed2 = await ask(missing);
      missing.forEach((row, i) => {
        const t = parsed2[String(i + 1)];
        if (t && t.length) tagsById.set(row.id, t);
      });
    } catch { /* best-effort */ }
  }

  let tagged = 0;
  const written = {};
  for (const row of rows) {
    let tags = tagsById.get(row.id);
    if (!tags) {
      tags = fallbackTags(row.title, row.instruction);
      if (!tags.length) tags = fallbackTags(row.guide);
    }
    if (!tags || !tags.length) continue;
    const stored = write(row.id, tags);
    if (stored && stored.length) { written[row.id] = stored; tagged++; }
  }
  return { tagged, written };
}

// AI drafting for the SEO engine. Turns a page record (type + topic + verified facts) into a complete
// DRAFT — meta, tags, human-quality body blocks, FAQ, internal-link suggestions — in one call. The output
// is a DRAFT only: it lands in the queue at needs_review with fact_check_status=pending and NEVER
// auto-publishes. The publish gate (lib/seo.publishGate) still stands between it and going live.
//
// Fact-safety is enforced in the PROMPT, not just the UI: the model may state only facts passed in the
// FACTS block, must never invent numbers/clients/outcomes/certifications/pricing/licensing, and must put
// anything it wanted but couldn't verify into `needs_verification` instead of writing it as fact.
//
// Engine: OpenAI (vault OPENAI_API_KEY, Responses API) preferred — the owner asked for it — with a Claude
// fallback (ANTHROPIC_API_KEY), mirroring app/api/proposal-import.
import { secretValue } from "../db.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_MODEL = "gpt-5.4-mini";
const ANTHROPIC_MODEL = "claude-sonnet-5-5";

export function seoEngine() {
  const openai = secretValue("OPENAI_API_KEY");
  if (openai) return { name: "openai", key: openai, model: secretValue("OPENAI_SEO_MODEL") || OPENAI_MODEL };
  const anthropic = secretValue("ANTHROPIC_API_KEY");
  if (anthropic) return { name: "claude", key: anthropic, model: ANTHROPIC_MODEL };
  return null;
}

// The non-negotiable voice + safety rules every generation obeys.
const HOUSE = `You are a seasoned commercial security & low-voltage consultant who also writes like a sharp trade-publication editor. You write for business owners and facility managers in the New Jersey / New York City metro who are deciding whom to hire.

VOICE
- Lead with the answer. The first sentence states what the service is and who it's for — no throat-clearing.
- Be concrete and specific: name real variables (entrances, service lanes, loading docks, lens choice, retention windows, PoE runs). Explain why, where, when, and the trade-offs. That specificity is what makes it credible.
- Professional, calm, confident, useful. Never salesy, hypey, or generic.
- Prefer 700 excellent words over 1500 padded ones. Every sentence earns its place.
- Do NOT start the page with the company name. Vary sentence structure. Avoid repetitive three-item lists.

BANNED PHRASES (never use): "in today's fast-paced world", "now more than ever", "when it comes to", "look no further", "whether you're a small business or large enterprise", "peace of mind", "state-of-the-art" (unless technically justified), "cutting-edge", "game-changing", "seamless solution", "tailored solutions", "your trusted partner", "it's not just about X, it's about Y". Avoid excessive em dashes and fake storytelling.

FACT-SAFETY (critical)
- You may ONLY state facts given in the FACTS block or the CASE STUDY block. Never invent or imply: client names, equipment counts, install dates, savings, percentages, outcomes, customer quotes, certifications, partnerships, pricing, licensing, or service areas beyond those provided.
- If you want to cite something not provided, DO NOT write it as fact — add a short note to "needs_verification" and write around it.
- License Plate Reader content: never promise plate capture outright. Always condition it on distance, speed, angle, lighting, lens selection, and mounting position.
- Geography: only reference the provided service area.`;

const BLOCKS_SPEC = `BODY BLOCKS (output as an ordered array; use only these shapes):
  {"type":"p","value":"paragraph text"}
  {"type":"h2","value":"section heading"}
  {"type":"h3","value":"subsection heading"}
  {"type":"ul","items":["point","point"]}
  {"type":"ol","items":["step","step"]}
  {"type":"callout","value":"one important note"}
  {"type":"faq","items":[{"q":"question","a":"answer"}]}
Keep an FAQ to genuinely useful buyer questions. Open with a strong answer paragraph before any heading.`;

// Build the page-generation prompt. `page` is the record; `facts` is {key:value} (verified+public only);
// `caseStudy` is an optional verified study; `instruction` is the owner's one-line steer.
export function buildPagePrompt({ page, facts = {}, caseStudy = null, instruction = "" }) {
  const factLines = Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "- (no extra facts cleared for public use yet)";
  const cs = caseStudy ? `\nCASE STUDY (verified — you may reference it):\n${JSON.stringify(caseStudy)}\n` : "";
  const typeHint = {
    service: "A commercial service 'money' page. Cover: what it is & who it's for, the system we design/install, real design considerations & trade-offs, where it applies, and buyer FAQs. One clear primary CTA (Request a Site Survey).",
    industry: "An industry page. Sell the business OUTCOME for this vertical — its specific problems, risks, workflow, equipment considerations, and FAQs. Do NOT just rename a generic service page.",
    location: "A local page. Include genuine local substance (nearby work, market-specific considerations, relevant local industries). If there isn't enough unique local substance in FACTS, say so in needs_verification rather than padding.",
    resource: "A buyer-education / resource (blog) page that answers one question well and supports the commercial money pages it relates to.",
    blog: "A blog / educational article that answers one question well, in a helpful editorial voice, and links to the relevant commercial pages.",
    "case-study": "A project case study (see the case-study instructions).",
    hub: "A hub page that orients a human and links to its child pages.",
  }[page.page_type] || "A helpful commercial page.";

  const user = `Write the page below.

PAGE
- type: ${page.page_type}
- working title / topic: ${page.title || page.primary_topic || page.slug}
- target primary keyword: ${page.primary_keyword || "(you choose the best commercial keyword)"}
- slug: /${page.slug}
${instruction ? `- owner instruction: ${instruction}` : ""}

WHAT THIS PAGE TYPE NEEDS
${typeHint}

FACTS (the ONLY facts you may state):
${factLines}
${cs}
${BLOCKS_SPEC}

Return STRICT JSON (no prose, no markdown) with exactly these keys:
{
  "h1": "the page H1 (a short noun phrase, not a sentence)",
  "meta_title": "≤60 chars, compelling, keyword-aware",
  "meta_description": "≤155 chars",
  "primary_keyword": "the single best commercial keyword",
  "secondary_topics": ["supporting topic/tag", "..."],
  "search_intent": "transactional | commercial | informational | local",
  "body": [ ...blocks... ],
  "internal_link_suggestions": [ {"anchor":"natural anchor text","to_topic":"the page/topic it should link to"} ],
  "needs_verification": ["any claim you wanted but could not verify from FACTS"],
  "notes": "one line on anything the editor should know"
}`;
  return { system: HOUSE, user };
}

// Case-study prompt — editorial, built ONLY from the verified project facts passed in.
export function buildCaseStudyPrompt({ caseStudy, projectFacts = {}, facts = {}, instruction = "" }) {
  const user = `Write a project case study for IOT TECHS in the voice of a trade publication (never "another happy customer!").

VERIFIED CASE FACTS (the only specifics you may use — do not invent beyond these):
${JSON.stringify({ ...caseStudy, project: projectFacts }, null, 2)}

COMPANY FACTS:
${Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Structure: Client/Project → The Problem (only if verified) → The System (what was installed/designed) → Why it was designed that way (useful technical context) → The Result (ONLY verified outcomes; if none are verified, omit the section and flag it) → Related.
${instruction ? `Owner instruction: ${instruction}` : ""}
${BLOCKS_SPEC}

Return STRICT JSON with the same keys as a page (h1, meta_title, meta_description, primary_keyword, secondary_topics, search_intent, body, internal_link_suggestions, needs_verification, notes). Put any missing-but-wanted specifics (outcomes, counts, quotes) into needs_verification — never fabricate them.`;
  return { system: HOUSE, user };
}

function extractJson(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function callOpenAI({ system, user }, key, model) {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      input: [{ role: "developer", content: [{ type: "input_text", text: system }] }, { role: "user", content: [{ type: "input_text", text: user }] }],
      text: { format: { type: "json_object" } },
      reasoning: { effort: "medium" },
      max_output_tokens: 9000,
    }),
    signal: AbortSignal.timeout(180000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || `openai ${res.status}`);
  const text = j?.output_text || (Array.isArray(j?.output) ? j.output.flatMap((o) => o?.content || []).map((c) => c?.text || "").join("") : "");
  return extractJson(text);
}

async function callClaude({ system, user }, key, model) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 9000, system, messages: [{ role: "user", content: [{ type: "text", text: user + "\n\nReturn ONLY the JSON object." }] }] }),
    signal: AbortSignal.timeout(180000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || `anthropic ${res.status}`);
  const text = Array.isArray(j?.content) ? j.content.map((c) => c.text || "").join("") : "";
  return extractJson(text);
}

// Normalize + sanity-check the model output into the fields we store on a page draft.
export function normalizeDraft(raw) {
  if (!raw || typeof raw !== "object") throw new Error("no JSON returned");
  const blocks = Array.isArray(raw.body) ? raw.body.filter((b) => b && b.type) : [];
  if (!blocks.length) throw new Error("no body blocks");
  return {
    title: String(raw.h1 || "").slice(0, 120) || null,
    meta_title: String(raw.meta_title || "").slice(0, 70) || null,
    meta_description: String(raw.meta_description || "").slice(0, 170) || null,
    primary_keyword: raw.primary_keyword ? String(raw.primary_keyword).slice(0, 120) : null,
    secondary_topics: Array.isArray(raw.secondary_topics) ? raw.secondary_topics.slice(0, 12).map(String) : [],
    search_intent: ["transactional", "commercial", "informational", "local"].includes(raw.search_intent) ? raw.search_intent : null,
    body: blocks,
    internal_link_suggestions: Array.isArray(raw.internal_link_suggestions) ? raw.internal_link_suggestions.slice(0, 20) : [],
    needs_verification: Array.isArray(raw.needs_verification) ? raw.needs_verification.map(String) : [],
    notes: raw.notes ? String(raw.notes) : "",
  };
}

// Run a prompt through whichever engine is configured. Returns { draft, engine, model }.
export async function runGeneration(prompt, engine = seoEngine()) {
  if (!engine) throw new Error("No AI key configured. Add OPENAI_API_KEY in Development ▸ API Keys.");
  const raw = engine.name === "openai" ? await callOpenAI(prompt, engine.key, engine.model) : await callClaude(prompt, engine.key, engine.model);
  return { draft: normalizeDraft(raw), engine: engine.name, model: engine.model };
}

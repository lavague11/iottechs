// SEO engine — data access + the publishing gate. Thin layer over the seo_* tables (lib/seo/schema.js),
// on the same lazy sqlite connection as the rest of the app. Pure JSON-LD builders live in lib/seo/ld.js.
//
// Guardrails encoded here, not just in the UI:
//   - publishGate() is the ONE place that decides whether a page may go live. It refuses on a missing
//     fact-check, a failed technical check, a below-threshold quality score, placeholder text, or a
//     cannibalizing slug. The admin publish action calls it; nothing bypasses it.
//   - Every create/update snapshots the prior row into seo_revisions for diff + rollback.
//   - publicFacts() only ever exposes facts that are BOTH verified AND cleared for public use, so an
//     unverified claim (e.g. the home page's "1500+ locations") can never leak into a page or schema.
import { sqliteHandle } from "./db.js";
import { SEO_STATUSES } from "./seo/schema.js";

const db = sqliteHandle();
// node:sqlite returns rows as NULL-prototype objects; Next refuses to pass those to a Client Component,
// so every row that may cross that boundary is spread into a plain object first.
const plain = (rows) => (Array.isArray(rows) ? rows.map((r) => (r ? { ...r } : r)) : rows);
const one = (r) => (r ? { ...r } : r);
const J = (v, d) => { try { return v == null ? d : JSON.parse(v); } catch { return d; } };
const S = (v) => (v == null ? null : JSON.stringify(v));
const now = () => new Date().toISOString();

export const QUALITY_THRESHOLD = 70;
export const PLACEHOLDER_RE = /lorem ipsum|\bTODO\b|\bTKTK\b|\bTBD\b|\[\[[^\]]*\]\]|xxxxx|placeholder/i;

export function priorityTier(score) {
  const n = +score || 0;
  return n >= 88 ? "P0" : n >= 76 ? "P1" : n >= 64 ? "P2" : "P3";
}
// Canonical slug form: lowercase, no leading/trailing slash, single slashes.
export function normalizeSlug(slug) {
  return String(slug || "").trim().toLowerCase().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

// ---- Facts ----------------------------------------------------------------
export function allFacts() { return plain(db.prepare("SELECT * FROM seo_facts ORDER BY category, key").all()); }
export function getFact(key) { return one(db.prepare("SELECT * FROM seo_facts WHERE key=?").get(key)); }
// The ONLY facts a page/schema may cite: verified AND cleared for public use. Returns { key: value }.
export function publicFacts() {
  const rows = db.prepare("SELECT key, value FROM seo_facts WHERE verified=1 AND public_use_allowed=1").all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
export function upsertFact({ key, claim, value, category, source, verified, public_use_allowed, notes, updatedBy }) {
  const ex = getFact(key);
  if (ex) {
    db.prepare(`UPDATE seo_facts SET claim=COALESCE(?,claim), value=?, category=COALESCE(?,category), source=COALESCE(?,source),
                verified=COALESCE(?,verified), public_use_allowed=COALESCE(?,public_use_allowed), notes=COALESCE(?,notes),
                updated_by=?, updated_at=? WHERE key=?`)
      .run(claim ?? null, value ?? null, category ?? null, source ?? null,
           verified == null ? null : (verified ? 1 : 0), public_use_allowed == null ? null : (public_use_allowed ? 1 : 0),
           notes ?? null, updatedBy || null, now(), key);
  } else {
    db.prepare(`INSERT INTO seo_facts (key, claim, value, category, source, verified, public_use_allowed, notes, updated_by)
                VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(key, claim || key, value ?? null, category || null, source || null, verified ? 1 : 0, public_use_allowed ? 1 : 0, notes || null, updatedBy || null);
  }
  return getFact(key);
}

// ---- Pages ----------------------------------------------------------------
function hydrate(row) {
  if (!row) return null;
  return { ...row,
    secondary_topics: J(row.secondary_topics, []), research: J(row.research, null),
    verified_facts: J(row.verified_facts, []), body: J(row.body, []),
    schema_json: J(row.schema_json, null), performance_data: J(row.performance_data, null),
  };
}
export function listPages(where = {}) {
  const cl = [], args = [];
  if (where.status) { cl.push("status=?"); args.push(where.status); }
  if (where.page_type) { cl.push("page_type=?"); args.push(where.page_type); }
  const sql = "SELECT * FROM seo_pages" + (cl.length ? " WHERE " + cl.join(" AND ") : "") + " ORDER BY priority DESC, updated_at DESC";
  return db.prepare(sql).all(...args).map(hydrate);
}
export function getPage(id) { return hydrate(db.prepare("SELECT * FROM seo_pages WHERE id=?").get(Number(id))); }
export function getPageBySlug(slug) { return hydrate(db.prepare("SELECT * FROM seo_pages WHERE slug=?").get(normalizeSlug(slug))); }
export function getPublishedPage(slug) {
  return hydrate(db.prepare("SELECT * FROM seo_pages WHERE slug=? AND status='published'").get(normalizeSlug(slug)));
}
export function publishedSlugs() {
  return db.prepare("SELECT slug, updated_at, published_at FROM seo_pages WHERE status='published'").all();
}
export function countsByStatus() {
  const rows = db.prepare("SELECT status, COUNT(*) c FROM seo_pages GROUP BY status").all();
  return Object.fromEntries(rows.map((r) => [r.status, r.c]));
}

function snapshot(pageId, agent, reason) {
  const cur = db.prepare("SELECT * FROM seo_pages WHERE id=?").get(pageId);
  if (!cur) return;
  const ver = (db.prepare("SELECT MAX(version) m FROM seo_revisions WHERE page_id=?").get(pageId)?.m || 0) + 1;
  db.prepare("INSERT INTO seo_revisions (page_id, version, snapshot, agent, reason) VALUES (?,?,?,?,?)")
    .run(pageId, ver, JSON.stringify(cur), agent || null, reason || null);
}

const WRITABLE = new Set(["slug", "page_type", "title", "primary_topic", "primary_keyword", "secondary_topics",
  "search_intent", "service", "industry", "location", "parent_slug", "status", "priority", "priority_tier",
  "research", "content_brief", "verified_facts", "body", "meta_title", "meta_description", "schema_json",
  "quality_score", "fact_check_status", "technical_check_status", "agent_notes", "blocked_reason", "last_reviewed"]);
const JSON_COLS = new Set(["secondary_topics", "research", "verified_facts", "body", "schema_json", "performance_data"]);

export function createPage(data = {}, by = "editor") {
  const slug = normalizeSlug(data.slug);
  if (!slug) throw new Error("slug required");
  if (getPageBySlug(slug)) throw new Error("slug already exists");
  const score = data.priority != null ? +data.priority : 0;
  db.prepare(`INSERT INTO seo_pages (slug, page_type, title, primary_topic, primary_keyword, search_intent,
              service, industry, location, parent_slug, status, priority, priority_tier, content_brief, created_by)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(slug, data.page_type || "resource", data.title || null, data.primary_topic || null, data.primary_keyword || null,
         data.search_intent || null, data.service || null, data.industry || null, data.location || null, data.parent_slug || null,
         SEO_STATUSES.includes(data.status) ? data.status : "opportunity", score, data.priority_tier || priorityTier(score),
         data.content_brief || null, by);
  return getPageBySlug(slug);
}

export function updatePage(id, patch = {}, by = "editor", reason = "edit") {
  const cur = db.prepare("SELECT * FROM seo_pages WHERE id=?").get(Number(id));
  if (!cur) throw new Error("page not found");
  snapshot(cur.id, by, reason);
  const sets = [], args = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!WRITABLE.has(k)) continue;
    sets.push(`${k}=?`);
    args.push(JSON_COLS.has(k) ? S(v) : v);
  }
  if (patch.priority != null && patch.priority_tier == null) { sets.push("priority_tier=?"); args.push(priorityTier(patch.priority)); }
  sets.push("updated_at=?"); args.push(now());
  args.push(cur.id);
  db.prepare(`UPDATE seo_pages SET ${sets.join(", ")} WHERE id=?`).run(...args);
  return getPage(cur.id);
}

export function setStatus(id, status, by = "editor", reason = "") {
  if (!SEO_STATUSES.includes(status)) throw new Error("bad status");
  return updatePage(id, { status, ...(status === "blocked" && reason ? { blocked_reason: reason } : {}) }, by, `status → ${status}${reason ? ": " + reason : ""}`);
}

// ---- Publishing gate: the single decision point ---------------------------
// Returns { ok, failures:[{gate, detail}] }. A page publishes only if ok.
export function publishGate(page) {
  const f = [];
  const fail = (gate, detail) => f.push({ gate, detail });
  if (!page) return { ok: false, failures: [{ gate: "exists", detail: "no page" }] };
  if (!normalizeSlug(page.slug)) fail("slug", "missing slug");
  if (!page.title) fail("title", "missing title");
  if (!page.meta_title) fail("meta", "missing meta title");
  if (!page.meta_description) fail("meta", "missing meta description");
  const blocks = Array.isArray(page.body) ? page.body : [];
  const text = blocks.map((b) => (typeof b === "string" ? b : JSON.stringify(b.value ?? b))).join(" ");
  if (text.trim().length < 200) fail("content", "body is thin or empty");
  if (PLACEHOLDER_RE.test(text) || PLACEHOLDER_RE.test(page.title || "") || PLACEHOLDER_RE.test(page.meta_description || "")) fail("placeholder", "placeholder / TODO text present");
  if (page.fact_check_status !== "passed") fail("fact_check", `fact check is "${page.fact_check_status || "pending"}" (must be passed)`);
  if (page.technical_check_status === "failed") fail("technical", "technical check failed");
  if ((+page.quality_score || 0) < QUALITY_THRESHOLD) fail("quality", `quality ${(+page.quality_score || 0)} < ${QUALITY_THRESHOLD}`);
  // Cannibalization: another PUBLISHED page already owns this primary keyword.
  if (page.primary_keyword) {
    const dup = db.prepare("SELECT slug FROM seo_pages WHERE status='published' AND primary_keyword=? AND id<>?").get(page.primary_keyword, page.id || -1);
    if (dup) fail("cannibalization", `/${dup.slug} already targets "${page.primary_keyword}"`);
  }
  return { ok: f.length === 0, failures: f };
}

export const SITE_ORIGIN = "https://iot-techs.com";
export function publishPage(id, by = "editor") {
  const page = getPage(id);
  const gate = publishGate(page);
  if (!gate.ok) return { ok: false, gate };
  snapshot(page.id, by, "publish");
  const url = `${SITE_ORIGIN}/${normalizeSlug(page.slug)}`;
  db.prepare("UPDATE seo_pages SET status='published', published_url=?, published_at=?, updated_at=? WHERE id=?")
    .run(url, now(), now(), page.id);
  return { ok: true, url, gate };
}
export function unpublishPage(id, by = "editor", reason = "unpublished") {
  const page = getPage(id);
  if (!page) return { ok: false };
  snapshot(page.id, by, reason);
  db.prepare("UPDATE seo_pages SET status='needs_review', updated_at=? WHERE id=?").run(now(), page.id);
  return { ok: true };
}
export function pageRevisions(pageId) { return plain(db.prepare("SELECT id, version, agent, reason, at FROM seo_revisions WHERE page_id=? ORDER BY version DESC").all(Number(pageId))); }

// ---- AI drafts ------------------------------------------------------------
// Provisional quality from the draft's shape (meta present, real length, headings, FAQ, tags, no open
// flags). It can reach the publish threshold, but publishing ALSO needs fact_check_status=passed — which
// only a human sets — so an AI draft can never go live without a person verifying its facts.
export function provisionalQuality(draft) {
  const blocks = draft.body || [];
  const text = blocks.map((b) => (b.type === "faq" ? (b.items || []).map((x) => `${x.q} ${x.a}`).join(" ") : (b.items ? b.items.join(" ") : b.value || ""))).join(" ");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  let s = 38;
  if (draft.meta_title) s += 8;
  if (draft.meta_description) s += 8;
  if (words >= 350) s += 12;
  if (words >= 600) s += 6;
  if (blocks.some((b) => b.type === "h2")) s += 6;
  if (blocks.some((b) => b.type === "faq")) s += 6;
  if ((draft.secondary_topics || []).length >= 3) s += 4;
  s += (draft.needs_verification || []).length === 0 ? 6 : -4;
  if (PLACEHOLDER_RE.test(text)) s -= 30;
  return Math.max(0, Math.min(94, s));
}
function draftNotes(draft, engine) {
  const parts = [`AI draft via ${engine || "model"}.`];
  if (draft.notes) parts.push(draft.notes);
  if ((draft.needs_verification || []).length) parts.push("⚠ VERIFY before publish: " + draft.needs_verification.join(" · "));
  if ((draft.internal_link_suggestions || []).length) parts.push("Link ideas: " + draft.internal_link_suggestions.map((l) => `${l.anchor}→${l.to_topic}`).join(", "));
  return parts.join("\n");
}
// Write a generated draft onto a page. ALWAYS lands at needs_review with fact_check pending — never live.
export function applyDraft(pageId, draft, by = "ai", engine = "") {
  const page = getPage(pageId);
  if (!page) throw new Error("page not found");
  return updatePage(pageId, {
    title: draft.title || page.title,
    meta_title: draft.meta_title, meta_description: draft.meta_description,
    primary_keyword: draft.primary_keyword || page.primary_keyword,
    secondary_topics: draft.secondary_topics, search_intent: draft.search_intent || page.search_intent,
    body: draft.body,
    status: "needs_review", fact_check_status: "pending",
    quality_score: provisionalQuality(draft),
    agent_notes: draftNotes(draft, engine),
  }, by, "AI draft generated");
}
export function getCaseStudy(id) { return one(db.prepare("SELECT * FROM seo_case_studies WHERE id=?").get(Number(id))); }
// Does a real project exist for this access id? A case study must be backed by one before it's drafted.
export function projectExists(accessId) {
  if (!accessId) return false;
  try { return !!db.prepare("SELECT 1 FROM projects WHERE UPPER(access_id)=UPPER(?)").get(String(accessId)); } catch { return false; }
}

// Record an AI grounding-audit result. Clean → fact_check passed (that gate clears); flagged → failed
// (publish stays blocked) with the unsupported claims written into agent_notes for the human to fix.
// A human can still override via "Mark fact-check passed". Never auto-publishes.
export function applyFactCheck(pageId, report, by = "ai") {
  const page = getPage(pageId);
  if (!page) throw new Error("page not found");
  const clean = report.verdict === "clean";
  const noteLines = ["AI fact-check (" + (by || "ai") + "): " + report.summary];
  for (const f of report.flags || []) noteLines.push(`⚠ [${f.severity || "med"}·${f.category || "claim"}] “${String(f.claim).slice(0, 160)}” — ${f.why || ""}${f.fix ? ` → ${f.fix}` : ""}`);
  const prior = page.agent_notes && !/^AI fact-check/.test(page.agent_notes) ? page.agent_notes + "\n\n" : "";
  return updatePage(pageId, { fact_check_status: clean ? "passed" : "failed", agent_notes: prior + noteLines.join("\n") }, by, `AI fact-check: ${report.verdict}`);
}

// ---- Internal-link graph --------------------------------------------------
export function setPageLinks(fromSlug, links = []) {
  const from = normalizeSlug(fromSlug);
  db.prepare("DELETE FROM seo_links WHERE from_slug=?").run(from);
  const ins = db.prepare("INSERT OR IGNORE INTO seo_links (from_slug, to_slug, anchor, context) VALUES (?,?,?,?)");
  for (const l of links) ins.run(from, normalizeSlug(l.to), l.anchor || null, l.context || null);
}
export function linksTo(slug) { return db.prepare("SELECT from_slug, anchor FROM seo_links WHERE to_slug=?").all(normalizeSlug(slug)); }
export function orphanPublishedPages() {
  return db.prepare(`SELECT p.slug FROM seo_pages p WHERE p.status='published'
                     AND NOT EXISTS (SELECT 1 FROM seo_links l WHERE l.to_slug=p.slug)`).all().map((r) => r.slug);
}

// ---- Case studies ---------------------------------------------------------
export function listCaseStudies() { return plain(db.prepare("SELECT * FROM seo_case_studies ORDER BY updated_at DESC").all()); }
export function upsertCaseStudy(data = {}) {
  if (data.id) {
    db.prepare(`UPDATE seo_case_studies SET client=?, project_access_id=?, industry=?, city=?, state=?, status=?, permission_to_name_client=?, updated_at=? WHERE id=?`)
      .run(data.client || null, data.project_access_id || null, data.industry || null, data.city || null, data.state || null,
           data.status || "opportunity", data.permission_to_name_client ? 1 : 0, now(), Number(data.id));
    return one(db.prepare("SELECT * FROM seo_case_studies WHERE id=?").get(Number(data.id)));
  }
  const r = db.prepare(`INSERT INTO seo_case_studies (client, project_access_id, industry, city, state, status, permission_to_name_client) VALUES (?,?,?,?,?,?,?)`)
    .run(data.client || null, data.project_access_id || null, data.industry || null, data.city || null, data.state || null, data.status || "opportunity", data.permission_to_name_client ? 1 : 0);
  return one(db.prepare("SELECT * FROM seo_case_studies WHERE id=?").get(r.lastInsertRowid));
}

// ---- Seed the opportunity queue from the approved master plan ----
// Idempotent: a page is created only if its slug is absent; a case study only if its client is absent;
// backlinks only when the queue is empty. Everything lands as an OPPORTUNITY — nothing publishes. This
// operationalizes the approved plan so /dev/seo opens on a real backlog instead of a blank screen.
const PLAN_PAGES = [
  // hubs
  ["services", "Services", "hub", "", 60], ["industries", "Industries", "hub", "", 60],
  ["locations", "Locations", "hub", "", 60], ["case-studies", "Case Studies", "hub", "", 60], ["resources", "Resources", "hub", "", 60],
  // money pages (service)
  ["commercial-security-camera-installation", "Commercial Security Camera Installation", "service", "transactional", 95],
  ["license-plate-reader-cameras", "License Plate Reader Cameras", "service", "transactional", 92],
  ["restaurant-technology-installation", "Restaurant Technology & Toast Installation", "service", "transactional", 90],
  ["commercial-access-control", "Commercial Access Control", "service", "transactional", 84],
  ["commercial-alarm-systems", "Commercial Alarm Systems", "service", "transactional", 80],
  ["panic-duress-emergency-buttons", "Panic / Duress / Emergency Buttons", "service", "transactional", 78],
  ["structured-cabling", "Structured Cabling", "service", "transactional", 76],
  ["commercial-networking-wifi", "Commercial Networking & Wi-Fi", "service", "transactional", 74],
  ["24-7-alarm-monitoring", "24/7 Alarm Monitoring", "service", "transactional", 72],
  ["commercial-sound-systems", "Commercial Sound Systems", "service", "transactional", 66],
  // industries
  ["security-systems-car-dealerships", "Security Systems for Car Dealerships", "industry", "commercial", 93],
  ["restaurant-security-systems", "Restaurant Security Systems", "industry", "commercial", 90],
  ["jewelry-store-security-systems", "Jewelry Store Security Systems", "industry", "commercial", 88],
  ["security-cameras-collision-centers", "Security Cameras for Collision Centers", "industry", "commercial", 84],
  ["diamond-district-security-systems", "Diamond District Security Systems", "industry", "commercial", 82],
  ["multi-location-security-systems", "Multi-Location Security Systems", "industry", "commercial", 78],
  ["security-systems-auto-repair-shops", "Security Systems for Auto Repair Shops", "industry", "commercial", 74],
  ["retail-security-systems", "Retail Security Systems", "industry", "commercial", 70],
  ["warehouse-security-systems", "Warehouse Security Systems", "industry", "commercial", 68],
  ["security-systems-sports-facilities", "Security Systems for Sports Facilities", "industry", "commercial", 66],
  ["luxury-home-security-systems", "Luxury Home & Estate Security Systems", "industry", "commercial", 64],
];
const PLAN_CASES = [
  { client: "Crazy Cars", project_access_id: "ASC0042", industry: "Car Dealership", city: "Hillside", state: "NJ", status: "verified" },
  { client: "Milan Motors", industry: "Car Dealership", state: "NJ" }, { client: "Rev Motors", industry: "Car Dealership", state: "NJ" },
  { client: "The Car Guys", industry: "Car Dealership", state: "NJ" }, { client: "Easy Drive", industry: "Car Dealership", state: "NJ" },
  { client: "Onyx Autobody", industry: "Collision Center", state: "NJ" }, { client: "Huntington Collision Center", industry: "Collision Center", state: "NY" },
  { client: "PaneBianco", industry: "Restaurant" }, { client: "Nature's Grill", industry: "Restaurant" }, { client: "YoYo Chicken", industry: "Restaurant" },
  { client: "Lodi Pizza", industry: "Restaurant", city: "Lodi", state: "NJ" }, { client: "SHIRO", industry: "Restaurant" }, { client: "Buck n Up", industry: "Retail" }, { client: "Vino Fine Wine", industry: "Retail" },
  { client: "Velto", industry: "Sports / Pickleball", city: "Brooklyn", state: "NY" },
];
const PLAN_BACKLINKS = [
  { domain: "", reason: "Toast / restaurant-technology partner directory", relationship: "ecosystem", authority: "high" },
  { domain: "", reason: "Manufacturer integrator/dealer directories (camera/access/alarm brands installed)", relationship: "vendor", authority: "high" },
  { domain: "", reason: "Union / Essex / Hudson chambers of commerce", relationship: "local", authority: "medium" },
  { domain: "", reason: "Client case-study collaboration / co-marketing (where name-use permitted)", relationship: "client", authority: "medium" },
  { domain: "", reason: "Commercial real estate & property-management partners", relationship: "partner", authority: "medium" },
  { domain: "", reason: "Local press / security-technology publication project feature", relationship: "press", authority: "high" },
];
export function seedSeoPlan(by = "plan") {
  let pages = 0, cases = 0, links = 0;
  for (const [slug, title, type, intent, pri] of PLAN_PAGES) {
    if (getPageBySlug(slug)) continue;
    createPage({ slug, title, page_type: type, primary_topic: title, search_intent: intent || null, priority: pri, status: "opportunity" }, by);
    pages++;
  }
  const haveClient = (c) => db.prepare("SELECT 1 FROM seo_case_studies WHERE client=?").get(c);
  for (const c of PLAN_CASES) { if (haveClient(c.client)) continue; upsertCaseStudy(c); cases++; }
  if (db.prepare("SELECT COUNT(*) c FROM seo_backlinks").get().c === 0) { for (const b of PLAN_BACKLINKS) { addBacklink(b); links++; } }
  return { pages, cases, links };
}

// ---- Backlinks ------------------------------------------------------------
export function listBacklinks() { return plain(db.prepare("SELECT * FROM seo_backlinks ORDER BY updated_at DESC").all()); }
export function addBacklink(data = {}) {
  const r = db.prepare(`INSERT INTO seo_backlinks (domain, contact, reason, target_slug, relationship, authority, outreach_concept, status) VALUES (?,?,?,?,?,?,?,?)`)
    .run(data.domain || null, data.contact || null, data.reason || null, data.target_slug || null, data.relationship || null, data.authority || null, data.outreach_concept || null, data.status || "opportunity");
  return one(db.prepare("SELECT * FROM seo_backlinks WHERE id=?").get(r.lastInsertRowid));
}

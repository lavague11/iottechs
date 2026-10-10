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
export function allFacts() { return db.prepare("SELECT * FROM seo_facts ORDER BY category, key").all(); }
export function getFact(key) { return db.prepare("SELECT * FROM seo_facts WHERE key=?").get(key); }
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
export function pageRevisions(pageId) { return db.prepare("SELECT id, version, agent, reason, at FROM seo_revisions WHERE page_id=? ORDER BY version DESC").all(Number(pageId)); }

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
export function listCaseStudies() { return db.prepare("SELECT * FROM seo_case_studies ORDER BY updated_at DESC").all(); }
export function upsertCaseStudy(data = {}) {
  if (data.id) {
    db.prepare(`UPDATE seo_case_studies SET client=?, project_access_id=?, industry=?, city=?, state=?, status=?, permission_to_name_client=?, updated_at=? WHERE id=?`)
      .run(data.client || null, data.project_access_id || null, data.industry || null, data.city || null, data.state || null,
           data.status || "opportunity", data.permission_to_name_client ? 1 : 0, now(), Number(data.id));
    return db.prepare("SELECT * FROM seo_case_studies WHERE id=?").get(Number(data.id));
  }
  const r = db.prepare(`INSERT INTO seo_case_studies (client, project_access_id, industry, city, state, status, permission_to_name_client) VALUES (?,?,?,?,?,?,?)`)
    .run(data.client || null, data.project_access_id || null, data.industry || null, data.city || null, data.state || null, data.status || "opportunity", data.permission_to_name_client ? 1 : 0);
  return db.prepare("SELECT * FROM seo_case_studies WHERE id=?").get(r.lastInsertRowid);
}

// ---- Backlinks ------------------------------------------------------------
export function listBacklinks() { return db.prepare("SELECT * FROM seo_backlinks ORDER BY updated_at DESC").all(); }
export function addBacklink(data = {}) {
  const r = db.prepare(`INSERT INTO seo_backlinks (domain, contact, reason, target_slug, relationship, authority, outreach_concept, status) VALUES (?,?,?,?,?,?,?,?)`)
    .run(data.domain || null, data.contact || null, data.reason || null, data.target_slug || null, data.relationship || null, data.authority || null, data.outreach_concept || null, data.status || "opportunity");
  return db.prepare("SELECT * FROM seo_backlinks WHERE id=?").get(r.lastInsertRowid);
}

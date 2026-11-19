// SEO engine storage (additive, idempotent). Called from db.js init() — `db` is the raw DatabaseSync
// handle. Nothing here drops or rewrites existing data. The whole SEO system (content records, fact
// store, case studies, internal-link graph, revisions, backlink queue) lives in these tables so it
// rides the same single database, backup/restore, and deploy persistence as the rest of the app.
//
// Design rules this schema enforces:
//   - A page never publishes without a verified fact trail — fact_check_status + the fact store.
//   - Every autonomous/manual change is revisioned (seo_revisions) for diff + rollback.
//   - The internal-link graph is first-class (seo_links) so orphans/cannibalization are queryable.

export const SEO_PAGE_TYPES = ["service", "industry", "location", "case-study", "resource", "hub"];
// The workflow states from the master plan (AG). Forward-ish, but any can be set by an editor/agent.
export const SEO_STATUSES = ["opportunity", "researching", "brief", "writing", "fact_check", "seo_qa", "needs_review", "approved", "published", "monitoring", "refresh", "blocked"];
export const SEO_FACT_CATEGORIES = ["identity", "service-area", "proof", "licensing", "warranty", "pricing", "brand"];

export function ensureSeoSchema(db) {
  // ---- Content records: one row per SEO page (real or proposed) ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS seo_pages (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      slug                  TEXT NOT NULL UNIQUE,              -- canonical: no leading/trailing slash ("new-jersey/union-county")
      page_type             TEXT NOT NULL DEFAULT 'resource',
      title                 TEXT,
      primary_topic         TEXT,
      primary_keyword       TEXT,
      secondary_topics      TEXT,                              -- JSON array
      search_intent         TEXT,                              -- transactional | commercial | informational | local
      service               TEXT,
      industry              TEXT,
      location              TEXT,
      parent_slug           TEXT,
      status                TEXT NOT NULL DEFAULT 'opportunity',
      priority              INTEGER DEFAULT 0,                 -- 0..100
      priority_tier         TEXT,                              -- P0..P3
      research              TEXT,                              -- JSON
      content_brief         TEXT,
      verified_facts        TEXT,                              -- JSON: fact keys this page relies on
      body                  TEXT,                              -- JSON: ordered content blocks (the draft)
      meta_title            TEXT,
      meta_description      TEXT,
      schema_json           TEXT,                              -- JSON-LD override for this page (optional)
      quality_score         INTEGER,
      fact_check_status     TEXT DEFAULT 'pending',            -- pending | passed | failed
      technical_check_status TEXT DEFAULT 'pending',
      published_url         TEXT,
      published_at          TEXT,
      last_reviewed         TEXT,
      performance_data      TEXT,                              -- JSON (GSC etc., later)
      agent_notes           TEXT,
      blocked_reason        TEXT,
      created_by            TEXT,
      created_at            TEXT DEFAULT (datetime('now','localtime')),
      updated_at            TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_seo_pages_status ON seo_pages(status)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_seo_pages_type ON seo_pages(page_type)");

  // ---- Fact store: the authoritative place for every business claim. No page cites a fact that
  //      isn't verified AND cleared for public use here. ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS seo_facts (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      key                TEXT NOT NULL UNIQUE,                 -- stable id: "company.phone", "claim.locations"
      claim              TEXT NOT NULL,                        -- human description of the claim
      value              TEXT,
      category           TEXT,
      source             TEXT,
      verified           INTEGER NOT NULL DEFAULT 0,
      public_use_allowed INTEGER NOT NULL DEFAULT 0,
      notes              TEXT,
      updated_by         TEXT,
      updated_at         TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // ---- Case studies: proof library, each tied to a verified project where possible ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS seo_case_studies (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      slug                 TEXT UNIQUE,
      client               TEXT,
      project_access_id    TEXT,                               -- link to the real project record (verification)
      industry             TEXT,
      city                 TEXT,
      state                TEXT,
      number_of_locations  INTEGER,
      problem              TEXT,
      scope                TEXT,
      services             TEXT,                               -- JSON
      devices              TEXT,                               -- JSON
      integrations         TEXT,                               -- JSON
      special_features     TEXT,
      challenge            TEXT,
      solution             TEXT,
      verified_outcome     TEXT,
      photos               TEXT,                               -- JSON
      video                TEXT,
      testimonial          TEXT,
      permission_to_name_client INTEGER NOT NULL DEFAULT 0,
      related_service_pages  TEXT,                             -- JSON
      related_location_pages TEXT,                             -- JSON
      related_industry_page  TEXT,
      status               TEXT NOT NULL DEFAULT 'opportunity',-- opportunity | verified | drafted | published | blocked
      created_at           TEXT DEFAULT (datetime('now','localtime')),
      updated_at           TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // ---- Internal-link graph: first-class so orphans + cannibalization are queryable ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS seo_links (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      from_slug  TEXT NOT NULL,
      to_slug    TEXT NOT NULL,
      anchor     TEXT,
      context    TEXT,
      UNIQUE(from_slug, to_slug, anchor)
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_seo_links_to ON seo_links(to_slug)");

  // ---- Revisions: every change produces a snapshot for diff + rollback ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS seo_revisions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id   INTEGER NOT NULL,
      version   INTEGER NOT NULL,
      snapshot  TEXT NOT NULL,                                 -- JSON of the page row at that version
      agent     TEXT,
      reason    TEXT,
      at        TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_seo_revisions_page ON seo_revisions(page_id)");

  // ---- Backlink / citation opportunity queue ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS seo_backlinks (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      domain           TEXT,
      contact          TEXT,
      reason           TEXT,
      target_slug      TEXT,
      relationship     TEXT,
      authority        TEXT,
      outreach_concept TEXT,
      status           TEXT NOT NULL DEFAULT 'opportunity',    -- opportunity | contacted | won | declined | dead
      created_at       TEXT DEFAULT (datetime('now','localtime')),
      updated_at       TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  seedFacts(db);
}

// Seed the fact store ONCE with what's safely knowable + the claims that must be verified before use.
// Idempotent: only inserts a key that isn't present, so edits/verifications are never overwritten.
function seedFacts(db) {
  const ins = db.prepare(`INSERT OR IGNORE INTO seo_facts (key, claim, value, category, source, verified, public_use_allowed, notes, updated_by)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seed')`);
  const F = (key, claim, value, category, verified, pub, notes = "") => ins.run(key, claim, value, category, "seed", verified ? 1 : 0, pub ? 1 : 0, notes);
  // Safe identity facts (present on the live site / brand).
  F("company.legal_name", "Legal entity", "La Vague Inc.", "identity", 1, 1);
  F("company.brand", "Brand name", "IOT TECHS", "identity", 1, 1);
  F("company.website", "Website", "https://iot-techs.com", "identity", 1, 1);
  // NAP must match the Google Business Profile exactly or the listing and the site don't corroborate
  // each other (the single biggest local-SEO own-goal). Source of truth = the GBP, confirmed by the owner.
  F("company.phone", "Phone", "(917) 727-0081", "identity", 1, 1, "Matches the Google Business Profile (owner-confirmed 2026-11-15). The old (646) 396-0775 is still the Zelle payment token — do not reuse it as the public line.");
  // VERIFIED but NOT cleared for public use (owner's decision, 2026-11-19): the street address is
  // not to be published on the site. It stays recorded because it is the real, GBP-matching address
  // and internal surfaces need it; publicFacts() withholds it, so no page or schema can cite it.
  // The locality ("Little Ferry, NJ") is fine to publish and is written where it is needed.
  F("company.address", "Business address", "120 Industrial Ave #4, Little Ferry, NJ 07643", "identity", 1, 0, "As listed on the Google Business Profile. NOT for public use — the owner asked that the street address not appear on the site. Publish the locality (Little Ferry, NJ) instead.");
  F("company.gbp", "Google Business Profile", "https://maps.google.com/?cid=15380872044622826314", "identity", 1, 1, "Used as sameAs so the site and the listing corroborate each other.");
  F("company.email", "Support email", "support@iot-techs.com", "identity", 1, 1);
  F("company.tagline", "Tagline", "Make Tomorrow Safer Today", "identity", 1, 1);
  F("service_area.primary", "Primary service area", "New Jersey; New York City; Westchester; Long Island", "service-area", 1, 1, "Positioning is NJ + NY; not nationwide.");
  // Core services offered — self-evident capability facts (the business is a security/low-voltage
  // integrator; the home page already lists these). Verified so a page can say "we install X" without the
  // grounding audit flagging it. NOTE: 24/7 MONITORING is deliberately excluded — it's a distinct service
  // that needs the owner to confirm a real monitoring relationship before any page claims it.
  F("company.services", "Core services installed", "Commercial security cameras & CCTV; license plate reader (LPR) cameras; commercial access control; commercial alarm systems; panic / duress / emergency buttons; structured cabling; commercial networking & Wi-Fi; commercial sound systems; restaurant technology & Toast POS installation", "identity", 1, 1, "What IOT TECHS installs. Excludes 24/7 monitoring (verify separately).");
  F("company.site_survey", "Offers on-site site surveys", "IOT TECHS provides an on-site site survey / security assessment before a quote", "identity", 1, 1);
  // Monitoring model — stated precisely so no page claims a central-station service IOT TECHS doesn't run.
  F("company.monitoring", "Monitoring model (self-monitored)", "IOT TECHS installs systems with 24/7 continuous recording and remote self-monitoring via a phone app — the owner views live footage and receives motion/alarm alerts on their phone. IOT TECHS does NOT operate a central or professional monitoring station; monitoring is customer-managed through the app.", "identity", 1, 1, "We install; the customer self-monitors via the app. Not a monitored-service claim.");
  // Claims that must NOT be published until verified (these appear on the home page today).
  F("claim.locations", "“1500+ locations” served claim", "1500+", "proof", 0, 0, "NEEDS VERIFICATION — currently on the home page. Confirm current & defensible before reuse.");
  F("claim.port_authority", "Port Authority reference", "Serves Port Authority", "proof", 0, 0, "NEEDS VERIFICATION — confirm it is contractually nameable in public marketing.");
  F("claim.nypd_traffic", "NYPD Traffic reference", "Serves NYPD Traffic", "proof", 0, 0, "NEEDS VERIFICATION — confirm public name-use is permitted.");
  F("company.brands_installed", "Camera/access/alarm brands installed", "", "brand", 0, 0, "NEEDS INPUT — list the brands actually installed (for schema + manufacturer-directory links).");
  F("company.licensing", "Low-voltage / alarm licensing", "", "licensing", 0, 0, "NEEDS INPUT — license numbers + jurisdictions for trust + legal claims.");
  F("pricing.standard_camera", "Standardized camera-install price (if public)", "", "pricing", 0, 0, "NEEDS DECISION — only publish from one canonical source if management approves.");
  F("company.warranty_months", "Standard warranty (months)", "", "warranty", 0, 0, "NEEDS INPUT.");
  correctNapFacts(db);
  confirmLicensingFact(db);
  withholdStreetAddress(db);
}

// Owner's decision 2026-11-19: the street address must not be published on the site. The seed above
// now inserts company.address with public_use_allowed = 0, but seeding is INSERT OR IGNORE, so an
// EXISTING store (production's) keeps the old row that was cleared for public use. Flip it once.
//
// The guard is `updated_by`: this only touches a row no human has edited (still 'seed', or set by one
// of the other one-time corrections). If the owner later decides to publish the address again from
// /dev/seo, upsertFact stamps their id into updated_by and this becomes a permanent no-op instead of
// silently reverting them on the next boot.
function withholdStreetAddress(db) {
  db.prepare(`UPDATE seo_facts SET public_use_allowed=0, notes=?, updated_by='owner-privacy'
              WHERE key='company.address' AND public_use_allowed=1 AND updated_by IN ('seed','nap-fix')`)
    .run("As listed on the Google Business Profile. NOT for public use — the owner asked that the street address not appear on the site (2026-11-19). Publish the locality (Little Ferry, NJ) instead.");
}

// Owner-confirmed 2026-11-19: IOT TECHS is licensed and insured. The home page has shown a
// "Licensed & Insured" badge all along while this fact sat unverified, so the site was publicly
// asserting something its own fact store refused to clear — which is exactly the inconsistency the
// store exists to prevent. Confirmed by the owner, so the STATEMENT is now verified and public.
// Licence NUMBERS and jurisdictions are still NOT recorded: a page may say "licensed and insured",
// but must never cite a number until one is entered in /dev/seo → Facts.
// Fires only while the value is still the seeded empty string, so a later owner edit is never
// clobbered, and it is a no-op on every boot after the first.
function confirmLicensingFact(db) {
  db.prepare(`UPDATE seo_facts SET value=?, notes=?, verified=1, public_use_allowed=1, updated_by='owner-confirm'
              WHERE key='company.licensing' AND (value IS NULL OR value='')`)
    .run("Licensed and insured",
      "Owner-confirmed 2026-11-19 (licensed AND insured). Licence numbers and jurisdictions are still NOT recorded — pages may state that the business is licensed and insured, but must never cite a licence number until one is entered here.");
}

// One-time NAP correction (2026-11-15). The seeds above are INSERT OR IGNORE: new keys (company.address,
// company.gbp) insert themselves into an existing store, but company.phone was already seeded with the old
// (646) 396-0775 — the number the site published before it was reconciled with the Google Business Profile.
// Every public page and all JSON-LD read these facts, so that stale row would quietly re-publish the wrong
// number and undo the site↔listing match. Rewrites ONLY the superseded value, so a later owner edit in
// /dev/seo is never clobbered, and it is a no-op on every boot after the first.
function correctNapFacts(db) {
  db.prepare("UPDATE seo_facts SET value=?, notes=?, verified=1, public_use_allowed=1, updated_by='nap-fix' WHERE key='company.phone' AND value=?")
    .run("(917) 727-0081",
      "Matches the Google Business Profile (owner-confirmed 2026-11-15). (646) 396-0775 is still the Zelle payment token — never republish it as the public line.",
      "(646) 396-0775");
}

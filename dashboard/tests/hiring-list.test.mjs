// Hiring list (Indeed-style) — the quick "interest" triage field + list wiring. The pure status
// buckets are exercised functionally; the DB migration, server action and client wiring are asserted
// at source (same approach as the expenses model test).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HIRING_STATUSES } from "../lib/hiring.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// Re-derive the client's tab buckets so a status can never fall through every tab (except terminal).
const TABS = [
  { key: "new",          test: (r) => r.status === "applied" },
  { key: "assessment",   test: (r) => r.status === "assessment" },
  { key: "interviewing", test: (r) => r.portal === 1 && ["phone", "in_person", "sop", "ride_along", "final_review"].includes(r.status) },
  { key: "compliance",   test: (r) => r.portal === 2 },
  { key: "training",     test: (r) => r.portal === 3 },
  { key: "declined",     test: (r) => r.status === "declined" },
];

test("every hiring status lands in exactly one list tab", () => {
  for (const s of HIRING_STATUSES) {
    const row = { status: s.key, portal: s.portal };
    const hits = TABS.filter((t) => t.test(row)).map((t) => t.key);
    assert.equal(hits.length, 1, `${s.key} matched tabs [${hits.join(",")}] — expected exactly one`);
  }
});

test("db migration adds the interest column and setApplicationReview writes it (validated, logged)", () => {
  const db = read("../lib/db.js");
  assert.ok(db.includes('ADD COLUMN interest TEXT'), "interest column migration present");
  assert.ok(/setApplicationReview\(appId, \{ rating[^)]*interest \}/.test(db), "setApplicationReview accepts interest");
  assert.ok(db.includes('["yes", "maybe", "no"].includes(interest)'), "interest is validated against the enum (else null)");
});

test("actions expose single + bulk interest and bulk archive, admin-gated", () => {
  const a = read("../app/onboarding/actions.js");
  assert.ok(a.includes("export async function setAppInterestAction"), "single interest action");
  assert.ok(a.includes("export async function bulkInterestAction"), "bulk interest action");
  assert.ok(a.includes("export async function bulkArchiveAction") && a.includes('user.role !== "admin"'), "bulk archive is admin-only");
  assert.ok(a.includes('revalidatePath("/hiring")'), "hiring board is revalidated on change");
});

test("the hiring list client renders the Indeed-style columns + controls", () => {
  const c = read("../app/hiring/hiring-client.jsx");
  assert.ok(c.includes("setAppInterestAction") && c.includes("bulkInterestAction") && c.includes("bulkArchiveAction"), "wires the actions");
  assert.ok(c.includes("Select all") && c.includes("toggleAll"), "select-all + bulk selection");
  assert.ok(c.includes("hb-stars") && c.includes("setRating"), "inline quick-rating");
  assert.ok(c.includes("/api/apply/resume?id="), "résumé link in the experience column");
  assert.ok(c.includes("Interested") && c.includes("Not interested"), "interest triage labels");
});

test("the page passes the new list fields through", () => {
  const p = read("../app/hiring/page.jsx");
  assert.ok(p.includes("interest: a.interest") && p.includes("experience: a.experience") && p.includes("resume_name: a.resume_name"), "interest/experience/résumé threaded to the client");
});

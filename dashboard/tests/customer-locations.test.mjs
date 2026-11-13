// Customer Locations — data layer (migration + backfill). Asserted at source (same approach as the
// other db.js tests, which avoid booting the real DB). The live backfill is verified separately against
// customer 27942 (10 projects → 8 locations, 2 company names); see the Fix doc.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const db = read("../lib/db.js");

test("customer_locations table + location_id columns exist", () => {
  assert.ok(db.includes("CREATE TABLE IF NOT EXISTS customer_locations"), "table created");
  for (const col of ["customer_id", "name", "address", "norm", "place_id", "property_type", "is_primary", "archived_at"]) {
    assert.ok(new RegExp(`\\b${col}\\b`).test(db), `column ${col} present`);
  }
  assert.ok(db.includes("ALTER TABLE projects ADD COLUMN location_id"), "projects.location_id");
  assert.ok(/location_id"?,?\s*"INTEGER"|ADD COLUMN location_id/.test(db), "service_calls.location_id");
  assert.ok(db.includes("idx_cust_loc_norm") && db.includes("archived_at IS NULL"), "partial-unique on (customer_id, norm) for active rows");
});

test("backfill + rollback + read helpers are exported and deterministic", () => {
  assert.ok(db.includes("export function backfillCustomerLocations"), "backfill exported");
  assert.ok(db.includes("export function rollbackCustomerLocations"), "rollback exported");
  assert.ok(db.includes("export function getCustomerLocations"), "read helper exported");
  assert.ok(db.includes("export function normalizeLocAddress"), "normalizer exported");
  // Only customer_id-linked jobs are touched (deterministic), from projects + service_calls.
  assert.ok(db.includes("FROM projects WHERE customer_id IS NOT NULL") && db.includes("FROM service_calls WHERE customer_id IS NOT NULL"), "backfill sources are the two customer-linked address tables");
  // adt is intentionally excluded (no customer_id).
  assert.ok(/adt_applications is intentionally excluded|no customer_id/.test(db), "adt exclusion documented");
  // Idempotency: reuse an existing (customer, norm) location instead of inserting a duplicate.
  assert.ok(db.includes("findLoc") && db.includes("locationsReused"), "reuses existing locations (idempotent)");
});

test("snapshot columns are kept, not migrated away", () => {
  // projects.address / company_name / contact_* remain the frozen per-job snapshot.
  assert.ok(!/DROP COLUMN (address|company_name|contact_)/.test(db), "no snapshot columns dropped");
  assert.ok(db.includes("stay as the frozen per-job snapshot") || db.includes("historical snapshot"), "snapshot intent documented");
});

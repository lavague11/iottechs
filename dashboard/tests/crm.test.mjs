// CRM identity rules (node --test): phone/email normalization, strong-identifier matching, search ranking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, normalizeEmail, phoneKey, formatPhone, strongMatch, rankCustomers, customerMeta } from "../lib/crm.js";

test("phone formats that are the same number normalize to one key", () => {
  const forms = ["6463960775", "646-396-0775", "(646) 396-0775", "+1 646 396 0775", "1 (646) 396-0775"];
  for (const f of forms) assert.equal(normalizePhone(f), "6463960775", f);
  assert.equal(formatPhone("+16463960775"), "(646) 396-0775");
  assert.equal(phoneKey("12345"), "", "too short to identify anyone");
});

test("email comparison is trimmed and case-insensitive", () => {
  assert.equal(normalizeEmail("  Ahmed@Email.com "), "ahmed@email.com");
  assert.equal(strongMatch({ email: "Ahmed@Email.com" }, { email: "ahmed@email.com" }), "email");
});

test("a name alone never matches; phone/email do, in any formatting", () => {
  const row = { name: "John Smith", email: "john@a.com", phone: "(201) 555-1212" };
  assert.equal(strongMatch({ name: "John Smith", email: "other@b.com", phone: "2015550000" }, row), null);
  assert.equal(strongMatch({ name: "J. Smith", phone: "+1 201-555-1212" }, row), "phone");
  assert.equal(strongMatch({ email: "JOHN@A.COM" }, row), "email");
});

test("search ranking: exact phone/email, then prefix name/company, then fuzzy; recency breaks ties", () => {
  const rows = [
    { id: 1, name: "Ahmed Elzoghabi", email: "ahmed@email.com", phone: "6463960775", company: null, last_project_at: "2026-01-01" },
    { id: 2, name: "Marco Rivera", email: "m@crazycars.com", phone: "2015551212", company: "Crazy Cars", last_project_at: "2026-09-01" },
    { id: 3, name: "Ahmad Khan", email: "ak@x.com", phone: "7185550000", company: null, last_project_at: "2026-08-01" },
  ];
  assert.deepEqual(rankCustomers("646-396-0775", rows).map((r) => r.id), [1]);
  assert.deepEqual(rankCustomers("crazy", rows).map((r) => r.id), [2]);
  assert.deepEqual(rankCustomers("ah", rows).map((r) => r.id), [3, 1], "prefix on both; newer first");
  assert.deepEqual(rankCustomers("rivera", rows).map((r) => r.id), [2], "second word prefix");
  assert.deepEqual(rankCustomers("zzz", rows), []);
});

test("customer meta line", () => {
  assert.equal(customerMeta({ projects: 3, last_service: "SC", last_project_at: "2026-09-15" }, (c) => ({ SC: "Security Cameras" }[c] || c)), "3 projects · Last Security Cameras · Sep 2026");
  assert.equal(customerMeta({ projects: 0 }), "");
});

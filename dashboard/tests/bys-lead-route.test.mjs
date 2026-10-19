// Generic BYS lead route — /api/leads/<vertical> creates a real lead for every vertical via the one
// canonical path (createLeadProject), mapping the client-sent service label to the project's service code.
// The cameras builder keeps its dedicated /api/leads/cctv route (static path beats this dynamic one).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/leads/[vertical]/route.js", import.meta.url), "utf8");
const shell = readFileSync(new URL("../public/widgets/cctv-quote-calculator.html", import.meta.url), "utf8");

test("the generic lead route creates a lead per vertical, service from the client, snapshot stored", () => {
  assert.ok(/export async function POST\(req, ctx\)/.test(route), "POST handler");
  assert.ok(route.includes('export const runtime = "nodejs"'), "node runtime");
  assert.ok(/const params = await \(ctx\?\.params \|\| \{\}\)/.test(route), "reads the dynamic [vertical] param");
  assert.ok(route.includes('const service = String(form.get("service") || "").trim() || vertical'), "service = client SPEC.lead.service, else the vertical");
  assert.ok(route.includes("createLeadProject(name, email || null, phone || null, address, service"), "creates the lead via the canonical path with that service");
  assert.ok(route.includes("saveCctvQuoteLead("), "stores the quote snapshot (snapshot carries its own calcVersion = the vertical)");
  assert.ok(route.includes('"incomplete contact details"'), "validates contact (name + address + email-or-phone)");
});

test("the shell sends the vertical + service with the lead", () => {
  assert.ok(shell.includes("fd.append('vertical',") && shell.includes("fd.append('service',"), "submitLead sends vertical + service");
  assert.ok(shell.includes("SPEC.lead && SPEC.lead.service"), "service comes from SPEC.lead.service");
});

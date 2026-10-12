import { test } from "node:test";
import assert from "node:assert/strict";
import { searchEntities } from "../lib/search.js";

const projects = [
  { access_id: "ASC0050", customer: "Nobo Restaurant", address: "1400 Palisade Ave", contact_phone: "(201) 555-1234", contact_email: "josh@nobo.com", service: "Security Cameras", stageLabel: "Proposal" },
  { access_id: "ASC0042", customer: "Crazy Cars", address: "658 US-22", contact_phone: "(646) 555-0000", service: "Sound System", stageLabel: "Survey" },
  { access_id: "ASC0046", customer: "Zain Farooq", address: "12 Main St", contact_phone: "(201) 555-9999", service: "Security Cameras", stageLabel: "Proposal" },
];
const tickets = [{ id: 7, subject: "Camera offline", project_customer: "Nobo Restaurant", status: "open", priority: "urgent" }];
const serviceCalls = [{ id: 3, customer: "Crazy Cars", address: "658 US-22", stage: "scheduled" }];
const technicians = [{ id: 11, name: "Mike Tech", phone: "(201) 555-7777" }];

test("exact project id wins and lands on that project", () => {
  const { groups } = searchEntities({ q: "ASC0050", projects });
  const proj = groups.find((g) => g.type === "project");
  assert.equal(proj.items[0].id, "ASC0050");
  assert.equal(proj.items[0].href, "/project/ASC0050");
});

test("partial id matches (0050 → ASC0050)", () => {
  const { groups } = searchEntities({ q: "0050", projects });
  assert.equal(groups.find((g) => g.type === "project").items[0].id, "ASC0050");
});

test("name + token matching (nobo, farooq)", () => {
  assert.equal(searchEntities({ q: "nobo", projects }).groups[0].items[0].title, "Nobo Restaurant");
  assert.equal(searchEntities({ q: "farooq", projects }).groups[0].items[0].title, "Zain Farooq");
});

test("address match surfaces the project", () => {
  const { groups } = searchEntities({ q: "palisade", projects });
  assert.equal(groups.find((g) => g.type === "project").items[0].id, "ASC0050");
});

test("phone fragment finds the record", () => {
  const { groups } = searchEntities({ q: "2015559999", projects });
  assert.ok(groups.find((g) => g.type === "project").items.some((r) => r.id === "ASC0046"));
});

test("customers derive from projects with contact subtitle", () => {
  const { groups } = searchEntities({ q: "zain", projects });
  const cust = groups.find((g) => g.type === "customer");
  assert.ok(cust && cust.items[0].title === "Zain Farooq");
  assert.match(cust.items[0].href, /^\/customers\//);
});

test("groups come back in fixed order and all entity types search", () => {
  const { groups, total } = searchEntities({ q: "crazy", projects, tickets, serviceCalls, technicians });
  assert.ok(total >= 2);
  const types = groups.map((g) => g.type);
  // projects before customers before service in the canonical order
  assert.ok(types.indexOf("project") < types.indexOf("service"));
  assert.ok(groups.find((g) => g.type === "service").items[0].href === "/service-calls/3");
});

test("direct entity hit outranks a weak address hit", () => {
  const { groups } = searchEntities({ q: "crazy cars", projects });
  const items = groups.find((g) => g.type === "project").items;
  assert.equal(items[0].id, "ASC0042");   // name match, not some address partial
});

test("empty query returns nothing", () => {
  assert.deepEqual(searchEntities({ q: "   ", projects }), { groups: [], total: 0 });
});

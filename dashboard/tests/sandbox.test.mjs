// Sandbox ("Demo") — an admin-only throwaway copy of a project, walkable as any role with every action
// behaving for real. The safety story is not "writes are disabled", it is: a different project, hidden
// from every list, physically unable to send mail, and disposable. These tests pin each of those.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isSandbox, canSandbox, sandboxRoleFrom, sandboxEmail, tagSandboxName,
  SANDBOX_SOURCE, SANDBOX_ROLES, SANDBOX_CHILD_TABLES, SANDBOX_COPY_TABLES,
  SANDBOX_WO_COPY_TABLES, SANDBOX_WO_CHILD_TABLES,
} from "../lib/sandbox.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// lib/email.js can't be imported here (it pulls in node:sqlite via an extensionless "./db" that only
// Next resolves), so isDemoProject is exercised by lifting its real body out of the source. If that
// function is ever reworded, this test fails loudly rather than quietly passing against a stale copy.
const isDemoProject = (() => {
  const src = read("../lib/email.js");
  const at = src.indexOf("export function isDemoProject(p) {");
  assert.ok(at > -1, "isDemoProject still exists in lib/email.js");
  const body = src.slice(at, src.indexOf("\n}", at) + 2).replace("export function", "function");
  // eslint-disable-next-line no-new-func
  return new Function(`${body}; return isDemoProject;`)();
})();

test("sandbox_of is the ONE test for a demo — not the name, source or email", () => {
  assert.equal(isSandbox({ sandbox_of: "ACM0001" }), true);
  assert.equal(isSandbox({ sandbox_of: null }), false);
  assert.equal(isSandbox({ source: "journey-test" }), false, "source alone is not a sandbox");
  assert.equal(isSandbox({ customer: "[DEMO] Acme" }), false, "a tagged name is not a sandbox");
  assert.equal(isSandbox(null), false);
});

test("a sandbox can never email anyone — both isDemoProject checks hold", () => {
  // The two independent guards every customer send already routes through (lib/email.js).
  assert.equal(isDemoProject({ source: SANDBOX_SOURCE }), true, "source stamp alone suppresses mail");
  assert.equal(isDemoProject({ contact_email: sandboxEmail("ACM0007") }), true, "contact stamp alone suppresses mail");
  assert.match(sandboxEmail("ACM0007"), /@journey-test\.local$/);
  // A real project is unaffected.
  assert.equal(isDemoProject({ source: "external", contact_email: "owner@realbusiness.com" }), false);
});

test("admin only — a manager, sales, tech or customer can never open a demo", () => {
  assert.equal(canSandbox("admin"), true);
  for (const r of ["manager", "sales", "tech", "customer", "vendor", "readonly", "", null, undefined])
    assert.equal(canSandbox(r), false, `${r} must not get the demo`);
});

test("the role switcher offers every other role, and rejects anything else", () => {
  assert.deepEqual(SANDBOX_ROLES, ["customer", "tech", "sales", "manager", "vendor", "readonly"]);
  assert.equal(sandboxRoleFrom("customer"), "customer");
  assert.equal(sandboxRoleFrom("ADMIN"), "admin", "admin is the way back out");
  assert.equal(sandboxRoleFrom("root"), null);
  assert.equal(sandboxRoleFrom(""), null);
  assert.equal(sandboxRoleFrom(undefined), null);
});

test("the name is tagged once, never stacked on a re-copy", () => {
  assert.equal(tagSandboxName("Acme Storage"), "[DEMO] Acme Storage");
  assert.equal(tagSandboxName("[DEMO] Acme Storage"), "[DEMO] Acme Storage", "copying a copy does not double-tag");
  assert.equal(tagSandboxName(""), "[DEMO] Project");
});

test("discard covers every per-project table, with the right key column for each", () => {
  // Most per-project tables are created in db.js, but a table may own its own schema module
  // (`addendums` lives in lib/addendum-schema.js). Search both so the list can name either.
  const schema = read("../lib/db.js") + "\n" + read("../lib/addendum-schema.js");
  for (const [table, key] of SANDBOX_CHILD_TABLES) {
    const at = schema.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
    assert.ok(at > -1, `${table} exists`);
    const body = schema.slice(at, at + 1400);
    assert.ok(new RegExp(`\\b${key}\\b`).test(body), `${table} is keyed by ${key}`);
  }
  // The two that differ are the easy ones to get wrong — pin them explicitly.
  const byName = Object.fromEntries(SANDBOX_CHILD_TABLES);
  assert.equal(byName.documents, "access_id");
  assert.equal(byName.expenses, "access_id");
  assert.equal(byName.proposals, "project_access_id");
  // Everything a demo starts WITH must also be cleaned up when it is thrown away.
  for (const { table } of SANDBOX_COPY_TABLES)
    assert.ok(byName[table], `${table} is copied in, so it must be deleted on discard`);
});

test("a sandbox is hidden from every project list, count and sweep", () => {
  const db = read("../lib/db.js");
  const slice = (name) => {
    const at = db.indexOf(`export function ${name}(`);
    assert.ok(at > -1, `${name} exists`);
    return db.slice(at, db.indexOf("\nexport function", at + 10));
  };
  // getAllJobs is the big one: it feeds the project lists AND the scheduled-email sweeps.
  for (const fn of ["getAllJobs", "getStalledJobs", "getVisibleJobs", "getCustomers", "getJobsForCustomer",
                    "getCustomersWithStats", "searchProjects", "getReceivables", "getProjectsByContactEmail",
                    "getOwnedProjectsForCustomer", "autoCloseExpiredUnsigned", "findLikelyDuplicateProjects"])
    assert.match(slice(fn), /sandbox_of IS NULL/, `${fn} excludes demos`);
  // ...but a demo must still be openable by id, or you could never walk into one.
  assert.doesNotMatch(slice("getJobByAccessId"), /sandbox_of/, "getJobByAccessId still returns a demo");
});

test("discard is hard-guarded on sandbox_of so it can never delete a real project", () => {
  const db = read("../lib/db.js");
  const at = db.indexOf("export function discardSandboxProject(");
  const fn = db.slice(at, db.indexOf("\nexport function", at + 10));
  assert.match(fn, /if \(!p\.sandbox_of\) return \{ error/, "refuses a non-sandbox up front");
  assert.match(fn, /DELETE FROM projects WHERE access_id = \? AND sandbox_of IS NOT NULL/,
    "the DELETE itself re-checks sandbox_of — not just the guard above it");
});

test("creating a demo reads the source but never writes to it", () => {
  const db = read("../lib/db.js");
  const at = db.indexOf("export function createSandboxProject(");
  const fn = db.slice(at, db.indexOf("\nexport function", at + 10));
  assert.doesNotMatch(fn, /UPDATE projects/, "no write to the source project");
  assert.match(fn, /SANDBOX_SOURCE/, "stamps the demo source so mail is suppressed");
  assert.match(fn, /sandboxEmail\(accessId\)/, "stamps the demo contact so mail is suppressed");
  assert.match(fn, /if \(src\.sandbox_of\) return \{ error/, "refuses to make a demo of a demo");
  assert.match(fn, /PRAGMA table_info\(projects\)/, "copies columns from the live schema, not a typed list");
});

test("transactions use BEGIN/COMMIT — node:sqlite has no db.transaction()", () => {
  // db.transaction() is better-sqlite3. On node:sqlite it throws at call time, which a server action's
  // .catch() swallows into a silent no-op — the failure mode that made the first Demo click do nothing.
  const db = read("../lib/db.js");
  const code = db.replace(/^\s*\/\/.*$/gm, "");   // the ban is on calls, not on comments explaining it
  assert.doesNotMatch(code, /db\.transaction\(/, "db.transaction() does not exist on node:sqlite");
  for (const fn of ["createSandboxProject", "discardSandboxProject"]) {
    const at = db.indexOf(`export function ${fn}(`);
    const body = db.slice(at, db.indexOf("\nexport function", at + 10));
    assert.match(body, /db\.exec\("BEGIN"\)/, `${fn} opens a transaction`);
    assert.match(body, /db\.exec\("COMMIT"\)/, `${fn} commits`);
    assert.match(body, /db\.exec\("ROLLBACK"\)/, `${fn} rolls back on failure`);
  }
});

test("a demo id keeps the 4-character tail document filenames depend on", () => {
  // String(n).toString(36) is a no-op returning decimal digits — it produced a 6-digit id (ASC630414)
  // and would have broken projectFileBase, which names every download off the last 4.
  const db = read("../lib/db.js");
  const at = db.indexOf("export function createSandboxProject(");
  const fn = db.slice(at, db.indexOf("\nexport function", at + 10));
  assert.doesNotMatch(fn, /String\(Math\.floor\([^)]*\)\)\.toString\(36\)/, "radix applied to a string does nothing");
  assert.match(fn, /Math\.floor\(Math\.random\(\) \* 1679615\)\.toString\(36\)/, "base36 of the number itself");
  // 1679615 = 'zzzz' in base 36, so the generated tail is always 4 characters after padStart.
  assert.equal((1679615).toString(36).length, 4);
  assert.equal((0).toString(36).padStart(4, "0").length, 4);
});

test("inside a demo an admin BECOMES the role (writable) — and only an admin, only on a demo", () => {
  const page = read("../app/project/[accessId]/page.jsx");
  assert.match(page, /project\?\.sandbox_of && canSandbox\(user\.role\) && asRole/,
    "the real-role switch requires a sandbox row AND an admin AND an explicit ?as=");
  // The old read-only preview is now admin-only: no manager, no sales-sees-customer.
  assert.match(page, /if \(previewRole && user\.role === "admin"\) return previewRole;/);
  assert.doesNotMatch(page, /user\.role === "sales" && previewRole === "customer"/, "sales no longer previews the customer view");
  assert.match(page, /!\(p\.sandbox_of && asRole\)/, "impersonation never links the admin's account as the customer");
});

test("the demo bar switches role by navigation, so the server renders the real role view", () => {
  const bar = read("../app/project/[accessId]/sandbox-bar.jsx");
  assert.match(bar, /searchParams\.set\("as", role\)/, "role change is a URL navigation");
  assert.ok(bar.includes("discardSandboxAction") && bar.includes("resetSandboxAction"), "Reset + Discard wired");
  assert.match(bar, /confirmDiscard/, "Discard is two-step");
  assert.ok(/Exit/.test(bar) && bar.includes("/project/${sourceAccessId}"), "always a way back to the real project");
});

test("the three sandbox actions are admin-only and reject a PIN session", () => {
  const act = read("../app/project/[accessId]/actions.js");
  for (const fn of ["startSandboxAction", "discardSandboxAction", "resetSandboxAction"]) {
    const at = act.indexOf(`export async function ${fn}(`);
    assert.ok(at > -1, `${fn} exists`);
    const body = act.slice(at, act.indexOf("\nexport async function", at + 10));
    assert.match(body, /canSandbox\(tok\.role\)/, `${fn} is admin-only`);
    assert.match(body, /tok\.viaPin/, `${fn} rejects a PIN-only session`);
  }
});

test("Demo is offered on a real project only, and only to an admin", () => {
  const gw = read("../app/project/[accessId]/gateway-client.jsx");
  assert.match(gw, /const offerDemo = canSandbox && !sandbox;/, "never offered inside a demo");
  assert.match(gw, /onDemo=\{offerDemo \? startDemo : null\}/, "staff hub Portal menu");
  assert.match(gw, /sandbox && canSandbox\s*\n?\s*\? <SandboxBar/, "the bar needs both a demo row and an admin");
  const hub = read("../app/project/[accessId]/staff-hub.jsx");
  assert.match(hub, /\{onDemo && <button role="menuitem"/, "the hub renders Demo only when the host passes it");
});

// ── A demo opens on the REAL job ───────────────────────────────────────────────────────────────────
// It used to copy only survey/mockup/proposal, so an admin walking a finished job through the roles saw
// no work order, no crew, no balance and an empty log — a blank version of the thing they meant to show.
test("the demo carries the job's real state, not just its built content", () => {
  const copied = new Set(SANDBOX_COPY_TABLES.map((t) => t.table));
  for (const t of ["project_tool_data", "proposals", "stage_acceptances",      // the original three
                   "project_assignments", "project_payments", "addendums",      // crew, money, change orders
                   "install_issues", "project_events", "project_notes", "expenses", "requests"])
    assert.ok(copied.has(t), `${t} travels into the demo`);
  // Analytics about the real customer, and signing artefacts bound to the source document, never travel.
  for (const t of ["project_views", "proposal_views", "sign_documents", "sign_sessions"])
    assert.ok(!copied.has(t), `${t} must NOT be copied`);
  assert.equal(SANDBOX_COPY_TABLES.find((t) => t.table === "expenses").key, "access_id", "expenses key differs");
});

test("the work order travels, its children are remapped, the crew's time and signatures are not", () => {
  const copied = SANDBOX_WO_COPY_TABLES.map((t) => t.table);
  assert.deepEqual(copied, ["wo_lines", "wo_versions"]);
  for (const { key } of SANDBOX_WO_COPY_TABLES) assert.equal(key, "wo_id", "children hang off the wo id");
  // A technician never signed the demo's document; their day logs and credits are real time and money.
  for (const t of ["wo_signatures", "wo_checkins", "wo_day_logs", "wo_events", "wo_line_credits", "wo_line_media"])
    assert.ok(!copied.includes(t), `${t} must NOT be copied into a demo`);
  // …but every one of them must still be cleaned up, since a demo accrues its own once you work in it.
  for (const t of ["wo_lines", "wo_versions", "wo_signatures", "wo_checkins",
                   "wo_day_logs", "wo_events", "wo_line_credits", "wo_line_media"])
    assert.ok(SANDBOX_WO_CHILD_TABLES.includes(t), `${t} is wiped on discard`);
  // The live work order is `wo`; `work_orders` is the legacy table, so listing only that leaked the row.
  const byName = Object.fromEntries(SANDBOX_CHILD_TABLES);
  assert.equal(byName.wo, "project_access_id", "the wo row itself is discarded");
});

test("db.js remaps wo children onto the NEW wo id and resolves them before deleting the parent", () => {
  const db = read("../lib/db.js");
  const at = db.indexOf("function copySandboxWorkOrder(");
  assert.ok(at > -1, "the work-order copy exists");
  const body = db.slice(at, db.indexOf("\nexport function", at));
  assert.ok(/last_insert_rowid\(\)/.test(body), "it reads the new wo id");
  assert.ok(/c === key \? newWoId/.test(body), "and threads it through every child row");
  assert.ok(!/BEGIN|COMMIT/.test(body), "it runs inside the caller's transaction so a failure rolls back");
  const dis = db.slice(db.indexOf("export function discardSandboxProject("));
  const woIdx = dis.indexOf("SELECT id FROM wo WHERE project_access_id");
  const delIdx = dis.indexOf("DELETE FROM projects WHERE access_id");
  assert.ok(woIdx > -1 && woIdx < delIdx, "child wo ids are resolved before the project row goes");
});

test("a demo's expenses never count as company spend", () => {
  const db = read("../lib/db.js");
  // Pre-existing leak this change had to close first: adding an expense inside a demo put it in the real
  // /expenses list, the category totals and the approval queue.
  for (const fn of ["getExpenses", "getExpenseStats", "getPendingExpenses", "getPendingRequests"]) {
    const at = db.indexOf(`export function ${fn}(`);
    assert.ok(at > -1, `${fn} exists`);
    const body = db.slice(at, db.indexOf("\n}", at));
    assert.ok(/sandbox_of IS NULL|EXPENSE_NOT_SANDBOX/.test(body), `${fn} excludes sandbox projects`);
  }
  // A company expense has no project at all — it must survive the filter.
  assert.ok(/e\.access_id IS NULL OR p\.sandbox_of IS NULL/.test(db), "unattached expenses still count");
});

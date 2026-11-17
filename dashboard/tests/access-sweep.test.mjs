// The "scoped to the project but never checked for a capability" family (a project grant / canReadProject
// admits techs too). Pure rule tests for the contact guard, plus structural sweeps over EVERY server action
// file and EVERY API route - not one file, not only the last `return`.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { contactWriteError, touchesContact } from "../lib/contact-guard.js";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1").replace(/%20/g, " ");
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
function walk(dir, pred, out = []) {
  for (const n of readdirSync(join(root, dir))) {
    const rel = `${dir}/${n}`;
    if (statSync(join(root, rel)).isDirectory()) { if (n !== "node_modules" && n !== ".next") walk(rel, pred, out); }
    else if (pred(rel)) out.push(rel);
  }
  return out;
}

// ---- contact record: ONE rule, refused BEFORE any write ------------------------------------------
const PHONE = { contact_phone: "5550001234" };
test("a customer can write contact fields only until intake is confirmed - through EITHER action", () => {
  const base = { role: "customer", owns: true, canEditContact: false };
  assert.equal(contactWriteError({ ...base, infoConfirmed: false, fields: PHONE }), null, "first-login intake is allowed");
  assert.match(contactWriteError({ ...base, infoConfirmed: true, fields: PHONE }), /locked/i, "after confirmation: refused");
  assert.equal(contactWriteError({ ...base, infoConfirmed: true, fields: { contact_message: "hi" } }), null, "their message stays writable");
  assert.equal(contactWriteError({ ...base, owns: false, infoConfirmed: false, fields: PHONE }), "Not your project.");
});
test("staff need project.contact.edit; vendor/readonly/unknown roles never write the record", () => {
  for (const role of ["vendor", "readonly", "nobody"]) assert.equal(contactWriteError({ role, owns: true, canEditContact: false, fields: PHONE }), "Unauthorized.", role);
  for (const role of ["admin", "manager", "sales", "tech"]) assert.equal(contactWriteError({ role, owns: true, canEditContact: true, fields: PHONE }), null, role);
  assert.equal(touchesContact({ contact_message: "x" }), false);
  assert.equal(touchesContact({ address: "x" }), true);
});
test("both actions that write the contact record consult the guard BEFORE updateProjectContact (so customer_pin cannot be re-derived)", () => {
  const act = read("app/project/[accessId]/actions.js");
  for (const name of ["confirmInfoAction", "updateProjectInfoAction"]) {
    const start = act.indexOf(`export async function ${name}`);
    const fn = act.slice(start, act.indexOf("\nexport async function ", start + 10));
    const g = fn.indexOf("contactWriteErr(");
    const w = fn.indexOf("updateProjectContact(");
    assert.ok(g > 0 && w > g, `${name}: guard must precede the write`);
    assert.match(fn, /if \(werr\) return \{ error: werr \}/, name);
  }
  // no other action file writes the record
  const writers = walk("app", (f) => /\.(js|jsx)$/.test(f)).filter((f) => /updateProjectContact\(/.test(read(f)));
  assert.deepEqual(writers, ["app/project/[accessId]/actions.js"]);
});
test("the intake UI hides Edit once details are locked, and never shows the raw word Unauthorized", () => {
  const li = read("app/project/[accessId]/lead-info-step.jsx");
  assert.match(li, /!project\.info_confirmed_at && <button[^]*?>Edit<\/button>/);
  assert.doesNotMatch(read("lib/contact-guard.js").split("Unauthorized.").slice(0, 1).join(""), /customer[^]*Unauthorized/);
  const g = contactWriteError({ role: "customer", owns: true, infoConfirmed: true, fields: PHONE });
  assert.doesNotMatch(g, /Unauthorized/);
});

// ---- API routes: a project grant is not a capability ------------------------------------------------
test("every API route that trusts the iot_access project grant also checks the grant's ROLE", () => {
  const routes = walk("app/api", (f) => /route\.js$/.test(f));
  const issuers = new Set(["app/api/auth/route.js", "app/api/logout/route.js", "app/api/face-login/route.js", "app/api/addendum-approve/route.js", "app/api/bug-draft/route.js"]);   // mint/clear the grant; bug-draft only keys a private draft to the caller
  const bad = [];
  for (const r of routes) {
    const src = read(r);
    if (!/iot_access/.test(src) || issuers.has(r)) continue;
    if (!/(acc|at|a)\??\.role|\.role\b/.test(src)) bad.push(r);
  }
  assert.deepEqual(bad, []);
});
test("/api/pay/create only honours a PIN grant that is a CUSTOMER grant", () => {
  const src = read("app/api/pay/create/route.js");
  assert.match(src, /acc && acc\.role === "customer" && String\(acc\.accessId\) === String\(accessId\)/);
});

// ---- server actions: money-bearing returns are capability- or viewer-gated -------------------------
test("every exported server action in the project folder that reads the ledger gates it by role", () => {
  const files = walk("app/project/[accessId]", (f) => /actions?\.js$/.test(f) || /-actions\.js$/.test(f));
  const problems = [];
  for (const f of files) {
    const src = read(f);
    for (const chunk of src.split(/\nexport async function /).slice(1)) {
      const name = chunk.slice(0, chunk.indexOf("("));
      if (!/getProjectPayments\(/.test(chunk)) continue;                       // reads the raw ledger
      const gated = /paymentsForViewer\(|paymentsSummary\(|customer\.financials\.view/.test(chunk);
      const staffOnly = /STAFF\.has\(tok\.role\)|!\["admin", "manager"\]\.includes\(tok\.role\)/.test(chunk);
      // anywhere in the body, not just after the last `return {`
      if (!gated && !staffOnly) problems.push(`${f}:${name}`);
    }
  }
  assert.deepEqual(problems, []);
});

// ---- money events carry a structured flag ----------------------------------------------------------
test("events whose label carries a dollar figure are flagged at the call site", () => {
  for (const [f, n] of [["app/api/addendum/route.js", 1], ["app/api/proposal-import/route.js", 2], ["app/project/[accessId]/proposal-actions.js", 2]]) {
    const hits = read(f).split("\n").filter((l) => /logProjectEvent\(/.test(l) && /\$\$\{|\$\{amt\}|Payment canceled/.test(l));
    assert.ok(hits.length >= n, `${f}: expected >= ${n} money events`);
    for (const l of hits) assert.match(l, /money: true/, `${f}: ${l.trim().slice(0, 70)}`);
  }
  const db = read("lib/db.js");
  assert.match(db, /export function logProjectEvent\(accessId, \{ kind, label, actor, money = false \}\)/);
  assert.match(db, /ADD COLUMN money INTEGER/);
});

// ---- round 4 ---------------------------------------------------------------------------------------
test("every logProjectEvent that interpolates a dollar amount or AI text is flagged money (no fail-open emitters)", () => {
  const files = walk("app", (f) => /\.(js|jsx)$/.test(f)).concat(walk("lib", (f) => /\.js$/.test(f)));
  const unflagged = [];
  for (const f of files) {
    const lines = read(f).split("\n");
    lines.forEach((l, i) => {
      if (!/logProjectEvent\(/.test(l) || /export function logProjectEvent/.test(l)) return;
      const block = lines.slice(i, i + 8).join("\n");
      const call = block.slice(0, block.search(/\}\s*\)\s*;?/) + 1 || undefined);
      const printsMoney = /\$\$\{|\$\{amt\}|Payment canceled|AI: \$\{/.test(call);
      if (printsMoney && !/money:\s*(true|amount != null)/.test(call)) unflagged.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(unflagged, []);
});
test("getEventsAction gates on the flag AND keeps a regex net for unflagged dollar text", () => {
  const pa = read("app/project/[accessId]/proposal-actions.js");
  const ev = pa.slice(pa.indexOf("export async function getEventsAction"), pa.indexOf("export async function logCallAction"));
  assert.ok(ev.includes("!e.money && !/") && ev.includes("test(String(e.label"), "flag is the gate, regex is the net");
});
test("confirmInfoAction and updateProjectInfoAction bind ANY PIN grant (tech included) to its own project", () => {
  const act = read("app/project/[accessId]/actions.js");
  const helper = act.slice(act.indexOf("function contactWriteErr"), act.indexOf("export async function updateProjectInfoAction"));
  assert.match(helper, /owns: tok\.viaPin \? String\(tok\.accessId\) === String\(accessId\)/);
  assert.doesNotMatch(helper, /owns: tok\.role !== "customer" \? true/);
  // and the rule refuses an unowned write for non-customers too
  assert.equal(contactWriteError({ role: "tech", owns: false, canEditContact: true, fields: { contact_phone: "5559998888" } }), "Not your project.");
});

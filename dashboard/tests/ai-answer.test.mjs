// Phase-1 "answer" layer: read-only business questions resolve to REAL data (never invented) via injected
// db functions, authorized per role. Pure — we inject fakes, so no DB.
import test from "node:test";
import assert from "node:assert/strict";
import { runQuery, READ_QUERIES } from "../lib/ai-answer.js";
import { can } from "../lib/roles.js";

const PROPOSAL = { options: [{ id: "A", services: [{ key: "camera", items: [{ id: "i1", name: "Camera", qty: 4, price: 150 }] }] }] };
const JOBS = {
  ASC1: { access_id: "ASC1", customer: "Crazy Cars", stage: "proposal", tech: "Tess Tech", payout_amount: 500, payout_status: "approved" },
  ASC2: { access_id: "ASC2", customer: "Nobo Restaurant", stage: "qc" },
};
const db = {
  getActiveProposal: (a) => a === "ASC1" ? { status: "sent", payload: JSON.stringify(PROPOSAL), tax_rate: 0, deposit_pct: 50, selected_option: "A", signed_name: null } : { status: "draft" },
  getJobByAccessId: (a) => JOBS[a] || null,
  getReceivables: () => [
    { access_id: "ASC1", customer: "Crazy Cars", status: "sent", financialState: "awaiting_signature", agingDays: 5, signatureDeadline: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 19).replace("T", " ") },
    { access_id: "ASC2", customer: "Nobo Restaurant", status: "accepted", financialState: "due_now", amountDueNow: 500, agingDays: 10 },
  ],
  // No reminder events yet on ASC1 — the initial proposal-send email is NOT logged as a "signature request"
  // event (only requestSignatureEmailAction logs that), so a 5-day-old unsigned proposal is due for reminder #1.
  getProjectEvents: () => [],
  getVisibleJobs: (_uid, role) => (role === "admin" || role === "manager") ? Object.values(JOBS) : [JOBS.ASC1],   // non-privileged see only ASC1
  searchProjects: (q) => Object.values(JOBS).filter((j) => j.customer.toLowerCase().includes(String(q).toLowerCase())),
  buildStageFacts: (a) => a === "ASC1" ? { stage: "proposal", proposal_status: "sent" } : { stage: "qc" },   // ASC1: sent, not accepted → customer must accept
  getProjectAssignments: () => [{ role: "tech", user_id: 7 }],
  getProjectFinancialState: (a) => a === "ASC1" ? { total: 600, paid: 100, balance: 500, pendingPayments: 0 } : null,
  listInstallIssues: (a) => a === "ASC1" ? [{ status: "NEEDS_REVIEW", title: "Camera 3 offline" }, { status: "RESOLVED", title: "Old flag" }] : [],
  listFeedback: (a) => a === "ASC1" ? [
    { feedback_kind: "objection:need", feedback_status: "open", feedback_device_label: "C2 Camera (Front Entrance)", body: "not sure we need it" },
    { feedback_kind: "objection:price", feedback_status: "open", body: "too expensive" },
    { feedback_kind: "feedback:praise", feedback_status: "resolved", body: "love the layout" },
  ] : [],
  getProjectDevices: (a) => a === "ASC1" ? [
    { id: "d1", k: "cam", kindName: "Camera", code: "C1", identity: "Camera 1", label: "Lobby", loc: "Lobby", floor: 0, floorName: "Floor 1", x: 20, y: 30, cone: true, aimed: true, aim: 45, fov: 30, range: 40 },
    { id: "d2", cid: "cBBB222", k: "cam", kindName: "Camera", code: "C2", identity: "Camera 2", label: "Front Entrance", loc: "Front Entrance", floor: 0, floorName: "Floor 1", x: 82, y: 68, cone: true, aimed: true, aim: 92, fov: 30, range: 40, placementType: "outside" },
  ] : [],
};
const fin = { optionTotals: (opt) => ({ grand: (opt.services || []).reduce((s, sv) => s + (sv.items || []).reduce((a, it) => a + it.qty * it.price, 0), 0) }) };
// Uses the REAL capability map so role-stripping is genuinely exercised. userName matches ASC1.tech for the
// own-payout test.
const ctx = (role = "admin", currentAccessId = null, userName = "Admin") => ({ role, userId: 1, userName, currentAccessId, can, db, fin });

test("proposal_total retrieves the real grand total (by name and by 'this')", () => {
  const r = runQuery({ query: "proposal_total", target: "Crazy Cars" }, ctx());
  assert.match(r.text, /Crazy Cars.*\$600\.00/);
  assert.ok(r.facts.some((f) => /\$600\.00/.test(f)), "records the fact for memory");
  assert.match(runQuery({ query: "proposal_total", target: "this" }, ctx("admin", "ASC1")).text, /\$600\.00/);
});

test("a resolved read returns the project so memory can track 'it' later", () => {
  // Reads carry back the resolved project → the client remembers it → a later pronoun resolves via
  // currentAccessId, even though nothing navigated.
  const total = runQuery({ query: "proposal_total", target: "Crazy Cars" }, ctx());
  assert.deepEqual(total.project, { accessId: "ASC1", name: "Crazy Cars" });
  const status = runQuery({ query: "project_status", target: "Crazy Cars" }, ctx());
  assert.deepEqual(status.project, { accessId: "ASC1", name: "Crazy Cars" });
  // "what's going on with it" after that answer → target "this" resolves to the remembered project.
  assert.match(runQuery({ query: "project_status", target: "it" }, ctx("admin", "ASC1")).text, /Crazy Cars/);
});

test("device_coverage explains a resolved device from survey facts (the headline's middle step)", () => {
  // "the front entrance camera" → resolves to C2 and reports its stored coverage (never invented).
  const r = runQuery({ query: "device_coverage", target: "this", ref: "what does the front entrance camera cover" }, ctx("admin", "ASC1"));
  assert.match(r.text, /C2 Camera is on Floor 1 in Front Entrance/);
  assert.match(r.text, /aimed about 92°/);
  assert.match(r.text, /~40 ft/);
  assert.deepEqual(r.project, { accessId: "ASC1", name: "Crazy Cars" });
  // Carries the device locator so the client can highlight it on the planner (floor-plan highlight).
  assert.deepEqual(r.device, { id: "d2", cid: "cBBB222", floor: 0, code: "C2", label: "Front Entrance", accessId: "ASC1" });
  // Ambiguous ("the camera" with two) → clarify, not a guess.
  const amb = runQuery({ query: "device_coverage", target: "this", ref: "what does the camera cover" }, ctx("admin", "ASC1"));
  assert.equal(amb.reason, "ambiguous");
  assert.match(amb.error, /Which device/);
  // Unknown device → a handled no_data miss.
  assert.equal(runQuery({ query: "device_coverage", target: "this", ref: "what does the kiosk cover" }, ctx("admin", "ASC1")).reason, "no_data");
  // No survey devices on ASC2 → says so (never invents).
  assert.match(runQuery({ query: "device_coverage", target: "Nobo Restaurant", ref: "camera 1" }, ctx()).text, /no placed survey devices/);
});

test("signature_nudges queues sent-but-unsigned proposals due for a reminder (never auto-sends)", () => {
  // ASC1: awaiting signature 5 days, only the initial send email → first reminder is due.
  const r = runQuery({ query: "signature_nudges" }, ctx());
  assert.match(r.text, /due for a signature nudge/i);
  assert.match(r.text, /Crazy Cars \(5d\)/);
  assert.match(r.text, /remind/i);   // tells the human how to send (queue-for-confirm)
  assert.ok(r.facts.some((f) => /nudges due/.test(f)));
  // The chase list is a sales/office read (cap proposal.reuse) — a technician is refused.
  assert.equal(runQuery({ query: "signature_nudges" }, ctx("tech")).reason, "permission");
});

test("collections_queue lists unpaid deposits/balances due for a reminder (admin/manager only)", () => {
  // ASC2: due_now, $500 owed 10 days, no reminders yet → due for the first payment reminder.
  const r = runQuery({ query: "collections_queue" }, ctx());
  assert.match(r.text, /due for a payment reminder/i);
  assert.match(r.text, /Nobo Restaurant \(\$500 balance, 10d\)/);
  assert.match(r.text, /remind/i);
  // Money-sensitive collections read → sales (no install.pay.edit) is refused; so is a tech.
  assert.equal(runQuery({ query: "collections_queue" }, ctx("sales")).reason, "permission");
  assert.equal(runQuery({ query: "collections_queue" }, ctx("tech")).reason, "permission");
});

test("feedback_summary summarizes captured objections/feedback (open items + device + status counts)", () => {
  const r = runQuery({ query: "feedback_summary", target: "this" }, ctx("admin", "ASC1"));
  assert.match(r.text, /Crazy Cars: 2 open feedback items/);
  assert.match(r.text, /Need objection \(C2 Camera \(Front Entrance\)\)/);   // bound device shown
  assert.match(r.text, /consider dropping it/);   // #7 — a device-bound need objection suggests remove_line
  assert.match(r.text, /Price objection/);
  assert.match(r.text, /1 resolved\./);
  assert.deepEqual(r.project, { accessId: "ASC1", name: "Crazy Cars" });
  // No feedback on ASC2 → says so, never invents.
  assert.match(runQuery({ query: "feedback_summary", target: "Nobo Restaurant" }, ctx()).text, /no logged feedback/);
});

test("#6 explain_item: glossary definition, GROUNDED against the customer's own package; never a cap", () => {
  // A line that IS in their proposal → grounded with the real qty.
  const cam = runQuery({ query: "explain_item", target: "this", ref: "what's the camera" }, ctx("customer", "ASC1"));
  assert.match(cam.text, /Security camera/);
  assert.match(cam.text, /includes 4 of these/);
  // A known term NOT in their proposal → still explained, no invented grounding.
  const nvr = runQuery({ query: "explain_item", target: "this", ref: "what's the nvr" }, ctx("customer", "ASC1"));
  assert.match(nvr.text, /NVR \(the recorder\)/);
  assert.doesNotMatch(nvr.text, /includes \d+ of these/);
  // Unknown term → a gentle no_data miss (so the customer path can fall to the FAQ).
  assert.equal(runQuery({ query: "explain_item", target: "this", ref: "what's the flux capacitor" }, ctx("customer", "ASC1")).reason, "no_data");
});

test("#6 compare_options: retail-gated; single vs multiple options; grounded totals", () => {
  // Single-option proposal (the shared fake) → says so, with headline gear + the real total.
  const one = runQuery({ query: "compare_options", target: "this" }, ctx("admin", "ASC1"));
  assert.match(one.text, /one recommended package at \$600\.00/);
  assert.match(one.text, /4 × Camera/);
  // Retail cap — a tech/vendor never sees option totals.
  assert.equal(runQuery({ query: "compare_options", target: "this" }, ctx("tech", "ASC1")).reason, "permission");
  // Two-option proposal → both compared with their totals.
  const TWO = { options: [
    { id: "A", name: "Premium", services: [{ key: "camera", items: [{ id: "i1", name: "Camera", qty: 8, price: 150 }] }] },
    { id: "B", name: "Essential", services: [{ key: "camera", items: [{ id: "i2", name: "Camera", qty: 4, price: 150 }] }] },
  ] };
  const db2 = { ...db, getActiveProposal: () => ({ status: "sent", payload: JSON.stringify(TWO), tax_rate: 0, deposit_pct: 50, selected_option: "A" }) };
  const r = runQuery({ query: "compare_options", target: "this" }, { role: "admin", userId: 1, userName: "A", currentAccessId: "ASC1", can, db: db2, fin });
  assert.match(r.text, /Premium \(\$1,200\.00\): 8 × Camera/);
  assert.match(r.text, /Essential \(\$600\.00\): 4 × Camera/);
});

test("#6 explain_terms: deposit % from their plan + PCP; retail-gated; never invented", () => {
  // No payment_plan on the fake → falls back to the deposit %; balance on completion.
  const dep = runQuery({ query: "explain_terms", target: "this", ref: "how does the deposit work" }, ctx("customer", "ASC1"));
  assert.match(dep.text, /50% deposit is due before work begins/);
  // PCP branch — the fake proposal has no credit applied → says so (never invents an amount).
  const pcp = runQuery({ query: "explain_terms", target: "this", ref: "what's the pcp credit" }, ctx("customer", "ASC1"));
  assert.match(pcp.text, /PCP .*credit/);
  assert.match(pcp.text, /doesn't have a PCP credit applied/);
  // Retail cap — a tech is refused.
  assert.equal(runQuery({ query: "explain_terms", target: "this", ref: "deposit" }, ctx("tech", "ASC1")).reason, "permission");
});

test("ownedAccessId lets a customer read their OWN project even when it's outside the visible set (#3 L2 fix)", () => {
  // A customer on ASC2, which getVisibleJobs(customer) does NOT return (non-privileged sees only ASC1 here).
  const base = { role: "customer", userId: 9, userName: "Cust", currentAccessId: "ASC2", can, db, fin };
  assert.equal(runQuery({ query: "project_status", target: "this" }, base).reason, "no_data");   // filtered out → fails closed
  // With ownership proven upstream (ownedAccessId), the SAME read resolves to their own project.
  const r = runQuery({ query: "project_status", target: "this" }, { ...base, ownedAccessId: "ASC2" });
  assert.ok(!r.error, "owned project resolves");
  assert.match(r.text, /Nobo Restaurant/);
  // (Cross-project protection for the customer path is the FORCED target:"this" in aiCustomerInterpretAction —
  // customerReadIntent discards any named target — not getVisibleJobs; see ai-customer.test.)
});

test("project_status reports stage + proposal state, never invented", () => {
  const r = runQuery({ query: "project_status", target: "Crazy Cars" }, ctx());
  assert.match(r.text, /Proposal stage/);
  assert.match(r.text, /awaiting signature/);
});

test("awaiting_signature lists only unsigned, visible proposals", () => {
  const r = runQuery({ query: "awaiting_signature" }, ctx());
  assert.match(r.text, /1 proposal.*awaiting signature: Crazy Cars/);   // Nobo is signed → excluded
});

test("projects_by_stage filters the authorized project list", () => {
  assert.match(runQuery({ query: "projects_by_stage", stage: "qc" }, ctx()).text, /1 project.*Quality Control: Nobo Restaurant/);
  assert.match(runQuery({ query: "projects_by_stage", stage: "proposal" }, ctx()).text, /Crazy Cars/);
});

test("authorization: a sales user can't read a project they can't see (no leak)", () => {
  const r = runQuery({ query: "proposal_total", target: "Nobo Restaurant" }, ctx("sales"));
  assert.ok(r.error && r.reason === "no_data", "scoped out → no_data, not the real total");
  // …but awaiting_signature for sales shows only their visible set (Crazy Cars), never Nobo.
  assert.doesNotMatch(runQuery({ query: "awaiting_signature" }, ctx("sales")).text || "", /Nobo/);
});

test("ambiguous + unknown reads classify instead of guessing", () => {
  assert.equal(runQuery({ query: "proposal_total" }, ctx("admin", null)).reason, "ambiguous");   // no target, no current project
  assert.equal(runQuery({ query: "nonsense" }, ctx()).reason, "unsupported_read");
  assert.ok(READ_QUERIES.includes("proposal_total") && READ_QUERIES.length >= 4);
});

test("project_next names the blocker, whose turn, the recommended action — and staff get parallel prep", () => {
  const r = runQuery({ query: "project_next", target: "Crazy Cars" }, ctx("manager"));
  assert.match(r.text, /Proposal stage/);
  assert.match(r.text, /blocker/i);
  assert.match(r.text, /customer'?s turn/i);          // ASC1: sent, awaiting the customer to accept
  assert.match(r.text, /recommended/i);
});

test("project_money is cap-gated: office sees it, a technician never does", () => {
  assert.match(runQuery({ query: "project_money", target: "Crazy Cars" }, ctx("sales")).text, /balance \$500\.00/);
  const tech = runQuery({ query: "project_money", target: "Crazy Cars" }, ctx("tech", null, "Tess Tech"));
  assert.equal(tech.reason, "permission", "a tech cannot see customer financials");
});

test("proposal_total + project_status strip retail from a technician (no price leak)", () => {
  assert.equal(runQuery({ query: "proposal_total", target: "Crazy Cars" }, ctx("tech", null, "Tess Tech")).reason, "permission");
  const status = runQuery({ query: "project_status", target: "Crazy Cars" }, ctx("tech", null, "Tess Tech"));
  assert.doesNotMatch(status.text, /\$/, "a tech sees the stage + proposal state but never the total");
  assert.match(status.text, /Proposal stage/);
});

test("project_payout: a tech sees ONLY their own job; refused on a job they aren't on", () => {
  const mine = runQuery({ query: "project_payout", target: "Crazy Cars" }, ctx("tech", null, "Tess Tech"));
  assert.match(mine.text, /Your payout is \$500\.00 \(approved\)/);
  const notMine = runQuery({ query: "project_payout", target: "Crazy Cars" }, ctx("tech", null, "Someone Else"));
  assert.equal(notMine.reason, "permission", "not their assigned job → no payout leak");
  // Admin sees the figure named by project; sales (no install.pay.view) is refused.
  assert.match(runQuery({ query: "project_payout", target: "Crazy Cars" }, ctx("admin")).text, /payout is \$500\.00/);
  assert.equal(runQuery({ query: "project_payout", target: "Crazy Cars" }, ctx("sales")).reason, "permission");
});

test("project_issues lists only OPEN flags; project_timeline is stage-aware", () => {
  assert.match(runQuery({ query: "project_issues", target: "Crazy Cars" }, ctx()).text, /1 open issue: Camera 3 offline/);
  assert.doesNotMatch(runQuery({ query: "project_issues", target: "Crazy Cars" }, ctx()).text, /Old flag/);
  assert.match(runQuery({ query: "project_timeline", target: "Crazy Cars" }, ctx()).text, /Proposal stage/);
});

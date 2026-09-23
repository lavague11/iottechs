// Lifecycle gate + install/QC model tests (node --test). Pure modules only — no DB, no React.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STAGE_FLOW, MASTER_ORDER, blockingReqs, gateThroughIndex } from "../lib/stage-flow.js";
import { PHASES, STAGES, phaseGate, canAdvanceTo } from "../lib/spec.js";
import { installItemsFromProposal, installProgress, qcProgress, qcItemStates, itemWorkState, issueOpen, ISSUE_STATES, stepsFor } from "../lib/install-checklist-model.js";
import { installAppointmentConfirmed, toolFingerprint } from "../lib/tool-data.js";
import { proposalDiff, addendumFingerprint, addendumSignatureCurrent, proposalFingerprint } from "../lib/proposal.js";
import { PHASE_BLOCKS } from "../lib/project-blocks.js";

const proposal = {
  selected_option: "A",
  payload: { options: [{ id: "A", name: "Option A", services: [
    { key: "camera", name: "Cameras", items: [{ id: "cam1", name: "Dome Camera", qty: 1, price: 150, sub: [{ name: "Drop", qty: 1, price: 20 }] }, { id: "cam2", name: "Bullet Camera", qty: 1, price: 150, sub: [{ name: "Drop", qty: 1, price: 20 }] }] },
    { key: "equip", name: "Equipment", items: [{ id: "nvr1", name: "8-Channel NVR", qty: 1, price: 400 }, { id: "lab1", name: "Cat6 Drop", qty: 4, price: 20 }] },
  ] }] },
  tax_rate: 8.875, deposit_pct: 50,
};
const allFacts = { date: "2026-01-01", survey_accepted: true, proposal_status: "accepted", proposal_signed: true, deposit_submitted: true, deposit_recorded: true, tech_accepted: true, install_confirmed: true, install_done: true, install_photos: true, qc_manager_approved: true, qc_customer_signed: true, final_balance_paid: true, completion_docs: true };

test("lifecycle levels: 5 phases / 9 stages / 16 steps, all check-backed", () => {
  assert.equal(PHASES.length, 5);
  assert.equal(STAGES.length, 9);
  assert.deepEqual(STAGES.map((s) => s.key), MASTER_ORDER);
  const steps = Object.values(STAGE_FLOW).flat();
  assert.equal(steps.length, 16);
  assert.equal(steps.filter((r) => r.check).length, 16);
});

test("6: install photo fact, 7: appointment RSVP fact, 8: completion doc fact gate their stages", () => {
  const f = { ...allFacts, install_photos: false };
  assert.deepEqual(blockingReqs("install", f, []).map((r) => r.label), ["Install photos uploaded"]);
  assert.deepEqual(blockingReqs("schedule", { ...allFacts, install_confirmed: false }, []).map((r) => r.label), ["Customer confirmed the install appointment"]);
  assert.deepEqual(blockingReqs("completion", { ...allFacts, completion_docs: false }, []).map((r) => r.label), ["Completion documents generated"]);
  assert.equal(blockingReqs("install", allFacts, []).length, 0);
});

test("7: RSVP fact reads server-recorded confirmations only", () => {
  const going = JSON.stringify({ events: [{ id: 1, kind: "install", confirmations: { "a@b.c": { status: "going" } } }] });
  const declined = JSON.stringify({ events: [{ id: 1, kind: "install", confirmations: { "a@b.c": { status: "declined" } } }] });
  const legacy = JSON.stringify({ events: [{ id: 1, title: "Installation", confirmed_at: "2026-01-01" }] });
  const survey = JSON.stringify({ events: [{ id: 1, kind: "survey", confirmed_at: "2026-01-01" }] });
  assert.equal(installAppointmentConfirmed(going), true);
  assert.equal(installAppointmentConfirmed(declined), false);
  // A technician confirming their own attendance is not the customer's confirmation.
  const techOnly = JSON.stringify({ events: [{ id: 1, kind: "install", confirmations: { "t@iot.com": { role: "tech", name: "Devon" } } }] });
  const custRole = JSON.stringify({ events: [{ id: 1, kind: "install", confirmations: { "c@x.com": { role: "customer", name: "Ada" } } }] });
  assert.equal(installAppointmentConfirmed(techOnly), false);
  assert.equal(installAppointmentConfirmed(custRole), true);
  assert.equal(installAppointmentConfirmed(legacy), true);
  assert.equal(installAppointmentConfirmed(survey), false);
  assert.equal(installAppointmentConfirmed(null), false);
});

test("forward-only gating: a new gate never re-locks an in-flight project past that stage", () => {
  const facts = { ...allFacts, install_done: false, install_photos: false, qc_manager_approved: false, qc_customer_signed: false };
  const g = phaseGate(facts, [], "A", "qc");   // project already sits in QC (Closeout) with the new install facts unmet
  assert.equal(g.phases.find((p) => p.key === "ph_install").unlocked, true);
  assert.equal(g.phases.find((p) => p.key === "ph_wrap").unlocked, true);
  assert.equal(g.reachedStage, "qc");                      // stuck at its own stage's unmet reqs, not rewound
  assert.equal(canAdvanceTo("completion", facts, [], "A", "qc"), false);
  const atInstall = phaseGate(facts, [], "A", "install");
  assert.equal(atInstall.phases.find((p) => p.key === "ph_wrap").unlocked, false);   // going forward it does gate
  assert.equal(atInstall.blocker.label, "Install checklist completed");
});

test("install model: one item derivation shared by work order, QC and the gate", () => {
  const items = installItemsFromProposal(proposal);
  assert.deepEqual(items.map((i) => i.id), ["cam1", "cam2", "nvr1"]);     // labor line excluded
  const done = { steps: { cam1: 5, cam2: 5, nvr1: 3 } };
  assert.equal(installProgress(proposal, JSON.stringify(done), null).allDone, true);
  assert.equal(installProgress(proposal, JSON.stringify({ steps: { cam1: 5, cam2: 4, nvr1: 3 } }), null).allDone, false);
  // approved add-on lines join the list (expanded by qty); voided/pending ones don't
  const add = JSON.stringify({ addendums: [{ id: "a1", status: "approved", items: [{ id: "x1", name: "Extra cam", type: "camera", qty: 2 }] }, { id: "a2", status: "pending", items: [{ id: "x2", type: "camera", qty: 1 }] }] });
  const p = installProgress(proposal, JSON.stringify({ steps: { cam1: 5, cam2: 5, nvr1: 3, "x1#0": 5, "x1#1": 5 } }), add);
  assert.equal(p.items, 5);
  assert.equal(p.allDone, true);
});

test("1/2/3/5: a flag overlays the claim, blocks completion until resolved/dismissed, history intact", () => {
  const max = stepsFor("camera").length;
  const flag = { id: 1, target_id: "cam1", status: "NEEDS_REVIEW" };
  assert.equal(itemWorkState(max, max, []), "COMPLETE");
  assert.equal(itemWorkState(max, max, [flag]), "NEEDS_REVIEW");          // claim not erased: done stays at max
  assert.equal(itemWorkState(max, max, [{ ...flag, status: "NEEDS_REWORK" }]), "NEEDS_REWORK");
  assert.equal(itemWorkState(max, max, [{ ...flag, status: "DISMISSED" }]), "COMPLETE");
  assert.equal(itemWorkState(max, max, [{ ...flag, status: "RESOLVED" }]), "COMPLETE");
  assert.equal(itemWorkState(2, max, []), "IN_PROGRESS");
  assert.equal(itemWorkState(0, max, []), "NOT_STARTED");
  assert.ok(issueOpen(flag) && !issueOpen({ status: "RESOLVED" }));
  assert.deepEqual(Object.values(ISSUE_STATES), ["Needs Review", "Needs Rework", "Resolved", "Dismissed"]);
  // gate: install_done is allDone && openIssues === 0 (db.js) — the model side of that:
  const inst = installProgress(proposal, JSON.stringify({ steps: { cam1: 5, cam2: 5, nvr1: 3 } }), null);
  assert.equal(inst.allDone && [flag].filter(issueOpen).length === 0, false);
  assert.equal(inst.allDone && [{ ...flag, status: "DISMISSED" }].filter(issueOpen).length === 0, true);
});

test("9/10: per-item QC — open flag blocks the device, editing one device changes only its fingerprint", () => {
  const qc = { checks: { cam1: { Online: true, "Angle OK": true, Recording: true, "Night Vision": true }, cam2: { Online: true, "Angle OK": true, Recording: true, "Night Vision": true }, nvr1: { "Powered On": true, Recording: true, "Remote Access": true } } };
  assert.equal(qcProgress(proposal, JSON.stringify(qc)).allPass, true);
  assert.equal(qcProgress(proposal, JSON.stringify(qc), null, [{ target_id: "cam2", status: "NEEDS_REVIEW" }]).allPass, false);
  const a = qcItemStates(proposal, JSON.stringify(qc), null, []);
  const edited = { checks: { ...qc.checks, cam1: { ...qc.checks.cam1, "Night Vision": false } } };
  const b = qcItemStates(proposal, JSON.stringify(edited), null, []);
  const fp = (list, id) => toolFingerprint("qc_item", list.find((x) => x.id === id).meaning);
  assert.notEqual(fp(a, "cam1"), fp(b, "cam1"));
  assert.equal(fp(a, "cam2"), fp(b, "cam2"));        // untouched device keeps its acceptance
  assert.equal(b.find((x) => x.id === "cam1").pass, false);
  // Un-installing a step after sign-off voids that device's acceptance too (install state is in the meaning).
  const c = qcItemStates(proposal, JSON.stringify(qc), JSON.stringify({ steps: { cam2: 5 } }), []);
  assert.notEqual(fp(a, "cam2"), fp(c, "cam2"));
  // Approved add-on devices are QC-able (and must pass) — a signed add-on that isn't ticked blocks allPass.
  const add = JSON.stringify({ addendums: [{ id: "a1", status: "approved", title: "Extra", discount: 0, items: [{ id: "x1", name: "Extra cam", type: "camera", qty: 1, price: 200 }] }] });
  assert.equal(qcProgress(proposal, JSON.stringify(qc), null, [], add).allPass, false);
  assert.ok(qcItemStates(proposal, JSON.stringify(qc), null, [], add).some((x) => x.id === "x1#0"));
});

test("11: proposal diff is structured (added / changed / removed / totals), never raw", () => {
  const cur = JSON.parse(JSON.stringify(proposal));
  cur.payload.options[0].services[0].items[0].price = 175;                       // cam1 price
  cur.payload.options[0].services[1].items.push({ id: "mon1", name: '24" Monitor', qty: 1, price: 220 });
  cur.payload.options[0].services[0].items.splice(1, 1);                          // remove cam2
  const d = proposalDiff(proposal, cur);
  assert.equal(d.any, true);
  const o = d.options[0];
  assert.deepEqual(o.added.map((x) => x.name), ['24" Monitor']);
  assert.deepEqual(o.removed.map((x) => x.name), ["Bullet Camera"]);
  assert.deepEqual(o.changed.map((x) => [x.name, x.from.price, x.to.price]), [["Dome Camera", 150, 175]]);
  assert.notEqual(o.total.from, o.total.to);
  assert.equal(proposalDiff(proposal, proposal).any, false);
  assert.notEqual(proposalFingerprint(proposal.payload, 8.875, 50), proposalFingerprint(cur.payload, 8.875, 50));
});

test("12: addendum fingerprint — customer price/qty voids the acceptance, tech payout does not", () => {
  const a = { id: "a1", title: "Extra cam", status: "approved", discount: 0, items: [{ id: "i1", name: "Cam", qty: 1, price: 200, techPay: 40 }] };
  a.signedFingerprint = addendumFingerprint(a);
  assert.equal(addendumSignatureCurrent(a), true);
  assert.equal(addendumSignatureCurrent({ ...a, items: [{ ...a.items[0], techPay: 60 }] }), true);   // internal only
  assert.equal(addendumSignatureCurrent({ ...a, items: [{ ...a.items[0], price: 250 }] }), false);
  assert.equal(addendumSignatureCurrent({ ...a, status: "pending" }), false);
  assert.equal(addendumSignatureCurrent({ id: "legacy", status: "approved", items: [] }), true);    // pre-binding rows honored
});

test("15: the deck tool manifest is THE source — PHASE_BLOCKS derives from it, the page gates on it", async () => {
  const { DECK_TOOLS, sees } = await import("../lib/deck-tools.js");
  const { ROLE_KEYS } = await import("../lib/roles.js");
  assert.strictEqual(PHASE_BLOCKS, DECK_TOOLS);                        // same object, not a copy
  for (const list of Object.values(DECK_TOOLS)) for (const t of list) for (const r of Object.keys(t.access)) assert.ok(ROLE_KEYS.includes(r), `${t.name}: ${r}`);
  // Every manifest tool that the page pushes conditionally must ask sees() — grep the source so a
  // hand-written role check can't creep back in. (Site Survey / Mockups / Completion are unconditional.)
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../app/project/[accessId]/gateway-client.jsx", import.meta.url), "utf8");
  const unconditional = new Set(["Site Survey", "Mockups", "Completion / Wrap-up"]);
  for (const [phase, list] of Object.entries(DECK_TOOLS)) for (const t of list) {
    if (unconditional.has(t.name)) continue;
    assert.ok(src.includes(`sees(cView, "${phase}", "${t.name}")`), `gateway must gate "${t.name}" through sees()`);
  }
  assert.equal(sees("sales", "ph_install", "Work Order"), true);
  assert.equal(sees("customer", "ph_install", "Work Order"), false);
  assert.equal(sees("vendor", "ph_install", "Shipment Tracking"), true);
  assert.equal(sees("admin", "ph_install", "Shipment Tracking"), false);
  assert.deepEqual(Object.keys(PHASE_BLOCKS), PHASES.map((p) => p.key));
  const names = Object.values(PHASE_BLOCKS).flat().map((b) => b.name);
  for (const retired of ["Install Scheduling", "Proposal Views", "Survey Scheduling & Notes"]) assert.ok(!names.includes(retired), retired);
  // Shipment Tracking survives only as the vendor's block.
  const trk = Object.values(PHASE_BLOCKS).flat().find((b) => b.name === "Shipment Tracking");
  assert.deepEqual(Object.keys(trk.access), ["vendor"]);
});

test("13/14: role × capability map — sales reads Install, readonly and vendor mutate nothing", async () => {
  const { can, ROLE_KEYS, CAPS } = await import("../lib/roles.js");
  assert.equal(can("sales", "install.view"), true);
  for (const c of ["install.edit", "install.pay.view", "install.pay.edit", "issue.report", "issue.adjudicate", "addendum.payout.view", "stage.move"]) assert.equal(can("sales", c), false, c);
  for (const c of Object.keys(CAPS).filter((k) => /\.(edit|report|adjudicate|move|sign|build|price)/.test(k))) assert.equal(can("readonly", c), false, c);
  for (const c of Object.keys(CAPS).filter((k) => k !== "tracking.view" && k !== "tracking.edit")) assert.equal(can("vendor", c), false, c);
  assert.equal(can("vendor", "tracking.edit"), true);
  assert.equal(can("customer", "addendum.sign"), true);
  assert.equal(can("tech", "addendum.sign"), false);
  assert.equal(ROLE_KEYS.length, 7);
  assert.throws(() => can("admin", "nope"));
});

test("16: the draw tool hands the survey a vector plan (SVG scene), raster only after AI enhance", async () => {
  const fs = await import("node:fs");
  const html = fs.readFileSync(new URL("../public/widgets/draw-floorplan.html", import.meta.url), "utf8");
  // One SVG scene: structure (boundary path), rooms (edges), labels (<text>) and the grid pattern.
  const svgFn = html.slice(html.indexOf("function sketchSVG()"), html.indexOf("// ---- enhance"));
  for (const part of ['<svg xmlns="http://www.w3.org/2000/svg"', "boundaryEdges()", "edgesOf(set)", "<text x=", '<pattern id="pg"', "data:image/svg+xml"]) assert.ok(svgFn.includes(part), part);
  // The finish hand-off posts the SVG (vector:true) unless an AI-enhanced raster exists.
  assert.ok(html.includes('dataUrl:sketchSVG(), vector:true'));
  assert.ok(html.includes("if(enhancedURL){ try{ parent.postMessage({type:\"satellite-capture-result\", dataUrl:enhancedURL}"));
});

test("survey skip satisfies both Consulting requirements; gateThroughIndex walks forward", () => {
  const f = { survey_skipped: true };
  assert.equal(blockingReqs("inquiry", f, []).length, 0);
  assert.equal(blockingReqs("site_survey", f, []).length, 0);
  assert.equal(gateThroughIndex({}, [], MASTER_ORDER, 0), 0);
  assert.equal(gateThroughIndex(f, [], MASTER_ORDER, 0), 2);   // → proposal (its "sent" req is unmet)
});

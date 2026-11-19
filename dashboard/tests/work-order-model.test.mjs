// The work order as its OWN document (docs/WORK_ORDERS.md), Stage 1: a copy of a published proposal
// option valued at technician payout, with no retail figure anywhere in it.
// Pure model only — the SQL side is tests/work-order-db.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  workOrderPayloadFrom, woLines, woTotal, woOption, reseedPayouts, lineKind, needsPhotos,
  workOrderFingerprint, workOrderDiff, workOrderChangeState, validateWorkOrderPayload,
} from "../lib/work-order.js";
import { WAIVER_CAUSES, techOptionTotal, optionTotals } from "../lib/proposal.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const editor = read("../app/project/[accessId]/proposal-items-editor.jsx");
const woEditor = read("../app/project/[accessId]/work-order-editor.jsx");
const woActions = read("../app/project/[accessId]/work-order-actions.js");
const gateway = read("../app/project/[accessId]/gateway-client.jsx");

// A proposal with: a camera block (parent + labor sub-lines), a CPE-waived display, and a flat NVR.
// Retail prices are deliberately different from the payouts so a leak is visible in a total.
const RATES = { cam_drop: 10, cam_mgmt: 18, cam_term: 12, cam_mount: 12, nvr_setup: 75, monitor_mount: 40 };
const proposal = () => ({
  id: 41, version: 3, selected_option: "A", sent_at: "2026-02-01 09:00:00",
  payload: {
    discount: { type: "flat", value: 100 },
    options: [{
      id: "A", name: "Recommended",
      services: [{
        key: "camera", label: "Security Cameras", note: "Front lot first.",
        items: [
          { id: "c1", name: "Front Door Camera", qty: 1, price: 450, cost: 120, outdoor: true, desc: "A customer-facing blurb",
            sub: [
              { id: "c1a", name: "Cat6 Drop", qty: 1, price: 150, cost: 20 },
              { id: "c1b", name: "Termination", qty: 1, price: 60 },
              { id: "c1c", name: "Mounting", qty: 1, price: 90 },
            ] },
          { id: "d1", name: "Monitor + Mount", qty: 1, price: 300, waived: true, waiverCauses: [WAIVER_CAUSES.CPE] },
          { id: "n1", name: "NVR (8-Channel)", qty: 1, price: 700, techPrice: 95 },
        ],
      }],
    }, { id: "B", name: "Budget", services: [{ key: "camera", label: "Security Cameras", items: [{ id: "z1", name: "Dome", qty: 1, price: 200 }] }] }],
  },
});

test("the snapshot copies the SELECTED option and carries no retail figure at all", () => {
  const p = workOrderPayloadFrom(proposal(), { rates: RATES });
  assert.equal(p.options.length, 1, "a work order holds exactly one option");
  assert.equal(p.options[0].id, "A");
  const json = JSON.stringify(p);
  assert.ok(!/"price"/.test(json), "no price field survives the copy");
  assert.ok(!/"cost"/.test(json), "no cost field survives the copy");
  assert.ok(!/"desc"/.test(json), "no customer description survives the copy");
  assert.ok(!/"discount"/.test(json), "no discount survives the copy");
  assert.ok(!/Budget/.test(json), "the unselected option is not copied");
});

test("payouts seed from the rate book; an existing techPrice is never clobbered", () => {
  const p = workOrderPayloadFrom(proposal(), { rates: RATES });
  const by = Object.fromEntries(woLines(p).map((l) => [l.key, l.payout]));
  assert.equal(by.c1a, 28, "Cat6 Drop = drop + management");
  assert.equal(by.c1b, 12);
  assert.equal(by.c1c, 12);
  assert.equal(by.n1, 95, "the admin's existing override wins over the $75 standard rate");
  assert.equal(by.d1, 40, "a CPE line is still seeded from the rate book — the tech installs it");
  assert.equal(by.c1, 0, "a parent with sub-lines has no standard rate of its own; the office prices it");
});

test("CPE and waived lines stay on the sheet, keep their badge data, and are PAID", () => {
  const p = workOrderPayloadFrom(proposal(), { rates: RATES });
  const disp = woLines(p).find((l) => l.key === "d1");
  assert.ok(disp, "the CPE display is on the work order");
  assert.equal(disp.waived, true);
  assert.equal(disp.cpe, true, "the CPE cause carries over, so the badge renders");
  assert.equal(disp.total, 40, "a waived line is NOT zeroed on a work order (techItemTotal, not itemTotal)");
  // The retail document comps it; the work order does not. Those two facts live in different formulas.
  const retail = optionTotals(proposal().payload.options[0], 0, { type: "flat", value: 0 }, 50, 0);
  assert.equal(retail.sub, 450 + 150 + 60 + 90 + 0 + 700, "retail comps the waived display to $0");
  assert.equal(woTotal(p), 0 + 28 + 12 + 12 + 40 + 95, "payout pays it");
});

test("woTotal is the canonical payout formula, not a second one", () => {
  const p = workOrderPayloadFrom(proposal(), { rates: RATES });
  assert.equal(woTotal(p), techOptionTotal(woOption(p)));
});

test("line kinds and the photo requirement follow the install vocabulary", () => {
  assert.equal(lineKind("Front Door Camera", "camera", true), "camera");
  assert.equal(lineKind("NVR (8-Channel)", "camera", false), "nvr");
  assert.equal(lineKind("Ceiling Speaker", "sound", false), "speaker");
  assert.equal(lineKind("Toast Terminal", "toast", false), "pos");
  assert.equal(lineKind("Cat6 Drop", "camera", false), "labor");
  assert.equal(lineKind("Rack & Mount", "sound", false), "equip");
  assert.equal(needsPhotos("camera", "Front Door Camera"), true);
  assert.equal(needsPhotos("nvr", "NVR"), true);
  assert.equal(needsPhotos("equip", "Monitor + Mount"), true, "displays need a photo too");
  assert.equal(needsPhotos("labor", "Termination"), false);
});

test("Reset to standard overrides manual payouts (unlike the seed, which protects them)", () => {
  const p = workOrderPayloadFrom(proposal(), { rates: RATES });
  const reset = reseedPayouts(p, RATES);
  const by = Object.fromEntries(woLines(reset).map((l) => [l.key, l.payout]));
  assert.equal(by.n1, 75, "the $95 override is replaced by the standard rate");
  assert.equal(by.c1a, 28, "unchanged lines stay put");
});

test("the fingerprint binds scope + payout, and ignores anything else", () => {
  const a = workOrderPayloadFrom(proposal(), { rates: RATES });
  const b = JSON.parse(JSON.stringify(a));
  assert.equal(workOrderFingerprint(a), workOrderFingerprint(b), "same content, same hash");
  b.options[0].name = "Renamed";
  b.options[0].services[0].note = "different note";
  assert.equal(workOrderFingerprint(a), workOrderFingerprint(b), "a note or an option name is not scope");
  b.options[0].services[0].items[2].techPrice = 96;
  assert.notEqual(workOrderFingerprint(a), workOrderFingerprint(b), "a payout change voids the signature");
  const c = JSON.parse(JSON.stringify(a));
  c.options[0].services[0].items[0].qty = 2;
  assert.notEqual(workOrderFingerprint(a), workOrderFingerprint(c), "a quantity change voids it too");
});

test("the revision state mirrors proposalChangeState's shape, in payout dollars", () => {
  const sentPayload = workOrderPayloadFrom(proposal(), { rates: RATES });
  const working = JSON.parse(JSON.stringify(sentPayload));
  assert.equal(workOrderChangeState({ version: 1, payload: sentPayload }, { payload: working }).hasUnsentChanges, false);

  working.options[0].services[0].items[2].techPrice = 120;                                  // +25
  working.options[0].services[0].items.push({ id: "x9", name: "Extra Drop", qty: 1, techPrice: 30 }); // +30
  working.options[0].services[0].items[0].sub.pop();                                        // −12 (Mounting)
  const st = workOrderChangeState({ version: 1, payload: sentPayload }, { payload: working });
  assert.equal(st.hasUnsentChanges, true);
  assert.equal(st.publishedVersion, 1);
  assert.equal(st.changeCount, 3, "one changed, one added, one removed");
  assert.equal(st.payoutDelta, 43);
  assert.equal(st.structuredChanges.added[0].name, "Extra Drop");
  assert.equal(st.structuredChanges.removed[0].name, "Mounting");
  assert.equal(st.structuredChanges.changed[0].key, "n1");
  // Marking a line complete is field state, not scope — it must never register as an unsent change.
  assert.ok(!/status/.test(JSON.stringify(workOrderDiff(sentPayload, sentPayload))));
});

test("a draft is validated at the boundary", () => {
  const ok = workOrderPayloadFrom(proposal(), { rates: RATES });
  assert.equal(validateWorkOrderPayload(ok), null);
  assert.match(validateWorkOrderPayload({ options: [] }), /exactly one option/);
  assert.match(validateWorkOrderPayload({ options: [ok.options[0], ok.options[0]] }), /exactly one option/);
  const dup = JSON.parse(JSON.stringify(ok)); dup.options[0].services[0].items[1].id = "c1";
  assert.match(validateWorkOrderPayload(dup), /Duplicate line id/);
  const neg = JSON.parse(JSON.stringify(ok)); neg.options[0].services[0].items[2].techPrice = -5;
  assert.match(validateWorkOrderPayload(neg), /Bad payout/);
  const deep = JSON.parse(JSON.stringify(ok));
  deep.options[0].services[0].items[0].sub[0].sub = [{ id: "q", name: "x", qty: 1, techPrice: 0 }];
  assert.match(validateWorkOrderPayload(deep), /one level only/);
});

test("ONE renderer: the work order uses ProposalItemsEditor in payout mode, not a fork", () => {
  assert.ok(woEditor.includes('import ProposalItemsEditor from "./proposal-items-editor"'), "same component");
  assert.ok(/<ProposalItemsEditor[\s\S]{0,200}?\n\s+payout\n/.test(woEditor), "mounted with the payout flag");
  // Payout mode swaps the column it edits and the total formula; it never computes a retail figure.
  assert.ok(editor.includes('const AMT = payout ? "techPrice" : "price";'), "the money column is the payout");
  assert.ok(editor.includes("const sumOf = payout ? techItemTotal : itemTotal;"));
  assert.ok(editor.includes("const strikeWaived = !payout;"), "payout mode does not comp a waived line");
  assert.ok(/const canWaiveItem = \(it\) => !payout &&/.test(editor), "waiving is a retail act — not offered on a work order");
  assert.ok(/const pickPatch = \(c\) => \(payout \? \{ name: c\.name \} :/.test(editor), "a retail catalog price never becomes a payout");
  // No discount / tax / payment-plan control can reach a work order: they live in the builder, and the
  // work order editor mounts the items editor alone.
  for (const forbidden of ["ProposalPricing", "ProposalPaymentPlan", "ProposalFinancialSummary", "taxRate", "deposit_pct"]) {
    assert.ok(!woEditor.includes(forbidden), `the work order never renders ${forbidden}`);
  }
});

test("requirement 8/9: the duplicate card is gone and nothing here writes the proposal", () => {
  // The two legacy payout editors are deleted, and the duplicate card no longer sits under the editor.
  assert.ok(!/<WorkOrderSheet/.test(gateway), "work-order-sheet.jsx is retired");
  const woAt = gateway.indexOf('case "workorder":');
  assert.ok(woAt > 0, "the workorder deck tool exists");
  const tool = gateway.slice(woAt, gateway.indexOf("\n          case ", woAt + 10));
  assert.ok(tool.includes("<WorkOrderEditor"), "the one work order surface");
  assert.ok(!tool.includes("<WorkOrderCard"), "no duplicate Create Work Order card under the editor");
  // Requirement 9 is structural: no work-order action may touch a proposal write path.
  for (const f of ["saveProposalDraft", "setProposalTechPricing", "reviseProposal", "signProposal", "markProposalSent"]) {
    assert.ok(!woActions.includes(f), `work-order-actions.js never calls ${f}`);
  }
});

test("every work-order action gates on a capability, never a role string", () => {
  assert.ok(woActions.includes('import { can } from "../../../lib/roles"'));
  const exported = [...woActions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.ok(exported.length >= 6, "the Stage 1 action surface");
  for (const name of exported) {
    const body = woActions.slice(woActions.indexOf(`export async function ${name}`));
    const head = body.slice(0, body.indexOf("\n}"));
    // Every action gates on a capability. Most are `wo.*`; deciding an unassigned check-in changes the
    // CREW, so it gates on `assignment.edit` — the same capability the assign control itself uses.
    assert.match(head, /await gate\(accessId, "(wo|payroll|assignment)\./, `${name} runs the gate`);
  }
  assert.ok(/if \(!can\(tok\.role, cap\)\) return/.test(woActions), "the gate ends in a capability check");
  assert.ok(!/tok\.role === "admin"/.test(woActions), "no hand-rolled role comparison");
});

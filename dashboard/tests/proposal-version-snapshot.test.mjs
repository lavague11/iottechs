// Sent-version snapshots (node --test): signed → frozen payload, unsigned → stored payload, compare via
// proposalDiff, no cost/payout in the view model, PDF filename from documentFilename, addendum snapshot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVersionSnapshot, buildAddendumSnapshot, snapshotRow } from "../lib/proposal-version-snapshot.js";
import { buildFillableProposalBytes } from "../lib/proposal-acroform.js";
import { projectFileBase } from "../lib/doc-filename.js";

const item = (id, name, qty, price, extra = {}) => ({ id, name, qty, price, cost: 11, techPrice: 7, techPay: 5, ...extra });
const payload = (items, extra = {}) => ({ options: [{ id: "o1", name: "Standard", services: [{ key: "camera", name: "Camera", label: "Camera", items }] }], discount: { type: "flat", value: 0 }, pcp_credit: { type: "flat", value: 0 }, payment_plan: "50_50", ...extra });
const row = (o = {}) => ({ id: 1, version: 1, status: "sent", sent_at: "2026-01-02 10:00:00", sent_by_name: "Ann", tax_rate: 8, deposit_pct: 50, selected_option: null, ...o });

const sentItems = [item("a", "Dome Camera", 2, 100), item("b", "NVR", 1, 400)];

test("signed version reads signed_payload; unsigned sent version reads payload", () => {
  const signed = row({ payload: JSON.stringify(payload([item("a", "Dome Camera", 9, 999)])), signed_payload: JSON.stringify(payload(sentItems)), signed_at: "2026-01-03", signed_name: "Zed" });
  const s = buildVersionSnapshot(signed, "admin");
  assert.equal(s.frozen, true);
  assert.equal(s.options[0].services[0].items.length, 2);       // the frozen two-line payload, not the one-line drifted payload
  assert.equal(s.options[0].services[0].items[0].qty, 2);
  assert.equal(s.signature.name, "Zed");
  const unsigned = buildVersionSnapshot(row({ payload: JSON.stringify(payload(sentItems)), signed_payload: JSON.stringify(payload([item("z", "Other", 1, 1)])) }), "admin");
  assert.equal(unsigned.frozen, false);                           // no signed_at → signed_payload is ignored
  assert.equal(unsigned.options[0].services[0].items[0].name, "Dome Camera");
  assert.equal(snapshotRow(row({ payload: "p", signed_payload: "s", signed_at: "x" })).payload, "s");
});

test("money comes from optionTotals (tax, discount, plan)", () => {
  const p = payload(sentItems, { discount: { type: "flat", value: 100 } });
  const s = buildVersionSnapshot(row({ payload: JSON.stringify(p) }), "admin");
  const t = s.options[0].totals;
  assert.equal(t.sub, 600); assert.equal(t.discount, 100); assert.equal(t.tax, 40); assert.equal(t.grand, 540);
  assert.equal(s.options[0].plan.length, 2);
  assert.equal(s.options[0].plan[0].amount, 270);
});

test("compare surfaces added, removed and changed lines against the current draft", () => {
  const old = row({ payload: JSON.stringify(payload(sentItems)) });
  const cur = row({ id: 2, version: 2, status: "draft", sent_at: null, payload: JSON.stringify(payload([item("a", "Dome Camera", 3, 100), item("c", "Router", 1, 50)])) });
  const s = buildVersionSnapshot(old, "admin", cur);
  const lines = s.options[0].services[0].items;
  assert.equal(lines.find((l) => l.id === "a").mark, "changed");
  assert.deepEqual(lines.find((l) => l.id === "a").now.qty, 3);
  assert.equal(lines.find((l) => l.id === "b").mark, "removed");
  assert.deepEqual(s.options[0].addedSince.map((x) => x.name), ["Router"]);
  assert.equal(s.compare.currentVersion, 2);
});

test("no compare when the current draft matches or is the same row", () => {
  const old = row({ payload: JSON.stringify(payload(sentItems)) });
  assert.equal(buildVersionSnapshot(old, "admin", { ...old, id: 2, version: 2 }).compare, null);
  assert.equal(buildVersionSnapshot(old, "admin", old).compare, null);
  assert.equal(buildVersionSnapshot(old, "admin", null).compare, null);
});

test("the view model never carries cost / margin / payout, for any staff role", () => {
  const r = row({ payload: JSON.stringify(payload([item("a", "Dome Camera", 1, 100, { sub: [item("s", "Labor", 1, 50)] })])) });
  for (const role of ["admin", "manager", "sales"]) {
    const s = buildVersionSnapshot(r, role);
    const { pdf, ...view } = s;
    const wire = JSON.stringify(view);
    assert.ok(!/cost|techPrice|techPay|margin|payout/i.test(wire), role);
  }
  const sales = buildVersionSnapshot(r, "sales");
  assert.ok(!/"cost"|techPay|techPrice/.test(JSON.stringify(sales.pdf.payload)), "sales PDF row is cost-stripped");
});

test("non-staff roles and unsent rows get nothing", () => {
  const r = row({ payload: JSON.stringify(payload(sentItems)) });
  for (const role of ["customer", "tech", "vendor", "readonly", undefined]) assert.equal(buildVersionSnapshot(r, role), null, String(role));
  assert.equal(buildVersionSnapshot({ ...r, sent_at: null }, "admin"), null);
});

test("the snapshot PDF is named by documentFilename with the version's own revision", async () => {
  const project = { access_id: "ASC0046", property_type: "commercial", company_name: "Buck N Up Store", contact_name: "Zain Farooq", customer: "Buck N Up Store", service_code: "AU" };
  const s = buildVersionSnapshot(row({ version: 3, payload: JSON.stringify(payload(sentItems)) }), "admin");
  const { fileName } = await buildFillableProposalBytes(s.pdf, { customerName: "Zain Farooq", fileBase: projectFileBase(project), projectId: "ASC0046" });
  assert.equal(fileName, "Buck N Up Store - Sound System - 0046 - v3.pdf");
});

test("addendum snapshot: retail only for retail roles, never tech payout, needs-pricing hidden", () => {
  const a = { id: "x1", title: "3 cams", status: "approved", discount: 20, items: [{ name: "Dome", qty: 3, price: 100, techPay: 40 }], signedName: "Zed", signedAt: "2026-02-01", at: "2026-01-30" };
  assert.deepEqual(addendumTotals(a), { sub: 300, discount: 20, total: 280 });
  const s = buildAddendumSnapshot(a, "admin");
  assert.equal(s.totals.total, 280); assert.equal(s.signature.name, "Zed");
  assert.ok(!/techPay|payout/i.test(JSON.stringify(s)));
  assert.equal(buildAddendumSnapshot({ ...a, needsPricing: true }, "admin"), null);
  assert.equal(buildAddendumSnapshot(a, "tech"), null);
});

// ---- round 2 ----------------------------------------------------------------------------------
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { addendumFingerprint, addendumTotals } from "../lib/proposal.js";

const approvedAdd = (extra = {}) => ({ id: "x1", title: "T", status: "approved", signedName: "Zed", signedAt: "2026-02-01", signatureData: "data:image/png;base64,AA", items: [{ name: "Dome", qty: 2, price: 100 }], discount: 0, ...extra });

test("an add-on edited after signing never shows the signature; an untouched one does", () => {
  const items = [{ name: "Dome", qty: 2, price: 100 }];
  const signedFingerprint = addendumFingerprint({ title: "T", discount: 0, items });
  const ok = buildAddendumSnapshot(approvedAdd({ signedFingerprint }), "admin");
  assert.equal(ok.signature.name, "Zed"); assert.equal(ok.edited, false);
  const edited = buildAddendumSnapshot(approvedAdd({ signedFingerprint, items: [{ name: "Dome", qty: 5, price: 100 }] }), "admin");
  assert.equal(edited.signature, null); assert.equal(edited.edited, true);
  assert.equal(edited.totals.total, 500);   // the new figures are shown, but unsigned and flagged
  const legacy = buildAddendumSnapshot(approvedAdd({}), "admin");   // null fingerprint = legacy → still current
  assert.equal(legacy.signature.name, "Zed"); assert.equal(legacy.edited, false);
  assert.equal(buildAddendumSnapshot({ ...approvedAdd({ signedFingerprint }), status: "pending" }, "admin").edited, false);
});

test("signed row with a null signed_payload is flagged notFrozen; signed_at without signature data still renders", () => {
  const r = row({ payload: JSON.stringify(payload(sentItems)), signed_at: "2026-01-03", signed_name: "Zed", signature_data: null, signed_payload: null, signed_fingerprint: null });
  const s = buildVersionSnapshot(r, "admin");
  assert.equal(s.frozen, false); assert.equal(s.notFrozen, true);
  assert.equal(s.signature.name, "Zed"); assert.equal(s.signature.data, null);
  const frozen = buildVersionSnapshot({ ...r, signed_payload: JSON.stringify(payload(sentItems)) }, "admin");
  assert.equal(frozen.notFrozen, false);
});

test("a superseded sent row still renders", () => {
  const s = buildVersionSnapshot(row({ status: "superseded", payload: JSON.stringify(payload(sentItems)) }), "manager");
  assert.equal(s.status, "superseded"); assert.equal(s.options[0].services[0].items.length, 2);
});

test("sales: signedPayload on the PDF row is cost-stripped too", () => {
  const withCost = payload([item("a", "Dome Camera", 1, 100)]);
  const r = row({ payload: JSON.stringify(withCost), signed_payload: JSON.stringify(withCost), signed_at: "2026-01-03", signed_name: "Zed" });
  const s = buildVersionSnapshot(r, "sales");
  assert.ok(!/"cost"|techPay|techPrice/.test(JSON.stringify(s.pdf.signedPayload)));
  assert.ok(!/"cost"|techPay|techPrice/.test(JSON.stringify(s.pdf.payload)));
});

test("every version/addendum action is gated server-side on STAFF_EDIT", () => {
  const src = readFileSync(new URL("../app/project/[accessId]/proposal-actions.js", import.meta.url), "utf8");
  for (const name of ["getProposalHistoryAction", "getProposalVersionAction", "getAddendumSnapshotAction"]) {
    const i = src.indexOf(`export async function ${name}`);
    assert.ok(i > 0, name);
    const body = src.slice(i, src.indexOf("\n}\n", i));
    assert.ok(/!tok \|\| !STAFF_EDIT\.has\(tok\.role\)/.test(body), `${name} must reject non-staff`);
    assert.ok(body.indexOf("STAFF_EDIT") < body.search(/getProposalHistory\(|getProposalVersionRow\(|addendumEntries\(/), `${name} gates before reading`);
  }
  assert.ok(!/addendumEntries[^\n]*\n[^\n]*tok\.role === "customer"/.test(src));
});

test("addendumTotals parity: shared helper === getApprovedAddons === getPendingAddons", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "iot-adn-"));
  process.env.DB_DIR = dir;
  try {
    const db = await import("../lib/db.js");
    const cases = {
      negDiscount: { items: [{ qty: 2, price: 100 }], discount: -50 },
      bigDiscount: { items: [{ qty: 1, price: 100 }], discount: 500 },
      negPrice: { items: [{ qty: 2, price: -30 }, { qty: 1, price: 100 }], discount: 0 },
      nonNumeric: { items: [{ qty: "abc", price: "x" }, { qty: "2", price: "10" }], discount: "z" },
      missingQty: { items: [{ price: 40 }, { qty: 1, price: 10 }], discount: 0 },
      round: { items: [{ qty: 3, price: 0.335 }], discount: 0 },
    };
    let n = 0;
    for (const [k, c] of Object.entries(cases)) {
      const id = `PARITY${n++}${Date.now()}`;
      const a = { id: "a1", title: k, status: "approved", signedName: "Z", ...c };
      db.saveToolData(id, "addendum", JSON.stringify({ addendums: [a, { ...a, id: "a2", status: "pending" }] }), "test");
      const approved = db.getApprovedAddons(id).list[0].total;
      const pending = db.getPendingAddons(id).list?.[0]?.total ?? db.getPendingAddons(id).items?.[0]?.total;
      const shared = addendumTotals(a).total;
      assert.equal(approved, shared, `${k}: approved`);
      if (pending !== undefined) assert.equal(pending, shared, `${k}: pending`);
    }
    assert.equal(addendumTotals(cases.round).total, 1.01);
    assert.equal(addendumTotals(cases.bigDiscount).total, 0);
    assert.equal(addendumTotals(cases.negDiscount).total, 250);
    assert.equal(addendumTotals(cases.missingQty).total, 10);
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* sqlite handle may hold it on win32 */ } }
});

test("the add-on card and the snapshot take their totals from addendumTotals (no local formula)", () => {
  const card = readFileSync(new URL("../app/project/[accessId]/install-addendum.jsx", import.meta.url), "utf8");
  assert.ok(card.includes("addendumTotals") && !/itemsSum/.test(card));
});

test("compare: same-named lines are marked by id — only the changed / deleted one", () => {
  const dup = (qty1, qty2, keep2 = true) => row({ payload: JSON.stringify(payload([item("d1", "Cat6 Drop", qty1, 150), ...(keep2 ? [item("d2", "Cat6 Drop", qty2, 150)] : [])])) });
  const old = dup(2, 1);
  const show = (cur) => buildVersionSnapshot(old, "admin", { ...cur, id: 2, version: 2 }).options[0].services[0].items.map((l) => [l.id, l.qty, l.mark, l.now?.qty]);
  assert.deepEqual(show(dup(9, 1)), [["d1", 2, "changed", 9], ["d2", 1, undefined, undefined]]);
  assert.deepEqual(show(dup(2, 7)), [["d1", 2, undefined, undefined], ["d2", 1, "changed", 7]]);
  assert.deepEqual(show(dup(9, 5)), [["d1", 2, "changed", 9], ["d2", 1, "changed", 5]]);   // two changed duplicates keep their own "now"
  assert.deepEqual(show({ ...dup(2, 1), payload: JSON.stringify(payload([item("d2", "Cat6 Drop", 1, 150)])) }), [["d1", 2, "removed", undefined], ["d2", 1, undefined, undefined]]);
});

test("compare: legacy id-less duplicates still fall back to service+name without crashing", () => {
  const noId = (q) => row({ payload: JSON.stringify(payload([{ name: "Drop", qty: q, price: 10 }])) });
  const s = buildVersionSnapshot(noId(1), "admin", { ...noId(4), id: 2, version: 2 });
  assert.equal(s.options[0].services[0].items[0].mark, "changed");
  assert.equal(s.options[0].services[0].items[0].now.qty, 4);
});

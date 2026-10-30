// Phase 2 — NVR Setup: one canonical LABOR line per NVR, after the drives, tied to the EXISTING tech rate.
// Contract: /dev/docs/pricing-fulfillment-architecture. Additive + snapshot-preserving; never duplicates.
import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogItemByName, itemTypeOf, nvrSetupLine, ensureNvrSetup, cameraBaselineItems,
  seedTechPricingMap, defaultTechPayout,
} from "../lib/proposal.js";

const RATES = { nvr_setup: 10, cam_drop: 10, cam_mgmt: 18, cam_term: 12, cam_mount: 10, cam_program: 8, hdd_install: 10 };

test("NVR Setup is a canonical LABOR catalog item ($100) with an explicit id", () => {
  const c = catalogItemByName("NVR Setup", "camera");
  assert.ok(c, "NVR Setup is in the camera catalog");
  assert.equal(c.id, "camera:nvr_setup");
  assert.equal(c.type, "labor");
  assert.equal(c.price, 100);
});

test("nvrSetupLine builds a stamped labor line marked nvrSetup", () => {
  const ln = nvrSetupLine({});
  assert.equal(ln.nvrSetup, true);
  assert.equal(ln.baseName, "NVR Setup");
  assert.equal(ln.catalogItemId, "camera:nvr_setup");
  assert.equal(ln.itemType, "labor");
  assert.equal(itemTypeOf(ln, "camera"), "labor");
});

test("cameraBaselineItems includes exactly one NVR Setup, after the drive", () => {
  const items = cameraBaselineItems({});
  const setups = items.filter((x) => x.nvrSetup);
  assert.equal(setups.length, 1);
  const idxDrive = items.findIndex((x) => x.slot != null);
  const idxSetup = items.findIndex((x) => x.nvrSetup);
  assert.ok(idxSetup > idxDrive, "NVR Setup comes after the drive");
});

test("ensureNvrSetup: adds one per NVR after the drives, idempotent, never duplicates", () => {
  const base = [
    { id: "n1", name: "NVR (16-Channel)", price: 300 },
    { id: "d1", name: "8TB Storage Drive", price: 360, slot: 1 },
    { id: "d2", name: "6TB Storage Drive", price: 270, slot: 2 },
  ];
  const once = ensureNvrSetup(base, {});
  assert.equal(once.filter((x) => x.nvrSetup).length, 1);
  // placed after the last drive
  const idxLastDrive = once.map((x) => x.slot != null).lastIndexOf(true);
  const idxSetup = once.findIndex((x) => x.nvrSetup);
  assert.ok(idxSetup > idxLastDrive);
  // idempotent — running again changes nothing (same ref)
  assert.equal(ensureNvrSetup(once, {}), once);
  assert.equal(ensureNvrSetup(once, {}).filter((x) => x.nvrSetup).length, 1);
});

test("ensureNvrSetup: no NVR → no setup; removing the NVR drops the setup", () => {
  const noNvr = [{ id: "b1", name: "Camera Install Complete", price: 0, sub: [{ id: "s", name: "Camera", price: 70 }] }];
  assert.equal(ensureNvrSetup(noNvr, {}), noNvr);                       // nothing added
  assert.equal(ensureNvrSetup(noNvr, {}).some((x) => x.nvrSetup), false);
  const hadSetupNoNvr = [{ id: "x", name: "NVR Setup", nvrSetup: true, price: 100 }, { id: "c", name: "Camera", price: 70 }];
  const dropped = ensureNvrSetup(hadSetupNoNvr, {});
  assert.equal(dropped.some((x) => x.nvrSetup), false);                 // NVR gone → setup removed
});

test("ensureNvrSetup: collapses multiple NVR Setup lines to exactly one", () => {
  const dupes = [
    { id: "n", name: "NVR (8-Channel)", price: 150 },
    { id: "s1", name: "NVR Setup", nvrSetup: true, price: 100 },
    { id: "s2", name: "NVR Setup", nvrSetup: true, price: 100 },
  ];
  const fixed = ensureNvrSetup(dupes, {});
  assert.equal(fixed.filter((x) => x.nvrSetup).length, 1);
});

test("tech seed: the NVR Setup line carries the payout; the NVR HARDWARE line does not (no double)", () => {
  const payload = { options: [{ id: "A", services: [{ key: "camera", label: "Security Cameras", items: [
    { id: "nvr", name: "NVR (16-Channel)", price: 300, itemType: "equipment" },
    { id: "drv", name: "8TB Storage Drive", price: 360, slot: 1 },
    { id: "set", name: "NVR Setup", price: 100, nvrSetup: true, itemType: "labor" },
  ] }] }] };
  const map = seedTechPricingMap(payload, RATES);
  assert.equal(map.set, 10);          // NVR Setup → $10
  assert.equal(map.nvr, undefined);   // NVR hardware → not seeded (setup line carries it)
});

test("tech seed: a LEGACY service without an NVR Setup line is unaffected (NVR still seeds the rate)", () => {
  const legacy = { options: [{ id: "A", services: [{ key: "camera", label: "Security Cameras", items: [
    { id: "nvr", name: "NVR (16-Channel)", price: 300 },
  ] }] }] };
  const map = seedTechPricingMap(legacy, RATES);
  assert.equal(map.nvr, 10);          // unchanged legacy behavior
  assert.equal(defaultTechPayout("NVR Setup", "camera", RATES), 10);
});

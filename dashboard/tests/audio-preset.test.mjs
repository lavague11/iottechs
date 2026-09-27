// Commercial Audio rate sheet (node --test): the Ceiling Speaker preset block and the amplifier head end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROPOSAL_CATALOG, DEFAULT_PRESETS, presetsForService, makePresetBlock, itemTotal, priceOf } from "../lib/proposal.js";

const book = { prices: {}, names: {}, hidden: {}, custom: {}, presets: [] };
const price = (n) => PROPOSAL_CATALOG.sound.find((c) => c.name === n)?.price;

test("audio catalog carries the owner's rates", () => {
  assert.equal(price("Ceiling Speaker"), 75);
  assert.equal(price("Speaker Wire Run"), 150);
  assert.equal(price("Drill Mount Tune"), 75);
  assert.equal(price("Amplifier (4-Zone)"), 350);
  assert.equal(price("Rack & Mount"), 150);
  assert.equal(priceOf("Amplifier (4-Zone)", book), 350);
});

test("Ceiling Speaker preset = speaker + wire run + drill/mount/tune, $300 per block, no amplifier inside", () => {
  const preset = presetsForService("sound", book).find((p) => p.id === "ceiling-speaker");
  assert.ok(preset, "seeded for the sound service");
  assert.equal(preset.name, "Ceiling Speaker");
  const block = makePresetBlock(preset, book);
  assert.deepEqual(block.sub.map((x) => [x.name, x.qty, x.price]), [["Ceiling Speaker", 1, 75], ["Speaker Wire Run", 1, 150], ["Drill Mount Tune", 1, 75]]);
  assert.equal(itemTotal(block), 300);
  assert.ok(!block.sub.some((x) => /Amplifier/.test(x.name)));
  assert.ok(DEFAULT_PRESETS.some((p) => p.id === "full-camera"), "camera preset untouched");
});

// The proposal appendix (survey/mockup pages) is shrunk to a capped JPEG before it enters the PDF, so a
// multi-floor proposal stays a light, fast-loading document instead of a many-MB PNG pile. The compaction
// is browser-only (Image + canvas); in node (no DOM) it is a safe passthrough, which is what we assert
// here, plus that both appendix builders actually call it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compactDataUrl, compactAppendix } from "../lib/image-compact.js";

test("compactDataUrl is a safe no-op without a DOM / for non-images", async () => {
  const png = "data:image/png;base64,AAAA";
  assert.equal(await compactDataUrl(png), png, "no document → returns the source unchanged");
  assert.equal(await compactDataUrl("not-an-image"), "not-an-image", "non-data-url passes through");
  assert.equal(await compactDataUrl(null), null, "null passes through");
});

test("compactAppendix preserves shape + order when it can't compact (node passthrough)", async () => {
  const input = {
    surveyImages: [{ name: "Floor 1", img: "data:image/png;base64,AAA", counts: { canonical: 2, rendered: 2 } }],
    mockupImages: ["data:image/png;base64,BBB", "data:image/png;base64,CCC"],
  };
  const out = await compactAppendix(input);
  assert.equal(out.surveyImages.length, 1);
  assert.equal(out.surveyImages[0].name, "Floor 1", "survey name kept");
  assert.deepEqual(out.surveyImages[0].counts, { canonical: 2, rendered: 2 }, "survey metadata kept");
  assert.deepEqual(out.mockupImages, input.mockupImages, "mockup list + order kept");
});

test("both appendix builders compact the appendix before embedding it", () => {
  const cust = readFileSync(new URL("../app/project/[accessId]/proposal-customer-view.jsx", import.meta.url), "utf8");
  assert.ok(/import \{ compactAppendix \}/.test(cust) && /await compactAppendix\(\{ surveyImages, mockupImages \}\)/.test(cust), "customer download/signer compacts");
  const staff = readFileSync(new URL("../app/project/[accessId]/proposal-builder.jsx", import.meta.url), "utf8");
  assert.ok(/import \{ compactAppendix \}/.test(staff) && /await compactAppendix\(\{ surveyImages, mockupImages \}\)/.test(staff), "staff download compacts");
});

test("the PDF embeds the plan with its real format (compacted plans arrive as JPEG)", () => {
  const chrome = readFileSync(new URL("../lib/pdf-chrome.js", import.meta.url), "utf8");
  assert.ok(/const ifmt = \/\^data:image\\\/jpe\?g\/i\.test\(f\.img\) \? "JPEG" : "PNG"/.test(chrome), "surveySheetBody picks JPEG/PNG by the data URL");
  const pdf = readFileSync(new URL("../lib/proposal-pdf.js", import.meta.url), "utf8");
  assert.ok(/const mfmt = \/\^data:image\\\/png\/i\.test\(src\) \? "PNG" : "JPEG"/.test(pdf), "the mockup addImage picks the format by the data URL");
});

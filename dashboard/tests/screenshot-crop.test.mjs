// Bug-reporter screenshot editor — Crop (BUG #99). Geometry is pure (app/components/screenshot-crop.js);
// the wiring (undo carries the base image, Attach never skips a crop-only change) is asserted on source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clampBox, initialBox, roundBox, isFullBox, hitHandle, dragBox,
  cropShapes, translateShape, shapeBounds, fitSize, pagesToAttach, drawCropOverlay,
  newHistory, pushStep, stepBack, stepFwd, persistPage, toolForKey,
} from "../app/components/screenshot-crop.js";

const rect = (x, y, w, h) => ({ type: "rect", x, y, w, h, color: "#f00", lw: 3 });

test("clampBox keeps the box inside the image, normalises negatives, enforces a minimum", () => {
  assert.deepEqual(clampBox({ x: -50, y: -50, w: 2000, h: 2000 }, 800, 600), { x: 0, y: 0, w: 800, h: 600 });
  assert.deepEqual(clampBox({ x: 300, y: 200, w: -100, h: -80 }, 800, 600), { x: 200, y: 120, w: 100, h: 80 });
  const tiny = clampBox({ x: 10, y: 10, w: 2, h: 2 }, 800, 600);
  assert.ok(tiny.w >= 24 && tiny.h >= 24);
  const edge = clampBox({ x: 790, y: 590, w: 100, h: 100 }, 800, 600);
  assert.ok(edge.x + edge.w <= 800 && edge.y + edge.h <= 600);
});

test("initialBox is inset inside the image and is not the whole image", () => {
  const b = initialBox(1000, 500);
  assert.ok(b.x > 0 && b.y > 0 && b.x + b.w < 1000 && b.y + b.h < 500);
  assert.equal(isFullBox(b, 1000, 500), false);
  assert.equal(isFullBox({ x: 0, y: 0, w: 1000, h: 500 }, 1000, 500), true);
});

test("roundBox lands on whole pixels inside the image", () => {
  assert.deepEqual(roundBox({ x: 10.4, y: 20.6, w: 99.5, h: 50.2 }, 500, 500), { x: 10, y: 21, w: 100, h: 50 });
  const r = roundBox({ x: 490.2, y: 0, w: 200, h: 10 }, 500, 500);
  assert.ok(r.x + r.w <= 500);
});

test("cropShapes translates by the box origin and drops shapes fully outside", () => {
  const box = { x: 100, y: 50, w: 200, h: 200 };
  const inside = rect(150, 100, 40, 30);
  const outside = rect(500, 500, 40, 30);
  const straddle = rect(80, 40, 60, 60);           // overlaps the box corner -> kept
  const out = cropShapes([inside, outside, straddle], box);
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].x, out[0].y, out[0].w, out[0].h], [50, 50, 40, 30]);
  assert.deepEqual([out[1].x, out[1].y], [-20, -10]);
});

test("translateShape moves every shape type and leaves the original untouched", () => {
  const arrow = { type: "arrow", from: { x: 10, y: 10 }, to: { x: 30, y: 40 } };
  const pen = { type: "pen", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };
  const text = { type: "text", x: 5, y: 6, text: "hi", size: 20 };
  assert.deepEqual(translateShape(arrow, -10, -10).to, { x: 20, y: 30 });
  assert.deepEqual(translateShape(pen, 10, 10).points, [{ x: 11, y: 12 }, { x: 13, y: 14 }]);
  const t = translateShape(text, 1, 1);
  assert.deepEqual([t.x, t.y], [6, 7]);
  assert.deepEqual(arrow.to, { x: 30, y: 40 });
});

test("pen and text outside the box are dropped, ones inside are kept", () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  const penOut = { type: "pen", points: [{ x: 300, y: 300 }, { x: 320, y: 310 }] };
  const penIn = { type: "pen", points: [{ x: 10, y: 10 }, { x: 20, y: 30 }] };
  const textOut = { type: "text", x: 400, y: 400, text: "x", size: 20 };
  const textIn = { type: "text", x: 10, y: 10, text: "x", size: 20 };
  assert.equal(cropShapes([penOut, penIn, textOut, textIn], box).length, 2);
  assert.ok(shapeBounds(textIn).x1 > textIn.x);
});

test("hitHandle: corners, edges, body, and outside", () => {
  const box = { x: 100, y: 100, w: 200, h: 100 };
  assert.equal(hitHandle(box, { x: 100, y: 100 }, 10), "nw");
  assert.equal(hitHandle(box, { x: 300, y: 200 }, 10), "se");
  assert.equal(hitHandle(box, { x: 200, y: 101 }, 10), "n");
  assert.equal(hitHandle(box, { x: 299, y: 150 }, 10), "e");
  assert.equal(hitHandle(box, { x: 200, y: 150 }, 10), "move");
  assert.equal(hitHandle(box, { x: 10, y: 10 }, 10), null);
});

test("dragBox: resize from a corner, move clamps to the image, new draws corner to corner", () => {
  const box = { x: 100, y: 100, w: 200, h: 100 };
  const grown = dragBox("se", box, { x: 300, y: 200 }, { x: 350, y: 260 }, 800, 600);
  assert.deepEqual(grown, { x: 100, y: 100, w: 250, h: 160 });
  const nw = dragBox("nw", box, { x: 100, y: 100 }, { x: 60, y: 70 }, 800, 600);
  assert.deepEqual(nw, { x: 60, y: 70, w: 240, h: 130 });
  const moved = dragBox("move", box, { x: 150, y: 150 }, { x: 5000, y: -5000 }, 800, 600);
  assert.deepEqual(moved, { x: 600, y: 0, w: 200, h: 100 });
  // an edge cannot be dragged past the opposite one
  const squashed = dragBox("e", box, { x: 300, y: 150 }, { x: -900, y: 150 }, 800, 600);
  assert.ok(squashed.w >= 24 && squashed.x === 100);
  const fresh = dragBox("new", null, { x: 40, y: 40 }, { x: 10, y: 200 }, 800, 600);
  assert.deepEqual(fresh, { x: 10, y: 40, w: 30, h: 160 });
});

test("fitSize fills the stage, keeps aspect, and upscales a small crop", () => {
  assert.deepEqual(fitSize(400, 200, 800, 800), { w: 800, h: 400, scale: 2 });
  const tall = fitSize(300, 3000, 900, 600);                 // the unusable tiny full-page shot
  assert.equal(tall.h, 600);
  assert.equal(tall.w, 60);
  assert.equal(fitSize(0, 10, 100, 100), null);
});

test("Attach: a crop-only change (no shape edits, empty dirty set) is still uploaded", () => {
  const orig = ["data:A", "data:B"];
  const pages = [{ key: "s1", base: "data:A" }, { key: "s2", base: "data:B-CROPPED" }];
  assert.deepEqual(pagesToAttach(pages, orig, new Set()), [1]);
  // untouched existing pages are skipped, new pages and annotated pages are not
  assert.deepEqual(pagesToAttach([{ key: "s1", base: "data:A" }], ["data:A"], new Set()), []);
  assert.deepEqual(pagesToAttach([{ key: null, base: "x" }], ["x"], new Set()), [0]);
  assert.deepEqual(pagesToAttach([{ key: "s1", base: "data:A" }], ["data:A"], new Set([0])), [0]);
});

test("overlay dims the four outside bands and draws 8 handles", () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, n) => (...a) => { calls.push([n, ...a]); }, set: () => true });
  drawCropOverlay(ctx, { x: 10, y: 20, w: 100, h: 50 }, 400, 300, 1);
  const fills = calls.filter((c) => c[0] === "fillRect");
  assert.equal(fills.length, 4 + 8);
  assert.deepEqual(fills[0].slice(1), [0, 0, 400, 20]);       // top band
});

test("dragBox new: dragging past the image edge CLIPS, the anchor never jumps", () => {
  const b = dragBox("new", null, { x: 900, y: 100 }, { x: 1300, y: 300 }, 1200, 800);
  assert.deepEqual(b, { x: 900, y: 100, w: 300, h: 200 });
  const neg = dragBox("new", null, { x: 100, y: 100 }, { x: -500, y: -500 }, 1200, 800);
  assert.deepEqual(neg, { x: 0, y: 0, w: 100, h: 100 });
});

test("dragBox with the pointer far outside the image stays inside it for every mode", () => {
  const box = { x: 100, y: 100, w: 200, h: 100 };
  for (const mode of ["nw", "n", "ne", "e", "se", "s", "sw", "w", "move"]) {
    for (const p of [{ x: -9999, y: -9999 }, { x: 9999, y: 9999 }, { x: -9999, y: 9999 }]) {
      const r = dragBox(mode, box, { x: 150, y: 150 }, p, 800, 600);
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 800 && r.y + r.h <= 600 && r.w >= 24 && r.h >= 24, `${mode} ${JSON.stringify(p)} -> ${JSON.stringify(r)}`);
    }
  }
});

test("clampBox grows a tiny box from its anchor, even at the far edge", () => {
  assert.deepEqual(clampBox({ x: 795, y: 595, w: 4, h: 4 }, 800, 600), { x: 776, y: 576, w: 24, h: 24 });
});

test("hitHandle: a box smaller than twice the tolerance resolves to a corner, never 'move' by accident", () => {
  const tiny = { x: 100, y: 100, w: 16, h: 16 };
  assert.equal(hitHandle(tiny, { x: 101, y: 101 }, 14), "nw");     // corners win over edges and body
  assert.equal(hitHandle(tiny, { x: 115, y: 115 }, 14), "se");
  assert.equal(hitHandle(tiny, { x: 300, y: 300 }, 14), null);
});

test("cropShapes: text whose estimated extent sits just outside is dropped, just inside is kept", () => {
  const box = { x: 100, y: 100, w: 100, h: 100 };
  const outside = { type: "text", x: 205, y: 120, text: "hello", size: 20 };       // starts right of the box
  const justIn = { type: "text", x: 195, y: 120, text: "hello", size: 20 };        // first glyphs overlap
  const above = { type: "text", x: 120, y: 100 - 20 * 1.22 - 1, text: "hi", size: 20 };   // ends above the box
  const out = cropShapes([outside, justIn, above], box);
  assert.equal(out.length, 1);
  assert.equal(out[0].x, 95);
});

test("shapeBounds normalises a negative-width/height rect", () => {
  assert.deepEqual(shapeBounds(rect(100, 80, -40, -30)), { x0: 60, y0: 50, x1: 100, y1: 80 });
  assert.equal(cropShapes([rect(150, 150, -30, -30)], { x: 100, y: 100, w: 100, h: 100 }).length, 1);
});

test("fitSize: a crop smaller than the stage is scaled UP; a second crop fits again", () => {
  const first = fitSize(400, 300, 1200, 800);
  assert.deepEqual([first.w, first.h], [1066, 800]);
  const second = fitSize(100, 100, 1200, 800);                  // crop of the crop
  assert.deepEqual([second.w, second.h], [800, 800]);
});

test("history: crop -> undo -> redo swaps the BASE image back and forth with the shapes", () => {
  let H = newHistory([rect(0, 0, 10, 10)], "full.png");
  H = pushStep(H, [rect(0, 0, 10, 10)], undefined);                // an annotation step keeps the base
  assert.equal(H.bases[H.i], "full.png");
  H = pushStep(H, [rect(-50, -50, 10, 10)], "cropped.png");       // the crop
  assert.equal(H.bases[H.i], "cropped.png");
  H = stepBack(H);
  assert.equal(H.bases[H.i], "full.png");
  assert.equal(H.stack[H.i][0].x, 0);
  H = stepFwd(H);
  assert.equal(H.bases[H.i], "cropped.png");
  assert.equal(H.stack[H.i][0].x, -50);
  H = stepBack(H); H = pushStep(H, [], undefined);                // new step after undo drops the redo branch
  assert.equal(H.stack.length, H.bases.length);
  assert.equal(H.bases[H.i], "full.png");
  assert.equal(stepFwd(H), H);
});

test("page flip / Attach: a crop-only change is written back to its page and then uploaded", () => {
  const pages = [{ key: "s1", base: "full.png", shapes: [] }];
  const orig = ["full.png"];
  let H = newHistory([], "full.png");
  H = pushStep(H, [], "cropped.png");                              // crop, no annotation
  persistPage(pages, 0, H);
  assert.equal(pages[0].base, "cropped.png");
  assert.deepEqual(pagesToAttach(pages, orig, new Set()), [0]);    // empty dirty set: still uploaded
  persistPage(pages, 0, stepBack(H));                              // undone back to the original: nothing to upload
  assert.deepEqual(pagesToAttach(pages, orig, new Set()), []);
});

test("Attach with an unapplied crop box uses the pending crop", () => {
  const pages = [{ key: "s1", base: "full.png", shapes: [] }];
  persistPage(pages, 0, newHistory([], "full.png"), { base: "pending-crop.png", shapes: [rect(1, 1, 5, 5)] });
  assert.equal(pages[0].base, "pending-crop.png");
  assert.equal(pages[0].shapes.length, 1);
  assert.deepEqual(pagesToAttach(pages, ["full.png"], new Set()), [0]);
});

test("letter shortcuts select tools; Ctrl/Cmd/Alt combos never do", () => {
  assert.equal(toolForKey({ key: "c" }), "crop");
  assert.equal(toolForKey({ key: "C" }), "crop");
  assert.equal(toolForKey({ key: "r" }), "rect");
  assert.equal(toolForKey({ key: "t" }), "text");
  for (const k of ["c", "r", "a", "p", "t"]) {
    assert.equal(toolForKey({ key: k, ctrlKey: true }), null);
    assert.equal(toolForKey({ key: k, metaKey: true }), null);
    assert.equal(toolForKey({ key: k, altKey: true }), null);
  }
  assert.equal(toolForKey({ key: "x" }), null);
});

// Wiring that lives in JSX and cannot run under bare Node: source assertions, kept few and specific.
const annot = readFileSync(new URL("../app/components/screenshot-annotator.jsx", import.meta.url), "utf8");
const reporter = readFileSync(new URL("../app/components/bug-reporter.jsx", import.meta.url), "utf8");

test("Crop is the first tool in the desktop toolbar and the mobile dock", () => {
  const desk = annot.indexOf('<div className="mk-seg" role="toolbar"');
  assert.ok(annot.indexOf('tip="Crop · C"', desk) < annot.indexOf('tip="Box · R"', desk));
  const dock = annot.indexOf('<div className="mk-dock');
  assert.ok(annot.indexOf('tip="Crop"', dock) < annot.indexOf('tip="Box"', dock));
  assert.match(annot, /aria-label="Apply"/);
});

test("the annotator drives history, write-back, Attach and shortcuts through the tested helpers", () => {
  for (const fn of ["pushStep(", "stepBack", "stepFwd", "newHistory(", "persistPage(", "pagesToAttach(", "toolForKey("]) {
    assert.ok(annot.includes(fn), fn);
  }
  assert.match(annot, /pendingCrop\(\);\s*\n\s*persistPage\(pagesRef\.current, idxRef\.current, H, pend\)/);   // Attach applies a pending box
});

test("a cropped re-edit re-uploads the clean base (cleanUrl is what the draft and filed report persist)", () => {
  assert.match(reporter, /clean-\$\{Date\.now\(\)\}\.png[\s\S]{0,200}cleanUrl/);
  assert.match(reporter, /cleanUrl = upBase/);
});

test("annotator stays under the 500-line limit", () => {
  assert.ok(annot.split("\n").length < 500);
});

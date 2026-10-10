// /api/media intake must not hard-fail a web-safe image just because the host's native image library
// (sharp) is missing or chokes — the cause of bug-report SCREENSHOTS (plain PNGs) 422ing on the deploy
// host. A screenshot/photo that a browser can already display is stored as-is when sharp is unavailable;
// only HEIC truly needs conversion (via pure-JS heic-convert). See lib/media-process.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import sharpMod from "sharp";
import { processImage, webSafeMime, looksHeic } from "../lib/media-process.js";

const realSharp = sharpMod;
async function makePng(w = 120, h = 80) {
  return await realSharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 120, b: 220 } } }).png().toBuffer();
}

test("webSafeMime recognizes the common raster signatures (ignoring a blank/wrong MIME)", async () => {
  const png = await makePng();
  assert.equal(webSafeMime(png, ""), "image/png");
  assert.equal(webSafeMime(png, "application/octet-stream"), "image/png", "signature beats a wrong MIME");
  assert.equal(webSafeMime(Buffer.from([0xff, 0xd8, 0xff, 0x00]), ""), "image/jpeg");
  assert.equal(webSafeMime(Buffer.from("GIF89a"), ""), "image/gif");
  assert.equal(webSafeMime(Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]), ""), "image/webp");
  assert.equal(webSafeMime(Buffer.from("not an image"), ""), null);
  assert.equal(webSafeMime(Buffer.from("x"), "image/jpg"), "image/jpeg", "falls back to a web-safe MIME");
});

test("sharp present: a PNG is optimized to a resized JPEG (unchanged happy path)", async () => {
  const png = await makePng(3000, 2000);
  const r = await processImage(png, "shot.png", "image/png");   // real default sharp loader
  assert.equal(r.mime, "image/jpeg");
  assert.ok(r.bytes.length > 0 && r.bytes[0] === 0xff && r.bytes[1] === 0xd8, "is JPEG bytes");
  assert.ok(r.w <= 1600 && r.h <= 1600, "resized within the max dimension");
});

test("sharp ABSENT: a screenshot PNG is stored AS-IS instead of 422ing (the Hostinger fix)", async () => {
  const png = await makePng();
  const r = await processImage(png, "bug-123.png", "image/png", { loadSharp: async () => null });
  assert.equal(r.mime, "image/png", "kept as PNG");
  assert.deepEqual(r.bytes, png, "original bytes stored unchanged");
  assert.equal(r.w, null);
});

test("sharp present but UNABLE to decode: falls back to storing the original web-safe bytes", async () => {
  const png = await makePng();
  const throwingSharp = async () => () => { throw new Error("vipspng: libpng read error"); };
  const r = await processImage(png, "bug.png", "image/png", { loadSharp: throwingSharp });
  assert.equal(r.mime, "image/png");
  assert.deepEqual(r.bytes, png);
});

test("HEIC with no sharp still converts via the pure-JS decoder", async () => {
  const fakeHeic = Buffer.from("fake-heic-bytes");
  const jpegOut = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]);
  let called = false;
  const r = await processImage(fakeHeic, "photo.heic", "image/heic", {
    loadSharp: async () => null,
    loadHeicConvert: async () => async ({ buffer, format }) => { called = true; assert.equal(format, "JPEG"); return jpegOut; },
  });
  assert.ok(called, "heic-convert was used");
  assert.equal(r.mime, "image/jpeg");
  assert.deepEqual(r.bytes, jpegOut);
  assert.equal(looksHeic(fakeHeic, "photo.heic", "image/heic"), true);
});

test("a non-image with no sharp is rejected (nothing a browser could render)", async () => {
  await assert.rejects(
    () => processImage(Buffer.from("just some text, not an image"), "notes.txt", "text/plain", { loadSharp: async () => null }),
    /not a web-safe image/,
  );
});

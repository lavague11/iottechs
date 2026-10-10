// Image intake for /api/media — pure and host-agnostic so it's unit-testable.
//
// Preference: optimize uploads to a resized JPEG with sharp. But sharp ships platform-specific native
// binaries, and on some hosts (prebuilt / managed deploys) the right binary isn't present and importing
// it throws — which used to 422 every upload, so a bug-report SCREENSHOT (a plain PNG) never stored.
// sharp is therefore OPTIONAL here: a web-safe raster (PNG/JPEG/GIF/WebP — already displayable) is stored
// unchanged when sharp is missing or chokes. Only HEIC (which browsers can't show) truly needs conversion,
// and that uses heic-convert, a pure-JS decoder with no native dependency, so it works without sharp.
//
// `deps` lets tests inject the loaders: { loadSharp(): sharp|null, loadHeicConvert(): fn }.

export const MAX_DIM = 1600;   // longest edge of the optimized JPEG

// ISO-BMFF ftyp sniff: HEIC/HEIF brands, in case the browser sent a blank/wrong MIME type.
export function looksHeic(buf, name, type) {
  if (/hei[cf]/i.test(type || "")) return true;
  if (/\.(heic|heif)$/i.test(name || "")) return true;
  try {
    if (buf.length > 12 && buf.toString("latin1", 4, 8) === "ftyp") {
      const brand = buf.toString("latin1", 8, 24).toLowerCase();
      return /heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1/.test(brand);
    }
  } catch { /* fall through */ }
  return false;
}

// Magic-byte sniff for a browser-displayable raster. Signature first (the browser MIME can be blank or
// wrong), then a web-safe MIME as a fallback. Returns the canonical mime or null.
export function webSafeMime(buf, type) {
  try {
    if (buf.length >= 8 && buf.toString("hex", 0, 8) === "89504e470d0a1a0a") return "image/png";
    if (buf.length >= 3 && buf.toString("hex", 0, 3) === "ffd8ff") return "image/jpeg";
    if (buf.length >= 4 && buf.toString("latin1", 0, 4) === "GIF8") return "image/gif";
    if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  } catch { /* fall through */ }
  return /^image\/(png|jpe?g|gif|webp)$/i.test(type || "") ? type.toLowerCase().replace("jpg", "jpeg") : null;
}

const defaultLoadSharp = async () => {
  try { return (await import("sharp")).default; }
  catch (e) { console.error("[media] sharp unavailable:", e?.message || e); return null; }
};
const defaultLoadHeicConvert = async () => (await import("heic-convert")).default;

// → { bytes, mime, w, h }. Throws only when nothing a browser could render can be produced.
export async function processImage(buf, name, type, deps = {}) {
  const loadSharp = deps.loadSharp || defaultLoadSharp;
  const loadHeicConvert = deps.loadHeicConvert || defaultLoadHeicConvert;
  const sharp = await loadSharp();
  const heic = looksHeic(buf, name, type);

  // 1) A displayable source buffer + its mime.
  let srcBuf = buf, srcMime = webSafeMime(buf, type);
  if (heic) {
    const heicConvert = await loadHeicConvert();
    if (sharp) {
      try { srcBuf = await sharp(buf).jpeg().toBuffer(); }                                   // some platforms' sharp decodes HEIC
      catch { srcBuf = Buffer.from(await heicConvert({ buffer: buf, format: "JPEG", quality: 0.92 })); }
    } else {
      srcBuf = Buffer.from(await heicConvert({ buffer: buf, format: "JPEG", quality: 0.92 }));
    }
    srcMime = "image/jpeg";
  }

  // 2) Optimize + resize with sharp when it's available and can read the bytes; otherwise store the
  //    web-safe source unchanged. Only give up when there's nothing a browser could render.
  if (sharp) {
    try {
      const out = await sharp(srcBuf)
        .rotate()   // bake in EXIF orientation so it's upright everywhere
        .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      const meta = await sharp(out).metadata();
      return { bytes: out, mime: "image/jpeg", w: meta.width || null, h: meta.height || null };
    } catch (e) {
      if (srcMime) { console.error("[media] sharp decode failed, storing original:", e?.message || e); return { bytes: srcBuf, mime: srcMime, w: null, h: null }; }
      throw e;
    }
  }
  if (srcMime) return { bytes: srcBuf, mime: srcMime, w: null, h: null };
  throw new Error("image processor unavailable and input is not a web-safe image");
}

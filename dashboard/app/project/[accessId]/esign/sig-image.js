// Browser-side helpers that turn any captured signature (drawn, typed, uploaded) into ONE small
// transparent PNG: trimmed to the ink, scaled to fit, and kept well under the server's 200KB cap.
// The server re-validates the PNG; this just keeps honest input inside the limits.

export const INK = "#10204a";
export const SCRIPT_FONT = `"Brush Script MT","Snell Roundhand","Segoe Script","Lucida Handwriting",cursive`;
const MAX_W = 600, MAX_H = 200, PAD = 6;

// Crop `src` (a canvas) to its non-transparent bounding box and scale down to MAX_W × MAX_H. null if blank.
export function trimToPng(src) {
  const ctx = src.getContext("2d");
  const { width: w, height: h } = src;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD); x1 = Math.min(w - 1, x1 + PAD); y1 = Math.min(h - 1, y1 + PAD);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const k = Math.min(1, MAX_W / cw, MAX_H / ch);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
  const o = out.getContext("2d");
  o.imageSmoothingQuality = "high";
  o.drawImage(src, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

// A typed name rendered in a cursive script (transparent background, navy ink).
export function typedToPng(name) {
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 320;
  const x = c.getContext("2d");
  x.fillStyle = INK; x.textBaseline = "middle"; x.textAlign = "left";
  let size = 170;
  const font = (s) => `italic ${s}px ${SCRIPT_FONT}`;
  x.font = font(size);
  while (x.measureText(name).width > 1120 && size > 40) { size -= 6; x.font = font(size); }
  x.fillText(name, 40, 170);
  return trimToPng(c);
}

// An uploaded photo / scan of a signature: near-white becomes transparent, then trim. Rejects non-images.
export function fileToPng(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Choose an image file."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, 1400 / img.width, 600 / img.height);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0, c.width, c.height);
        const id = x.getImageData(0, 0, c.width, c.height), p = id.data;
        for (let i = 0; i < p.length; i += 4) {
          const lum = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
          if (lum > 225) p[i + 3] = 0; else if (lum > 170) p[i + 3] = Math.round(((225 - lum) / 55) * p[i + 3]);
        }
        x.putImageData(id, 0, 0);
        const png = trimToPng(c);
        URL.revokeObjectURL(url);
        png ? resolve(png) : reject(new Error("No signature found in that image."));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image.")); };
    img.src = url;
  });
}

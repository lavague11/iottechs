"use client";
import React, { useState, useRef, useMemo, useEffect } from "react";

/* ---------------------------------- schema --------------------------------- */

const GROUPS = [
  {
    id: "identity",
    label: "Identity",
    fields: [
      { k: "lastName", l: "Last name", w: 6 },
      { k: "firstName", l: "First name", w: 6 },
      { k: "middleName", l: "Middle name", w: 6 },
      { k: "dob", l: "Date of birth", w: 6, ph: "MM/DD/YYYY" },
      { k: "sex", l: "Sex", w: 4 },
      { k: "height", l: "Height", w: 4 },
      { k: "eyes", l: "Eyes", w: 4 },
    ],
  },
  {
    id: "address",
    label: "Address on document",
    fields: [
      { k: "street", l: "Street address", w: 8 },
      { k: "unit", l: "Apt / unit", w: 4 },
      { k: "city", l: "City", w: 6 },
      { k: "state", l: "State", w: 3 },
      { k: "zip", l: "ZIP", w: 3 },
    ],
  },
  {
    id: "license",
    label: "License",
    fields: [
      { k: "dlNumber", l: "License number", w: 6, mono: true },
      { k: "jurisdiction", l: "Issuing state", w: 6 },
      { k: "issueDate", l: "Issued", w: 4, ph: "MM/DD/YYYY" },
      { k: "expirationDate", l: "Expires", w: 4, ph: "MM/DD/YYYY" },
      { k: "class", l: "Class", w: 4 },
      { k: "restrictions", l: "Restrictions", w: 6 },
      { k: "endorsements", l: "Endorsements", w: 6 },
      { k: "docDiscriminator", l: "Document discriminator", w: 8, mono: true },
      { k: "realId", l: "REAL ID", w: 4 },
    ],
  },
];

const KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.k));
const BLANK = Object.fromEntries(KEYS.map((k) => [k, ""]));
const OPTIONAL = ["docDiscriminator", "unit"];
const LABELS = Object.fromEntries(GROUPS.flatMap((g) => g.fields.map((f) => [f.k, f.l])));

const PROMPT = `You are reading a government-issued driver's license or state ID card.

Read ONLY the driver's licence or state ID. If any other document is in the frame — a Social Security card, a passport, an insurance card — ignore it completely. Never return a Social Security number or any value from those documents, in any field.

Return ONLY a JSON object. No preamble, no explanation, no markdown fences.

Keys (use an empty string for anything you cannot read with confidence — never guess):
${KEYS.map((k) => `"${k}"`).join(", ")}

Rules:
- All dates as MM/DD/YYYY.
- "height" like 5'-10" or 5-10.
- "state" and "jurisdiction" as the 2-letter code.
- "sex" as M or F exactly as printed.
- "eyes" as the printed abbreviation (BRO, BLU, etc.).
- "dlNumber" exactly as printed including letters.
- "street" is the street line only — no city, state, ZIP, or apartment.
- "unit" is the apartment, suite or floor if one is printed (e.g. APT A5), otherwise "".
- "realId": "Y" if the card is REAL ID compliant (star marking), "N" if it says NOT FOR "REAL ID" PURPOSES, "" if unclear.
- "docDiscriminator": the long inventory/control string usually printed in small type near the bottom.
- If the image is not an ID document, return every key as an empty string.
- Add one extra key, "_uncertain": an array of the field names you are not fully confident you read correctly (glare, blur, ambiguous characters). Use [] if everything was clear.`;

/* --------------------------------- helpers --------------------------------- */

const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function readFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });
}

function parseDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s || "").trim());
  if (!m) return null;
  const d = new Date(+m[3], +m[1] - 1, +m[2]);
  return isNaN(d) ? null : d;
}

function ageFrom(dobStr) {
  const d = parseDate(dobStr);
  if (!d) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

function daysUntil(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return null;
  return Math.round((d - new Date()) / 86400000);
}



/* ------------- card detection, perspective correction, saving -------------- */

const CARD_RATIO = 1.585;

function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("bad image"));
    i.src = src;
  });
}

function otsu(vals) {
  const hist = new Float64Array(256);
  for (let i = 0; i < vals.length; i++) hist[Math.min(255, Math.max(0, vals[i] | 0))]++;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let wB = 0, sB = 0, best = -1, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = vals.length - wB;
    if (!wF) break;
    sB += t * hist[t];
    const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (v > best) { best = v; thr = t; }
  }
  return thr;
}

function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop(); up.pop();
  return lo.concat(up);
}

function minAreaRect(pts) {
  const h = hull(pts);
  if (h.length < 3) return null;
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of h) {
      const x = q[0] * c - q[1] * s, y = q[0] * s + q[1] * c;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const area = (x1 - x0) * (y1 - y0);
    if (!best || area < best.area) {
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      best = { area, ang, w: x1 - x0, h: y1 - y0, cx: mx * c + my * s, cy: -mx * s + my * c };
    }
  }
  return best;
}

function rectCorners(r) {
  const c = Math.cos(r.ang), s = Math.sin(r.ang);
  const hw = r.w / 2, hh = r.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [
    r.cx + x * c - y * s,
    r.cy + x * s + y * c,
  ]);
}

/* Best-effort card locator. Runs several masks and keeps the most card-shaped
   blob. Returns 4 corners in 0..1 image space, or null when nothing fits. */
async function detectQuad(url) {
  const img = await loadImage(url);
  const S = 400;
  const k = Math.min(S / img.naturalWidth, S / img.naturalHeight, 1);
  const aw = Math.max(4, Math.round(img.naturalWidth * k));
  const ah = Math.max(4, Math.round(img.naturalHeight * k));
  const cv = document.createElement("canvas");
  cv.width = aw; cv.height = ah;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0, aw, ah);
  const d = cx.getImageData(0, 0, aw, ah).data;

  const N = aw * ah;
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++)
    lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];

  const sorted = Float32Array.from(lum).sort();
  const pct = (q) => sorted[Math.min(N - 1, Math.floor(N * q))];
  const t = otsu(lum);

  // local contrast map — print and photo have texture, tables and dashboards don't
  const ii = new Float64Array((aw + 1) * (ah + 1));
  const i2 = new Float64Array((aw + 1) * (ah + 1));
  for (let y = 0; y < ah; y++)
    for (let x = 0; x < aw; x++) {
      const v = lum[y * aw + x], o = (y + 1) * (aw + 1) + (x + 1);
      ii[o] = v + ii[o - 1] + ii[o - (aw + 1)] - ii[o - (aw + 2)];
      i2[o] = v * v + i2[o - 1] + i2[o - (aw + 1)] - i2[o - (aw + 2)];
    }
  const R = 3;
  const sd = new Float32Array(N);
  for (let y = 0; y < ah; y++)
    for (let x = 0; x < aw; x++) {
      const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R);
      const x1 = Math.min(aw - 1, x + R), y1 = Math.min(ah - 1, y + R);
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      const box = (m) =>
        m[(y1 + 1) * (aw + 1) + x1 + 1] - m[y0 * (aw + 1) + x1 + 1] -
        m[(y1 + 1) * (aw + 1) + x0] + m[y0 * (aw + 1) + x0];
      const mean = box(ii) / n;
      sd[y * aw + x] = Math.sqrt(Math.max(0, box(i2) / n - mean * mean));
    }
  let sdMax = 1;
  for (let i = 0; i < N; i++) if (sd[i] > sdMax) sdMax = sd[i];
  const sdn = new Float32Array(N);
  for (let i = 0; i < N; i++) sdn[i] = (sd[i] / sdMax) * 255;
  const tTex = otsu(sdn);
  const texRaw = new Uint8Array(N);
  for (let i = 0; i < N; i++) texRaw[i] = sdn[i] > tTex ? 1 : 0;
  let tex = texRaw.slice();
  const morph = (src, grow) => {
    const out = new Uint8Array(N);
    for (let y = 0; y < ah; y++)
      for (let x = 0; x < aw; x++) {
        const i = y * aw + x;
        let acc = src[i];
        const nb = [x > 0 ? i - 1 : i, x < aw - 1 ? i + 1 : i, y > 0 ? i - aw : i, y < ah - 1 ? i + aw : i];
        for (const n of nb) acc = grow ? acc | src[n] : acc & src[n];
        out[i] = acc;
      }
    return out;
  };
  for (let i = 0; i < 3; i++) tex = morph(tex, true);
  for (let i = 0; i < 2; i++) tex = morph(tex, false);

  const masks = [
    ["bright", (i) => lum[i] > t],
    ["dark", (i) => lum[i] <= t],
    ["p75", (i) => lum[i] > pct(0.75)],
    ["p85", (i) => lum[i] > pct(0.85)],
    ["texture", (i) => tex[i] === 1],
  ];

  // colour energy — a licence carries a colour portrait, a Social Security card doesn't
  const colorf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b2 = d[i * 4 + 2];
    colorf[i] = Math.abs(r - g) + Math.abs(b2 - (r + g) / 2);
  }

  // every blob, not just the biggest — two documents may share the frame
  const blobsOf = (test, cap = 6) => {
    const seen = new Uint8Array(N);
    const q = new Int32Array(N);
    const found = [];
    for (let i = 0; i < N; i++) {
      if (seen[i] || !test(i)) continue;
      let head = 0, tail = 0;
      q[tail++] = i; seen[i] = 1;
      const pts = [];
      while (head < tail) {
        const cur = q[head++];
        const x = cur % aw, y = (cur / aw) | 0;
        pts.push([x, y]);
        const go = (n) => { if (!seen[n] && test(n)) { seen[n] = 1; q[tail++] = n; } };
        if (x > 0) go(cur - 1);
        if (x < aw - 1) go(cur + 1);
        if (y > 0) go(cur - aw);
        if (y < ah - 1) go(cur + aw);
      }
      if (pts.length >= N * 0.02) found.push(pts);
    }
    return found.sort((x, y) => y.length - x.length).slice(0, cap);
  };

  const inside = (corners, px, py) => {
    let hit = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const [xi, yi] = corners[i], [xj, yj] = corners[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  let win = null, winScore = 1e9, cardLike = 0;
  for (const [, test] of masks) {
    for (const pts of blobsOf(test)) {
      const r = minAreaRect(pts);
      if (!r) continue;
      const w = Math.max(r.w, r.h), h = Math.min(r.w, r.h);
      if (h < 8) continue;
      const fill = (w * h) / N;
      const pen = fill >= 0.06 && fill <= 0.72 ? 0 : fill > 0.72 ? 3 : 2;
      const corners = rectCorners(r);

      // a licence is densely printed — a hand, a table or a dashboard is not
      let inN = 0, inTex = 0, inCol = 0;
      for (let y = 0; y < ah; y += 2)
        for (let x = 0; x < aw; x += 2)
          if (inside(corners, x, y)) {
            inN++;
            inTex += texRaw[y * aw + x];
            inCol += colorf[y * aw + x];
          }
      if (inN < 20 || inTex / inN < 0.33) continue;

      const bonus = Math.min(inCol / inN / 400, 0.25);
      const score = Math.abs(w / h - CARD_RATIO) + pen - bonus;
      if (score < 0.2) cardLike++;
      if (score < winScore) { winScore = score; win = corners; }
    }
  }
  if (!win || winScore > 0.15) return null;
  return { quad: win.map(([x, y]) => [x / aw, y / ah]), others: Math.max(0, cardLike - 1) };

}

/* homography from output rect to source quad */
function solveH(dst, src) {
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [xd, yd] = dst[i], [xs, ys] = src[i];
    A.push([xd, yd, 1, 0, 0, 0, -xs * xd, -xs * yd]); B.push(xs);
    A.push([0, 0, 0, xd, yd, 1, -ys * xd, -ys * yd]); B.push(ys);
  }
  for (let i = 0; i < 8; i++) {
    let p = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [B[i], B[p]] = [B[p], B[i]];
    if (!A[i][i]) return null;
    for (let r = 0; r < 8; r++) {
      if (r === i) continue;
      const f = A[r][i] / A[i][i];
      for (let c2 = i; c2 < 8; c2++) A[r][c2] -= f * A[i][c2];
      B[r] -= f * B[i];
    }
  }
  return B.map((v, i) => v / A[i][i]);
}

/* order corners TL, TR, BR, BL and flatten the card to a level rectangle */
function orderQuad(q) {
  const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
  const by = (p) => Math.atan2(p[1] - cy, p[0] - cx);
  const s = q.slice().sort((a, b) => by(a) - by(b));
  const start = s.findIndex((p) => p[0] <= cx && p[1] <= cy);
  return s.slice(Math.max(0, start)).concat(s.slice(0, Math.max(0, start)));
}

async function warpCard(url, quadN, spin = 0, outW = 1000) {
  const img = await loadImage(url);
  const W = img.naturalWidth, H = img.naturalHeight;

  // Sample the source at enough resolution that the card itself is oversampled.
  // A fixed cap throws away detail when the card only fills part of the frame.
  const px = quadN.map(([x, y]) => [x * W, y * H]);
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const cardW = Math.max(len(px[0], px[1]), len(px[3], px[2]), len(px[1], px[2]), len(px[0], px[3]));
  let k = Math.min(1, (outW * 1.3) / Math.max(cardW, 1));
  k = Math.min(k, 4000 / Math.max(W, H));
  const sw = Math.max(2, Math.round(W * k)), sh = Math.max(2, Math.round(H * k));
  const sc = document.createElement("canvas");
  sc.width = sw; sc.height = sh;
  const sx = sc.getContext("2d", { willReadFrequently: true });
  sx.drawImage(img, 0, 0, sw, sh);
  const src = sx.getImageData(0, 0, sw, sh).data;

  let q = orderQuad(quadN.map(([x, y]) => [x * sw, y * sh]));
  const side = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (side(q[0], q[1]) < side(q[1], q[2])) q = [q[3], q[0], q[1], q[2]];   // landscape
  for (let i = 0; i < ((spin % 4) + 4) % 4; i++) q = [q[1], q[2], q[3], q[0]];

  const turned = (((spin % 4) + 4) % 4) % 2 === 1;
  const W2 = turned ? Math.round(outW / CARD_RATIO) : outW;
  const outH = turned ? outW : Math.round(outW / CARD_RATIO);
  outW = W2;
  const h = solveH([[0, 0], [outW, 0], [outW, outH], [0, outH]], q);
  if (!h) return null;
  const [a, b, c, dd, e, f, g, i8] = h;

  const oc = document.createElement("canvas");
  oc.width = outW; oc.height = outH;
  const octx = oc.getContext("2d");
  const out = octx.createImageData(outW, outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const den = g * x + i8 * y + 1;
      const u = (a * x + b * y + c) / den, v = (dd * x + e * y + f) / den;
      const o = (y * outW + x) * 4;
      if (u < 0 || v < 0 || u > sw - 1 || v > sh - 1) { out.data[o + 3] = 255; continue; }
      const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
      const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
      for (let ch = 0; ch < 3; ch++) {
        const p00 = src[(y0 * sw + x0) * 4 + ch], p10 = src[(y0 * sw + x1) * 4 + ch];
        const p01 = src[(y1 * sw + x0) * 4 + ch], p11 = src[(y1 * sw + x1) * 4 + ch];
        out.data[o + ch] =
          p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
      }
      out.data[o + 3] = 255;
    }
  }
  octx.putImageData(out, 0, 0);
  return oc.toDataURL("image/jpeg", 0.92);
}

/* licences put the portrait on the left — use that to guess if it landed upside down */
async function looksFlipped(url) {
  const img = await loadImage(url);
  const w = 120, h = Math.round(w / CARD_RATIO);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  const colorful = (x0, x1) => {
    let n = 0, sum = 0;
    for (let y = 0; y < h; y++)
      for (let x = x0; x < x1; x++) {
        const o = (y * w + x) * 4;
        const r = d[o], g = d[o + 1], b = d[o + 2];
        sum += Math.abs(r - g) + Math.abs(b - (r + g) / 2);
        n++;
      }
    return sum / Math.max(1, n);
  };
  return colorful(Math.round(w * 0.72), w) > colorful(0, Math.round(w * 0.28)) * 1.25;
}

/* ------------------------- AAMVA PDF417 barcode ---------------------------- */

const AAMVA = {
  DCS: "lastName", DCA: "class", DCB: "restrictions", DCD: "endorsements",
  DBA: "expirationDate", DCF: "docDiscriminator", DCG: "country",
  DAC: "firstName", DCT: "firstName", DAD: "middleName",
  DBB: "dob", DBC: "sex", DBD: "issueDate",
  DAU: "height", DAY: "eyes",
  DAG: "street", DAH: "unit", DAI: "city", DAJ: "state", DAK: "zip",
  DAQ: "dlNumber", DDA: "realId",
  DAA: "fullName", DAL: "street", DAR: "class", DAS: "restrictions", DAT: "endorsements",
};

function aamvaDate(v, canada) {
  const d = (v || "").replace(/\D/g, "");
  if (d.length !== 8) return "";
  let mm, dd, yyyy;
  if (canada || +d.slice(0, 2) > 12) {
    yyyy = d.slice(0, 4); mm = d.slice(4, 6); dd = d.slice(6, 8);
  } else {
    mm = d.slice(0, 2); dd = d.slice(2, 4); yyyy = d.slice(4, 8);
  }
  if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return "";
  return `${mm}/${dd}/${yyyy}`;
}

function aamvaHeight(v) {
  const s = (v || "").trim().toUpperCase();
  if (!s) return "";
  if (/CM/.test(s)) return s.replace(/\s+/g, " ");
  const n = parseInt(s.replace(/\D/g, ""), 10);
  if (!n) return "";
  if (/IN/.test(s) || (n >= 36 && n <= 90))
    return `${Math.floor(n / 12)}'-${String(n % 12).padStart(2, "0")}"`;
  if (n >= 300 && n <= 811) {
    const f = Math.floor(n / 100), i = n % 100;
    if (i < 12) return `${f}'-${String(i).padStart(2, "0")}"`;
  }
  return s;
}

function parseAAMVA(raw) {
  if (!raw || !/DAQ|DCS|ANSI|AAMVA/i.test(raw)) return null;
  const body = raw.slice(Math.max(0, raw.search(/ANSI |AAMVA/i)));
  const out = {};
  body.split(/[\r\n]+/).forEach((lineRaw) => {
    let line = lineRaw.trim();
    if (!line) return;
    if (/^(DL|ID)[A-Z]{3}/.test(line)) line = line.slice(2);
    const id = line.slice(0, 3).toUpperCase();
    const val = line.slice(3).trim();
    if (AAMVA[id] && val) out[AAMVA[id]] = val;
  });
  if (!Object.keys(out).length) return null;

  const canada = /^(CAN|CANADA)$/i.test(out.country || "");
  ["dob", "expirationDate", "issueDate"].forEach((k) => {
    if (out[k]) out[k] = aamvaDate(out[k], canada);
  });
  if (out.height) out.height = aamvaHeight(out.height);
  if (out.sex) out.sex = { 1: "M", 2: "F", M: "M", F: "F" }[out.sex.trim().toUpperCase()] || "";
  if (out.zip) {
    const z = out.zip.replace(/\D/g, "");
    out.zip = z.length > 5 ? `${z.slice(0, 5)}-${z.slice(5, 9)}` : z;
  }
  if (out.realId) out.realId = /^F/i.test(out.realId) ? "Y" : "N";
  if (out.fullName && !out.lastName) {
    const p = out.fullName.split(",").map((x) => x.trim());
    out.lastName = p[0] || ""; out.firstName = p[1] || ""; out.middleName = p[2] || "";
  }
  if (out.firstName && !out.middleName) {
    const p = out.firstName.trim().split(/\s+/);
    if (p.length > 1) { out.middleName = p.pop(); out.firstName = p.join(" "); }
  }
  ["fullName", "country"].forEach((k) => delete out[k]);
  Object.keys(out).forEach((k) => { out[k] = String(out[k]).replace(/,+$/, "").trim(); });
  return out;
}





/* value types itself out as it comes off the card */
function Typed({ text }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!text) return;
    const step = Math.max(18, Math.min(55, 420 / text.length));
    const id = setInterval(() => {
      setN((v) => {
        if (v >= text.length) { clearInterval(id); return v; }
        return v + 1;
      });
    }, step);
    return () => clearInterval(id);
  }, [text]);
  const done = n >= text.length;
  return (
    <span className="typed">
      {text.slice(0, n)}
      {!done && <i className="caret" />}
    </span>
  );
}

/* --------------------------- live auto-capture ----------------------------- */

function LiveCapture({ onShot, onClose, onFallback }) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const [quad, setQuad] = useState(null);
  const [msg, setMsg] = useState("Starting camera…");
  const stable = useRef(0);
  const last = useRef(null);
  const stop = useRef(() => {});
  const busy = useRef(false);
  const done = useRef(false);

  const grab = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    return c.toDataURL("image/jpeg", 0.92);
  };

  const shoot = () => {
    if (done.current) return;
    const url = grab();
    if (!url) return;
    done.current = true;
    stop.current();
    onShot(url);
  };

  useEffect(() => {
    let timer;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        stop.current = () => stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setMsg("Fill the frame with the licence");
        timer = setInterval(async () => {
          if (busy.current || done.current) return;
          busy.current = true;
          try {
            const frame = grab();
            if (frame) {
              const res = await detectQuad(frame);
              const q = res ? res.quad : null;
              setQuad(q);
              if (q) {
                const move = last.current
                  ? Math.max(...q.map((p, i) => Math.hypot(p[0] - last.current[i][0], p[1] - last.current[i][1])))
                  : 1;
                last.current = q;
                if (move < 0.02) stable.current++;
                else stable.current = 0;
                setMsg(stable.current >= 2 ? "Hold it…" : "Card found — hold steady");
                if (stable.current >= 3) shoot();
              } else {
                stable.current = 0;
                last.current = null;
                setMsg("Fill the frame with the licence");
              }
            }
          } catch (_) { /* keep scanning */ }
          busy.current = false;
        }, 450);
      } catch (e) {
        setMsg("No camera access. Use Take or Upload instead.");
      }
    })();
    return () => { clearInterval(timer); stop.current(); };
  }, []);

  return (
    <div className="sheet">
      <div className="sheetHead">
        <span>{msg}</span>
        <button className="mini" onClick={() => { stop.current(); onClose(); }}>Close</button>
      </div>
      <div className="quadWrap live" ref={wrapRef}>
        <video ref={videoRef} playsInline muted />
        <svg className="guide" viewBox="0 0 100 63" preserveAspectRatio="xMidYMid meet">
          <defs>
            <mask id="cut">
              <rect width="100" height="63" fill="#fff" />
              <rect x="7" y="6.4" width="86" height="50.2" rx="3" fill="#000" />
            </mask>
          </defs>
          <rect width="100" height="63" fill="rgba(11,15,26,.55)" mask="url(#cut)" />
          <g fill="none" stroke="#C9A96E" strokeWidth="0.9" strokeLinecap="round">
            <path d="M7 15V9.4a3 3 0 0 1 3-3h6" />
            <path d="M93 15V9.4a3 3 0 0 0-3-3h-6" />
            <path d="M7 48v5.6a3 3 0 0 0 3 3h6" />
            <path d="M93 48v5.6a3 3 0 0 1-3 3h-6" />
          </g>
        </svg>
        {quad && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon
              points={quad.map(([x, y]) => `${x * 100},${y * 100}`).join(" ")}
              fill="rgba(201,169,110,.18)" stroke="#C9A96E" strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
      <button className="primary" onClick={shoot}>Capture now</button>
      <button className="mini wide" onClick={onFallback}>Use the phone camera instead</button>
    </div>
  );
}


/* Vertical under-21 licences print across the short edge. Text rows carry far more
   horizontal stroke rhythm than columns do, so the axis tells us which way is up. */
async function textAxis(url) {
  const img = await loadImage(url);
  const w = 360;
  const h = Math.max(8, Math.round((img.naturalHeight * w) / img.naturalWidth));
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++)
    g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];

  const rowProf = new Float32Array(h), colProf = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = 1; x < w; x++) acc += Math.abs(g[y * w + x] - g[y * w + x - 1]);
    rowProf[y] = acc / (w - 1);
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = 1; y < h; y++) acc += Math.abs(g[y * w + x] - g[(y - 1) * w + x]);
    colProf[x] = acc / (h - 1);
  }
  const rhythm = (p) => {
    let acc = 0;
    for (let i = 1; i < p.length; i++) acc += Math.abs(p[i] - p[i - 1]);
    return acc / (p.length - 1);
  };
  const r = rhythm(rowProf), c = rhythm(colProf);
  return c > r * 1.1 ? "vertical" : "horizontal";
}

/* portrait cards put the photo at the top, landscape cards on the left */
async function looksUpsideDown(url, portrait) {
  const img = await loadImage(url);
  const w = portrait ? 76 : 120, h = portrait ? 120 : 76;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  const band = (x0, x1, y0, y1) => {
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const o = (y * w + x) * 4, r = d[o], g = d[o + 1], b = d[o + 2];
        sum += Math.abs(r - g) + Math.abs(b - (r + g) / 2);
        n++;
      }
    return sum / Math.max(1, n);
  };
  return portrait
    ? band(0, w, Math.round(h * 0.72), h) > band(0, w, 0, Math.round(h * 0.28)) * 1.25
    : band(Math.round(w * 0.72), w, 0, h) > band(0, Math.round(w * 0.28), 0, h) * 1.25;
}


/* ------------------------- address normalization --------------------------- */

const SUFFIX = {
  STREET: "St", ST: "St", AVENUE: "Ave", AVE: "Ave", AV: "Ave", ROAD: "Rd", RD: "Rd",
  BOULEVARD: "Blvd", BLVD: "Blvd", DRIVE: "Dr", DR: "Dr", LANE: "Ln", LN: "Ln",
  COURT: "Ct", CT: "Ct", PLACE: "Pl", PL: "Pl", TERRACE: "Ter", TER: "Ter", TERR: "Ter",
  CIRCLE: "Cir", CIR: "Cir", PARKWAY: "Pkwy", PKWY: "Pkwy", HIGHWAY: "Hwy", HWY: "Hwy",
  SQUARE: "Sq", SQ: "Sq", TRAIL: "Trl", TRL: "Trl", WAY: "Way", ALLEY: "Aly",
  PLAZA: "Plz", PLZ: "Plz", CRESCENT: "Cres", HEIGHTS: "Hts", HTS: "Hts",
  EXTENSION: "Ext", TURNPIKE: "Tpke", TPKE: "Tpke", LOOP: "Loop", RUN: "Run",
};
const DIRECTION = {
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
  NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
  N: "N", S: "S", E: "E", W: "W", NE: "NE", NW: "NW", SE: "SE", SW: "SW",
};
const UNIT_WORDS = /^(APT|APARTMENT|UNIT|STE|SUITE|FL|FLOOR|RM|ROOM|BLDG|BUILDING|#)$/i;

function titleWord(w) {
  if (/^\d+(ST|ND|RD|TH)$/i.test(w)) return w.toLowerCase();
  if (/^\d/.test(w)) return w.toUpperCase();
  if (/^(MC)[A-Z]/i.test(w)) return "Mc" + w[2].toUpperCase() + w.slice(3).toLowerCase();
  return w
    .toLowerCase()
    .replace(/(^|[-'])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

/* "473 PARK AVE APT A5" -> { street: "473 Park Ave", unit: "Apt A5" } */
function normalizeAddress(streetIn, unitIn, cityIn) {
  const words = String(streetIn || "").trim().split(/[\s,]+/).filter(Boolean);
  let unit = String(unitIn || "").trim();

  // pull the apartment off the street line first
  const cut = words.findIndex((w) => UNIT_WORDS.test(w.toUpperCase().replace(/\.$/, "")));
  let main = words;
  if (cut > 0) {
    main = words.slice(0, cut);
    if (!unit) unit = words.slice(cut).join(" ");
  }

  const out = main.map((raw, i) => {
    const up = raw.toUpperCase().replace(/\.$/, "");
    // only the final word is a street suffix — "Boulevard East" keeps its name
    if (SUFFIX[up] && i === main.length - 1 && i > 0) return SUFFIX[up];
    // only leading directionals abbreviate — a trailing one is part of the name
    if (DIRECTION[up] && i === 1 && main.length > 2) return DIRECTION[up];
    return titleWord(raw);
  });

  if (unit) {
    const m = /^(#\S*|\S+)\s*(.*)$/.exec(unit.trim());
    if (m) {
      const lab = m[1].toUpperCase().replace(/\.$/, "");
      const label = lab.startsWith("#")
        ? lab
        : titleWord(lab === "APARTMENT" ? "APT" : lab === "SUITE" ? "STE" : lab);
      unit = `${label} ${m[2].toUpperCase()}`.trim();
    }
  }

  return {
    street: out.join(" "),
    unit,
    city: String(cityIn || "").trim().split(/\s+/).map(titleWord).join(" "),
  };
}

/* ----------------------- validation and image quality ---------------------- */

/* Licence number shapes for the states IOT TECHS actually sees. */
const DL_FORMATS = {
  NJ: { re: /^[A-Z]\d{14}$/, hint: "letter + 14 digits" },
  NY: { re: /^(\d{9}|[A-Z]\d{18}|\d{16}|[A-Z]{8})$/, hint: "9 digits" },
  PA: { re: /^\d{8}$/, hint: "8 digits" },
  CT: { re: /^\d{9}$/, hint: "9 digits" },
  DE: { re: /^\d{1,7}$/, hint: "up to 7 digits" },
  MD: { re: /^[A-Z]\d{12}$/, hint: "letter + 12 digits" },
  MA: { re: /^(S\d{8}|\d{9})$/, hint: "S + 8 digits, or 9 digits" },
  VA: { re: /^([A-Z]\d{8,11}|\d{9})$/, hint: "letter + 8-11 digits" },
  FL: { re: /^[A-Z]\d{12}$/, hint: "letter + 12 digits" },
  CA: { re: /^[A-Z]\d{7}$/, hint: "letter + 7 digits" },
  TX: { re: /^\d{8}$/, hint: "8 digits" },
  GA: { re: /^\d{7,9}$/, hint: "7-9 digits" },
  NC: { re: /^\d{1,12}$/, hint: "up to 12 digits" },
  OH: { re: /^([A-Z]{2}\d{6}|\d{8})$/, hint: "2 letters + 6 digits" },
  IL: { re: /^[A-Z]\d{11,12}$/, hint: "letter + 11-12 digits" },
};

const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;

function scrub(v) {
  return SSN_RE.test(String(v || "")) ? "" : v;
}

function validate(f) {
  const out = [];
  const st = (f.jurisdiction || f.state || "").toUpperCase().trim();
  const dl = (f.dlNumber || "").toUpperCase().replace(/[\s-]/g, "");
  const fmt = DL_FORMATS[st];
  if (dl && fmt && !fmt.re.test(dl))
    out.push({ k: "dlNumber", msg: `${st} licences are ${fmt.hint} — this doesn't match` });

  const dob = parseDate(f.dob), iss = parseDate(f.issueDate), exp = parseDate(f.expirationDate);
  const now = new Date();
  if (f.dob && !dob) out.push({ k: "dob", msg: "Date of birth isn't a valid date" });
  if (f.issueDate && !iss) out.push({ k: "issueDate", msg: "Issue date isn't a valid date" });
  if (f.expirationDate && !exp) out.push({ k: "expirationDate", msg: "Expiry isn't a valid date" });
  if (iss && exp && iss >= exp) out.push({ k: "issueDate", msg: "Issued on or after the expiry date" });
  if (dob && iss && dob >= iss) out.push({ k: "dob", msg: "Born on or after the issue date" });
  if (dob && dob > now) out.push({ k: "dob", msg: "Date of birth is in the future" });
  if (exp && exp.getFullYear() - now.getFullYear() > 15)
    out.push({ k: "expirationDate", msg: "Expiry is more than 15 years out" });
  if (iss && iss > now) out.push({ k: "issueDate", msg: "Issue date is in the future" });

  if (f.zip && !/^\d{5}(-\d{4})?$/.test(f.zip.trim()))
    out.push({ k: "zip", msg: "ZIP should be 5 digits, or 5-4" });
  if (f.state && !/^[A-Z]{2}$/.test(f.state.trim().toUpperCase()))
    out.push({ k: "state", msg: "State should be the 2-letter code" });
  if (f.sex && !/^[MFX]$/i.test(f.sex.trim()))
    out.push({ k: "sex", msg: "Sex should be M, F or X" });
  const h = /(\d+)'-?(\d{1,2})/.exec(f.height || "");
  if (h && (+h[1] < 3 || +h[1] > 7 || +h[2] > 11))
    out.push({ k: "height", msg: "Height doesn't look right" });
  return out;
}

/* Sharpness and glare on the flattened card, so a bad photo is caught
   before it turns into a confident wrong digit. */
async function quality(url) {
  const img = await loadImage(url);
  const w = 900, h = Math.round(w / CARD_RATIO);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  let d;
  try {
    d = cx.getImageData(0, 0, w, h).data;
  } catch (_) {
    return null;                       // canvas read blocked
  }
  const g = new Float32Array(w * h);
  let ink = 0;
  for (let i = 0; i < w * h; i++) {
    g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    if (g[i] > 4) ink++;
  }
  if (ink < w * h * 0.02) return null;  // canvas came back blank

  let n = 0, sum = 0, sum2 = 0, blown = 0, inN = 0;
  const x0 = Math.round(w * 0.05), x1 = Math.round(w * 0.95);
  const y0 = Math.round(h * 0.05), y1 = Math.round(h * 0.95);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const lap = -4 * g[i] + g[i - 1] + g[i + 1] + g[i - w] + g[i + w];
      sum += lap; sum2 += lap * lap; n++;
      inN++;
      // clipped AND locally flat — a blown highlight that has eaten the detail,
      // not simply the pale stock the card is printed on
      if (d[i * 4] > 250 && d[i * 4 + 1] > 250 && d[i * 4 + 2] > 250) {
        let lo = 255, hi = 0;
        for (const o of [i - 2, i + 2, i - w * 2, i + w * 2]) {
          if (g[o] < lo) lo = g[o];
          if (g[o] > hi) hi = g[o];
        }
        if (hi - lo < 6) blown++;
      }
    }
  const sharp = sum2 / n - (sum / n) ** 2;
  return { sharp: Math.round(sharp), glare: +((blown / inN) * 100).toFixed(1) };
}

function qualityNote(q) {
  if (!q) return null;
  if (q.sharp < 55) return { tone: "bad", msg: "Photo is soft — reshoot closer and hold still" };
  if (q.glare > 8) return { tone: "bad", msg: `Glare over ${q.glare}% of the card — tilt away from the light` };
  if (q.sharp < 110) return { tone: "warn", msg: "Slightly soft — check the licence number" };
  return { tone: "good", msg: "Sharp" };
}


/* ---------------------------- capture scoring ------------------------------ */

/* How much to trust each part of what came off the card, 0-100. */
function scoreCapture({ fields, uncertain, issues, dlCheck, fromBarcode, shots }) {
  const bad = new Set(issues.map((i) => i.k));
  const has = (k) => !!String(fields[k] || "").trim();

  const rate = (keys, useBarcode = true) => {
    const present = keys.filter(has);
    if (!present.length) return 0;
    let v = 100 * (present.length / keys.length);
    if (keys.some((k) => bad.has(k))) v -= 55;
    if (keys.some((k) => uncertain.includes(k))) v -= 30;
    if (fromBarcode && useBarcode) v = Math.max(v, 96);
    return Math.max(0, Math.min(100, Math.round(v)));
  };

  let dl = rate(["dlNumber"]);
  if (dl) {
    if (dlCheck.state === "match") dl = Math.max(dl, 98);
    else if (dlCheck.state === "conflict") dl = Math.min(dl, 45);
    else if (dlCheck.state === "checking") dl = Math.min(dl, 80);
  }

  const q = shots.find((x) => x.side === "Front")?.q;
  let clarity = null;                  // null = couldn't measure, not "bad"
  if (q && Number.isFinite(q.sharp)) {
    const sharp = q.sharp >= 220 ? 95 : q.sharp >= 110 ? 85 : q.sharp >= 55 ? 65 : 32;
    clarity = Math.max(10, Math.min(100, Math.round(sharp - Math.min(30, q.glare * 2.5))));
  }

  return [
    { k: "dl", label: "Licence number", pct: dl, w: 26 },
    { k: "name", label: "Name", pct: rate(["lastName", "firstName"]), w: 16 },
    { k: "addr", label: "Address", pct: rate(["street", "city", "zip"]), w: 16 },
    { k: "dob", label: "Date of birth", pct: rate(["dob"]), w: 14 },
    { k: "exp", label: "Expiration", pct: rate(["expirationDate"]), w: 10 },
    { k: "state", label: "Issuing state", pct: rate(["jurisdiction"]), w: 6 },
    { k: "photo", label: "Photo clarity", pct: clarity, w: 12, raw: q },
  ];
}

/* Weighted, but never far above the weakest link — one bad field
   is what bites you later, not the six that came out clean. */
function overallScore(all) {
  const rows = all.filter((r) => r.pct !== null);
  if (!rows.length) return 0;
  const wsum = rows.reduce((a, r) => a + r.w, 0);
  const weighted = rows.reduce((a, r) => a + r.pct * r.w, 0) / wsum;
  const worst = Math.min(...rows.map((r) => r.pct));
  return Math.round(Math.min(weighted, worst + 20));
}

/* ------------------------------ card viewer -------------------------------- */

function Lightbox({ shot, onDownload, onClose }) {
  const [z, setZ] = useState(1);
  const [off, setOff] = useState([0, 0]);
  const drag = useRef(null);
  const pinch = useRef(null);

  const clamp = (v) => Math.min(6, Math.max(1, v));
  const reset = () => { setZ(1); setOff([0, 0]); };

  const down = (e) => {
    if (e.touches?.length === 2) {
      const [a, b] = e.touches;
      pinch.current = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z };
      return;
    }
    const t = e.touches ? e.touches[0] : e;
    drag.current = { x: t.clientX, y: t.clientY, ox: off[0], oy: off[1] };
  };
  const move = (e) => {
    if (pinch.current && e.touches?.length === 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setZ(clamp((pinch.current.z * d) / pinch.current.d));
      return;
    }
    if (!drag.current || z === 1) return;
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    setOff([drag.current.ox + (t.clientX - drag.current.x), drag.current.oy + (t.clientY - drag.current.y)]);
  };
  const up = () => { drag.current = null; pinch.current = null; };

  return (
    <div className="lb" onMouseUp={up} onMouseLeave={up} onTouchEnd={up}>
      <div className="lbBar">
        <span>{shot.side} of licence</span>
        <div className="lbBtns">
          <button className="mini" onClick={() => setZ((v) => clamp(v - 0.5))}>−</button>
          <button className="mini" onClick={() => setZ((v) => clamp(v + 0.5))}>+</button>
          <button className="mini" onClick={reset}>Fit</button>
          <button className="mini" onClick={() => onDownload(shot)}>Download</button>
          <button className="mini" onClick={onClose}>Close</button>
        </div>
      </div>
      <div
        className="lbStage"
        onMouseDown={down}
        onMouseMove={move}
        onTouchStart={down}
        onTouchMove={move}
        onDoubleClick={() => (z === 1 ? setZ(2.5) : reset())}
        onWheel={(e) => setZ((v) => clamp(v - Math.sign(e.deltaY) * 0.25))}
      >
        <img
          src={shot.url}
          alt={`${shot.side} of licence`}
          draggable={false}
          style={{
            transform: `translate(${off[0]}px, ${off[1]}px) scale(${z})`,
            cursor: z > 1 ? "grab" : "zoom-in",
          }}
        />
      </div>
      <p className="lbHint">Pinch, scroll or double-tap to zoom · drag to pan</p>
    </div>
  );
}

/* -------------------------- corner editor overlay -------------------------- */

function QuadEditor({ shot, onChange, onClose }) {
  const boxRef = useRef(null);
  const [q, setQ] = useState(shot.quad);
  const drag = useRef(null);

  // lock the page while a corner is being dragged
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = boxRef.current;
    const block = (e) => { if (drag.current !== null) e.preventDefault(); };
    el?.addEventListener("touchmove", block, { passive: false });
    return () => {
      document.body.style.overflow = prev;
      el?.removeEventListener("touchmove", block);
    };
  }, []);

  const at = (e) => {
    const r = boxRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return [
      Math.min(1, Math.max(0, (t.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (t.clientY - r.top) / r.height)),
    ];
  };
  const move = (e) => {
    if (drag.current === null) return;
    const p = at(e);
    setQ((old) => old.map((c, i) => (i === drag.current ? p : c)));
  };
  const end = () => { drag.current = null; };

  const nudge = (i, dx, dy) =>
    setQ((old) =>
      old.map((c, n) =>
        n === i ? [Math.min(1, Math.max(0, c[0] + dx)), Math.min(1, Math.max(0, c[1] + dy))] : c
      )
    );

  return (
    <div className="lb">
      <div className="lbBar">
        <span>Drag the corners to the card edge</span>
        <div className="lbBtns">
          <button className="mini" onClick={() => setQ(shot.quad)}>Reset</button>
          <button className="mini" onClick={onClose}>Cancel</button>
        </div>
      </div>

      <div className="lbStage">
        <div
          className="quadWrap"
          ref={boxRef}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchMove={move}
          onTouchEnd={end}
          onTouchCancel={end}
        >
          <img src={shot.orig} alt="Original upload" draggable={false} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon
              points={q.map(([x, y]) => `${x * 100},${y * 100}`).join(" ")}
              fill="rgba(201,169,110,.15)"
              stroke="#C9A96E"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {q.map(([x, y], i) => (
            <button
              key={i}
              className={`handle${drag.current === i ? " active" : ""}`}
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
              onMouseDown={(e) => { e.preventDefault(); drag.current = i; }}
              onTouchStart={(e) => { e.preventDefault(); drag.current = i; }}
              aria-label={`Corner ${i + 1}`}
            >
              <span />
            </button>
          ))}
        </div>
      </div>

      <div className="lbFoot">
        <div className="nudger">
          <span>Fine tune</span>
          <div className="pad">
            <button className="mini" onClick={() => nudge(0, -0.004, 0)}>◀</button>
            <button className="mini" onClick={() => nudge(1, 0.004, 0)}>▶</button>
            <button className="mini" onClick={() => nudge(0, 0, -0.004)}>▲</button>
            <button className="mini" onClick={() => nudge(2, 0, 0.004)}>▼</button>
          </div>
        </div>
        <button className="primary" onClick={() => onChange(q)}>
          Straighten to these corners
        </button>
      </div>
    </div>
  );
}


/* ---------------------- Google Address Validation -------------------------- */

/* Calls YOUR server route, never Google directly — the key must not reach the
   browser. See validate-address-route.ts for the Next.js handler. */
async function checkAddress(endpoint, addr) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(addr),
  });
  if (!res.ok) throw new Error(`address check failed (${res.status})`);
  const data = await res.json();

  const result = data.result || data;
  const verdict = result.verdict || {};
  const usps = result.uspsData || {};
  const std = usps.standardizedAddress || {};
  const dpv = usps.dpvConfirmation || "";

  const fixed = std.firstAddressLine
    ? {
        street: std.firstAddressLine,
        unit: std.secondAddressLine || "",
        city: std.city || "",
        state: std.state || "",
        zip: std.zipCode
          ? std.zipCodeExtension
            ? `${std.zipCode}-${std.zipCodeExtension}`
            : std.zipCode
          : "",
      }
    : null;

  // DPV: Y delivers, D/S means the apartment is missing or wrong, N means it isn't real
  let tone = "warn";
  let msg = "Address could not be confirmed";
  if (dpv === "Y") {
    tone = "good";
    msg = verdict.hasReplacedComponents || verdict.hasInferredComponents
      ? "USPS confirmed — with corrections"
      : "USPS confirmed";
  } else if (dpv === "D" || dpv === "S") {
    tone = "warn";
    msg = dpv === "D" ? "Building confirmed — apartment number missing" : "Apartment number not recognised";
  } else if (dpv === "N") {
    tone = "bad";
    msg = "USPS does not recognise this address";
  } else if (verdict.addressComplete) {
    tone = "good";
    msg = "Address looks complete";
  }

  return {
    tone,
    msg,
    dpv,
    fixed,
    formatted: result.address?.formattedAddress || "",
    unconfirmed: !!verdict.hasUnconfirmedComponents,
  };
}

/* ------------------------- compact embeddable widget ------------------------ */

const PRIMARY = [
  { k: "lastName", l: "Last name", w: 6 },
  { k: "firstName", l: "First name", w: 6 },
  { k: "dob", l: "Date of birth", w: 6 },
  { k: "dlNumber", l: "Licence no.", w: 6, mono: true },
  { k: "expirationDate", l: "Expires", w: 6 },
  { k: "jurisdiction", l: "State", w: 6 },
  { k: "street", l: "Street", w: 8 },
  { k: "unit", l: "Apt", w: 4 },
  { k: "city", l: "City", w: 5 },
  { k: "state", l: "ST", w: 3 },
  { k: "zip", l: "ZIP", w: 4 },
];
const MORE = GROUPS.flatMap((g) => g.fields).filter(
  (f) => !PRIMARY.some((p) => p.k === f.k)
);

/**
 * Drop-in ID capture for a job / customer form.
 *   <IdCapture onChange={(record) => setForm({ ...form, ...record })} />
 * Emits the full record (plus age, score and validity) on every change.
 */
export default function IdCapture({
  onChange,
  title = "Customer ID",
  addressEndpoint = "/api/validate-address",
}) {
  const [shots, setShots] = useState([]);
  const [fields, setFields] = useState(BLANK);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [live, setLive] = useState([]);
  const [uncertain, setUncertain] = useState([]);
  const [dlCheck, setDlCheck] = useState({ state: "idle", second: "" });
  const [reveal, setReveal] = useState({});
  const [toasts, setToasts] = useState([]);
  const [editing, setEditing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [more, setMore] = useState(false);
  const [addrRaw, setAddrRaw] = useState(null);
  const [addrCheck, setAddrCheck] = useState(null);

  const revealQ = useRef([]);
  const fieldsRef = useRef(BLANK);
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const toastId = useRef(0);
  const warned = useRef("");
  const issueKey = useRef("");
  const autoKey = useRef("");

  fieldsRef.current = fields;

  const front = shots[0];
  const hasData = status === "done";
  const age = ageFrom(fields.dob);
  const expDays = daysUntil(fields.expirationDate);
  const issues = useMemo(() => (hasData ? validate(fields) : []), [fields, hasData]);
  const badKeys = useMemo(() => new Set(issues.map((i) => i.k)), [issues]);
  const scores = useMemo(
    () => (hasData ? scoreCapture({ fields, uncertain, issues, dlCheck, fromBarcode: false, shots }) : []),
    [fields, uncertain, issues, dlCheck, shots, hasData]
  );
  const overall = overallScore(scores);

  /* ---------- report upward ---------- */
  useEffect(() => {
    if (!hasData || !onChange) return;
    onChange({
      ...fields,
      age,
      captureScore: overall,
      licenceValid: expDays !== null && expDays >= 0,
      checksPassed: issues.length === 0,
      addressVerified: addrCheck?.dpv === "Y",
      addressStatus: addrCheck?.dpv || "",
      addressFormatted: addrCheck?.formatted || "",
      capturedAt: new Date().toISOString(),
    });
  }, [fields, hasData, overall, expDays, issues.length, addrCheck]);

  const addrKey = useRef("");
  useEffect(() => {
    if (!hasData || !addressEndpoint) return;
    const { street, city, state, zip } = fields;
    if (!street || !(zip || (city && state))) return;
    const key = [street, fields.unit, city, state, zip].join("|");
    if (addrKey.current === key) return;
    addrKey.current = key;
    setAddrCheck({ tone: "", msg: "Checking address…" });
    checkAddress(addressEndpoint, { street, unit: fields.unit, city, state, zip })
      .then((r) => {
        setAddrCheck(r);
        if (r.tone === "bad") toast("bad", `Address — ${r.msg}`, 12000);
      })
      .catch(() => setAddrCheck(null));
  }, [hasData, fields.street, fields.unit, fields.city, fields.state, fields.zip]);

  /* ---------- toasts ---------- */
  function toast(tone, text, ttl = 9000) {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  }
  useEffect(() => {
    if (!hasData || expDays === null) return;
    if (warned.current === fields.expirationDate) return;
    warned.current = fields.expirationDate;
    if (expDays < 0) toast("bad", `Licence EXPIRED — ${fields.expirationDate}`, 13000);
    else if (expDays <= 180) toast("warn", `Expires within 180 days — ${fields.expirationDate}`, 11000);
  }, [hasData, expDays, fields.expirationDate]);
  useEffect(() => {
    if (!hasData) return;
    const key = issues.map((i) => i.k + i.msg).join("|");
    if (issueKey.current === key) return;
    issueKey.current = key;
    if (issues.length)
      toast("bad", `${issues.length > 1 ? issues.length + " checks failed · " : "Check failed · "}${LABELS[issues[0].k]} — ${issues[0].msg}`, 13000);
  }, [hasData, issues]);

  /* ---------- typewriter ---------- */
  useEffect(() => {
    if (!Object.keys(reveal).length) return;
    const id = setInterval(() => {
      const k = revealQ.current[0];
      if (!k) { clearInterval(id); return; }
      const full = String(fieldsRef.current[k] || "");
      setReveal((r) => {
        const at = r[k] ?? 0;
        if (at >= full.length) {
          revealQ.current = revealQ.current.slice(1);
          const { [k]: _d, ...rest } = r;
          return rest;
        }
        return { ...r, [k]: at + (full.length > 12 ? 2 : 1) };
      });
    }, 24);
    return () => clearInterval(id);
  }, [reveal]);

  /* ---------- capture ---------- */
  async function ingest(url, type) {
    setError("");
    const DEF = [[0.08, 0.2], [0.92, 0.2], [0.92, 0.8], [0.08, 0.8]];
    setShots([{ side: "Front", orig: url, origType: type, url, data: url.split(",")[1], mediaType: type, quad: DEF, spin: 0, found: false, working: true, q: null }]);
    let quad = DEF, found = false, others = 0;
    try {
      const res = await detectQuad(url);
      if (res) { quad = res.quad; others = res.others; found = true; }
    } catch (_) {}
    let spin = 0, portrait = false;
    let flat = await warpCard(url, quad, 0);
    if (flat && found) {
      try {
        if ((await textAxis(flat)) === "vertical") { portrait = true; spin = 1; flat = await warpCard(url, quad, 1); }
        if (await looksUpsideDown(flat, portrait)) { spin = (spin + 2) % 4; flat = await warpCard(url, quad, spin); }
      } catch (_) {}
    }
    let qm = null;
    try { qm = await quality(flat || url); } catch (_) {}
    if (!qm && flat) { try { qm = await quality(url); } catch (_) {} }
    setShots((prev) => prev.map((s) => ({
      ...s, quad, spin, found, others, working: false, q: qm,
      url: flat || s.orig, data: (flat || s.orig).split(",")[1],
      mediaType: flat ? "image/jpeg" : s.origType, flat: flat || null,
    })));
  }

  async function reflow(quad, spin) {
    const shot = shots[0];
    if (!shot) return;
    setShots((p) => p.map((s) => ({ ...s, quad, spin, working: true })));
    const flat = await warpCard(shot.orig, quad, spin);
    let qm = null;
    try { qm = await quality(flat || shot.orig); } catch (_) {}
    setShots((p) => p.map((s) => ({
      ...s, working: false, flat: flat || null, url: flat || s.orig, q: qm,
      data: (flat || s.orig).split(",")[1], mediaType: flat ? "image/jpeg" : s.origType,
    })));
  }

  async function pick(e, mode) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!OK_TYPES.includes(file.type)) { setError("Use a JPG, PNG or WEBP photo."); return; }
    await ingest(await readFile(file), file.type);
  }

  /* ---------- read ---------- */
  useEffect(() => {
    if (!front || front.working || status === "reading") return;
    const key = `${(front.data || "").length}:${front.spin}`;
    if (autoKey.current === key) return;
    autoKey.current = key;
    readLicence();
  }, [shots, status]);

  async function verifyDl(expected) {
    const shot = shots[0];
    if (!shot || !expected) return;
    setDlCheck({ state: "checking", second: "" });
    try {
      const res = await fetch("/api/read-licence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: shot.mediaType, data: shot.data } },
            { type: "text", text: 'Read ONLY the driver licence number from this card, character by character, exactly as printed. Ignore every other field and any other document. Reply with JSON and nothing else: {"dlNumber": "..."}' },
          ] }],
        }),
      });
      const data = await res.json();
      const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
      const second = (JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).dlNumber || "").trim();
      const norm = (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!second) return setDlCheck({ state: "idle", second: "" });
      setDlCheck(norm(second) === norm(expected) ? { state: "match", second } : { state: "conflict", second });
    } catch (_) { setDlCheck({ state: "idle", second: "" }); }
  }

  async function readLicence() {
    if (!shots.length) return;
    setStatus("reading");
    setError("");
    setFields(BLANK);
    setLive([]);
    setUncertain([]);
    setReveal({});
    revealQ.current = [];
    setDlCheck({ state: "idle", second: "" });

    const content = [];
    shots.forEach((s) => {
      content.push({ type: "text", text: `${s.side} of the document:` });
      content.push({ type: "image", source: { type: "base64", media_type: s.mediaType, data: s.data } });
    });
    content.push({ type: "text", text: PROMPT });

    const finish = (text) => {
      const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const clean = { ...BLANK };
      KEYS.forEach((k) => {
        if (typeof parsed[k] === "string") clean[k] = scrub(parsed[k].trim());
        else if (typeof parsed[k] === "number") clean[k] = String(parsed[k]);
      });
      if (KEYS.every((k) => !clean[k])) {
        setStatus("error");
        setError("Nothing readable. Try a flat, well-lit shot with no glare.");
        return;
      }
      setUncertain(Array.isArray(parsed._uncertain) ? parsed._uncertain.filter((k) => KEYS.includes(k) && !OPTIONAL.includes(k)) : []);
      setAddrRaw({ street: clean.street, unit: clean.unit, city: clean.city });
      const n = normalizeAddress(clean.street, clean.unit, clean.city);
      setFields({ ...clean, street: n.street, unit: n.unit, city: n.city });
      setStatus("done");
      if (clean.dlNumber) verifyDl(clean.dlNumber);
    };

    const seen = new Set();
    const drain = (acc) => {
      const re = /"([A-Za-z]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
      let m;
      while ((m = re.exec(acc))) {
        const k = m[1];
        if (seen.has(k) || !KEYS.includes(k)) continue;
        seen.add(k);
        let v = "";
        try { v = JSON.parse(`"${m[2]}"`); } catch (_) { v = m[2]; }
        const val = scrub(v.trim());
        setFields((f) => ({ ...f, [k]: val }));
        if (val) {
          revealQ.current = [...revealQ.current, k];
          setReveal((r) => ({ ...r, [k]: 0 }));
        }
        setLive((l) => [...l, { k, hit: !!val }]);
      }
    };

    try {
      const res = await fetch("/api/read-licence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, stream: true, messages: [{ role: "user", content }] }),
      });
      // Config errors (no API key / not authorized) aren't a bad photo — surface the real reason
      // instead of blaming the image, and don't bother with the non-streaming retry.
      if (res.status === 503 || res.status === 403) {
        const j = await res.json().catch(() => ({}));
        setStatus("error");
        setError(j.error || "The ID reader isn't configured yet.");
        return;
      }
      if (!res.body || !res.ok) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload);
            if (ev.type === "content_block_delta" && ev.delta?.text) { acc += ev.delta.text; drain(acc); }
          } catch (_) {}
        }
      }
      finish(acc);
    } catch (err) {
      try {
        const res = await fetch("/api/read-licence", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content }] }),
        });
        const data = await res.json();
        finish((data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n"));
      } catch (_) {
        setStatus("error");
        setError("The read failed. Check the photo and try again.");
      }
    }
  }

  function set(k, v) {
    if (reveal[k] !== undefined) {
      revealQ.current = revealQ.current.filter((x) => x !== k);
      setReveal((r) => { const { [k]: _d, ...rest } = r; return rest; });
    }
    setFields((f) => ({ ...f, [k]: v }));
  }

  function clearAll() {
    setShots([]); setFields(BLANK); setStatus("idle"); setError("");
    setLive([]); setUncertain([]); setReveal({}); revealQ.current = [];
    setDlCheck({ state: "idle", second: "" }); setAddrRaw(null);
    setAddrCheck(null);
    autoKey.current = ""; warned.current = ""; issueKey.current = ""; addrKey.current = "";
  }

  function copyRecord() {
    navigator.clipboard?.writeText(JSON.stringify({ ...fields, age, captureScore: overall }, null, 2));
    toast("good", "Record copied", 3000);
  }

  const total = KEYS.length - OPTIONAL.length;
  const got = live.filter((x) => x.hit && !OPTIONAL.includes(x.k)).length;

  const renderField = (f) => {
    const empty = !String(fields[f.k] || "").trim();
    const opt = OPTIONAL.includes(f.k);
    const bad = badKeys.has(f.k);
    const doubt = uncertain.includes(f.k);
    const typing = reveal[f.k] !== undefined;
    const shown = typing ? String(fields[f.k] || "").slice(0, reveal[f.k]) : fields[f.k];
    const cls = bad ? "bad" : doubt ? "doubt" : typing ? "live" : hasData && empty && !opt ? "gap" : "";
    return (
      <label key={f.k} className={`c-f w${f.w}${bad ? " err" : ""}`}>
        <span>
          {f.l}
          {bad && <b className="c-dot bad">!</b>}
          {!bad && doubt && <b className="c-dot doubt">?</b>}
        </span>
        <input
          value={shown}
          onChange={(e) => set(f.k, e.target.value)}
          className={`${f.mono ? "mono " : ""}${cls}`}
        />
      </label>
    );
  };

  return (
    <div className="idc">
      <style>{CSS}</style>

      <div className="c-head">
        <span className="c-title">{title}</span>
        <div className="c-chips">
          {dlCheck.state === "match" && <i className="c-chip good">verified</i>}
          {dlCheck.state === "conflict" && <i className="c-chip bad">check no.</i>}
          {expDays !== null && expDays < 0 && <i className="c-chip bad">expired</i>}
          {expDays !== null && expDays >= 0 && expDays <= 180 && <i className="c-chip warn">{expDays}d left</i>}
          {addrCheck?.dpv === "Y" && <i className="c-chip good">addr ✓</i>}
          {addrCheck && addrCheck.dpv && addrCheck.dpv !== "Y" && (
            <i className={`c-chip ${addrCheck.tone}`}>addr {addrCheck.dpv}</i>
          )}
          {hasData && (
            <i className={`c-chip ${overall >= 85 ? "good" : overall >= 60 ? "warn" : "bad"}`}>{overall}%</i>
          )}
        </div>
      </div>

      <div className="c-capture">
        <button
          className={`c-thumb${front ? " filled" : ""}`}
          onClick={() => (front ? setViewing(true) : camRef.current?.click())}
        >
          {front ? <img src={front.url} alt="Licence" /> : <span>ID</span>}
          {status === "reading" && front && <i className="c-sweep" />}
        </button>

        <div className="c-acts">
          <button className="c-btn gold" onClick={() => setScanning(true)}>
            {front ? "Retake" : "Scan ID"}
          </button>
          <button className="c-btn" onClick={() => fileRef.current?.click()}>Upload</button>
          {front && <button className="c-btn" onClick={() => setEditing(true)}>Crop</button>}
          {front && <button className="c-btn" onClick={() => reflow(front.quad, front.spin + 1)}>Rotate</button>}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      <input ref={camRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={pick} />

      {status === "reading" && (
        <div className="c-load">
          <div className={`c-bar${got ? "" : " idle"}`}>
            <i style={got ? { width: `${Math.round((got / total) * 100)}%` } : undefined} />
          </div>
          <span>{got ? `Reading · ${got}/${total}` : "Looking at the card"}</span>
        </div>
      )}

      {front && !front.working && !front.found && status !== "reading" && (
        <p className="c-warn">Card edges weren't found — check the crop.</p>
      )}
      {front && !front.working && qualityNote(front.q)?.tone === "bad" && (
        <p className="c-warn">{qualityNote(front.q).msg}</p>
      )}
      {error && <p className="c-err">{error}</p>}
      {status === "error" && front && (
        <div className="c-acts">
          <button className="c-btn" onClick={() => setScanning(true)}>Retake</button>
          <button className="c-btn" onClick={() => setEditing(true)}>Edit crop</button>
          <button className="c-btn" onClick={() => fileRef.current?.click()}>Upload</button>
        </div>
      )}

      {(hasData || status === "reading") && (
        <>
          <div className="c-grid">{PRIMARY.map(renderField)}</div>

          {addrCheck && (
            <div className={`c-addr ${addrCheck.tone}`}>
              <div>
                <b>{addrCheck.msg}</b>
                {addrCheck.formatted && <span>{addrCheck.formatted}</span>}
              </div>
              {addrCheck.fixed && (
                <button
                  className="c-btn"
                  onClick={() => setFields((f) => ({ ...f, ...addrCheck.fixed }))}
                >
                  Use USPS
                </button>
              )}
            </div>
          )}

          {dlCheck.state === "conflict" && (
            <div className="c-conflict">
              <em>Two reads disagree</em>
              <div>
                <code>{fields.dlNumber}</code>
                <button className="c-btn" onClick={() => setDlCheck({ state: "match", second: "" })}>Keep</button>
              </div>
              <div>
                <code>{dlCheck.second}</code>
                <button className="c-btn" onClick={() => { set("dlNumber", dlCheck.second); setDlCheck({ state: "match", second: "" }); }}>Use</button>
              </div>
            </div>
          )}

          {issues.length > 0 && (
            <ul className="c-issues">
              {issues.map((i, n) => (<li key={n}><b>{LABELS[i.k]}</b> {i.msg}</li>))}
            </ul>
          )}

          <button className="c-more" onClick={() => setMore((v) => !v)}>
            {more ? "− Fewer fields" : `+ ${MORE.length} more fields`}
            {age !== null && <em>Age {age}</em>}
          </button>
          {more && <div className="c-grid">{MORE.map(renderField)}</div>}

          <div className="c-foot">
            <button className="c-btn gold" onClick={copyRecord}>Copy record</button>
            {addrRaw && (
              <button
                className="c-btn"
                onClick={() => {
                  const n = normalizeAddress(addrRaw.street, addrRaw.unit, addrRaw.city);
                  const tidy = fields.street !== addrRaw.street;
                  setFields((f) => (tidy ? { ...f, ...addrRaw } : { ...f, ...n }));
                }}
              >
                Address style
              </button>
            )}
            <button className="c-btn danger" onClick={clearAll}>Clear</button>
          </div>
        </>
      )}

      {scanning && (
        <LiveCapture
          onClose={() => setScanning(false)}
          onFallback={() => { setScanning(false); camRef.current?.click(); }}
          onShot={(url) => { setScanning(false); ingest(url, "image/jpeg"); }}
        />
      )}
      {editing && front && (
        <QuadEditor
          shot={front}
          onClose={() => setEditing(false)}
          onChange={(quad) => { reflow(quad, front.spin); setEditing(false); }}
        />
      )}
      {viewing && front && (
        <Lightbox shot={front} onClose={() => setViewing(false)} onDownload={(s) => {
          const a = document.createElement("a");
          a.href = s.url;
          a.download = `${[fields.lastName, fields.firstName].filter(Boolean).join("_") || "id"}.jpg`;
          a.click();
        }} />
      )}

      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.tone}`}>
              <span>{t.text}</span>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- styles ---------------------------------- */

const CSS = `
.idc{--ink:#0A0E18;--surface:#151B27;--slate:#2C3347;--gold:#C9A96E;
--gold-dim:rgba(201,169,110,.42);--cream:#FAF8F4;--red:#C2392E;--green:#1E5C3A;--amber:#B98B2E;
max-width:560px;background:var(--cream);color:var(--slate);border:1px solid #E2DDD4;
border-radius:10px;padding:14px;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif;
-webkit-font-smoothing:antialiased}
.idc *{box-sizing:border-box}
.idc button{font-family:inherit;cursor:pointer;border-radius:4px}

.c-head{display:flex;justify-content:space-between;align-items:center;gap:10px;
padding-bottom:10px;border-bottom:1px solid #EDE9E1}
.c-title{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
color:var(--slate);display:flex;align-items:center;gap:8px}
.c-title::before{content:"";width:3px;height:12px;background:var(--gold);border-radius:2px}
.c-chips{display:flex;gap:5px;flex-wrap:wrap}
.c-chip{font-style:normal;font-size:8.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
padding:4px 8px;border-radius:99px}
.c-chip.good{background:var(--green);color:#fff}
.c-chip.warn{background:#F6E9CB;color:#7A5C15}
.c-chip.bad{background:var(--red);color:#fff}

.c-capture{display:flex;align-items:center;gap:11px;margin-top:12px}
.c-thumb{position:relative;flex:none;width:96px;height:61px;padding:0;overflow:hidden;
background:var(--surface);border:1px dashed var(--gold-dim);border-radius:7px;
display:flex;align-items:center;justify-content:center}
.c-thumb.filled{border-style:solid}
.c-thumb img{width:100%;height:100%;object-fit:contain;display:block}
.c-thumb span{font-size:9px;letter-spacing:.18em;color:rgba(250,248,244,.45)}
.c-sweep{position:absolute;left:0;right:0;height:34%;
background:linear-gradient(to bottom,rgba(201,169,110,0),rgba(201,169,110,.35),rgba(201,169,110,0));
border-bottom:1px solid var(--gold);animation:cs 1.4s ease-in-out infinite}
@keyframes cs{0%{top:-34%}100%{top:100%}}

.c-acts{display:flex;flex-wrap:wrap;gap:6px;flex:1}
.c-btn{background:#fff;border:1px solid #D5CFC5;color:var(--slate);padding:9px 11px;
font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;transition:.14s}
.c-btn:hover{border-color:var(--slate);background:var(--slate);color:#fff}
.c-btn.gold{background:var(--gold);border-color:var(--gold);color:var(--ink)}
.c-btn.gold:hover{filter:brightness(1.08);background:var(--gold);color:var(--ink)}
.c-btn.danger{color:var(--red);border-color:rgba(194,57,46,.35)}
.c-btn.danger:hover{background:var(--red);border-color:var(--red);color:#fff}

.c-load{margin-top:11px}
.c-bar{height:6px;background:#EDE9E1;border-radius:99px;overflow:hidden}
.c-bar i{display:block;height:100%;background:var(--gold);border-radius:99px;width:0;
transition:width .4s cubic-bezier(.2,.8,.2,1)}
.c-bar.idle i{width:36%;background:linear-gradient(90deg,rgba(201,169,110,0),var(--gold),rgba(201,169,110,0));
animation:cm 1.15s ease-in-out infinite}
@keyframes cm{0%{margin-left:-36%}100%{margin-left:100%}}
.c-load span{display:block;margin-top:6px;font-size:9px;letter-spacing:.14em;
text-transform:uppercase;color:#8A6A1F}

.c-warn{margin:10px 0 0;font-size:10.5px;line-height:1.45;color:#8A6A1F;
background:#FCF3E2;border-left:2px solid var(--amber);border-radius:4px;padding:7px 9px}
.c-err{margin:10px 0 0;font-size:10.5px;line-height:1.45;color:#8A241B;
background:#FCE9E6;border-left:2px solid var(--red);border-radius:4px;padding:7px 9px}

.c-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:7px;margin-top:12px}
.c-f{display:flex;flex-direction:column;gap:3px;min-width:0}
.c-f span{font-size:8px;letter-spacing:.13em;text-transform:uppercase;color:#7F8798;font-weight:700}
.c-f input{border:1px solid #E2DDD4;background:#fff;color:var(--slate);border-radius:4px;
padding:8px 9px;font-size:13px;font-family:inherit;width:100%;min-width:0;transition:.14s}
.c-f input:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,169,110,.2)}
.c-f input.mono{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:12px}
.c-f input.gap{background:#FCF3E2;border-color:rgba(201,169,110,.5)}
.c-f input.doubt{background:#FCF3E2;border-color:var(--gold);box-shadow:inset 3px 0 0 var(--amber)}
.c-f input.live{border-color:var(--gold);box-shadow:inset 3px 0 0 var(--gold);caret-color:var(--gold)}
.c-f input.bad{background:#FCE9E6;border:1.5px solid var(--red);color:var(--red);font-weight:700;
box-shadow:inset 3px 0 0 var(--red)}
.c-f.err span{color:var(--red)}
.c-dot{display:inline-flex;align-items:center;justify-content:center;width:11px;height:11px;
margin-left:4px;border-radius:50%;font-size:7.5px;font-style:normal;color:#fff;vertical-align:middle}
.c-dot.bad{background:var(--red)}
.c-dot.doubt{background:var(--amber)}
.w3{grid-column:span 3}.w4{grid-column:span 4}.w5{grid-column:span 5}
.w6{grid-column:span 6}.w8{grid-column:span 8}.w12{grid-column:span 12}

.c-conflict{margin-top:11px;border:1px solid rgba(194,57,46,.3);border-left:3px solid var(--red);
border-radius:6px;background:#FCE9E6;padding:10px}
.c-conflict em{display:block;font-style:normal;font-weight:700;font-size:8.5px;letter-spacing:.12em;
text-transform:uppercase;color:#8A241B;margin-bottom:7px}
.c-conflict div{display:flex;justify-content:space-between;align-items:center;gap:9px;margin-bottom:5px}
.c-conflict code{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:12.5px}

.c-issues{list-style:none;margin:11px 0 0;padding:0;border:1px solid rgba(194,57,46,.28);
border-left:3px solid var(--red);border-radius:6px;background:#FCE9E6;overflow:hidden}
.c-issues li{padding:7px 10px;font-size:10.5px;line-height:1.4;color:#8A241B;
border-bottom:1px solid rgba(194,57,46,.13)}
.c-issues li:last-child{border-bottom:0}
.c-issues b{display:block;font-size:8px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:1px}

.c-more{width:100%;margin-top:11px;background:none;border:1px dashed #D5CFC5;color:#6F7688;
padding:9px;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
display:flex;justify-content:space-between;align-items:center}
.c-more:hover{border-color:var(--gold);color:var(--slate)}
.c-more em{font-style:normal;color:var(--gold);letter-spacing:.06em}

.c-foot{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;padding-top:11px;border-top:1px solid #EDE9E1}
.c-foot .c-btn{flex:1}

.c-addr{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;
padding:9px 11px;border-radius:6px;border-left:3px solid #D5CFC5;background:#F5F2EC}
.c-addr b{display:block;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
.c-addr span{display:block;margin-top:3px;font-size:11px;line-height:1.35;color:#6F7688}
.c-addr.good{background:#EAF3EE;border-color:var(--green)}
.c-addr.good b{color:var(--green)}
.c-addr.warn{background:#FCF3E2;border-color:var(--amber)}
.c-addr.warn b{color:#8A6A1F}
.c-addr.bad{background:#FCE9E6;border-color:var(--red)}
.c-addr.bad b{color:#8A241B}
.c-addr .c-btn{flex:none}

.toasts{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:80;
display:flex;flex-direction:column;gap:7px;width:min(440px,calc(100% - 24px))}
.toast{display:flex;align-items:center;gap:11px;padding:12px 14px;border-radius:8px;
box-shadow:0 12px 30px rgba(0,0,0,.35);animation:ct .25s ease-out}
.toast span{flex:1;font-size:11.5px;line-height:1.4;font-weight:600}
.toast button{background:none;border:0;font-size:13px;color:inherit;opacity:.7;padding:2px 4px}
.toast.bad{background:var(--red);color:#fff}
.toast.warn{background:#F6E9CB;color:#6B5210}
.toast.good{background:var(--green);color:#fff}
@keyframes ct{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}

/* overlays reused from the full build */
.sheet{margin-top:12px;border:1px solid var(--gold-dim);border-radius:8px;background:var(--surface);
padding:12px;color:var(--cream)}
.sheetHead{display:flex;justify-content:space-between;align-items:center;gap:10px;
font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-bottom:9px}
.mini{background:rgba(250,248,244,.04);border:1px solid rgba(250,248,244,.16);
color:rgba(250,248,244,.8);padding:9px 11px;font-size:9.5px;letter-spacing:.1em;
text-transform:uppercase;border-radius:3px}
.mini:hover{border-color:var(--gold);color:var(--gold)}
.mini.wide{width:100%;margin-top:7px}
.primary{width:100%;background:var(--gold);color:var(--ink);border:0;padding:13px;
font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;border-radius:4px}
.quadWrap{position:relative;touch-action:none;user-select:none;-webkit-user-select:none;
overscroll-behavior:contain;background:#000;border-radius:6px;overflow:hidden}
.quadWrap img{max-height:66vh;width:auto;max-width:100%;margin:0 auto;display:block}
.quadWrap video{width:100%;display:block}
.quadWrap svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.guide{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.handle{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;padding:0;
background:rgba(201,169,110,.14);border:0;border-radius:50%;display:flex;
align-items:center;justify-content:center;touch-action:none}
.handle span{display:block;width:20px;height:20px;border-radius:50%;
background:rgba(201,169,110,.45);border:2px solid var(--gold)}
.handle.active span,.handle:active span{background:var(--gold);transform:scale(1.15)}
.lb{position:fixed;inset:0;z-index:60;background:rgba(10,14,24,.97);backdrop-filter:blur(6px);
display:flex;flex-direction:column;color:var(--cream)}
.lbBar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;
padding:13px 16px;border-bottom:1px solid var(--gold-dim);font-size:9.5px;
letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
.lbBtns{display:flex;gap:6px;flex-wrap:wrap}
.lbStage{flex:1;overflow:hidden;display:flex;align-items:center;justify-content:center;
padding:10px;touch-action:none}
.lbStage img{max-width:96%;max-height:100%;transform-origin:center;transition:transform .08s linear}
.lbFoot{padding:12px 16px;border-top:1px solid var(--gold-dim)}
.lbFoot .primary{margin-top:10px}
.nudger{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.nudger span{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:rgba(250,248,244,.5)}
.pad{display:flex;gap:6px}
.lbHint{margin:0;padding:9px 16px;text-align:center;font-size:9.5px;color:rgba(250,248,244,.38)}

@media (max-width:520px){
.w3,.w4,.w5{grid-column:span 6}.w8{grid-column:span 12}
.c-capture{flex-direction:column;align-items:stretch}
.c-thumb{width:100%;height:auto;aspect-ratio:1.585}
}
@media (prefers-reduced-motion:reduce){
.c-sweep,.c-bar.idle i,.toast{animation:none}.c-bar i{transition:none}
}
`;

"use client";
import { parseSurveyFloors, surveyScene, surveyDevices, surveyCounts } from "./survey2-model.js";
import { northArrowAngle } from "./site-transform.js";

// Rasterize the Site Survey (the "survey2" planner) into one PNG per floor for the proposal PDF —
// the SAME floors, backgrounds and devices the planner shows, projected through the same geometry
// (device x/y are percent of the background image; lib/survey2-model.js). Every device kind renders:
// group-coloured marker with its code (C1, S1, …), the device name beside it while the plan is not
// dense, and a coverage cone only for cone kinds that were actually aimed (cameras, motion sensors).
// Returns [{ name, img, devices, counts }] — devices feed the legend / schedule in the PDF; counts
// carry canonical vs rendered so the caller can refuse to ship a silently incomplete survey.
// Always resolves — a bad/oversized floor is skipped, so the PDF download never fails because of it.
export function exportSurvey2Images(surveyData, { maxWidth = 1600 } = {}) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !surveyData) return resolve([]);
    const floors = parseSurveyFloors(surveyData);
    if (!floors.length) return resolve([]);
    const all = surveyDevices(floors);

    const loadImg = (src) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });

    Promise.all(floors.map(async (f, fi) => {
      const im = await loadImg(f.bg);
      if (!im || !im.naturalWidth) return null;
      const scale = Math.min(1, maxWidth / im.naturalWidth);
      const W = Math.max(1, Math.round(im.naturalWidth * scale));
      const H = Math.max(1, Math.round(im.naturalHeight * scale));
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      if (!ctx) return null;
      // Layer 1 — background (rotation is baked in; zoom/pan are view-only, so this is the whole plan).
      ctx.drawImage(im, 0, 0, W, H);
      // Layer 1b — scaled grid: a ctx-framed plan SVG is drawn gridless (the planner overlays its grid), so the
      // customer PDF would lose the "1 box = N ft" scale cue. Re-draw the SAME grid here. Skipped for a plain
      // hand-drawn plan (it keeps its own baked grid — avoid doubling) and for raster/aerial backgrounds.
      drawExportGrid(ctx, f.bg, (f.scale && f.scale.ftW > 0) ? f.scale.ftW : 0, W, H);
      // Real scale (when the floor was traced/captured): the plan image is f.scale.ftW feet wide, drawn W px wide.
      const pxPerFt = (f.scale && f.scale.ftW > 0) ? W / f.scale.ftW : 0;
      const scene = surveyScene(floors, fi, W, H, { pxPerFt });
      // Layer 2a — speaker coverage: a light-blue see-through radius circle (drawn under the markers).
      (scene.rings || []).forEach((g) => {
        ctx.beginPath(); ctx.arc(g.px, g.py, g.R, 0, Math.PI * 2);
        ctx.fillStyle = g.fill; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = g.stroke; ctx.stroke();
      });
      // Layer 2 — coverage cones (aimed cone kinds only; a speaker never gets a fake camera cone).
      scene.cones.forEach((c) => {
        const a0 = (c.aim - c.fov / 2) * Math.PI / 180, a1 = (c.aim + c.fov / 2) * Math.PI / 180;
        ctx.beginPath();
        if (c.fov >= 359) ctx.arc(c.px, c.py, c.R, 0, Math.PI * 2);
        else { ctx.moveTo(c.px, c.py); ctx.arc(c.px, c.py, c.R, a0, a1); ctx.closePath(); }
        ctx.fillStyle = hexA(c.color, 0.22); ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = hexA(c.color, 0.6); ctx.stroke();
      });
      // Layer 3 — markers with their code; Layer 4 — name tags while the plan is readable.
      const r = scene.r;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      scene.markers.forEach((d) => {
        ctx.beginPath(); ctx.arc(d.px, d.py, r, 0, Math.PI * 2);
        ctx.fillStyle = d.color; ctx.fill();
        ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.strokeStyle = "#fff"; ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = `800 ${Math.round(r * (d.code.length > 2 ? 0.72 : 0.9))}px system-ui, "Segoe UI", sans-serif`;
        ctx.fillText(d.code, d.px, d.py + 0.5);
        if (scene.showNames && d.label) {
          ctx.font = `700 ${Math.round(r * 0.85)}px system-ui, "Segoe UI", sans-serif`;
          const tw = ctx.measureText(d.label).width, ph = Math.round(r * 1.1), pw = tw + r * 0.9;
          const tx = Math.min(W - pw - 2, d.px + r + 4), ty = d.py - ph / 2;
          ctx.fillStyle = "rgba(16,20,24,.86)";
          roundRect(ctx, tx, ty, pw, ph, 4); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.textAlign = "left";
          ctx.fillText(d.label, tx + r * 0.45, d.py + 0.5);
          ctx.textAlign = "center";
        }
      });
      // Layer 5 — north indicator (top-right), only when the floor's capture transform knows north.
      if (f.aerial && Number.isFinite(f.aerial.northDeg)) {
        const nr = Math.max(14, Math.round(Math.min(W, H) * 0.028));
        const nx = W - nr * 1.3, ny = nr * 1.3;
        ctx.save();
        ctx.translate(nx, ny);
        ctx.rotate(northArrowAngle(f.aerial.northDeg) * Math.PI / 180);
        ctx.beginPath(); ctx.arc(0, 0, nr, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(16,20,24,.86)"; ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();                       // arrow pointing up: triangle tip + short shaft
        ctx.moveTo(0, -nr * 0.45); ctx.lineTo(nr * 0.2, -nr * 0.02); ctx.lineTo(nr * 0.07, -nr * 0.02);
        ctx.lineTo(nr * 0.07, nr * 0.6); ctx.lineTo(-nr * 0.07, nr * 0.6); ctx.lineTo(-nr * 0.07, -nr * 0.02);
        ctx.lineTo(-nr * 0.2, -nr * 0.02); ctx.closePath(); ctx.fill();
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = `800 ${Math.round(nr * 0.9)}px system-ui, "Segoe UI", sans-serif`;
        ctx.fillText("N", 0, -nr * 0.72);
        ctx.restore();
      }
      let img;
      try { img = cv.toDataURL("image/png"); } catch { return null; }
      const devices = all.filter((d) => d.floor === fi && !d.annotation).map((d) => ({ code: d.code, label: d.label, kind: d.kindName, group: d.group }));
      return { name: f.name, img, devices, counts: { canonical: floors[fi].devices.length, rendered: scene.count } };
    })).then((out) => {
      const done = out.filter(Boolean);
      // Validation: what we drew must be what the planner holds. Never ship a background-only page quietly.
      const canonical = Object.values(surveyCounts(floors)).reduce((s, n) => s + n, 0);
      const rendered = done.reduce((s, f) => s + f.devices.length, 0);
      if (done.length === floors.length && rendered !== canonical) console.error(`[survey export] planner devices ${canonical} ≠ rendered ${rendered}`);
      resolve(done);
    });
  });
}

// The ctx-framed plan's grid, re-drawn on the export canvas so the customer PDF keeps the "1 box = N ft" scale cue.
// Only for an inline SVG plan that has a viewBox + known scale AND no baked grid pattern (ctx plans are gridless;
// hand-drawn plans bake their own grid — drawing here would double it). One grid box = FULL (26) plan-px.
function drawExportGrid(ctx, bg, ftW, W, H) {
  try {
    if (!(ftW > 0) || typeof bg !== "string" || bg.indexOf("data:image/svg") !== 0) return;
    const i = bg.indexOf(","); if (i < 0) return;
    const svg = /;base64/.test(bg.slice(0, i)) ? atob(bg.slice(i + 1)) : decodeURIComponent(bg.slice(i + 1));
    if (/<pattern[^>]*id="pg"/.test(svg)) return;   // a baked grid is already present → don't double it
    const m = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg);
    if (!m) return;
    const FULL = 26, x0 = +m[1], y0 = +m[2], vw = +m[3], vh = +m[4];
    if (!(vw > 0 && vh > 0)) return;
    const sx = W / vw, sy = H / vh, step = FULL * sx;
    if (!(step >= 6)) return;   // too dense to read → skip
    const offx = (Math.ceil(x0 / FULL) * FULL - x0) * sx, offy = (Math.ceil(y0 / FULL) * FULL - y0) * sy;
    ctx.save();
    ctx.strokeStyle = "rgba(16,20,24,.14)"; ctx.lineWidth = 1;
    for (let x = offx; x <= W; x += step) { ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); ctx.stroke(); }
    for (let y = offy; y <= H; y += FULL * sy) { ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); ctx.stroke(); }
    // "1 box = N ft" chip, bottom-left
    const n = Math.round(FULL * ftW / vw * 10) / 10, txt = "1 box = " + n + " ft";
    ctx.font = `600 ${Math.max(10, Math.round(Math.min(W, H) * 0.024))}px system-ui, "Segoe UI", sans-serif`;
    const pad = 6, tw = ctx.measureText(txt).width, bh = Math.max(16, Math.round(Math.min(W, H) * 0.04));
    ctx.fillStyle = "rgba(16,20,24,.72)"; roundRect(ctx, 8, H - bh - 8, tw + pad * 2, bh, 4); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(txt, 8 + pad, H - bh / 2 - 8);
    ctx.restore();
  } catch (e) { /* export grid is cosmetic — never break the PDF over it */ }
}

function hexA(hex, a) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(176,143,79,${a})`;
}
function roundRect(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y); ctx.lineTo(x + w - rad, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad); ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad); ctx.quadraticCurveTo(x, y, x + rad, y); ctx.closePath();
}

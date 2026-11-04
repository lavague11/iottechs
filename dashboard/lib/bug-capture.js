// Canonical bug-report capture service. DOM capture is the cross-browser default (works on iOS/Android
// where getDisplayMedia doesn't exist, needs no screen-share permission, and never captures browser or
// OS chrome). It renders the CURRENT VISIBLE VIEWPORT of our own app into a PNG, excluding any element
// tagged [data-bug-capture-ignore] (the Report UI, the FAB) via html2canvas's clone — so the live page
// is never hidden, blurred, or flashed. html2canvas is dynamically imported the first time it's needed,
// keeping it out of the initial bundle.

let _h2c = null;
// html2canvas-pro: a maintained drop-in fork that understands modern CSS color values. Browsers now
// serialize color-mix() to the color(srgb …) function and keep oklch()/oklab() as-is; the original
// html2canvas 1.4.1 throws "unsupported color function" on those and aborts the WHOLE capture, so any
// page using color-mix (the project deck, install checklist, proposal cards) couldn't be screenshotted.
async function loadH2C() {
  if (!_h2c) _h2c = (await import("html2canvas-pro")).default;
  return _h2c;
}

// Kick off the html2canvas download without capturing (call when the Report modal opens).
export function prewarm() { loadH2C().catch(() => {}); }

// True where the browser can screen-share (desktop Chromium/Firefox). Optional enhancement only.
export function canNativeCapture() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
}

// iOS shows/hides a software keyboard that resizes the visual viewport; blur the field and let the
// viewport settle deterministically (poll until height stops changing) instead of a blind timeout.
async function settleViewport() {
  try { const a = document.activeElement; if (a && typeof a.blur === "function") a.blur(); } catch { /* noop */ }
  const vv = window.visualViewport;
  if (!vv) { await new Promise((r) => setTimeout(r, 60)); return; }
  let last = vv.height, stable = 0;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 45));
    if (Math.abs(vv.height - last) < 1) { if (++stable >= 2) break; } else stable = 0;
    last = vv.height;
  }
}

// html2canvas (1.4.x) renders <iframe> content as a blank box, so our embedded tools — the Site Survey
// floor plan, the camera mockup — come out empty in a bug shot. Fix: pre-render each same-origin, on-screen
// iframe on its own (html2canvas CAN render an iframe's own document), then swap the blank iframe in the
// main capture's clone for an <img> of that snapshot. Cross-origin frames throw on contentDocument → skipped.
async function snapshotIframes(h2c, vw, vh, scale) {
  const shots = [];
  let idx = 0;
  for (const f of Array.from(document.querySelectorAll("iframe"))) {
    try {
      if (f.closest("[data-bug-capture-ignore]")) continue;
      const doc = f.contentDocument;                          // throws for cross-origin
      if (!doc || !doc.documentElement) continue;
      const r = f.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      if (w < 2 || h < 2) continue;
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;   // off-screen → don't bother
      const token = "bc-frame-" + (idx++);
      f.setAttribute("data-bugcap-frame", token);
      const cv = await h2c(doc.documentElement, {
        backgroundColor: null, scale, useCORS: true, logging: false,
        width: w, height: h, windowWidth: w, windowHeight: h, scrollX: 0, scrollY: 0,
      });
      shots.push({ token, dataUrl: cv.toDataURL("image/png"), w, h });
    } catch { /* cross-origin or render failure → leave that frame blank (prior behavior) */ }
  }
  return shots;
}

// The app shell (hub/portal, deck tools) often lives in a position:fixed, internally-scrolled container,
// so document.scrollHeight is only ONE viewport and html2canvas would render just a viewport slice with
// the header scrolled out of it. Find those shells so the capture can be sized to their FULL content and
// they can be un-fixed in the clone, letting everything lay out top-to-bottom (bug #82).
function scrollShells(root, win) {
  const out = [];
  let els; try { els = root.querySelectorAll("div,main,section,article"); } catch { return out; }
  for (const el of els) {
    let cs; try { cs = win.getComputedStyle(el); } catch { continue; }
    const scrolls = /(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflow);
    if ((cs.position === "fixed" || cs.position === "absolute") && scrolls && el.scrollHeight > el.clientHeight + 4) out.push(el);
  }
  return out;
}

// Capture the full page of the app → { dataUrl, width, height, viewport }.
export async function captureViewport() {
  const h2c = await loadH2C();
  await settleViewport();
  try { if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 600))]); } catch { /* fonts optional */ }

  const dpr = window.devicePixelRatio || 1;
  const de = document.documentElement;
  // FULL-PAGE capture — the whole document top-to-bottom, so the header (which project this is) and all
  // content below are always in frame regardless of scroll. (Previously cropped to the scroll offset,
  // which dropped the top header the moment the page was scrolled — bug #82.)
  // Fixed, internally-scrolled shells don't add to document scrollHeight — measure THEM too, and mark them
  // so the clone can un-fix them (markers are stripped from the live DOM in `finally`).
  const shells = scrollShells(document, window);
  shells.forEach((el) => el.setAttribute("data-bugcap-shell", "1"));
  const fullW = Math.max(de.clientWidth || 0, de.scrollWidth || 0, document.body?.scrollWidth || 0, window.innerWidth || 0, ...shells.map((s) => s.scrollWidth || 0));
  const fullH = Math.max(de.scrollHeight || 0, document.body?.scrollHeight || 0, window.innerHeight || 0, ...shells.map((s) => s.scrollHeight || 0));
  // Keep the rendered canvas within browser limits: on a very tall page dial the scale DOWN rather than
  // crashing on an over-large canvas (html2canvas caps out well before an unbounded page would).
  const scale = Math.max(0.5, Math.min(Math.min(dpr, 2), 12000 / Math.max(fullW, fullH, 1)));

  const frameShots = await snapshotIframes(h2c, fullW, fullH, scale);   // render embedded tools before the page capture

  let canvas;
  try {
    canvas = await h2c(document.body, {
      backgroundColor: "#ffffff",
      scale,
      useCORS: true,           // render same-origin + CORS-enabled images; never send credentials
      logging: false,
      width: fullW, height: fullH,   // whole document — no scroll-offset crop
      scrollX: 0, scrollY: 0,
      windowWidth: fullW,
      windowHeight: fullH,
      ignoreElements: (el) => el?.nodeType === 1 && typeof el.hasAttribute === "function" && el.hasAttribute("data-bug-capture-ignore"),
      onclone: (clonedDoc) => {
        // Un-fix the app shell so its FULL content lays out in normal flow and is captured top-to-bottom
        // (header included), instead of a single fixed-viewport slice.
        for (const el of clonedDoc.querySelectorAll("[data-bugcap-shell]")) {
          const s = el.style;
          s.position = "static"; s.inset = "auto"; s.top = s.left = s.right = s.bottom = "auto";
          s.height = "auto"; s.maxHeight = "none"; s.overflow = "visible";
        }
        // Replace each blank iframe clone with its pre-rendered snapshot, in the same layout slot.
        for (const s of frameShots) {
          const node = clonedDoc.querySelector(`[data-bugcap-frame="${s.token}"]`);
          if (!node || !node.parentNode) continue;
          const img = clonedDoc.createElement("img");
          img.src = s.dataUrl;
          img.className = node.className;
          img.setAttribute("style", (node.getAttribute("style") || "") + `;display:block;width:${s.w}px;height:${s.h}px;border:0;object-fit:fill`);
          node.parentNode.replaceChild(img, node);
        }
      },
    });
  } finally {
    // Never leave the marker attributes on the live DOM, capture succeed or fail.
    for (const el of shells) el.removeAttribute("data-bugcap-shell");
    for (const s of frameShots) { const el = document.querySelector(`[data-bugcap-frame="${s.token}"]`); if (el) el.removeAttribute("data-bugcap-frame"); }
  }
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width, height: canvas.height,
    viewport: { w: fullW, h: fullH, dpr, route: location.pathname },
  };
}

// Native screen capture (desktop only). This is the way to capture IFRAME content (the survey/mockup
// tools) and anything DOM capture can't render. It captures the live composited tab, so any bug UI on
// screen would be baked in — `onBeforeGrab` runs after the stream is live but before the frame is
// grabbed, giving the caller a deterministic window to hide the Report UI and let it repaint.
export async function nativeCapture(onBeforeGrab) {
  if (!canNativeCapture()) throw new Error("native capture unavailable");
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, preferCurrentTab: true, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream; video.muted = true; await video.play();
    if (typeof onBeforeGrab === "function") await onBeforeGrab();
    await new Promise((r) => requestAnimationFrame(() => r()));
    await new Promise((r) => setTimeout(r, 100));
    const cv = document.createElement("canvas");
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    cv.getContext("2d").drawImage(video, 0, 0, cv.width, cv.height);
    return { dataUrl: cv.toDataURL("image/png"), width: cv.width, height: cv.height };
  } finally { stream.getTracks().forEach((t) => t.stop()); }
}

// Canonical bug-report capture service. DOM capture is the cross-browser default (works on iOS/Android
// where getDisplayMedia doesn't exist, needs no screen-share permission, and never captures browser or
// OS chrome). It renders the CURRENT VISIBLE VIEWPORT of our own app into a PNG, excluding any element
// tagged [data-bug-capture-ignore] (the Report UI, the FAB) via html2canvas's clone — so the live page
// is never hidden, blurred, or flashed. html2canvas is dynamically imported the first time it's needed,
// keeping it out of the initial bundle.

let _h2c = null;
async function loadH2C() {
  if (!_h2c) _h2c = (await import("html2canvas")).default;
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

// Capture the visible viewport of the app → { dataUrl, width, height, viewport }.
export async function captureViewport() {
  const h2c = await loadH2C();
  await settleViewport();
  try { if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 600))]); } catch { /* fonts optional */ }

  const vv = window.visualViewport;
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(dpr, 2);                 // Retina-sharp, capped so large iOS canvases don't crash
  const vw = Math.round((vv?.width) || document.documentElement.clientWidth || window.innerWidth);
  const vh = Math.round((vv?.height) || window.innerHeight);
  const sx = Math.round((window.scrollX || 0) + (vv?.offsetLeft || 0));
  const sy = Math.round((window.scrollY || 0) + (vv?.offsetTop || 0));

  const canvas = await h2c(document.body, {
    backgroundColor: "#ffffff",
    scale,
    useCORS: true,           // render same-origin + CORS-enabled images; never send credentials
    logging: false,
    x: sx, y: sy,            // crop to the current scroll offset — capture where the user actually is
    width: vw, height: vh,
    scrollX: 0, scrollY: 0,
    windowWidth: document.documentElement.clientWidth,
    windowHeight: window.innerHeight,
    ignoreElements: (el) => el?.nodeType === 1 && typeof el.hasAttribute === "function" && el.hasAttribute("data-bug-capture-ignore"),
  });
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width, height: canvas.height,
    viewport: { w: vw, h: vh, dpr, route: location.pathname },
  };
}

// Optional native screen capture (desktop only). Captures iframes and off-app content, needs a
// screen-share prompt. Kept available for a future "Screen" option; not the default.
export async function nativeCapture() {
  if (!canNativeCapture()) throw new Error("native capture unavailable");
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, preferCurrentTab: true, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream; video.muted = true; await video.play();
    await new Promise((r) => requestAnimationFrame(() => r()));
    await new Promise((r) => setTimeout(r, 120));
    const cv = document.createElement("canvas");
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    cv.getContext("2d").drawImage(video, 0, 0, cv.width, cv.height);
    return { dataUrl: cv.toDataURL("image/png"), width: cv.width, height: cv.height };
  } finally { stream.getTracks().forEach((t) => t.stop()); }
}

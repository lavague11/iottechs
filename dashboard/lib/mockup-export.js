"use client";

// Render the CCTV mockup into one composited image per page (the iPhone frame + its camera grid),
// exactly as the mockup tool draws it, for embedding in the proposal PDF. Same approach as the
// survey export: a hidden off-screen iframe in export mode is handed the mockup snapshot directly
// (never touches this browser's localStorage), renders each page via the tool's own canvas, and
// posts the images back. Always resolves — any error/timeout yields whatever it has (often []).
export function exportMockupImages(accessId, mockupData, { timeout = 12000 } = {}) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !mockupData) return resolve([]);
    let done = false, iframe = null, timer = null;

    function cleanup() {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMsg);
      if (timer) clearTimeout(timer);
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }
    function onMsg(e) {
      const d = e && e.data;
      if (!d || d.project !== accessId) return;
      if (d.type === "iotMockupExportReady" && iframe && iframe.contentWindow) {
        try { iframe.contentWindow.postMessage({ type: "iotMockupLoad", project: accessId, data: mockupData }, "*"); } catch { /* gone */ }
        return;
      }
      if (d.type === "iotMockupImages") {
        const images = (Array.isArray(d.images) ? d.images : []).filter((x) => typeof x === "string" && x.startsWith("data:image"));
        cleanup();
        resolve(images);
      }
    }

    window.addEventListener("message", onMsg);
    iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.style.cssText = "position:fixed;left:-10000px;top:-10000px;width:1900px;height:1000px;border:0;opacity:0;pointer-events:none;";
    iframe.src = `/widgets/cctv-mockup.html?project=${encodeURIComponent(accessId)}&ro=1&export=1`;
    document.body.appendChild(iframe);
    timer = setTimeout(() => { cleanup(); resolve([]); }, timeout);
  });
}

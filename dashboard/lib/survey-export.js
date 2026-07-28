"use client";

// Rasterize a saved site survey into one pinned PNG per floor, for embedding in the proposal PDF.
// We can't reuse the on-page survey iframe (it may be collapsed/unmounted, and its render timing is
// its own), so we spin a hidden off-screen iframe in export mode, hand it the survey JSON directly
// (never touching this browser's localStorage), and collect the composited floor images it posts
// back. Always resolves — on any error or timeout it returns whatever it has (often []), so the
// PDF download never hangs or fails because of the survey.
export function exportSurveyImages(accessId, surveyData, { timeout = 9000 } = {}) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !surveyData) return resolve([]);
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
      // Widget finished loading in export mode → hand it the survey JSON to render.
      if (d.type === "iotSurveyExportReady" && iframe && iframe.contentWindow) {
        try { iframe.contentWindow.postMessage({ type: "iotSurveyLoad", project: accessId, data: surveyData }, "*"); } catch { /* gone */ }
        return;
      }
      // Composited floor images are back.
      if (d.type === "iotSurveyImages") {
        const images = (Array.isArray(d.images) ? d.images : []).filter((x) => x && x.img);
        cleanup();
        resolve(images);
      }
    }

    window.addEventListener("message", onMsg);
    iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.style.cssText = "position:fixed;left:-10000px;top:-10000px;width:1600px;height:1200px;border:0;opacity:0;pointer-events:none;";
    iframe.src = `/widgets/site-survey.html?project=${encodeURIComponent(accessId)}&ro=1&export=1`;
    document.body.appendChild(iframe);
    timer = setTimeout(() => { cleanup(); resolve([]); }, timeout);
  });
}

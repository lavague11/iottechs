"use client";

// Rasterize the current Site Survey (the "survey2" merged tool) into one PNG per floor for the
// proposal PDF — the SAME thing the customer sees in "Your System Layout": each floor background
// with numbered gold camera markers. Canvas-based (no off-screen iframe like the legacy
// survey-export), so it matches the on-screen layout exactly and can't hang on a widget load.
// Returns [{ name, img: dataURL }] to match what proposal-pdf.js expects for surveyImages. Always
// resolves — a bad/oversized floor is skipped, so the PDF download never fails because of the survey.
export function exportSurvey2Images(surveyData, { maxWidth = 1600 } = {}) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !surveyData) return resolve([]);
    let floors;
    try {
      const d = JSON.parse(surveyData);
      // A floor's background is either an inline data: URL (offline fallback) or a small /api/media
      // URL (the normal path — big aerials are uploaded so they don't blow the localStorage quota).
      // Accept BOTH; both are same-origin so the canvas stays untainted for toDataURL.
      floors = (d.floors || [])
        .filter((f) => f && typeof f.bg === "string" && f.bg.length > 0)
        .map((f) => ({ name: f.name || "Floor", bg: f.bg, cams: (f.devices || []).filter((x) => x && x.k === "cam") }));
    } catch { return resolve([]); }
    if (!floors.length) return resolve([]);

    const loadImg = (src) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });

    Promise.all(floors.map(async (f) => {
      const im = await loadImg(f.bg);
      if (!im || !im.naturalWidth) return null;
      const scale = Math.min(1, maxWidth / im.naturalWidth);
      const W = Math.max(1, Math.round(im.naturalWidth * scale));
      const H = Math.max(1, Math.round(im.naturalHeight * scale));
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(im, 0, 0, W, H);
      // Numbered gold camera markers — mirrors .pcv-layout-cam (gold disc, white ring, white number).
      const r = Math.max(11, Math.round(W * 0.014));
      f.cams.forEach((c, i) => {
        const x = (+c.x || 0) / 100 * W;
        const y = (+c.y || 0) / 100 * H;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#b08f4f"; ctx.fill();
        ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.strokeStyle = "#fff"; ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = `800 ${Math.round(r * 1.05)}px system-ui, "Segoe UI", sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), x, y + 0.5);
      });
      let img;
      try { img = cv.toDataURL("image/png"); } catch { return null; }
      return { name: f.name, img };
    })).then((out) => resolve(out.filter(Boolean)));
  });
}

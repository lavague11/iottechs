"use client";
// Downscale + re-encode a data-URL image to a lighter JPEG. The survey/mockup appendix pages are rendered
// at up to 2400px as PNG — a multi-floor proposal becomes a many-MB PDF that's slow to generate, store,
// transfer and render in the signer and the download. A floor plan is an aerial photo with overlays, so
// JPEG at a capped width is far smaller with no meaningful loss at print size. Browser-only (Image +
// canvas); returns the original string unchanged on anything unexpected, so it can never break an export.
export function compactDataUrl(src, { maxW = 2000, maxH = 2600, quality = 0.85 } = {}) {
  return new Promise((resolve) => {
    try {
      if (typeof document === "undefined" || typeof src !== "string" || !src.startsWith("data:image")) return resolve(src);
      const img = new Image();
      img.onload = () => {
        try {
          const nw = img.naturalWidth, nh = img.naturalHeight;
          if (!nw || !nh) return resolve(src);
          const k = Math.min(1, maxW / nw, maxH / nh);
          // Already a small JPEG that doesn't need scaling → leave it alone.
          if (k >= 1 && /^data:image\/jpe?g/i.test(src) && src.length < 500_000) return resolve(src);
          const w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
          const c = document.createElement("canvas"); c.width = w; c.height = h;
          const ctx = c.getContext("2d");
          if (!ctx) return resolve(src);
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);   // JPEG has no alpha — flatten transparency onto white
          ctx.drawImage(img, 0, 0, w, h);
          const out = c.toDataURL("image/jpeg", quality);
          resolve(typeof out === "string" && out.length > 32 && out.length < src.length ? out : src);
        } catch { resolve(src); }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    } catch { resolve(src); }
  });
}

// Compact the whole proposal appendix in place-ish (returns new arrays). surveyImages = [{name,img,…}],
// mockupImages = [dataURL]. Best-effort and parallel; any image that fails compaction keeps its original.
export async function compactAppendix({ surveyImages = [], mockupImages = [] } = {}) {
  const [survey, mockup] = await Promise.all([
    Promise.all(surveyImages.map(async (f) => (f && f.img ? { ...f, img: await compactDataUrl(f.img) } : f))),
    Promise.all(mockupImages.map((s) => compactDataUrl(s))),
  ]);
  return { surveyImages: survey, mockupImages: mockup };
}

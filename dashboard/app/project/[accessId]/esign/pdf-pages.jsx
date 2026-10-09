"use client";
import { useEffect, useRef, useState } from "react";

// Client-only PDF page renderer (pdf.js canvas). Each page is a box sized by the container width at the
// page's own aspect ratio; the canvas fills it and `renderOverlay(pageNumber)` is absolutely positioned
// over it in PERCENT — so fields stay aligned across zoom, resize, mobile rotation and reload with no
// pixel maths. pdf.js reports pages with a top-left origin; the field fractions from the generator use
// the same origin (the server converts to PDF bottom-left only when it flattens).
//
// The bytes are fetched here (not handed to pdf.js by URL) so the client can check them against the
// sha256 the server recorded before showing anything to sign — a mismatch refuses to render.

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    // The legacy build runs on older iOS/Android WebViews (no Promise.withResolvers / modern syntax).
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      return m;
    });
  }
  return pdfjsPromise;
}

async function sha256Hex(buf) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function PdfPages({ url, expectedSha, zoom = 1, renderOverlay, onLoaded, onError }) {
  const hostRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [sizes, setSizes] = useState([]);       // [{ w, h }] at scale 1, per page
  const [width, setWidth] = useState(0);        // container px width — drives re-render on resize/zoom
  const [state, setState] = useState("loading"); // loading | ready | error

  // Load + verify the document once per url.
  useEffect(() => {
    let dead = false, doc = null;
    (async () => {
      try {
        const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) throw new Error("Couldn't load the document.");
        const buf = await res.arrayBuffer();
        if (expectedSha && (await sha256Hex(buf)) !== expectedSha) throw new Error("This document failed its integrity check.");
        const lib = await loadPdfjs();
        doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
        const dims = [];
        for (let i = 1; i <= doc.numPages; i++) { const pg = await doc.getPage(i); const v = pg.getViewport({ scale: 1 }); dims.push({ w: v.width, h: v.height }); }
        if (dead) return;
        setPdf(doc); setSizes(dims); setState("ready"); onLoaded?.({ pages: doc.numPages });
      } catch (e) {
        if (!dead) { setState("error"); onError?.(e?.message || "Couldn't open the document."); }
      }
    })();
    return () => { dead = true; try { doc?.destroy(); } catch {} };
  }, [url, expectedSha]);

  // Track the host width (zoom changes it too).
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    ro.observe(el); setWidth(Math.round(el.clientWidth));
    return () => ro.disconnect();
  }, [state]);

  return (
    <div ref={hostRef} className="esg-pages" style={{ width: `${Math.round(zoom * 100)}%` }}>
      {state === "loading" && <div className="esg-note">Loading…</div>}
      {state === "error" && <div className="esg-note err">Document unavailable</div>}
      {state === "ready" && sizes.map((s, i) => (
        <Page key={i} pdf={pdf} num={i + 1} size={s} width={width}>{renderOverlay?.(i + 1)}</Page>
      ))}
    </div>
  );
}

function Page({ pdf, num, size, width, children }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!pdf || !width) return;
    let task = null, dead = false;
    (async () => {
      const pg = await pdf.getPage(num);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pg.getViewport({ scale: (width / size.w) * dpr });
      const c = canvasRef.current;
      if (!c || dead) return;
      c.width = Math.floor(viewport.width); c.height = Math.floor(viewport.height);
      task = pg.render({ canvasContext: c.getContext("2d"), viewport });
      try { await task.promise; } catch { /* cancelled by a newer render */ }
    })();
    return () => { dead = true; try { task?.cancel(); } catch {} };
  }, [pdf, num, width, size.w]);
  return (
    <div className="esg-page" data-page={num} style={{ aspectRatio: `${size.w} / ${size.h}` }}>
      <canvas ref={canvasRef} className="esg-canvas" />
      {children}
    </div>
  );
}

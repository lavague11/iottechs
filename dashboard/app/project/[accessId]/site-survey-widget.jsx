"use client";
import { useState, useEffect } from "react";
import SignaturePanel from "./signature-panel";
import { seedToolData, startToolAutosync } from "./tool-sync";

// Embeds the full self-contained Site Survey widget (public/widgets/site-survey.html).
// All editing — device placement, FOV cones, drawing tools, shapes, satellite imagery,
// multi-floor, areas/rooms, proposal export — lives in that widget. We pass the project
// id so it auto-saves to localStorage per-project, and ?ro=1 for the read-only customer view.
export default function SiteSurveyWidget({ accessId, view, customerView, customerName, noApproval, onHasData }) {
  const readOnly = view === "customer" || customerView;
  const [floorCount, setFloorCount] = useState(null);
  const [items, setItems] = useState([]);
  const [fs, setFs] = useState(false);
  const [zoomImg, setZoomImg] = useState(null);
  const [zoomed, setZoomed] = useState(false);
  const [capture, setCapture] = useState(false);   // satellite→floor→placements pipeline overlay (staff)
  const [reloadKey, setReloadKey] = useState(0);    // bump to remount the editor after a capture writes new state

  const src = `/widgets/site-survey.html?embed=1&project=${encodeURIComponent(accessId)}${readOnly ? "&ro=1" : ""}`;

  // The iframe reads its data from localStorage on load — seed the server backup FIRST (only
  // when this browser has no local draft), then render the iframe and keep the server in sync.
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    let stop = null, live = true;
    // A real customer (view === "customer") is a pure viewer: always pull the office's latest so
    // survey edits — device names, added cameras — reach them even on a return visit. Staff
    // previewing the customer view (customerView via previewRole, but view still "admin") keep
    // their own working draft, so don't force there.
    const viewerRefresh = view === "customer";
    (async () => {
      await seedToolData(accessId, "survey", `iottechs_sitesurvey_v2_${accessId}`, { force: viewerRefresh });
      if (!live) return;
      setSynced(true);
      stop = startToolAutosync(accessId, "survey", `iottechs_sitesurvey_v2_${accessId}`);
    })();
    return () => { live = false; if (stop) stop(); };
  }, [accessId]);

  useEffect(() => {
    function onMsg(e) {
      if (!e.data || e.data.project !== accessId) return;
      if (e.data.type === "iotSurvey") {
        setFloorCount(e.data.floorCount);
        if (e.data.items) setItems(e.data.items);
        // Report content presence up so the office's Submit enables the instant a device or
        // background is added — no waiting on the server's tool-meta poll.
        if (typeof e.data.hasContent === "boolean") onHasData?.(e.data.hasContent);
      }
      if (e.data.type === "iotSurveyZoom" && e.data.img) { setZoomImg(e.data.img); setZoomed(false); }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [accessId]);

  // Full-screen overlay: lock page scroll + Esc to exit.
  useEffect(() => {
    if (!fs) return;
    function onKey(e) { if (e.key === "Escape") setFs(false); }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [fs]);

  // Zoom lightbox: Esc closes.
  useEffect(() => {
    if (!zoomImg) return;
    function onKey(e) { if (e.key === "Escape") setZoomImg(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomImg]);

  // Capture overlay: lock page scroll + Esc to close, then remount the editor so it
  // reloads the state the pipeline just wrote (same per-project localStorage key).
  function closeCapture() { setCapture(false); setReloadKey((k) => k + 1); }
  useEffect(() => {
    if (!capture) return;
    function onKey(e) { if (e.key === "Escape") closeCapture(); }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [capture]);

  return (
    <div className={`ss-embed${fs ? " ss-embed-fs" : ""}`}>
      <div className="ss-embed-bar">
        <span className="ss-embed-tag">
          {readOnly ? "Customer view — tap the plan to zoom" : "Live survey editor"}
          {floorCount != null && <> · {floorCount} floor{floorCount !== 1 ? "s" : ""}</>}
        </span>
        {!readOnly && !fs && (
          <button className="ss-embed-open" onClick={() => setCapture(true)} title="Satellite capture → floor plan → placements">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px", marginRight: "4px" }}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>
            Capture
          </button>
        )}
        {fs ? (
          <button className="ss-embed-open ss-embed-close" onClick={() => setFs(false)}>
            ✕ Exit
          </button>
        ) : (
          <button className="ss-embed-open" onClick={() => setFs(true)}>
            ⛶ Full screen
          </button>
        )}
      </div>
      {synced ? (
        <iframe
          key={`${src}:${reloadKey}`}
          className="ss-embed-frame"
          src={src}
          title="Site Survey"
          allow="geolocation"
        />
      ) : (
        <div className="ss-embed-frame" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted,#6f7686)", fontSize: ".82rem" }}>
          Loading survey…
        </div>
      )}

      {capture && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#fff", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", padding: "9px 12px", borderBottom: "1px solid var(--slate-line,#e3e5e8)", background: "#fff" }}>
            <button className="ss-embed-open" onClick={closeCapture}>✕ Done</button>
            <span style={{ fontSize: ".8rem", color: "var(--muted,#6f7686)" }}>Satellite capture → floor plan → placements</span>
          </div>
          <iframe
            title="Survey capture"
            src={`/widgets/survey-capture.html?project=${encodeURIComponent(accessId)}`}
            style={{ flex: "1 1 auto", border: 0, width: "100%", minHeight: 0 }}
            allow="geolocation"
          />
        </div>
      )}

      {zoomImg && (
        <div className="ss-zoom" onClick={() => setZoomImg(null)}>
          <button className="ss-zoom-x" onClick={(e) => { e.stopPropagation(); setZoomImg(null); }} title="Close">✕</button>
          <div className="ss-zoom-scroll" onClick={(e) => e.stopPropagation()}>
            <img
              src={zoomImg}
              alt="Floor plan"
              className={`ss-zoom-img${zoomed ? " zoomed" : ""}`}
              onClick={() => setZoomed((z) => !z)}
            />
          </div>
          <div className="ss-zoom-hint">{zoomed ? "Click image to zoom out · drag to pan" : "Click image to zoom in"}</div>
        </div>
      )}

      {/* Legacy per-item approval — superseded by the server-backed ToolApproveBar in the
          gateway (noApproval). Kept for any caller that still wants it. */}
      {!noApproval && (
        <SignaturePanel
          accessId={accessId}
          tool="survey"
          toolLabel="Site survey"
          items={items}
          view={view}
          customerView={customerView}
          customerName={customerName}
        />
      )}
    </div>
  );
}

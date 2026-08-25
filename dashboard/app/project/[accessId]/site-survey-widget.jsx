"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import SignaturePanel from "./signature-panel";
import SurveyDevices from "./survey-devices";
import ToolComments from "./tool-comments";
import { seedToolData, startToolAutosync } from "./tool-sync";

// Embeds the full self-contained Site Survey widget (public/widgets/site-survey.html).
// All editing — device placement, FOV cones, drawing tools, shapes, satellite imagery,
// multi-floor, areas/rooms, proposal export — lives in that widget. We pass the project
// id so it auto-saves to localStorage per-project, and ?ro=1 for the read-only customer view.
export default function SiteSurveyWidget({ accessId, view, customerView, customerName, noApproval, onHasData, onSubmit, onUnsubmit, submitted = false, approved = false }) {
  const readOnly = view === "customer" || customerView;
  const [floorCount, setFloorCount] = useState(null);
  const [items, setItems] = useState([]);
  const [fs, setFs] = useState(false);
  const [zoomImg, setZoomImg] = useState(null);
  const [zoomed, setZoomed] = useState(false);
  const [roster, setRoster] = useState([]);       // device roster mirrored from the tool (moved outside)
  const [commentAnchor, setCommentAnchor] = useState(null);   // a read-only customer tapped this camera → comment toast
  const [curFloorState, setCurFloorState] = useState(0);
  const frameRef = useRef(null);
  // Drive an edit back into the tool (rename/FOV/delete/select/photo/switch-floor), applied live.
  const cmd = useCallback((payload) => {
    try { frameRef.current?.contentWindow?.postMessage({ type: "iotSurveyCmd", project: accessId, ...payload }, "*"); } catch { /* frame gone */ }
  }, [accessId]);
  // The redesigned Site Survey tool (chooser → Satellite/Upload/Draw → Place → Angles → Submit).
  // Staff edit; customers get ?ro=1. It persists to its own store (survey2) so the swap doesn't
  // disturb existing "survey" data / downstream consumers while the redesign is wired up.
  const src = `/widgets/site-survey-merged.html?project=${encodeURIComponent(accessId)}${readOnly ? "&ro=1" : ""}`;

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
      await seedToolData(accessId, "survey2", `iottechs_survey2_${accessId}`, { force: viewerRefresh });
      if (!live) return;
      setSynced(true);
      stop = startToolAutosync(accessId, "survey2", `iottechs_survey2_${accessId}`);
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
      if (e.data.type === "iotSurveyDevices") { setRoster(Array.isArray(e.data.floors) ? e.data.floors : []); setCurFloorState(e.data.curFloor || 0); }
      if (e.data.type === "iotSurveyZoom" && e.data.img) { setZoomImg(e.data.img); setZoomed(false); }
      // The tool's own nav buttons drive the real server submit/unsubmit (the status now lives inside the tool).
      if (e.data.type === "iotSurvey2Submit") onSubmit?.();
      if (e.data.type === "iotSurvey2Unsubmit") onUnsubmit?.();
      // A read-only customer tapped a camera marker → open the anchored comment toast.
      if (e.data.type === "iotSurveyComment") setCommentAnchor(e.data.anchor || null);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [accessId, onSubmit, onUnsubmit]);

  // Feed the SERVER's submit/approve truth into the tool so its inline nav tag ("Awaiting approval" /
  // "Customer approved") stays accurate — on first load and whenever it changes.
  const pushSubmitState = useCallback(() => {
    try { frameRef.current?.contentWindow?.postMessage({ type: "iotSurveySubmitState", project: accessId, submitted: !!submitted, approved: !!approved }, "*"); } catch { /* frame gone */ }
  }, [accessId, submitted, approved]);
  useEffect(() => { pushSubmitState(); }, [pushSubmitState]);

  // On a phone in landscape the inline frame is cramped and awkward to edit, so auto-expand to the
  // full-screen overlay (the same one the ⛶ button gives). Rotating back to portrait collapses it —
  // but only if WE opened it, so a deliberate full-screen in portrait is left alone. Tablets keep the
  // inline view (their landscape viewport is tall enough).
  const autoFsRef = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape) and (max-height: 600px)");
    const sync = () => {
      if (mq.matches) setFs((cur) => { if (!cur) autoFsRef.current = true; return true; });
      else if (autoFsRef.current) { autoFsRef.current = false; setFs(false); }
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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

  return (
    <>
    <div className={`ss-embed${fs ? " ss-embed-fs" : ""}`}>
      <div className="ss-embed-bar">
        <span className="ss-embed-tag">
          {readOnly ? "Customer view" : "Live survey editor"}
          {floorCount != null && <> · {floorCount} floor{floorCount !== 1 ? "s" : ""}</>}
        </span>
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
          key={src}
          ref={frameRef}
          className="ss-embed-frame"
          src={src}
          title="Site Survey"
          allow="geolocation"
          onLoad={pushSubmitState}
        />
      ) : (
        <div className="ss-embed-frame" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted,#6f7686)", fontSize: ".82rem" }}>
          Loading survey…
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
    {/* The device roster lives OUTSIDE the tool now — below the map, never overlapping it. Hidden while
        the tool is full-screen (the overlay covers the page). */}
    {!fs && <SurveyDevices accessId={accessId} roster={roster} curFloor={curFloorState} readOnly={readOnly} cmd={cmd} />}
    {/* Customer tap-to-comment: read-only, tag a comment to the camera they tapped; staff see the thread. */}
    <ToolComments accessId={accessId} scope="survey" role={view} preview={!!customerView} anchor={commentAnchor} onClose={() => setCommentAnchor(null)} hideGeneral />
    </>
  );
}

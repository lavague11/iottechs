"use client";
import { useState, useEffect, useRef } from "react";
import SignaturePanel from "./signature-panel";
import ToolComments from "./tool-comments";
import { seedToolData, startToolAutosync } from "./tool-sync";

// Embeds the full self-contained CCTV Mockup tool (public/widgets/cctv-mockup.html).
// The tool's own toolbar is hidden in builder-embed mode; this wrapper renders NATIVE,
// themed controls (Upload · Layout · Cameras · paging) in the host bar and drives the
// iframe over postMessage. It auto-saves to localStorage per-project; ?ro=1 renders the
// read-only customer grid.
export default function MockupWidget({ accessId, view, customerView, customerName, noApproval, onHasData, embedded = false }) {
  // Edit lock: only Admin / Manager / Sales rep build the mockup. Every other role
  // (Customer, Technician, Vendor, …) — and the admin "customer view" preview — is read-only.
  const readOnly = !["admin", "manager", "sales"].includes(view) || customerView;
  const [stat, setStat] = useState(null);   // {count, filled, view, page, pages, surveyDriven}
  const [items, setItems] = useState([]);
  const [fs, setFs] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);   // two-step Reset confirm
  const [layoutOpen, setLayoutOpen] = useState(false);       // layout dropdown open/closed
  const [commentAnchor, setCommentAnchor] = useState(null);  // a read-only customer tapped this camera → comment toast
  const [cameras, setCameras] = useState(null);   // survey camera roster (single source of truth)
  const [frameReady, setFrameReady] = useState(false);
  const surveyDriven = !!(cameras && cameras.length);
  const frameRef = useRef(null);
  const fileRef  = useRef(null);   // the picker lives HERE (parent doc) so the click is a real user gesture

  // The upload picker MUST be opened by a direct user gesture in this document — routing the click
  // through the iframe via postMessage is treated as programmatic and blocked (esp. iPhone Safari).
  // So we own the <input>, then hand the picked files to the tool inside the iframe (it converts
  // HEIC + fills the slots). File objects survive postMessage to the same-origin iframe.
  function onPick(e) {
    const files = [...(e.target.files || [])];
    if (files.length) frameRef.current?.contentWindow?.postMessage({ type: "iotMockupCmd", cmd: "addFiles", files }, "*");
    e.target.value = "";   // let the same file(s) be re-picked later
  }

  const src = `/widgets/cctv-mockup.html?embed=1&project=${encodeURIComponent(accessId)}${readOnly ? "&ro=1" : ""}`;

  // Seed this browser's localStorage from the server backup before the iframe reads it, then
  // mirror every local change back up (see tool-sync.js).
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    let stop = null, live = true;
    (async () => {
      await seedToolData(accessId, "mockup", `iot_cctv_${accessId}`);
      if (!live) return;
      setSynced(true);
      stop = startToolAutosync(accessId, "mockup", `iot_cctv_${accessId}`);
    })();
    return () => { live = false; if (stop) stop(); };
  }, [accessId]);

  // The mockup grid is driven by the Site Survey cameras (single source of truth) — fetch the roster
  // and feed it to the iframe once it's ready. Cameras are entered ONCE in the survey; here the office
  // only attaches each camera's mockup photo. Re-fed whenever the roster changes (idempotent apply).
  useEffect(() => {
    let live = true;
    fetch(`/api/project-cameras?accessId=${encodeURIComponent(accessId)}`)
      .then((r) => r.json()).then((j) => { if (live) setCameras(j?.ok && Array.isArray(j.cameras) ? j.cameras : []); })
      .catch(() => { if (live) setCameras([]); });
    return () => { live = false; };
  }, [accessId]);
  useEffect(() => {
    if (frameReady && cameras && cameras.length) cmd({ cmd: "cameras", cameras });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameReady, cameras]);

  useEffect(() => {
    function onMsg(e) {
      if (e.data?.type === "iotMockup" && e.data.project === accessId) {
        setFrameReady(true);
        setStat({
          count: e.data.count, filled: e.data.filled,
          view: e.data.view, page: e.data.page, pages: e.data.pages,
          height: e.data.height, surveyDriven: e.data.surveyDriven,
        });
        if (e.data.items) setItems(e.data.items);
        // Report content up so the office's Submit enables the instant a photo lands (no waiting
        // on the server tool-meta poll) — mirrors the survey widget's onHasData.
        if (typeof e.data.filled === "number") onHasData?.(e.data.filled > 0);
      }
      // A read-only customer tapped a camera → open the anchored comment toast.
      if (e.data?.type === "iotMockupComment" && e.data.project === accessId) setCommentAnchor(e.data.anchor || null);
      // Read-only customer double-tapped the mockup → toggle the host's fullscreen.
      if (e.data?.type === "iotMockupFullscreen" && e.data.project === accessId) setFs((v) => !v);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [accessId]);

  useEffect(() => {
    if (!layoutOpen) return;
    const close = () => setLayoutOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [layoutOpen]);

  useEffect(() => {
    if (!fs) return;
    function onKey(e) { if (e.key === "Escape") setFs(false); }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [fs]);

  // Send a command down to the tool inside the iframe.
  function cmd(payload) {
    frameRef.current?.contentWindow?.postMessage({ type: "iotMockupCmd", ...payload }, "*");
  }

  const LAYOUTS = [
    { v: 1,  label: "Single", icon: <rect x="4" y="4" width="16" height="16" rx="2" /> },
    { v: 4,  label: "2×2",    icon: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 4v16M4 12h16" /></> },
    { v: 9,  label: "3×3",    icon: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9.33 4v16M14.66 4v16M4 9.33h16M4 14.66h16" /></> },
    { v: 16, label: "4×4",    icon: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 4v16M12 4v16M16 4v16M4 8h16M4 12h16M4 16h16" /></> },
  ];
  const curView = stat?.view ?? 4;

  return (
    <div className={`ss-embed${fs ? " ss-embed-fs" : ""}`}>
      <div className="ss-embed-bar">
        <span className="ss-embed-tag">
          {!embedded && (readOnly ? "Customer view — camera mockups" : "Mockup builder")}
          {stat && <>{!embedded && " · "}{stat.filled}/{stat.count} cameras</>}
        </span>

        <div className="mk-controls">
          {!readOnly && (
            <>
              {/* Cameras count — manual when standalone; derived from the survey when it drives the grid */}
              {surveyDriven ? (
                <span className="mk-fromsurvey" title="Camera list comes from the Site Survey — add or rename cameras there">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  From survey · {cameras.length}
                </span>
              ) : (
                <label className="mk-count">
                  <span>Cameras</span>
                  <input
                    type="number" min="1" max="64"
                    value={stat?.count ?? 9}
                    onChange={(e) => cmd({ cmd: "setCount", n: e.target.value })}
                  />
                </label>
              )}

              {/* Upload — real file input in THIS document (opens reliably on iPhone), multiple + HEIC */}
              <input ref={fileRef} type="file" accept="image/*,.heic,.heif,.HEIC,.HEIF" multiple capture={undefined} style={{ display: "none" }} onChange={onPick} />
              <button className="mk-btn" onClick={() => fileRef.current?.click()}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
                Upload
              </button>

              {/* Reset — clears every photo + name (keeps count/layout). Two-step confirm. */}
              {confirmReset ? (
                <>
                  <button className="mk-btn mk-danger" onClick={() => { cmd({ cmd: "reset" }); setConfirmReset(false); }}>Confirm</button>
                  <button className="mk-btn" onClick={() => setConfirmReset(false)}>Cancel</button>
                </>
              ) : (
                (stat?.filled > 0) && (
                  <button className="mk-btn" title="Clear all photos and names" onClick={() => setConfirmReset(true)}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                    Reset
                  </button>
                )
              )}

            </>
          )}

          {/* Layout — EVERYONE gets the view-grid switcher; customers navigate the views (Single/2×2/
              3×3/4×4), staff also build. Only the photo-editing controls above stay staff-only. */}
          <div className="mk-layout">
            <button className="mk-btn" aria-expanded={layoutOpen} title="Layout"
              onClick={(e) => { e.stopPropagation(); setLayoutOpen((o) => !o); }}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7">{(LAYOUTS.find((l) => l.v === curView) || LAYOUTS[1]).icon}</svg>
              {(LAYOUTS.find((l) => l.v === curView) || LAYOUTS[1]).label}
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ opacity: 0.55 }}><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {layoutOpen && (
              <div className="mk-layoutmenu" onClick={(e) => e.stopPropagation()}>
                {LAYOUTS.map((l) => (
                  <button key={l.v} className={`mk-layoutopt${curView === l.v ? " on" : ""}`}
                    onClick={() => { cmd({ cmd: "setView", v: l.v }); setLayoutOpen(false); }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">{l.icon}</svg>
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {fs ? (
            <button className="ss-embed-open ss-embed-close" onClick={() => setFs(false)}>✕ Exit</button>
          ) : (
            <button className="ss-embed-open" onClick={() => setFs(true)}>⛶ Full screen</button>
          )}
        </div>
      </div>

      {synced ? (
        <iframe
          ref={frameRef}
          key={src}
          className="ss-embed-frame"
          src={src}
          title="CCTV Mockup"
          allow="clipboard-write"
          // Fit the frame to the mockup content so there's no dead gap — both builder and read-only. Fullscreen keeps the default height.
          style={!fs && stat?.height ? { height: Math.max(320, stat.height) } : undefined}
        />
      ) : (
        <div className="ss-embed-frame" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted,#6f7686)", fontSize: ".82rem" }}>
          Loading mockup…
        </div>
      )}

      {/* Paging — host-driven (tool's own nav is hidden in embed mode), shown for both builder and read-only */}
      {stat?.pages > 1 && (
        <div className="mk-pagenav">
          <button className="mk-parrow" disabled={stat.page <= 0} onClick={() => cmd({ cmd: "page", dir: -1 })}>‹</button>
          <span className="mk-pageind">Page {(stat.page ?? 0) + 1} of {stat.pages}</span>
          <button className="mk-parrow" disabled={stat.page >= stat.pages - 1} onClick={() => cmd({ cmd: "page", dir: 1 })}>›</button>
        </div>
      )}

      {/* Customer tap-to-comment: read-only, tag a comment to the camera they tapped; staff see the thread. */}
      <ToolComments accessId={accessId} scope="mockup" role={view} preview={customerView} anchor={commentAnchor} onClose={() => setCommentAnchor(null)} />

      {/* Legacy per-item approval — superseded by the gateway's ToolApproveBar (noApproval). */}
      {!noApproval && (
        <SignaturePanel
          accessId={accessId}
          tool="mockup"
          toolLabel="Camera mockup"
          items={items}
          view={view}
          customerView={customerView}
          customerName={customerName}
        />
      )}
    </div>
  );
}

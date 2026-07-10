"use client";
import { useState, useEffect, useRef } from "react";
import SignaturePanel from "./signature-panel";
import { seedToolData, startToolAutosync } from "./tool-sync";

// Embeds the full self-contained CCTV Mockup tool (public/widgets/cctv-mockup.html).
// The tool's own toolbar is hidden in builder-embed mode; this wrapper renders NATIVE,
// themed controls (Upload · Layout · Cameras · paging) in the host bar and drives the
// iframe over postMessage. It auto-saves to localStorage per-project; ?ro=1 renders the
// read-only customer grid.
export default function MockupWidget({ accessId, view, customerView, customerName, noApproval }) {
  // Edit lock: only Admin / Manager / Sales rep build the mockup. Every other role
  // (Customer, Technician, Vendor, …) — and the admin "customer view" preview — is read-only.
  const readOnly = !["admin", "manager", "sales"].includes(view) || customerView;
  const [stat, setStat] = useState(null);   // {count, filled, view, page, pages}
  const [items, setItems] = useState([]);
  const [fs, setFs] = useState(false);
  const frameRef = useRef(null);

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

  useEffect(() => {
    function onMsg(e) {
      if (e.data?.type === "iotMockup" && e.data.project === accessId) {
        setStat({
          count: e.data.count, filled: e.data.filled,
          view: e.data.view, page: e.data.page, pages: e.data.pages,
          height: e.data.height,
        });
        if (e.data.items) setItems(e.data.items);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [accessId]);

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
          {readOnly ? "Customer view — camera mockups" : "Mockup builder"}
          {stat && <> · {stat.filled}/{stat.count} cameras</>}
        </span>

        <div className="mk-controls">
          {!readOnly && (
            <>
              {/* Cameras count */}
              <label className="mk-count">
                <span>Cameras</span>
                <input
                  type="number" min="1" max="64"
                  value={stat?.count ?? 9}
                  onChange={(e) => cmd({ cmd: "setCount", n: e.target.value })}
                />
              </label>

              {/* Upload */}
              <button className="mk-btn" onClick={() => cmd({ cmd: "upload" })}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
                Upload
              </button>

              {/* Layout — clickable segmented control */}
              <div className="mk-seg" role="group" aria-label="Layout">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.v}
                    className={`mk-seg-btn${curView === l.v ? " on" : ""}`}
                    title={l.label}
                    onClick={() => cmd({ cmd: "setView", v: l.v })}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">{l.icon}</svg>
                  </button>
                ))}
              </div>
            </>
          )}

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

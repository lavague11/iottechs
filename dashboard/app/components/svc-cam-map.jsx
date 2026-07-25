"use client";

import { useEffect, useRef, useState } from "react";
import { seedToolData } from "../project/[accessId]/tool-sync";

// Tap-the-camera-on-the-plan picker — embeds the REAL site-survey widget in pick mode, so the
// customer sees the plan exactly as the office drew it (background image, satellite, rooms,
// FOV cones, every marker) and taps the camera that's down. The widget posts iotSurveyPick;
// we hand the composed label (same format as getSvcCameras) back to the diagnostic flow.
// Used by both 60-second-check modals (gateway + tracker).
export default function SvcCamMap({ accessId, onPick, cameras = [], selected = [] }) {
  const [ready, setReady] = useState(false);
  const frameRef = useRef(null);

  // Mirror the selection onto the map so tapped pins glow (the parent owns the truth; the
  // widget just paints it). Labels → survey tags via the cameras list.
  useEffect(() => {
    const w = frameRef.current?.contentWindow;
    if (!w) return;
    const tags = cameras.filter((c) => selected.includes(c.label)).map((c) => c.tag);
    try { w.postMessage({ type: "iotSurveyPickSel", tags }, "*"); } catch { /* frame not ready */ }
  }, [selected, cameras, ready]);

  // The widget reads its data from localStorage — seed it from the server first (a customer's
  // browser has no local draft; /api/tool-data authorizes their session, project grant, or
  // service-call PIN cookie). force:true so they always see the office's latest plan.
  useEffect(() => {
    let live = true;
    if (!accessId) return;
    seedToolData(accessId, "survey", `iottechs_sitesurvey_v2_${accessId}`, { force: true })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [accessId]);

  useEffect(() => {
    function onMsg(e) {
      const d = e?.data;
      if (d?.type !== "iotSurveyPick" || String(d.project) !== String(accessId)) return;
      const tag = String(d.tag || "").trim();
      const name = String(d.name || "").trim();
      let label = tag && name ? `${tag} — ${name}` : name || tag || "Camera";
      if (d.floorCount > 1 && d.floor) label += ` (${d.floor})`;
      onPick(label.slice(0, 80));
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [accessId, onPick]);

  if (!accessId) return null;

  return (
    <div className="scm">
      {ready ? (
        <iframe
          ref={frameRef}
          className="scm-frame"
          title="Tap the camera on your floor plan"
          src={`/widgets/site-survey.html?embed=1&project=${encodeURIComponent(accessId)}&ro=1&pick=1`}
        />
      ) : (
        <div className="scm-loading">Loading your floor plan…</div>
      )}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.scm{margin-bottom:12px}
.scm-frame{width:100%;height:340px;border:1.5px solid #e6e8ee;border-radius:12px;background:#0B0F1A;display:block}
.scm-loading{width:100%;height:120px;display:grid;place-items:center;border:1.5px dashed #e6e8ee;border-radius:12px;color:#5b6275;font-size:.85rem;font-weight:600}
`;

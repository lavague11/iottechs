"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { getToolDataAction } from "./proposal-actions";
import SystemWalkthrough from "./system-walkthrough";
import SurveyDevices from "./survey-devices";

// SYSTEM PLANNER — the unified Consulting workspace. One stage, one workspace: two working modes
// [ PLAN | CAMERA VIEWS ] plus one presentation action ▶ Walkthrough. The survey map (PLAN) is where
// cameras are created + named (single source of truth); CAMERA VIEWS attaches/reviews each shot; the
// Walkthrough plays the whole system back. This shell owns ONLY the mode switch + the walkthrough
// launch — the survey and mockup tools are passed in as fully-wired nodes (their own Submit/Approve
// bars come with them), so nothing about the submission/approval flow changes here.
//
// #1 RULE: both panes are mounted once and toggled with `hidden` — never conditionally rendered — so
// the iframes never remount (a remount reloads/reseeds them and drops any in-progress draft).
const norm = (s) => String(s || "").trim().toLowerCase();

export default function SystemPlanner({
  accessId, customerName = "",
  planNode = null, viewsNode = null, footer = null,
  hasSurvey = false, hasViews = false, hasCams = false,
  mockupSkipped = false, viewsRequired = false, onSkipViews = null,
  devReadOnly = false, devLocked = false,
}) {
  // ONE Consulting rail: Background · Plan · Cameras · Views · Review. railStep is the source of truth.
  // Background/Plan/Cameras are the SAME survey pane — the rail drives its internal step via postMessage
  // (iotSurveyCmd {cmd:"step"}); Views is the mockup pane; Review is the status surface. Both iframes stay
  // mounted (visibility toggles only) so a draft never reloads. paneMode picks which pane is visible.
  const [railStep, setRailStep] = useState("plan");
  const [sig, setSig] = useState({ bgReady: hasSurvey, hasPlan: hasSurvey, camCount: hasCams ? 1 : 0 });  // survey completion signals, seeded from server props, kept live by iotSurveyStep
  const paneMode = railStep === "views" ? "views" : railStep === "review" ? "review" : "plan";
  // Views optionality (P5): if the mockup was never started, show a Start/Skip strip instead of a second
  // build screen. Local state gives instant feedback; onSkipViews persists the skip for the phase gate.
  const [viewsStarted, setViewsStarted] = useState(hasViews);
  const [skipped, setSkipped] = useState(mockupSkipped);
  const persistSkip = (v) => { setSkipped(v); if (onSkipViews) Promise.resolve(onSkipViews(v)).catch(() => {}); };
  const [walkOpen, setWalkOpen] = useState(false);
  const [selectedCid, setSelectedCid] = useState(null);   // the one camera the user picked — shared across modes
  const [roster, setRoster] = useState([]);      // the DEVICES roster (camera account) — shared across both modes
  const [curFloor, setCurFloor] = useState(0);
  const rootRef = useRef(null);

  // Talk to the survey iframe (the devices live in survey2). The roster is shared across both tabs, so
  // its edits post straight to the survey iframe (which stays mounted even while the Plan pane is hidden).
  const surveyCmd = (payload) => {
    try { const fr = rootRef.current && rootRef.current.querySelector('iframe[title="Site Survey"]');
      if (fr && fr.contentWindow) fr.contentWindow.postMessage({ type: "iotSurveyCmd", project: accessId, ...payload }, "*"); } catch { /* iframe not ready */ }
  };

  // The camera is ONE object across the two modes. Each iframe broadcasts the cid the user picked; we
  // relay it to the OTHER iframe so the same camera is focused there — even while that pane is hidden,
  // so switching modes lands on the same camera. The relay commands are applied silently (no echo),
  // so there's no select↔focus loop.
  useEffect(() => {
    function onMsg(ev) {
      const m = ev.data; if (!m || !m.type) return;
      const post = (title, msg) => {
        try { const fr = rootRef.current && rootRef.current.querySelector(`iframe[title="${title}"]`);
          if (fr && fr.contentWindow) fr.contentWindow.postMessage(msg, "*"); } catch { /* iframe not ready */ }
      };
      if (m.type === "iotSurveySelect" && m.cid) { setSelectedCid(m.cid); post("CCTV Mockup", { type: "iotMockupCmd", cmd: "focus", cid: m.cid }); }
      else if (m.type === "iotMockupSelect" && m.cid) { setSelectedCid(m.cid); post("Site Survey", { type: "iotSurveyCmd", cmd: "selectCid", project: accessId, cid: m.cid }); }
      // The devices roster is lifted into the shell (shown on both tabs) — mirror the survey's live roster.
      else if (m.type === "iotSurveyDevices") { setRoster(Array.isArray(m.floors) ? m.floors : []); setCurFloor(m.curFloor || 0); }
      // A rename made INSIDE the mockup (it already persisted to survey2 by cid) → relay to the survey
      // iframe so the live map/Devices strip reflect it immediately, closing the sync loop both ways.
      else if (m.type === "iotMockupRenamed" && m.cid) { post("Site Survey", { type: "iotSurveyCmd", cmd: "renameCid", project: accessId, cid: m.cid, name: m.name || "" }); }
      // The survey echoes its internal step + completion signals → keep the rail indicator honest and follow
      // the Background→Setup auto-advance (after Done). Plan/Cameras/Review are distinguished shell-side, so
      // within Setup (step 1) we only auto-advance OFF Background; an explicit Plan/Cameras/Review stays put.
      else if (m.type === "iotSurveyStep") {
        setSig({ bgReady: !!m.bgReady, hasPlan: !!m.hasPlan, camCount: +m.camCount || 0 });
        setRailStep((cur) => (m.step === 0 ? "background" : cur === "background" ? "plan" : cur));
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [accessId]);

  // Bridge the survey's LIVE device roster (canonical by cid: name/tag/photo) into the CCTV mockup grid,
  // so renaming a camera in the Devices strip (or on the survey map) updates the Views/mockup tiles
  // IMMEDIATELY — no server round-trip, no stale positional name copy. The mockup's applyCameras keys off
  // this same list, so a rename anywhere shows everywhere. Order matches getProjectCameras (floors→devices).
  const liveCameras = useMemo(() => {
    const out = [];
    (roster || []).forEach((f, fi) => (Array.isArray(f?.devices) ? f.devices : []).forEach((d) => {
      if (d && d.k === "cam") out.push({
        id: d.cid || null, name: d.name || null, tag: d.tag || null,
        photo: d.photo || null, photoName: d.photoName || null,
        floor: d.floor != null ? d.floor : fi, di: d.di,
      });
    }));
    return out;
  }, [roster]);
  const liveKey = useMemo(() => liveCameras.map((c) => `${c.id}:${c.name}`).join("|"), [liveCameras]);
  useEffect(() => {
    if (!liveCameras.length) return;
    try {
      const fr = rootRef.current && rootRef.current.querySelector('iframe[title="CCTV Mockup"]');
      if (fr && fr.contentWindow) fr.contentWindow.postMessage({ type: "iotMockupCmd", cmd: "cameras", cameras: liveCameras }, "*");
    } catch { /* iframe not ready — the next roster change re-sends */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  // Load the survey placements + view photos once, for the walkthrough (same shape SystemVisualize used).
  const [sv, setSv] = useState(null);
  const [mk, setMk] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      getToolDataAction(accessId, "survey2").catch(() => null),
      getToolDataAction(accessId, "mockup").catch(() => null),
    ]).then(([s, m]) => { if (!live) return; setSv(s?.saved?.data || null); setMk(m?.saved?.data || null); });
    return () => { live = false; };
  }, [accessId, walkOpen]);

  const floors = useMemo(() => {
    try { const d = JSON.parse(sv); return (d.floors || []).filter((f) => f.bg)
      .map((f) => ({ name: f.name || "Floor", bg: f.bg, scale: f.scale || null, aerial: f.aerial || null, devices: f.devices || [], zones: f.zones || [], boundary: f.boundary || null, sides: f.sides || null, plan: f.plan || null, ctx: f.ctx || null, cams: (f.devices || []).filter((x) => x.k === "cam") })); }
    catch { return []; }
  }, [sv]);
  const photos = useMemo(() => {
    try { const d = JSON.parse(mk); return (d.photos || [])
      .map((url, i) => ({ url, name: (d.names && d.names[i]) || `Camera ${i + 1}` }))
      .filter((x) => typeof x.url === "string" && x.url.startsWith("data:image")); }
    catch { return []; }
  }, [mk]);
  const camCount = floors.reduce((n, f) => n + (f.cams || []).length, 0);
  const canWalk = hasCams || camCount > 0;

  // Navigate the rail. Background/Plan/Cameras drive the SAME survey pane's internal step (postMessage,
  // no reload); Views/Review are shell-only. Internal users can jump to any completed section freely.
  const goRail = (step) => {
    setRailStep(step);
    if (step === "background") surveyCmd({ cmd: "step", step: 0 });
    else if (step === "plan") surveyCmd({ cmd: "step", step: 1 });
    else if (step === "cameras") surveyCmd({ cmd: "step", step: 1, focus: "devices" });
    // views / review: shell state only — both iframes stay mounted
  };
  const camsPlaced = sig.camCount || camCount;
  const steps = [
    { key: "background", label: "Background", done: sig.bgReady, enabled: true },
    { key: "plan", label: "Plan", done: sig.hasPlan, enabled: sig.bgReady },
    { key: "cameras", label: "Cameras", done: camsPlaced > 0, enabled: sig.bgReady },
    { key: "views", label: "Views", done: hasViews, enabled: camsPlaced > 0 || hasViews },
    { key: "review", label: "Review", done: false, enabled: true },
  ];

  return (
    <div className="syp" ref={rootRef}>
      <style>{CSS}</style>

      <div className="syp-head">
        <div className="syp-rail" role="tablist" aria-label="Consulting workflow">
          {steps.map((s, i) => (
            <button key={s.key} role="tab" aria-selected={railStep === s.key} disabled={!s.enabled}
              className={`syp-step${railStep === s.key ? " on" : ""}${s.done ? " done" : ""}`}
              onClick={() => s.enabled && goRail(s.key)}>
              <span className="syp-dot" aria-hidden="true">{s.done && railStep !== s.key ? "✓" : ""}</span>
              <span className="syp-steplbl">{s.label}</span>
              {i < steps.length - 1 && <span className="syp-sep" aria-hidden="true" />}
            </button>
          ))}
        </div>
        <div className="syp-head-actions">
          {/* Walkthrough — icon-only play button (Consulting stage). */}
          {canWalk && (
            <button className="syp-play" title="Play walkthrough" aria-label="Play walkthrough" onClick={() => setWalkOpen(true)}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Both panes stay mounted; only visibility toggles, so the iframes never reload. The PLAN pane
          flows as a document: the survey MAP gets its own bounded height, and the camera roster flows
          BELOW it (the page scrolls) — never trapped inside a fixed frame that would clip the roster.
          Background/Plan/Cameras all show the survey pane (the rail drove its internal step). */}
      <div className="syp-pane syp-plan" hidden={paneMode !== "plan"}>
        {planNode || <div className="syp-empty">Your site survey will appear here once it&apos;s started.</div>}
      </div>
      <div className="syp-pane" hidden={paneMode !== "views"}>
        {(hasViews || viewsStarted)
          ? (viewsNode || <div className="syp-empty">Camera views will appear here once photos are added.</div>)
          : <ViewsStart camCount={camsPlaced} skipped={skipped} required={viewsRequired} canEdit={!!onSkipViews}
              onStart={() => { setViewsStarted(true); if (skipped) persistSkip(false); }}
              onSkip={() => { persistSkip(true); setRailStep("plan"); }} />}
      </div>
      {/* Review — the Consulting status surface (the submit/approve footer below is the content). P7 enriches it. */}
      {paneMode === "review" && (
        <div className="syp-review">
          <div className="syp-review-h">Review &amp; submit</div>
          <div className="syp-review-sub">Confirm the site survey{hasViews ? " and camera views" : ""}, then submit for the customer to approve.</div>
        </div>
      )}

      {/* The DEVICES roster — the camera account. Shared across BOTH tabs (not tied to the survey map),
          so cameras can be named/photographed from either mode. Office-only (customers see cameras in
          the views). */}
      {!devReadOnly && (
        <SurveyDevices accessId={accessId} roster={roster} curFloor={curFloor} readOnly={devReadOnly} locked={devLocked} cmd={surveyCmd} />
      )}

      {/* ONE submit surface — both tools' Submit/Approve, always visible under either mode. */}
      {footer}

      {walkOpen && (
        <SystemWalkthrough accessId={accessId} floors={floors} photos={photos} focusCid={selectedCid} customerName={customerName}
          defaultFs onClose={() => setWalkOpen(false)} />
      )}
    </div>
  );
}

// Views entry — shown instead of a second build screen when the mockup was never started. The system
// already knows the cameras, so this just offers Start (open the mockup on those cameras) or Skip for now.
function ViewsStart({ camCount = 0, skipped = false, required = false, canEdit = false, onStart, onSkip }) {
  return (
    <div className="syp-vstart">
      <div className="syp-vstart-h">{camCount > 0 ? `${camCount} camera${camCount === 1 ? "" : "s"} ready` : "Camera Views"}</div>
      <div className="syp-vstart-sub">
        {skipped ? "Skipped for now — start anytime." : required ? "Required for this project — attach a shot for each camera." : "Optional — attach a real shot for each camera, or skip if this job doesn't need it."}
      </div>
      {canEdit ? (
        <div className="syp-vstart-actions">
          <button className="syp-vbtn primary" onClick={onStart}>Start Views</button>
          {!required && !skipped && <button className="syp-vbtn" onClick={onSkip}>Skip for now</button>}
        </div>
      ) : <div className="syp-vstart-sub">No camera views yet.</div>}
    </div>
  );
}

const CSS = `
.syp{display:flex;flex-direction:column;gap:0}
.syp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 2px 12px;flex-wrap:wrap}
/* The ONE Consulting rail — Background · Plan · Cameras · Views · Review. Compact, icon-free, state via
   a leading dot (✓ done · filled = current · hollow = pending). Minimal vault styling, horizontally scrollable. */
.syp-rail{display:inline-flex;align-items:center;gap:0;max-width:100%;overflow-x:auto;padding:3px;background:var(--dv-raise,#F2F2EF);border:1px solid var(--dv-line,#E4E4DF);border-radius:100px}
.syp-step{position:relative;appearance:none;border:0;background:transparent;cursor:pointer;font:inherit;font-size:.8rem;font-weight:700;letter-spacing:.01em;white-space:nowrap;
  color:var(--dv-meta,#787D84);display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:100px;transition:background .18s,color .18s}
.syp-step:hover:not(:disabled){color:var(--dv-ink,#101418)}
.syp-step.on{background:var(--dv-ink,#101418);color:#fff}
.syp-step:disabled{opacity:.42;cursor:default}
.syp-step.done:not(.on){color:var(--dv-ink,#101418)}
.syp-dot{width:13px;height:13px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-size:9px;line-height:1;border:1.5px solid currentColor}
.syp-step.on .syp-dot{background:#fff;border-color:#fff;color:var(--dv-ink,#101418)}
.syp-step.done:not(.on) .syp-dot{background:var(--dv-gold,#b98a2e);border-color:var(--dv-gold,#b98a2e);color:#fff}
.syp-sep{display:none}
.syp-vstart{border:1px dashed var(--dv-line,#E4E4DF);border-radius:14px;background:var(--dv-raise,#FBFBFA);padding:26px 18px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px}
.syp-vstart-h{font-size:1rem;font-weight:800;color:var(--dv-ink,#101418)}
.syp-vstart-sub{font-size:.84rem;color:var(--dv-meta,#787D84);max-width:420px}
.syp-vstart-actions{display:inline-flex;gap:10px;margin-top:10px}
.syp-vbtn{appearance:none;cursor:pointer;font:inherit;font-size:.84rem;font-weight:700;padding:9px 18px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink,#101418)}
.syp-vbtn:hover{border-color:var(--dv-ink,#101418)}
.syp-vbtn.primary{background:var(--dv-ink,#101418);color:#fff;border-color:var(--dv-ink,#101418)}
.syp-vbtn.primary:hover{background:#000}
.syp-review{border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;background:var(--dv-raise,#FBFBFA);padding:16px 18px;margin-bottom:12px}
.syp-review-h{font-size:.95rem;font-weight:800;color:var(--dv-ink,#101418)}
.syp-review-sub{margin-top:3px;font-size:.82rem;color:var(--dv-meta,#787D84)}
.syp-head-actions{display:inline-flex;align-items:center;gap:8px}
.syp-ico,.syp-play{appearance:none;cursor:pointer;width:38px;height:38px;border-radius:100px;display:inline-flex;align-items:center;justify-content:center;transition:background .18s,border-color .18s}
.syp-ico{border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418)}
.syp-ico:hover{background:#fff;border-color:var(--dv-ink,#101418)}
.syp-ico svg{width:16px;height:16px}
.syp-play{border:1px solid var(--dv-ink,#101418);background:var(--dv-ink,#101418);color:#fff}
.syp-play:hover{background:#000}
.syp-play svg{margin-left:1px}
.syp-pane[hidden]{display:none!important}
/* PLAN pane flows like a document — bound only the MAP, never the whole survey (which would clip the
   camera roster below it). The survey node itself stays auto-height so the roster + comments flow. */
.syp-plan .ss-tool-col,.syp-plan .ss-tool-body{height:auto!important;display:block!important;min-height:0}
.syp-plan .ss-embed{display:flex;flex-direction:column;height:auto}
/* Keep the map taller than 540px on desktop so the survey uses CONTAIN (whole aerial visible + zoomable),
   not the phone COVER mode that crops the sides and blocks zooming back out. */
.syp-plan .ss-embed-frame{flex:0 0 auto;width:100%;height:min(74vh,680px);min-height:560px;border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;background:#fff;display:block}
@media (max-width:700px){ .syp-plan .ss-embed-frame{height:min(64vh,520px);min-height:340px} }
/* One workspace, not stacked tools: the header's Plans/Views tabs already name the mode, so drop each
   widget's redundant descriptive tag ("Live survey editor · N floors" / the empty mockup tag) and keep
   only the functional controls (fullscreen, etc.) pinned to the right of a slim bar. */
.syp .ss-embed-tag{display:none}
/* The fullscreen control now lives on the Plans/Views line (syp-head), so the survey's own slim bar is hidden here. */
.syp .ss-embed-bar{display:none}
.syp-empty{text-align:center;padding:40px 16px;color:var(--dv-meta,#787D84);font-size:.86rem;border:1px dashed var(--dv-line,#E4E4DF);border-radius:14px}
/* One submit surface — both tools' Submit/Approve controls, always visible under either mode. */
.syp-submit{margin-top:14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;background:var(--dv-raise,#FBFBFA);padding:6px 16px;display:flex;flex-direction:column}
.syp-submit-row{display:flex;align-items:center;gap:14px;padding:10px 0;flex-wrap:wrap}
.syp-submit-row + .syp-submit-row{border-top:1px solid var(--dv-line,#E4E4DF)}
.syp-submit-lbl{font-size:.8rem;font-weight:700;color:var(--dv-ink,#101418);min-width:96px;flex:0 0 auto}
.syp-submit-row .tab-root{margin-top:0;flex:1 1 auto;border:none;background:transparent;padding:0}
.syp-submit-row .tab-root.slim{padding:0;margin-top:0}
`;

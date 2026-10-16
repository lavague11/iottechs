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
  devReadOnly = false, devLocked = false, customer = false,
  surveySubmitted = false,
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
  const [fsOn, setFsOn] = useState(false);        // planner-level fullscreen (owns the floor context + rail + tools)
  const rootRef = useRef(null);

  // Talk to the survey iframe (the devices live in survey2). The roster is shared across both tabs, so
  // its edits post straight to the survey iframe (which stays mounted even while the Plan pane is hidden).
  const surveyCmd = (payload) => {
    try { const fr = rootRef.current && rootRef.current.querySelector('iframe[title="Site Survey"]');
      if (fr && fr.contentWindow) fr.contentWindow.postMessage({ type: "iotSurveyCmd", project: accessId, ...payload }, "*"); } catch { /* iframe not ready */ }
  };

  // Floor management — the top selector drives the survey iframe's canonical floor functions by cmd
  // (switch/add/rename/duplicate/delete). Floor logic lives once, in the widget; the shell only asks.
  const goFloor = (i) => { if (i === curFloor) return; setCurFloor(i); surveyCmd({ cmd: "floor", i }); };
  const addFloor = () => surveyCmd({ cmd: "addFloor" });
  const duplicateFloor = () => surveyCmd({ cmd: "duplicateFloor" });
  const renameFloor = (name) => { const n = String(name || "").trim(); if (n) surveyCmd({ cmd: "renameFloor", name: n }); };
  const deleteFloor = () => surveyCmd({ cmd: "deleteFloor" });

  // Swipe/drag the floor HEADER (never the canvas — canvas gestures belong to the editor) to page floors,
  // like carousel slides. A real horizontal drag past a threshold moves exactly one floor; a tiny/vertical
  // move is ignored (so it never fights a tap on the floor name or an accidental nudge).
  const fbDrag = useRef(null);
  const fbDown = (e) => {
    // ignore drags that start on the menu/arrows/buttons — those have their own click behavior
    if (e.target.closest("button, .syp-fsel-menu")) { fbDrag.current = null; return; }
    fbDrag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const fbMove = (e) => { const d = fbDrag.current; if (d) d.moved = Math.abs(e.clientX - d.x) > 6 || d.moved; };
  const fbUp = (e) => {
    const d = fbDrag.current; fbDrag.current = null; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;   // not a decisive horizontal swipe
    const target = dx < 0 ? curFloor + 1 : curFloor - 1;                   // swipe left → next floor
    if (target >= 0 && target < floorCount) goFloor(target);
  };

  // Planner-level fullscreen (Phase 2). The ⛶ fullscreens the WHOLE planner (.syp: floor selector +
  // canvas + rail + tools) via the Fullscreen API, which promotes it to the browser's top layer — so it
  // escapes the deck's transformed slide and, crucially, DOES NOT reparent the node, so neither iframe
  // reloads (a React body-portal would remount them). Entry is a real user gesture (this click). If the
  // API is blocked (e.g. an embedded webview), fall back to the survey widget's own portal fullscreen so
  // the button always does something. The project header/phase rail live OUTSIDE .syp → hidden in fs.
  const enterFs = () => {
    const el = rootRef.current; if (!el) return;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) {
      Promise.resolve(req.call(el)).catch(() => {
        try { window.dispatchEvent(new CustomEvent("iotSurveyFocus", { detail: { project: accessId } })); } catch { /* no-op */ }
      });
    } else {
      try { window.dispatchEvent(new CustomEvent("iotSurveyFocus", { detail: { project: accessId } })); } catch { /* no-op */ }
    }
  };
  const exitFs = () => { try { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); } catch { /* no-op */ } };
  useEffect(() => {
    const onChange = () => { const fsEl = document.fullscreenElement || document.webkitFullscreenElement; setFsOn(!!fsEl && fsEl === rootRef.current); };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => { document.removeEventListener("fullscreenchange", onChange); document.removeEventListener("webkitfullscreenchange", onChange); };
  }, []);

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
      // A photo attached in the mockup wrote the survey2 blob server-side but can't touch the live survey
      // iframe. Relay it (by stable cid) so the survey updates its device, re-emits iotSurveyDevices, and
      // the shared Devices roster + walkthrough refresh instantly — no reload. (Fixes stale "No photo".)
      else if (m.type === "iotMockupPhoto" && m.cid) {
        post("Site Survey", { type: "iotSurveyCmd", cmd: "photo", project: accessId, cid: m.cid, photo: m.photo || null, photoName: m.photoName || null });
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
  const liveKey = useMemo(() => liveCameras.map((c) => `${c.id}:${c.name}:${c.photo ? 1 : 0}`).join("|"), [liveCameras]);  // photo bit → a photo added anywhere re-feeds the mockup grid
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
    // Floor Plan is "done" when built geometry exists OR the survey was submitted — a submitted survey
    // proves the plan regardless of which floor is in view or whether a structure was explicitly drawn.
    { key: "plan", label: "Floor Plan", done: sig.hasPlan || surveySubmitted, enabled: sig.bgReady },
    { key: "cameras", label: "Cameras", done: camsPlaced > 0, enabled: sig.bgReady },
    { key: "views", label: "Views", done: hasViews, enabled: camsPlaced > 0 || hasViews },
    { key: "review", label: "Review", done: false, enabled: true },
  ];

  // CUSTOMER head: no staff rail — just a floor/view pager + a full-width Walkthrough. The pager steps
  // through the submitted floors (driving the survey pane's floor with the existing, RO-safe `floor` cmd)
  // and lands on Camera Views as the last stop when a mockup exists. Index is tracked shell-side
  // (optimistic) so paging feels instant and never depends on an echo.
  const floorCount = Math.max(roster.length, floors.length, hasSurvey ? 1 : 0);
  const showViewsStop = hasViews || viewsStarted;
  const custStops = floorCount + (showViewsStop ? 1 : 0);
  const onViews = railStep === "views";
  const custIdx = onViews ? floorCount : Math.min(curFloor, Math.max(0, floorCount - 1));
  const floorLabel = (i) => (roster[i] && roster[i].name) || (floors[i] && floors[i].name) || `Floor ${i + 1}`;
  const custLabel = onViews ? "Camera Views" : floorLabel(custIdx);
  const goCust = (idx) => {
    if (idx < 0 || idx >= custStops) return;
    if (showViewsStop && idx === floorCount) { setRailStep("views"); return; }   // the Camera Views stop
    setRailStep("plan"); setCurFloor(idx); surveyCmd({ cmd: "floor", i: idx });
  };

  return (
    <div className={`syp${!customer ? " syp--staff" : ""}${fsOn ? " syp--fs" : ""}`} ref={rootRef}>
      <style>{CSS}</style>

      {customer ? (
        /* CUSTOMER — no staff rail. A floor/view pager (when there's more than one) + a full-width
           Walkthrough. The customer reviews; they don't build. */
        (custStops > 1 || canWalk) && (
          <div className="syp-head syp-head--cust">
            {custStops > 1 && (
              <div className="syp-pager" role="group" aria-label="Floors">
                <button className="syp-pg" aria-label="Previous floor" disabled={custIdx <= 0} onClick={() => goCust(custIdx - 1)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                </button>
                <span className="syp-pg-lbl">{custLabel}</span>
                <button className="syp-pg" aria-label="Next floor" disabled={custIdx >= custStops - 1} onClick={() => goCust(custIdx + 1)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              </div>
            )}
            {canWalk && (
              <button className="syp-play syp-play--full" onClick={() => setWalkOpen(true)}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                <span>Walkthrough</span>
              </button>
            )}
          </div>
        )
      ) : (
        /* STAFF — one continuous frame: a FULL-WIDTH floor carousel header on top (where am I),
           the canvas in the middle, the contextual nav footer below. Arrows + tap-to-manage + a
           header-only swipe change floors; canvas gestures stay with the editor. */
        <div className="syp-floorbar" onPointerDown={fbDown} onPointerMove={fbMove} onPointerUp={fbUp} onPointerCancel={fbUp}>
          <div className="syp-fb-nav">
            <button className="syp-fb-arrow" aria-label="Previous floor" disabled={curFloor <= 0} onClick={() => goFloor(curFloor - 1)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <FloorSelect floors={roster} curFloor={curFloor}
              onSwitch={goFloor} onAdd={addFloor} onRename={renameFloor} onDuplicate={duplicateFloor} onDelete={deleteFloor} />
            <button className="syp-fb-arrow" aria-label="Next floor" disabled={curFloor >= floorCount - 1} onClick={() => goFloor(curFloor + 1)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
          {/* Fullscreen the whole planner (header + canvas + tools + footer); only the project chrome hides. */}
          <button className="syp-fb-fs" title={fsOn ? "Exit full screen" : "Full screen"} aria-label={fsOn ? "Exit full screen" : "Full screen"} onClick={fsOn ? exitFs : enterFs}>
            {fsOn
              ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3v4a2 2 0 0 1-2 2H3M21 9h-4a2 2 0 0 1-2-2V3M3 15h4a2 2 0 0 1 2 2v4M15 21v-4a2 2 0 0 1 2-2h4" /></svg>
              : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>}
          </button>
        </div>
      )}

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

      {/* STAFF workflow rail — moved to sit DIRECTLY BELOW the canvas, so it reads as the canvas's mode
          switcher (where-am-I selector is on top; what-mode is here). Background/Floor Plan/Cameras drive
          the survey pane's internal step; Views/Review are shell-only. */}
      {!customer && (
        <div className="syp-railbar">
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
          {canWalk && (
            <button className="syp-play" title="Play walkthrough" aria-label="Play walkthrough" onClick={() => setWalkOpen(true)}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            </button>
          )}
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

// FLOOR SELECTOR (staff) — the "where am I" control at the top of the planner. Replaces the survey
// widget's in-canvas floor sheet; drives the SAME canonical floor functions by cmd (switch/add/
// rename/duplicate/delete), so floor logic lives once in the widget. Compact closed; the open menu
// lists floors (✓ current) then Add/Rename/Duplicate/Delete acting on the current floor. Rename and
// Delete resolve inline (no native dialogs), matching the vault-dark system.
function FloorSelect({ floors = [], curFloor = 0, onSwitch, onAdd, onRename, onDuplicate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [menuMode, setMenuMode] = useState("list");   // "list" | "rename" | "confirm"
  const [draft, setDraft] = useState("");
  const ref = useRef(null);
  const list = Array.isArray(floors) && floors.length ? floors : [{ name: "Floor 1" }];
  const curName = (list[curFloor] && list[curFloor].name) || `Floor ${curFloor + 1}`;
  const only = list.length <= 1;
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setMenuMode("list"); } };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const close = () => { setOpen(false); setMenuMode("list"); };
  const startRename = () => { setDraft(curName); setMenuMode("rename"); };
  const commitRename = () => { const n = draft.trim(); if (n && n !== curName) onRename && onRename(n); close(); };
  return (
    <div className="syp-fsel" ref={ref}>
      <button className="syp-fsel-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18M6 21V8l6-4 6 4v13M10 21v-5h4v5" /></svg>
        <span className="syp-fsel-name">{curName}</span>
        <svg viewBox="0 0 10 6" width="9" height="9" fill="currentColor" aria-hidden="true" style={{ opacity: .6, transform: open ? "rotate(180deg)" : "none", transition: "transform .16s" }}><path d="M0 0l5 6 5-6z" /></svg>
      </button>
      {open && (
        <div className="syp-fsel-menu" role="menu">
          {menuMode === "rename" ? (
            <div className="syp-fsel-form">
              <input className="syp-fsel-input" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setMenuMode("list"); }} placeholder="Floor name" />
              <div className="syp-fsel-formbtns">
                <button className="syp-fsel-mini" onClick={() => setMenuMode("list")}>Cancel</button>
                <button className="syp-fsel-mini primary" onClick={commitRename}>Save</button>
              </div>
            </div>
          ) : menuMode === "confirm" ? (
            <div className="syp-fsel-form">
              <div className="syp-fsel-confirm">Delete “{curName}”?</div>
              <div className="syp-fsel-formbtns">
                <button className="syp-fsel-mini" onClick={() => setMenuMode("list")}>Cancel</button>
                <button className="syp-fsel-mini danger" onClick={() => { onDelete && onDelete(); close(); }}>Delete</button>
              </div>
            </div>
          ) : (
            <>
              {list.map((f, i) => (
                <button key={i} className={`syp-fsel-opt${i === curFloor ? " on" : ""}`} role="menuitem"
                  onClick={() => { if (i !== curFloor) onSwitch && onSwitch(i); close(); }}>
                  <span className="syp-fsel-optname">{f.name || `Floor ${i + 1}`}</span>
                  {i === curFloor && <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>}
                </button>
              ))}
              <div className="syp-fsel-sep" />
              <button className="syp-fsel-act" role="menuitem" onClick={() => { onAdd && onAdd(); close(); }}>+ Add floor</button>
              <button className="syp-fsel-act" role="menuitem" onClick={startRename}>Rename</button>
              <button className="syp-fsel-act" role="menuitem" onClick={() => { onDuplicate && onDuplicate(); close(); }}>Duplicate</button>
              <button className="syp-fsel-act danger" role="menuitem" disabled={only} onClick={() => setMenuMode("confirm")}>Delete</button>
            </>
          )}
        </div>
      )}
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
@media (max-width:640px){
  .syp-head{gap:8px}
  .syp-rail{flex:1 1 auto;-webkit-overflow-scrolling:touch}
  .syp-step{padding:6px 11px;font-size:.76rem;gap:5px}
  .syp-dot{width:12px;height:12px;font-size:8px}
  .syp-vstart{padding:20px 14px}
}
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
/* CUSTOMER head — a centered floor/view pager over a full-width Walkthrough. No staff rail.
   Selectors are scoped under .syp-head--cust (two classes) so they beat the deck's dv-shell button
   reset (which would otherwise strip the button backgrounds). */
.syp-head--cust{flex-direction:column;align-items:stretch;justify-content:flex-start;gap:10px}
.syp-head--cust .syp-pager{display:flex;align-items:center;justify-content:center;gap:14px}
.syp-head--cust .syp-pg{appearance:none;cursor:pointer;width:34px;height:34px;flex:none;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#F2F2EF);color:var(--dv-ink,#101418);display:inline-flex;align-items:center;justify-content:center;transition:background .15s,opacity .15s}
.syp-head--cust .syp-pg:hover:not(:disabled){background:#fff}
.syp-head--cust .syp-pg:disabled{opacity:.32;cursor:default}
.syp-head--cust .syp-pg-lbl{min-width:96px;text-align:center;font-weight:700;font-size:.9rem;letter-spacing:.01em;color:var(--dv-ink,#101418)}
.syp-head--cust .syp-play--full{width:100%;height:42px;gap:8px;font:inherit;font-weight:700;font-size:.9rem;letter-spacing:.01em;background:var(--dv-ink,#101418);color:#fff;border:1px solid var(--dv-ink,#101418)}
.syp-head--cust .syp-play--full:hover{background:#000}
/* STAFF — one continuous frame: full-width floor carousel header → canvas → nav footer, aligned to
   the same width with no gaps. The header rounds the top, the footer the bottom, the canvas squares to
   join them. */
.syp-floorbar{position:relative;display:flex;align-items:center;justify-content:center;gap:0;padding:9px 12px;background:var(--dv-raise,#F2F2EF);border:1px solid var(--dv-line,#E4E4DF);border-bottom:none;border-radius:14px 14px 0 0;touch-action:pan-y;user-select:none}
.syp-floorbar .syp-fb-nav{display:inline-flex;align-items:center;gap:10px}
.syp-floorbar .syp-fb-arrow{appearance:none;cursor:pointer;width:34px;height:34px;flex:none;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink,#101418);display:inline-flex;align-items:center;justify-content:center;transition:background .15s,opacity .15s}
.syp-floorbar .syp-fb-arrow:hover:not(:disabled){background:#fff;border-color:var(--dv-ink,#101418)}
.syp-floorbar .syp-fb-arrow:disabled{opacity:.26;cursor:default}
.syp-floorbar .syp-fb-fs{position:absolute;right:12px;top:50%;transform:translateY(-50%);appearance:none;cursor:pointer;width:34px;height:34px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink,#101418);display:inline-flex;align-items:center;justify-content:center;transition:background .15s,border-color .15s}
.syp-floorbar .syp-fb-fs:hover{border-color:var(--dv-ink,#101418)}
/* the canvas joins the header seamlessly (square its top corners, no doubled border) */
.syp--staff .syp-plan .ss-embed-frame{border-top-left-radius:0;border-top-right-radius:0;border-top:none}
.syp-head--staff{justify-content:flex-start;padding:0 2px 10px;flex-wrap:nowrap}
/* STAFF workflow rail — relocated directly below the canvas (what mode am I in), centered. */
.syp-railbar{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:12px 2px 10px}
.syp-railbar .syp-play{background:var(--dv-ink,#101418);color:#fff;border:1px solid var(--dv-ink,#101418)}
.syp-railbar .syp-play:hover{background:#000}
/* Floor selector dropdown — compact pill + menu (switch/add/rename/duplicate/delete). Button bg rules
   are scoped under .syp-fsel so they beat the deck's .dv-shell button reset. */
.syp-fsel{position:relative;display:inline-block}
.syp-fsel .syp-fsel-btn{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:8px;font:inherit;font-size:.92rem;font-weight:700;letter-spacing:.01em;color:var(--dv-ink,#101418);background:var(--dv-raise,#F2F2EF);border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;padding:8px 14px;transition:background .15s,border-color .15s}
.syp-fsel .syp-fsel-btn:hover{background:#fff;border-color:var(--dv-ink,#101418)}
.syp-fsel-name{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.syp-fsel-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:40;min-width:224px;background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.14);padding:6px;display:flex;flex-direction:column;gap:1px}
.syp-fsel .syp-fsel-opt{appearance:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;font:inherit;font-size:.88rem;font-weight:600;color:var(--dv-ink,#101418);background:transparent;border:0;border-radius:8px;padding:8px 10px;text-align:left}
.syp-fsel .syp-fsel-opt:hover{background:var(--dv-raise,#F2F2EF)}
.syp-fsel .syp-fsel-opt.on{color:var(--dv-gold,#b98a2e)}
.syp-fsel-optname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.syp-fsel-sep{height:1px;background:var(--dv-line,#E4E4DF);margin:5px 4px}
.syp-fsel .syp-fsel-act{appearance:none;cursor:pointer;font:inherit;font-size:.86rem;font-weight:600;color:var(--dv-ink,#101418);background:transparent;border:0;border-radius:8px;padding:8px 10px;text-align:left}
.syp-fsel .syp-fsel-act:hover:not(:disabled){background:var(--dv-raise,#F2F2EF)}
.syp-fsel .syp-fsel-act:disabled{opacity:.35;cursor:default}
.syp-fsel .syp-fsel-act.danger{color:#c0392b}
.syp-fsel .syp-fsel-act.danger:hover:not(:disabled){background:rgba(192,57,43,.08)}
.syp-fsel-form{padding:6px;display:flex;flex-direction:column;gap:8px;min-width:224px}
.syp-fsel-input{font:inherit;font-size:.9rem;padding:8px 10px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;color:var(--dv-ink,#101418);outline:none;background:#fff}
.syp-fsel-input:focus{border-color:var(--dv-ink,#101418)}
.syp-fsel-confirm{font-size:.88rem;font-weight:600;color:var(--dv-ink,#101418);padding:2px 2px 0}
.syp-fsel-formbtns{display:flex;justify-content:flex-end;gap:8px}
.syp-fsel .syp-fsel-mini{appearance:none;cursor:pointer;font:inherit;font-size:.82rem;font-weight:700;padding:7px 14px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink,#101418)}
.syp-fsel .syp-fsel-mini.primary{background:var(--dv-ink,#101418);color:#fff;border-color:var(--dv-ink,#101418)}
.syp-fsel .syp-fsel-mini.danger{background:#c0392b;color:#fff;border-color:#c0392b}
.syp-pane[hidden]{display:none!important}
/* PLAN pane flows like a document — bound only the MAP, never the whole survey (which would clip the
   camera roster below it). The survey node itself stays auto-height so the roster + comments flow. */
.syp-plan .ss-tool-col,.syp-plan .ss-tool-body{height:auto!important;display:block!important;min-height:0}
.syp-plan .ss-embed{display:flex;flex-direction:column;height:auto}
/* Keep the map taller than 540px on desktop so the survey uses CONTAIN (whole aerial visible + zoomable),
   not the phone COVER mode that crops the sides and blocks zooming back out. */
.syp-plan .ss-embed-frame{flex:0 0 auto;width:100%;height:min(74vh,680px);min-height:560px;border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;background:#fff;display:block}
@media (max-width:700px){ .syp-plan .ss-embed-frame{height:min(64vh,520px);min-height:340px} }
/* PLANNER FULLSCREEN (Phase 2) — .syp is promoted to the top layer by the Fullscreen API (no reparent →
   iframes don't reload) and so covers the whole viewport, hiding the deck header/phase rail that live
   outside it. Keep the floor selector + rail + tools; just give the canvas more of the taller screen. */
/* split into standalone rules — a selector LIST is discarded whole if any member (e.g. an unrecognized
   :-webkit-full-screen) is invalid, which would silently drop the .syp--fs styling too. */
.syp.syp--fs{background:var(--dv-bg,#F7F7F5);overflow:auto;padding:14px clamp(14px,3vw,28px)}
.syp:fullscreen{background:var(--dv-bg,#F7F7F5);overflow:auto;padding:14px clamp(14px,3vw,28px)}
.syp:-webkit-full-screen{background:var(--dv-bg,#F7F7F5);overflow:auto;padding:14px clamp(14px,3vw,28px)}
.syp.syp--fs .syp-plan .ss-embed-frame{height:min(84vh,1200px);min-height:0}
.syp:fullscreen .syp-plan .ss-embed-frame{height:min(84vh,1200px);min-height:0}
.syp:-webkit-full-screen .syp-plan .ss-embed-frame{height:min(84vh,1200px);min-height:0}
/* One workspace, not stacked tools: the header's Plans/Views tabs already name the mode, so drop each
   widget's redundant descriptive tag ("Live survey editor · N floors" / the empty mockup tag) and keep
   only the functional controls (fullscreen, etc.) pinned to the right of a slim bar. */
.syp .ss-embed-tag{display:none}
/* The fullscreen control now lives on the Plans/Views line (syp-head), so the survey's own slim bar is hidden here. */
.syp .ss-embed-bar{display:none}
.syp-empty{text-align:center;padding:40px 16px;color:var(--dv-meta,#787D84);font-size:.86rem;border:1px dashed var(--dv-line,#E4E4DF);border-radius:14px}
/* One submit surface — both tools' Submit/Approve controls, always visible under either mode. */
.syp-submit{margin-top:14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;background:var(--dv-raise,#FBFBFA);padding:6px 16px;display:flex;flex-direction:column}
.syp-submit-head{font:800 11px var(--sans,inherit);letter-spacing:.09em;text-transform:uppercase;color:var(--dv-meta,#787D84);padding:10px 0 4px}
.syp-vpill{font-size:.76rem;font-weight:700;color:var(--dv-meta,#787D84);background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;padding:4px 12px}
.syp-vpill.req{color:var(--dv-gold,#b98a2e);border-color:var(--dv-gold,#b98a2e)}
.syp-submit-row{display:flex;align-items:center;gap:14px;padding:10px 0;flex-wrap:wrap}
.syp-submit-row + .syp-submit-row{border-top:1px solid var(--dv-line,#E4E4DF)}
.syp-submit-lbl{font-size:.8rem;font-weight:700;color:var(--dv-ink,#101418);min-width:96px;flex:0 0 auto}
.syp-submit-row .tab-root{margin-top:0;flex:1 1 auto;border:none;background:transparent;padding:0}
.syp-submit-row .tab-root.slim{padding:0;margin-top:0}
`;

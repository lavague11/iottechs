"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { getToolDataAction } from "./proposal-actions";
import SystemWalkthrough from "./system-walkthrough";
import SurveyDevices from "./survey-devices";
import { toolAccepted } from "./survey-approve";   // fingerprint check — drives the contextual footer CTA
import { subscribeSyncStatus } from "./tool-sync";

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
  // contextual nav footer (staff): canonical submit/approve/continue wiring from the gateway
  surveyOk = false, onContinue = null, onSubmitTool = null, onUnsubmitTool = null,
  svMeta = null, mkMeta = null, acceptances = null,
  initialStep = "layout",   // which rail step to open on ("layout" | "cameras" | "views" | "review")
}) {
  // ONE Consulting rail: Background · Plan · Cameras · Views · Review. railStep is the source of truth.
  // Background/Plan/Cameras are the SAME survey pane — the rail drives its internal step via postMessage
  // (iotSurveyCmd {cmd:"step"}); Views is the mockup pane; Review is the status surface. Both iframes stay
  // mounted (visibility toggles only) so a draft never reloads. paneMode picks which pane is visible.
  // MERGE: a project with no survey yet opens straight to Photos (the merged System Preview) — a
  // preview-only job never has to touch the floor plan. A project that already has a survey opens on Map.
  const [railStep, setRailStep] = useState(() => (initialStep === "layout" && !hasSurvey && !customer) ? "views" : initialStep);
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
  const [bgTool, setBgTool] = useState(null);     // "draw" | "satellite" | null — which build tool is open inside the survey (from iotSurveyStep)
  const [dockState, setDockState] = useState(null); // "satellite" | "draw" | "cameras" | null — the in-canvas bar the survey is showing (ONE BAR: footer hides whenever a dock is up)
  const rootRef = useRef(null);
  const navRef = useRef({});   // latest Back/Next actions for the one-bar in-canvas nav (message handler reads this)
  // Devices roster: expanded by default (desktop unchanged); collapsed on a phone after mount so the list
  // doesn't tower below the canvas. A one-line "Devices (N)" summary toggles it. Default true → no desktop flash.
  const [devOpen, setDevOpen] = useState(true);
  useEffect(() => { try { if (window.matchMedia("(max-width:700px)").matches) setDevOpen(false); } catch { /* no matchMedia */ } }, []);

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

  // Planner-level fullscreen (Phase 2, rev 2) — a CSS overlay, NOT the Fullscreen API. The whole planner
  // (.syp: floor selector + canvas + rail + tools + footer) expands to fill the viewport; only the project
  // header/phase rail (outside .syp) are covered. Why not the Fullscreen API: in some embedders (the Claude
  // preview pane, sandboxed webviews) the fullscreen request is silently ignored — it neither resolves nor
  // rejects — so the old .catch fallback never fired and the ⛶ did nothing. A fixed overlay works
  // everywhere, needs no permission, and never reparents .syp, so both iframes keep their state (no reload,
  // stays fully editable). .syp lives inside a CSS-transformed .dv-slide, which would otherwise be the
  // containing block for position:fixed, so we neutralize that one slide's transform while fullscreen.
  const slideHostRef = useRef(null);
  const enterFs = () => {
    const el = rootRef.current; if (!el) return;
    const slide = el.closest(".dv-slide"); slideHostRef.current = slide || null;
    if (slide) slide.classList.add("syp-fs-host");
    try { document.body.classList.add("syp-fs-lock"); } catch { /* no-op */ }
    setFsOn(true);
  };
  const exitFs = () => {
    if (slideHostRef.current) { slideHostRef.current.classList.remove("syp-fs-host"); slideHostRef.current = null; }
    try { document.body.classList.remove("syp-fs-lock"); } catch { /* no-op */ }
    setFsOn(false);
  };
  // Esc leaves fullscreen (the API's native Esc is gone with it); always clean up the classes on unmount.
  useEffect(() => {
    if (!fsOn) return;
    const onKey = (e) => { if (e.key === "Escape") exitFs(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fsOn]);
  useEffect(() => () => {
    try { if (slideHostRef.current) slideHostRef.current.classList.remove("syp-fs-host"); document.body.classList.remove("syp-fs-lock"); } catch { /* no-op */ }
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
      // One-bar nav: an in-canvas bar (satellite dock / draw dock / map bar) asked to advance or go back.
      // The planner owns the 4-step order, so it resolves dir → the real next/prev step (latest via navRef).
      if (m.type === "iotSurveyNavGo") { if (m.dir === "back") navRef.current.goBack?.(); else navRef.current.goNext?.(); return; }
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
        setBgTool(m.bgTool || null);
        setDockState(m.dock || null);
        // ONE BAR: the rail mirrors the dock the survey is actually showing — satellite→Base, draw→Layout,
        // cameras (the map)→Cameras — so the planner's footer-hide and the dock agree exactly. Views/Review
        // are shell-only (no survey dock), so a dock echo never yanks the rail off them.
        setRailStep((cur) => {
          if (cur === "views" || cur === "review") return cur;
          if (m.dock === "satellite") return "background";
          if (m.dock === "draw") return "layout";
          if (m.dock === "cameras") return "cameras";
          return cur === "background" ? "layout" : cur;   // no dock (chooser) → keep the old Background→Layout nudge
        });
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
    else if (step === "layout") surveyCmd({ cmd: "step", step: 1, focus: "layout" });     // Layout toolset — draw structure / rooms / areas
    else if (step === "cameras") surveyCmd({ cmd: "step", step: 1, focus: "devices" });    // Cameras toolset — place + aim cameras
    // views / review: shell state only — both iframes stay mounted (no map reload between Layout ↔ Cameras)
  };
  // Floor-plan highlight: when the AI resolves a device (coverage answer, or a device-bound flag/feedback),
  // it dispatches `iot-highlight-device`. Surface the survey pane on devices and tell the widget to switch to
  // the device's floor and ring it. Scoped to THIS project; decoupled from the AI bar (a window event).
  useEffect(() => {
    const onHighlight = (e) => {
      const d = e.detail || {};
      if (d.id == null || String(d.accessId || "") !== String(accessId)) return;
      goRail("cameras");
      surveyCmd({ cmd: "highlight", cid: d.cid || null, id: d.id, floor: d.floor });
    };
    window.addEventListener("iot-highlight-device", onHighlight);
    return () => window.removeEventListener("iot-highlight-device", onHighlight);
  }, [accessId]);   // eslint-disable-line react-hooks/exhaustive-deps -- goRail/surveyCmd use refs + stable setters

  const camsPlaced = sig.camCount || camCount;
  // REBUILD → Round 2: FOUR steps. Base (pick a background) · Layout (draw structure/rooms/areas) ·
  // Cameras (place + aim) · Submit (summary + lock). Layout and Cameras are the SAME live map — the rail
  // only swaps the toolset, no reload. Views (Camera Photos) stays reachable via the ••• Go-to menu.
  const steps = [
    { key: "background", label: "Background", done: sig.bgReady, enabled: true },
    { key: "layout", label: "Layout", done: sig.hasPlan || surveySubmitted, enabled: sig.bgReady },
    { key: "cameras", label: "Placement", done: camsPlaced > 0 || surveySubmitted, enabled: sig.bgReady },
    { key: "review", label: "Submit", done: false, enabled: sig.bgReady },
  ];
  // Survey Navigation popover (the top-right ••• ) — Add-Service-modal styling: 2-col icon tiles in the
  // linear order Background · Layout · Placement · Camera Angles · Submit (Camera Angles = the views pane).
  // Each carries a tinted icon + current/completed state; Full screen + Walkthrough move to a Tools section.
  const NAV_ITEMS = [
    { key: "background", label: "Background", color: "#5E7CA3", done: sig.bgReady, enabled: true,
      icon: <><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" /><path d="M9 3v15M15 6v15" /></> },
    { key: "layout", label: "Layout", color: "#B08D4C", done: sig.hasPlan || surveySubmitted, enabled: sig.bgReady,
      icon: <><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 12l10 5 10-5" /><path d="M2 17l10 5 10-5" /></> },
    { key: "cameras", label: "Placement", color: "#4E8C6A", done: camsPlaced > 0 || surveySubmitted, enabled: sig.bgReady,
      icon: <><circle cx="12" cy="10" r="3" /><path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z" /></> },
    { key: "views", label: "Camera Angles", color: "#8673A6", done: hasViews, enabled: sig.bgReady,
      icon: <><path d="M23 19V7a2 2 0 0 0-2-2h-3l-2-2H8L6 5H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2z" /><circle cx="12" cy="13" r="3.5" /></> },
    { key: "review", label: "Submit", color: "#3E7D5A", done: false, enabled: sig.bgReady, span: true,
      icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></> },
  ];
  // ONE popover design (the Survey Navigation panel), used by BOTH the top-bar ••• (drops down) and the
  // footer ••• (drops up). Visual language matches the Add Service modal; nav logic (goRail) is unchanged.
  const renderNavPop = (isOpen, setOpen, placement) => isOpen ? (
    <>
      <div className="syp-navpop-backdrop" onClick={() => setOpen(false)} />
      <div className={`syp-navpop syp-navpop--${placement}`} role="dialog" aria-label="Survey navigation">
        <div className="syp-navpop-head">
          <span className="syp-navpop-title">Survey Navigation</span>
          <button type="button" className="syp-navpop-x" aria-label="Close" onClick={() => setOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
          </button>
        </div>
        <div className="syp-navpop-grid">
          {NAV_ITEMS.map((it) => (
            <button key={it.key} type="button" disabled={!it.enabled}
              className={`syp-navpop-tile${railStep === it.key ? " cur" : ""}${it.span ? " span" : ""}`}
              onClick={() => { if (it.enabled) { goRail(it.key); setOpen(false); } }}>
              <span className="syp-navpop-ic" style={{ color: it.color, background: `${it.color}22` }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
              </span>
              <span className="syp-navpop-name">{it.label}</span>
              {it.done && <span className="syp-navpop-check" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>}
            </button>
          ))}
        </div>
        <div className="syp-navpop-sec">Tools</div>
        <div className="syp-navpop-tools">
          <button type="button" className="syp-navpop-tool" onClick={() => { (fsOn ? exitFs : enterFs)(); setOpen(false); }}>
            <span className="syp-navpop-tool-ic">
              {fsOn
                ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3v4a2 2 0 0 1-2 2H3M21 9h-4a2 2 0 0 1-2-2V3M3 15h4a2 2 0 0 1 2 2v4M15 21v-4a2 2 0 0 1 2-2h4" /></svg>
                : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>}
            </span>{fsOn ? "Exit full screen" : "Full screen"}
          </button>
          {canWalk && (
            <button type="button" className="syp-navpop-tool" onClick={() => { setWalkOpen(true); setOpen(false); }}>
              <span className="syp-navpop-tool-ic"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>Walkthrough
            </button>
          )}
        </div>
      </div>
    </>
  ) : null;

  // CONTEXTUAL NAV FOOTER (staff) — guided Back / Next, ONE step at a time (no skips). "views" (Camera
  // Photos) sits on the Cameras rung for nav purposes but is OUT of the linear Base→Layout→Cameras→Submit.
  // NAV-FIX §3/§4: the linear order is Background → Layout → Placement → Camera Angles → Submit. "views"
  // (Camera Angles) is now a first-class step in the flow, not an out-of-band extra. Back/Next move exactly
  // one step; Next names the NEXT step; the center button shows the CURRENT step.
  const navOrder = ["background", "layout", "cameras", "views", "review"];
  const navIdx = Math.max(0, navOrder.indexOf(railStep));
  const prevStep = navOrder[navIdx - 1] || null;
  const nextStep = navOrder[navIdx + 1] || null;
  const NEXT_PROMPT = { layout: "Layout", cameras: "Placement", views: "Camera Angles", review: "Submit" };
  const STEP_LABEL = { background: "Background", layout: "Layout", cameras: "Placement", views: "Camera Angles", review: "Submit" };
  // NAV-FIX §4: Next is never a silent no-op. It's enabled only when the step's prerequisite is met; otherwise
  // it shows disabled with a short hint. Background→Layout commits the open capture first (see the Next handler).
  const nextGate = (() => {
    if (!nextStep) return { ok: false, hint: "" };
    if (surveySubmitted) return { ok: true, hint: "" };
    if (railStep === "background") {
      if (bgTool === "satellite" || bgTool === "draw" || sig.bgReady) return { ok: true, hint: "" };
      return { ok: false, hint: "Choose a background" };
    }
    if (railStep === "layout") {
      if (sig.hasPlan) return { ok: true, hint: "" };
      return { ok: false, hint: "Draw the structure first" };
    }
    if (!sig.bgReady) return { ok: false, hint: "Set a background first" };
    return { ok: true, hint: "" };
  })();
  const nextEnabled = nextGate.ok;
  const nextHint = nextGate.hint;
  // The Review CTA = the one outstanding canonical action (reuses toolAccepted + the gateway handlers;
  // nothing about the fingerprint/approval architecture changes).
  const svApproved = toolAccepted(svMeta, acceptances && acceptances.site_survey);
  const svSubCurrent = toolAccepted(svMeta, acceptances && acceptances.submit_site_survey);
  const svStale = !!(acceptances && acceptances.submit_site_survey) && !svSubCurrent;
  const mkApproved = toolAccepted(mkMeta, acceptances && acceptances.mockup);
  const mkSubCurrent = toolAccepted(mkMeta, acceptances && acceptances.submit_mockup);
  const mkStale = !!(acceptances && acceptances.submit_mockup) && !mkSubCurrent;
  // REBUILD: ONE Submit button, gated on the SURVEY only. Photos are no longer a submit blocker (they
  // stay editable after submit; only geometry locks). Mockup/Camera-Views submission is dropped from the
  // flow — the mkStale/mkSubCurrent reads remain available but no longer gate the CTA.
  const reviewCta = (() => {
    if (svMeta && svMeta.has && !svApproved) {
      if (svStale) return { label: "Submit", primary: true, act: () => onSubmitTool && onSubmitTool("site_survey") };
      if (svSubCurrent) return { label: "Awaiting customer approval", muted: true };
      return { label: "Submit", primary: true, act: () => onSubmitTool && onSubmitTool("site_survey") };
    }
    if (surveyOk) return { label: "Continue to Proposal →", primary: true, act: () => onContinue && onContinue() };
    return null;
  })();
  void mkStale; void mkSubCurrent; void mkApproved;   // retained reads (mockup state) — no longer gate Submit
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [topMenuOpen, setTopMenuOpen] = useState(false);   // the floor-bar ••• Go-to (reachable when the footer is hidden)

  // ONE BAR (§Round 3): an in-canvas dock (satellite / draw / the Cameras map dock) carries Back + the
  // next-step button on its right, so the planner footer is HIDDEN on those steps — no second stacked bar.
  // The footer stays the single bar only where there is no dock: the empty chooser, Camera Photos, Submit.
  // Driven by the survey's own `dock` echo so the two never disagree; only in the plan pane (not views/review).
  const inCanvasBar = paneMode === "plan" && !!dockState;
  // The in-canvas docks post iotSurveyNavGo{dir}; the planner resolves it to the real next/prev step here.
  navRef.current.goNext = () => {
    if (nextStep && nextEnabled) goRail(nextStep);
    else if (reviewCta && reviewCta.act && !reviewCta.muted) reviewCta.act();
  };
  navRef.current.goBack = () => { if (prevStep) goRail(prevStep); };

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
    setRailStep("layout"); setCurFloor(idx); surveyCmd({ cmd: "floor", i: idx });
  };

  return (
    <div className={`syp${!customer ? " syp--staff" : ""}${fsOn ? " syp--fs" : ""}`} ref={rootRef}>
      <style>{CSS}</style>
      {!customer && <SyncBadge />}

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
        /* NAV-FIX §1/look&feel: ONE top floor bar on every step (including Submit). No Map/Photos toggle and
           no ••• — Survey Navigation lives only in the bottom bar's center button. The switcher is plain text
           with ‹ › arrows: the left arrow hides on Floor 1, the right arrow becomes + on the last floor. */
        <div className="syp-floorbar" onPointerDown={fbDown} onPointerMove={fbMove} onPointerUp={fbUp} onPointerCancel={fbUp}>
          <div className="syp-fb-nav">
            {curFloor > 0 ? (
              <button className="syp-fb-arrow" aria-label="Previous floor" onClick={() => goFloor(curFloor - 1)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              </button>
            ) : <span className="syp-fb-arrow-sp" aria-hidden="true" />}
            <FloorSelect floors={roster} curFloor={curFloor} plain
              onSwitch={goFloor} onAdd={addFloor} onRename={renameFloor} onDuplicate={duplicateFloor} onDelete={deleteFloor} />
            {curFloor >= floorCount - 1 ? (
              <button className="syp-fb-arrow syp-fb-add" aria-label="Add floor" title="Add floor" onClick={addFloor}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            ) : (
              <button className="syp-fb-arrow" aria-label="Next floor" onClick={() => goFloor(curFloor + 1)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Both panes stay mounted; only visibility toggles, so the iframes never reload. The PLAN pane
          flows as a document: the survey MAP gets its own bounded height, and the camera roster flows
          BELOW it (the page scrolls) — never trapped inside a fixed frame that would clip the roster.
          Background/Plan/Cameras all show the survey pane (the rail drove its internal step). */}
      <div className="syp-pane syp-plan" hidden={paneMode !== "plan"}>
        {planNode || <div className="syp-empty">Your site survey will appear here once it&apos;s started.</div>}
      </div>
      {/* Camera Photos — the phone-mockup photo surface, reachable from the ••• Go-to menu. No longer a
          gating "Views" step with a Start/Skip splash; it just shows the photos tool when opened. */}
      <div className="syp-pane" hidden={paneMode !== "views"}>
        {/* Add camera moved under Devices (one home for the camera account); the "+ Add camera" there creates
            an UNPLACED survey camera that appears in the Map tray to drag into place once a base exists. */}
        {viewsNode || <div className="syp-empty">Add each camera&apos;s photo on its device card.</div>}
      </div>
      {/* Submit — a real summary (per-floor plan thumbnail, camera count, cameras missing photos), the
          submitted-lock banner, then the one Submit CTA (the footer approve bars). */}
      {!customer && paneMode === "review" && (
        <div className="syp-review">
          {surveySubmitted && (
            <div className="syp-lockbanner" role="status">
              <span className="syp-lockbanner-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
              </span>
              <span className="syp-lockbanner-t"><b>Submitted — locked.</b> The floor plan and cameras are locked for the customer to approve. Photos stay editable. Use <b>Unsubmit</b> to change the plan.</span>
            </div>
          )}
          <div className="syp-review-h">Review &amp; submit</div>
          <div className="syp-review-sub">Check each floor, then submit for the customer to approve.</div>
          <SubmitSummary floors={floors} roster={roster} onGoPlan={() => goRail("layout")} onGoPhotos={() => goRail("views")} />
          {/* The Submit action lives in the universal bottom bar (center "Submit ▾") — no inline approve bar. */}
        </div>
      )}

      {/* NAV-FIX §1: the ONE shared bottom bar, on EVERY step (incl. Submit). Left = Back (one step back,
          hidden on the first/Background-chooser screen) · Center = "Current step ▾" opening Survey Navigation
          upward · Right = Next (next step name) or, on Submit, the Submit action. Nothing else in the bar. */}
      {!customer && (
        <div className="syp-nav">
          {prevStep ? (
            <button className="syp-nav-back" onClick={() => goRail(prevStep)}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              <span>Back</span>
            </button>
          ) : <span className="syp-nav-side" />}
          <div className="syp-nav-centerwrap">
            <button type="button" className="syp-nav-center" aria-haspopup="menu" aria-expanded={navMenuOpen} onClick={() => setNavMenuOpen((o) => !o)}>
              <span>{STEP_LABEL[railStep] || "Survey"}</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
            </button>
            {renderNavPop(navMenuOpen, setNavMenuOpen, "up-center")}
          </div>
          <div className="syp-nav-side syp-nav-side--right">
            {railStep === "review" ? (
              reviewCta ? (
                <button className={`syp-nav-cta${reviewCta.muted ? " muted" : ""}`} disabled={reviewCta.muted || !reviewCta.act} onClick={reviewCta.act}>{reviewCta.label}</button>
              ) : <span />
            ) : nextStep ? (
              nextEnabled ? (
                <button className="syp-nav-cta" onClick={() => goRail(nextStep)}>{NEXT_PROMPT[nextStep]} <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
              ) : (
                <button className="syp-nav-cta muted" disabled>{nextHint || NEXT_PROMPT[nextStep]}</button>
              )
            ) : <span />}
          </div>
        </div>
      )}

      {/* The DEVICES roster — the camera account. Shared across BOTH tabs (not tied to the survey map),
          so cameras can be named/photographed from either mode. Office-only (customers see cameras in
          the views). */}
      {!devReadOnly && (() => {
        const devCount = (roster || []).reduce((n, f) => n + (f && Array.isArray(f.devices) ? f.devices.length : 0), 0);
        return (
          <div className={`syp-devwrap${devOpen ? " open" : ""}`}>
            {/* Toggle shows only on a phone (CSS) — desktop stays expanded. */}
            <button type="button" className="syp-devtog" aria-expanded={devOpen} onClick={() => setDevOpen((o) => !o)}>
              <span>Devices{devCount ? ` (${devCount})` : ""}</span>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {devOpen && <SurveyDevices accessId={accessId} roster={roster} curFloor={curFloor} readOnly={devReadOnly} locked={devLocked} cmd={surveyCmd} onAddCamera={() => surveyCmd({ cmd: "addCamera", project: accessId })} />}
          </div>
        );
      })()}

      {/* Customer: the Approve surface stays directly below the viewer. (Staff: the submit bars moved
          into the Review pane above; the nav footer carries the headline Submit/Continue CTA.) */}
      {customer && footer}

      {walkOpen && (
        <SystemWalkthrough accessId={accessId} floors={floors} photos={photos} focusCid={selectedCid} customerName={customerName}
          defaultFs onClose={() => setWalkOpen(false)} />
      )}
    </div>
  );
}

// Views entry — shown instead of a second build screen when the mockup was never started. The system
// already knows the cameras, so this just offers Start (open the mockup on those cameras) or Skip for now.
// SYNC STATUS — offline-first indicator. Every change is written to the device first (localStorage,
// survives reload); this badge shows "Offline — will sync" when there's no signal and a queued edit,
// "Saving…" while a change is in flight, and nothing once everything is on the server.
function SyncBadge() {
  const [st, setSt] = useState({ online: true, pending: 0, quota: null });
  useEffect(() => subscribeSyncStatus(setSt), []);
  if (!st.quota && st.online && st.pending === 0) return null;   // all synced, no quota issue → no chrome
  if (st.quota) return (
    <div className="syp-sync off" role="alert" aria-live="assertive" title={st.quota}>
      <span className="syp-sync-dot" aria-hidden="true" />
      <span>{st.quota}</span>
    </div>
  );
  const offline = !st.online && st.pending > 0;
  return (
    <div className={`syp-sync${offline ? " off" : ""}`} role="status" aria-live="polite" title={offline ? "Saved on this device — will upload when you're back online" : "Saving your changes"}>
      <span className="syp-sync-dot" aria-hidden="true" />
      <span>{offline ? "Offline — will sync" : "Saving…"}</span>
    </div>
  );
}

// SUBMIT SUMMARY — the real Step-3 summary: per-floor plan thumbnail, camera count, and a flag for
// cameras still missing a photo. Thumbnails open the Plan; the missing-photo flag opens Camera Photos.
function SubmitSummary({ floors = [], roster = [], onGoPlan, onGoPhotos }) {
  const src = (roster && roster.length) ? roster : floors;
  const list = src.map((f, i) => {
    const devices = Array.isArray(f.devices) ? f.devices : [];
    const cams = devices.filter((d) => d && d.k === "cam");
    const missing = cams.filter((c) => !c.photo).length;
    const bg = (floors[i] && floors[i].bg) || f.bg || null;
    return { name: f.name || `Floor ${i + 1}`, bg, camCount: cams.length, missing };
  });
  if (!list.length) return <div className="syp-summary-empty">Start a floor to see the summary.</div>;
  const totalCams = list.reduce((n, f) => n + f.camCount, 0);
  const totalMissing = list.reduce((n, f) => n + f.missing, 0);
  return (
    <div className="syp-summary">
      {list.map((f, i) => (
        <div className="syp-sum-floor" key={i}>
          <button className="syp-sum-thumb" onClick={onGoPlan} title="Open the floor plan" aria-label={`Open ${f.name} plan`}>
            {f.bg ? <img src={f.bg} alt="" /> : <span className="syp-sum-noimg">No plan</span>}
          </button>
          <div className="syp-sum-meta">
            <div className="syp-sum-name">{f.name}</div>
            <div className="syp-sum-stat">{f.camCount} camera{f.camCount === 1 ? "" : "s"}</div>
            {f.missing > 0 && (
              <button className="syp-sum-flag" onClick={onGoPhotos} title="Add the missing photos">
                {f.missing} missing photo{f.missing === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="syp-sum-total">{totalCams} camera{totalCams === 1 ? "" : "s"} total{totalMissing > 0 ? ` · ${totalMissing} still need a photo` : (totalCams > 0 ? " · all have photos" : "")}</div>
    </div>
  );
}

// FLOOR SELECTOR (staff) — the "where am I" control at the top of the planner. Replaces the survey
// widget's in-canvas floor sheet; drives the SAME canonical floor functions by cmd (switch/add/
// rename/duplicate/delete), so floor logic lives once in the widget. Compact closed; the open menu
// lists floors (✓ current) then Add/Rename/Duplicate/Delete acting on the current floor. Rename and
// Delete resolve inline (no native dialogs), matching the vault-dark system.
function FloorSelect({ floors = [], curFloor = 0, plain = false, onSwitch, onAdd, onRename, onDuplicate, onDelete }) {
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
    <div className={`syp-fsel${plain ? " plain" : ""}`} ref={ref}>
      <button className="syp-fsel-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
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
/* Submitted-lock banner + Submit summary (Step 3) */
.syp-lockbanner{display:flex;align-items:flex-start;gap:9px;padding:10px 12px;margin-bottom:12px;border:1px solid rgba(196,85,61,.3);background:rgba(196,85,61,.08);border-radius:12px;color:#8a3a28}
.syp-lockbanner-ico{flex:none;margin-top:1px}
.syp-lockbanner-t{font-size:.82rem;line-height:1.4}
.syp-summary{display:flex;flex-direction:column;gap:10px;margin:12px 0 14px}
.syp-summary-empty{font-size:.84rem;color:var(--dv-meta,#787D84);margin:10px 0}
.syp-sum-floor{display:flex;align-items:center;gap:12px;padding:8px;border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:var(--dv-bg,#fff)}
.syp-sum-thumb{flex:none;width:92px;height:62px;border-radius:9px;overflow:hidden;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#F2F2EF);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}
.syp-sum-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.syp-sum-noimg{font-size:.72rem;color:var(--dv-meta,#787D84)}
.syp-sum-meta{min-width:0;display:flex;flex-direction:column;gap:2px}
.syp-sum-name{font-weight:700;font-size:.9rem;color:var(--dv-ink,#101418)}
.syp-sum-stat{font-size:.8rem;color:var(--dv-meta,#787D84)}
.syp-sum-flag{align-self:flex-start;margin-top:2px;font:inherit;font-size:.74rem;font-weight:700;color:#8a3a28;background:rgba(196,85,61,.1);border:1px solid rgba(196,85,61,.28);border-radius:100px;padding:2px 9px;cursor:pointer}
.syp-sum-flag:hover{background:rgba(196,85,61,.18)}
.syp-sum-total{font-size:.82rem;color:var(--dv-meta,#787D84);font-weight:600}
.syp-vstart{border:1px dashed var(--dv-line,#E4E4DF);border-radius:14px;background:var(--dv-raise,#FBFBFA);padding:26px 18px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px}
.syp-vstart-h{font-size:1rem;font-weight:800;color:var(--dv-ink,#101418)}
.syp-vstart-sub{font-size:.84rem;color:var(--dv-meta,#787D84);max-width:420px}
.syp-vstart-actions{display:inline-flex;gap:10px;margin-top:10px}
.syp-vbtn{appearance:none;cursor:pointer;font:inherit;font-size:.84rem;font-weight:700;padding:9px 18px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink,#101418)}
.syp-vbtn:hover{border-color:var(--dv-ink,#101418)}
.syp-vbtn.primary{background:var(--dv-ink,#101418);color:#fff;border-color:var(--dv-ink,#101418)}
.syp-vbtn.primary:hover{background:#000}
/* Devices roster collapse — desktop shows the roster with no toggle; a phone gets a one-line "Devices (N)"
   summary that expands on tap (default collapsed via the mount effect). */
.syp-devtog{display:none}
@media (max-width:700px){
  .syp-devtog{display:flex;align-items:center;justify-content:space-between;width:100%;appearance:none;cursor:pointer;
    font:inherit;font-weight:700;font-size:.9rem;color:var(--dv-ink,#101418);background:var(--dv-raise,#FBFBFA);
    border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;padding:12px 14px;margin-top:8px}
  .syp-devwrap.open .syp-devtog svg{transform:rotate(180deg)}
  .syp-devtog svg{transition:transform .18s}
}
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
/* Flex row: [view toggle] [floor nav — flex, centered] [•••]. Flex (not centered-with-absolute-edges) so the
   three groups always share the width and never overlap on a phone. */
.syp-floorbar{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;padding:9px 12px;background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-bottom:none;border-radius:14px 14px 0 0;touch-action:pan-y;user-select:none}
.syp-floorbar .syp-fb-nav{min-width:0;display:inline-flex;align-items:center;justify-content:center;gap:4px}
.syp-floorbar .syp-fb-arrow-sp{width:34px;height:34px;flex:none}
/* plain-text floor switcher (look&feel): no pill/bg/border on the button — just the name + ▾. */
.syp-floorbar .syp-fsel.plain .syp-fsel-btn{background:transparent;border-color:transparent;min-width:0;padding:8px 10px;font-size:.98rem}
.syp-floorbar .syp-fsel.plain .syp-fsel-btn:hover{background:var(--dv-raise,#F6F6F4);border-color:transparent}
/* Offline-first sync badge — top-right of the planner, above the canvas. */
.syp{position:relative}
.syp-sync{position:absolute;top:6px;right:8px;z-index:30;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:100px;font-size:.72rem;font-weight:700;letter-spacing:.01em;background:var(--dv-ink,#101418);color:#fff;box-shadow:0 2px 8px rgba(16,20,24,.25)}
.syp-sync.off{background:#8a3a28}
.syp-sync-dot{width:7px;height:7px;border-radius:50%;background:#fff;opacity:.9;animation:sypSyncPulse 1.1s ease-in-out infinite}
@keyframes sypSyncPulse{0%,100%{opacity:.35}50%{opacity:1}}
/* Map / Photos — ONE toggle button, pinned left of the centered floor selector. Shows the current view +
   a swap glyph; tapping flips to the other. (Was two buttons that overlapped the right controls on a phone.) */
.syp-floorbar .syp-fb-viewtog{flex:none;display:inline-flex;align-items:center;gap:6px;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;font-weight:700;letter-spacing:.01em;color:var(--dv-ink,#101418);background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;padding:6px 13px;transition:border-color .15s}
.syp-floorbar .syp-fb-viewtog:hover{border-color:var(--dv-ink,#101418)}
.syp-floorbar .syp-fb-viewtog svg{color:var(--dv-meta,#787D84);flex:none}
@media (max-width:640px){ .syp-floorbar .syp-fb-viewtog{padding:6px 11px;font-size:.76rem} }
.syp-floorbar .syp-fb-arrow{appearance:none;cursor:pointer;width:34px;height:34px;flex:none;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink,#101418);display:inline-flex;align-items:center;justify-content:center;transition:background .15s,opacity .15s}
.syp-floorbar .syp-fb-arrow:hover:not(:disabled){background:#fff;border-color:var(--dv-ink,#101418)}
.syp-floorbar .syp-fb-arrow:disabled{opacity:.26;cursor:default}
.syp-floorbar .syp-fb-fs{appearance:none;cursor:pointer;width:34px;height:34px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink,#101418);display:inline-flex;align-items:center;justify-content:center;transition:background .15s,border-color .15s}
.syp-floorbar .syp-fb-fs:hover{border-color:var(--dv-ink,#101418)}
/* ••• Go-to — right-edge control (Full screen now lives inside its menu). position:relative so its drop-down anchors here. */
.syp-floorbar .syp-fb-morewrap{position:relative;flex:none}
.syp-floorbar .syp-fb-morewrap .syp-fb-fs{position:static;transform:none}
.syp-nav-menu.syp-nav-menu--top{top:calc(100% + 8px);bottom:auto}
/* the canvas joins the header seamlessly (square its top corners, no doubled border) */
.syp--staff .syp-plan .ss-embed-frame{border-top-left-radius:0;border-top-right-radius:0;border-top:none}
.syp-head--staff{justify-content:flex-start;padding:0 2px 10px;flex-wrap:nowrap}
/* STAFF contextual nav footer — the bottom of the one frame. Guided Back / Next·prompt / CTA, + ••• Go-to. */
/* NAV-FIX §1: the shared bottom bar — Back (left) · Current step ▾ (center) · Next/Submit (right). Pure
   white, thin top border. The two sides flex:1 so the center button is truly centered on every step. */
.syp-nav{display:flex;align-items:center;gap:8px;padding:9px 14px;background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-top:none;border-radius:0 0 14px 14px;min-height:58px}
.syp-nav > .syp-nav-back,.syp-nav > .syp-nav-side{flex:1 1 0;min-width:0}
.syp-nav .syp-nav-back{display:inline-flex;align-items:center;gap:6px;justify-content:flex-start;appearance:none;cursor:pointer;font:inherit;font-size:.86rem;font-weight:700;color:var(--dv-meta,#787D84);background:transparent;border:0;padding:8px 4px;border-radius:100px}
.syp-nav .syp-nav-back:hover{color:var(--dv-ink,#101418)}
.syp-nav-side{display:inline-flex;align-items:center}
.syp-nav-side--right{justify-content:flex-end}
.syp-nav-centerwrap{position:relative;flex:0 0 auto;display:inline-flex}
.syp-nav-center{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:.92rem;font-weight:800;letter-spacing:.01em;color:var(--dv-ink,#101418);background:transparent;border:0;padding:8px 12px;border-radius:100px;white-space:nowrap}
.syp-nav-center:hover{background:var(--dv-raise,#F6F6F4)}
.syp-nav-center svg{color:var(--dv-meta,#787D84);flex:none}
.syp-nav-hint{font-size:.82rem;font-weight:600;letter-spacing:.01em;color:var(--dv-meta,#787D84);white-space:nowrap}
.syp-nav .syp-nav-cta{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:.88rem;font-weight:800;letter-spacing:.01em;padding:10px 18px;border-radius:100px;border:1px solid var(--dv-ink,#101418);background:var(--dv-ink,#101418);color:#fff;transition:background .15s;white-space:nowrap}
.syp-nav .syp-nav-cta:hover:not(:disabled){background:#000}
.syp-nav .syp-nav-cta.muted{background:transparent;color:var(--dv-meta,#787D84);border-color:var(--dv-line,#E4E4DF);cursor:default;font-weight:700}
.syp-nav-morewrap{position:relative;display:inline-block}
.syp-nav .syp-nav-more{appearance:none;cursor:pointer;width:38px;height:38px;flex:none;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;color:var(--dv-ink,#101418);display:inline-flex;align-items:center;justify-content:center;transition:border-color .15s}
.syp-nav .syp-nav-more:hover{border-color:var(--dv-ink,#101418)}
.syp-nav-backdrop{position:fixed;inset:0;z-index:39}
.syp-nav-menu{position:absolute;bottom:calc(100% + 8px);right:0;z-index:40;min-width:206px;background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.16);padding:6px;display:flex;flex-direction:column;gap:1px}
.syp-nav-menu-h{font-size:.66rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--dv-meta,#787D84);padding:7px 10px 4px}
.syp-nav .syp-nav-mi{appearance:none;cursor:pointer;display:flex;align-items:center;gap:9px;font:inherit;font-size:.86rem;font-weight:600;color:var(--dv-ink,#101418);background:transparent;border:0;border-radius:8px;padding:8px 10px;text-align:left}
.syp-nav .syp-nav-mi:hover:not(:disabled){background:var(--dv-raise,#F2F2EF)}
.syp-nav .syp-nav-mi.on{color:var(--dv-gold,#b98a2e)}
.syp-nav .syp-nav-mi:disabled{opacity:.34;cursor:default}
.syp-nav-mi-dot{width:14px;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dv-gold,#b98a2e);font-size:11px}
.syp-nav-sep{height:1px;background:var(--dv-line,#E4E4DF);margin:5px 4px}
/* SURVEY NAVIGATION popover — the Add-Service-modal design language (white/paper surface, soft border,
   big shadow, rounded, 2-col icon tiles). Used by both the top ••• (drops down) and the footer ••• (up). */
.syp-navpop-backdrop{position:fixed;inset:0;z-index:1200}
.syp-navpop{position:absolute;right:0;z-index:1201;width:440px;max-width:calc(100vw - 20px);background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:16px;box-shadow:0 18px 48px rgba(16,20,24,.24);overflow:hidden}
.syp-navpop--down{top:calc(100% + 8px);bottom:auto}
.syp-navpop--up{bottom:calc(100% + 8px);top:auto}
.syp-navpop--up-center{bottom:calc(100% + 10px);top:auto;left:50%;right:auto;transform:translateX(-50%)}
.syp-navpop-head{display:flex;align-items:center;gap:9px;padding:15px 16px 9px}
.syp-navpop-title{font-size:1rem;font-weight:700;color:var(--dv-ink,#101418)}
.syp-navpop-x{margin-left:auto;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border:none;background:none;color:var(--dv-meta,#787D84);cursor:pointer;border-radius:8px}
.syp-navpop-x:hover{background:rgba(16,20,24,.05);color:var(--dv-ink,#101418)}
.syp-navpop-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:2px 14px 8px}
.syp-navpop-tile{display:flex;align-items:center;gap:12px;width:100%;min-height:54px;padding:9px 12px;border:1px solid transparent;border-radius:12px;background:none;cursor:pointer;font-family:inherit;text-align:left;transition:background .13s,border-color .13s}
.syp-navpop-tile:hover:not(:disabled){background:var(--dv-raise,#FBFBFA);border-color:var(--dv-line,#E4E4DF)}
.syp-navpop-tile.cur{background:var(--dv-raise,#FBFBFA);border-color:var(--dv-ink,#101418)}
.syp-navpop-tile.span{grid-column:1 / -1}
.syp-navpop-tile:disabled{opacity:.42;cursor:default}
.syp-navpop-ic{flex:0 0 auto;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px}
.syp-navpop-name{flex:1;min-width:0;font-size:.9rem;font-weight:600;color:var(--dv-ink,#101418)}
.syp-navpop-tile.cur .syp-navpop-name{font-weight:800}
.syp-navpop-check{flex:0 0 auto;display:inline-flex;align-items:center;color:var(--dv-gold-text,#8A6A1F)}
.syp-navpop-sec{font-size:.66rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--dv-meta,#787D84);padding:9px 18px 4px;border-top:1px solid var(--dv-line,#E4E4DF);margin-top:2px}
.syp-navpop-tools{display:flex;flex-direction:column;padding:2px 10px 12px;gap:2px}
.syp-navpop-tool{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:1px solid transparent;border-radius:10px;background:none;cursor:pointer;font-family:inherit;font-size:.86rem;font-weight:600;color:var(--dv-ink,#101418);text-align:left}
.syp-navpop-tool:hover{background:var(--dv-raise,#FBFBFA);border-color:var(--dv-line,#E4E4DF)}
.syp-navpop-tool-ic{flex:0 0 auto;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(16,20,24,.05);color:var(--dv-meta,#787D84)}
@media (max-width:560px){.syp-navpop{width:min(440px,calc(100vw - 20px))}.syp-navpop-grid{grid-template-columns:1fr 1fr}}
/* Floor selector dropdown — compact pill + menu (switch/add/rename/duplicate/delete). Button bg rules
   are scoped under .syp-fsel so they beat the deck's .dv-shell button reset. */
.syp-fsel{position:relative;display:inline-block;min-width:0}
.syp-fsel .syp-fsel-btn{appearance:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;max-width:100%;font:inherit;font-size:.92rem;font-weight:700;letter-spacing:.01em;color:var(--dv-ink,#101418);background:var(--dv-raise,#F2F2EF);border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;padding:9px 22px;min-width:220px;transition:background .15s,border-color .15s}
.syp-fsel .syp-fsel-btn:hover{background:#fff;border-color:var(--dv-ink,#101418)}
.syp-fsel-name{max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
/* On a phone the selector shrinks (no 220px floor) so it fits between the toggle and ••• — the name truncates. */
@media (max-width:640px){
  .syp-fsel .syp-fsel-btn{min-width:0;padding:9px 14px;font-size:.86rem}
  .syp-fsel-name{max-width:none;min-width:0}
}
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
/* PLANNER FULLSCREEN (Phase 2, rev 2) — a CSS overlay (no Fullscreen API; see enterFs). .syp becomes a
   fixed, viewport-filling layer that covers the deck header/phase rail (which live outside it). It never
   reparents, so the iframes keep their state (no reload) and stay editable. 100dvh + safe-area for mobile. */
.syp.syp--fs{position:fixed;inset:0;z-index:9999;width:100vw;height:100dvh;background:var(--dv-bg,#F7F7F5);
  overflow:auto;padding:14px clamp(14px,3vw,28px);padding-bottom:calc(14px + env(safe-area-inset-bottom,0px))}
/* .syp sits inside a translateX-ed .dv-slide. BOTH its transform AND its will-change:transform make that
   slide the containing block for position:fixed (will-change does so even when transform is none), which
   would clip the overlay to the slide. Neutralize both (and overflow) on just that slide while fullscreen
   so the overlay resolves against the viewport. */
.dv-slide.syp-fs-host{transform:none!important;will-change:auto!important;overflow:visible!important}
body.syp-fs-lock{overflow:hidden}
.syp.syp--fs .syp-plan .ss-embed-frame{height:min(82vh,1200px);min-height:0}
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

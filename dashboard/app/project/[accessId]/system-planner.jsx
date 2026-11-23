"use client";
import { useState, useEffect, useMemo, useRef, useId } from "react";
import { getToolDataAction } from "./proposal-actions";
import SystemWalkthrough from "./system-walkthrough";
import SurveyDevices from "./survey-devices";
import { toolAccepted } from "./survey-approve";   // fingerprint check — drives the contextual footer CTA
import { subscribeSyncStatus, retryToolSync } from "./tool-sync";
import { rosterFromSurvey, surveyLastStep, surveyEditedAfterSubmit, surveyFloors } from "../../../lib/survey-state";
import { stepAfter, stepBefore, railFromEcho, FLOOR_BAR_STEPS } from "../../../lib/survey-rail";
import { routeTotal } from "../../../lib/survey-routes";

// Projects whose rail the user has navigated in this session. Module scope on purpose: a per-mount
// ref resets on remount, and the saved lastStep would then be re-applied over the step they chose.
const _navTouched = new Set();

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
  surveyOk = false, onContinue = null, onSubmitTool = null, onUnsubmitTool = null, onClose = null,
  svMeta = null, mkMeta = null, acceptances = null,
  canUnlock = false,        // can(role,"survey.unlock") — may this viewer reopen a submitted survey? (enforced again server-side)
  initialStep = null,       // forces a rail step ("layout" | "cameras" | "views" | "review"); null → resume the saved last step
}) {
  // ONE Consulting rail: Background · Plan · Cameras · Views · Review. railStep is the source of truth.
  // Background/Plan/Cameras are the SAME survey pane — the rail drives its internal step via postMessage
  // (iotSurveyCmd {cmd:"step"}); Views is the mockup pane; Review is the status surface. Both iframes stay
  // mounted (visibility toggles only) so a draft never reloads. paneMode picks which pane is visible.
  // NAV-FIX §7: on load/refresh, staff always open in a MAP step (never Photos / Camera Angles). Default to
  // the given step unless it's "views" — then open Layout (Map). The customer branch keeps its own entry.
  // SECTION L: the rail step is the "last_step" a reopen must resume at. It is persisted in the survey2
  // blob (additive `lastStep`) by the widget, and read back from the SERVER row below — so Edit → always
  // landing on Layout is gone. An explicit initialStep (a deep link) still wins.
  // R3: the flow starts at Background. A deep-linked initialStep still wins; only the fallback moved.
  const [railStep, setRailStep] = useState(() => customer ? (initialStep || "background") : (initialStep && initialStep !== "views" ? initialStep : "background"));
  const navTouched = useRef(!!initialStep);   // once the user (or a deep link) picks a step, the saved step stops being adopted
  const [sig, setSig] = useState({ bgReady: hasSurvey, hasPlan: hasSurvey, camCount: hasCams ? 1 : 0 });  // survey completion signals, seeded from server props, kept live by iotSurveyStep
  const railRef = useRef(railStep);   // latest rail step for the message handler (its effect closes over first render)
  railRef.current = railStep;
  const pendingRef = useRef(null);   // the step the shell asked the survey for and hasn't seen arrive (see railFromEcho)
  const [synced, setSynced] = useState(false);   // the survey iframe has LOADED its saved state — from then on ITS hasPlan signal outranks the saved copy
  const paneMode = railStep === "views" ? "views" : railStep === "review" ? "review" : "plan";
  // Views optionality (P5): if the mockup was never started, show a Start/Skip strip instead of a second
  // build screen. Local state gives instant feedback; onSkipViews persists the skip for the phase gate.
  const [viewsStarted, setViewsStarted] = useState(hasViews);
  const [skipped, setSkipped] = useState(mockupSkipped);
  const persistSkip = (v) => { setSkipped(v); if (onSkipViews) Promise.resolve(onSkipViews(v)).catch(() => {}); };
  const [walkOpen, setWalkOpen] = useState(false);
  const [selectedCid, setSelectedCid] = useState(null);   // the one camera the user picked — shared across modes
  const [rosterUndo, setRosterUndo] = useState(null);   // newest undoable delete token the widget still holds
  const [liveRoster, setRoster] = useState([]);  // the survey iframe's LIVE device echo; `roster` (below) falls back to the SAVED list
  const [curFloor, setCurFloor] = useState(0);
  const [fsOn, setFsOn] = useState(false);        // planner-level fullscreen (owns the floor context + rail + tools)
  const [bgTool, setBgTool] = useState(null);     // "draw" | "satellite" | null — which build tool is open inside the survey (from iotSurveyStep)
  const [plateH, setPlateH] = useState(null);     // px of frame the plan actually needs (from iotSurveyPlate) — sizes the frame on phones
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
  const goFloor = (i) => {
    if (i === curFloor) return; setCurFloor(i); surveyCmd({ cmd: "floor", i });
    // On Background the new floor must SHOW its Background (view only — no editor): a floor switch otherwise
    // leaves the widget on the Setup canvas while the rail still says Background.
    if (railRef.current === "background") { pendingRef.current = "background"; surveyCmd({ cmd: "step", step: 0, focus: "view" }); }
  };
  // NAV-FIX §8: adding a floor after submit UNLOCKS the survey (so the new floor is editable), then adds it.
  const addFloor = () => { if (surveySubmitted && onUnsubmitTool) { try { Promise.resolve(onUnsubmitTool("site_survey")).catch(() => {}); } catch { /* best-effort unlock */ } } surveyCmd({ cmd: "addFloor" }); };
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
      else if (m.type === "iotSurveyDevices") { setRoster(Array.isArray(m.floors) ? m.floors : []); setCurFloor(m.curFloor || 0); setRosterUndo(m.undo || null); }
      // The shape of the current floor's plan. On a phone the frame is a fixed height, so a landscape
      // aerial contained into it was a thin band with empty grid above and below; this lets the frame
      // take the plan's own shape instead. null (chooser / Build gate / no background) → keep the
      // fixed height, because there is no plan to take a shape from.
      else if (m.type === "iotSurveyPlate") setPlateH(Number(m.wantHeight) > 0 ? Math.round(Number(m.wantHeight)) : null);
      // A rename made INSIDE the mockup (it already persisted to survey2 by cid) → relay to the survey
      // iframe so the live map/Devices strip reflect it immediately, closing the sync loop both ways.
      else if (m.type === "iotMockupRenamed" && m.cid) { post("Site Survey", { type: "iotSurveyCmd", cmd: "renameCid", project: accessId, cid: m.cid, name: m.name || "" }); }
      // The survey echoes its internal step + completion signals → keep the rail indicator honest and follow
      // the Background→Setup auto-advance (after Done). Plan/Cameras/Review are distinguished shell-side, so
      // within Setup (step 1) we only auto-advance OFF Background; an explicit Plan/Cameras/Review stays put.
      else if (m.type === "iotSurveyStep") {
        setSig({ bgReady: !!m.bgReady, hasPlan: !!m.hasPlan, camCount: +m.camCount || 0 });
        // Only a LOADED survey's hasPlan is trustworthy: an echo before restore() finishes (or after it failed)
        // reports an empty floor, and trusting it would hide a saved structure behind "Draw the structure first".
        if (m.loaded && !m.loadFailed) setSynced(true);
        setBgTool(m.bgTool || null);
        // ONE BAR: the rail mirrors the dock the survey is actually showing (railFromEcho owns the rules and
        // never skips a step). Views/Review are shell-only, so a dock echo never yanks the rail off them.
        const r = railFromEcho(railRef.current, m.dock || null, pendingRef.current, typeof m.step === "number" ? m.step : null);
        pendingRef.current = r.pending;
        if (r.step !== railRef.current) { railRef.current = r.step; setRailStep(r.step); }
        if (r.reissue) surveyCmd({ cmd: "step", step: 1, focus: "layout" });   // a background commit lands on the Setup canvas — open the Layout editor it owes us
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

  // Load the survey placements + view photos once, for the walkthrough (same shape SystemVisualize used).
  // This is also the DATABASE-FIRST read for section L: the saved survey2 blob is what the saved device
  // roster and the resumed rail step come from, before the iframe has said anything.
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

  // ONE SAVED DEVICE LIST (section L's "View 1 of 8 · CAM 1" vs "No cameras yet"). `liveRoster` is the
  // survey iframe's live echo; it is empty until the iframe loads and reports — and stayed empty for good
  // after a failed restore — while Camera Angles read the server row through getProjectCameras and showed
  // 8 cameras. The saved blob is now the fallback, so both surfaces read the same list and the Devices
  // strip never claims "No cameras yet" while the database holds devices.
  const savedRoster = useMemo(() => rosterFromSurvey(sv), [sv]);
  const roster = liveRoster.length ? liveRoster : savedRoster;

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

  // RESUME THE LAST STEP — load from the database first, then render. The saved step is adopted exactly
  // once, and only while the user hasn't navigated (a deep-linked initialStep also counts as navigation).
  // A saved "background" resumes on Background — where the user left off. It only SHOWS the step (view focus):
  // a passive restore never opens the background editor; only a click does. Submitted surveys
  // resume on Approval in review mode — surveyLastStep decides that from the server's acceptance row.
  // The resume runs ONCE per project per session. navTouched is a ref, so a remount used to reset it and
  // the saved lastStep would be re-applied over a step the user had just navigated to — the rail moving
  // on its own, under them. _navTouched is module-scope and keyed by project, so once someone has
  // navigated this survey, nothing re-adopts behind their back.
  const stepAdopted = useRef(false);
  useEffect(() => {
    if (sv == null || stepAdopted.current || navTouched.current || _navTouched.has(accessId)) return;
    stepAdopted.current = true;
    const want = surveyLastStep(sv, { submitted: !!surveySubmitted });
    if (customer) return;                        // the customer's entry is their own (floor pager), never the staff rail
    if (want !== railStep) goRail(want, { view: true });   // same path as a click, so the pane/toolset lands exactly where it would
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sv, surveySubmitted]);

  // Navigate the rail. Background/Plan/Cameras drive the SAME survey pane's internal step (postMessage,
  // no reload); Views/Review are shell-only. Internal users can jump to any completed section freely.
  // CHRONOLOGICAL. Next and Back move exactly ONE step per activation. The footer CTA re-labels itself
  // in place the moment the rail moves — Layout's "Placement" becomes Placement's "Route" at the same
  // screen position — so a second activation arriving during that re-render lands on the NEW label and
  // advances twice ("I clicked Placement and it went to Route"). A short lock makes one press mean one
  // step. Survey Navigation is explicitly exempt: jumping to any step is what it is for.
  const navLockT = useRef(0);
  const goRail = (step, { view = false, jump = false } = {}) => {
    const now = Date.now();
    if (!jump && !view) {
      if (now - navLockT.current < 450) return;   // one press, one step
      navLockT.current = now;
    }
    navTouched.current = true;
    _navTouched.add(accessId);   // survives a remount — see the resume effect
    railRef.current = step;
    pendingRef.current = step === "layout" || step === "background" ? step : null;   // cleared when it arrives (railFromEcho)
    setRailStep(step);
    // Persist it as the survey's last step (the widget owns the blob; we only tell it where we are).
    surveyCmd({ cmd: "railStep", step });
    // R2: Background is a destination, not an editor. It used to reopen the background tool, and on a
    // floor whose background came from the DRAW tool that reopened the Structure editor — which echoes
    // dock "draw", so the rail was dragged straight back to Layout. That is why Back stuck on Layout and
    // why the nav Background tile appeared to do nothing. Showing the step is always focus:"view";
    // changing the background stays an explicit click on the floor actions.
    if (step === "background") surveyCmd({ cmd: "step", step: 0, focus: "view" });
    else if (step === "layout") surveyCmd({ cmd: "step", step: 1, focus: "layout" });     // Layout toolset — draw structure / rooms / areas
    else if (step === "cameras") surveyCmd({ cmd: "step", step: 1, focus: "devices" });    // Cameras toolset — place + aim cameras
    else if (step === "route") surveyCmd({ cmd: "step", step: 1, focus: "route" });        // Route toolset — head-end + cable runs over the placed devices
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
  // Runs drawn, read from the SAVED blob rather than an iframe echo: the Route tile's ✓ has to be
  // right the moment the survey reopens, before the widget has said anything (same reason the roster
  // and Camera Angles read the blob — see lib/survey-state.js).
  const routesDrawn = useMemo(() => routeTotal(surveyFloors(sv)), [sv]);
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
    // Route (the wiring diagram) sits after Placement: runs are drawn from placed devices back to the
    // head-end, so there is nothing to draw from until Placement has happened.
    { key: "route", label: "Route", color: "#1F8E93", done: routesDrawn > 0 || surveySubmitted, enabled: sig.bgReady,
      icon: <><path d="M4 20v-6a3 3 0 0 1 3-3h7a3 3 0 0 0 3-3V4" /><circle cx="4" cy="21" r="1.6" /><circle cx="20" cy="3" r="1.6" /></> },
    { key: "views", label: "Camera Angles", color: "#8673A6", done: hasViews, enabled: sig.bgReady,
      icon: <><path d="M23 19V7a2 2 0 0 0-2-2h-3l-2-2H8L6 5H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2z" /><circle cx="12" cy="13" r="3.5" /></> },
    { key: "review", label: "Approval", color: "#3E7D5A", done: false, enabled: sig.bgReady, span: true,
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
              onClick={() => { if (it.enabled) { goRail(it.key, { jump: true }); setOpen(false); } }}>
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
  // Order + one-step moves live in lib/survey-rail (RAIL_STEPS = Background, Layout, Placement, Camera Angles, Approval).
  const prevStep = stepBefore(railStep);
  const nextStep = stepAfter(railStep);
  const NEXT_PROMPT = { layout: "Layout", cameras: "Placement", route: "Route", views: "Camera Angles", review: "Approval" };
  const STEP_LABEL = { background: "Background", layout: "Layout", cameras: "Placement", route: "Route", views: "Camera Angles", review: "Approval" };
  // Camera Angles: photos are OPTIONAL. With none attached, Next reads "Skip" and still goes to Approval
  // (section L) — so the step never reads as a requirement the user has to satisfy.
  const camsWithPhoto = (roster || []).reduce((n, f) => n + (Array.isArray(f?.devices) ? f.devices : []).filter((d) => d && d.k === "cam" && d.photo).length, 0);
  const nextLabel = (step) => (railStep === "views" && camsWithPhoto === 0 ? "Skip" : NEXT_PROMPT[step]);
  // NAV-FIX §4: Next is never a silent no-op. It's enabled only when the step's prerequisite is met; otherwise
  // it shows disabled with a short hint. Background→Layout commits the open capture first (see the Next handler).
  const nextGate = (() => {
    if (!nextStep) return { ok: false, hint: "" };
    if (surveySubmitted) return { ok: true, hint: "" };
    if (railStep === "background") {
      if (bgTool === "satellite" || bgTool === "draw" || sig.bgReady) return { ok: true, hint: "" };
      return { ok: false, hint: "Choose a background" };
    }
    // Layout does NOT gate Placement. It used to: Next stayed dead behind "Draw the structure first"
    // until the floor reported a structure, which meant a floor whose outline was plainly drawn on
    // screen could still refuse to advance — the live signal and the saved floor disagreeing is enough
    // to block someone looking straight at their own building. Blocking on a derived signal is the
    // wrong trade here: the house rule is to gate on the EARLIEST valid signal and show an "awaiting"
    // state rather than a locked door. The Layout step's ✓ still tracks whether a structure exists, so
    // the information is kept — it just stops being a blocker.
    if (railStep === "layout") return { ok: true, hint: "" };
    if (!sig.bgReady) return { ok: false, hint: "Set a background first" };
    return { ok: true, hint: "" };
  })();
  const nextEnabled = nextGate.ok;
  const nextHint = nextGate.hint;
  const navHintId = useId();   // names the quiet gate reason to the disabled Next (aria-describedby)
  // The Review CTA = the one outstanding canonical action (reuses toolAccepted + the gateway handlers;
  // nothing about the fingerprint/approval architecture changes).
  const svApproved = toolAccepted(svMeta, acceptances && acceptances.site_survey);
  const svSubCurrent = toolAccepted(svMeta, acceptances && acceptances.submit_site_survey);
  const svStale = !!(acceptances && acceptances.submit_site_survey) && !svSubCurrent;
  const mkApproved = toolAccepted(mkMeta, acceptances && acceptances.mockup);
  const mkSubCurrent = toolAccepted(mkMeta, acceptances && acceptances.submit_mockup);
  const mkStale = !!(acceptances && acceptances.submit_mockup) && !mkSubCurrent;
  // NAV-FIX §8: Submit is blocked until every floor is complete. A real gap is: a floor with no background,
  // or a PLACED camera with no photo. A floor with no cameras is fine (never flagged). Each gap links to the
  // step that fixes it. (Cameras stay a system-wide account; this only checks per-floor completeness.)
  const surveyGaps = (() => {
    const gaps = [];
    (floors || []).forEach((f, i) => {
      const name = f.name || `Floor ${i + 1}`;
      const hasBase = !!(f.bg || (f.ctx && f.ctx.src) || f.aerial || f.bgSource);
      if (!hasBase) { gaps.push({ floor: i, name, label: "Needs a background", step: "background" }); return; }
      const cams = (f.cams || (f.devices || []).filter((d) => d.k === "cam")).filter((d) => d.placed !== false);
      const noPhoto = cams.filter((c) => !c.photo).length;
      if (noPhoto > 0) gaps.push({ floor: i, name, label: `${noPhoto} camera${noPhoto > 1 ? "s" : ""} need a photo`, step: "views" });
    });
    return gaps;
  })();
  const surveyComplete = surveyGaps.length === 0;
  // REBUILD: ONE Submit button, gated on the SURVEY. Blocked (muted) while there are gaps; Submit label is
  // just "Submit" (never Re-submit). Mockup/Camera-Views submission is dropped from the flow.
  const reviewCta = (() => {
    if (svMeta && svMeta.has && !svApproved) {
      if (svSubCurrent) return { label: "Awaiting customer approval", pending: true };
      // No gating — staff send for approval whenever they want; gaps are warnings, never blockers.
      // Submit, then close the tool out (back to the hub) — the gateway shows a "Submitted" toast.
      return { label: "Approval", primary: true, act: async () => {
        if (onSubmitTool) { try { await onSubmitTool("site_survey"); } catch { /* best-effort */ } }
        if (onClose) { try { onClose(); } catch { /* host owns the overlay */ } }
      } };
    }
    if (surveyOk) return { label: "Continue to Proposal →", primary: true, act: () => onContinue && onContinue() };
    return null;
  })();
  void mkStale; void mkSubCurrent; void mkApproved;   // retained reads (mockup state) — no longer gate Submit
  // SUBMIT LOCK, EXPLAINED (section L). A submitted survey hides every edit tool by CSS inside the widget
  // (frozen()), with nothing saying why — the + disappears, Placement can't place, Background won't open.
  // This banner names the state and carries the one way out. The unlock is also enforced server-side
  // (submitToolAction → can(role,"survey.unlock")); canUnlock only decides whether the button renders.
  // The "Edited after submit" mark belongs to the SURVEY, so it rides in the saved blob (the widget sets
  // it on any reopen and clears it on submit) and survives a refresh. `reopened` only covers the gap
  // between clicking Edit survey and the next time the blob is read back.
  const [reopened, setReopened] = useState(false);
  const [lockErr, setLockErr] = useState("");
  const editedAfterSubmit = !surveySubmitted && (reopened || surveyEditedAfterSubmit(sv));
  // Both of these can be REFUSED server-side (can(role,"survey.unlock") / "survey.submit"). Showing
  // "Edited after submit" after a refusal — or clearing it after a failed resubmit — would be the UI
  // lying about what the server did, so the refusal is surfaced and the state is left alone.
  const editSurvey = async () => {
    if (!onUnsubmitTool) return;
    setLockErr("");
    let r; try { r = await onUnsubmitTool("site_survey"); } catch { r = { error: "Couldn’t reopen the survey." }; }
    if (r && r.error) { setLockErr(r.error); return; }
    setReopened(true);
    if (railStep === "review") goRail("layout");   // unlocked → land back in the editor, not on Approval
  };
  const resubmit = async () => {
    if (!onSubmitTool) return;
    setLockErr("");
    let r; try { r = await onSubmitTool("site_survey"); } catch { r = { error: "Couldn’t submit the survey." }; }
    if (r && r.error) { setLockErr(r.error); return; }
    setReopened(false);
  };
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  /* R1 — opening Site Survey always shows Survey Navigation, centred, so the first thing you do is
     choose a step. Staff only: a customer has no rail to choose from. Once per mount, and never over
     a deep link (?step=...), which already names the step the user asked for. */
  const [navOpenOnLoad, setNavOpenOnLoad] = useState(false);
  const navOpenedOnce = useRef(false);
  useEffect(() => {
    if (customer || navOpenedOnce.current || initialStep) return;
    navOpenedOnce.current = true;
    setNavOpenOnLoad(true);
  }, [customer, initialStep]);
  const [topMenuOpen, setTopMenuOpen] = useState(false);   // the floor-bar ••• Go-to (reachable when the footer is hidden)

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

      {/* The submit lock, said out loud — on every step, not just Review. This is the ONE unlock control
          (the Review footer no longer carries a second Unsubmit). */}
      {!customer && surveySubmitted && (
        <div className="syp-lockbar" role="status">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          <span>Submitted — read-only</span>
          {canUnlock && onUnsubmitTool && <button type="button" className="syp-lockbar-act" onClick={editSurvey}>Edit survey</button>}
        </div>
      )}
      {!customer && editedAfterSubmit && (
        <div className="syp-lockbar edited" role="status">
          <span>Edited after submit</span>
          {onSubmitTool && <button type="button" className="syp-lockbar-act" onClick={resubmit}>Resubmit</button>}
        </div>
      )}
      {!customer && lockErr && <div className="syp-lockbar failed" role="alert">{lockErr}</div>}

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
      ) : !FLOOR_BAR_STEPS.has(railStep) ? null : (
        /* ONE top floor bar, on the steps where a floor is the thing you are working on (R4):
           Background, Layout, Placement, Route. Camera Angles pages through CAMERAS and Approval
           summarises the whole survey, so a floor switcher there is a control for something the step
           is not about. No Map/Photos toggle and no ••• — Survey Navigation lives only in the bottom
           bar's center button. The switcher is plain text with ‹ › arrows: the left arrow hides on
           Floor 1, the right arrow becomes + on the last floor. */
        <div className="syp-floorbar" onPointerDown={fbDown} onPointerMove={fbMove} onPointerUp={fbUp} onPointerCancel={fbUp}>
          <div className="syp-fb-nav">
            {curFloor > 0 ? (
              <button className="syp-fb-arrow" aria-label="Previous floor" onClick={() => goFloor(curFloor - 1)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              </button>
            ) : <span className="syp-fb-arrow-sp" aria-hidden="true" />}
            <FloorSelect floors={roster} curFloor={curFloor} plain
              onSwitch={goFloor} onAdd={addFloor} onRename={renameFloor} onDuplicate={duplicateFloor} onDelete={deleteFloor} locked={!!surveySubmitted} />
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
      <div className={`syp-pane syp-plan${plateH ? " syp-plan--ar" : ""}`} hidden={paneMode !== "plan"} style={plateH ? { "--syp-plate-h": `${plateH}px` } : undefined}>
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
          {/* Status badge. Warn-only: once submitted, a gap that appears AFTER (a photo removed, a camera
              or floor added) flips the badge to "Needs attention" — the record isn't changed, just flagged. */}
          <div className="syp-review-h">Review
            {svSubCurrent
              ? <span className="syp-review-badge awaiting">Awaiting approval</span>
              : (svStale && !surveyComplete)
                ? <span className="syp-review-badge warn">Needs attention</span>
                : surveyComplete
                  ? <span className="syp-review-badge ready">Ready</span>
                  : <span className="syp-review-badge gap">Incomplete</span>}
          </div>
          {surveyComplete ? (
            <div className="syp-review-sub">Everything looks complete — ready to send for approval.</div>
          ) : (
            <div className="syp-gaps">
              <div className="syp-gaps-h">{svStale ? "Incomplete since you submitted" : "Open items"}</div>
              {surveyGaps.map((g, i) => (
                <button key={i} type="button" className="syp-gap" onClick={() => { setCurFloor(g.floor); surveyCmd({ cmd: "floor", i: g.floor }); goRail(g.step, { jump: true }); }}>
                  <span className="syp-gap-floor">{g.name}</span>
                  <span className="syp-gap-label">{g.label}</span>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              ))}
            </div>
          )}
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
            {/* R1 — the same panel, centred, shown once when the survey opens. */}
            {renderNavPop(navOpenOnLoad, setNavOpenOnLoad, "center")}
          </div>
          <div className="syp-nav-side syp-nav-side--right">
            {railStep === "review" ? (
              <>
                {/* The unlock lives ONCE, in the submit-lock banner above the canvas ("Edit survey") —
                    it was duplicated here as a second "Unsubmit" on Approval only. */}
                {reviewCta ? (
                  <button className={`syp-nav-cta${reviewCta.muted ? " muted" : ""}${reviewCta.pending ? " pending" : ""}`} disabled={reviewCta.muted || reviewCta.pending || !reviewCta.act} onClick={reviewCta.act}>{reviewCta.label}</button>
                ) : <span />}
              </>
            ) : nextStep ? (
              nextEnabled ? (
                <button className="syp-nav-cta" onClick={() => goRail(nextStep)}>{nextLabel(nextStep)} <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
              ) : (
                // The gate REASON is helper text, not a button label. The control keeps the next step's
                // one-word name (label ladder) and the reason sits beside it, small, grey and unboxed.
                // It stays VISIBLE rather than becoming a hover tooltip — a phone has no hover, and this
                // is the one place that says why Next won't move — and names the disabled button to a
                // screen reader through aria-describedby.
                <>
                  {nextHint && <span className="syp-nav-hint" id={navHintId}>{nextHint}</span>}
                  <button className="syp-nav-cta muted" disabled aria-describedby={nextHint ? navHintId : undefined}>{nextLabel(nextStep)} <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
                </>
              )
            ) : <span />}
          </div>
        </div>
      )}

      {/* The DEVICES roster — the camera account. Shared across BOTH tabs (not tied to the survey map),
          so cameras can be named/photographed from either mode. Office-only (customers see cameras in
          the views). */}
      {!devReadOnly && paneMode !== "review" && (() => {
        const devCount = (roster || []).reduce((n, f) => n + (f && Array.isArray(f.devices) ? f.devices.length : 0), 0);
        return (
          <div className={`syp-devwrap${devOpen ? " open" : ""}`}>
            {/* Toggle shows only on a phone (CSS) — desktop stays expanded. */}
            <button type="button" className="syp-devtog" aria-expanded={devOpen} onClick={() => setDevOpen((o) => !o)}>
              <span>Devices{devCount ? ` (${devCount})` : ""}</span>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {devOpen && <SurveyDevices accessId={accessId} roster={roster} curFloor={curFloor} readOnly={devReadOnly} locked={devLocked} canUnlock={canUnlock} onUnlock={editSurvey} cmd={surveyCmd} undoToken={rosterUndo} onAddCamera={() => surveyCmd({ cmd: "addCamera", project: accessId })} />}
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
  const [st, setSt] = useState({ online: true, pending: 0, quota: null, failed: false, blocked: null, savedAt: 0 });
  useEffect(() => subscribeSyncStatus(setSt), []);
  // "Saved ✓" is a confirmation, not a permanent label — it shows for 2.5s after the queue drains, then
  // the badge disappears again (section L asked for a save indicator, not another piece of chrome).
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!st.savedAt) return;
    setJustSaved(true);
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [st.savedAt]);
  // `blocked` outranks everything: nothing is being sent, and Retry cannot help — the local bytes are
  // the problem, so the fix is the widget's own "Use the saved copy". Never show "Saved" over this.
  if (st.blocked) return (
    <div className="syp-sync off" role="alert" aria-live="assertive" title={st.blocked}>
      <span className="syp-sync-dot" aria-hidden="true" />
      <span>Not saving</span>
    </div>
  );
  // A stale-claim conflict that could not be reconciled: Retry is the WRONG action (the same bytes against
  // the same stale claim are what the server is refusing), so this offers Reload instead.
  if (st.conflict) return (
    <div className="syp-sync off" role="alert" aria-live="assertive" title={st.conflict}>
      <span className="syp-sync-dot" aria-hidden="true" />
      <span>Changed elsewhere</span>
      <button type="button" className="syp-sync-retry" onClick={() => window.location.reload()}>Reload</button>
    </div>
  );
  if (st.failed) return (
    <div className="syp-sync off" role="alert" aria-live="assertive">
      <span className="syp-sync-dot" aria-hidden="true" />
      <span>Save failed</span>
      <button type="button" className="syp-sync-retry" onClick={() => retryToolSync()}>Retry</button>
    </div>
  );
  if (st.quota) return (
    <div className="syp-sync off" role="alert" aria-live="assertive" title={st.quota}>
      <span className="syp-sync-dot" aria-hidden="true" />
      <span>{st.quota}</span>
    </div>
  );
  if (st.online && st.pending === 0) {
    if (!justSaved) return null;   // all synced and the confirmation has had its moment → no chrome
    return (
      <div className="syp-sync ok" role="status" aria-live="polite">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
        <span>Saved</span>
      </div>
    );
  }
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
function FloorSelect({ floors = [], curFloor = 0, plain = false, onSwitch, onAdd, onRename, onDuplicate, onDelete, locked = false }) {
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
              <div className="syp-fsel-confirm">{only ? `Reset “${curName}”?` : `Delete “${curName}”?`}</div>
              <div className="syp-fsel-formbtns">
                <button className="syp-fsel-mini" onClick={() => setMenuMode("list")}>Cancel</button>
                <button className="syp-fsel-mini danger" onClick={() => { onDelete && onDelete(); close(); }}>{only ? "Reset" : "Delete"}</button>
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
              <button className="syp-fsel-act danger" role="menuitem" disabled={locked} onClick={() => setMenuMode("confirm")}>Delete</button>
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
.syp-review{border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;background:#fff;padding:16px 18px;margin-bottom:12px}
.syp-review-h{display:flex;align-items:center;gap:10px;font-size:.95rem;font-weight:800;color:var(--dv-ink,#101418)}
.syp-review-sub{margin-top:3px;font-size:.82rem;color:var(--dv-meta,#787D84)}
/* §8: deliverable status badge next to the title */
.syp-review-badge{font-size:.66rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF)}
.syp-review-badge.ready{color:#2f6f4e;background:rgba(62,125,90,.1);border-color:rgba(62,125,90,.3)}
.syp-review-badge.gap{color:#8a5a28;background:rgba(176,141,76,.12);border-color:rgba(176,141,76,.32)}
.syp-review-badge.awaiting{color:#8a5a28;background:rgba(176,141,76,.12);border-color:rgba(176,141,76,.32)}
.syp-review-badge.warn{color:#9a3f1a;background:rgba(176,90,40,.12);border-color:rgba(176,90,40,.38)}
/* §8: the "finish these" gap list — each row jumps to the floor + step that fixes it */
.syp-gaps{margin-top:10px;border:1px solid rgba(176,141,76,.3);border-radius:12px;overflow:hidden}
.syp-gaps-h{font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#8a5a28;background:rgba(176,141,76,.08);padding:8px 12px}
.syp-gap{display:flex;align-items:center;gap:10px;width:100%;appearance:none;cursor:pointer;font:inherit;text-align:left;background:#fff;border:0;border-top:1px solid var(--dv-line,#E4E4DF);padding:10px 12px;color:var(--dv-ink,#101418)}
.syp-gap:first-of-type{border-top:0}
.syp-gap:hover{background:var(--dv-raise,#F6F6F4)}
.syp-gap-floor{font-size:.82rem;font-weight:800;flex:none;min-width:64px}
.syp-gap-label{flex:1;font-size:.82rem;font-weight:600;color:var(--dv-meta,#787D84)}
.syp-gap svg{color:var(--dv-meta,#787D84);flex:none}
/* §8: Unsubmit next to the submit CTA */
/* The quiet unsubmit pill that used to sit on Approval is gone with the duplicate control — there is one
   unlock now, "Edit survey" in .syp-lockbar, which shows on every step. */
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
.syp-floorbar .syp-fb-arrow-sp{width:30px;height:30px;flex:none}
/* plain-text floor switcher (look&feel): no pill/bg/border on the button — just the name + ▾. */
.syp-floorbar .syp-fsel.plain .syp-fsel-btn{background:transparent;border-color:transparent;min-width:0;padding:8px 10px;font-size:.98rem}
.syp-floorbar .syp-fsel.plain .syp-fsel-btn:hover{background:var(--dv-raise,#F6F6F4);border-color:transparent}
/* Offline-first sync badge — top-right of the planner, above the canvas. */
.syp{position:relative}
/* Submit lock / edited-after-submit / refusal banner — one quiet strip above the canvas. Colour comes
   from the .dv tokens (green = locked & submitted, gold = needs attention, red = refused), never hex. */
.syp-lockbar{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 12px;border:1px solid currentColor;border-radius:11px;background:var(--dv-paper,#F4F4F2);color:var(--dv-green,#2E7D5B);font-size:.8rem;font-weight:700}
.syp-lockbar.edited{color:var(--dv-gold-text,#8A6A1F)}
.syp-lockbar.failed{color:var(--dv-red,#C4553D)}
.syp-lockbar-act{margin-left:auto;height:30px;padding:0 12px;border:1px solid currentColor;border-radius:8px;background:var(--dv-card,#fff);color:inherit;font:700 .78rem/1 inherit;cursor:pointer}
.syp-lockbar-act:hover{background:var(--dv-paper,#F4F4F2)}
.syp-sync-retry{margin-left:4px;height:20px;padding:0 8px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;font:700 .68rem/1 inherit;cursor:pointer}
.syp-sync{position:absolute;top:6px;right:8px;z-index:30;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:100px;font-size:.72rem;font-weight:700;letter-spacing:.01em;background:var(--dv-ink,#101418);color:#fff;box-shadow:0 2px 8px rgba(16,20,24,.25)}
.syp-sync.off{background:#8a3a28}
.syp-sync.ok{background:var(--dv-green,#2E7D5B)}
.syp-sync-dot{width:7px;height:7px;border-radius:50%;background:#fff;opacity:.9;animation:sypSyncPulse 1.1s ease-in-out infinite}
@keyframes sypSyncPulse{0%,100%{opacity:.35}50%{opacity:1}}
/* Map / Photos — ONE toggle button, pinned left of the centered floor selector. Shows the current view +
   a swap glyph; tapping flips to the other. (Was two buttons that overlapped the right controls on a phone.) */
.syp-floorbar .syp-fb-viewtog{flex:none;display:inline-flex;align-items:center;gap:6px;appearance:none;cursor:pointer;font:inherit;font-size:.78rem;font-weight:700;letter-spacing:.01em;color:var(--dv-ink,#101418);background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;padding:6px 13px;transition:border-color .15s}
.syp-floorbar .syp-fb-viewtog:hover{border-color:var(--dv-ink,#101418)}
.syp-floorbar .syp-fb-viewtog svg{color:var(--dv-meta,#787D84);flex:none}
@media (max-width:640px){ .syp-floorbar .syp-fb-viewtog{padding:6px 11px;font-size:.76rem} }
/* Plain (no pill/border/bg) arrows + add, matching the plain floor name — subtle muted icon, light hover. */
.syp-floorbar .syp-fb-arrow{appearance:none;cursor:pointer;width:30px;height:30px;flex:none;border-radius:100px;border:0;background:transparent;color:var(--dv-meta,#9AA0A6);display:inline-flex;align-items:center;justify-content:center;transition:color .15s,background .15s}
.syp-floorbar .syp-fb-arrow:hover:not(:disabled){color:var(--dv-ink,#101418);background:var(--dv-raise,#F4F4F2)}
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
.syp-nav-side--right{justify-content:flex-end;gap:10px}
.syp-nav-centerwrap{position:relative;flex:0 0 auto;display:inline-flex}
.syp-nav-center{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:.92rem;font-weight:800;letter-spacing:.01em;color:var(--dv-ink,#101418);background:transparent;border:0;padding:8px 12px;border-radius:100px;white-space:nowrap}
.syp-nav-center:hover{background:var(--dv-raise,#F6F6F4)}
.syp-nav-center svg{color:var(--dv-meta,#787D84);flex:none}
/* The gate reason beside a disabled Next. Quiet by construction: no border, no background, meta
   colour, smaller than the control it explains. It yields width before the button does, and only
   ellipsises in the last resort — on the narrowest phone the pair still fits side by side. */
.syp-nav-hint{font-size:.82rem;font-weight:600;letter-spacing:.01em;color:var(--dv-meta,#787D84);white-space:nowrap;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
.syp-nav .syp-nav-cta{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:.88rem;font-weight:800;letter-spacing:.01em;padding:10px 18px;border-radius:100px;border:1px solid var(--dv-ink,#101418);background:var(--dv-ink,#101418);color:#fff;transition:background .15s;white-space:nowrap}
.syp-nav .syp-nav-cta:hover:not(:disabled){background:#000}
.syp-nav .syp-nav-cta.muted{background:transparent;color:var(--dv-meta,#787D84);border-color:var(--dv-line,#E4E4DF);cursor:default;font-weight:700}
/* Pending = submitted, awaiting the customer. A quiet amber pill (never the dark primary) so the state reads at a glance. */
.syp-nav .syp-nav-cta.pending,.syp-nav .syp-nav-cta.pending:disabled{background:rgba(176,141,76,.12);color:#8a5a28;border-color:rgba(176,141,76,.4);cursor:default;font-weight:800;opacity:1}
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
/* PHONE — three slots do not fit on one row. The right slot gets ~118px of the 347 available, while a
   gate hint ("Draw the structure first") or a state label ("Awaiting customer approval") is 190–215px.
   justify-content:flex-end made that slot overflow LEFTWARD, printing the hint straight across the step
   button — two labels on top of each other. Give the action its own full-width row (a better thumb
   target as well) and leave Back + the current step on row one. Comes after the base .syp-nav rules
   above on purpose: a media query adds no specificity, so equal selectors are resolved by order. */
@media (max-width:700px){
  .syp-nav{flex-wrap:wrap;row-gap:7px}
  /* order puts the spacer BEFORE the action slot when the lines are packed, so row one is
     [Back 1fr] [step auto] [spacer 1fr] — the step stays dead-centre, exactly as on desktop — and the
     action, whose 100% basis cannot share a line, is pushed onto row two. */
  .syp-nav::after{content:"";order:1;flex:1 1 0;min-width:0}
  .syp-nav > .syp-nav-side--right{order:2;flex:1 0 100%;min-width:0}
  .syp-nav > .syp-nav-side--right > .syp-nav-cta{flex:1 1 auto;justify-content:center;min-width:0;white-space:normal}
}
/* SURVEY NAVIGATION popover — the Add-Service-modal design language (white/paper surface, soft border,
   big shadow, rounded, 2-col icon tiles). Used by both the top ••• (drops down) and the footer ••• (up). */
.syp-navpop-backdrop{position:fixed;inset:0;z-index:1200}
.syp-navpop{position:absolute;right:0;z-index:1201;width:440px;max-width:calc(100vw - 20px);background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:16px;box-shadow:0 18px 48px rgba(16,20,24,.24);overflow:hidden}
.syp-navpop--down{top:calc(100% + 8px);bottom:auto}
.syp-navpop--up{bottom:calc(100% + 8px);top:auto}
.syp-navpop--up-center{bottom:calc(100% + 10px);top:auto;left:50%;right:auto;transform:translateX(-50%)}
/* R1 — the panel the survey opens on. Fixed and centred on the SCREEN, not anchored to a trigger. */
.syp-navpop--center{position:fixed;top:50%;left:50%;right:auto;bottom:auto;transform:translate(-50%,-50%);z-index:1201}
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
/* DESKTOP: the plan pane must not be squeezed by what sits under it. .syp is a flex column and the
   device roster below it is flex:0 1 auto at its natural height — eight photo thumbnails make that
   514px. The pane is the only flexible child, so it absorbed the whole shortfall: measured at 88px of
   map in a 724px column, while the widget was asking for 579. The Background chooser and the add-floor
   sheet live in that same pane, so they were crushed with it — which is why satellite could be neither
   seen nor started. Give the pane the height the widget actually asks for (--syp-plate-h, posted as
   iotSurveyPlate), clamped, and let the overlay's own scroll carry the roster instead of the map
   paying for it. Written as .syp > … (0,3,0) so it outranks .cpv-ovl-body .syp-plan (0,2,0) on order-
   independent specificity rather than on which component's <style> happens to mount last. */
@media (min-width:701px){
  .syp > .syp-pane.syp-plan{flex:0 0 auto;height:clamp(360px, var(--syp-plate-h, 68vh), 74vh)}
}
@media (max-width:700px){ .syp-plan .ss-embed-frame{height:min(64vh,520px);min-height:340px}
  /* A floor that HAS a plan takes the height the plan actually needs (--syp-plate-h, posted by the
     widget as iotSurveyPlate.wantHeight: the contained plate plus the widget's own chrome). The fixed
     height above is taller than a landscape aerial can fill at phone width — a 1.29 plan in a 496px
     frame used only 289px of it, so the map read as a thin band with 42% of the frame empty grid.
     Clamped so an extreme plan stays usable and the frame never grows past what the fixed height
     already allowed. The !important beats the overlay hosts (.dv-overlay-body / .cpv-ovl-body
     .ss-tool-body), which set this frame to flex:1 1 0 + height:auto!important to fill their column.
     That is (0,3,0), so this selector is deliberately written long enough to outrank it — a shorter
     one loses and the frame silently falls back to its min-height. */
  .syp-pane.syp-plan--ar .ss-embed .ss-embed-frame{flex:0 0 auto!important;height:var(--syp-plate-h)!important;min-height:260px!important;max-height:min(64vh,520px)}
  /* …and let the pane pack to that height, so the nav sits under the map instead of after a column of
     white where the old over-tall frame used to be. */
  .syp-pane.syp-plan--ar{flex:0 0 auto!important}
  .syp-pane.syp-plan--ar .ss-tool-col,.syp-pane.syp-plan--ar .ss-tool-body,.syp-pane.syp-plan--ar .ss-embed{flex:0 0 auto!important;height:auto!important} }
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

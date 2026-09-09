"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { getToolDataAction } from "./proposal-actions";
import SystemWalkthrough from "./system-walkthrough";

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
  planNode = null, viewsNode = null,
  hasSurvey = false, hasViews = false, hasCams = false,
}) {
  const [mode, setMode] = useState("plan");     // "plan" (survey) | "views" (camera mockups)
  const [walkOpen, setWalkOpen] = useState(false);
  const [selectedCid, setSelectedCid] = useState(null);   // the one camera the user picked — shared across modes
  const rootRef = useRef(null);

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
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [accessId]);

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
      .map((f) => ({ name: f.name || "Floor", bg: f.bg, cams: (f.devices || []).filter((x) => x.k === "cam") })); }
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

  return (
    <div className="syp" ref={rootRef}>
      <style>{CSS}</style>

      <div className="syp-head">
        <div className="syp-seg" role="tablist" aria-label="Planner mode">
          <button role="tab" aria-selected={mode === "plan"} className={`syp-tab${mode === "plan" ? " on" : ""}`} onClick={() => setMode("plan")}>Plans</button>
          <button role="tab" aria-selected={mode === "views"} className={`syp-tab${mode === "views" ? " on" : ""}`} onClick={() => setMode("views")}>Views</button>
        </div>
        {canWalk && (
          <button className="syp-walk" onClick={() => setWalkOpen(true)}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            Walkthrough
          </button>
        )}
      </div>

      {/* Both panes stay mounted; only visibility toggles, so the iframes never reload. The PLAN pane
          flows as a document: the survey MAP gets its own bounded height, and the camera roster flows
          BELOW it (the page scrolls) — never trapped inside a fixed frame that would clip the roster. */}
      <div className="syp-pane syp-plan" hidden={mode !== "plan"}>
        {planNode || <div className="syp-empty">Your site survey will appear here once it&apos;s started.</div>}
      </div>
      <div className="syp-pane" hidden={mode !== "views"}>
        {viewsNode || <div className="syp-empty">Camera views will appear here once photos are added.</div>}
      </div>

      {walkOpen && (
        <SystemWalkthrough accessId={accessId} floors={floors} photos={photos} focusCid={selectedCid} customerName={customerName}
          defaultFs onClose={() => setWalkOpen(false)} />
      )}
    </div>
  );
}

const CSS = `
.syp{display:flex;flex-direction:column;gap:0}
.syp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 2px 12px;flex-wrap:wrap}
.syp-seg{display:inline-flex;padding:3px;gap:2px;background:var(--dv-raise,#F2F2EF);border:1px solid var(--dv-line,#E4E4DF);border-radius:100px}
.syp-tab{appearance:none;border:0;background:transparent;cursor:pointer;font:inherit;font-size:.8rem;font-weight:700;letter-spacing:.01em;
  color:var(--dv-meta,#787D84);padding:7px 16px;border-radius:100px;transition:background .18s,color .18s}
.syp-tab:hover{color:var(--dv-ink,#101418)}
.syp-tab.on{background:var(--dv-ink,#101418);color:#fff}
.syp-walk{appearance:none;cursor:pointer;font:inherit;font-size:.78rem;font-weight:700;display:inline-flex;align-items:center;gap:7px;
  padding:8px 16px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);transition:background .18s,border-color .18s}
.syp-walk:hover{background:#fff;border-color:var(--dv-ink,#101418)}
.syp-walk svg{margin-left:-1px}
.syp-pane[hidden]{display:none!important}
/* PLAN pane flows like a document — bound only the MAP, never the whole survey (which would clip the
   camera roster below it). The survey node itself stays auto-height so the roster + comments flow. */
.syp-plan .ss-tool-col,.syp-plan .ss-tool-body{height:auto!important;display:block!important;min-height:0}
.syp-plan .ss-embed{display:flex;flex-direction:column;height:auto}
.syp-plan .ss-embed-frame{flex:0 0 auto;width:100%;height:min(58vh,520px);min-height:340px;border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;background:#fff;display:block}
.syp-empty{text-align:center;padding:40px 16px;color:var(--dv-meta,#787D84);font-size:.86rem;border:1px dashed var(--dv-line,#E4E4DF);border-radius:14px}
`;

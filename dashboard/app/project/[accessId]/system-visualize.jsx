"use client";
import { useState, useEffect, useMemo } from "react";
import { getToolDataAction } from "./proposal-actions";
import SystemWalkthrough from "./system-walkthrough";

// The "Visualize" deck step: a guided, cinematic walk through the planned system before any pricing.
// The aerial site survey is the stage; each camera marker morphs open into what that camera sees.
// Self-contained — loads survey2 (placements + headings) + mockup (what each camera sees). Read-only.
// Calm placeholder until cameras exist.
export default function SystemVisualize({ accessId, customerName = "" }) {
  const [sv, setSv] = useState(null);
  const [mk, setMk] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let live = true;
    setBusy(true);
    Promise.all([
      getToolDataAction(accessId, "survey2").catch(() => null),
      getToolDataAction(accessId, "mockup").catch(() => null),
    ]).then(([s, m]) => {
      if (!live) return;
      setSv(s?.saved?.data || null); setMk(m?.saved?.data || null); setBusy(false);
    });
    return () => { live = false; };
  }, [accessId]);

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
  const hasCams = floors.some((f) => (f.cams || []).length > 0);

  return (
    <div className="svz">
      <style>{SVZ_CSS}</style>
      <div className="svz-intro">
        <h2 className="svz-title">See your system before it goes in</h2>
        <p className="svz-sub">A guided walk through every camera we&apos;ve planned — where it sits, and what it sees.</p>
      </div>
      {busy
        ? <div className="svz-note">Loading your visualization…</div>
        : hasCams
          ? <SystemWalkthrough floors={floors} photos={photos} customerName={customerName} />
          : <div className="svz-note">Your system visualization will appear here once your cameras are placed.</div>}
    </div>
  );
}

const SVZ_CSS = `
.svz{padding:6px 2px 18px;max-width:760px;margin:0 auto}
.svz-intro{text-align:center;margin:4px 0 16px}
.svz-title{font-size:1.32rem;font-weight:800;letter-spacing:-.02em;color:var(--dv-ink,#101418);margin:0;text-wrap:balance}
.svz-sub{margin:6px auto 0;font-size:.88rem;line-height:1.5;color:var(--dv-meta,#787D84);max-width:46ch}
.svz-note{text-align:center;padding:34px 16px;color:var(--dv-meta,#787D84);font-size:.86rem}
`;

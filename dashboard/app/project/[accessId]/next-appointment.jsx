"use client";
import { useState, useEffect } from "react";
import { getToolDataAction } from "./proposal-actions";

// The next scheduled visit — split out of the old combined "Shipment Tracking" panel so it's
// its own tool card. Reads the same "schedule" tool events the Scheduling widget writes.
export default function NextAppointment({ accessId, project }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let live = true;
    getToolDataAction(accessId, "schedule").then((r) => {
      if (!live || !r?.ok || !r.saved?.data) return;
      try { setEvents(JSON.parse(r.saved.data).events || []); } catch { /* bad blob */ }
    }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const parsed = events
    .map((e) => ({ ...e, when: new Date(`${e.date}T${e.time || "09:00"}`) }))
    .filter((e) => !isNaN(e.when))
    .sort((a, b) => a.when - b.when);
  const next = parsed.find((e) => e.when >= today) || parsed[parsed.length - 1] || null;
  const nextIsPast = next && next.when < today;
  const fallbackDate = project?.install_date || project?.date || null;

  const dt = (d) => { try { return new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }); } catch { return d.date; } };
  const tm = (e) => { try { const [h, m] = (e.time || "09:00").split(":").map(Number); const s = new Date(2000, 0, 1, h, m); const en = new Date(s.getTime() + (Number(e.duration) || 60) * 60000); const f = (x) => x.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); return `${f(s)} – ${f(en)}`; } catch { return e.time; } };

  return (
    <div className="napt-root">
      <style>{NAPT_CSS}</style>
      {next ? (
        <div className="napt-card">
          <div className="napt-tile">
            <span className="napt-mon">{next.when.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span>
            <span className="napt-day">{next.when.getDate()}</span>
          </div>
          <div className="napt-info">
            <b>{next.title || "IOT TECHS — Installation"}</b>
            <span>{dt(next)} · {tm(next)}</span>
            {next.location && <span className="napt-loc">{next.location}</span>}
            {nextIsPast && <span className="napt-note">Most recent appointment — new dates will appear here.</span>}
          </div>
        </div>
      ) : (
        <div className="napt-card empty">
          {fallbackDate
            ? <>Your visit is penciled in for <b>{fallbackDate}</b> — we'll confirm the exact time window shortly.</>
            : <>We're lining up your installation date — it will appear here as soon as it's booked.</>}
        </div>
      )}
    </div>
  );
}

const NAPT_CSS = `
.napt-root{font-family:"SF Pro Display",-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif}
.napt-card{background:#fff;border:1px solid #d9d4ca;border-radius:10px;padding:14px 16px;display:flex;gap:14px;align-items:center}
.napt-card.empty{display:block;font-size:.84rem;color:#4a5270}
.napt-tile{width:56px;height:56px;flex-shrink:0;border-radius:11px;background:#0B0F1A;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.napt-mon{font-size:.6rem;font-weight:800;letter-spacing:.08em;color:#C9A96E}
.napt-day{font-size:1.4rem;font-weight:800;line-height:1}
.napt-info{display:flex;flex-direction:column;gap:2px;min-width:0}
.napt-info b{font-size:.9rem;color:#0B0F1A}
.napt-info span{font-size:.8rem;color:#4a5270}
.napt-loc{color:#6f7686}
.napt-note{font-size:.72rem;color:#8a6d2f;font-style:italic}
`;

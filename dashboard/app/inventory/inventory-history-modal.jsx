"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getItemHistoryAction } from "./actions";

const money = (n) => "$" + (n || 0).toLocaleString();
function fmt(ts) {
  if (!ts) return "";
  const d = new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z");
  if (isNaN(d)) return ts;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
const EVENT_LABEL = {
  created: "Item created", received: "Scanned in", assigned: "Assigned", unassigned: "Returned to stock",
  installed: "Installed", adjusted: "Adjusted", removed: "Removed",
};
const EVENT_COLOR = {
  created: "#3257ff", received: "#1c8a45", assigned: "#b08f4f", unassigned: "#6b7280",
  installed: "#7c3aed", adjusted: "#b45309", removed: "#d23c3c",
};
const STATUS_COLOR = { in_stock: "#1c8a45", assigned: "#b08f4f", installed: "#7c3aed", removed: "#d23c3c" };

// Full, permanent history for one item — serial units + a date-filterable event timeline.
export default function InventoryHistoryModal({ item, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [since, setSince] = useState("");   // ISO yyyy-mm-dd; "" = all time

  useEffect(() => {
    let live = true;
    getItemHistoryAction(item.id).then((r) => {
      if (!live) return;
      if (r.error) setErr(r.error); else setData(r.history);
    });
    return () => { live = false; };
  }, [item.id]);

  const sinceTs = since ? since + " 00:00:00" : null;
  const events = useMemo(() => {
    if (!data) return [];
    return sinceTs ? data.events.filter((e) => e.at >= sinceTs) : data.events;
  }, [data, sinceTs]);
  const receivedInRange = events.filter((e) => e.type === "received").reduce((s, e) => s + (e.qty || 0), 0);
  const installedInRange = events.filter((e) => e.type === "installed").reduce((s, e) => s + (e.qty || 0), 0);

  return (
    <div className="ih-overlay" onClick={(e) => { if (e.target.classList.contains("ih-overlay")) onClose(); }}>
      <div className="ih-box">
        <button className="ih-x" onClick={onClose}>×</button>
        <div className="ih-head">
          <h2>{item.name}</h2>
          <div className="ih-sub">
            <span className="chip">{item.category || "—"}</span>
            {item.sku && <span className="ih-mono">{item.sku}</span>}
            <span>{item.quantity} on hand · {money(item.total_value)}</span>
          </div>
        </div>

        {err && <div className="am-err">{err}</div>}
        {!data && !err && <div className="ih-loading">Loading history…</div>}

        {data && (
          <>
            <div className="ih-kpis">
              <div className="ih-kpi"><div className="ih-kpi-v">{data.totals.received}</div><div className="ih-kpi-l">Received (all time)</div></div>
              <div className="ih-kpi"><div className="ih-kpi-v">{data.totals.used}</div><div className="ih-kpi-l">Used / installed</div></div>
              <div className="ih-kpi"><div className="ih-kpi-v">{data.totals.serials}</div><div className="ih-kpi-l">Serials on file</div></div>
              <div className="ih-kpi"><div className="ih-kpi-v">{item.quantity}</div><div className="ih-kpi-l">On hand now</div></div>
            </div>

            <div className="ih-daterow">
              <span className="ih-date-lbl">From date</span>
              <input type="date" className="apx-input ih-date" value={since} onChange={(e) => setSince(e.target.value)} />
              <div className="ih-presets">
                {[["", "All"], [daysAgo(30), "30d"], [daysAgo(90), "90d"], [yearStart(), "This yr"]].map(([v, l]) => (
                  <button key={l} type="button" className={since === v ? "on" : ""} onClick={() => setSince(v)}>{l}</button>
                ))}
              </div>
              {since && <span className="ih-range-note">{receivedInRange} received · {installedInRange} installed since</span>}
            </div>

            {data.units.length > 0 && (
              <div className="ih-section">
                <div className="ih-sec-hd">Serial units <span>({data.units.length})</span></div>
                <div className="ih-units">
                  {data.units.map((u) => (
                    <div key={u.id} className="ih-unit">
                      <span className="ih-mono ih-serial">{u.serial || "—"}</span>
                      <span className="ih-ustatus" style={{ color: STATUS_COLOR[u.status] || "#6b7280" }}>{u.status.replace("_", " ")}</span>
                      {u.project_access_id && <Link className="idlink ih-uproj" href={`/project/${u.project_access_id}`}>{u.project_customer || u.project_access_id}</Link>}
                      <span className="ih-udate">{fmt(u.received_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="ih-section">
              <div className="ih-sec-hd">Activity <span>({events.length})</span></div>
              {events.length === 0 ? <div className="ih-empty">No activity in this range.</div> : (
                <div className="ih-timeline">
                  {events.map((e) => (
                    <div key={e.id} className="ih-event">
                      <span className="ih-dot" style={{ background: EVENT_COLOR[e.type] || "#6b7280" }} />
                      <div className="ih-ev-body">
                        <div className="ih-ev-top">
                          <span className="ih-ev-type">{EVENT_LABEL[e.type] || e.type}{e.qty ? ` · ${e.qty > 0 ? "+" : ""}${e.qty}` : ""}</span>
                          <span className="ih-ev-at">{fmt(e.at)}</span>
                        </div>
                        <div className="ih-ev-meta">
                          {e.serial && <span className="ih-mono">{e.serial}</span>}
                          {e.project_access_id && <Link className="idlink" href={`/project/${e.project_access_id}`}>{e.project_customer || e.project_access_id}</Link>}
                          {e.actor_name && <span>by {e.actor_name}</span>}
                          {e.note && <span className="ih-ev-note">{e.note}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        .apx .ih-overlay{position:fixed;inset:0;background:rgba(14,19,32,.55);backdrop-filter:blur(4px);z-index:220;display:flex;align-items:center;justify-content:center;padding:16px}
        .apx .ih-box{position:relative;background:#fff;border-radius:20px;width:100%;max-width:680px;max-height:90vh;overflow-y:auto;padding:24px 26px 28px;box-shadow:0 32px 80px -24px rgba(14,19,32,.5)}
        .apx .ih-x{position:absolute;top:12px;right:14px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#9ca3af;line-height:1;padding:4px 8px;border-radius:8px}
        .apx .ih-x:hover{background:var(--bg-soft);color:var(--ink)}
        .apx .ih-head h2{font-family:'Bricolage Grotesque',sans-serif;font-size:1.28rem;font-weight:700;margin-bottom:6px;padding-right:24px}
        .apx .ih-sub{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:.85rem;color:var(--muted)}
        .apx .ih-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.8rem;color:var(--muted)}
        .apx .ih-loading,.apx .ih-empty{color:var(--muted);font-size:.88rem;padding:14px 0}
        .apx .ih-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}
        .apx .ih-kpi{border:1px solid var(--line);border-radius:12px;background:var(--bg-soft);padding:11px 12px;text-align:center}
        .apx .ih-kpi-v{font-family:'Bricolage Grotesque',sans-serif;font-size:1.4rem;font-weight:800;color:var(--ink)}
        .apx .ih-kpi-l{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);margin-top:2px}
        .apx .ih-daterow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:14px}
        .apx .ih-date-lbl{font-size:.8rem;font-weight:700;color:var(--muted)}
        .apx .ih-date{width:auto;padding:5px 8px;font-size:.82rem}
        .apx .ih-presets{display:flex;gap:5px}
        .apx .ih-presets button{height:28px;padding:0 10px;border:1px solid var(--line);border-radius:7px;background:var(--bg-soft);color:var(--muted);font-size:.72rem;font-weight:800;cursor:pointer;font-family:inherit}
        .apx .ih-presets button.on{background:var(--gold);border-color:var(--gold);color:#fff}
        .apx .ih-range-note{font-size:.76rem;color:var(--muted);margin-left:auto}
        .apx .ih-section{margin-top:16px}
        .apx .ih-sec-hd{font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--ink);margin-bottom:8px}
        .apx .ih-sec-hd span{color:var(--muted);font-weight:700}
        .apx .ih-units{display:flex;flex-direction:column;gap:2px;max-height:200px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;padding:4px}
        .apx .ih-unit{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:7px;font-size:.82rem}
        .apx .ih-unit:hover{background:var(--bg-soft)}
        .apx .ih-serial{flex-shrink:0;color:var(--ink);font-weight:600}
        .apx .ih-ustatus{font-size:.7rem;font-weight:800;text-transform:capitalize}
        .apx .ih-uproj{font-size:.78rem}
        .apx .ih-udate{margin-left:auto;font-size:.74rem;color:var(--muted);white-space:nowrap}
        .apx .ih-timeline{display:flex;flex-direction:column;gap:0}
        .apx .ih-event{display:flex;gap:11px;padding:9px 0;border-bottom:1px solid var(--line)}
        .apx .ih-event:last-child{border-bottom:none}
        .apx .ih-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;margin-top:5px}
        .apx .ih-ev-body{flex:1;min-width:0}
        .apx .ih-ev-top{display:flex;justify-content:space-between;gap:10px}
        .apx .ih-ev-type{font-size:.85rem;font-weight:700;color:var(--ink)}
        .apx .ih-ev-at{font-size:.74rem;color:var(--muted);white-space:nowrap}
        .apx .ih-ev-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:.78rem;color:var(--muted);margin-top:2px}
        .apx .ih-ev-note{font-style:italic}
        @media(max-width:560px){.apx .ih-kpis{grid-template-columns:repeat(2,1fr)}}
      `}</style>
    </div>
  );
}

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function yearStart() {
  return new Date().getFullYear() + "-01-01";
}

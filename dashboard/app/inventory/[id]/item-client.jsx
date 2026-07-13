"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AdminShell from "../../components/admin-shell";

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

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function yearStart() { return new Date().getFullYear() + "-01-01"; }

// Full item page — permanent history for one inventory item: serial units + a
// date-filterable event timeline. Reached from the inventory table (item name link).
export default function ItemPageClient({ user, alerts, history, projects }) {
  const { item, totals } = history;
  const [since, setSince] = useState("");
  const [serialQ, setSerialQ] = useState("");

  const sinceTs = since ? since + " 00:00:00" : null;
  const events = useMemo(() => (sinceTs ? history.events.filter((e) => e.at >= sinceTs) : history.events), [history.events, sinceTs]);
  const units = useMemo(() => {
    const q = serialQ.trim().toLowerCase();
    return q ? history.units.filter((u) => (u.serial || "").toLowerCase().includes(q)) : history.units;
  }, [history.units, serialQ]);
  const receivedInRange = events.filter((e) => e.type === "received").reduce((s, e) => s + (e.qty || 0), 0);
  const installedInRange = events.filter((e) => e.type === "installed").reduce((s, e) => s + (e.qty || 0), 0);

  return (
    <AdminShell user={user} alerts={alerts} active="inventory">
      <div className="apx-wrap">
        <div className="ip-crumb"><Link href="/inventory">← Inventory</Link></div>
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1>{item.name}</h1>
            <div className="ph-sub" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="chip">{item.category || "—"}</span>
              {item.sku && <span className="ip-mono">{item.sku}</span>}
              {item.location && <span>{item.location}</span>}
              {item.project_access_id && <Link className="idlink" href={`/project/${item.project_access_id}`}>{item.project_customer || item.project_access_id} →</Link>}
            </div>
          </div>
        </div>

        <div className="kpi-row k4">
          <div className="kpi c-gold"><div className="k-label">On Hand</div><div className="k-val">{item.quantity}</div></div>
          <div className="kpi c-green"><div className="k-label">Received (all time)</div><div className="k-val">{totals.received}</div></div>
          <div className="kpi c-amber"><div className="k-label">Used / Installed</div><div className="k-val">{totals.used}</div></div>
          <div className="kpi c-blue"><div className="k-label">Serials on File</div><div className="k-val">{totals.serials}</div></div>
        </div>

        <div className="sec-head" style={{ marginTop: 6 }}>
          <div className="ip-daterow">
            <span className="ip-date-lbl">From date</span>
            <input type="date" className="apx-input ip-date" value={since} onChange={(e) => setSince(e.target.value)} />
            <div className="ip-presets">
              {[["", "All"], [daysAgo(30), "30d"], [daysAgo(90), "90d"], [yearStart(), "This yr"]].map(([v, l]) => (
                <button key={l} type="button" className={since === v ? "on" : ""} onClick={() => setSince(v)}>{l}</button>
              ))}
            </div>
            {since && <span className="ip-range-note">{receivedInRange} received · {installedInRange} installed since</span>}
          </div>
        </div>

        <div className="ip-cols">
          <div className="panel ip-panel">
            <div className="ip-panel-hd">
              <span>Serial units <b>({history.units.length})</b></span>
              {history.units.length > 6 && (
                <input className="apx-input ip-serial-search" placeholder="Find serial…" value={serialQ} onChange={(e) => setSerialQ(e.target.value)} />
              )}
            </div>
            {units.length === 0 ? <div className="empty">{serialQ ? "No matching serials." : "No serials scanned in yet."}</div> : (
              <div className="ip-units">
                {units.map((u) => (
                  <div key={u.id} className="ip-unit">
                    <span className="ip-mono ip-serial">{u.serial || "—"}</span>
                    <span className="ip-ustatus" style={{ color: STATUS_COLOR[u.status] || "#6b7280" }}>{u.status.replace("_", " ")}</span>
                    {u.project_access_id && <Link className="idlink ip-uproj" href={`/project/${u.project_access_id}`}>{u.project_customer || u.project_access_id}</Link>}
                    <span className="ip-udate">{fmt(u.received_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel ip-panel">
            <div className="ip-panel-hd"><span>Activity <b>({events.length})</b></span></div>
            {events.length === 0 ? <div className="empty">No activity in this range.</div> : (
              <div className="ip-timeline">
                {events.map((e) => (
                  <div key={e.id} className="ip-event">
                    <span className="ip-dot" style={{ background: EVENT_COLOR[e.type] || "#6b7280" }} />
                    <div className="ip-ev-body">
                      <div className="ip-ev-top">
                        <span className="ip-ev-type">{EVENT_LABEL[e.type] || e.type}{e.qty ? ` · ${e.qty > 0 ? "+" : ""}${e.qty}` : ""}</span>
                        <span className="ip-ev-at">{fmt(e.at)}</span>
                      </div>
                      <div className="ip-ev-meta">
                        {e.serial && <span className="ip-mono">{e.serial}</span>}
                        {e.project_access_id && <Link className="idlink" href={`/project/${e.project_access_id}`}>{e.project_customer || e.project_access_id}</Link>}
                        {e.actor_name && <span>by {e.actor_name}</span>}
                        {e.note && <span className="ip-ev-note">{e.note}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .apx .ip-crumb{margin-bottom:8px}
        .apx .ip-crumb a{color:var(--muted);font-size:.84rem;font-weight:600;text-decoration:none}
        .apx .ip-crumb a:hover{color:var(--ink)}
        .apx .ip-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82rem;color:var(--muted)}
        .apx .ip-daterow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .apx .ip-date-lbl{font-size:.8rem;font-weight:700;color:var(--muted)}
        .apx .ip-date{width:auto;padding:6px 9px;font-size:.82rem}
        .apx .ip-presets{display:flex;gap:5px}
        .apx .ip-presets button{height:30px;padding:0 11px;border:1px solid var(--line);border-radius:8px;background:var(--bg-soft);color:var(--muted);font-size:.74rem;font-weight:800;cursor:pointer;font-family:inherit}
        .apx .ip-presets button.on{background:var(--gold);border-color:var(--gold);color:#fff}
        .apx .ip-range-note{font-size:.78rem;color:var(--muted)}
        .apx .ip-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
        .apx .ip-panel{padding:0;overflow:hidden}
        .apx .ip-panel-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line);font-size:.86rem;font-weight:800;color:var(--ink)}
        .apx .ip-panel-hd b{color:var(--muted);font-weight:700}
        .apx .ip-serial-search{width:150px;padding:5px 9px;font-size:.8rem}
        .apx .ip-units{display:flex;flex-direction:column;max-height:520px;overflow-y:auto}
        .apx .ip-unit{display:flex;align-items:center;gap:11px;padding:10px 16px;border-bottom:1px solid var(--line);font-size:.84rem}
        .apx .ip-unit:last-child{border-bottom:none}
        .apx .ip-serial{flex-shrink:0;color:var(--ink);font-weight:600}
        .apx .ip-ustatus{font-size:.7rem;font-weight:800;text-transform:capitalize}
        .apx .ip-uproj{font-size:.78rem}
        .apx .ip-udate{margin-left:auto;font-size:.74rem;color:var(--muted);white-space:nowrap}
        .apx .ip-timeline{display:flex;flex-direction:column;max-height:520px;overflow-y:auto;padding:4px 16px}
        .apx .ip-event{display:flex;gap:11px;padding:11px 0;border-bottom:1px solid var(--line)}
        .apx .ip-event:last-child{border-bottom:none}
        .apx .ip-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;margin-top:5px}
        .apx .ip-ev-body{flex:1;min-width:0}
        .apx .ip-ev-top{display:flex;justify-content:space-between;gap:10px}
        .apx .ip-ev-type{font-size:.85rem;font-weight:700;color:var(--ink)}
        .apx .ip-ev-at{font-size:.74rem;color:var(--muted);white-space:nowrap}
        .apx .ip-ev-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:.78rem;color:var(--muted);margin-top:2px}
        .apx .ip-ev-note{font-style:italic}
        @media(max-width:820px){.apx .ip-cols{grid-template-columns:1fr}}
      `}</style>
    </AdminShell>
  );
}

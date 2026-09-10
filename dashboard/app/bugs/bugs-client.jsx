"use client";
import { useState } from "react";

// Bug portal list. Open reports on top; resolve/reopen with one tap. Each shows the page it came from,
// who reported it, when, and its screenshot (click to view full-size).
const fmt = (s) => { try { return new Date(String(s).replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return s; } };

export default function BugsClient({ initial = [] }) {
  const [bugs, setBugs] = useState(initial);
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState(null);
  const [zoom, setZoom] = useState(null);

  const openN = bugs.filter((b) => b.status === "open").length;
  const shown = bugs.filter((b) => (filter === "all" ? true : b.status === filter));

  async function toggle(b) {
    setBusy(b.id);
    const resolved = b.status !== "resolved";
    const r = await fetch("/api/bug-report", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, resolved }),
    }).then((x) => x.json()).catch(() => ({}));
    setBusy(null);
    if (r?.ok) setBugs((list) => list.map((x) => x.id === b.id ? { ...x, status: resolved ? "resolved" : "open", resolved_at: resolved ? new Date().toISOString() : null } : x));
  }

  return (
    <div className="bgp">
      <style>{CSS}</style>
      <div className="bgp-top">
        <div>
          <h1 className="bgp-h1">Bug portal</h1>
          <p className="bgp-sub">{openN} open · {bugs.length} total</p>
        </div>
        <div className="bgp-seg">
          {["open", "resolved", "all"].map((k) => (
            <button key={k} className={`bgp-tab${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="bgp-empty">{filter === "open" ? "No open bugs — all clear." : "Nothing here."}</div>
      ) : (
        <div className="bgp-list">
          {shown.map((b) => (
            <div key={b.id} className={`bgp-card${b.status === "resolved" ? " done" : ""}`}>
              {b.image_url && (
                <button className="bgp-thumb" onClick={() => setZoom(b.image_url)} title="View screenshot">
                  <img src={b.image_url} alt="screenshot" />
                </button>
              )}
              <div className="bgp-body">
                <div className="bgp-desc">{b.description}</div>
                <div className="bgp-meta">
                  <span className="bgp-id">#{b.id}</span>
                  {b.path && <a className="bgp-path" href={b.url || b.path} target="_blank" rel="noreferrer">{b.path}</a>}
                  <span>{b.reporter || "anonymous"}{b.role ? ` · ${b.role}` : ""}</span>
                  <span>{fmt(b.created_at)}</span>
                  {b.status === "resolved" && b.resolved_at && <span className="bgp-res">resolved {fmt(b.resolved_at)}{b.resolved_by ? ` · ${b.resolved_by}` : ""}</span>}
                </div>
              </div>
              <button className={`bgp-btn${b.status === "resolved" ? " reopen" : ""}`} disabled={busy === b.id} onClick={() => toggle(b)}>
                {busy === b.id ? "…" : b.status === "resolved" ? "Reopen" : "Resolve"}
              </button>
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div className="bgp-zoom" onClick={() => setZoom(null)}>
          <img src={zoom} alt="screenshot" />
        </div>
      )}
    </div>
  );
}

const CSS = `
.bgp{max-width:920px;margin:0 auto;padding:32px 20px 80px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#12151b}
.bgp-top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.bgp-h1{margin:0;font-size:1.6rem;font-weight:800;letter-spacing:-.02em}
.bgp-sub{margin:4px 0 0;color:#787d84;font-size:.86rem}
.bgp-seg{display:inline-flex;padding:3px;gap:2px;background:#f1f2f4;border:1px solid #e4e4df;border-radius:100px}
.bgp-tab{border:0;background:transparent;cursor:pointer;font:700 .8rem/1 inherit;color:#787d84;padding:7px 14px;border-radius:100px}
.bgp-tab.on{background:#12151b;color:#fff}
.bgp-empty{text-align:center;padding:60px 16px;color:#787d84;border:1px dashed #e4e4df;border-radius:14px}
.bgp-list{display:flex;flex-direction:column;gap:10px}
.bgp-card{display:flex;align-items:flex-start;gap:14px;padding:14px;border:1px solid #e4e4df;border-radius:14px;background:#fff}
.bgp-card.done{opacity:.6;background:#fbfbfa}
.bgp-thumb{flex:0 0 auto;border:0;padding:0;background:none;cursor:pointer;border-radius:9px;overflow:hidden;line-height:0}
.bgp-thumb img{width:84px;height:84px;object-fit:cover;border:1px solid #e4e4df;border-radius:9px}
.bgp-body{flex:1;min-width:0}
.bgp-desc{font-size:.9rem;font-weight:500;white-space:pre-wrap;word-break:break-word}
.bgp-meta{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px;font-size:.74rem;color:#787d84}
.bgp-id{font-weight:700;color:#12151b}
.bgp-path{color:#3a6ea5;text-decoration:none;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bgp-path:hover{text-decoration:underline}
.bgp-res{color:#2e7d5b;font-weight:600}
.bgp-btn{flex:0 0 auto;height:34px;padding:0 15px;border:0;border-radius:9px;background:#12151b;color:#fff;font:700 .8rem/1 inherit;cursor:pointer}
.bgp-btn.reopen{background:#fff;border:1px solid #e4e4df;color:#4a5058}
.bgp-btn:disabled{opacity:.5}
.bgp-zoom{position:fixed;inset:0;z-index:1000;background:rgba(8,10,14,.86);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out}
.bgp-zoom img{max-width:96vw;max-height:92vh;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
@media (prefers-color-scheme:dark){
  .bgp{color:#e9edf2} .bgp-h1{color:#fff} .bgp-card{background:#161a20;border-color:#2a2f37} .bgp-card.done{background:#12151a}
  .bgp-seg{background:#1b1f26;border-color:#2a2f37} .bgp-tab.on{background:#e9edf2;color:#12151b}
  .bgp-btn.reopen{background:#161a20;border-color:#2a2f37;color:#c8ccd2} .bgp-empty{border-color:#2a2f37}
}
`;

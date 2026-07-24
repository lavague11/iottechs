"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AdminShell from "../../components/admin-shell";

// Site-survey library — mirrors the System QR library: search, With/Empty tabs, card grid.
// A card opens the project gateway, where the live survey editor is.
export default function SurveyLibraryClient({ user, alerts, rows = [] }) {
  const [query, setQuery]   = useState("");
  const [filter, setFilter] = useState("all");   // all | has | missing

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => rows.filter((r) => {
    if (filter === "has" && !r.has) return false;
    if (filter === "missing" && r.has) return false;
    if (!q) return true;
    return r.customer.toLowerCase().includes(q)
      || r.access_id.toLowerCase().includes(q)
      || (r.address || "").toLowerCase().includes(q)
      || (r.title || "").toLowerCase().includes(q);
  }), [rows, q, filter]);

  const withData = rows.filter((r) => r.has).length;

  return (
    <AdminShell user={user} alerts={alerts} active="support">
      <div className="apx-wrap">
        <div className="page-head svl-head">
          <div>
            <h1>Site Surveys</h1>
            <div className="ph-sub">{withData} of {rows.length} project{rows.length === 1 ? "" : "s"} have a survey</div>
          </div>
          <Link href="/support" className="svl-back">← Support</Link>
        </div>

        <div className="sec-head">
          <input className="apx-input" style={{ maxWidth: 420 }} placeholder="Search customer, address, title, or project ID…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="svl-tabs">
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All {rows.length}</button>
            <button className={filter === "has" ? "on" : ""} onClick={() => setFilter("has")}>With survey {withData}</button>
            <button className={filter === "missing" ? "on" : ""} onClick={() => setFilter("missing")}>Empty {rows.length - withData}</button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">{q ? "No projects match." : "No projects yet."}</div></div>
        ) : (
          <div className="svl-grid">
            {visible.map((r) => (
              <Link className={`svl-card${r.has ? "" : " none"}`} key={r.access_id} href={`/project/${r.access_id}`}>
                <span className={`svl-plan${r.has ? "" : " empty"}`}>
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                  {r.has ? (
                    <span className="svl-stats">
                      <span><b>{r.floors}</b> floor{r.floors === 1 ? "" : "s"}</span>
                      <span><b>{r.devices}</b> device{r.devices === 1 ? "" : "s"}</span>
                      {r.rooms > 0 && <span><b>{r.rooms}</b> room{r.rooms === 1 ? "" : "s"}</span>}
                    </span>
                  ) : (
                    <span className="svl-slot-t">No survey yet</span>
                  )}
                </span>
                <div className="svl-name">{r.customer}</div>
                <div className="svl-meta mono">{r.access_id}</div>
                {r.title && <div className="svl-meta">{r.title}</div>}
                {r.address && <div className="svl-meta">{r.address}</div>}
                {r.updated_at && <div className="svl-meta dim">Updated {String(r.updated_at).slice(0, 10)}{r.updated_by ? ` · ${r.updated_by}` : ""}</div>}
              </Link>
            ))}
          </div>
        )}
      </div>
      <style>{CSS}</style>
    </AdminShell>
  );
}

const CSS = `
.apx .svl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.apx .svl-back{font-size:.85rem;font-weight:600;color:var(--gold-deep,#b08f4f);text-decoration:none;white-space:nowrap;padding-top:6px}
.apx .svl-back:hover{text-decoration:underline}
.apx .svl-tabs{display:flex;gap:6px}
.apx .svl-tabs button{height:34px;padding:0 14px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.apx .svl-tabs button.on{background:var(--gold-deep,#b08f4f);border-color:var(--gold-deep,#b08f4f);color:#fff}
.apx .svl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-top:4px}
.apx .svl-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 14px 14px;background:#fff;border:1px solid var(--line);border-radius:14px;text-align:center;text-decoration:none;color:inherit;transition:border-color .12s,box-shadow .12s,transform .12s}
.apx .svl-card:hover{border-color:var(--gold,#C9A96E);box-shadow:0 14px 30px -16px rgba(0,0,0,.28);transform:translateY(-2px)}
.apx .svl-card.none{border-style:dashed;background:var(--bg-soft,#fafaf8)}
.apx .svl-plan{width:100%;min-height:96px;margin-bottom:8px;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:#f8f0e0;color:var(--gold-deep,#b08f4f)}
.apx .svl-plan.empty{background:#fff;border:1px dashed var(--line);color:#a9a396}
.apx .svl-stats{display:flex;gap:12px;font-size:.76rem;color:var(--ink);font-weight:600}
.apx .svl-stats b{font-size:.95rem;font-weight:800}
.apx .svl-slot-t{font-size:.76rem;font-weight:700;color:var(--muted)}
.apx .svl-name{font-size:.9rem;font-weight:700;color:var(--ink);line-height:1.2}
.apx .svl-meta{font-size:.72rem;color:var(--muted);line-height:1.35}
.apx .svl-meta.mono{font-family:Menlo,Consolas,monospace;color:var(--gold-deep,#b08f4f);font-weight:600}
.apx .svl-meta.dim{color:#a9a396}
`;

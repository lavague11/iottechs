"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AdminShell from "../../components/admin-shell";

// Mockup library — mirrors the System QR library: search, With/Empty tabs, thumbnail grid.
// A card opens the project gateway, where the live mockup tool is. Oversized first photos ship
// as count-only cards (server caps the thumb), so the page stays light.
export default function MockupLibraryClient({ user, alerts, rows = [] }) {
  const [query, setQuery]   = useState("");
  const [filter, setFilter] = useState("has");   // has (default) | missing | all — empties hide unless searched or filtered

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => rows.filter((r) => {
    // A search sweeps EVERYTHING (that's how you find an empty one); otherwise the tab decides.
    if (!q) {
      if (filter === "has" && !r.has) return false;
      if (filter === "missing" && r.has) return false;
      return true;
    }
    return r.customer.toLowerCase().includes(q)
      || r.access_id.toLowerCase().includes(q)
      || (r.address || "").toLowerCase().includes(q);
  }), [rows, q, filter]);

  const withData = rows.filter((r) => r.has).length;

  return (
    <AdminShell user={user} alerts={alerts} active="support">
      <div className="apx-wrap">
        <div className="page-head mkl-head">
          <div>
            <h1>Mockups</h1>
            <div className="ph-sub">{withData} of {rows.length} project{rows.length === 1 ? "" : "s"} have a mockup</div>
          </div>
          <Link href="/support" className="mkl-back">← Support</Link>
        </div>

        <div className="sec-head">
          <input className="apx-input" style={{ maxWidth: 420 }} placeholder="Search customer, address, or project ID…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="mkl-tabs">
            <button className={filter === "has" ? "on" : ""} onClick={() => setFilter("has")}>With mockup {withData}</button>
            <button className={filter === "missing" ? "on" : ""} onClick={() => setFilter("missing")}>Empty {rows.length - withData}</button>
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All {rows.length}</button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">{q ? "No projects match." : "No projects yet."}</div></div>
        ) : (
          <div className="mkl-grid">
            {visible.map((r) => (
              <Link className={`mkl-card${r.has ? "" : " none"}`} key={r.access_id} href={`/project/${r.access_id}`}>
                {r.thumb ? (
                  <span className="mkl-shot">
                    <img src={r.thumb} alt={`Mockup for ${r.customer}`} draggable={false} />
                    {r.count > 1 && <span className="mkl-count">+{r.count - 1}</span>}
                  </span>
                ) : (
                  <span className={`mkl-slot${r.has ? " filled" : ""}`}>
                    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span className="mkl-slot-t">{r.has ? `${r.count} photo${r.count === 1 ? "" : "s"}` : "No mockup yet"}</span>
                  </span>
                )}
                <div className="mkl-name">{r.customer}</div>
                <div className="mkl-meta mono">{r.access_id}</div>
                {r.address && <div className="mkl-meta">{r.address}</div>}
                {r.updated_at && <div className="mkl-meta dim">Updated {String(r.updated_at).slice(0, 10)}{r.updated_by ? ` · ${r.updated_by}` : ""}</div>}
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
.apx .mkl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.apx .mkl-back{font-size:.85rem;font-weight:600;color:var(--gold-deep,#b08f4f);text-decoration:none;white-space:nowrap;padding-top:6px}
.apx .mkl-back:hover{text-decoration:underline}
.apx .mkl-tabs{display:flex;gap:6px}
.apx .mkl-tabs button{height:34px;padding:0 14px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.apx .mkl-tabs button.on{background:var(--gold-deep,#b08f4f);border-color:var(--gold-deep,#b08f4f);color:#fff}
.apx .mkl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-top:4px}
.apx .mkl-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 14px 14px;background:#fff;border:1px solid var(--line);border-radius:14px;text-align:center;text-decoration:none;color:inherit;transition:border-color .12s,box-shadow .12s,transform .12s}
.apx .mkl-card:hover{border-color:var(--gold,#C9A96E);box-shadow:0 14px 30px -16px rgba(0,0,0,.28);transform:translateY(-2px)}
.apx .mkl-card.none{border-style:dashed;background:var(--bg-soft,#fafaf8)}
.apx .mkl-shot{position:relative;width:100%;height:120px;margin-bottom:8px;border-radius:10px;overflow:hidden;background:#0B0F1A}
.apx .mkl-shot img{width:100%;height:100%;object-fit:cover;display:block}
.apx .mkl-count{position:absolute;bottom:6px;right:6px;font-size:.7rem;font-weight:800;color:#fff;background:rgba(11,15,26,.72);border-radius:100px;padding:2px 8px}
.apx .mkl-slot{width:100%;height:120px;margin-bottom:8px;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#a9a396;background:#fff;border:1px dashed var(--line)}
.apx .mkl-slot.filled{background:#f8f0e0;border:none;color:var(--gold-deep,#b08f4f)}
.apx .mkl-slot-t{font-size:.76rem;font-weight:700;color:var(--muted)}
.apx .mkl-slot.filled .mkl-slot-t{color:var(--gold-deep,#b08f4f)}
.apx .mkl-name{font-size:.9rem;font-weight:700;color:var(--ink);line-height:1.2}
.apx .mkl-meta{font-size:.72rem;color:var(--muted);line-height:1.35}
.apx .mkl-meta.mono{font-family:Menlo,Consolas,monospace;color:var(--gold-deep,#b08f4f);font-weight:600}
.apx .mkl-meta.dim{color:#a9a396}
`;

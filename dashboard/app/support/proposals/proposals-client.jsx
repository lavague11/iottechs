"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AdminShell from "../../components/admin-shell";

const money = (n) => "$" + Math.round(+n || 0).toLocaleString("en-US");

// Status → { label, cls } for the card chip. A signed proposal reads "Signed" (the strongest state).
function statusChip(r) {
  if (r.signed) return { label: "Signed", cls: "ok" };
  switch (r.status) {
    case "accepted":          return { label: "Accepted", cls: "ok" };
    case "sent":              return { label: "Sent", cls: "sent" };
    case "changes_requested": return { label: "Changes", cls: "warn" };
    case "declined":          return { label: "Declined", cls: "bad" };
    case "draft":             return { label: "Draft", cls: "draft" };
    default:                  return { label: "—", cls: "draft" };
  }
}

// Proposal library — mirrors the System QR / Site Survey libraries: search, With/Empty tabs,
// card grid. A card opens the project gateway, where the live proposal builder is.
export default function ProposalLibraryClient({ user, alerts, rows = [] }) {
  const [query, setQuery]   = useState("");
  const [filter, setFilter] = useState("has");   // has (default) | missing | all — empties hide unless searched or filtered

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => rows.filter((r) => {
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
    <AdminShell user={user} alerts={alerts} active="proposals">
      <div className="apx-wrap">
        <div className="page-head pvl-head">
          <div>
            <h1>Proposals</h1>
            <div className="ph-sub">{withData} of {rows.length} project{rows.length === 1 ? "" : "s"} have a proposal</div>
          </div>
          <Link href="/support" className="pvl-back">← Support</Link>
        </div>

        <div className="sec-head">
          <input className="apx-input" style={{ maxWidth: 420 }} placeholder="Search customer, address, or project ID…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="pvl-tabs">
            <button className={filter === "has" ? "on" : ""} onClick={() => setFilter("has")}>With proposal {withData}</button>
            <button className={filter === "missing" ? "on" : ""} onClick={() => setFilter("missing")}>Empty {rows.length - withData}</button>
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All {rows.length}</button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">{q ? "No projects match." : "No projects yet."}</div></div>
        ) : (
          <div className="pvl-grid">
            {visible.map((r) => {
              const chip = statusChip(r);
              return (
                <Link className={`pvl-card${r.has ? "" : " none"}`} key={r.access_id} href={`/project/${r.access_id}`}>
                  <span className={`pvl-face${r.has ? "" : " empty"}`}>
                    {r.has ? (
                      <>
                        <span className={`pvl-chip ${chip.cls}`}>{chip.label}</span>
                        <span className="pvl-total">{money(r.total)}</span>
                        <span className="pvl-sub">
                          {r.items} item{r.items === 1 ? "" : "s"}
                          {r.options > 1 ? ` · ${r.options} options` : ""}
                          {r.version ? ` · v${r.version}` : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span className="pvl-slot-t">No proposal yet</span>
                      </>
                    )}
                  </span>
                  <div className="pvl-name">{r.customer}</div>
                  <div className="pvl-meta mono">{r.access_id}</div>
                  {r.address && <div className="pvl-meta">{r.address}</div>}
                  {r.updated_at && <div className="pvl-meta dim">Updated {String(r.updated_at).slice(0, 10)}{r.updated_by ? ` · ${r.updated_by}` : ""}</div>}
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <style>{CSS}</style>
    </AdminShell>
  );
}

const CSS = `
.apx .pvl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.apx .pvl-back{font-size:.85rem;font-weight:600;color:var(--gold-deep,#b08f4f);text-decoration:none;white-space:nowrap;padding-top:6px}
.apx .pvl-back:hover{text-decoration:underline}
.apx .pvl-tabs{display:flex;gap:6px}
.apx .pvl-tabs button{height:34px;padding:0 14px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.apx .pvl-tabs button.on{background:var(--gold-deep,#b08f4f);border-color:var(--gold-deep,#b08f4f);color:#fff}
.apx .pvl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-top:4px}
.apx .pvl-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 14px 14px;background:#fff;border:1px solid var(--line);border-radius:14px;text-align:center;text-decoration:none;color:inherit;transition:border-color .12s,box-shadow .12s,transform .12s}
.apx .pvl-card:hover{border-color:var(--gold,#C9A96E);box-shadow:0 14px 30px -16px rgba(0,0,0,.28);transform:translateY(-2px)}
.apx .pvl-card.none{border-style:dashed;background:var(--bg-soft,#fafaf8)}
.apx .pvl-face{width:100%;min-height:96px;margin-bottom:8px;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#f8f0e0;color:var(--gold-deep,#b08f4f)}
.apx .pvl-face.empty{background:#fff;border:1px dashed var(--line);color:#a9a396}
.apx .pvl-total{font-size:1.5rem;font-weight:800;color:var(--ink);line-height:1}
.apx .pvl-sub{font-size:.72rem;font-weight:600;color:var(--muted)}
.apx .pvl-chip{font-size:.62rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:2px 9px;border-radius:100px;color:#fff}
.apx .pvl-chip.ok{background:var(--green,#1c8a45)}
.apx .pvl-chip.sent{background:var(--gold-deep,#b08f4f)}
.apx .pvl-chip.warn{background:#c98a1e}
.apx .pvl-chip.bad{background:#c0392b}
.apx .pvl-chip.draft{background:#8a94ad}
.apx .pvl-slot-t{font-size:.76rem;font-weight:700;color:var(--muted)}
.apx .pvl-name{font-size:.9rem;font-weight:700;color:var(--ink);line-height:1.2}
.apx .pvl-meta{font-size:.72rem;color:var(--muted);line-height:1.35}
.apx .pvl-meta.mono{font-family:Menlo,Consolas,monospace;color:var(--gold-deep,#b08f4f);font-weight:600}
.apx .pvl-meta.dim{color:#a9a396}
`;

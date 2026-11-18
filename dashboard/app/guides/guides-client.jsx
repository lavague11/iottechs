"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

// SOP Guides grid — search + category chips + cards (first photo + step count). Mobile-first, dark look
// matching the builder so a shared public link reads as one product.
export default function GuidesClient({ sops = [], staff = false, canBuild = false }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const cats = useMemo(() => [...new Set(sops.map((s) => s.category).filter(Boolean))].sort(), [sops]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return sops.filter((s) =>
      (!cat || s.category === cat) &&
      (!t || (s.title || "").toLowerCase().includes(t) || (s.business || "").toLowerCase().includes(t) || (s.category || "").toLowerCase().includes(t)));
  }, [sops, q, cat]);

  return (
    <div className="supl">
      <style>{CSS}</style>
      <header className="supl-top">
        <div className="supl-head-row">
          <h1>Guides</h1>
          {canBuild && <Link className="supl-build" href="/tools/sop-builder">+ Build guide</Link>}
        </div>
        <p>How-to guides and standard procedures.</p>
      </header>
      <div className="supl-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guides" aria-label="Search" /></div>
      {cats.length > 0 && (
        <div className="supl-chips">
          <button className={cat === "" ? "on" : ""} onClick={() => setCat("")}>All</button>
          {cats.map((c) => <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      )}
      {list.length === 0 ? (
        <div className="supl-empty">{sops.length === 0 ? "No published guides yet." : "No guides match."}</div>
      ) : (
        <div className="supl-grid">
          {list.map((s) => (
            // The card is a wrapper, not a Link, because the Edit pencil is itself a link and an anchor
            // cannot be nested inside another anchor. The whole card stays clickable via .supl-open.
            <div className="supl-card" key={s.slug}>
              <Link className="supl-open" href={`/guides/${s.slug}`}>
                <div className="supl-thumb">{s.thumb ? <img src={s.thumb} alt="" /> : <span className="supl-ph"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M21 16l-5-5-9 9" /></svg></span>}
                  {staff && s.visibility === "internal" && <span className="supl-badge">Internal</span>}</div>
                <div className="supl-meta">
                  <div className="supl-title">{s.title}</div>
                  <div className="supl-sub">{s.steps} step{s.steps === 1 ? "" : "s"}{s.business ? ` · ${s.business}` : ""}{s.category ? ` · ${s.category}` : ""}</div>
                </div>
              </Link>
              {canBuild && (
                <Link className="supl-edit" href={`/tools/sop-builder?sop=${encodeURIComponent(s.slug)}`}
                      title="Edit" aria-label={`Edit ${s.title}`}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CSS = `
.supl{--bg:#0c0e11;--card:#16181c;--line:#2a2d33;--mut:#9aa0ab;--acc:#C9A96E;background:var(--bg);color:#f2f3f5;
  font:16px/1.45 -apple-system,system-ui,sans-serif;min-height:100dvh;max-width:860px;margin:auto;padding:max(18px,env(safe-area-inset-top)) 16px 60px}
.supl *{box-sizing:border-box}
.supl-head-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.supl-top h1{font-size:28px;font-weight:800;letter-spacing:-.4px}
.supl-build{background:var(--acc);color:#101418;text-decoration:none;font-weight:800;font-size:14px;border-radius:12px;padding:10px 14px;white-space:nowrap}
.supl-top p{color:var(--mut);margin-top:4px}
.supl-search{margin:16px 0 12px}
.supl-search input{width:100%;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:16px;color:#fff}
.supl-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.supl-chips button{border:1px solid var(--line);background:var(--card);color:var(--mut);border-radius:999px;padding:7px 13px;font-size:13px;font-weight:700}
.supl-chips button.on{background:#fff;color:#000;border-color:#fff}
.supl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.supl-card{position:relative;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;color:#fff}
.supl-card:hover{border-color:#4a4a52}
.supl-open{display:flex;flex-direction:column;text-decoration:none;color:inherit}
/* Edit — staff only, top-right over the thumbnail. Sits above the card link so it stays clickable. */
.supl-edit{position:absolute;right:8px;top:8px;z-index:2;display:flex;align-items:center;justify-content:center;
  width:30px;height:30px;border-radius:9px;background:rgba(0,0,0,.72);border:1px solid var(--line);color:var(--acc);text-decoration:none}
.supl-edit:hover{background:rgba(0,0,0,.9);border-color:var(--acc)}
.supl-thumb{position:relative;aspect-ratio:16/10;background:#000;display:flex;align-items:center;justify-content:center}
.supl-thumb img{width:100%;height:100%;object-fit:cover}
.supl-ph{color:#333;display:inline-flex}
.supl-badge{position:absolute;left:8px;top:8px;background:rgba(0,0,0,.72);border:1px solid var(--line);border-radius:7px;padding:2px 8px;font-size:11px;font-weight:700;color:var(--acc)}
.supl-meta{padding:11px 12px}
.supl-title{font-weight:800;font-size:16px}
.supl-sub{color:var(--mut);font-size:13px;margin-top:3px}
.supl-empty{text-align:center;color:var(--mut);padding:60px 0}
`;

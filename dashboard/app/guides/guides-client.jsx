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
            <Link className="supl-card" key={s.slug} href={`/guides/${s.slug}`}>
              <div className="supl-thumb">{s.thumb ? <img src={s.thumb} alt="" /> : <span className="supl-ph">◻</span>}
                {staff && s.visibility === "internal" && <span className="supl-badge">Internal</span>}</div>
              <div className="supl-meta">
                <div className="supl-title">{s.title}</div>
                <div className="supl-sub">{s.steps} step{s.steps === 1 ? "" : "s"}{s.business ? ` · ${s.business}` : ""}{s.category ? ` · ${s.category}` : ""}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const CSS = `
.supl{--bg:#0b0b0c;--card:#131315;--line:#2b2b30;--mut:#9d9da4;--acc:#FFD60A;background:var(--bg);color:#fff;
  font:16px/1.45 -apple-system,system-ui,sans-serif;min-height:100dvh;max-width:860px;margin:auto;padding:max(18px,env(safe-area-inset-top)) 16px 60px}
.supl *{box-sizing:border-box}
.supl-head-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.supl-top h1{font-size:28px;font-weight:800;letter-spacing:-.4px}
.supl-build{background:linear-gradient(90deg,#f58529,#dd2a7b,#8134af);color:#fff;text-decoration:none;font-weight:800;font-size:14px;border-radius:12px;padding:10px 14px;white-space:nowrap}
.supl-top p{color:var(--mut);margin-top:4px}
.supl-search{margin:16px 0 12px}
.supl-search input{width:100%;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:16px;color:#fff}
.supl-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.supl-chips button{border:1px solid var(--line);background:var(--card);color:var(--mut);border-radius:999px;padding:7px 13px;font-size:13px;font-weight:700}
.supl-chips button.on{background:#fff;color:#000;border-color:#fff}
.supl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.supl-card{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;text-decoration:none;color:#fff}
.supl-card:hover{border-color:#4a4a52}
.supl-thumb{position:relative;aspect-ratio:16/10;background:#000;display:flex;align-items:center;justify-content:center}
.supl-thumb img{width:100%;height:100%;object-fit:cover}
.supl-ph{color:#333;font-size:40px}
.supl-badge{position:absolute;left:8px;top:8px;background:rgba(0,0,0,.72);border:1px solid var(--line);border-radius:7px;padding:2px 8px;font-size:11px;font-weight:700;color:var(--acc)}
.supl-meta{padding:11px 12px}
.supl-title{font-weight:800;font-size:16px}
.supl-sub{color:var(--mut);font-size:13px;margin-top:3px}
.supl-empty{text-align:center;color:var(--mut);padding:60px 0}
`;

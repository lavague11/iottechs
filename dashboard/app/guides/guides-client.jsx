"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { archiveSopBySlugAction, restoreSopAction } from "../tools/sop-builder/actions";

// SOP Guides grid — search + category chips + cards (first photo + step count). Mobile-first, dark look
// matching the builder so a shared public link reads as one product.
export default function GuidesClient({ sops = [], staff = false, canBuild = false }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [ask, setAsk] = useState("");      // slug awaiting the second tap of Delete
  const [gone, setGone] = useState([]);    // removed this session, hidden before the refresh lands
  const [note, setNote] = useState(null);  // { msg, undo }
  const cats = useMemo(() => [...new Set(sops.map((s) => s.category).filter(Boolean))].sort(), [sops]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return sops.filter((s) =>
      !gone.includes(s.slug) &&
      (!cat || s.category === cat) &&
      (!t || (s.title || "").toLowerCase().includes(t) || (s.business || "").toLowerCase().includes(t) || (s.category || "").toLowerCase().includes(t)));
  }, [sops, q, cat, gone]);

  // Delete here ARCHIVES: the guide and its published snapshots are kept, it just leaves this library
  // and its public URL. Two taps to fire, then Undo puts it straight back.
  async function remove(s) {
    setAsk("");
    const r = await archiveSopBySlugAction(s.slug);
    if (!r?.ok) { setNote({ msg: r?.error || "Couldn't remove it." }); return; }
    setGone((g) => [...g, s.slug]);
    setNote({ msg: `“${s.title}” removed.`, undo: async () => {
      const u = await restoreSopAction(r.id);
      setGone((g) => g.filter((x) => x !== s.slug));
      setNote(null);
      if (!u?.ok) setNote({ msg: u?.error || "Couldn't restore it." }); else router.refresh();
    } });
    router.refresh();
  }

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
              {s.editable && (
                <div className="supl-acts">
                  {ask === s.slug ? (
                    <>
                      <button type="button" className="supl-act" title="Keep" aria-label="Keep it" onClick={() => setAsk("")}>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                      <button type="button" className="supl-act danger" onClick={() => remove(s)}>Delete</button>
                    </>
                  ) : (
                    <>
                      <Link className="supl-act" href={`/tools/sop-builder?sop=${encodeURIComponent(s.slug)}`}
                            title="Edit" aria-label={`Edit ${s.title}`}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                      </Link>
                      <button type="button" className="supl-act" title="Delete" aria-label={`Delete ${s.title}`} onClick={() => setAsk(s.slug)}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {note && (
        <div className="supl-toast" role="status">{note.msg}
          {note.undo && <button type="button" onClick={note.undo}>Undo</button>}
          <button type="button" className="supl-toast-x" aria-label="Dismiss" onClick={() => setNote(null)}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
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
/* Edit + Delete — staff only, top-right over the thumbnail. Above the card link so they stay clickable. */
.supl-acts{position:absolute;right:8px;top:8px;z-index:2;display:flex;gap:6px}
.supl-act{display:flex;align-items:center;justify-content:center;height:30px;min-width:30px;padding:0;
  border-radius:9px;background:rgba(0,0,0,.72);border:1px solid var(--line);color:var(--acc);text-decoration:none;
  font:800 12.5px/1 inherit;cursor:pointer}
.supl-act:hover{background:rgba(0,0,0,.9);border-color:var(--acc)}
.supl-act.danger{padding:0 11px;background:#c4553d;border-color:#c4553d;color:#fff}
.supl-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#fff;color:#000;border-radius:14px;
  padding:12px 14px;font-size:14px;font-weight:600;z-index:40;max-width:92vw;box-shadow:0 8px 30px rgba(0,0,0,.6);
  display:flex;gap:12px;align-items:center}
.supl-toast button{border:0;background:none;color:#0a84ff;font-weight:800;cursor:pointer;padding:0}
.supl-toast .supl-toast-x{color:#777;display:inline-flex}
.supl-thumb{position:relative;aspect-ratio:16/10;background:#000;display:flex;align-items:center;justify-content:center}
.supl-thumb img{width:100%;height:100%;object-fit:cover}
.supl-ph{color:#333;display:inline-flex}
.supl-badge{position:absolute;left:8px;top:8px;background:rgba(0,0,0,.72);border:1px solid var(--line);border-radius:7px;padding:2px 8px;font-size:11px;font-weight:700;color:var(--acc)}
.supl-meta{padding:11px 12px}
.supl-title{font-weight:800;font-size:16px}
.supl-sub{color:var(--mut);font-size:13px;margin-top:3px}
.supl-empty{text-align:center;color:var(--mut);padding:60px 0}
`;

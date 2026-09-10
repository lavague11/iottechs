"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Wordmark, BrandLink } from "../components/brand";

// Internal Bugs surface. Header ties it to the app (logo → home/dashboard, back arrow → history).
// Each record: screenshot · issue · metadata · one Copy menu (Image/Text/Prompt/All) · More · Resolve,
// with the generated fix prompt flattened underneath. Auto-refreshes so new reports appear live.
const fmt = (s) => { try { const d = new Date(String(s).replace(" ", "T")); return d.toLocaleString("en-US", { month: "short", day: "numeric" }) + " · " + d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" }); } catch { return s; } };
const who = (r) => (r && r.includes("@") ? r.split("@")[0] : r);
const isLong = (t) => !!t && (t.length > 230 || (t.match(/\n/g) || []).length > 3);
// A report may carry several screenshots (image_urls JSON) or one legacy image_url.
const imgsOf = (b) => { try { const a = JSON.parse(b.image_urls || "null"); if (Array.isArray(a) && a.length) return a; } catch { /* fall through */ } return b.image_url ? [b.image_url] : []; };
const ctxOf = (b) => { try { const c = JSON.parse(b.context || "null"); return c && typeof c === "object" ? c : null; } catch { return null; } };

async function toPngBlob(blob) {
  if (blob.type === "image/png") return blob;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    return await new Promise((r) => c.toBlob(r, "image/png"));
  } finally { URL.revokeObjectURL(url); }
}

export default function BugsClient({ initial = [] }) {
  const router = useRouter();
  const [bugs, setBugs] = useState(initial);
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState(null);
  const [gallery, setGallery] = useState(null);   // { urls, i } image preview
  const [suggest, setSuggest] = useState(() => Object.fromEntries(initial.filter((b) => b.fix_prompt).map((b) => [b.id, b.fix_prompt])));
  const [sugBusy, setSugBusy] = useState(null);
  const [fresh, setFresh] = useState(false);
  const [menuFor, setMenuFor] = useState(null);   // bug id whose Copy menu is open
  const [moreFor, setMoreFor] = useState(null);   // bug id whose More menu is open
  const [expanded, setExpanded] = useState(() => new Set());
  const [ctxOpen, setCtxOpen] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const seenRef = useRef(new Set(initial.map((b) => b.id)));

  // Auto-refresh — poll so the surface stays live without a manual reload.
  useEffect(() => {
    let live = true;
    const poll = async () => {
      const r = await fetch("/api/bug-report", { credentials: "same-origin" }).then((x) => x.json()).catch(() => null);
      if (!live || !r?.ok || !Array.isArray(r.bugs)) return;
      const hasNew = r.bugs.some((b) => b.status === "open" && !seenRef.current.has(b.id));
      seenRef.current = new Set(r.bugs.map((b) => b.id));
      setBugs(r.bugs);
      setSuggest((s) => { const next = { ...s }; r.bugs.forEach((b) => { if (b.fix_prompt && !next[b.id]) next[b.id] = b.fix_prompt; }); return next; });
      if (hasNew) { setFresh(true); setTimeout(() => setFresh(false), 2500); }
    };
    const t = setInterval(poll, 15000);
    return () => { live = false; clearInterval(t); };
  }, []);

  // Close menus on outside click / Escape; Escape also closes the image preview.
  useEffect(() => {
    if (menuFor == null && moreFor == null) return;
    const h = () => { setMenuFor(null); setMoreFor(null); };
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [menuFor, moreFor]);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") { setMenuFor(null); setMoreFor(null); setGallery(null); }
      else if (e.key === "ArrowLeft") setGallery((g) => (g && g.urls.length > 1 ? { ...g, i: (g.i - 1 + g.urls.length) % g.urls.length } : g));
      else if (e.key === "ArrowRight") setGallery((g) => (g && g.urls.length > 1 ? { ...g, i: (g.i + 1) % g.urls.length } : g));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  function flash(msg) { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? null : t)), 1300); }
  async function copyText(text) { try { await navigator.clipboard.writeText(text); flash("Copied"); } catch { flash("Copy failed"); } }
  async function copyImageUrl(url) {
    if (!url) return;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw 0;
      const raw = await fetch(url, { credentials: "same-origin" }).then((r) => r.blob());
      const png = await toPngBlob(raw);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      flash("Copied");
    } catch { flash("Image copy unsupported"); }
  }
  function copyAll(b) {
    const imgs = imgsOf(b);
    const parts = [`BUG #${b.id}`];
    if (b.path) parts.push(b.path);
    parts.push("", b.description);
    if (imgs.length) parts.push("", `${imgs.length} screenshot${imgs.length > 1 ? "s" : ""}:`, ...imgs);
    if (suggest[b.id]) parts.push("", "PROMPT", suggest[b.id]);
    copyText(parts.join("\n"));
  }

  async function getSuggestion(b) {
    if (sugBusy) return;
    setSugBusy(b.id); setMoreFor(null);
    const r = await fetch("/api/bug-suggest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, description: b.description, path: b.path, shots: imgsOf(b).length, error: ctxOf(b)?.errors?.[0]?.message || undefined }),
    }).then((x) => x.json()).catch(() => null);
    setSugBusy(null);
    if (r?.ok && r.suggestion) setSuggest((s) => ({ ...s, [b.id]: r.suggestion }));
    else setSuggest((s) => ({ ...s, [b.id]: r?.error || "Couldn't generate a prompt." }));
  }
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
  function goBack() { if (typeof window !== "undefined" && window.history.length > 2) router.back(); else router.push("/dashboard"); }
  function stop(e) { e.stopPropagation(); }

  const openN = bugs.filter((b) => b.status === "open").length;
  const shown = bugs.filter((b) => (filter === "all" ? true : b.status === filter));
  const emptyMsg = filter === "open" ? "All clear" : "No bugs";

  return (
    <div className="bgp">
      <style>{CSS}</style>

      <header className="bgp-head">
        <BrandLink className="bgp-logo"><Wordmark height={19} /></BrandLink>
        <div className="bgp-title">
          <button className="bgp-back" onClick={goBack} aria-label="Back" title="Back">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div>
            <h1 className="bgp-h1">Bugs</h1>
            <p className="bgp-sub">{openN} open · {bugs.length} total{fresh && <span className="bgp-live"> · new</span>}</p>
          </div>
        </div>
        <div className="bgp-seg" role="tablist" aria-label="Filter">
          {["open", "resolved", "all"].map((k) => (
            <button key={k} className={`bgp-tab${filter === k ? " on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
      </header>

      {shown.length === 0 ? (
        <div className="bgp-empty">{emptyMsg}</div>
      ) : (
        <div className="bgp-list">
          {shown.map((b) => {
            const prompt = suggest[b.id];
            const long = isLong(prompt);
            const open = expanded.has(b.id);
            const imgs = imgsOf(b);
            const ctx = ctxOf(b);
            return (
              <div key={b.id} className={`bgp-card${b.status === "resolved" ? " done" : ""}`}>
                <div className="bgp-row">
                  {imgs.length > 0 && (
                    <button className={`bgp-thumb${imgs.length > 1 ? " stack" : ""}`} onClick={() => setGallery({ urls: imgs, i: 0 })} aria-label={`View ${imgs.length} screenshot${imgs.length > 1 ? "s" : ""}`} title="View">
                      <img src={imgs[0]} alt="screenshot" />
                      {imgs.length > 1 && <span className="bgp-count-badge">{imgs.length}</span>}
                    </button>
                  )}
                  <div className="bgp-body">
                    <div className="bgp-desc">{b.description}</div>
                    <div className="bgp-meta">
                      <span className="bgp-id">#{b.id}</span>
                      {b.path && <a className="bgp-path" href={b.url || b.path} target="_blank" rel="noreferrer" onClick={stop}>{b.path}</a>}
                      <span>{fmt(b.created_at)}</span>
                      {b.reporter && <span className="bgp-who">{who(b.reporter)}{b.role ? ` · ${b.role}` : ""}</span>}
                      {b.status === "resolved" && b.resolved_at && <span className="bgp-res">resolved {fmt(b.resolved_at)}</span>}
                    </div>
                  </div>

                  <div className="bgp-act">
                    <div className="bgp-menuwrap">
                      <button className="bgp-ib" aria-label="Copy" title="Copy" onClick={(e) => { stop(e); setMoreFor(null); setMenuFor(menuFor === b.id ? null : b.id); }}>
                        <CopyI />
                      </button>
                      {menuFor === b.id && (
                        <div className="bgp-menu" onClick={stop}>
                          {imgs.length === 1 && <button onClick={() => { setMenuFor(null); copyImageUrl(imgs[0]); }}>Image</button>}
                          {imgs.length > 1 && (
                            <div className="bgp-imgrow">
                              <span>Image</span>
                              {imgs.map((u, i) => <button key={i} className="bgp-imgnum" onClick={() => { setMenuFor(null); copyImageUrl(u); }}>{i + 1}</button>)}
                            </div>
                          )}
                          <button onClick={() => { setMenuFor(null); copyText(b.description); }}>Text</button>
                          {prompt && <button onClick={() => { setMenuFor(null); copyText(prompt); }}>Prompt</button>}
                          <button onClick={() => { setMenuFor(null); copyAll(b); }}>All</button>
                        </div>
                      )}
                    </div>
                    <div className="bgp-menuwrap">
                      <button className="bgp-ib" aria-label="More" title="More" onClick={(e) => { stop(e); setMenuFor(null); setMoreFor(moreFor === b.id ? null : b.id); }}>
                        <MoreI />
                      </button>
                      {moreFor === b.id && (
                        <div className="bgp-menu" onClick={stop}>
                          <button disabled={sugBusy === b.id} onClick={() => getSuggestion(b)}>{sugBusy === b.id ? "Writing…" : prompt ? "Regenerate" : "Prompt"}</button>
                          {b.path && <a href={b.url || b.path} target="_blank" rel="noreferrer" onClick={() => setMoreFor(null)}>Open page</a>}
                        </div>
                      )}
                    </div>
                    <button className={`bgp-resolve${b.status === "resolved" ? " reopen" : ""}`} disabled={busy === b.id} onClick={() => toggle(b)}>
                      {busy === b.id ? "…" : b.status === "resolved" ? "Reopen" : "Resolve"}
                    </button>
                  </div>
                </div>

                {(prompt || sugBusy === b.id) && (
                  <div className="bgp-prompt">
                    <div className="bgp-prompt-head">
                      <span>Prompt</span>
                      {prompt && <button className="bgp-ib sm" aria-label="Copy" title="Copy" onClick={() => copyText(prompt)}><CopyI /></button>}
                    </div>
                    {sugBusy === b.id && !prompt ? (
                      <div className="bgp-prompt-body muted">Writing…</div>
                    ) : (
                      <>
                        <div className={`bgp-prompt-body${long && !open ? " clamp" : ""}`}>{prompt}</div>
                        {long && <button className="bgp-toggle" onClick={() => setExpanded((s) => { const n = new Set(s); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n; })}>{open ? "Less" : "More"}</button>}
                      </>
                    )}
                  </div>
                )}

                {ctx && (ctx.errors?.length > 0 || ctx.routes?.length > 1 || ctx.viewport) && (
                  <div className="bgp-ctx">
                    <button className="bgp-ctx-head" onClick={() => setCtxOpen((s) => { const n = new Set(s); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n; })}>
                      Context {ctx.errors?.length > 0 && <em className="bgp-ctx-flag">{ctx.errors.length} error{ctx.errors.length > 1 ? "s" : ""}</em>}<span className="bgp-ctx-caret">{ctxOpen.has(b.id) ? "−" : "+"}</span>
                    </button>
                    {ctxOpen.has(b.id) && (
                      <div className="bgp-ctx-body">
                        <div><span className="bgp-ctx-k">Route</span> {ctx.route}{ctx.viewport ? ` · ${ctx.viewport}` : ""}</div>
                        {ctx.routes?.length > 1 && <div><span className="bgp-ctx-k">Trail</span> {ctx.routes.join(" → ")}</div>}
                        {ctx.errors?.map((e, i) => (
                          <div key={i} className="bgp-ctx-err"><span className={`bgp-ctx-tag ${e.type}`}>{e.type}</span> {e.message}{e.occurrences > 1 ? ` ×${e.occurrences}` : ""}</div>
                        ))}
                        {ctx.ua && <div className="bgp-ctx-ua">{ctx.ua}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {gallery && (
        <div className="bgp-zoom" onClick={() => setGallery(null)}>
          <div className="bgp-zoom-bar" onClick={stop}>
            {gallery.urls.length > 1 && <span className="bgp-zoom-count">{gallery.i + 1} / {gallery.urls.length}</span>}
            <button className="bgp-ib light" aria-label="Copy" title="Copy" onClick={() => copyImageUrl(gallery.urls[gallery.i])}><CopyI /></button>
            <button className="bgp-ib light" aria-label="Close" title="Close" onClick={() => setGallery(null)}><CloseI /></button>
          </div>
          {gallery.urls.length > 1 && (
            <>
              <button className="bgp-nav prev" aria-label="Previous" onClick={(e) => { stop(e); setGallery((g) => ({ ...g, i: (g.i - 1 + g.urls.length) % g.urls.length })); }}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
              <button className="bgp-nav next" aria-label="Next" onClick={(e) => { stop(e); setGallery((g) => ({ ...g, i: (g.i + 1) % g.urls.length })); }}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg></button>
            </>
          )}
          <img src={gallery.urls[gallery.i]} alt={`screenshot ${gallery.i + 1}`} onClick={stop} />
        </div>
      )}

      {toast && <div className="bgp-toast">{toast}</div>}
    </div>
  );
}

const CopyI = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>);
const MoreI = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>);
const CloseI = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>);

const CSS = `
.bgp{max-width:1040px;margin:0 auto;padding:20px 22px 80px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#12151b}
.bgp-head{display:flex;align-items:center;gap:16px 20px;flex-wrap:wrap;padding-bottom:16px;margin-bottom:18px;border-bottom:1px solid #e8e8e3}
.bgp-logo{color:#12151b;flex:0 0 auto}
.bgp-title{display:flex;align-items:center;gap:10px;flex:1 1 auto;min-width:0}
.bgp-back{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid #e4e4df;border-radius:9px;background:#fff;color:#4a5058;cursor:pointer}
.bgp-back:hover{border-color:#12151b;color:#12151b}
.bgp-h1{margin:0;font-size:1.25rem;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.bgp-sub{margin:2px 0 0;color:#8a8f96;font-size:.78rem}
.bgp-live{color:#2e7d5b;font-weight:700}
.bgp-seg{display:inline-flex;padding:3px;gap:2px;background:#f1f2f4;border:1px solid #e4e4df;border-radius:100px;flex:0 0 auto}
.bgp-tab{border:0;background:transparent;cursor:pointer;font:700 .78rem/1 inherit;color:#787d84;padding:7px 13px;border-radius:100px}
.bgp-tab.on{background:#12151b;color:#fff}
.bgp-empty{text-align:center;padding:64px 16px;color:#9aa0a8;font-size:.95rem;font-weight:600}
.bgp-list{display:flex;flex-direction:column;gap:9px}
.bgp-card{padding:13px 14px;border:1px solid #e8e8e3;border-radius:12px;background:#fff}
.bgp-card.done{opacity:.62;background:#fbfbfa}
.bgp-row{display:flex;align-items:flex-start;gap:13px}
.bgp-thumb{position:relative;flex:0 0 auto;border:0;padding:0;background:none;cursor:pointer;border-radius:9px;line-height:0}
.bgp-thumb img{width:92px;height:70px;object-fit:cover;border:1px solid #e4e4df;border-radius:9px;display:block}
.bgp-thumb.stack{box-shadow:3px 3px 0 -1px #fff,3px 3px 0 0 #e4e4df,6px 6px 0 -1px #fff,6px 6px 0 0 #e4e4df}
.bgp-count-badge{position:absolute;right:-5px;bottom:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#12151b;color:#fff;font-size:.66rem;font-weight:800;line-height:18px;text-align:center}
.bgp-imgrow{display:flex;align-items:center;gap:5px;padding:6px 10px}
.bgp-imgrow>span{font-size:.82rem;font-weight:600;color:#2b2f36;margin-right:2px}
.bgp-imgnum{width:24px;height:24px;padding:0;border:1px solid #e4e4df;border-radius:6px;background:#fff;color:#2b2f36;font:700 .74rem/1 inherit;cursor:pointer}
.bgp-imgnum:hover{background:#f4f5f7;border-color:#12151b}
.bgp-zoom-count{color:#fff;font-size:.8rem;font-weight:700;align-self:center;margin-right:4px}
.bgp-nav{position:fixed;top:50%;transform:translateY(-50%);z-index:1001;width:44px;height:44px;display:flex;align-items:center;justify-content:center;
  border:1px solid rgba(255,255,255,.2);border-radius:50%;background:rgba(255,255,255,.1);color:#fff;cursor:pointer}
.bgp-nav:hover{background:rgba(255,255,255,.22)}
.bgp-nav.prev{left:16px}
.bgp-nav.next{right:16px}
.bgp-body{flex:1;min-width:0}
.bgp-desc{font-size:.9rem;font-weight:600;white-space:pre-wrap;word-break:break-word;line-height:1.35}
.bgp-meta{display:flex;flex-wrap:wrap;align-items:center;gap:3px 9px;margin-top:6px;font-size:.74rem;color:#9297a0}
.bgp-meta>span,.bgp-meta>a{position:relative}
.bgp-id{font-weight:700;color:#5a6068}
.bgp-path{color:#3a6ea5;text-decoration:none;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bgp-path:hover{text-decoration:underline}
.bgp-who{color:#9297a0}
.bgp-res{color:#2e7d5b;font-weight:600}
.bgp-act{display:flex;align-items:center;gap:4px;flex:0 0 auto}
.bgp-menuwrap{position:relative;display:inline-flex}
.bgp-ib{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid transparent;border-radius:8px;background:transparent;color:#6b7079;cursor:pointer;line-height:0}
.bgp-ib:hover{background:#f1f2f4;color:#12151b}
.bgp-ib.sm{width:26px;height:26px}
.bgp-ib:disabled{opacity:.4;cursor:default}
.bgp-menu{position:absolute;top:36px;right:0;z-index:20;min-width:132px;background:#fff;border:1px solid #e4e4df;border-radius:10px;
  box-shadow:0 12px 30px -8px rgba(0,0,0,.2);padding:4px;display:flex;flex-direction:column}
.bgp-menu button,.bgp-menu a{text-align:left;border:0;background:none;cursor:pointer;font:600 .82rem/1 inherit;color:#2b2f36;padding:8px 10px;border-radius:7px;text-decoration:none;display:block}
.bgp-menu button:hover,.bgp-menu a:hover{background:#f4f5f7}
.bgp-menu button:disabled{opacity:.5;cursor:default}
.bgp-resolve{flex:0 0 auto;height:32px;padding:0 15px;margin-left:2px;border:0;border-radius:8px;background:#12151b;color:#fff;font:700 .8rem/1 inherit;cursor:pointer}
.bgp-resolve.reopen{background:#fff;border:1px solid #e4e4df;color:#4a5058}
.bgp-resolve:disabled{opacity:.5}
.bgp-prompt{margin-top:12px;padding-top:11px;border-top:1px solid #eee}
.bgp-prompt-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}
.bgp-prompt-head span{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#9297a0}
.bgp-prompt-body{white-space:pre-wrap;font-size:.82rem;line-height:1.5;color:#3a3f47;background:#faf8f3;border-radius:8px;padding:9px 11px}
.bgp-prompt-body.muted{color:#9aa0a8}
.bgp-prompt-body.clamp{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.bgp-toggle{margin-top:5px;border:0;background:none;cursor:pointer;font:700 .76rem/1 inherit;color:#8a6d2f;padding:2px 0}
.bgp-ctx{margin-top:9px;padding-top:9px;border-top:1px solid #eee}
.bgp-ctx-head{display:inline-flex;align-items:center;gap:7px;border:0;background:none;cursor:pointer;font:800 .7rem/1 inherit;letter-spacing:.06em;text-transform:uppercase;color:#9297a0;padding:0}
.bgp-ctx-flag{font-style:normal;text-transform:none;letter-spacing:0;font-weight:700;font-size:.72rem;color:#c4553d}
.bgp-ctx-caret{font-size:.9rem;color:#b3b8bf}
.bgp-ctx-body{margin-top:7px;display:flex;flex-direction:column;gap:4px;font-size:.76rem;line-height:1.45;color:#5a6068;
  background:#f7f8fa;border-radius:8px;padding:9px 11px;font-family:var(--font-mono),ui-monospace,Menlo,monospace}
.bgp-ctx-k{display:inline-block;min-width:44px;font-weight:700;color:#9297a0}
.bgp-ctx-err{word-break:break-word}
.bgp-ctx-tag{display:inline-block;font-size:.66rem;font-weight:800;text-transform:uppercase;padding:1px 5px;border-radius:5px;background:#eceef1;color:#6b7079;margin-right:4px}
.bgp-ctx-tag.error,.bgp-ctx-tag.rejection{background:#fbe6e2;color:#b34a3a}
.bgp-ctx-tag.network{background:#fdf2dc;color:#8a6d2f}
.bgp-ctx-ua{color:#a9aeb5;word-break:break-word;font-size:.7rem}
.bgp-zoom{position:fixed;inset:0;z-index:1000;background:rgba(8,10,14,.9);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out}
.bgp-zoom img{max-width:96vw;max-height:92vh;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.5);cursor:default}
.bgp-zoom-bar{position:fixed;top:16px;right:16px;display:flex;gap:6px;z-index:1001}
.bgp-ib.light{background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.2)}
.bgp-ib.light:hover{background:rgba(255,255,255,.22);color:#fff}
.bgp-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2000;background:#12151b;color:#fff;
  font-size:.82rem;font-weight:700;padding:8px 16px;border-radius:100px;box-shadow:0 10px 26px -8px rgba(0,0,0,.4);animation:bgpToast .16s ease}
@keyframes bgpToast{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
@media (max-width:640px){
  .bgp{padding:14px 14px 72px}
  .bgp-head{gap:12px}
  .bgp-title{order:2;flex:1 1 100%}
  .bgp-seg{order:3;flex:1 1 100%;justify-content:center}
  .bgp-row{flex-wrap:wrap}
  .bgp-thumb img{width:72px;height:56px}
  .bgp-act{width:100%;justify-content:flex-end;margin-top:4px}
}
@media (prefers-color-scheme:dark){
  .bgp{color:#e9edf2}
  .bgp-head{border-color:#2a2f37}
  .bgp-logo{color:#fff}
  .bgp-h1{color:#fff}
  .bgp-back{background:#161a20;border-color:#2a2f37;color:#c8ccd2}
  .bgp-seg{background:#1b1f26;border-color:#2a2f37}
  .bgp-tab.on{background:#e9edf2;color:#12151b}
  .bgp-card{background:#161a20;border-color:#2a2f37}
  .bgp-card.done{background:#12151a}
  .bgp-ib:hover{background:#232830;color:#fff}
  .bgp-menu{background:#1b1f26;border-color:#2a2f37}
  .bgp-menu button,.bgp-menu a{color:#c8ccd2}
  .bgp-menu button:hover,.bgp-menu a:hover{background:#232830}
  .bgp-imgrow>span{color:#c8ccd2}
  .bgp-imgnum{background:#161a20;border-color:#2a2f37;color:#c8ccd2}
  .bgp-imgnum:hover{background:#232830;border-color:#5a6068}
  .bgp-ctx{border-color:#2a2f37}
  .bgp-ctx-body{background:#12151a;color:#a9b0b8}
  .bgp-ctx-tag{background:#232830;color:#9aa0a8}
  .bgp-ctx-tag.error,.bgp-ctx-tag.rejection{background:#3a201c;color:#e5a89c}
  .bgp-ctx-tag.network{background:#2c2617;color:#e0c88a}
  .bgp-resolve.reopen{background:#161a20;border-color:#2a2f37;color:#c8ccd2}
  .bgp-prompt{border-color:#2a2f37}
  .bgp-prompt-body{background:#12151a;color:#c8ccd2}
  .bgp-toast{background:#e9edf2;color:#12151b}
  .bgp-thumb img{border-color:#2a2f37}
}
`;

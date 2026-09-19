"use client";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Wordmark, BrandLink } from "../components/brand";

// Internal Bugs surface — a fast engineering inbox. DEFAULT: one compact row per bug (thumbnail · title ·
// #id/route/date · copy/•••/resolve). Click a row to expand ONE bug inline into Review / Prompt / Context
// tabs (AI review, fix prompt, and technical context are all hidden until asked for). No data is removed —
// everything is reachable, just progressively disclosed. Auto-refreshes so new reports appear live.
const two = (n) => String(n).padStart(2, "0");
const asDate = (s) => { try { return new Date(String(s).replace(" ", "T")); } catch { return null; } };
const fmtDate = (s) => { const d = asDate(s); return d ? d.toLocaleString("en-US", { month: "short", day: "numeric" }) : s; };
const fmtTime = (s) => { const d = asDate(s); return d ? d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" }) : s; };
const fmt = (s) => `${fmtDate(s)} · ${fmtTime(s)}`;
const who = (r) => (r && r.includes("@") ? r.split("@")[0] : r);
// Short browser name from a UA string.
const uaName = (ua) => { if (!ua) return null; if (/edg\//i.test(ua)) return "Edge"; if (/chrome|crios/i.test(ua)) return "Chrome"; if (/firefox|fxios/i.test(ua)) return "Firefox"; if (/safari/i.test(ua)) return "Safari"; return ua.split(" ")[0]; };
// Derive a concise device + OS from the UA — never invent a model we can't know (just "iPhone", not "iPhone 15").
function platform(ua) {
  if (!ua) return {};
  let device, os;
  if (/iphone/i.test(ua)) { device = "iPhone"; os = "iOS"; }
  else if (/ipad/i.test(ua)) { device = "iPad"; os = "iPadOS"; }
  else if (/android/i.test(ua)) { device = "Android"; os = "Android"; }
  else if (/macintosh|mac os x/i.test(ua)) { device = "Mac"; os = "macOS"; }
  else if (/windows/i.test(ua)) { device = "Windows Desktop"; os = "Windows"; }
  else if (/linux/i.test(ua)) { device = "Linux"; os = "Linux"; }
  return { device, os, browser: uaName(ua) };
}
// A friendly page label from a route: "/project/ASC0042" → "Project · ASC0042".
function pageLabel(path) {
  if (!path) return null;
  const seg = String(path).split("?")[0].split("/").filter(Boolean);
  if (!seg.length) return path;
  const head = seg[0].charAt(0).toUpperCase() + seg[0].slice(1);
  return seg.length > 1 ? `${head} · ${seg.slice(1).join(" / ")}` : head;
}
// A report may carry several screenshots (image_urls JSON) or one legacy image_url.
const SEVS = ["critical", "high", "medium", "low"];   // most-severe first (for filter order)
const sevLabel = (s) => (s === "medium" ? "Med" : (s || "medium").charAt(0).toUpperCase() + (s || "medium").slice(1));
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
  const [uiRev, setUiRev] = useState(() => Object.fromEntries(initial.filter((b) => b.ui_prompt).map((b) => [b.id, b.ui_prompt])));
  const [uiBusy, setUiBusy] = useState(null);   // bug id whose vision UI review is generating
  const [fresh, setFresh] = useState(false);
  // One portal-rendered popover at a time: { id, kind:"copy"|"more", el:anchorNode }. Rendering the menu
  // through a body portal (see Popover) is what lets it escape the card's overflow:hidden + stacking context.
  const [pop, setPop] = useState(null);
  const [copyChecks, setCopyChecks] = useState({});   // selective-copy checklist: { report, shots, page, env, error, fix }
  const [openId, setOpenId] = useState(null);     // the ONE expanded bug
  const [q, setQ] = useState("");                 // search text
  const [searchOn, setSearchOn] = useState(false);
  const [sevFilter, setSevFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [filterOn, setFilterOn] = useState(false);
  const [toast, setToast] = useState(null);
  const seenRef = useRef(new Set(initial.map((b) => b.id)));
  const searchRef = useRef(null);

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
      setUiRev((s) => { const next = { ...s }; r.bugs.forEach((b) => { if (b.ui_prompt && !next[b.id]) next[b.id] = b.ui_prompt; }); return next; });
      if (hasNew) { setFresh(true); setTimeout(() => setFresh(false), 2500); }
    };
    const t = setInterval(poll, 15000);
    return () => { live = false; clearInterval(t); };
  }, []);

  // Close menus on outside click; Escape closes menus / preview / search.
  useEffect(() => {
    if (pop == null && !filterOn) return;
    const h = () => { setPop(null); setFilterOn(false); };
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [pop, filterOn]);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") { setPop(null); setFilterOn(false); if (gallery) setGallery(null); else if (searchOn) { setSearchOn(false); setQ(""); } }
      else if (e.key === "ArrowLeft") setGallery((g) => (g && g.urls.length > 1 ? { ...g, i: (g.i - 1 + g.urls.length) % g.urls.length } : g));
      else if (e.key === "ArrowRight") setGallery((g) => (g && g.urls.length > 1 ? { ...g, i: (g.i + 1) % g.urls.length } : g));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [gallery, searchOn]);

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
    const ctx = ctxOf(b);
    const pf = platform(ctx?.ua || b.user_agent);
    const env = [pf.device, pf.os, pf.browser].filter(Boolean).join(" · ");
    const err = ctx?.errors?.[0];
    const parts = [`BUG #${b.id}`];
    if (b.path) parts.push(b.url || b.path);
    if (env) parts.push(env);
    parts.push("", "REPORT", b.description);
    if (imgs.length) parts.push("", `${imgs.length} screenshot${imgs.length > 1 ? "s" : ""}:`, ...imgs);
    if (err) parts.push("", `ERROR: ${err.type} · ${err.message}`);
    if (suggest[b.id]) parts.push("", "FIX", suggest[b.id]);
    copyText(parts.join("\n"));
  }
  // Which pieces of a bug can be copied — drives the selective-copy checklist (only what exists shows).
  function copyParts(b) {
    const imgs = imgsOf(b), ctx = ctxOf(b), pf = platform(ctx?.ua || b.user_agent);
    const env = [pf.device, pf.os, pf.browser].filter(Boolean).join(" · ");
    const parts = [{ key: "report", label: "Report" }];
    if (imgs.length) parts.push({ key: "shots", label: imgs.length > 1 ? `Screenshots (${imgs.length})` : "Screenshot" });
    if (b.path) parts.push({ key: "page", label: "Page" });
    if (env) parts.push({ key: "env", label: "Environment" });
    if (ctx?.errors?.[0]) parts.push({ key: "error", label: "Error" });
    if (suggest[b.id]) parts.push({ key: "fix", label: "Fix" });
    return parts;
  }
  // Build the combined clipboard text from the checked pieces (mirrors copyAll, filtered).
  function buildCopyText(b, checks) {
    const imgs = imgsOf(b), ctx = ctxOf(b), pf = platform(ctx?.ua || b.user_agent);
    const env = [pf.device, pf.os, pf.browser].filter(Boolean).join(" · ");
    const err = ctx?.errors?.[0];
    const out = [`BUG #${b.id}`];
    if (checks.page && b.path) out.push(b.url || b.path);
    if (checks.env && env) out.push(env);
    if (checks.report) out.push("", "REPORT", b.description);
    if (checks.shots && imgs.length) out.push("", `${imgs.length} screenshot${imgs.length > 1 ? "s" : ""}:`, ...imgs);
    if (checks.error && err) out.push("", `ERROR: ${err.type} · ${err.message}`);
    if (checks.fix && suggest[b.id]) out.push("", "FIX", suggest[b.id]);
    return out.join("\n");
  }
  // Open the selective-copy checklist (all ticked), or — if it's already open for this bug — copy the ticks.
  function toggleCopyMenu(b, el) {
    if (pop?.id === b.id && pop.kind === "copy") { const t = buildCopyText(b, copyChecks); setPop(null); copyText(t); return; }
    const init = {}; copyParts(b).forEach((p) => { init[p.key] = true; });
    setCopyChecks(init); setPop({ id: b.id, kind: "copy", el });
  }

  // Expand a bug (used by row-click and by the AI actions so their result is visible). One open at a time.
  function openBug(id) { setOpenId(id); setPop(null); }
  function toggleRow(b) { setOpenId((cur) => (cur === b.id ? null : b.id)); setPop(null); }

  async function getSuggestion(b) {
    if (sugBusy) return;
    openBug(b.id); setSugBusy(b.id);
    const r = await fetch("/api/bug-suggest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, description: b.description, path: b.path, shots: imgsOf(b).length, error: ctxOf(b)?.errors?.[0]?.message || undefined }),
    }).then((x) => x.json()).catch(() => null);
    setSugBusy(null);
    setSuggest((s) => ({ ...s, [b.id]: r?.ok && r.suggestion ? r.suggestion : (r?.error || "Couldn't generate a prompt.") }));
  }
  // Vision UI review — Claude looks at the screenshot and returns an upgrade/fix prompt.
  async function getUiReview(b) {
    if (uiBusy) return;
    openBug(b.id); setUiBusy(b.id);
    const r = await fetch("/api/bug-ui-review", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id, description: b.description, path: b.path, imageUrls: imgsOf(b) }),
    }).then((x) => x.json()).catch(() => null);
    setUiBusy(null);
    setUiRev((s) => ({ ...s, [b.id]: r?.ok && r.review ? r.review : (r?.error || "Couldn't review the UI.") }));
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
  // Staff triage edit — set severity/area. Optimistic; PATCH with no `resolved` key hits setBugMeta.
  async function patchMeta(b, changes) {
    setBugs((list) => list.map((x) => (x.id === b.id ? { ...x, ...changes } : x)));
    await fetch("/api/bug-report", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, ...changes }) }).catch(() => {});
  }
  function goBack() { if (typeof window !== "undefined" && window.history.length > 2) router.back(); else router.push("/dashboard"); }
  function stop(e) { e.stopPropagation(); }

  const openN = bugs.filter((b) => b.status === "open").length;
  const areas = [...new Set(bugs.map((b) => b.area).filter(Boolean))].sort();
  const activeFilters = (sevFilter !== "all" ? 1 : 0) + (areaFilter !== "all" ? 1 : 0);
  const qn = q.trim().toLowerCase();
  const shown = bugs
    .filter((b) => (filter === "all" ? true : b.status === filter))
    .filter((b) => (sevFilter === "all" ? true : (b.severity || "medium") === sevFilter))
    .filter((b) => (areaFilter === "all" ? true : b.area === areaFilter))
    .filter((b) => {
      if (!qn) return true;
      const hay = `#${b.id} ${b.description || ""} ${b.path || ""} ${b.area || ""} ${suggest[b.id] || ""} ${uiRev[b.id] || ""}`.toLowerCase();
      return hay.includes(qn) || (qn.startsWith("#") && String(b.id) === qn.slice(1));
    });
  const emptyMsg = qn || activeFilters ? "No matches" : filter === "open" ? "All clear" : "No bugs";

  useEffect(() => { if (searchOn) searchRef.current?.focus(); }, [searchOn]);

  return (
    <div className="bgp">
      <style>{CSS}</style>

      <header className="bgp-head">
        <div className="bgp-hnav">
          <BrandLink className="bgp-logo"><Wordmark height={18} /></BrandLink>
          <button className="bgp-back" onClick={goBack} aria-label="Back" title="Back">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div className="bgp-titlewrap">
            <h1 className="bgp-h1">Bugs</h1>
            <p className="bgp-sub">{openN} open · {bugs.length} total{fresh && <span className="bgp-live"> · new</span>}</p>
          </div>
        </div>
        <div className="bgp-controls">
          <div className={`bgp-search${searchOn ? " on" : ""}`}>
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search bugs" />
            <button className="bgp-ib" aria-label={searchOn ? "Close search" : "Search"} title="Search"
              onClick={() => { if (searchOn && !q) setSearchOn(false); else setSearchOn(true); }}>
              {searchOn && q
                ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" onClick={(e) => { e.stopPropagation(); setQ(""); searchRef.current?.focus(); }}><path d="M18 6 6 18M6 6l12 12" /></svg>
                : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>}
            </button>
          </div>
          <div className="bgp-menuwrap">
            <button className={`bgp-ib${activeFilters ? " act" : ""}`} aria-label="Filter" title="Filter" onClick={(e) => { stop(e); setFilterOn((o) => !o); }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg>
              {activeFilters > 0 && <span className="bgp-fbadge">{activeFilters}</span>}
            </button>
            {filterOn && (
              <div className="bgp-menu bgp-filter" onClick={stop}>
                <div className="bgp-fgrp">Severity</div>
                <div className="bgp-frow">
                  <button className={sevFilter === "all" ? "on" : ""} onClick={() => setSevFilter("all")}>All</button>
                  {SEVS.map((s) => <button key={s} className={`sev ${s}${sevFilter === s ? " on" : ""}`} onClick={() => setSevFilter(s)}>{sevLabel(s)}</button>)}
                </div>
                <div className="bgp-fgrp">Area</div>
                <div className="bgp-frow wrap">
                  <button className={areaFilter === "all" ? "on" : ""} onClick={() => setAreaFilter("all")}>All</button>
                  {areas.map((a) => <button key={a} className={areaFilter === a ? "on" : ""} onClick={() => setAreaFilter(a)}>{a}</button>)}
                </div>
              </div>
            )}
          </div>
          <div className="bgp-seg" role="tablist" aria-label="Status">
            {["open", "resolved", "all"].map((k) => (
              <button key={k} className={`bgp-tab${filter === k ? " on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{k[0].toUpperCase() + k.slice(1)}</button>
            ))}
          </div>
        </div>
      </header>

      {shown.length === 0 ? (
        <div className="bgp-empty">{emptyMsg}</div>
      ) : (
        <div className="bgp-list">
          {shown.map((b) => {
            const imgs = imgsOf(b);
            const isOpen = openId === b.id;
            const resolved = b.status === "resolved";
            const pf = platform(ctxOf(b)?.ua || b.user_agent);
            return (
              <div key={b.id} className={`bgp-card${resolved ? " done" : ""}${isOpen ? " open" : ""}`}>
                <div className={`bgp-row${imgs.length ? "" : " nothumb"}`} onClick={() => toggleRow(b)} role="button" aria-expanded={isOpen}>
                  {imgs.length > 0 && (
                    <button className={`bgp-thumb${imgs.length > 1 ? " stack" : ""}`} onClick={(e) => { stop(e); setGallery({ urls: imgs, i: 0 }); }} aria-label={`View ${imgs.length} screenshot${imgs.length > 1 ? "s" : ""}`} title="View">
                      <img src={imgs[0]} alt="screenshot" />
                      {imgs.length > 1 && <span className="bgp-count-badge">{imgs.length}</span>}
                    </button>
                  )}
                  <div className="bgp-body">
                    <div className="bgp-desc" dir="auto">{b.description}</div>
                    <div className="bgp-meta">
                      <span className={`bgp-sev ${b.severity || "medium"}`} title={`${sevLabel(b.severity)} severity`}>{sevLabel(b.severity)}</span>
                      <button className="bgp-id" onClick={(e) => { stop(e); copyText(`BUG #${b.id}`); }} title="Copy ID">#{b.id}</button>
                      {b.path && <a className="bgp-path" href={b.url || b.path} target="_blank" rel="noreferrer" onClick={stop}>{b.path}</a>}
                      {pf.device && <span>{pf.device}</span>}
                      <span>{fmtDate(b.created_at)}</span>
                      {resolved && b.resolved_at && <span className="bgp-res">Resolved {fmtTime(b.resolved_at)}</span>}
                    </div>
                  </div>

                  <div className="bgp-act" onClick={stop}>
                    {/* Copy defaults to the whole report (id · route · description · shots · prompt) in one click. */}
                    <button className="bgp-ib" aria-label="Copy report" title="Copy report" onClick={(e) => { stop(e); copyAll(b); }}>
                      <CopyI />
                    </button>
                    {/* Selective copy — opens a checklist of pieces; tick what you want, then click this again
                        (or the Copy button) to copy just those. Capture the node now (React nulls currentTarget). */}
                    <button className={`bgp-ib${pop?.id === b.id && pop.kind === "copy" ? " on" : ""}`} aria-label="Copy part" title="Copy part…"
                      onClick={(e) => { stop(e); toggleCopyMenu(b, e.currentTarget); }}>
                      <CopyPickI />
                    </button>
                    <button className={`bgp-ib${pop?.id === b.id && pop.kind === "more" ? " on" : ""}`} aria-label="More" title="More"
                      onClick={(e) => { stop(e); const el = e.currentTarget; setPop((p) => (p?.id === b.id && p.kind === "more" ? null : { id: b.id, kind: "more", el })); }}>
                      <MoreI />
                    </button>
                    <button className={`bgp-resolve${resolved ? " reopen" : ""}`} disabled={busy === b.id} onClick={() => toggle(b)}>
                      {busy === b.id ? "…" : resolved ? "Reopen" : "Resolve"}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <BugDetail
                    b={b} imgs={imgs} ctx={ctxOf(b)} pf={pf}
                    fix={suggest[b.id]} review={uiRev[b.id]}
                    fixBusy={sugBusy === b.id} reviewBusy={uiBusy === b.id}
                    onFix={() => getSuggestion(b)} onReview={() => getUiReview(b)}
                    onCopy={copyText} onGallery={(i) => setGallery({ urls: imgs, i })} stop={stop}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Row action menus render through a body portal so they float above neighbours and escape the
          card's overflow/stacking context; the Popover self-flips when it would overrun the viewport. */}
      {pop && (() => {
        const b = bugs.find((x) => x.id === pop.id);
        if (!b) return null;
        const imgs = imgsOf(b);
        return (
          <Popover anchor={pop.el} onClose={() => setPop(null)} width={pop.kind === "copy" ? 186 : 208}>
            {pop.kind === "copy" ? (
              <div className="bgp-check">
                {copyParts(b).map((p) => (
                  <label key={p.key} className="bgp-checkrow">
                    <input type="checkbox" checked={!!copyChecks[p.key]} onChange={() => setCopyChecks((c) => ({ ...c, [p.key]: !c[p.key] }))} />
                    <span>{p.label}</span>
                  </label>
                ))}
                <button className="bgp-checkcopy" disabled={!copyParts(b).some((p) => copyChecks[p.key])}
                  onClick={() => { const t = buildCopyText(b, copyChecks); setPop(null); copyText(t); }}>Copy</button>
              </div>
            ) : (
              <>
                {/* Triage lives here, not in the bug body: severity + area. */}
                <div className="bgp-mlabel">Severity</div>
                <div className="bgp-msev">
                  {SEVS.slice().reverse().map((s) => (
                    <button key={s} className={`bgp-sevb ${s}${(b.severity || "medium") === s ? " on" : ""}`} onClick={() => patchMeta(b, { severity: s })}>{sevLabel(s)}</button>
                  ))}
                </div>
                <div className="bgp-mlabel">Area</div>
                <input className="bgp-areain" defaultValue={b.area || ""} list="bgp-areas" placeholder="Area"
                  onClick={stop}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (b.area || "")) patchMeta(b, { area: v }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
                <datalist id="bgp-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
                <div className="bgp-mdiv" />
                <button disabled={sugBusy === b.id} onClick={() => getSuggestion(b)}>{sugBusy === b.id ? "Writing…" : suggest[b.id] ? "Regenerate Fix" : "Generate Fix"}</button>
                {imgs.length > 0 && <button disabled={uiBusy === b.id} onClick={() => getUiReview(b)}>{uiBusy === b.id ? "Reviewing…" : uiRev[b.id] ? "Re-analyze shot" : "Analyze shot"}</button>}
                <a href={b.url || b.path} target="_blank" rel="noreferrer" onClick={() => setPop(null)}>Open page</a>
              </>
            )}
          </Popover>
        );
      })()}

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

// The whole expanded bug — ONE continuous surface, no tabs. Reads top-to-bottom the way a developer
// triages: Report → Evidence → Page → Fix (the Claude-ready handoff) → Environment → Technical (folded).
function BugDetail({ b, imgs, ctx, pf, fix, review, fixBusy, reviewBusy, onFix, onReview, onCopy, onGallery, stop }) {
  const [more, setMore] = useState(false);
  // Fix = the coding-agent handoff. Prefer the generated prompt; fold the screenshot analysis in beneath it.
  const fixText = [fix, review].filter(Boolean).join("\n\n———\n\n");
  const longFix = !!fixText && (fixText.length > 520 || (fixText.match(/\n/g) || []).length > 9);
  const page = pageLabel(b.path);
  // The one error most likely tied to the bug, surfaced above Technical.
  const topErr = ctx?.errors?.find((e) => e.type === "error" || e.type === "network") || ctx?.errors?.[0];
  const envBits = [pf.device, pf.os, pf.browser].filter(Boolean);
  return (
    <div className="bgp-detail" onClick={stop}>
      <section className="bgp-sec">
        <h4 className="bgp-sech">Report</h4>
        <div className="bgp-report" dir="auto">{b.description}</div>
      </section>

      {imgs.length > 0 && (
        <section className="bgp-sec">
          <h4 className="bgp-sech">Evidence{imgs.length > 1 ? <span className="bgp-secn"> {imgs.length}</span> : null}</h4>
          <div className={`bgp-evi${imgs.length === 1 ? " one" : ""}`}>
            {imgs.map((u, i) => (
              <button key={i} className="bgp-evishot" onClick={() => onGallery(i)} aria-label={`Open screenshot ${i + 1}`}>
                <img src={u} alt={`screenshot ${i + 1}`} />
              </button>
            ))}
          </div>
        </section>
      )}

      {page && (
        <section className="bgp-sec">
          <h4 className="bgp-sech">Page</h4>
          <a className="bgp-pagelink" href={b.url || b.path} target="_blank" rel="noreferrer">
            {page}
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
          </a>
        </section>
      )}

      <section className="bgp-sec">
        <div className="bgp-sechrow">
          <h4 className="bgp-sech">Fix</h4>
          {fixText && !fixBusy && <button className="bgp-ib sm" aria-label="Copy fix" title="Copy" onClick={() => onCopy(fixText)}><CopyI /></button>}
        </div>
        {fixBusy && !fixText ? (
          <div className="bgp-report muted">Writing the fix prompt…</div>
        ) : fixText ? (
          <>
            <div className={`bgp-fix${longFix && !more ? " clamp" : ""}`} dir="auto">{fixText}</div>
            {longFix && <button className="bgp-chev" onClick={() => setMore((m) => !m)}>{more ? "Show less" : "Show more"}</button>}
          </>
        ) : (
          <div className="bgp-fixgen">
            <span className="bgp-report muted">No fix prompt yet.</span>
            <div className="bgp-fixbtns">
              <button className="bgp-mini" disabled={fixBusy} onClick={onFix}>{fixBusy ? "…" : "Generate"}</button>
              {imgs.length > 0 && <button className="bgp-mini" disabled={reviewBusy} onClick={onReview}>{reviewBusy ? "…" : "Analyze shot"}</button>}
            </div>
          </div>
        )}
      </section>

      {envBits.length > 0 && (
        <section className="bgp-sec">
          <h4 className="bgp-sech">Environment</h4>
          <div className="bgp-envline">{envBits.join(" · ")}</div>
        </section>
      )}

      {topErr && (
        <div className="bgp-toperr">
          <span className={`bgp-etag ${topErr.type}`}>{topErr.type}</span>
          {topErr.message}{topErr.occurrences > 1 ? ` ×${topErr.occurrences}` : ""}
        </div>
      )}

      <TechnicalBlock b={b} ctx={ctx} pf={pf} />
    </div>
  );
}

// Low-level diagnostics — folded away by default. Everything that isn't Report/Evidence/Page/Fix/Env.
function TechnicalBlock({ b, ctx, pf }) {
  const rows = [];
  if (ctx?.viewport) rows.push(["Viewport", ctx.viewport]);
  if (pf.browser) rows.push(["Browser", pf.browser]);
  if (b.reporter) rows.push(["Reporter", `${who(b.reporter)}${b.role ? ` · ${b.role}` : ""}`]);
  if (ctx?.routes?.length > 1) rows.push(["Recent pages", ctx.routes.join(" → ")]);
  if (b.area) rows.push(["Area", b.area]);
  const errs = ctx?.errors || [];
  if (rows.length === 0 && errs.length === 0) return null;
  return (
    <details className="bgp-tech">
      <summary>Technical</summary>
      <div className="bgp-kv">
        {rows.map(([k, v]) => (<div className="bgp-kvrow" key={k}><span className="bgp-kvk">{k}</span><span className="bgp-kvv" dir="auto">{v}</span></div>))}
      </div>
      {errs.length > 0 && (
        <div className="bgp-errs">
          {errs.map((e, i) => (
            <div key={i} className="bgp-err"><span className={`bgp-etag ${e.type}`}>{e.type}</span> {e.message}{e.occurrences > 1 ? ` ×${e.occurrences}` : ""}</div>
          ))}
        </div>
      )}
    </details>
  );
}

// A body-portal popover anchored to a button, with viewport collision handling: prefers below-right,
// flips above when it would overrun the bottom, and shifts left when it would overrun the right edge.
// Repositions on scroll/resize so it tracks its anchor. Escapes any ancestor overflow/stacking context.
function Popover({ anchor, onClose, width = 150, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight, pad = 8, gap = 6;
      const mw = ref.current?.offsetWidth || width;
      const mh = ref.current?.offsetHeight || 0;
      let top = r.bottom + gap;
      if (top + mh > vh - pad && r.top - gap - mh > pad) top = r.top - gap - mh;   // flip above
      let left = r.right - mw;                                                       // right-align to anchor
      if (left < pad) left = pad;                                                    // shift right
      if (left + mw > vw - pad) left = vw - pad - mw;                                // shift left
      setPos({ top, left });
    };
    place();
    const raf = requestAnimationFrame(place);   // re-measure once the menu has real dimensions
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor, width]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className="bgp-menu bgp-pop" onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", width, top: pos ? pos.top : -9999, left: pos ? pos.left : -9999, visibility: pos ? "visible" : "hidden" }}>
      {children}
    </div>,
    document.body
  );
}

const CopyI = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>);
// Selective copy — a copy glyph carrying selection lines, distinct from the one-click "copy all" icon.
const CopyPickI = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /><path d="M12.5 13.5h4M12.5 16.5h2.5" /></svg>);
const MoreI = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>);
const CloseI = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>);

const CSS = `
.bgp{max-width:1120px;margin:0 auto;padding:18px 20px 80px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#12151b}
.bgp-head{display:flex;align-items:center;justify-content:space-between;gap:12px 18px;padding-bottom:13px;margin-bottom:14px;border-bottom:1px solid #e8e8e3}
.bgp-hnav{display:flex;align-items:center;gap:11px;min-width:0;flex:1 1 auto}
.bgp-logo{color:#12151b;flex:0 0 auto}
.bgp-back{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid #e4e4df;border-radius:8px;background:#fff;color:#4a5058;cursor:pointer;flex:0 0 auto}
.bgp-back:hover{border-color:#12151b;color:#12151b}
.bgp-titlewrap{min-width:0;flex:0 1 auto}
.bgp-h1{margin:0;font-size:1.16rem;font-weight:800;letter-spacing:-.02em;line-height:1.1;white-space:nowrap}
.bgp-sub{margin:1px 0 0;color:#8a8f96;font-size:.75rem}
.bgp-live{color:#2e7d5b;font-weight:700}
.bgp-controls{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.bgp-search{display:flex;align-items:center;border:1px solid transparent;border-radius:100px}
.bgp-search input{width:0;padding:0;border:0;background:none;outline:none;font:600 .8rem/1 inherit;color:#12151b;transition:width .18s ease}
.bgp-search.on{border-color:#e4e4df;background:#fff;padding-left:12px}
.bgp-search.on input{width:150px;padding:7px 0}
.bgp-seg{display:inline-flex;padding:3px;gap:2px;background:#f1f2f4;border:1px solid #e4e4df;border-radius:100px;flex:0 0 auto}
.bgp-tab{border:0;background:transparent;cursor:pointer;font:700 .76rem/1 inherit;color:#787d84;padding:7px 12px;border-radius:100px}
.bgp-tab.on{background:#12151b;color:#fff}
.bgp-empty{text-align:center;padding:60px 16px;color:#9aa0a8;font-size:.95rem;font-weight:600}
.bgp-list{display:flex;flex-direction:column;gap:10px}
.bgp-card{border:1px solid #e8e8e3;border-radius:12px;background:#fff;overflow:hidden}
.bgp-card.done{background:#fbfbfa}
.bgp-card.open{border-color:#d9d9d2;box-shadow:0 1px 3px rgba(16,17,18,.04)}
/* True 3-column row: THUMBNAIL | CONTENT | ACTIONS — the flexible middle keeps the description off the controls. */
.bgp-row{display:grid;grid-template-columns:72px minmax(0,1fr) auto;align-items:center;gap:15px;padding:14px 16px;cursor:pointer}
.bgp-row.nothumb{grid-template-columns:minmax(0,1fr) auto}
.bgp-thumb{position:relative;border:0;padding:0;background:none;cursor:pointer;border-radius:8px;line-height:0;align-self:center;justify-self:start}
.bgp-thumb img{width:72px;height:60px;object-fit:cover;border:1px solid #e4e4df;border-radius:8px;display:block}
.bgp-thumb.stack{box-shadow:3px 3px 0 -1px #fff,3px 3px 0 0 #e4e4df,6px 6px 0 -1px #fff,6px 6px 0 0 #e4e4df}
.bgp-count-badge{position:absolute;right:-5px;bottom:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#12151b;color:#fff;font-size:.64rem;font-weight:800;line-height:17px;text-align:center}
.bgp-body{min-width:0}
.bgp-desc{font-size:.875rem;font-weight:600;line-height:1.4;color:#1b1f26;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.bgp-meta{display:flex;flex-wrap:wrap;align-items:center;row-gap:3px;margin-top:7px;font-size:.75rem;color:#9297a0}
.bgp-meta>*{display:inline-flex;align-items:center}
.bgp-meta>*+*::before{content:"·";margin:0 7px;color:#c4c8ce}
.bgp-id{font:700 .735rem/1 inherit;color:#5a6068;border:0;background:none;padding:0;cursor:pointer}
.bgp-id:hover{color:#12151b;text-decoration:underline}
.bgp-path{color:#3a6ea5;text-decoration:none;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bgp-path:hover{text-decoration:underline}
.bgp-res{color:#2e7d5b;font-weight:600}
.bgp-sev{display:inline-flex;align-items:center;height:16px;padding:0 6px;border-radius:5px;font:800 .62rem/1 inherit;text-transform:uppercase;letter-spacing:.03em;flex:0 0 auto}
.bgp-sev.critical{background:#fbe8e4;color:#b24a3a}
.bgp-sev.high{background:#fdf3e2;color:#8a6320}
.bgp-sev.medium{background:#eaf1fb;color:#2b5f9e}
.bgp-sev.low{background:#eef1f4;color:#6b7079}
.bgp-ib.act{color:#12151b}
.bgp-fbadge{position:absolute;top:-1px;right:-1px;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:#12151b;color:#fff;font:800 .58rem/14px inherit;text-align:center}
.bgp-filter{min-width:214px;padding:9px 11px}
.bgp-fgrp{font:800 .66rem/1 inherit;letter-spacing:.06em;text-transform:uppercase;color:#9297a0;margin:8px 2px 6px}
.bgp-fgrp:first-child{margin-top:2px}
.bgp-frow{display:flex;gap:5px}
.bgp-frow.wrap{flex-wrap:wrap}
.bgp-frow button{border:1px solid #e4e4df;background:#fff;cursor:pointer;font:700 .72rem/1 inherit;color:#5a6068;padding:6px 9px;border-radius:7px}
.bgp-frow button:hover{border-color:#12151b}
.bgp-frow button.on{background:#12151b;border-color:#12151b;color:#fff}
.bgp-frow button.sev.on.critical{background:#b24a3a;border-color:#b24a3a}
.bgp-frow button.sev.on.high{background:#8a6320;border-color:#8a6320}
.bgp-frow button.sev.on.medium{background:#2b5f9e;border-color:#2b5f9e}
.bgp-frow button.sev.on.low{background:#6b7079;border-color:#6b7079}
.bgp-areain{border:1px solid #e4e4df;border-radius:7px;padding:5px 9px;font:600 .8rem/1 inherit;color:#12151b;background:#fff;outline:none;max-width:180px}
.bgp-areain:focus{border-color:#12151b}
.bgp-act{display:flex;align-items:center;gap:4px;flex:0 0 auto}
.bgp-menuwrap{position:relative;display:inline-flex}
.bgp-ib{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid transparent;border-radius:8px;background:transparent;color:#6b7079;cursor:pointer;line-height:0}
.bgp-ib:hover{background:#f1f2f4;color:#12151b}
.bgp-ib.on{background:#f1f2f4;color:#12151b}
.bgp-ib.sm{width:28px;height:28px}
.bgp-ib:disabled{opacity:.4;cursor:default}
/* Menus: base (header Filter) is absolute; the row popover (.bgp-pop) is position:fixed via inline style + portal. */
.bgp-menu{position:absolute;top:35px;right:0;z-index:20;min-width:130px;background:#fff;border:1px solid #e4e4df;border-radius:10px;
  box-shadow:0 12px 30px -8px rgba(0,0,0,.2);padding:4px;display:flex;flex-direction:column}
.bgp-pop{right:auto;z-index:3000}
.bgp-menu button,.bgp-menu a{text-align:left;border:0;background:none;cursor:pointer;font:600 .82rem/1 inherit;color:#2b2f36;padding:8px 10px;border-radius:7px;text-decoration:none;display:block}
.bgp-menu button:hover,.bgp-menu a:hover{background:#f4f5f7}
.bgp-menu button:disabled{opacity:.5;cursor:default}
.bgp-imgrow{display:flex;align-items:center;gap:5px;padding:6px 10px}
.bgp-imgrow>span{font-size:.82rem;font-weight:600;color:#2b2f36;margin-right:2px}
.bgp-imgnum{width:24px;height:24px;padding:0;border:1px solid #e4e4df;border-radius:6px;background:#fff;color:#2b2f36;font:700 .74rem/1 inherit;cursor:pointer}
.bgp-imgnum:hover{background:#f4f5f7;border-color:#12151b}
/* Selective-copy checklist */
.bgp-check{display:flex;flex-direction:column;gap:1px}
.bgp-checkrow{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:7px;cursor:pointer;font:600 .82rem/1 inherit;color:#2b2f36}
.bgp-checkrow:hover{background:#f4f5f7}
.bgp-checkrow input{width:15px;height:15px;accent-color:#12151b;cursor:pointer;margin:0}
.bgp-checkcopy{margin-top:4px;height:32px;border:0;border-radius:7px;background:#12151b;color:#fff;font:700 .8rem/1 inherit;cursor:pointer}
.bgp-checkcopy:disabled{opacity:.45;cursor:default}
/* Triage inside the ••• menu */
.bgp-mlabel{font:800 .64rem/1 inherit;letter-spacing:.06em;text-transform:uppercase;color:#9297a0;padding:7px 8px 5px}
.bgp-msev{display:flex;gap:4px;padding:0 6px 4px}
.bgp-msev .bgp-sevb{flex:1;border:1px solid #e4e4df;background:#fff;cursor:pointer;font:700 .68rem/1 inherit;color:#6b7079;padding:6px 0;border-radius:6px;text-align:center}
.bgp-msev .bgp-sevb.on.critical{background:#fbe8e4;border-color:#eaa89b;color:#b24a3a}
.bgp-msev .bgp-sevb.on.high{background:#fdf3e2;border-color:#e6c589;color:#8a6320}
.bgp-msev .bgp-sevb.on.medium{background:#eaf1fb;border-color:#9cc0ee;color:#2b5f9e}
.bgp-msev .bgp-sevb.on.low{background:#eef1f4;border-color:#c7ccd3;color:#4a5058}
.bgp-pop .bgp-areain{margin:0 6px 4px;max-width:none;width:calc(100% - 12px)}
.bgp-mdiv{height:1px;background:#eceae4;margin:4px 6px}
.bgp-resolve{flex:0 0 auto;height:34px;padding:0 14px;margin-left:4px;border:0;border-radius:8px;background:#12151b;color:#fff;font:650 .78rem/1 inherit;cursor:pointer}
.bgp-resolve.reopen{background:#fff;border:1px solid #e4e4df;color:#4a5058;font-weight:600}
.bgp-resolve:disabled{opacity:.5}
/* Expanded detail — ONE continuous surface (no tabs); sections separated by spacing + hairline heads. */
.bgp-detail{border-top:1px solid #eee;padding:14px 16px 16px;display:flex;flex-direction:column;gap:15px}
.bgp-sec{display:flex;flex-direction:column;gap:7px}
.bgp-sech{margin:0;font:800 .68rem/1 inherit;letter-spacing:.06em;text-transform:uppercase;color:#9297a0}
.bgp-secn{color:#c4c8ce;font-weight:700}
.bgp-sechrow{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:28px}
.bgp-report{white-space:pre-wrap;font-size:.86rem;line-height:1.55;color:#2b3038;word-break:break-word}
.bgp-report.muted{color:#9aa0a8}
.bgp-evi{display:flex;flex-wrap:wrap;gap:8px}
.bgp-evishot{border:0;padding:0;background:none;cursor:pointer;border-radius:9px;line-height:0}
.bgp-evishot img{max-width:220px;max-height:150px;object-fit:cover;border:1px solid #e4e4df;border-radius:9px;display:block}
.bgp-evi.one .bgp-evishot img{max-width:100%;max-height:420px;object-fit:contain;background:#f6f6f3}
.bgp-pagelink{display:inline-flex;align-items:center;gap:6px;font:700 .84rem/1 inherit;color:#3a6ea5;text-decoration:none;width:fit-content}
.bgp-pagelink:hover{text-decoration:underline}
.bgp-fix{white-space:pre-wrap;font-size:.84rem;line-height:1.55;color:#2b3038;word-break:break-word;
  background:#faf9f6;border:1px solid #eceae4;border-radius:10px;padding:12px 13px}
.bgp-fix.clamp{display:-webkit-box;-webkit-line-clamp:10;-webkit-box-orient:vertical;overflow:hidden}
.bgp-fixgen{display:flex;align-items:center;justify-content:space-between;gap:10px}
.bgp-fixbtns{display:flex;gap:6px}
.bgp-envline{font-size:.84rem;color:#3a3f47}
.bgp-toperr{font-size:.8rem;line-height:1.45;color:#5a6068;word-break:break-word;font-family:var(--font-mono),ui-monospace,Menlo,monospace}
.bgp-tech{border-top:1px solid #eee;padding-top:11px}
.bgp-tech>summary{cursor:pointer;font:800 .68rem/1 inherit;letter-spacing:.06em;text-transform:uppercase;color:#9297a0;list-style:none;display:inline-flex;align-items:center;gap:6px;user-select:none}
.bgp-tech>summary::-webkit-details-marker{display:none}
.bgp-tech>summary::before{content:"▸";color:#b8bcc3;font-size:.7rem}
.bgp-tech[open]>summary::before{content:"▾"}
.bgp-tech[open]>summary{margin-bottom:9px}
.bgp-mini{border:1px solid #e4e4df;background:#fff;cursor:pointer;font:700 .74rem/1 inherit;color:#4a5058;padding:6px 11px;border-radius:7px}
.bgp-mini:hover:not(:disabled){border-color:#12151b;color:#12151b}
.bgp-mini:disabled{opacity:.5;cursor:default}
.bgp-chev{margin-top:2px;border:0;background:none;cursor:pointer;font:700 .75rem/1 inherit;color:#8a6d2f;padding:2px 0;align-self:flex-start}
.bgp-kv{display:flex;flex-direction:column;gap:6px}
.bgp-kvrow{display:flex;align-items:baseline;gap:12px;font-size:.8rem;line-height:1.4;min-height:22px}
.bgp-kvk{flex:0 0 92px;color:#9297a0;font-weight:700}
.bgp-kvv{flex:1;min-width:0;color:#3a3f47;word-break:break-word;font-family:var(--font-mono),ui-monospace,Menlo,monospace;font-size:.78rem}
.bgp-errs{margin-top:9px;display:flex;flex-direction:column;gap:5px}
.bgp-err{font-size:.78rem;line-height:1.4;color:#5a6068;word-break:break-word;font-family:var(--font-mono),ui-monospace,Menlo,monospace}
.bgp-etag{display:inline-block;font-size:.66rem;font-weight:800;text-transform:uppercase;padding:1px 5px;border-radius:5px;background:#eceef1;color:#6b7079;margin-right:5px}
.bgp-etag.error,.bgp-etag.rejection{background:#fbe6e2;color:#b34a3a}
.bgp-etag.network{background:#fdf2dc;color:#8a6d2f}
.bgp-zoom{position:fixed;inset:0;z-index:1000;background:rgba(8,10,14,.9);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out}
.bgp-zoom img{max-width:96vw;max-height:92vh;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.5);cursor:default}
.bgp-zoom-bar{position:fixed;top:16px;right:16px;display:flex;gap:6px;z-index:1001}
.bgp-zoom-count{color:#fff;font-size:.8rem;font-weight:700;align-self:center;margin-right:4px}
.bgp-nav{position:fixed;top:50%;transform:translateY(-50%);z-index:1001;width:44px;height:44px;display:flex;align-items:center;justify-content:center;
  border:1px solid rgba(255,255,255,.2);border-radius:50%;background:rgba(255,255,255,.1);color:#fff;cursor:pointer}
.bgp-nav:hover{background:rgba(255,255,255,.22)}
.bgp-nav.prev{left:16px}
.bgp-nav.next{right:16px}
.bgp-ib.light{background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.2)}
.bgp-ib.light:hover{background:rgba(255,255,255,.22);color:#fff}
.bgp-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2000;background:#12151b;color:#fff;
  font-size:.82rem;font-weight:700;padding:8px 16px;border-radius:100px;box-shadow:0 10px 26px -8px rgba(0,0,0,.4);animation:bgpToast .16s ease}
@keyframes bgpToast{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
@media (max-width:640px){
  .bgp{padding:12px 12px 72px}
  .bgp-head{gap:10px;flex-wrap:wrap}
  .bgp-hnav{flex:1 1 auto}
  .bgp-controls{flex:1 1 100%;justify-content:space-between}
  .bgp-search.on input{width:120px}
  /* Restructure the row: thumb + content on top, actions on their own full-width line — never squeeze 3 desktop cols. */
  .bgp-row{grid-template-columns:64px minmax(0,1fr);grid-template-areas:"thumb body" "act act";gap:10px 12px;padding:12px 13px}
  .bgp-row.nothumb{grid-template-columns:minmax(0,1fr);grid-template-areas:"body" "act"}
  .bgp-thumb{grid-area:thumb}
  .bgp-body{grid-area:body}
  .bgp-act{grid-area:act;justify-content:flex-end;gap:6px;border-top:1px solid #f0efe9;padding-top:9px}
  .bgp-thumb img{width:64px;height:52px}
  .bgp-path{max-width:150px}
  .bgp-detail{padding:12px 13px 14px}
  .bgp-evi{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
  .bgp-evi::-webkit-scrollbar{display:none}
  .bgp-evishot{flex:0 0 auto}
  .bgp-evishot img{max-height:200px}
  .bgp-evi.one{overflow:visible}
  .bgp-evi.one .bgp-evishot,.bgp-evi.one .bgp-evishot img{width:100%;max-width:100%;max-height:340px}
  .bgp-kvk{flex-basis:80px}
}
@media (prefers-color-scheme:dark){
  .bgp{color:#e9edf2}
  .bgp-head{border-color:#2a2f37}
  .bgp-logo{color:#fff}
  .bgp-h1{color:#fff}
  .bgp-back{background:#161a20;border-color:#2a2f37;color:#c8ccd2}
  .bgp-search.on{background:#161a20;border-color:#2a2f37}
  .bgp-search input{color:#e9edf2}
  .bgp-seg{background:#1b1f26;border-color:#2a2f37}
  .bgp-tab.on{background:#e9edf2;color:#12151b}
  .bgp-card{background:#161a20;border-color:#2a2f37}
  .bgp-card.done{background:#12151a}
  .bgp-card.open{border-color:#3a4048}
  .bgp-desc{color:#eef1f5}
  .bgp-id{color:#9aa0a8}
  .bgp-id:hover{color:#fff}
  .bgp-ib:hover{background:#232830;color:#fff}
  .bgp-menu{background:#1b1f26;border-color:#2a2f37}
  .bgp-menu button,.bgp-menu a{color:#c8ccd2}
  .bgp-menu button:hover,.bgp-menu a:hover{background:#232830}
  .bgp-imgrow>span{color:#c8ccd2}
  .bgp-checkrow{color:#c8ccd2}
  .bgp-checkrow:hover{background:#232830}
  .bgp-checkrow input{accent-color:#e9edf2}
  .bgp-checkcopy{background:#e9edf2;color:#12151b}
  .bgp-imgnum{background:#161a20;border-color:#2a2f37;color:#c8ccd2}
  .bgp-imgnum:hover{background:#232830;border-color:#5a6068}
  .bgp-ib.on{background:#232830;color:#fff}
  .bgp-resolve.reopen{background:#161a20;border-color:#2a2f37;color:#c8ccd2}
  .bgp-detail{border-color:#2a2f37}
  .bgp-report,.bgp-fix,.bgp-envline{color:#cdd2d8}
  .bgp-report.muted{color:#7d838c}
  .bgp-fix{background:#12161c;border-color:#2a2f37}
  .bgp-pagelink{color:#7fb0e8}
  .bgp-tech{border-color:#2a2f37}
  .bgp-toperr{color:#a7adb6}
  .bgp-mdiv{background:#2a2f37}
  .bgp-mini{background:#161a20;border-color:#2a2f37;color:#c8ccd2}
  .bgp-mini:hover:not(:disabled){border-color:#5a6068;color:#fff}
  .bgp-kvv,.bgp-err{color:#c8ccd2}
  .bgp-etag{background:#232830;color:#9aa0a8}
  .bgp-etag.error,.bgp-etag.rejection{background:#3a201c;color:#e5a89c}
  .bgp-etag.network{background:#2c2617;color:#e0c88a}
  .bgp-toast{background:#e9edf2;color:#12151b}
  .bgp-thumb img,.bgp-evishot img{border-color:#2a2f37}
  .bgp-evi.one .bgp-evishot img{background:#12161c}
  .bgp-meta>*+*::before{color:#3a4048}
  .bgp-sev.critical{background:#3a201c;color:#e5a89c}
  .bgp-sev.high{background:#2c2617;color:#e0c88a}
  .bgp-sev.medium{background:#182636;color:#8fb6e6}
  .bgp-sev.low{background:#22262d;color:#9aa0a8}
  .bgp-ib.act{color:#fff}
  .bgp-frow button{background:#161a20;border-color:#2a2f37;color:#c8ccd2}
  .bgp-frow button:hover{border-color:#5a6068}
  .bgp-frow button.on{background:#e9edf2;border-color:#e9edf2;color:#12151b}
  .bgp-msev .bgp-sevb{background:#161a20;border-color:#2a2f37;color:#c8ccd2}
  .bgp-msev .bgp-sevb.on.critical{background:#3a201c;border-color:#6e3a30;color:#e5a89c}
  .bgp-msev .bgp-sevb.on.high{background:#2c2617;border-color:#5e4f24;color:#e0c88a}
  .bgp-msev .bgp-sevb.on.medium{background:#182636;border-color:#2f4d70;color:#8fb6e6}
  .bgp-msev .bgp-sevb.on.low{background:#22262d;border-color:#3a4048;color:#c8ccd2}
  .bgp-areain{background:#161a20;border-color:#2a2f37;color:#e9edf2}
  .bgp-areain:focus{border-color:#5a6068}
}
@media (max-width:640px) and (prefers-color-scheme:dark){ .bgp-act{border-color:#242a31} }
`;

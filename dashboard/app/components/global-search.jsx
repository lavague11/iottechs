"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { skipOutsideClose } from "../../lib/outside-click";

// Live, grouped, keyboard-driven global search. Debounced fetch to the ONE canonical /api/search
// (permission scoping is server-side). Empty + focused shows the user's recent projects + recent
// searches. ↑/↓ move, Enter opens, Esc closes, "/" focuses when you're not already typing.
const RS_KEY = "iot_recent_searches";
const ICON = {
  project:    <svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  customer:   <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>,
  ticket:     <svg viewBox="0 0 24 24"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/></svg>,
  service:    <svg viewBox="0 0 24 24"><path d="M14 7a4 4 0 0 1-5 5l-5 5 2 2 5-5a4 4 0 0 0 5-5z"/></svg>,
  technician: <svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M6 21v-1a6 6 0 0 1 12 0v1"/></svg>,
  search:     <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>,
  all:        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
};

export default function GlobalSearch() {
  const r = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");       // the query the current groups reflect
  const [recentProjects, setRecentProjects] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const debRef = useRef(null);
  const recentLoaded = useRef(false);

  const hasQ = q.trim().length > 0;

  // Flat navigable list (keyboard) — results+View-all when searching, recents when empty.
  const navItems = useMemo(() => {
    if (hasQ) {
      const items = groups.flatMap((g) => g.items.map((it) => ({ kind: "result", ...it })));
      if (items.length) items.push({ kind: "all" });
      return items;
    }
    return [
      ...recentProjects.map((p) => ({ kind: "result", ...p })),
      ...recentSearches.map((term) => ({ kind: "search", term })),
    ];
  }, [hasQ, groups, recentProjects, recentSearches]);

  // Load recents (once) + localStorage searches when the field gets focus while empty.
  const loadRecents = useCallback(() => {
    try { setRecentSearches(JSON.parse(localStorage.getItem(RS_KEY) || "[]").slice(0, 6)); } catch { /* noop */ }
    if (recentLoaded.current) return;
    recentLoaded.current = true;
    fetch("/api/search?recent=1").then((x) => x.json()).then((j) => setRecentProjects(j.recent || [])).catch(() => {});
  }, []);

  // Debounced search; cancels stale requests.
  useEffect(() => {
    if (!hasQ) { setGroups([]); setLoading(false); return; }
    setLoading(true);
    clearTimeout(debRef.current);
    const query = q.trim();
    debRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController(); abortRef.current = ac;
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ac.signal })
        .then((x) => x.json())
        .then((j) => { setGroups(j.groups || []); setSearched(query); setLoading(false); setActive(-1); })
        .catch((e) => { if (e.name !== "AbortError") { setGroups([]); setLoading(false); } });
    }, 220);
    return () => clearTimeout(debRef.current);
  }, [q, hasQ]);

  useEffect(() => {
    function onDoc(e) { if (skipOutsideClose(e)) return; if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // "/" focuses search when not already typing somewhere.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""));
      if (typing) return;
      e.preventDefault(); inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function addRecentSearch(term) {
    const t = term.trim(); if (!t) return;
    try {
      const prev = JSON.parse(localStorage.getItem(RS_KEY) || "[]").filter((x) => x.toLowerCase() !== t.toLowerCase());
      const next = [t, ...prev].slice(0, 6);
      localStorage.setItem(RS_KEY, JSON.stringify(next));
      setRecentSearches(next);
    } catch { /* private mode */ }
  }
  function clearRecent() { try { localStorage.removeItem(RS_KEY); } catch {} setRecentSearches([]); }

  function go(item) {
    if (!item) { if (hasQ) { addRecentSearch(q); r.push(`/portal?q=${encodeURIComponent(q.trim())}`); setOpen(false); } return; }
    if (item.kind === "all") { addRecentSearch(q); r.push(`/portal?q=${encodeURIComponent(q.trim())}`); setOpen(false); inputRef.current?.blur(); return; }
    if (item.kind === "search") { setQ(item.term); inputRef.current?.focus(); return; }
    if (hasQ) addRecentSearch(q);
    r.push(item.href); setOpen(false); inputRef.current?.blur();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min((navItems.length - 1), i + 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(-1, i - 1)); return; }
    if (e.key === "Enter") { e.preventDefault(); if (active >= 0 && navItems[active]) go(navItems[active]); else go(null); return; }
  }

  let idx = -1; // running index to match navItems order for highlight
  const rowCls = (i) => `gs-row${i === active ? " on" : ""}`;

  return (
    <div className="gs-wrap" ref={wrapRef}>
      <div className="nav-search gs-field">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input ref={inputRef} type="text" placeholder="Search projects, customers, tickets…" value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); loadRecents(); }}
          onKeyDown={onKeyDown} aria-label="Global search" autoComplete="off" />
      </div>

      {open && (
        <div className="gs-menu">
          {hasQ ? (
            loading && searched !== q.trim() ? (
              <div className="gs-state">Searching…</div>
            ) : groups.length === 0 ? (
              <div className="gs-empty">
                <div className="gs-nores">No results for &ldquo;{q.trim()}&rdquo;</div>
                <button className="gs-row gs-all" onClick={() => go({ kind: "all" })}><span className="gs-ic">{ICON.all}</span>Search all projects →</button>
              </div>
            ) : (
              <>
                {groups.map((g) => (
                  <div className="gs-group" key={g.type}>
                    <div className="gs-glabel">{g.label}</div>
                    {g.items.map((it) => { idx++; const myI = idx; return (
                      <button className={rowCls(myI)} key={it.type + it.id} onMouseEnter={() => setActive(myI)} onClick={() => go({ kind: "result", ...it })}>
                        <span className={`gs-ic gs-ic-${it.type}`}>{ICON[it.type]}</span>
                        <span className="gs-body"><span className="gs-title">{it.title}</span><span className="gs-sub">{it.subtitle}</span></span>
                      </button>
                    ); })}
                  </div>
                ))}
                {(() => { idx++; const myI = idx; return (
                  <button className={`gs-all ${rowCls(myI)}`} onMouseEnter={() => setActive(myI)} onClick={() => go({ kind: "all" })}>
                    <span className="gs-ic">{ICON.all}</span>View all results →
                  </button>
                ); })()}
              </>
            )
          ) : (
            (recentProjects.length === 0 && recentSearches.length === 0) ? (
              <div className="gs-state">Type to search projects, customers, tickets, service calls…</div>
            ) : (
              <>
                {recentProjects.length > 0 && (
                  <div className="gs-group">
                    <div className="gs-glabel">Recent</div>
                    {recentProjects.map((it) => { idx++; const myI = idx; return (
                      <button className={rowCls(myI)} key={"r" + it.id} onMouseEnter={() => setActive(myI)} onClick={() => go({ kind: "result", ...it })}>
                        <span className="gs-ic gs-ic-project">{ICON.project}</span>
                        <span className="gs-body"><span className="gs-title">{it.title}</span><span className="gs-sub">{it.subtitle}</span></span>
                      </button>
                    ); })}
                  </div>
                )}
                {recentSearches.length > 0 && (
                  <div className="gs-group">
                    <div className="gs-glabel">Recent searches <button className="gs-clear" onMouseDown={(e) => { e.preventDefault(); clearRecent(); }}>Clear</button></div>
                    {recentSearches.map((term) => { idx++; const myI = idx; return (
                      <button className={rowCls(myI)} key={"s" + term} onMouseEnter={() => setActive(myI)} onClick={() => go({ kind: "search", term })}>
                        <span className="gs-ic">{ICON.search}</span><span className="gs-title">{term}</span>
                      </button>
                    ); })}
                  </div>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}

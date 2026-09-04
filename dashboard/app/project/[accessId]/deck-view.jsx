"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import AddressAutocomplete from "../../components/address-autocomplete";
import { Wordmark } from "../../components/brand";

/*
  DeckView — the redesigned project page shell (horizontal stage deck).
  Ported from the handoff (project-view-deck.html) into a prop-driven React component.
  It is presentation only: role/data logic stays in the gateway and is passed in.

  Props:
    stages       [{ name, pill, pct, turn:'customer'|'mine'|'idle', need, advance:{to,ready,reason},
                    tint:'ink'|'gold'|'blue'|'green'|'purple', tools:[{ name, state:'done'|'active', label, node }],
                    completion?:node }]
    idx          controlled current stage index (clamped)
    onIdx        (i) => void  — parent owns the index (so it can gate/commit)
    canAdvance   bool — show a live advance button vs gated
    customer     { name, code, statusText, fields:[{k,v,sub}], actions:[{label,href,icon}] } | null
    menu         [{ label, danger, onClick }]  — the "…" overflow items this role may see
    roleLabel    string for the top-right role pill (e.g. "Admin view")
*/
// Per-stage tool completion — drives the footer "N of M complete" / "Ready to advance".
const stageProgress = (s) => {
  const total = (s.tools || []).length;
  const done = (s.tools || []).filter((t) => t.state === "done").length;
  return { done, total, allDone: total > 0 && done === total };
};

export default function DeckView({ stages = [], idx = 0, onIdx, canAdvance = true, customer = null, menu = [], roleLabel = "Admin view", log = null, previewRole = null, onPreviewRole, previewRoles = [], roleMenu = null, onLock = null, logoHref = "/dashboard", statusChip = null, initialOpenTool = null, progressPct = null, openToolOnMount = null, openToolSignal = null }) {
  const N = stages.length;
  const [drag, setDrag] = useState(0);
  const [openTool, setOpenTool] = useState(initialOpenTool || {});   // { [stageIdx]: toolIdx | null }
  const [overlay, setOverlay] = useState(null);      // { i, ti, name } — heavy tools launch full-screen
  const [custOpen, setCustOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);    // role/preview dropdown
  const [custEdit, setCustEdit] = useState(false);   // drawer contact-edit mode
  const [cf, setCf] = useState(null);                 // edit form values
  const [savingCust, setSavingCust] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moved, setMoved] = useState(false);
  // "Complete but unread" markers blink green until the viewer has actually looked at the finished
  // stage; once seen they go solid green. Seen-state is per viewer (this browser), remembered across
  // visits in localStorage and keyed to the project/account so each one tracks its own.
  const seenKey = `dvseen:${customer?.code || "deck"}`;
  const [seen, setSeen] = useState(() => new Set());
  const [seenLoaded, setSeenLoaded] = useState(false);
  const deckRef = useRef(null);
  const startX = useRef(null);
  const startY = useRef(null);
  const capturing = useRef(false);
  const wheelLock = useRef(false);

  const go = useCallback((i) => { const n = Math.max(0, Math.min(N - 1, i)); setMoved(true); onIdx ? onIdx(n) : null; }, [N, onIdx]);
  // Jump to a named tool AND open it — used by the "your next step" chip so tapping it lands the
  // customer on the exact tool (heavy tools launch full-screen; light ones expand inline).
  const openNamedTool = useCallback((name) => {
    if (!name) return false;
    for (let i = 0; i < stages.length; i++) {
      const ti = (stages[i].tools || []).findIndex((t) => t.name === name && t.node);
      if (ti >= 0) {
        go(i);
        const t = stages[i].tools[ti];
        if (t.heavy) setOverlay({ i, ti, name: t.name });
        else setOpenTool((o) => ({ ...o, [i]: ti }));
        return true;
      }
    }
    return false;
  }, [stages, go]);

  // Share links (?open=<tool>) land the recipient with that tool already OPEN (e.g. the actual
  // proposal document, not just the proposal step). Fires once the tool's data has loaded in.
  const openedOnMountRef = useRef(false);
  useEffect(() => {
    if (openedOnMountRef.current || !openToolOnMount) return;
    const ready = stages.some((s) => (s.tools || []).some((t) => t.name === openToolOnMount && t.node));
    if (!ready) return;
    openedOnMountRef.current = true;
    openNamedTool(openToolOnMount);
  }, [openToolOnMount, stages, openNamedTool]);

  // Imperative open signal (e.g. a "Review & Approve" link → open the proposal document). Fires each
  // time the nonce bumps.
  const lastOpenSignalRef = useRef(0);
  useEffect(() => {
    if (!openToolSignal || openToolSignal.n === lastOpenSignalRef.current) return;
    lastOpenSignalRef.current = openToolSignal.n;
    openNamedTool(openToolSignal.name);
  }, [openToolSignal, openNamedTool]);

  // ── drag ── capture only AFTER a real horizontal move, so taps still fire the button click.
  // Never start a drag from an interactive control — on touch, finger jitter on a button tap would
  // otherwise trip the capture and steal the click (the tool would never open on mobile).
  function onPointerDown(e) {
    if (e.target.closest("[data-stop], button, a, input, textarea, select, label")) return;
    startX.current = e.clientX; startY.current = e.clientY; capturing.current = false;
  }
  function onPointerMove(e) {
    if (startX.current == null) return;
    const dx = e.clientX - startX.current, dy = e.clientY - startY.current;
    // Only a clearly-horizontal swipe pages the deck — vertical scrolls and taps pass through.
    if (!capturing.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { capturing.current = true; deckRef.current?.setPointerCapture?.(e.pointerId); }
    if (capturing.current) setDrag(dx);
  }
  function endDrag() {
    if (startX.current == null) return;
    const w = deckRef.current?.offsetWidth || 1, d = drag, thr = Math.min(110, w * 0.16);
    const wasDrag = capturing.current;
    startX.current = null; startY.current = null; capturing.current = false; setDrag(0);
    if (!wasDrag) return;                                 // a tap — let the click through
    if (d < -thr) go(idx + 1); else if (d > thr) go(idx - 1);
  }
  // ── wheel (horizontal) ──
  function onWheel(e) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (wheelLock.current || Math.abs(e.deltaX) < 18) return;
    wheelLock.current = true; go(idx + (e.deltaX > 0 ? 1 : -1));
    setTimeout(() => (wheelLock.current = false), 480);
  }
  // ── keys ──
  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowRight") { go(idx + 1); }
      if (e.key === "ArrowLeft") { go(idx - 1); }
      if (e.key === "Escape") { setMenuOpen(false); setCustOpen(false); setOverlay(null); }
    }
    const el = deckRef.current; el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [idx, go]);
  useEffect(() => {
    function onDoc(e) { if (!e.target.closest?.(".dv-cluster")) setMenuOpen(false); }
    document.addEventListener("click", onDoc); return () => document.removeEventListener("click", onDoc);
  }, []);

  const slideStyle = (i) => {
    const d = i - idx;                                  // clamp: no wrap
    const w = deckRef.current?.offsetWidth || 1;
    const p = d + drag / w, a = Math.abs(p), hidden = a >= 0.999 && drag === 0;
    return {
      // NB: left:0 (not left:50% + translate(-50%)) — a full-width slide centered via -50% lands on a
      // half-pixel (e.g. -704.5px) which, with will-change compositing, renders the text blurry.
      transform: `translateX(${p * 100}%)`,
      opacity: drag ? 1 : a < 1 ? 1 : 0,
      visibility: hidden ? "hidden" : "visible",
      zIndex: a < 1 ? 10 : 1,
      transition: drag ? "none" : "transform .6s var(--dv-eo), opacity .45s var(--dv-eo)",
    };
  };

  const cur = stages[idx] || {};
  const turnText = cur.turn === "customer" ? "Waiting on customer" : cur.turn === "mine" ? `Next · ${cur.need || ""}` : (cur.need || "");

  // Stage marker state — one shared language across every Deck (camera + ADT):
  //   todo (white) · active (blinking yellow, being worked on) · done (solid yellow, submitted/waiting)
  //   · attention (blinking red, needs approval/signature) · complete (green) · complete-unread (blinking green).
  // A stage can name its own `mark`; otherwise we derive a sensible default from where we are + turn.
  const baseMark = (s, i) => {
    if (s.mark) return s.mark;                                   // explicit override wins
    if (i < idx || s.pct >= 100) return "complete";             // behind us / fully done → green
    if (i > idx) return "todo";                                 // not reached yet → white
    const tools = s.tools || [];                                // the current stage:
    if (s.turn === "customer") return "attention";              // an approval/signature is outstanding → blink red
    if (tools.length > 0 && tools.every((t) => t.state === "done")) return "done"; // work submitted, waiting → solid yellow
    return "active";                                            // being worked on → blink yellow
  };
  // A completed stage the viewer hasn't looked at yet blinks green ("complete-unread"); once seen, solid green.
  const markOf = (s, i) => {
    const m = baseMark(s, i);
    // Only auto-blink DERIVED completes (a stage the viewer hasn't looked at). An explicit s.mark is
    // authoritative — e.g. "complete" must stay SOLID green (approved), "complete-unread" stays blinking.
    if (!s.mark && m === "complete" && seenLoaded && !seen.has(s.name)) return "complete-unread";
    return m;
  };

  // Load this viewer's seen-set once (client only).
  useEffect(() => {
    let set = new Set();
    try { set = new Set(JSON.parse(localStorage.getItem(seenKey) || "[]")); } catch { /* first visit */ }
    setSeen(set); setSeenLoaded(true);
  }, [seenKey]);
  // Landing on a completed stage marks it read → its marker settles from blinking to solid green.
  useEffect(() => {
    if (!seenLoaded) return;
    const s = stages[idx];
    if (!s || baseMark(s, idx) !== "complete") return;
    setSeen((prev) => {
      if (prev.has(s.name)) return prev;                        // already read → no state change
      const next = new Set(prev); next.add(s.name);
      try { localStorage.setItem(seenKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [idx, seenLoaded, stages, seenKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dv-shell" data-tint={cur.tint || "ink"}>
      {/* top bar */}
      <header className="dv-top">
        <a className="dv-logo" href="/go" title="IOT TECHS" aria-label="IOT TECHS home"><Wordmark height={16} /></a>
        <div className="dv-sp" />
        <div className="dv-rolewrap" data-stop>
          <button className={`dv-ghost dv-solid${previewRole ? " previewing" : ""}`} onClick={() => (roleMenu?.length || previewRoles.length || onLock) && setRoleOpen((o) => !o)}>
            {previewRole && <span className="dv-eye"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span>}
            {roleLabel}
            {(roleMenu?.length || previewRoles.length > 0 || onLock) && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>}
          </button>
          {roleOpen && (roleMenu?.length ? (
            <div className="dv-rolemenu">
              {roleMenu.map((it, i) => (
                <button key={i} className={it.on ? "on" : ""} onClick={() => { setRoleOpen(false); it.onClick?.(); }}>{it.label}</button>
              ))}
            </div>
          ) : (previewRoles.length > 0 || onLock) && (
            <div className="dv-rolemenu">
              {previewRoles.length > 0 && (
                <>
                  <button className={!previewRole ? "on" : ""} onClick={() => { onPreviewRole?.(null); setRoleOpen(false); }}>Your view</button>
                  {previewRoles.map((r) => (
                    <button key={r} className={previewRole === r ? "on" : ""} onClick={() => { onPreviewRole?.(r); setRoleOpen(false); }}>Preview as {r}</button>
                  ))}
                </>
              )}
              {onLock && <button className="dv-rolelock" onClick={() => { setRoleOpen(false); onLock(); }}>Lock</button>}
            </div>
          ))}
        </div>
      </header>

      {/* job bar */}
      <div className="dv-jobbar">
        {customer && (
          <button className="dv-identity" onClick={() => setCustOpen((o) => !o)} aria-expanded={custOpen}>
            <span className="dv-code mono">{customer.code}</span>
            <h1 className="dv-title">{customer.name}</h1>
            <span className={`dv-chev${custOpen ? " up" : ""}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg></span>
          </button>
        )}
        {statusChip && (statusChip.onClick
          ? <button className={`dv-chip dv-chip-act${statusChip.muted ? " muted" : ""}`} style={{ background: statusChip.color + "1f", color: statusChip.color }}
              onClick={(e) => { e.stopPropagation(); if (!openNamedTool(statusChip.openTool)) statusChip.onClick?.(); }}>
              <i className="dv-dot" style={{ background: statusChip.color }} />{statusChip.label}
              <svg className="dv-chip-arw" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          : <span className="dv-chip" style={{ background: statusChip.color + "1f", color: statusChip.color }}><i className="dv-dot" style={{ background: statusChip.color }} />{statusChip.label}</span>)}

        <div className="dv-cluster">
          {menu.length > 0 && (
            <button className="dv-act" onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }} aria-haspopup="true" aria-expanded={menuOpen}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
            </button>
          )}
          <div className={`dv-menu${menuOpen ? " open" : ""}`} role="menu">
            {menu.map((m, i) => (
              <button key={i} role="menuitem" className={m.danger ? "danger" : ""} onClick={() => { setMenuOpen(false); m.onClick?.(); }}>{m.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* customer drawer */}
      {customer && (
        <section className={`dv-customer${custOpen ? " open" : ""}`}>
          <div className="dv-cust-in">
            {custEdit ? (
              <div className="dv-cust-edit" data-stop>
                <label className="dv-cl">Name</label>
                <input className="dv-ci" value={cf.contact_name} onChange={(e) => setCf((v) => ({ ...v, contact_name: e.target.value }))} />
                <div className="dv-crow">
                  <div><label className="dv-cl">Phone</label><input className="dv-ci" value={cf.contact_phone} onChange={(e) => setCf((v) => ({ ...v, contact_phone: e.target.value }))} /></div>
                  <div><label className="dv-cl">Email</label><input className="dv-ci" value={cf.contact_email} onChange={(e) => setCf((v) => ({ ...v, contact_email: e.target.value }))} /></div>
                </div>
                <label className="dv-cl">Job site</label>
                <AddressAutocomplete className="dv-ci" value={cf.address} onChange={(v) => setCf((s) => ({ ...s, address: v }))} onPlace={(p) => setCf((s) => ({ ...s, address: p.address }))} placeholder="Start typing, then choose the address" />
                {customer.serviceOptions && (<>
                  <label className="dv-cl">Service</label>
                  <select className="dv-ci" value={cf.service_code || ""} onChange={(e) => setCf((s) => ({ ...s, service_code: e.target.value }))}>
                    {customer.serviceOptions.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                  </select>
                </>)}
                <div className="dv-cust-actions">
                  <button className="dv-mini primary" disabled={savingCust} onClick={async () => {
                    setSavingCust(true);
                    // Service change (if any) goes through its own handler; contact fields through onSave.
                    let svcOk = true;
                    if (customer.serviceOptions && cf.service_code && cf.service_code !== (customer.service_code || "")) {
                      const rs = await customer.onServiceChange?.(cf.service_code); svcOk = !rs || rs.ok; if (!svcOk) alert(rs?.error || "Couldn't change the service.");
                    }
                    const { service_code, ...contact } = cf;
                    const r = await customer.onSave?.(contact);
                    setSavingCust(false);
                    if ((!r || r.ok) && svcOk) setCustEdit(false); else if (r && !r.ok) alert(r.error || "Save failed.");
                  }}>{savingCust ? "Saving…" : "Save"}</button>
                  <button className="dv-mini" onClick={() => setCustEdit(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {(customer.fields || []).map((f, i) => (
                  <div className="dv-field" key={i}><dt>{f.k}</dt><dd>
                    {f.href ? <a className="dv-flink" href={f.href} target={f.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">{f.v}</a> : f.v}
                    {f.sub && (f.subHref ? <small><a className="dv-flink" href={f.subHref}>{f.sub}</a></small> : <small>{f.sub}</small>)}
                  </dd></div>
                ))}
                {(customer.actions?.length > 0 || customer.canEdit) && (
                  <div className="dv-cust-actions">
                    {(customer.actions || []).map((a, i) => <a className="dv-mini dv-ico" key={i} href={a.href || undefined} onClick={a.onClick} title={a.label} aria-label={a.label}>{a.icon || a.label}</a>)}
                    {customer.canEdit && (
                      <button className="dv-mini dv-ico" data-stop title="Edit" aria-label="Edit" onClick={() => { setCf({ contact_name: customer.contact?.contact_name || "", contact_phone: customer.contact?.contact_phone || "", contact_email: customer.contact?.contact_email || "", address: customer.contact?.address || "", service_code: customer.service_code || "" }); setCustEdit(true); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* rail */}
      <nav className="dv-rail">
        <div className="dv-track">
          {stages.map((s, i) => {
            const done = i < idx, current = i === idx;
            const doneRatio = s.tools ? (s.tools.filter((t) => t.state === "done").length / Math.max(1, s.tools.length)) : 1;
            const fill = done ? 100 : current ? Math.max(18, doneRatio * 100) : 0;
            return (
              <button key={i} className={`dv-seg${done ? " done" : ""}${current ? " current" : ""}`} onClick={() => go(i)}>
                <div className="dv-bar"><i style={{ width: fill + "%", background: current ? "var(--dv-gold)" : "var(--dv-ink)" }} /></div>
                <div className="dv-lab"><span className={`dv-beacon m-${markOf(s, i)}`} /><b>{done ? "✓" : i + 1}</b><span className="nm">{s.name}</span></div>
              </button>
            );
          })}
        </div>
        <div className="dv-readout"><div className="pct mono">{progressPct != null ? progressPct : cur.pct}%</div><div className="cap mono">{cur.name}</div></div>
      </nav>

      {/* deck */}
      <main className={`dv-deck${moved ? " moved" : ""}`} id="dv-deck" tabIndex={0} ref={deckRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onWheel={onWheel}>
        {stages.map((s, i) => (
          <div className="dv-slide" key={i} style={slideStyle(i)} aria-hidden={i !== idx}>
            <div className={`dv-pane${(s.tools?.length === 1 && s.tools[0].node && !s.tools[0].heavy && s.tools[0].wide) ? " dv-wide" : ""}`}>
              <div className="dv-pane-head">
                <div className="dv-stage-name">{s.name}</div>
                <span className={`dv-flag f-${(s.pill || "").toLowerCase()}`}>{s.pill}</span>
              </div>
              {s.completion ? (
                <div className="dv-scroll">{s.completion}</div>
              ) : (
                  <div className={`dv-scroll${(s.tools?.length === 1 && s.tools[0].node && !s.tools[0].heavy && s.tools[0].wide) ? " dv-scroll--wide" : ""}`}>
                    {(() => {
                      const _tools = s.tools || [];
                      // A stage with a single inline tool shows its content directly, full-width —
                      // no pointless expand/collapse on the only thing there. (Heavy tools still
                      // launch full-screen on tap.) `wide` lets a merged stage page span the page.
                      if (_tools.length === 1 && _tools[0].node && !_tools[0].heavy) {
                        return <div className={`dv-solo${_tools[0].wide ? " dv-solo--wide" : ""}`} data-stop>{_tools[0].node}</div>;
                      }
                      return _tools.map((t, ti) => {
                      const open = openTool[i] === ti;
                      // The row IS the trigger — no intermediate "Open" step. Heavy tools launch
                      // full-screen; light tools expand their content inline right here.
                      const launch = () => {
                        if (!t.node) return;
                        if (t.heavy) setOverlay({ i, ti, name: t.name });
                        else setOpenTool((o) => ({ ...o, [i]: open ? null : ti }));
                      };
                      return (
                        <div className={`dv-tool ${t.state || ""}${open ? " open" : ""}${t.node ? "" : " stub"}`} key={ti}>
                          <button className="dv-tool-row" onClick={launch} disabled={!t.node}>
                            <span className="dv-tmark" />
                            <span className="dv-tname">{t.name}</span>
                            <span className="dv-caret">
                              {t.heavy
                                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>}
                            </span>
                          </button>
                          {!t.heavy && t.node && (
                            <div className="dv-tdetail"><div><div className="dv-tinline" data-stop>{t.node}</div></div></div>
                          )}
                        </div>
                      );
                      });
                    })()}
                  </div>
              )}
              {/* Footer — present on every stage. Job Log on the left; advance controls on the right. */}
              {(() => { const pg = stageProgress(s); return (
              <div className={`dv-advance${s.advance ? (pg.allDone ? " ready" : " gated") : ""}`}>
                {log && (
                  <button className="dv-log-btn" data-stop onClick={() => setOverlay({ name: "Job Log", node: log })}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
                    Log
                  </button>
                )}
                {s.advance && (canAdvance ? (
                  <>
                    {pg.allDone
                      ? <span className="dv-reason ok">Ready to advance</span>
                      : <span className="dv-reason mono">{pg.done} of {pg.total} complete</span>}
                    <button className="dv-adv-btn" data-stop disabled={!s.advance.ready} onClick={() => go(idx + 1)}>Continue to {s.advance.to}
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
                  </>
                ) : (
                  // Non-admin can't move the stage — show progress, not a dead "Continue" button.
                  pg.total > 0 && <span className="dv-reason mono">{pg.allDone ? "Stage complete" : `${pg.done} of ${pg.total} complete`}</span>
                ))}
              </div>
              ); })()}
            </div>
          </div>
        ))}
      </main>

      {/* full-screen tool overlay — heavy tools (Site Survey, Proposal…) get the whole screen */}
      {overlay && (
        <div className="dv-overlay">
          <div className="dv-overlay-bar">
            <b>{overlay.name}</b>
            <button className="dv-overlay-x" onClick={() => setOverlay(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>Close
            </button>
          </div>
          <div className={`dv-overlay-body${overlay.name === "Site Survey" ? " survey" : ""}`}>{overlay.node ?? stages[overlay.i]?.tools?.[overlay.ti]?.node}</div>
        </div>
      )}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.dv-shell{--dv-ink:#101418;--dv-ink-soft:#3A4048;--dv-meta:#787D84;--dv-faint:#A1A6AC;--dv-paper:#F4F4F2;--dv-raise:#FBFBFA;--dv-line:#E4E4DF;--dv-line-soft:#EDEDE9;--dv-gold:#C9A96E;--dv-gold-deep:#A8842F;--dv-green:#2E7D5B;--dv-red:#C4553D;--dv-blue:#3E6C9E;--dv-e:cubic-bezier(.22,.9,.24,1);--dv-eo:cubic-bezier(.16,1,.3,1);
  height:100dvh;display:flex;flex-direction:column;background:var(--dv-paper);color:var(--dv-ink);
  font-family:var(--font-sans),"Instrument Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
.dv-shell .mono{font-family:var(--font-mono),"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.dv-shell button{font:inherit;color:inherit;background:none;border:none;cursor:pointer}
.dv-shell :focus-visible{outline:2px solid var(--dv-gold-deep);outline-offset:3px;border-radius:8px}

.dv-top{display:flex;align-items:center;gap:12px;padding:0 24px;height:56px;flex:0 0 auto}
.dv-logo{font-weight:700;letter-spacing:-.02em;font-size:15px;color:var(--dv-ink);text-decoration:none;cursor:pointer}
.dv-logo:hover{opacity:.7}.dv-logo em{font-style:normal;color:var(--dv-gold-deep)}
.dv-sp{flex:1}
.dv-ghost{display:flex;align-items:center;gap:7px;height:32px;padding:0 11px;border-radius:9px;font-size:12.5px;font-weight:500;color:var(--dv-ink-soft)}
.dv-solid{background:var(--dv-ink);color:#fff}
.dv-solid.previewing{background:var(--dv-gold-deep)}
.dv-eye{display:inline-flex}
.dv-rolewrap{position:relative}
.dv-rolemenu{position:absolute;top:calc(100% + 6px);right:0;z-index:60;background:var(--dv-raise);border:1px solid var(--dv-line);border-radius:11px;box-shadow:0 14px 34px rgba(16,20,24,.14);padding:5px;min-width:170px;display:flex;flex-direction:column;gap:2px}
.dv-rolemenu button{text-align:left;padding:8px 11px;border-radius:7px;font-size:13px;font-weight:500;color:var(--dv-ink-soft);text-transform:capitalize}
.dv-rolemenu button:hover{background:var(--dv-paper)}
.dv-rolemenu button.on{color:var(--dv-gold-deep);font-weight:600}
.dv-rolemenu button.dv-rolelock{margin-top:4px;padding-top:9px;border-top:1px solid var(--dv-line);border-radius:0 0 7px 7px;color:var(--dv-ink-soft);font-weight:600}

.dv-jobbar{flex:0 0 auto;padding:6px 24px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dv-identity{display:flex;align-items:center;gap:12px;padding:8px 12px 8px 10px;margin-left:-10px;border-radius:12px;transition:background .18s}
.dv-identity:hover{background:rgba(16,20,24,.04)}
.dv-code{font-size:11px;letter-spacing:.09em;color:var(--dv-meta);padding:5px 8px;border:1px solid var(--dv-line);border-radius:7px}
.dv-title{font-size:23px;font-weight:600;letter-spacing:-.028em;margin:0}
.dv-chev{color:var(--dv-faint);transition:transform .34s var(--dv-e)}.dv-chev.up{transform:rotate(180deg);color:var(--dv-ink)}
.dv-chip{display:inline-flex;align-items:center;gap:6px;height:23px;padding:0 9px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}
.dv-chip.live{background:#E9F3ED;color:var(--dv-green)}
/* Clickable "your next step" chip — draws a gentle pulse so the customer notices the one action owed. */
.dv-chip-act{border:none;cursor:pointer;font-family:inherit;transition:filter .15s var(--dv-e);animation:dvChipPulse 2.2s ease-in-out infinite}
.dv-chip-act:hover{filter:brightness(.96)}
.dv-chip-act.muted{animation:none}   /* a "waiting on the customer" status, not an action — no pulse */
.dv-chip-act .dv-chip-arw{margin-left:1px;opacity:.85}
.dv-chip-act .dv-dot{animation:none}
@keyframes dvChipPulse{0%,100%{box-shadow:0 0 0 0 rgba(201,169,110,.4)}50%{box-shadow:0 0 0 4px rgba(201,169,110,0)}}
@media (prefers-reduced-motion:reduce){.dv-chip-act{animation:none}}
.dv-dot{width:5px;height:5px;border-radius:99px;background:currentColor;animation:dvpulse 2.4s var(--dv-e) infinite}
@keyframes dvpulse{0%,100%{opacity:1}50%{opacity:.35}}
.dv-status{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:500;color:var(--dv-ink-soft)}
.dv-status i{width:6px;height:6px;border-radius:99px;background:var(--dv-blue)}
.dv-status.mine{color:var(--dv-gold-deep)}.dv-status.mine i{background:var(--dv-gold-deep)}
.dv-status.idle{color:var(--dv-faint)}.dv-status.idle i{background:var(--dv-faint)}
.dv-cluster{margin-left:auto;display:flex;align-items:center;gap:8px;position:relative}
.dv-act{width:30px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--dv-ink-soft);background:rgba(16,20,24,.045)}
.dv-act:hover{background:var(--dv-raise);color:var(--dv-ink)}
.dv-menu{position:absolute;top:calc(100% + 8px);right:0;width:216px;background:var(--dv-raise);border:1px solid var(--dv-line);border-radius:13px;padding:6px;z-index:70;box-shadow:0 24px 60px -24px rgba(16,20,24,.35);opacity:0;transform:translateY(-6px) scale(.97);pointer-events:none;transform-origin:top right;transition:.22s var(--dv-eo)}
.dv-menu.open{opacity:1;transform:none;pointer-events:auto}
.dv-menu button{width:100%;display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;font-size:13px;color:var(--dv-ink-soft);text-align:left}
.dv-menu button:hover{background:rgba(16,20,24,.05);color:var(--dv-ink)}
.dv-menu button.danger:hover{background:#FBEDE9;color:var(--dv-red)}

.dv-customer{flex:0 0 auto;overflow:hidden;max-height:0;transition:max-height .46s var(--dv-eo)}
.dv-customer.open{max-height:360px}
.dv-cust-in{margin:12px 24px 0;padding:20px 22px;border-radius:16px;background:var(--dv-raise);border:1px solid var(--dv-line);display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:22px 26px;opacity:0;transform:translateY(-8px);transition:.4s var(--dv-eo) .04s}
.dv-customer.open .dv-cust-in{opacity:1;transform:none}
.dv-field dt{font-family:var(--font-mono),"JetBrains Mono",monospace;font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--dv-faint);margin-bottom:6px}
.dv-field dd{font-size:13.5px;color:var(--dv-ink);line-height:1.5}
.dv-field dd small{display:block;color:var(--dv-meta);font-size:12px;margin-top:2px}
.dv-flink{color:inherit;text-decoration:none;cursor:pointer;transition:color .12s}
.dv-flink:hover{color:var(--dv-gold-deep,#A8842F);text-decoration:underline}
.dv-cust-actions{display:flex;gap:8px;flex-wrap:wrap;grid-column:1/-1;padding-top:4px;border-top:1px solid var(--dv-line-soft)}
.dv-mini{display:inline-flex;align-items:center;gap:7px;height:31px;padding:0 12px;border-radius:9px;border:1px solid var(--dv-line);font-size:12.5px;font-weight:500;color:var(--dv-ink-soft);background:var(--dv-paper);text-decoration:none}
.dv-mini:hover{border-color:var(--dv-ink);color:var(--dv-ink)}
.dv-ico{width:36px;height:31px;padding:0;justify-content:center;color:var(--dv-meta)}
.dv-ico svg{width:16px;height:16px}
.dv-mini.primary{background:var(--dv-ink);color:#fff;border-color:var(--dv-ink)}
.dv-mini.primary:hover{background:#000}
.dv-mini.primary:disabled{opacity:.5}
.dv-cust-edit{grid-column:1/-1;display:flex;flex-direction:column;gap:7px}
.dv-cl{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-meta);font-weight:600;margin-top:4px}
.dv-ci{height:36px;border:1px solid var(--dv-line);border-radius:8px;background:var(--dv-raise);color:var(--dv-ink);padding:0 11px;font-size:13.5px;font-family:inherit;outline:none;width:100%}
.dv-ci:focus{border-color:var(--dv-gold)}
.dv-crow{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dv-cust-edit .dv-cust-actions{border-top:none;padding-top:6px}

.dv-rail{flex:0 0 auto;padding:18px 24px 14px;display:flex;align-items:center;gap:18px}
.dv-track{flex:1;display:flex;gap:5px;align-items:flex-end;min-width:0}
.dv-seg{flex:1;text-align:left;min-width:0;padding-top:6px}
.dv-bar{height:2px;border-radius:99px;background:var(--dv-line);overflow:hidden;position:relative}
.dv-bar i{position:absolute;inset:0;width:0;border-radius:99px;transition:width .7s var(--dv-eo)}
.dv-lab{margin-top:9px;display:flex;align-items:center;gap:7px;font-family:var(--font-mono),"JetBrains Mono",monospace;font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--dv-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .25s}
.dv-seg:hover .dv-lab,.dv-seg.done .dv-lab{color:var(--dv-ink-soft)}
.dv-seg.current .dv-lab{color:var(--dv-ink)}
/* Stage markers — one shared status language across every Deck:
   white = not started · blinking yellow = being worked on · solid yellow = done/submitted
   · blinking red = needs approval or signature · green = complete. */
.dv-beacon{width:7px;height:7px;border-radius:99px;flex:0 0 auto;position:relative;
  background:#fff;border:1.5px solid var(--dv-faint);transition:background .3s,border-color .3s}
.dv-beacon.m-todo{background:#fff;border-color:var(--dv-faint)}
.dv-beacon.m-done{background:var(--dv-gold);border-color:var(--dv-gold-deep)}
.dv-beacon.m-complete{background:var(--dv-green);border-color:var(--dv-green)}
.dv-beacon.m-complete-unread{background:var(--dv-green);border-color:var(--dv-green);animation:dvBlinkG 1.25s ease-in-out infinite}
.dv-beacon.m-active{background:var(--dv-gold);border-color:var(--dv-gold-deep);animation:dvBlinkY 1.1s ease-in-out infinite}
.dv-beacon.m-attention{background:var(--dv-red,#C4553D);border-color:var(--dv-red,#C4553D);animation:dvBlinkR .8s ease-in-out infinite}
@keyframes dvBlinkY{0%,100%{box-shadow:0 0 0 0 rgba(201,169,110,.55)}50%{box-shadow:0 0 0 4px rgba(201,169,110,0)}}
@keyframes dvBlinkR{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(196,85,61,.6)}50%{opacity:.5;box-shadow:0 0 0 5px rgba(196,85,61,0)}}
@keyframes dvBlinkG{0%,100%{box-shadow:0 0 0 0 rgba(46,125,91,.55)}50%{box-shadow:0 0 0 4px rgba(46,125,91,0)}}
@media (prefers-reduced-motion:reduce){.dv-beacon.m-active,.dv-beacon.m-attention,.dv-beacon.m-complete-unread{animation:none}}
@keyframes dvbeat{0%,100%{opacity:1}55%{opacity:.35}}
@keyframes dvring{0%{transform:scale(.6);opacity:.7}70%,100%{transform:scale(1.7);opacity:0}}
.dv-readout{flex:0 0 auto;text-align:right;line-height:1}
.dv-readout .pct{font-size:20px;font-weight:700;letter-spacing:-.03em}
.dv-readout .cap{font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--dv-faint);margin-top:5px}

.dv-deck{flex:1 1 auto;position:relative;overflow:hidden;touch-action:pan-y;cursor:default}
.dv-slide{position:absolute;top:0;left:0;height:100%;width:100%;will-change:transform,opacity}
.dv-pane{height:100%;display:flex;flex-direction:column;overflow:hidden}
.dv-pane-head,.dv-scroll,.dv-advance{width:100%;max-width:840px;margin-left:auto;margin-right:auto}
/* A merged stage page (wide) uses the FULL deck width, not the 840px reading column — the stage
   title and the content both span edge-to-edge (with page padding). */
.dv-pane.dv-wide .dv-pane-head,.dv-pane.dv-wide .dv-scroll,.dv-scroll.dv-scroll--wide{max-width:100%}
.dv-solo--wide{margin:0}
/* Stacked merged sections: each tool is a full-width, near-full-height panel — the whole tool, not a
   little card. You scroll the page from one to the next. */
.cx-merged{display:flex;flex-direction:column;gap:26px}
.cx-sec{display:flex;flex-direction:column}
.cx-sec-h{font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin:0 2px 12px}
.cx-sec-frame{position:relative;height:calc(100vh - 250px);min-height:480px;border:1px solid var(--dv-line,#E4E4DF);border-radius:16px;overflow:hidden;background:var(--dv-raise,#FBFBFA);display:flex;flex-direction:column}
.cx-sec-frame>*{flex:1;min-height:0}
@media (max-width:760px){.cx-sec-frame{height:calc(100vh - 210px);min-height:440px;border-radius:12px}}
.dv-pane-head{padding:26px 30px 18px;display:flex;align-items:flex-start;gap:14px}
.dv-stage-name{font-size:24px;font-weight:600;letter-spacing:-.03em}
.dv-flag{margin-left:auto;display:inline-flex;align-items:center;height:25px;padding:0 11px;border-radius:999px;font-size:9.5px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;font-family:var(--font-mono),"JetBrains Mono",monospace}
.f-pending{background:#EEF3F8;color:var(--dv-blue)}.f-reviewing,.f-finalizing{background:#FBF4E6;color:var(--dv-gold-deep)}.f-complete{background:#E9F3ED;color:var(--dv-green)}.f-locked{background:rgba(16,20,24,.04);color:var(--dv-faint)}
.dv-scroll{flex:1;overflow-y:auto;padding:2px 20px 16px;scrollbar-width:none}
.dv-scroll::-webkit-scrollbar{width:0;height:0;display:none}

.dv-tool{border-top:1px solid var(--dv-line-soft)}.dv-tool:first-child{border-top:none}
.dv-tool-row{width:100%;display:flex;align-items:center;gap:14px;padding:17px 6px;text-align:left;border-radius:10px;transition:background .16s;cursor:pointer}
.dv-tool-row:hover{background:rgba(16,20,24,.028)}
.dv-tool-row:hover .dv-tname{color:var(--dv-ink)}
.dv-tool.stub .dv-tool-row{cursor:default}.dv-tool.stub .dv-tool-row:hover{background:transparent}.dv-tool.stub{opacity:.42}
.dv-tmark{width:8px;height:8px;border-radius:99px;flex:0 0 auto;border:1.5px solid var(--dv-line);background:transparent}
.dv-tool.done .dv-tmark{background:var(--dv-green);border-color:var(--dv-green)}.dv-tool.active .dv-tmark{background:var(--dv-gold-deep);border-color:var(--dv-gold-deep)}
.dv-tname{font-size:15px;font-weight:500;letter-spacing:-.014em;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .16s}
.dv-caret{flex:0 0 auto;color:var(--dv-faint);transition:transform .3s var(--dv-e),color .16s}.dv-tool.open .dv-caret{transform:rotate(180deg)}
.dv-tool-row:hover .dv-caret{color:var(--dv-meta)}
.dv-tdetail{display:grid;grid-template-rows:0fr;transition:grid-template-rows .4s var(--dv-eo)}.dv-tool.open .dv-tdetail{grid-template-rows:1fr}
.dv-tdetail>div{overflow:hidden}
.dv-tinline{margin:0 6px 16px 28px;border:1px solid var(--dv-line);border-radius:12px;overflow:hidden;background:var(--dv-raise)}
.dv-solo{margin:0}
/* Legacy tool-card chrome (e.g. Details & Notes) mounted inside a light tool — flatten it to
   the deck's minimal look: no card border / gold rail / icon chip, title in the deck font. */
.pvx-deck .dv-tinline .pv-tool-panel{border:none;border-radius:0;background:transparent;overflow:visible}
.pvx-deck .dv-tinline .pv-tool-head{padding:0 0 12px}
.pvx-deck .dv-tinline .pv-tool-head:hover{background:none}
.pvx-deck .dv-tinline .pv-tool-icon{display:none}
.pvx-deck .dv-tinline .pv-tool-title{font-family:var(--font-sans),system-ui,sans-serif;font-weight:600;font-size:15px;letter-spacing:-.014em;color:var(--dv-ink)}
.pvx-deck .dv-tinline .pv-tool-sub{font-family:var(--font-sans),system-ui,sans-serif;color:var(--dv-meta)}
.pvx-deck .dv-tinline .pv-tool-body{border-top:1px solid var(--dv-line);padding:14px 0 0}
.dv-overlay{position:fixed;inset:0;z-index:200;background:var(--dv-paper);display:flex;flex-direction:column;animation:dvfade .2s var(--dv-eo)}
@keyframes dvfade{from{opacity:0}to{opacity:1}}
.dv-overlay-bar{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--dv-line);background:var(--dv-raise)}
.dv-overlay-bar b{font-size:15px;font-weight:600;letter-spacing:-.01em}
.dv-overlay-x{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:9px;background:var(--dv-ink);color:#fff;font-size:12.5px;font-weight:500}
.dv-overlay-x:hover{background:#000}
.dv-overlay-body{flex:1;min-height:0;overflow:hidden;position:relative;display:flex;flex-direction:column}
.dv-overlay-body>*{flex:1;min-height:0}
/* Embedded tools (Site Survey…) carry .pvx-scoped CSS that isn't present here — restyle the
   embed shell so its iframe fills the overlay instead of collapsing to a default 150px box. */
.dv-overlay-body .ss-embed{display:flex;flex-direction:column;height:100%;padding:0}
/* keep the tool's own control bar (mockup Upload/Layout/Cameras live here) but drop the
   redundant Full-screen button — the overlay is already full-screen. */
.dv-overlay-body .ss-embed-bar{flex:0 0 auto;padding:11px 18px;border-bottom:1px solid var(--dv-line);margin:0}
/* The survey's bar only holds a "Live survey editor" tag (redundant with the overlay title) —
   hide it; keep the mockup's bar since it carries the Upload/Layout/Cameras controls. */
.dv-overlay-body .ss-embed-bar:not(:has(.mk-controls)){display:none}
.dv-overlay-body .ss-embed-open{display:none}
.dv-overlay-body .ss-embed-frame{flex:1;width:100%;height:auto!important;min-height:0;border:none;background:var(--dv-raise);display:block}
/* Mobile: the map is the working surface. Stop the 50/50 flex split with the device roster —
   give the survey/tool the full screen and let the roster scroll beneath it (a sliver peeks to
   hint there's more below). Bigger canvas = room to place and aim icons with a finger. */
@media (max-width:700px){
  .dv-overlay-body{display:block;overflow-y:auto;-webkit-overflow-scrolling:touch}
  .dv-overlay-body>.ss-embed{height:calc(100dvh - 120px)}
  .dv-overlay-body>.sd-wrap{margin:0;border-left:0;border-right:0;border-radius:0}
}
/* Desktop Site Survey: the device roster (.sd-wrap) sits BELOW the map. Keep the map a FIXED-height
   header and scroll only the roster beneath it — if the whole overlay scrolled, the map's own
   wheel-zoom would eat the scroll and you couldn't move past it. Class-based (not :has) so it works
   everywhere. Mobile keeps its own rules above. */
@media (min-width:701px){
  .dv-overlay-body.survey .ss-tool-body{display:flex;flex-direction:column;overflow:hidden}
  .dv-overlay-body.survey .ss-tool-body>.ss-embed{flex:1 1 0;min-height:0;height:auto}
  .dv-overlay-body.survey .ss-tool-body>.sd-wrap{flex:0 0 auto;max-height:40vh;overflow-y:auto;margin-top:0}
}

.dv-advance{padding:16px 20px 26px;display:flex;align-items:center;gap:14px;border-top:1px solid var(--dv-line-soft);background:var(--dv-paper);flex:0 0 auto}
.dv-reason{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--dv-faint)}
.dv-reason svg{color:var(--dv-gold-deep)}.dv-reason.ok{color:var(--dv-green)}
.dv-log-btn{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:9px;border:1px solid var(--dv-line);color:var(--dv-meta);font-size:13px;font-weight:500;transition:border-color .14s,color .14s}
.dv-log-btn:hover{border-color:var(--dv-gold);color:var(--dv-gold-deep)}
.dv-adv-btn{margin-left:auto;display:inline-flex;align-items:center;gap:9px;height:44px;padding:0 20px;border-radius:12px;font-size:14px;font-weight:500;transition:transform .16s}
.dv-advance.ready .dv-adv-btn{background:var(--dv-ink);color:#fff}.dv-advance.ready .dv-adv-btn:hover{transform:translateY(-1px)}
.dv-advance.gated .dv-adv-btn{background:transparent;border:1px solid var(--dv-line);color:var(--dv-faint);cursor:not-allowed}

.dv-hint{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);z-index:35;font-family:var(--font-mono),"JetBrains Mono",monospace;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--dv-faint);transition:opacity .5s}
.dv-deck.moved .dv-hint{opacity:0}

.dv-slide[aria-hidden="false"] .dv-pane-head>*,.dv-slide[aria-hidden="false"] .dv-tool{animation:dvrise .55s var(--dv-eo) both}
.dv-slide[aria-hidden="false"] .dv-tool:nth-child(2){animation-delay:.06s}.dv-slide[aria-hidden="false"] .dv-tool:nth-child(3){animation-delay:.12s}
@keyframes dvrise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

@media (max-width:760px){.dv-top{padding:0 14px}.dv-jobbar{padding:4px 14px 0}.dv-title{font-size:19px}.dv-rail{padding:14px 14px 10px;gap:12px}.dv-seg .nm{display:none}.dv-pane-head{padding:20px 16px 14px}.dv-scroll{padding:2px 14px 14px}.dv-advance{padding:14px 14px 20px}}
/* Phones: compact status chip, single-column left-aligned contact fields, one-line icon row */
@media (max-width:560px){
  .dv-chip{font-size:9.5px;height:21px;padding:0 8px;gap:5px;letter-spacing:.04em}
  .dv-cust-in{margin:12px 14px 0;padding:16px;grid-template-columns:1fr;gap:14px}
  .dv-field dd{font-size:14px}
  .dv-cust-actions{flex-wrap:nowrap;gap:6px;justify-content:flex-start;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .dv-cust-actions .dv-ico{width:34px;flex:0 0 auto}
}
@media (prefers-reduced-motion:reduce){.dv-shell *{transition-duration:.01ms!important;animation-duration:.01ms!important}}
`;

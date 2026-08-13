"use client";
import { useState, useRef, useEffect, useCallback } from "react";

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
export default function DeckView({ stages = [], idx = 0, onIdx, canAdvance = true, customer = null, menu = [], roleLabel = "Admin view" }) {
  const N = stages.length;
  const [drag, setDrag] = useState(0);
  const [openTool, setOpenTool] = useState({});      // { [stageIdx]: toolIdx | null }
  const [overlay, setOverlay] = useState(null);      // { i, ti, name } — Open launches the tool full-screen
  const [custOpen, setCustOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moved, setMoved] = useState(false);
  const deckRef = useRef(null);
  const startX = useRef(null);
  const capturing = useRef(false);
  const wheelLock = useRef(false);

  const go = useCallback((i) => { const n = Math.max(0, Math.min(N - 1, i)); setMoved(true); onIdx ? onIdx(n) : null; }, [N, onIdx]);

  // ── drag ── capture only AFTER a real horizontal move, so taps still fire the button click
  function onPointerDown(e) {
    if (e.target.closest("[data-stop]")) return;
    startX.current = e.clientX; capturing.current = false;
  }
  function onPointerMove(e) {
    if (startX.current == null) return;
    const dx = e.clientX - startX.current;
    if (!capturing.current && Math.abs(dx) > 5) { capturing.current = true; deckRef.current?.setPointerCapture?.(e.pointerId); }
    if (capturing.current) setDrag(dx);
  }
  function endDrag() {
    if (startX.current == null) return;
    const w = deckRef.current?.offsetWidth || 1, d = drag, thr = Math.min(110, w * 0.16);
    const wasDrag = capturing.current;
    startX.current = null; capturing.current = false; setDrag(0);
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
      transform: `translate(-50%,0) translateX(${p * 100}%)`,
      opacity: drag ? 1 : a < 1 ? 1 : 0,
      visibility: hidden ? "hidden" : "visible",
      zIndex: a < 1 ? 10 : 1,
      transition: drag ? "none" : "transform .6s var(--dv-eo), opacity .45s var(--dv-eo)",
    };
  };

  const cur = stages[idx] || {};
  const turnText = cur.turn === "customer" ? "Waiting on customer" : cur.turn === "mine" ? `Next · ${cur.need || ""}` : (cur.need || "");

  return (
    <div className="dv-shell" data-tint={cur.tint || "ink"}>
      {/* top bar */}
      <header className="dv-top">
        <div className="dv-logo">IOT <em>TECHS</em></div>
        <div className="dv-sp" />
        <button className="dv-ghost dv-solid">{roleLabel}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg></button>
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
        <span className="dv-chip live"><i className="dv-dot" />Active</span>
        <span className={`dv-status ${cur.turn}`}><i />{turnText}</span>

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
            {(customer.fields || []).map((f, i) => (
              <div className="dv-field" key={i}><dt>{f.k}</dt><dd>{f.v}{f.sub && <small>{f.sub}</small>}</dd></div>
            ))}
            {customer.actions?.length > 0 && (
              <div className="dv-cust-actions">
                {customer.actions.map((a, i) => <a className="dv-mini" key={i} href={a.href || undefined}>{a.label}</a>)}
              </div>
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
                <div className="dv-lab"><span className="dv-beacon" /><b>{done ? "✓" : i + 1}</b><span className="nm">{s.name}</span></div>
              </button>
            );
          })}
        </div>
        <div className="dv-readout"><div className="pct mono">{cur.pct}%</div><div className="cap mono">{cur.name}</div></div>
      </nav>

      {/* deck */}
      <main className={`dv-deck${moved ? " moved" : ""}`} id="dv-deck" tabIndex={0} ref={deckRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onWheel={onWheel}>
        {!moved && <div className="dv-hint mono">drag · scroll · ← →</div>}
        {stages.map((s, i) => (
          <div className="dv-slide" key={i} style={slideStyle(i)} aria-hidden={i !== idx}>
            <div className="dv-pane">
              <div className="dv-pane-head">
                <div className="dv-stage-name">{s.name}</div>
                <span className={`dv-flag f-${(s.pill || "").toLowerCase()}`}>{s.pill}</span>
              </div>
              {s.completion ? (
                <div className="dv-scroll">{s.completion}</div>
              ) : (
                <>
                  <div className="dv-scroll">
                    {(s.tools || []).map((t, ti) => {
                      const open = openTool[i] === ti;
                      return (
                        <div className={`dv-tool ${t.state || ""}${open ? " open" : ""}`} key={ti}>
                          <button className="dv-tool-row" onClick={() => setOpenTool((o) => ({ ...o, [i]: open ? null : ti }))}>
                            <span className="dv-tmark" />
                            <span className="dv-tname">{t.name}</span>
                            <span className="dv-caret"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg></span>
                          </button>
                          <div className="dv-tdetail"><div><div className="dv-embed">
                            <div className="dv-embed-slot"><span className="dv-etitle mono">{t.label || t.name}</span>
                              <button className="dv-embed-open" data-stop onClick={() => t.node && setOverlay({ i, ti, name: t.name })}>Open
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button></div>
                          </div></div></div>
                        </div>
                      );
                    })}
                  </div>
                  {s.advance && (
                    <div className={`dv-advance${s.advance.ready && canAdvance ? " ready" : " gated"}`}>
                      {s.advance.ready && canAdvance
                        ? <span className="dv-reason ok">Ready to advance</span>
                        : <span className="dv-reason"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>{s.advance.reason || "Not ready"}</span>}
                      <button className="dv-adv-btn" data-stop disabled={!(s.advance.ready && canAdvance)} onClick={() => go(idx + 1)}>Continue to {s.advance.to}
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
                    </div>
                  )}
                </>
              )}
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
          <div className="dv-overlay-body">{stages[overlay.i]?.tools?.[overlay.ti]?.node}</div>
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
.dv-logo{font-weight:700;letter-spacing:-.02em;font-size:15px}.dv-logo em{font-style:normal;color:var(--dv-gold-deep)}
.dv-sp{flex:1}
.dv-ghost{display:flex;align-items:center;gap:7px;height:32px;padding:0 11px;border-radius:9px;font-size:12.5px;font-weight:500;color:var(--dv-ink-soft)}
.dv-solid{background:var(--dv-ink);color:#fff}

.dv-jobbar{flex:0 0 auto;padding:6px 24px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dv-identity{display:flex;align-items:center;gap:12px;padding:8px 12px 8px 10px;margin-left:-10px;border-radius:12px;transition:background .18s}
.dv-identity:hover{background:rgba(16,20,24,.04)}
.dv-code{font-size:11px;letter-spacing:.09em;color:var(--dv-meta);padding:5px 8px;border:1px solid var(--dv-line);border-radius:7px}
.dv-title{font-size:23px;font-weight:600;letter-spacing:-.028em;margin:0}
.dv-chev{color:var(--dv-faint);transition:transform .34s var(--dv-e)}.dv-chev.up{transform:rotate(180deg);color:var(--dv-ink)}
.dv-chip{display:inline-flex;align-items:center;gap:6px;height:23px;padding:0 9px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
.dv-chip.live{background:#E9F3ED;color:var(--dv-green)}
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
.dv-cust-actions{display:flex;gap:8px;flex-wrap:wrap;grid-column:1/-1;padding-top:4px;border-top:1px solid var(--dv-line-soft)}
.dv-mini{display:inline-flex;align-items:center;gap:7px;height:31px;padding:0 12px;border-radius:9px;border:1px solid var(--dv-line);font-size:12.5px;font-weight:500;color:var(--dv-ink-soft);background:var(--dv-paper);text-decoration:none}
.dv-mini:hover{border-color:var(--dv-ink);color:var(--dv-ink)}

.dv-rail{flex:0 0 auto;padding:18px 24px 14px;display:flex;align-items:center;gap:18px}
.dv-track{flex:1;display:flex;gap:5px;align-items:flex-end;min-width:0}
.dv-seg{flex:1;text-align:left;min-width:0;padding-top:6px}
.dv-bar{height:2px;border-radius:99px;background:var(--dv-line);overflow:hidden;position:relative}
.dv-bar i{position:absolute;inset:0;width:0;border-radius:99px;transition:width .7s var(--dv-eo)}
.dv-lab{margin-top:9px;display:flex;align-items:center;gap:7px;font-family:var(--font-mono),"JetBrains Mono",monospace;font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--dv-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .25s}
.dv-seg:hover .dv-lab,.dv-seg.done .dv-lab{color:var(--dv-ink-soft)}
.dv-seg.current .dv-lab{color:var(--dv-ink)}
.dv-beacon{width:6px;height:6px;border-radius:99px;flex:0 0 auto;background:transparent;position:relative;transform:scale(.4);transition:transform .35s var(--dv-eo)}
.dv-seg.current .dv-beacon{background:var(--dv-gold-deep);transform:scale(1);animation:dvbeat 1.9s var(--dv-e) infinite}
.dv-seg.current .dv-beacon::after{content:'';position:absolute;inset:-3px;border-radius:99px;border:1.5px solid var(--dv-gold-deep);animation:dvring 1.9s var(--dv-e) infinite}
.dv-seg.done .dv-beacon{background:var(--dv-green);transform:scale(1)}
@keyframes dvbeat{0%,100%{opacity:1}55%{opacity:.35}}
@keyframes dvring{0%{transform:scale(.6);opacity:.7}70%,100%{transform:scale(1.7);opacity:0}}
.dv-readout{flex:0 0 auto;text-align:right;line-height:1}
.dv-readout .pct{font-size:20px;font-weight:700;letter-spacing:-.03em}
.dv-readout .cap{font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--dv-faint);margin-top:5px}

.dv-deck{flex:1 1 auto;position:relative;overflow:hidden;touch-action:pan-y;cursor:grab}
.dv-deck:active{cursor:grabbing}
.dv-slide{position:absolute;top:0;left:50%;height:100%;width:100%;will-change:transform,opacity}
.dv-pane{height:100%;display:flex;flex-direction:column;overflow:hidden}
.dv-pane-head,.dv-scroll,.dv-advance{width:100%;max-width:840px;margin-left:auto;margin-right:auto}
.dv-pane-head{padding:26px 30px 18px;display:flex;align-items:flex-start;gap:14px}
.dv-stage-name{font-size:24px;font-weight:600;letter-spacing:-.03em}
.dv-flag{margin-left:auto;display:inline-flex;align-items:center;height:25px;padding:0 11px;border-radius:999px;font-size:9.5px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;font-family:var(--font-mono),"JetBrains Mono",monospace}
.f-pending{background:#EEF3F8;color:var(--dv-blue)}.f-reviewing,.f-finalizing{background:#FBF4E6;color:var(--dv-gold-deep)}.f-complete{background:#E9F3ED;color:var(--dv-green)}.f-locked{background:rgba(16,20,24,.04);color:var(--dv-faint)}
.dv-scroll{flex:1;overflow-y:auto;padding:2px 20px 16px;-webkit-mask-image:linear-gradient(180deg,transparent,#000 14px,#000 calc(100% - 20px),transparent);mask-image:linear-gradient(180deg,transparent,#000 14px,#000 calc(100% - 20px),transparent)}

.dv-tool{border-top:1px solid var(--dv-line-soft)}.dv-tool:first-child{border-top:none}
.dv-tool-row{width:100%;display:flex;align-items:center;gap:14px;padding:17px 6px;text-align:left;border-radius:10px;transition:background .16s}
.dv-tool-row:hover{background:rgba(16,20,24,.028)}
.dv-tmark{width:8px;height:8px;border-radius:99px;flex:0 0 auto;border:1.5px solid var(--dv-line);background:transparent}
.dv-tool.done .dv-tmark{background:var(--dv-green);border-color:var(--dv-green)}.dv-tool.active .dv-tmark{background:var(--dv-gold-deep);border-color:var(--dv-gold-deep)}
.dv-tname{font-size:15px;font-weight:500;letter-spacing:-.014em;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dv-caret{flex:0 0 auto;color:var(--dv-faint);transition:transform .3s var(--dv-e)}.dv-tool.open .dv-caret{transform:rotate(180deg)}
.dv-tdetail{display:grid;grid-template-rows:0fr;transition:grid-template-rows .4s var(--dv-eo)}.dv-tool.open .dv-tdetail{grid-template-rows:1fr}
.dv-tdetail>div{overflow:hidden}
.dv-embed{padding:0 6px 16px 28px}
.dv-embed-slot{border:1px solid var(--dv-line);border-radius:12px;padding:16px 18px;display:flex;align-items:center;gap:14px;background:var(--dv-raise)}
.dv-etitle{flex:1;min-width:0;font-size:13px;font-weight:500;color:var(--dv-meta);letter-spacing:.01em}
.dv-embed-open{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 16px;border-radius:9px;background:var(--dv-ink);color:#fff;font-size:12.5px;font-weight:500}
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
.dv-overlay-body .ss-embed-bar{display:none}
.dv-overlay-body .ss-embed-frame{flex:1;width:100%;height:auto;min-height:0;border:none;background:var(--dv-raise);display:block}

.dv-advance{padding:16px 20px 26px;display:flex;align-items:center;gap:14px;border-top:1px solid var(--dv-line-soft)}
.dv-reason{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--dv-faint)}
.dv-reason svg{color:var(--dv-gold-deep)}.dv-reason.ok{color:var(--dv-green)}
.dv-adv-btn{margin-left:auto;display:inline-flex;align-items:center;gap:9px;height:44px;padding:0 20px;border-radius:12px;font-size:14px;font-weight:500;transition:transform .16s}
.dv-advance.ready .dv-adv-btn{background:var(--dv-ink);color:#fff}.dv-advance.ready .dv-adv-btn:hover{transform:translateY(-1px)}
.dv-advance.gated .dv-adv-btn{background:transparent;border:1px solid var(--dv-line);color:var(--dv-faint);cursor:not-allowed}

.dv-hint{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);z-index:35;font-family:var(--font-mono),"JetBrains Mono",monospace;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--dv-faint);transition:opacity .5s}
.dv-deck.moved .dv-hint{opacity:0}

.dv-slide[aria-hidden="false"] .dv-pane-head>*,.dv-slide[aria-hidden="false"] .dv-tool{animation:dvrise .55s var(--dv-eo) both}
.dv-slide[aria-hidden="false"] .dv-tool:nth-child(2){animation-delay:.06s}.dv-slide[aria-hidden="false"] .dv-tool:nth-child(3){animation-delay:.12s}
@keyframes dvrise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

@media (max-width:760px){.dv-top{padding:0 14px}.dv-jobbar{padding:4px 14px 0}.dv-title{font-size:19px}.dv-rail{padding:14px 14px 10px;gap:12px}.dv-seg .nm{display:none}.dv-pane-head{padding:20px 16px 14px}.dv-scroll{padding:2px 14px 14px}.dv-advance{padding:14px 14px 20px}}
@media (prefers-reduced-motion:reduce){.dv-shell *{transition-duration:.01ms!important;animation-duration:.01ms!important}}
`;

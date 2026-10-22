"use client";
import { useRef, useState } from "react";

// Reusable AI command surface — the generic bar + preview/confirm/disambiguate UI, with NO domain
// knowledge. A host (the proposal bar today; scheduling / inventory / etc. later) supplies the callbacks:
//   interpret(text)      → a result object (shapes below); read-only, previews nothing is written
//   onNavigate(result)   → perform a navigation result
//   onApply(result)      → commit a write result; returns { ok, message } | { error }
//   onPick(result, id)   → resolve a disambiguation by candidate id; returns a new (write) result | { error }
// Result shapes it renders:
//   { kind:"navigate", label, more }                       → one-tap open chip
//   { kind:"write", preview:{ title, before?, after?, body? } } → preview card + Apply/Cancel
//   { kind:"disambiguate", action, candidates:[{id,label}] }    → pick list
//   { kind:"message", tone:"muted"|"err"|"ok", text }           → inline line
// Anything else from interpret (none/unsupported/unknown with a `speak`) is shown as a muted message.

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CommandSurface({ enabled = true, placeholder, interpret, onNavigate, onApply, onPick }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);      // active result awaiting a decision
  const [msg, setMsg] = useState(null);      // { tone, text }
  const inputRef = useRef(null);
  if (!enabled) return null;

  const reset = () => { setRes(null); setText(""); };
  const show = (r) => {
    if (!r) return;
    if (r.error) { setMsg({ tone: "err", text: r.error }); return; }
    if (r.kind === "navigate" || r.kind === "write" || r.kind === "disambiguate") { setRes(r); setMsg(null); return; }
    // none / unsupported / unknown → a muted line
    setRes(null);
    setMsg({ tone: "muted", text: r.speak || (r.noKey
      ? "Add ANTHROPIC_API_KEY (Development ▸ API Keys) for free-form commands. Try: “add 8 cameras at $300”, “change the cameras to $275”, “15% discount”, “note: …”, “open <project>”."
      : "I didn’t catch a command I can run yet. Try “add 8 cameras at $300”, “change the cameras to $275”, “15% discount”, “note: …”, or “open <project>”.") });
  };

  async function submit(e) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setMsg(null); setRes(null);
    const r = await interpret(t).catch(() => ({ error: "Couldn’t reach the assistant." }));
    setBusy(false);
    show(r);
  }

  async function apply() {
    if (!res || busy) return;
    setBusy(true);
    try {
      if (res.kind === "navigate") { onNavigate?.(res); reset(); return; }
      const r = await onApply(res).catch(() => ({ error: "Couldn’t apply that." }));
      if (r?.error) { setMsg({ tone: "err", text: r.error }); return; }
      setMsg({ tone: "ok", text: r?.message || "Done." });
      reset();
    } finally { setBusy(false); }
  }

  async function pick(id) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await onPick(res, id).catch(() => ({ error: "Couldn’t resolve that." }));
      setBusy(false);
      show(r);
    } finally { setBusy(false); }
  }

  return (
    <div className="aicb">
      <style>{CSS}</style>
      <form className="aicb-row" onSubmit={submit}>
        <span className="aicb-spark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>
        </span>
        <input ref={inputRef} className="aicb-in" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="AI command" disabled={busy} />
        <button type="submit" className="aicb-go" disabled={busy || !text.trim()} aria-label="Run">
          {busy ? "…" : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
        </button>
      </form>

      {res?.kind === "navigate" && (
        <div className="aicb-card">
          <button type="button" className="aicb-nav" onClick={apply} disabled={busy}>Open {res.label} →</button>
          {res.more > 0 && <span className="aicb-hint">+{res.more} more match{res.more > 1 ? "es" : ""}</span>}
          <button type="button" className="aicb-x" onClick={reset} aria-label="Dismiss">×</button>
        </div>
      )}

      {res?.kind === "write" && (
        <div className="aicb-card">
          <div className="aicb-prev">
            <b>{res.preview.title}</b>
            {res.preview.before != null && res.preview.after != null && (
              <span className="aicb-tot">Total {money(res.preview.before)} → <b>{money(res.preview.after)}</b></span>
            )}
            {res.preview.body && <span className="aicb-note">{res.preview.body}</span>}
          </div>
          <button type="button" className="aicb-apply" onClick={apply} disabled={busy}>{res.applyLabel || "Apply"}</button>
          <button type="button" className="aicb-cancel" onClick={reset} disabled={busy}>Cancel</button>
        </div>
      )}

      {res?.kind === "disambiguate" && (
        <div className="aicb-card aicb-disam">
          <div className="aicb-prev"><b>Which one{res.action === "move" ? " to move" : " to rename"}?</b></div>
          <div className="aicb-cands">
            {res.candidates.map((c) => (
              <button key={c.id} type="button" className="aicb-cand" onClick={() => pick(c.id)} disabled={busy}>{c.label}</button>
            ))}
          </div>
          <button type="button" className="aicb-x" onClick={reset} aria-label="Dismiss">×</button>
        </div>
      )}

      {msg && <div className={`aicb-msg ${msg.tone}`}>{msg.text}</div>}
    </div>
  );
}

const CSS = `
.aicb{margin:10px 0 2px;display:flex;flex-direction:column;gap:8px}
.aicb-row{display:flex;align-items:center;gap:8px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;padding:7px 10px}
.aicb-spark{color:#C9A96E;display:flex}
.aicb-in{flex:1;min-width:0;border:0;background:transparent;outline:none;font-size:13px;color:var(--dv-ink,#1b1f2a)}
.aicb-in::placeholder{color:#9aa0ab}
.aicb-go{flex:none;width:30px;height:28px;border:0;border-radius:7px;background:#10204a;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
.aicb-go:disabled{opacity:.4;cursor:default}
.aicb-card{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-left:3px solid #C9A96E;border-radius:8px;padding:8px 10px}
.aicb-disam{align-items:flex-start}
.aicb-prev{display:flex;flex-direction:column;gap:2px;flex:1;min-width:140px;font-size:12.5px;color:var(--dv-ink,#1b1f2a)}
.aicb-tot{color:#4a5270;font-size:12px}
.aicb-note{color:#4a5270;font-size:12px;white-space:pre-wrap}
.aicb-cands{display:flex;flex-direction:column;gap:5px;flex:2;min-width:180px}
.aicb-cand{text-align:left;border:1px solid var(--dv-line,#E4E4DF);background:#fff;border-radius:7px;padding:6px 10px;font-size:12.5px;cursor:pointer;color:var(--dv-ink,#1b1f2a)}
.aicb-cand:hover{border-color:#C9A96E}
.aicb-apply,.aicb-nav{border:0;border-radius:7px;background:#1d7a3a;color:#fff;font-size:12.5px;padding:6px 12px;cursor:pointer}
.aicb-nav{background:#10204a}
.aicb-cancel,.aicb-x{border:0;background:transparent;color:#6a7085;font-size:12.5px;padding:6px 8px;cursor:pointer}
.aicb-x{font-size:16px;line-height:1}
.aicb-hint{color:#9aa0ab;font-size:11.5px}
.aicb-msg{font-size:12px;padding:0 2px}
.aicb-msg.err{color:#b23b3b}
.aicb-msg.ok{color:#1d7a3a}
.aicb-msg.muted{color:#6a7085}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]) .aicb-in,:root:not([data-theme="light"]) .aicb-prev{color:#e7e9ee}
  :root:not([data-theme="light"]) .aicb-cand{background:#1a1d27;color:#e7e9ee}
}
`;

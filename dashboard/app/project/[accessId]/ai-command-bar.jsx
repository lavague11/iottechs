"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { applyIntentToPayload } from "../../../lib/ai-command";
import { aiStatusAction, aiInterpretAction, aiApplyNoteAction, aiAuditAction } from "./ai-actions";

// Phase-1 AI command bar on the proposal builder. Text in → the server interprets (router first, Haiku
// fallback) → a PREVIEW for every write → one tap to apply. Proposal edits run through the builder's own
// validated autosave (patchPayload); notes go straight to the server. Nothing is applied without confirm.
// Renders only when the AI_COMMANDS flag is on and the caller is staff (aiStatusAction decides).

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AiCommandBar({ accessId, projectName, payload, patchPayload }) {
  const router = useRouter();
  const [status, setStatus] = useState(null);       // { enabled, hasKey }
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);             // interpret result awaiting confirm/dismiss
  const [msg, setMsg] = useState(null);             // transient outcome line
  const inputRef = useRef(null);

  useEffect(() => { let live = true; aiStatusAction().then((s) => live && setStatus(s)).catch(() => {}); return () => { live = false; }; }, []);
  if (!status?.enabled) return null;

  const reset = () => { setRes(null); setText(""); };

  async function interpret(e) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setMsg(null); setRes(null);
    const r = await aiInterpretAction(accessId, t, { projectName }).catch(() => ({ error: "Couldn't reach the assistant." }));
    setBusy(false);
    if (r?.error) { setMsg({ kind: "err", text: r.error }); return; }
    if (r.kind === "navigate") { setRes(r); return; }
    if (r.kind === "write") { setRes(r); return; }
    if (r.kind === "none") { setMsg({ kind: "muted", text: r.speak }); return; }
    if (r.kind === "unsupported") { setMsg({ kind: "muted", text: r.speak }); reset(); return; }
    setMsg({ kind: "muted", text: r.noKey ? "Add ANTHROPIC_API_KEY (Development ▸ API Keys) to understand free-form commands. Try: “add 8 cameras at $300”, “15% discount”, “note: …”, “open <project>”." : "I didn’t catch a command I can run yet. Try “add 8 cameras at $300”, “15% discount”, “note: …”, or “open <project>”." });
  }

  async function confirm() {
    if (!res || busy) return;
    setBusy(true);
    try {
      if (res.kind === "navigate") { router.push(res.href); reset(); return; }
      if (res.write === "proposal") {
        const applied = applyIntentToPayload(payload, res.intent);
        if (applied.error) { setMsg({ kind: "err", text: applied.error }); return; }
        patchPayload(applied.payload);                       // builder autosaves (role + payload validated server-side)
        await aiAuditAction(accessId, res.preview.title).catch(() => {});
        setMsg({ kind: "ok", text: `Applied — ${res.preview.title}` });
        reset();
        return;
      }
      if (res.write === "note") {
        const r = await aiApplyNoteAction(accessId, res.intent.body).catch(() => ({ error: "Couldn’t save the note." }));
        if (r?.error) { setMsg({ kind: "err", text: r.error }); return; }
        setMsg({ kind: "ok", text: "Note added to the Job Log." });
        reset();
        return;
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="aicb">
      <style>{CSS}</style>
      <form className="aicb-row" onSubmit={interpret}>
        <span className="aicb-spark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>
        </span>
        <input ref={inputRef} className="aicb-in" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Command the proposal — “add 8 cameras at $300”, “15% discount”, “note: …”, “open Crazy Cars”" aria-label="AI command" disabled={busy} />
        <button type="submit" className="aicb-go" disabled={busy || !text.trim()} aria-label="Run">
          {busy ? "…" : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          )}
        </button>
      </form>

      {res?.kind === "navigate" && (
        <div className="aicb-card">
          <button type="button" className="aicb-nav" onClick={confirm} disabled={busy}>Open {res.label} →</button>
          {res.more > 0 && <span className="aicb-hint">+{res.more} more match{res.more > 1 ? "es" : ""}</span>}
          <button type="button" className="aicb-x" onClick={reset} aria-label="Dismiss">×</button>
        </div>
      )}

      {res?.write === "proposal" && (
        <div className="aicb-card">
          <div className="aicb-prev">
            <b>{res.preview.title}</b>
            <span className="aicb-tot">Total {money(res.preview.before)} → <b>{money(res.preview.after)}</b></span>
          </div>
          <button type="button" className="aicb-apply" onClick={confirm} disabled={busy}>Apply</button>
          <button type="button" className="aicb-cancel" onClick={reset} disabled={busy}>Cancel</button>
        </div>
      )}

      {res?.write === "note" && (
        <div className="aicb-card">
          <div className="aicb-prev"><b>Add note</b><span className="aicb-note">{res.preview.body}</span></div>
          <button type="button" className="aicb-apply" onClick={confirm} disabled={busy}>Add</button>
          <button type="button" className="aicb-cancel" onClick={reset} disabled={busy}>Cancel</button>
        </div>
      )}

      {msg && <div className={`aicb-msg ${msg.kind}`}>{msg.text}</div>}
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
.aicb-prev{display:flex;flex-direction:column;gap:2px;flex:1;min-width:140px;font-size:12.5px;color:var(--dv-ink,#1b1f2a)}
.aicb-tot{color:#4a5270;font-size:12px}
.aicb-note{color:#4a5270;font-size:12px;white-space:pre-wrap}
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
  :root:not([data-theme="light"]) .aicb-in{color:#e7e9ee}
  :root:not([data-theme="light"]) .aicb-prev{color:#e7e9ee}
}
`;

"use client";
// #3 slice 2 — the CUSTOMER-facing assistant UI. Read-only: a small floating helper on the customer's own
// project view that calls the customer-gated server actions (aiCustomerStatusAction / aiCustomerInterpretAction).
// It renders NOTHING unless the server says the feature is on AND the caller owns this project (flag
// AI_CUSTOMER, default off) — so there is zero exposure until the owner enables it. No writes, no voice.
import { useState, useEffect, useRef } from "react";
import { aiCustomerStatusAction, aiCustomerInterpretAction, aiCustomerCommentAction, aiCustomerFeedbackAction } from "./ai-actions";

const CSS = `
.cust-ai{position:fixed;right:18px;bottom:18px;z-index:60;font:14px/1.45 system-ui,-apple-system,sans-serif}
.cust-ai-fab{display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border-radius:999px;border:1px solid rgba(185,138,46,.5);
  background:#14181c;color:#e8c061;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35)}
.cust-ai-fab:hover{background:#1a1f24}
.cust-ai-fab svg{width:16px;height:16px}
.cust-ai-panel{width:min(360px,calc(100vw - 32px));height:440px;max-height:calc(100vh - 36px);display:flex;flex-direction:column;
  background:#101418;border:1px solid rgba(255,255,255,.1);border-radius:14px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.45)}
.cust-ai-head{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.08);
  color:#e8c061;font-weight:600;letter-spacing:.02em}
.cust-ai-head button{background:none;border:0;color:rgba(255,255,255,.6);font-size:20px;line-height:1;cursor:pointer;padding:0 2px}
.cust-ai-body{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:9px}
.cust-ai-hint{color:rgba(255,255,255,.55);margin:0}
.cust-ai-msg{padding:8px 11px;border-radius:10px;max-width:88%;white-space:pre-wrap;word-break:break-word}
.cust-ai-msg.you{align-self:flex-end;background:#2a2118;color:#f2d9a8}
.cust-ai-msg.ai{align-self:flex-start;background:#181d22;color:rgba(255,255,255,.9)}
.cust-ai-msg a{color:#e8c061;font-weight:600;text-decoration:none}
.cust-ai-confirm{margin-top:8px}
.cust-ai-confirm-body{font-style:italic;color:rgba(255,255,255,.75);margin-bottom:7px}
.cust-ai-confirm-btns{display:flex;gap:7px}
.cust-ai-confirm-btns button{padding:6px 13px;border-radius:8px;border:0;background:#b98a2e;color:#101418;font-weight:600;cursor:pointer}
.cust-ai-confirm-btns button.ghost{background:transparent;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.8)}
.cust-ai-confirm-btns button:disabled{opacity:.5;cursor:default}
.cust-ai-input{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(255,255,255,.08)}
.cust-ai-input input{flex:1;min-width:0;background:#0b0e11;border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:9px 11px;color:#fff}
.cust-ai-input input:focus{outline:none;border-color:rgba(185,138,46,.6)}
.cust-ai-input button{width:40px;border:0;border-radius:9px;background:#b98a2e;color:#101418;font-size:16px;font-weight:700;cursor:pointer}
.cust-ai-input button:disabled{opacity:.4;cursor:default}
`;

export default function CustomerAssistant({ accessId }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState([]);   // { role:"you"|"ai", text, link? }
  const bodyRef = useRef(null);

  useEffect(() => {
    let live = true;
    aiCustomerStatusAction(accessId).then((s) => { if (live) setEnabled(!!s?.enabled); }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);
  useEffect(() => { const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, busy]);

  if (!enabled) return null;

  async function ask(e) {
    e?.preventDefault?.();
    const text = q.trim();
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: "you", text }]);
    setQ(""); setBusy(true);
    try {
      const r = await aiCustomerInterpretAction(accessId, text);
      if (r?.kind === "navigate") {
        setMsgs((m) => [...m, { role: "ai", text: r.speak || "Here you go.", link: { href: r.href, label: r.label, nav: true } }]);
      } else if (r?.kind === "write" && r.write === "comment") {
        setMsgs((m) => [...m, { role: "ai", text: r.preview?.title || "Send this to your project team?", confirm: { kind: "comment", body: r.body } }]);
      } else if (r?.kind === "write" && r.write === "objection") {
        // #7 — a concern/change-request. Show the coverage explanation (if any) + offer to share it with the team.
        setMsgs((m) => [...m, { role: "ai", text: r.speak || r.preview?.title || "Share this concern with your team?",
          confirm: { kind: "objection", body: r.body, feedbackKind: r.feedbackKind, deviceId: r.deviceId, deviceLabel: r.deviceLabel } }]);
      } else {
        setMsgs((m) => [...m, { role: "ai", text: r?.speak || r?.error || "I didn't catch that — try rephrasing.", link: r?.link || null }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "Something went wrong — please try again." }]);
    } finally { setBusy(false); }
  }

  // Confirm/cancel a customer write — a relayed comment or (#7) a captured objection/concern. The server action
  // re-gates and is the real boundary; this just dispatches the one the preview asked for.
  async function sendConfirm(confirm, idx) {
    if (busy || !confirm) return;
    setBusy(true);
    try {
      const r = confirm.kind === "objection"
        ? await aiCustomerFeedbackAction(accessId, { body: confirm.body, feedbackKind: confirm.feedbackKind, deviceId: confirm.deviceId, deviceLabel: confirm.deviceLabel })
        : await aiCustomerCommentAction(accessId, confirm.body);
      setMsgs((m) => m.map((x, i) => (i === idx ? { role: "ai", text: r?.message || r?.error || "Done." } : x)));
    } catch {
      setMsgs((m) => m.map((x, i) => (i === idx ? { role: "ai", text: "Couldn't send — please try again." } : x)));
    } finally { setBusy(false); }
  }
  function cancelConfirm(idx) { setMsgs((m) => m.map((x, i) => (i === idx ? { role: "ai", text: "Okay — I won't send that." } : x))); }

  return (
    <div className="cust-ai">
      <style>{CSS}</style>
      {!open && (
        <button className="cust-ai-fab" onClick={() => setOpen(true)} aria-label="Ask about your project">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.6-.8L3 21l1.8-5.9a8.5 8.5 0 0 1-.8-3.6A8.38 8.38 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z"/></svg>
          Ask
        </button>
      )}
      {open && (
        <div className="cust-ai-panel" role="dialog" aria-label="Project assistant">
          <div className="cust-ai-head"><span>Project assistant</span><button onClick={() => setOpen(false)} aria-label="Close">×</button></div>
          <div className="cust-ai-body" ref={bodyRef}>
            {msgs.length === 0 && <p className="cust-ai-hint">Ask about your project — its status, your quote, your balance, or what your cameras cover.</p>}
            {msgs.map((m, i) => (
              <div key={i} className={`cust-ai-msg ${m.role}`}>
                {m.text}
                {m.link && <> <a href={m.link.href} {...(m.link.nav ? {} : { target: "_blank", rel: "noopener" })}>{m.link.label} →</a></>}
                {m.confirm && (
                  <div className="cust-ai-confirm">
                    <div className="cust-ai-confirm-body">“{m.confirm.body}”</div>
                    <div className="cust-ai-confirm-btns">
                      <button type="button" disabled={busy} onClick={() => sendConfirm(m.confirm, i)}>Send</button>
                      <button type="button" className="ghost" disabled={busy} onClick={() => cancelConfirm(i)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="cust-ai-msg ai" aria-live="polite">…</div>}
          </div>
          <form className="cust-ai-input" onSubmit={ask}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question" maxLength={300} aria-label="Ask a question" autoComplete="off" />
            <button type="submit" disabled={busy || !q.trim()} aria-label="Send">→</button>
          </form>
        </div>
      )}
    </div>
  );
}

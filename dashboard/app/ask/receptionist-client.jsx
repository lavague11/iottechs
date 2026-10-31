"use client";
// Item 2 — the PUBLIC receptionist chat. Talks only to /api/receptionist (deterministic, server-gated behind
// MAYA_RECEPTIONIST). Holds a tiny capture state (need/name/contact) the server re-validates; renders the
// stored thread on load so a refresh keeps the conversation. No account, no project data.
import { useEffect, useRef, useState } from "react";

const CSS = `
.rx{max-width:640px;margin:0 auto;display:flex;flex-direction:column;height:100dvh}
.rx-head{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)}
.rx-dot{width:9px;height:9px;border-radius:50%;background:#49d17a;box-shadow:0 0 0 4px rgba(73,209,122,.14)}
.rx-title{font-weight:700;letter-spacing:.02em;color:#e8c061}
.rx-sub{color:rgba(255,255,255,.5);font-size:13px}
.rx-body{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:10px}
.rx-msg{padding:10px 13px;border-radius:12px;max-width:84%;white-space:pre-wrap;word-break:break-word;font-size:15px;line-height:1.5}
.rx-msg.you{align-self:flex-end;background:#2a2118;color:#f2d9a8;border-bottom-right-radius:4px}
.rx-msg.ai{align-self:flex-start;background:#181d22;color:rgba(255,255,255,.92);border-bottom-left-radius:4px}
.rx-msg a{color:#e8c061;font-weight:600;text-decoration:none}
.rx-form{display:flex;gap:9px;padding:14px 16px;border-top:1px solid rgba(255,255,255,.08)}
.rx-form input{flex:1;min-width:0;background:#0b0e11;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 14px;color:#fff;font-size:15px}
.rx-form input:focus{outline:none;border-color:rgba(185,138,46,.6)}
.rx-form button{width:46px;border:0;border-radius:10px;background:#b98a2e;color:#101418;font-size:18px;font-weight:700;cursor:pointer}
.rx-form button:disabled{opacity:.4;cursor:default}
`;

export default function Receptionist() {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [msgs, setMsgs] = useState([]);   // { role:"you"|"ai", text, link? }
  const [lead, setLead] = useState({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    let live = true;
    fetch("/api/receptionist").then((r) => r.json()).then((s) => {
      if (!live) return;
      setEnabled(!!s?.enabled);
      if (s?.thread?.length) setMsgs(s.thread.map((m) => ({ role: m.role, text: m.text })));
      setReady(true);
    }).catch(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  useEffect(() => { const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, busy]);

  async function send(e) {
    e?.preventDefault?.();
    const text = q.trim();
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: "you", text }]);
    setQ(""); setBusy(true);
    try {
      const r = await fetch("/api/receptionist", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, lead }),
      }).then((x) => x.json());
      if (r?.lead) setLead(r.done ? {} : r.lead);
      setMsgs((m) => [...m, { role: "ai", text: r?.reply || r?.error || "Sorry — please try again.", link: r?.link || null }]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "Something went wrong — please try again." }]);
    } finally { setBusy(false); }
  }

  if (!ready) return null;
  if (!enabled) return <div className="rx"><style>{CSS}</style><div className="rx-body"><div className="rx-msg ai">Our assistant is offline right now — please call or email us and we'll be glad to help.</div></div></div>;

  return (
    <div className="rx">
      <style>{CSS}</style>
      <div className="rx-head">
        <span className="rx-dot" />
        <div><div className="rx-title">Maya</div><div className="rx-sub">IOT Techs — how can we help?</div></div>
      </div>
      <div className="rx-body" ref={bodyRef}>
        {msgs.length === 0 && (
          <div className="rx-msg ai">Hi — I'm Maya. Ask about our camera, alarm, access-control, networking, or audio/TV services, or tell me what you need and I'll set up a free quote.</div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`rx-msg ${m.role}`}>
            {m.text}
            {m.link && <> <a href={m.link.href}>{m.link.label} →</a></>}
          </div>
        ))}
        {busy && <div className="rx-msg ai" aria-live="polite">…</div>}
      </div>
      <form className="rx-form" onSubmit={send}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a message" maxLength={500} aria-label="Message" autoComplete="off" autoFocus />
        <button type="submit" disabled={busy || !q.trim()} aria-label="Send">→</button>
      </form>
    </div>
  );
}

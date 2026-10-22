"use client";
import { useEffect, useRef, useState } from "react";
import { speechSupport, createRecognizer, readRecognition, speak, stopSpeaking, summarizeForSpeech, voiceDecision } from "../../../lib/voice";

// Reusable AI command surface — the generic bar + preview/confirm/disambiguate UI AND the three voice
// modes, with NO domain knowledge. A host supplies the callbacks:
//   interpret(text, { recent }) → a result object (shapes below); read-only
//   onNavigate(result)          → perform a navigation result
//   onApply(result)             → commit a write result; returns { ok, message } | { error }
//   onPick(result, id)          → resolve a disambiguation by candidate id; returns a new result | { error }
// Modes (only offered when the browser supports SpeechRecognition):
//   text  — type OR dictate into the field, review, then send (nothing auto-submits)
//   talk  — push-to-talk: speak one command, it's submitted and the reply is SPOKEN; "confirm"/"cancel" by voice
//   chat  — conversation: keeps listening, speaks each reply, voice confirm/cancel, follow-ups carry context
// Result shapes: { kind:"navigate", label, more } · { kind:"write", preview:{title,before?,after?,body?} } ·
//   { kind:"disambiguate", action, candidates:[{id,label}] } · else a muted/`speak` message.

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CommandSurface({ enabled = true, placeholder, interpret, onNavigate, onApply, onPick }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);        // active result awaiting a decision
  const [msg, setMsg] = useState(null);        // { tone, text }
  const [support, setSupport] = useState({ recognition: false, synthesis: false });
  const [mode, setMode] = useState("text");    // text | talk | chat
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const recRef = useRef(null);       // active SpeechRecognition
  const resRef = useRef(null);       // latest res (for recognition callbacks)
  const modeRef = useRef("text");
  const convRef = useRef(false);     // conversation session active
  const recentRef = useRef(null);    // last command summary → follow-up context

  useEffect(() => { setSupport(speechSupport()); return () => { try { recRef.current?.stop(); } catch {} stopSpeaking(); }; }, []);
  useEffect(() => { resRef.current = res; }, [res]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  if (!enabled) return null;

  const voiceMode = () => modeRef.current === "talk" || modeRef.current === "chat";
  const reset = () => { setRes(null); setText(""); };

  const show = (r) => {
    if (!r) return null;
    if (r.error) { setMsg({ tone: "err", text: r.error }); return r; }
    if (r.kind === "navigate" || r.kind === "write" || r.kind === "disambiguate") { setRes(r); setMsg(null); return r; }
    setRes(null);
    setMsg({ tone: "muted", text: r.speak || (r.noKey
      ? "Add ANTHROPIC_API_KEY (Development ▸ API Keys) for free-form commands."
      : "I didn’t catch a command I can run yet. Try “add 8 cameras at $300”, “rewrite the pool camera”, “15% discount”, or “take me to the proposal”.") });
    return r;
  };

  // ---- core (shared by typing + voice) ----
  async function runInterpret(t) {
    const q = String(t || "").trim();
    if (!q || busy) return null;
    setBusy(true); setMsg(null); setRes(null);
    const r = await interpret(q, { recent: recentRef.current }).catch(() => ({ error: "Couldn’t reach the assistant." }));
    setBusy(false);
    recentRef.current = (r && !r.error && (r.preview?.title || r.label)) ? (r.preview?.title || `open ${r.label}`) : recentRef.current;
    return show(r);
  }
  async function submit(e) { e?.preventDefault(); await runInterpret(text); }

  async function apply() {
    const r = resRef.current; if (!r || busy) return;
    setBusy(true);
    try {
      if (r.kind === "navigate") { onNavigate?.(r); reset(); return { ok: true, message: `Opening ${r.label}` }; }
      const out = await onApply(r).catch(() => ({ error: "Couldn’t apply that." }));
      if (out?.error) { setMsg({ tone: "err", text: out.error }); return out; }
      setMsg({ tone: "ok", text: out?.message || "Done." });
      reset();
      return out;
    } finally { setBusy(false); }
  }

  async function pick(id) {
    if (busy) return;
    setBusy(true);
    try { const r = await onPick(resRef.current, id).catch(() => ({ error: "Couldn’t resolve that." })); setBusy(false); return show(r); }
    finally { setBusy(false); }
  }

  // ---- recognition plumbing ----
  function stopListening() { const r = recRef.current; recRef.current = null; if (r) { try { r.onend = null; r.stop(); } catch {} } setListening(false); }
  function listen({ continuous = false, onFinal, onEnd }) {
    stopListening(); stopSpeaking();
    const r = createRecognizer({ continuous, interim: true });
    if (!r) { setMsg({ tone: "err", text: "Voice input isn’t available in this browser." }); return null; }
    recRef.current = r; setListening(true);
    r.onresult = (e) => { const { interim, final } = readRecognition(e); if (interim) setText(interim); if (final) { setText(final); onFinal?.(final); } };
    r.onerror = (e) => { setListening(false); if (e?.error === "not-allowed" || e?.error === "service-not-allowed") setMsg({ tone: "err", text: "Microphone blocked — allow mic access to use voice." }); };
    r.onend = () => { setListening(false); recRef.current = null; onEnd?.(); };
    try { r.start(); } catch { setListening(false); }
    return r;
  }

  const say = (t, after) => { if (!support.synthesis) { after?.(); return; } setSpeaking(true); speak(t, { onEnd: () => { setSpeaking(false); after?.(); } }); };

  // Dictation (text mode): fill the field, let the user review + send.
  function dictate() { if (listening) { stopListening(); return; } listen({ onFinal: () => {} }); }

  // Push-to-talk: speak one command → submit → SPEAK the reply → listen once for confirm/cancel.
  function pushToTalk() {
    if (listening) { stopListening(); return; }
    listen({ onFinal: async (t) => {
      const r = await runInterpret(t);
      say(summarizeForSpeech(r), () => { if (r && (r.kind === "write" || r.kind === "navigate" || r.kind === "disambiguate")) confirmListen(); });
    } });
  }

  // Listen once for a spoken decision while a change is pending.
  function confirmListen() {
    listen({ onFinal: async (t) => {
      const d = voiceDecision(t);
      if (!d) return;
      if (d.kind === "confirm") { const out = await apply(); say(out?.message || "Done"); }
      else if (d.kind === "cancel") { reset(); say("Cancelled"); }
      else if (d.kind === "pick") { const r = resRef.current; const cand = r?.candidates?.[d.index - 1]; if (cand) { const nr = await pick(cand.id); say(summarizeForSpeech(nr), () => nr?.kind === "write" && confirmListen()); } }
    } });
  }

  // Conversation: keep listening; each utterance is a decision (if pending) or a new command.
  function toggleConversation() {
    if (convRef.current) { convRef.current = false; stopListening(); stopSpeaking(); return; }
    convRef.current = true;
    const loop = () => {
      if (!convRef.current) return;
      listen({ continuous: false, onEnd: () => { if (convRef.current && !speaking && !busy) setTimeout(loop, 250); }, onFinal: async (t) => {
        const pending = resRef.current;
        const d = pending ? voiceDecision(t) : null;
        if (d?.kind === "confirm") { const out = await apply(); say(out?.message || "Done"); return; }
        if (d?.kind === "cancel") { reset(); say("Cancelled"); return; }
        if (d?.kind === "pick") { const cand = pending?.candidates?.[d.index - 1]; if (cand) { const nr = await pick(cand.id); say(summarizeForSpeech(nr)); } return; }
        const r = await runInterpret(t);
        say(summarizeForSpeech(r));
      } });
    };
    loop();
  }

  const onMic = () => (modeRef.current === "chat" ? toggleConversation() : modeRef.current === "talk" ? pushToTalk() : dictate());
  const switchMode = (m) => { convRef.current = false; stopListening(); stopSpeaking(); setMode(m); };
  const micLabel = mode === "chat" ? (listening || convRef.current ? "Stop conversation" : "Start conversation") : mode === "talk" ? (listening ? "Stop" : "Push to talk") : (listening ? "Stop dictation" : "Dictate");

  return (
    <div className="aicb">
      <style>{CSS}</style>
      {support.recognition && (
        <div className="aicb-modes" role="tablist" aria-label="Command mode">
          {[["text", "Text", Keyboard], ["talk", "Talk", MicIcon], ["chat", "Conversation", Chat]].map(([m, lbl, Ico]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={`aicb-mode${mode === m ? " on" : ""}`} title={lbl} onClick={() => switchMode(m)}><Ico />{lbl}</button>
          ))}
        </div>
      )}
      <form className="aicb-row" onSubmit={submit}>
        <span className="aicb-spark" aria-hidden="true"><Spark /></span>
        <input className="aicb-in" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={listening ? "Listening…" : placeholder} aria-label="AI command" disabled={busy} />
        {support.recognition && (
          <button type="button" className={`aicb-mic${listening ? " live" : ""}${speaking ? " speaking" : ""}`} aria-label={micLabel} title={micLabel} onClick={onMic} disabled={busy && !listening}><MicIcon /></button>
        )}
        <button type="submit" className="aicb-go" disabled={busy || !text.trim()} aria-label="Run">{busy ? "…" : <Arrow />}</button>
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
            {res.preview.before != null && res.preview.after != null && <span className="aicb-tot">Total {money(res.preview.before)} → <b>{money(res.preview.after)}</b></span>}
            {res.preview.body && <span className="aicb-note">{res.preview.body}</span>}
          </div>
          <button type="button" className="aicb-apply" onClick={apply} disabled={busy}>Apply</button>
          <button type="button" className="aicb-cancel" onClick={reset} disabled={busy}>Cancel</button>
        </div>
      )}
      {res?.kind === "disambiguate" && (
        <div className="aicb-card aicb-disam">
          <div className="aicb-prev"><b>Which one{res.action === "move" ? " to move" : " to rename"}?</b></div>
          <div className="aicb-cands">{res.candidates.map((c, i) => (
            <button key={c.id} type="button" className="aicb-cand" onClick={() => pick(c.id)} disabled={busy}><span className="aicb-candn">{i + 1}</span>{c.label}</button>
          ))}</div>
          <button type="button" className="aicb-x" onClick={reset} aria-label="Dismiss">×</button>
        </div>
      )}

      {(listening || speaking) && <div className="aicb-voice">{speaking ? "Speaking…" : mode === "chat" ? "Conversation — listening…" : "Listening…"}</div>}
      {msg && <div className={`aicb-msg ${msg.tone}`}>{msg.text}</div>}
    </div>
  );
}

/* icons */
const Spark = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>;
const Arrow = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
const MicIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const Keyboard = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></svg>;
const Chat = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;

const CSS = `
.aicb{margin:10px 0 2px;display:flex;flex-direction:column;gap:8px}
.aicb-modes{display:flex;gap:4px}
.aicb-mode{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:#6a7085;border-radius:999px;font-size:11.5px;padding:3px 10px;cursor:pointer}
.aicb-mode.on{background:#10204a;color:#fff;border-color:#10204a}
.aicb-row{display:flex;align-items:center;gap:8px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;padding:7px 10px}
.aicb-spark{color:#C9A96E;display:flex}
.aicb-in{flex:1;min-width:0;border:0;background:transparent;outline:none;font-size:13px;color:var(--dv-ink,#1b1f2a)}
.aicb-in::placeholder{color:#9aa0ab}
.aicb-mic{flex:none;width:30px;height:28px;border:0;border-radius:7px;background:transparent;color:#6a7085;display:flex;align-items:center;justify-content:center;cursor:pointer}
.aicb-mic:hover{background:#eef0f3}
.aicb-mic.live{background:#D64545;color:#fff;animation:aicb-pulse 1.1s ease-in-out infinite}
.aicb-mic.speaking{background:#C9A96E;color:#fff}
@keyframes aicb-pulse{0%,100%{box-shadow:0 0 0 0 rgba(214,69,69,.5)}50%{box-shadow:0 0 0 5px rgba(214,69,69,0)}}
.aicb-go{flex:none;width:30px;height:28px;border:0;border-radius:7px;background:#10204a;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
.aicb-go:disabled{opacity:.4;cursor:default}
.aicb-card{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-left:3px solid #C9A96E;border-radius:8px;padding:8px 10px}
.aicb-disam{align-items:flex-start}
.aicb-prev{display:flex;flex-direction:column;gap:2px;flex:1;min-width:140px;font-size:12.5px;color:var(--dv-ink,#1b1f2a)}
.aicb-tot{color:#4a5270;font-size:12px}
.aicb-note{color:#4a5270;font-size:12px;white-space:pre-wrap}
.aicb-cands{display:flex;flex-direction:column;gap:5px;flex:2;min-width:180px}
.aicb-cand{display:flex;align-items:center;gap:7px;text-align:left;border:1px solid var(--dv-line,#E4E4DF);background:#fff;border-radius:7px;padding:6px 10px;font-size:12.5px;cursor:pointer;color:var(--dv-ink,#1b1f2a)}
.aicb-cand:hover{border-color:#C9A96E}
.aicb-candn{flex:none;width:17px;height:17px;border-radius:50%;background:#10204a;color:#fff;font-size:10.5px;display:inline-flex;align-items:center;justify-content:center}
.aicb-apply,.aicb-nav{border:0;border-radius:7px;background:#1d7a3a;color:#fff;font-size:12.5px;padding:6px 12px;cursor:pointer}
.aicb-nav{background:#10204a}
.aicb-cancel,.aicb-x{border:0;background:transparent;color:#6a7085;font-size:12.5px;padding:6px 8px;cursor:pointer}
.aicb-x{font-size:16px;line-height:1}
.aicb-hint{color:#9aa0ab;font-size:11.5px}
.aicb-voice{font-size:11.5px;color:#C9A96E;padding:0 2px}
.aicb-msg{font-size:12px;padding:0 2px}
.aicb-msg.err{color:#b23b3b}
.aicb-msg.ok{color:#1d7a3a}
.aicb-msg.muted{color:#6a7085}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]) .aicb-in,:root:not([data-theme="light"]) .aicb-prev{color:#e7e9ee}
  :root:not([data-theme="light"]) .aicb-cand{background:#1a1d27;color:#e7e9ee}
}
`;

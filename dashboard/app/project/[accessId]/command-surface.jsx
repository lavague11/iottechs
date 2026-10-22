"use client";
import { useEffect, useRef, useState } from "react";
import { speechSupport, createRecognizer, readRecognition, speak, stopSpeaking, startMeter, summarizeForSpeech, voiceDecision } from "../../../lib/voice";

// Reusable AI command surface — a minimal, conversational assistant: a compact composer (mode toggle +
// one input) that stays small at rest and grows a chat thread ABOVE it only once there's a conversation,
// preview, or live voice state. Domain-agnostic; the host supplies the callbacks:
//   interpret(text, { recent }) → a result object (shapes below); read-only
//   onNavigate(result)          → perform a navigation result
//   onApply(result)             → commit a write result; returns { ok, message } | { error }
//   onPick(result, id)          → resolve a disambiguation by candidate id; returns a new result | { error }
// Modes (only offered when the browser supports SpeechRecognition):
//   text — type OR dictate into the field, review, then send   ·   talk — push-to-talk, reply spoken
//   chat — conversation: keeps listening, speaks each reply, voice confirm/cancel, follow-ups carry context
// Result shapes: { kind:"navigate", label, more } · { kind:"write", preview:{title,before?,after?,body?} } ·
//   { kind:"disambiguate", action, candidates:[{id,label}] } · else a muted/`speak` message.

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DEFAULT_MISS = "I couldn’t do that one yet. Try a command, or a place to go.";

export default function CommandSurface({ enabled = true, placeholder = "Ask anything…", interpret, onNavigate, onApply, onPick }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);   // interpret in flight → "Thinking…"
  const [turns, setTurns] = useState([]);             // transcript: { id, role, text?, res? }
  const [pending, setPending] = useState(null);       // { id, res } — the single actionable awaiting a decision
  const [support, setSupport] = useState({ recognition: false, synthesis: false });
  const [mode, setMode] = useState("text");           // text | talk | chat
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");         // live recognized words (talk/chat)
  const [levels, setLevels] = useState(null);         // real mic levels (array) or null when unmetered

  const recRef = useRef(null);       // active SpeechRecognition
  const meterRef = useRef(null);     // active mic meter
  const resRef = useRef(null);       // pending.res (for recognition callbacks)
  const pendRef = useRef(null);      // pending (for recognition callbacks)
  const modeRef = useRef("text");
  const convRef = useRef(false);     // conversation session active
  const recentRef = useRef(null);    // last command summary → follow-up context
  const threadRef = useRef(null);
  const idc = useRef(0);
  const nid = () => `t${Date.now()}_${idc.current++}`;

  useEffect(() => { setSupport(speechSupport()); return () => { try { recRef.current?.stop(); } catch {} try { meterRef.current?.stop(); } catch {} stopSpeaking(); }; }, []);
  useEffect(() => { resRef.current = pending?.res || null; pendRef.current = pending; }, [pending]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  // Keep the newest turn / live state in view, input stays anchored below.
  useEffect(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; }, [turns, thinking, listening, speaking, interim, levels]);
  if (!enabled) return null;

  const addTurn = (turn) => setTurns((ts) => [...ts, { id: nid(), ...turn }]);
  const sysMsg = (tone, text) => addTurn({ role: "assistant", res: { kind: "message", tone, text } });

  // Render a raw result into the thread + set/clear the actionable pending.
  function present(r) {
    if (!r) return null;
    if (r.error) { sysMsg("err", r.error); setPending(null); return r; }
    if (r.kind === "navigate" || r.kind === "write" || r.kind === "disambiguate") {
      const id = nid();
      setTurns((ts) => [...ts, { id, role: "assistant", res: r }]);
      setPending({ id, res: r });
      return r;
    }
    sysMsg("muted", r.speak || (r.noKey ? "Add ANTHROPIC_API_KEY (Dev ▸ API Keys) for free-form commands." : DEFAULT_MISS));
    setPending(null);
    return r;
  }

  // ---- core (shared by typing + voice) ----
  async function runInterpret(t) {
    const q = String(t || "").trim();
    if (!q || busy) return null;
    addTurn({ role: "user", text: q });
    setText(""); setInterim("");
    setBusy(true); setThinking(true);
    const r = await interpret(q, { recent: recentRef.current }).catch(() => ({ error: "Couldn’t reach the assistant." }));
    setBusy(false); setThinking(false);
    recentRef.current = (r && !r.error && (r.preview?.title || r.label)) ? (r.preview?.title || `open ${r.label}`) : recentRef.current;
    return present(r);
  }
  async function submit(e) { e?.preventDefault(); await runInterpret(text); }

  async function apply() {
    const p = pendRef.current; if (!p || busy) return;
    const r = p.res;
    setBusy(true);
    try {
      if (r.kind === "navigate") { onNavigate?.(r); setPending(null); sysMsg("ok", `Opening ${r.label}.`); return { ok: true, message: `Opening ${r.label}` }; }
      const out = await onApply(r).catch(() => ({ error: "Couldn’t apply that." }));
      setPending(null);
      if (out?.error) { sysMsg("err", out.error); return out; }
      sysMsg("ok", out?.message || "Done.");
      return out;
    } finally { setBusy(false); }
  }

  function dismiss() { setPending(null); setText(""); setInterim(""); sysMsg("muted", "Cancelled."); }

  async function pick(id) {
    if (busy) return;
    setBusy(true);
    try { const r = await onPick(resRef.current, id).catch(() => ({ error: "Couldn’t resolve that." })); setPending(null); setBusy(false); return present(r); }
    finally { setBusy(false); }
  }

  // ---- recognition + metering ----
  function stopListening() {
    const r = recRef.current; recRef.current = null; if (r) { try { r.onend = null; r.stop(); } catch {} }
    try { meterRef.current?.stop(); } catch {} meterRef.current = null;
    setListening(false); setLevels(null);
  }
  function listen({ continuous = false, toField = false, onFinal, onEnd }) {
    stopListening(); stopSpeaking();
    const r = createRecognizer({ continuous, interim: true });
    if (!r) { sysMsg("err", "Voice input isn’t available in this browser."); return null; }
    recRef.current = r; setListening(true); setInterim("");
    // Honest levels: tap the real mic. null (blocked/denied) → the UI shows a non-reactive listening state.
    startMeter(5).then((m) => { if (!recRef.current) { m?.stop(); return; } meterRef.current = m; if (m) { setLevels([0, 0, 0, 0, 0]); m.onLevels((lv) => setLevels(lv)); } }).catch(() => {});
    r.onresult = (e) => { const { interim: iv, final } = readRecognition(e); if (iv) (toField ? setText(iv) : setInterim(iv)); if (final) { toField ? setText(final) : setInterim(final); onFinal?.(final); } };
    r.onerror = (e) => { setListening(false); if (e?.error === "not-allowed" || e?.error === "service-not-allowed") sysMsg("err", "Microphone blocked — allow mic access to use voice."); };
    r.onend = () => { setListening(false); try { meterRef.current?.stop(); } catch {} meterRef.current = null; setLevels(null); recRef.current = null; onEnd?.(); };
    try { r.start(); } catch { setListening(false); }
    return r;
  }

  const say = (t, after) => { if (!support.synthesis || !t) { after?.(); return; } setSpeaking(true); speak(t, { onEnd: () => { setSpeaking(false); after?.(); } }); };
  const interrupt = () => { stopSpeaking(); setSpeaking(false); };

  // text mode: dictation fills the field for review + send. talk/chat: interim shows in the live bubble.
  function dictate() { if (listening) { stopListening(); return; } listen({ toField: true }); }
  function pushToTalk() {
    if (listening) { stopListening(); return; }
    listen({ onFinal: async (t) => { const r = await runInterpret(t); say(summarizeForSpeech(r), () => { if (r && (r.kind === "write" || r.kind === "navigate" || r.kind === "disambiguate")) confirmListen(); }); } });
  }
  function confirmListen() {
    listen({ onFinal: async (t) => {
      const d = voiceDecision(t); if (!d) return;
      if (d.kind === "confirm") { const out = await apply(); say(out?.message || "Done"); }
      else if (d.kind === "cancel") { dismiss(); say("Cancelled"); }
      else if (d.kind === "pick") { const r = resRef.current; const cand = r?.candidates?.[d.index - 1]; if (cand) { const nr = await pick(cand.id); say(summarizeForSpeech(nr), () => nr?.kind === "write" && confirmListen()); } }
    } });
  }
  function toggleConversation() {
    if (convRef.current) { convRef.current = false; stopListening(); stopSpeaking(); setSpeaking(false); return; }
    convRef.current = true;
    const loop = () => {
      if (!convRef.current) return;
      listen({ continuous: false, onEnd: () => { if (convRef.current && !speaking && !busy) setTimeout(loop, 250); }, onFinal: async (t) => {
        const p = pendRef.current;
        const d = p ? voiceDecision(t) : null;
        if (d?.kind === "confirm") { const out = await apply(); say(out?.message || "Done"); return; }
        if (d?.kind === "cancel") { dismiss(); say("Cancelled"); return; }
        if (d?.kind === "pick") { const cand = p?.res?.candidates?.[d.index - 1]; if (cand) { const nr = await pick(cand.id); say(summarizeForSpeech(nr)); } return; }
        const r = await runInterpret(t); say(summarizeForSpeech(r));
      } });
    };
    loop();
  }

  const onMic = () => (modeRef.current === "chat" ? toggleConversation() : modeRef.current === "talk" ? pushToTalk() : dictate());
  const switchMode = (m) => { convRef.current = false; stopListening(); stopSpeaking(); setSpeaking(false); setMode(m); };
  const micLabel = mode === "chat" ? (listening || convRef.current ? "Stop conversation" : "Start conversation") : mode === "talk" ? (listening ? "Stop" : "Push to talk") : (listening ? "Stop dictation" : "Dictate");
  const live = listening || thinking || speaking;
  const hasThread = turns.length > 0 || live;

  return (
    <div className={`aicb aicb-${mode}`}>
      <style>{CSS}</style>

      {hasThread && (
        <div className="aicb-thread" ref={threadRef} role="log" aria-live="polite">
          {turns.map((t) => (
            <div key={t.id} className={`aicb-turn ${t.role}`}>
              {t.role === "user" ? (
                <div className="aicb-user">{t.text}</div>
              ) : t.res?.kind === "message" ? (
                <div className={`aicb-asst ${t.res.tone}`}>{t.res.text}</div>
              ) : t.res?.kind === "navigate" ? (
                <div className="aicb-asst">
                  <div className="aicb-card">
                    <button type="button" className="aicb-nav" onClick={pending?.id === t.id ? apply : undefined} disabled={busy || pending?.id !== t.id}>Open {t.res.label} →</button>
                    {t.res.more > 0 && <span className="aicb-hint">+{t.res.more} more</span>}
                    {pending?.id === t.id && <button type="button" className="aicb-x" onClick={dismiss} aria-label="Dismiss">×</button>}
                  </div>
                </div>
              ) : t.res?.kind === "write" ? (
                <div className="aicb-asst">
                  <div className="aicb-card">
                    <div className="aicb-prev">
                      <b>{t.res.preview.title}</b>
                      {t.res.preview.before != null && t.res.preview.after != null && <span className="aicb-tot">Total {money(t.res.preview.before)} → <b>{money(t.res.preview.after)}</b></span>}
                      {t.res.preview.body && <span className="aicb-note">{t.res.preview.body}</span>}
                    </div>
                    {pending?.id === t.id && (
                      <div className="aicb-acts">
                        <button type="button" className="aicb-apply" onClick={apply} disabled={busy}>Apply</button>
                        <button type="button" className="aicb-cancel" onClick={dismiss} disabled={busy}>Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
              ) : t.res?.kind === "disambiguate" ? (
                <div className="aicb-asst">
                  <div className="aicb-card aicb-disam">
                    <div className="aicb-prev"><b>Which one{t.res.action === "move" ? " to move" : " to rename"}?</b></div>
                    <div className="aicb-cands">{t.res.candidates.map((c, i) => (
                      <button key={c.id} type="button" className="aicb-cand" onClick={pending?.id === t.id ? () => pick(c.id) : undefined} disabled={busy || pending?.id !== t.id}><span className="aicb-candn">{i + 1}</span>{c.label}</button>
                    ))}</div>
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          {live && (
            <div className={`aicb-vs ${speaking ? "speaking" : thinking ? "thinking" : "listening"}`}>
              {speaking ? (
                <><span className="aicb-bars anim">{[0, 1, 2, 3, 4].map((i) => <i key={i} />)}</span><span className="aicb-vslbl">Speaking…</span><button type="button" className="aicb-vstop" onClick={interrupt}>Stop</button></>
              ) : thinking ? (
                <><span className="aicb-dots"><i /><i /><i /></span><span className="aicb-vslbl">Thinking…</span></>
              ) : (
                <>
                  {levels ? <span className="aicb-bars">{(levels.length ? levels : [0, 0, 0, 0, 0]).map((v, i) => <i key={i} style={{ transform: `scaleY(${0.16 + Math.min(1, v) * 0.84})` }} />)}</span> : <span className="aicb-livedot" aria-hidden="true" />}
                  <span className="aicb-vslbl">{interim || (mode === "chat" ? "Listening — say a command…" : "Listening…")}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {support.recognition && (
        <div className="aicb-modes" role="tablist" aria-label="Mode">
          {[["text", "Text", Keyboard], ["talk", "Talk", MicIcon], ["chat", "Conversation", Chat]].map(([m, lbl, Ico]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={`aicb-mode${mode === m ? " on" : ""}`} onClick={() => switchMode(m)}><Ico />{lbl}</button>
          ))}
        </div>
      )}

      <form className="aicb-row" onSubmit={submit}>
        <span className="aicb-spark" aria-hidden="true"><Spark /></span>
        <input className="aicb-in" value={text} onChange={(e) => setText(e.target.value)} placeholder={listening && mode === "text" ? "Listening…" : placeholder} aria-label="Ask the assistant" disabled={busy} />
        {support.recognition && (
          <button type="button" className={`aicb-mic${listening ? " live" : ""}${speaking ? " speaking" : ""}`} aria-label={micLabel} title={micLabel} onClick={onMic} disabled={busy && !listening}><MicIcon /></button>
        )}
        <button type="submit" className="aicb-go" disabled={busy || !text.trim()} aria-label="Send"><Arrow /></button>
      </form>
    </div>
  );
}

/* icons */
const Spark = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>;
const Arrow = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11l5-5 5 5M12 6v13" /></svg>;
const MicIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const Keyboard = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></svg>;
const Chat = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;

const CSS = `
.aicb{display:flex;flex-direction:column;gap:9px}
.aicb-thread{display:flex;flex-direction:column;gap:9px;max-height:min(46vh,340px);overflow-y:auto;padding:2px 1px 3px;scroll-behavior:smooth}
.aicb-thread::-webkit-scrollbar{width:7px}.aicb-thread::-webkit-scrollbar-thumb{background:rgba(120,125,132,.28);border-radius:7px}
.aicb-turn{display:flex}
.aicb-turn.user{justify-content:flex-end}
.aicb-user{max-width:85%;background:#10204a;color:#fff;border-radius:13px 13px 3px 13px;padding:7px 12px;font-size:13px;line-height:1.4}
.aicb-asst{max-width:92%;font-size:13px;line-height:1.45;color:var(--dv-ink,#1b1f2a)}
.aicb-asst.err{color:#b23b3b}.aicb-asst.ok{color:#1d7a3a}.aicb-asst.muted{color:#6a7085}
.aicb-card{display:flex;align-items:center;gap:9px;flex-wrap:wrap;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;padding:9px 11px}
.aicb-disam{align-items:flex-start;flex-direction:column}
.aicb-prev{display:flex;flex-direction:column;gap:3px;flex:1;min-width:150px;font-size:12.5px;color:var(--dv-ink,#1b1f2a)}
.aicb-prev b{font-weight:650}
.aicb-tot{color:#4a5270;font-size:12px}
.aicb-note{color:#4a5270;font-size:12px;white-space:pre-wrap}
.aicb-acts{display:flex;gap:6px;margin-left:auto}
.aicb-cands{display:flex;flex-direction:column;gap:5px;width:100%}
.aicb-cand{display:flex;align-items:center;gap:8px;text-align:left;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-bg,#fff);border-radius:9px;padding:7px 10px;font-size:12.5px;cursor:pointer;color:var(--dv-ink,#1b1f2a)}
.aicb-cand:hover:not(:disabled){border-color:#C9A96E}.aicb-cand:disabled{cursor:default;opacity:.7}
.aicb-candn{flex:none;width:18px;height:18px;border-radius:50%;background:#10204a;color:#fff;font-size:10.5px;display:inline-flex;align-items:center;justify-content:center}
.aicb-apply,.aicb-nav{border:0;border-radius:8px;background:#1d7a3a;color:#fff;font-size:12.5px;font-weight:600;padding:7px 14px;cursor:pointer}
.aicb-nav{background:#10204a}
.aicb-apply:disabled,.aicb-nav:disabled{opacity:.45;cursor:default}
.aicb-cancel{border:0;background:transparent;color:#6a7085;font-size:12.5px;padding:7px 8px;cursor:pointer}
.aicb-x{border:0;background:transparent;color:#9aa0ab;font-size:17px;line-height:1;cursor:pointer;padding:0 4px;margin-left:auto}
.aicb-hint{color:#9aa0ab;font-size:11.5px}
/* live voice state — one calm row */
.aicb-vs{display:flex;align-items:center;gap:10px;padding:3px 2px}
.aicb-vslbl{font-size:12.5px;color:#6a7085;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aicb-vs.listening .aicb-vslbl{color:var(--dv-ink,#1b1f2a)}
.aicb-vstop{margin-left:auto;border:1px solid var(--dv-line,#E4E4DF);background:transparent;color:#6a7085;font-size:11.5px;border-radius:7px;padding:4px 10px;cursor:pointer}
.aicb-vstop:hover{border-color:#C9A96E;color:var(--dv-ink,#1b1f2a)}
/* real-level bars (listening) + self-animated bars (speaking) */
.aicb-bars{display:inline-flex;align-items:center;gap:3px;height:20px}
.aicb-bars i{width:3px;height:18px;border-radius:3px;background:#C9A96E;transform:scaleY(.16);transform-origin:center;transition:transform .08s linear}
.aicb-bars.anim i{animation:aicb-eq .9s ease-in-out infinite;transition:none}
.aicb-bars.anim i:nth-child(2){animation-delay:.15s}.aicb-bars.anim i:nth-child(3){animation-delay:.3s}.aicb-bars.anim i:nth-child(4){animation-delay:.45s}.aicb-bars.anim i:nth-child(5){animation-delay:.6s}
@keyframes aicb-eq{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
.aicb-livedot{width:9px;height:9px;border-radius:50%;background:#C9A96E;animation:aicb-breathe 1.3s ease-in-out infinite}
@keyframes aicb-breathe{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}
.aicb-dots{display:inline-flex;gap:4px}
.aicb-dots i{width:6px;height:6px;border-radius:50%;background:#C9A96E;animation:aicb-blink 1.1s ease-in-out infinite}
.aicb-dots i:nth-child(2){animation-delay:.18s}.aicb-dots i:nth-child(3){animation-delay:.36s}
@keyframes aicb-blink{0%,100%{opacity:.3}50%{opacity:1}}
/* composer */
.aicb-modes{display:inline-flex;gap:2px;background:var(--dv-paper,#F1F1EE);border-radius:999px;padding:2px;align-self:flex-start}
.aicb-mode{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:#6a7085;border-radius:999px;font-size:11.5px;padding:5px 11px;cursor:pointer;font-family:inherit}
.aicb-mode svg{opacity:.8}
.aicb-mode.on{background:var(--dv-bg,#fff);color:var(--dv-ink,#10204a);box-shadow:0 1px 3px rgba(16,32,74,.12);font-weight:600}
.aicb-row{display:flex;align-items:center;gap:8px;background:var(--dv-bg,#fff);border:1px solid var(--dv-line,#E4E4DF);border-radius:13px;padding:7px 9px 7px 12px;transition:border-color .15s,box-shadow .15s}
.aicb-row:focus-within{border-color:#C9A96E;box-shadow:0 0 0 3px rgba(201,169,110,.14)}
.aicb-spark{color:#C9A96E;display:flex}
.aicb-in{flex:1;min-width:0;border:0;background:transparent;outline:none;font-size:14px;color:var(--dv-ink,#1b1f2a)}
.aicb-in::placeholder{color:#9aa0ab}
.aicb-mic{flex:none;width:32px;height:30px;border:0;border-radius:9px;background:transparent;color:#6a7085;display:flex;align-items:center;justify-content:center;cursor:pointer}
.aicb-mic:hover{background:var(--dv-paper,#F1F1EE)}
.aicb-mic.live{background:#D64545;color:#fff;animation:aicb-pulse 1.2s ease-in-out infinite}
.aicb-mic.speaking{background:#C9A96E;color:#fff}
@keyframes aicb-pulse{0%,100%{box-shadow:0 0 0 0 rgba(214,69,69,.5)}50%{box-shadow:0 0 0 6px rgba(214,69,69,0)}}
.aicb-go{flex:none;width:32px;height:30px;border:0;border-radius:9px;background:#10204a;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:opacity .15s}
.aicb-go:disabled{opacity:.3;cursor:default}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]) .aicb-user{background:#2a52b8}
  :root:not([data-theme="light"]) .aicb-asst,:root:not([data-theme="light"]) .aicb-in,:root:not([data-theme="light"]) .aicb-prev{color:#e7e9ee}
  :root:not([data-theme="light"]) .aicb-cand{background:#1a1d27;color:#e7e9ee}
  :root:not([data-theme="light"]) .aicb-modes{background:#1a1d27}
  :root:not([data-theme="light"]) .aicb-mode.on{background:#262a36;color:#fff}
}
`;

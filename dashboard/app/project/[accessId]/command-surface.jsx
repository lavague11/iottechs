"use client";
import { useEffect, useRef, useState } from "react";
import { speechSupport, speak, speakNeural, stopSpeaking, startVoiceCapture, transcribeClip, summarizeForSpeech, voiceDecision } from "../../../lib/voice";
import { CONVO, NUDGE, LANGS, isNoise, parseVoiceControl } from "../../../lib/voice-convo";
import AICore from "../../components/ai-core";

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

// Neural-voice choices (OpenAI Realtime; the server whitelists these). Marin is OpenAI's recommended default.
const DEFAULT_VOICE = "marin";
const VOICES = [
  { id: "marin", label: "Marin", note: "Warm · recommended" },
  { id: "shimmer", label: "Shimmer", note: "Bright" },
  { id: "coral", label: "Coral", note: "Friendly" },
  { id: "sage", label: "Sage", note: "Calm" },
  { id: "cedar", label: "Cedar", note: "Deeper" },
  { id: "alloy", label: "Alloy", note: "Neutral" },
];
const VOICE_SAMPLE = "Hi, I'm your IOT Techs assistant. I can open projects, edit proposals, and more.";
const voiceLabel = (id) => (VOICES.find((v) => v.id === id) || VOICES[0]).label;
// Compact one-line detail for the diagnostics overlay (transcript already truncated upstream).
function diagDetail(d) {
  if (d == null) return "";
  if (typeof d !== "object") return String(d);
  const p = [];
  if (d.lang) p.push(d.lang);
  if (d.speechMs != null) p.push(d.speechMs + "ms");
  else if (d.ms != null) p.push(d.ms + "ms");
  if (d.bytes != null) p.push(Math.round(d.bytes / 1024) + "KB");
  if (d.reason) p.push(d.reason);
  if (d.text) p.push(`"${d.text}"`);
  return p.join(" ");
}

export default function CommandSurface({ enabled = true, placeholder = "Ask anything…", dock = "panel", projectName = "", interpret, onNavigate, onApply, onPick }) {
  const corebar = dock === "corebar";
  const [expanded, setExpanded] = useState(false);   // corebar: slim bar open vs collapsed to the core
  const [typing, setTyping] = useState(false);        // corebar: text input vs voice status
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);   // interpret in flight → "Thinking…"
  const [turns, setTurns] = useState([]);             // transcript: { id, role, text?, res? }
  const [pending, setPending] = useState(null);       // { id, res } — the single actionable awaiting a decision
  const [support, setSupport] = useState({ recognition: false, synthesis: false });
  const [voiceOk, setVoiceOk] = useState(false);     // mic capture available (getUserMedia + MediaRecorder)
  const [convoOn, setConvoOn] = useState(false);      // hands-free Conversation Mode on/off (drives the UI)
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");         // live recognized words (talk/chat)
  const [diagLog, setDiagLog] = useState([]);         // on-screen diagnostics ring buffer (opt-in, mobile)
  const [voice, setVoice] = useState(DEFAULT_VOICE);  // neural voice id (per-viewer, persisted)
  const [voiceOpen, setVoiceOpen] = useState(false);  // voice-picker popover
  const [previewing, setPreviewing] = useState(null); // voice id currently playing a sample
  const [levels, setLevels] = useState(null);         // real mic levels (array) or null when unmetered

  const captureRef = useRef(null);   // active Conversation-Mode voice capture (VAD + recorder)
  const dictCapRef = useRef(null);   // active one-shot dictation capture
  const resRef = useRef(null);       // pending.res (for recognition callbacks)
  const pendRef = useRef(null);      // pending (for recognition callbacks)
  const convRef = useRef(false);     // conversation session active
  const recentRef = useRef(null);    // last command summary → follow-up context
  // Rolling conversation memory: sticky context (active project, last customer, retrieved facts, pending
  // change) is always kept; the transcript is trimmed server-side to a char budget. Per-viewer only — it
  // never leaves this session, and the server re-authorizes every read against the signed-in user.
  const memRef = useRef({ project: null, customer: null, facts: [], pending: null, turns: [] });
  const pushTurn = (role, text) => { const t = String(text || "").slice(0, 200); if (!t) return; const m = memRef.current; m.turns.push({ role, text: t }); if (m.turns.length > 16) m.turns = m.turns.slice(-16); };
  const addFact = (f) => { const m = memRef.current; for (const x of [].concat(f || [])) if (x && !m.facts.includes(x)) m.facts.push(x); if (m.facts.length > 8) m.facts = m.facts.slice(-8); };
  const threadRef = useRef(null);
  const barInRef = useRef(null);     // corebar text input
  const idc = useRef(0);
  const sayCtlRef = useRef(null);    // active neural-voice controller (for interrupt/Stop)
  const voiceRef = useRef(DEFAULT_VOICE);
  const debugRef = useRef(false);    // conversation diagnostics → console
  const overlayRef = useRef(false);  // conversation diagnostics → on-screen overlay (mobile testing)
  const t0Ref = useRef(0);           // conversation start time, for relative diag timestamps
  // Lifecycle trace: speech start/end, transcription, command submit, AI reply, listening resume. OFF by
  // default; enabled in dev, or on a real device via ?aidebug=1 (overlay) / ?aidebug=console. Never logs
  // audio; a transcript is truncated so a misheard command is diagnosable without dumping sensitive text.
  const diag = (ev, data) => {
    if (!debugRef.current && !overlayRef.current) return;
    const ms = t0Ref.current ? Date.now() - t0Ref.current : 0;
    const d = data && typeof data === "object" ? { ...data } : data;
    if (d && typeof d.text === "string") d.text = d.text.slice(0, 48) + (d.text.length > 48 ? "…" : "");   // truncate — never dump full transcripts
    try { if (debugRef.current) console.log(`%c[convo +${ms}ms] ${ev}`, "color:#C9A96E;font-weight:600", d ?? ""); } catch {}
    if (overlayRef.current) setDiagLog((L) => [...L.slice(-11), { ms, ev, d }]);
  };
  // ---- Conversation-mode state machine (refs so recognition callbacks see the latest, never a stale closure).
  const phaseRef = useRef("idle");       // idle | listening | processing | speaking
  const bufferRef = useRef("");          // finalized words accumulated for the current utterance
  const interimRef = useRef("");          // the latest not-yet-final words (merged in when we endpoint)
  const endpointTimerRef = useRef(null);  // fires when the speaker has gone quiet long enough → process
  const nudgeTimerRef = useRef(null);     // 15s idle → "Anything else?"
  const idleTimerRef = useRef(null);      // 30s idle → end the conversation
  const nudgedRef = useRef(false);        // we only nudge once per idle stretch
  const bargeRef = useRef(true);          // allow speaking to be interrupted by genuine speech (configurable)
  const bargeCountRef = useRef(0);        // consecutive loud mic frames while speaking → a real barge-in
  const rateRef = useRef(1);              // spoken-reply playback rate ("slow down" / "speak faster")
  const langRef = useRef("en");           // active language for recognition + spoken replies
  const briefRef = useRef(false);         // "keep it short" preference
  const lastReplyRef = useRef("");        // last spoken reply, for "repeat that"
  const nid = () => `t${Date.now()}_${idc.current++}`;
  // Stop any speech in flight — the neural audio AND the browser voice.
  const stopSay = () => { try { sayCtlRef.current?.stop(); } catch {} sayCtlRef.current = null; stopSpeaking(); };

  useEffect(() => {
    setSupport(speechSupport());
    try { setVoiceOk(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"); } catch {}
    try { const b = localStorage.getItem("iot_ai_bargein"); if (b === "off") bargeRef.current = false; } catch {}
    // Diagnostics: ?aidebug=1 → on-screen overlay (persisted, for iPhone testing); =console → console only;
    // =0 → off. Falls back to localStorage, and console is always on in dev. Staff-gated via the whole assistant.
    try {
      const p = new URLSearchParams(window.location.search).get("aidebug");
      if (p != null) { localStorage.setItem("iot_ai_debug", p === "0" ? "off" : p === "console" ? "on" : "overlay"); }
      const flag = localStorage.getItem("iot_ai_debug");
      const dev = typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
      overlayRef.current = flag === "overlay";
      debugRef.current = dev || flag === "on" || flag === "overlay";
      if (overlayRef.current) setDiagLog((L) => (L.length ? L : [{ ms: 0, ev: "diagnostics_on", d: null }]));
    } catch {}
    return () => { convRef.current = false; clearConvoTimers(); try { captureRef.current?.stop(); } catch {} try { dictCapRef.current?.stop(); } catch {} stopSay(); };
  }, []);
  // Remember the chosen neural voice per viewer.
  useEffect(() => { try { const v = localStorage.getItem("iot_ai_voice"); if (v && VOICES.some((x) => x.id === v)) setVoice(v); } catch {} }, []);
  useEffect(() => { voiceRef.current = voice; }, [voice]);
  // Close the voice popover on an outside click.
  useEffect(() => {
    if (!voiceOpen) return;
    const onDown = (e) => { if (!e.target.closest?.(".aicb-voicewrap")) setVoiceOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [voiceOpen]);
  const chooseVoice = (id) => { setVoice(id); try { localStorage.setItem("iot_ai_voice", id); } catch {} };
  // Play a short sample in a voice so the user can audition before choosing.
  async function previewVoice(id) {
    stopSay(); setPreviewing(id);
    try { sayCtlRef.current = await speakNeural(VOICE_SAMPLE, { voice: id, onEnd: () => setPreviewing(null) }); }
    catch { setPreviewing(null); if (support.synthesis) speak(VOICE_SAMPLE, { onEnd: () => {} }); }
  }
  useEffect(() => { resRef.current = pending?.res || null; pendRef.current = pending; }, [pending]);
  // corebar: ⌘K / Ctrl-K toggles the slim bar open/closed (Esc minimizes). Self-contained so the shell stays thin.
  useEffect(() => {
    if (!corebar || !enabled) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setExpanded((o) => !o); }
      else if (e.key === "Escape" && expanded) setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [corebar, enabled, expanded]);
  // Resume a conversation handed off across a navigation (persistConvo stashed it just before the reload):
  // restore the thread + memory + voice and pick listening back up, so "open a project" doesn't end the chat.
  useEffect(() => {
    if (!voiceOk) return;
    let data; try { const raw = sessionStorage.getItem("iot_ai_convo"); if (!raw) return; data = JSON.parse(raw); sessionStorage.removeItem("iot_ai_convo"); } catch { return; }
    if (!data || data.mode !== "chat" || Date.now() - (data.ts || 0) > 60000) return;   // only a fresh hand-off
    if (Array.isArray(data.turns) && data.turns.length) setTurns(data.turns.map((t) => ({ id: nid(), role: t.role, text: t.text, res: t.res })));
    if (data.memory) memRef.current = { project: null, customer: null, facts: [], turns: [], ...data.memory, pending: null };
    if (data.voice && VOICES.some((v) => v.id === data.voice)) { setVoice(data.voice); voiceRef.current = data.voice; }
    if (corebar) setExpanded(true);   // reopen the slim bar on the new page
    const t = setTimeout(() => startConversation(), 400);   // mic permission already granted mid-conversation
    return () => clearTimeout(t);
  }, [voiceOk]);
  // Keep the newest turn / live state in view, input stays anchored below.
  useEffect(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; }, [turns, thinking, listening, speaking, interim, levels]);
  if (!enabled) return null;

  const addTurn = (turn) => setTurns((ts) => [...ts, { id: nid(), ...turn }]);
  const sysMsg = (tone, text) => addTurn({ role: "assistant", res: { kind: "message", tone, text } });

  // Render a raw result into the thread + set/clear the actionable pending, and keep memory current.
  function present(r) {
    if (!r) return null;
    if (r.error) { sysMsg("err", r.error); setPending(null); memRef.current.pending = null; pushTurn("assistant", r.error); return r; }
    // Safe navigation executes immediately in the corebar (no "open?" card); writes still confirm.
    if (r.kind === "navigate") {
      const mm = String(r.href || "").match(/\/project\/([A-Za-z0-9]+)/); if (mm) { memRef.current.project = { accessId: mm[1], name: r.label || mm[1] }; memRef.current.customer = r.label || memRef.current.customer; }
      memRef.current.pending = null;
      if (corebar) { if (convRef.current) persistConvo(); sysMsg("ok", `Opening ${r.label}.`); pushTurn("assistant", `(open ${r.label})`); onNavigate?.(r); return r; }
      const id = nid();
      setTurns((ts) => [...ts, { id, role: "assistant", res: r }]); setPending({ id, res: r });
      pushTurn("assistant", `(open ${r.label})`);
      return r;
    }
    if (r.kind === "write" || r.kind === "disambiguate") {
      const id = nid();
      setTurns((ts) => [...ts, { id, role: "assistant", res: r }]);
      setPending({ id, res: r });
      memRef.current.pending = r.preview?.title || "a pending change";
      pushTurn("assistant", r.preview?.title || "(pending change)");
      return r;
    }
    // Everything else — an answer, a clarification, or a miss — renders as an assistant line (no navigation).
    const text = r.speak || r.text || (r.noKey ? "Add ANTHROPIC_API_KEY (Dev ▸ API Keys) for free-form commands." : DEFAULT_MISS);
    sysMsg(r.kind === "answer" ? "ok" : "muted", text);
    if (r.kind === "answer") {
      addFact(r.facts);
      // An answer that resolved a project makes it the referent for a later "it"/"that customer".
      if (r.project?.accessId) { memRef.current.project = r.project; memRef.current.customer = r.project.name || memRef.current.customer; }
    }
    setPending(null); memRef.current.pending = null;
    pushTurn("assistant", text);
    return r;
  }

  // ---- core (shared by typing + voice) ----
  async function runInterpret(t) {
    const q = String(t || "").trim();
    if (!q || busy) return null;
    addTurn({ role: "user", text: q });
    pushTurn("user", q);
    setText(""); setInterim("");
    setBusy(true); setThinking(true);
    const m = memRef.current;
    const memory = { project: m.project, customer: m.customer, facts: m.facts.slice(-6), pending: m.pending, turns: m.turns.slice(-16) };
    const r = await interpret(q, { recent: recentRef.current, memory }).catch(() => ({ error: "Couldn’t reach the assistant." }));
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
      if (r.kind === "navigate") { onNavigate?.(r); setPending(null); memRef.current.pending = null; sysMsg("ok", `Opening ${r.label}.`); return { ok: true, message: `Opening ${r.label}` }; }
      const out = await onApply(r).catch(() => ({ error: "Couldn’t apply that." }));
      setPending(null); memRef.current.pending = null;
      if (out?.error) { sysMsg("err", out.error); return out; }
      sysMsg("ok", out?.message || "Done.");
      return out;
    } finally { setBusy(false); }
  }

  function dismiss() { setPending(null); memRef.current.pending = null; setText(""); setInterim(""); sysMsg("muted", "Cancelled."); }

  async function pick(id) {
    if (busy) return;
    setBusy(true);
    try { const r = await onPick(resRef.current, id).catch(() => ({ error: "Couldn’t resolve that." })); setPending(null); setBusy(false); return present(r); }
    finally { setBusy(false); }
  }

  // ---- mic capture (VAD + record → transcribe) ----
  function stopListening() {
    try { captureRef.current?.stop(); } catch {} captureRef.current = null;
    try { dictCapRef.current?.stop(); } catch {} dictCapRef.current = null;
    setListening(false); setLevels(null);
  }

  // Speak a reply with the NEURAL voice (OpenAI Realtime via /api/tts); fall back to the browser voice on
  // any failure (no key, offline, autoplay blocked). One `after` callback fires exactly once, whichever path
  // runs. sayCtlRef (declared above) holds the active neural controller so interrupt()/Stop can abort it.
  const say = (t, after) => {
    if (!t) { after?.(); return; }
    lastReplyRef.current = t;   // remember for "repeat that"
    setSpeaking(true);
    let fired = false;
    const done = () => { if (fired) return; fired = true; setSpeaking(false); after?.(); };
    speakNeural(t, { voice: voiceRef.current, rate: rateRef.current, lang: langRef.current, onEnd: done })
      .then((ctl) => { sayCtlRef.current = ctl; })
      .catch(() => { if (support.synthesis) speak(t, { rate: 0.97 * rateRef.current, onEnd: done }); else done(); });   // neural failed → browser voice
  };
  const interrupt = () => { stopSay(); setSpeaking(false); };

  // The in-input microphone DICTATES only — records one utterance, transcribes it (language auto-detected)
  // and fills the field for review + send. It NEVER auto-submits. Hands-free voice is Conversation Mode.
  async function dictate() {
    if (dictCapRef.current) { stopListening(); return; }
    setListening(true); setLevels([0, 0, 0, 0, 0]);
    const cap = await startVoiceCapture({
      getPhase: () => "listening",
      onLevels: (lv) => setLevels(lv),
      onUtterance: async (blob) => {
        stopListening(); setThinking(true);
        const r = await transcribeClip(blob).catch(() => null);
        setThinking(false);
        if (r?.text) { if (LANGS[r.language]) langRef.current = r.language; setText((prev) => (prev ? prev.trim() + " " : "") + r.text); }
      },
      silenceMs: 1500,
    });
    if (!cap) { setListening(false); setLevels(null); sysMsg("err", "Microphone unavailable — allow mic access to use voice."); return; }
    dictCapRef.current = cap;
  }
  // ---- Conversation mode: a real lifecycle (listening → processing → speaking → listening), not a
  // one-command box. One continuous recognizer runs for the whole session; WE decide when an utterance is
  // finished (a genuine pause), ignore noise/our own voice, keep the session open across actions, and close
  // only on an explicit stop or after a real idle timeout.
  function clearConvoTimers() {   // function declaration (hoisted) — the mount-cleanup effect runs before this line
    clearTimeout(endpointTimerRef.current); endpointTimerRef.current = null;
    clearTimeout(nudgeTimerRef.current); nudgeTimerRef.current = null;
    clearTimeout(idleTimerRef.current); idleTimerRef.current = null;
  }

  // Arm the "still there?" nudge (15s) + auto-close (30s). `reset` (after real speech or a finished reply)
  // restarts both clocks; otherwise (resuming after the nudge itself) we leave the close clock running so a
  // silent user still times out. Timers only run while we're idly LISTENING — never mid-think or mid-speech.
  const armIdle = (reset) => {
    if (!convRef.current) return;
    if (reset) { clearTimeout(nudgeTimerRef.current); clearTimeout(idleTimerRef.current); nudgeTimerRef.current = idleTimerRef.current = null; nudgedRef.current = false; }
    if (nudgeTimerRef.current || idleTimerRef.current) return;   // already counting down
    nudgeTimerRef.current = setTimeout(() => {
      if (convRef.current && phaseRef.current === "listening" && !nudgedRef.current) { nudgedRef.current = true; diag("nudge"); speakReply(NUDGE, { keepIdle: true }); }
    }, CONVO.nudgeMs);
    idleTimerRef.current = setTimeout(() => {
      if (convRef.current && phaseRef.current === "listening") { sysMsg("muted", "Conversation ended."); endConversation(); }
    }, CONVO.closeMs);
  };

  // Speak a reply, then return to listening. Pauses the idle clocks while speaking; re-arms them after.
  const speakReply = (t, opts = {}) => {
    clearTimeout(endpointTimerRef.current); endpointTimerRef.current = null;
    if (!t) { afterSpeak(opts); return; }
    phaseRef.current = "speaking"; diag("ai_respond", { text: t });
    say(t, () => afterSpeak(opts));
  };
  const afterSpeak = (opts = {}) => {
    if (!convRef.current) return;
    phaseRef.current = "listening";
    bufferRef.current = ""; interimRef.current = ""; setInterim("");
    diag("listening_resume");
    armIdle(opts.keepIdle ? false : true);
  };

  // A completed utterance → first the LOCAL conversation controls (no Claude call), then confirm/pick on a
  // pending action, then the interpreter. Keeps the common "slow down / repeat / speak Spanish" off the API.
  async function handleUtterance(t) {
    const ctl = parseVoiceControl(t);
    if (ctl) {
      if (ctl.kind === "stop") { stopSay(); setSpeaking(false); phaseRef.current = "listening"; armIdle(true); return; }
      if (ctl.kind === "wait") { stopSay(); setSpeaking(false); phaseRef.current = "listening"; armIdle(true); return; }
      if (ctl.kind === "repeat") { speakReply(lastReplyRef.current || "There's nothing to repeat yet."); return; }
      if (ctl.kind === "rate") { rateRef.current = Math.max(0.6, Math.min(1.6, rateRef.current + ctl.delta)); speakReply(ctl.delta < 0 ? "Okay, slower." : "Okay, faster."); return; }
      if (ctl.kind === "brief") { briefRef.current = ctl.on; speakReply(ctl.on ? "Got it — I'll keep it short." : "Okay, more detail."); return; }
      if (ctl.kind === "continue") { speakReply("Go ahead."); return; }
      if (ctl.kind === "back") { persistConvo(); phaseRef.current = "speaking"; say("Going back.", () => { try { window.history.back(); } catch {} }); return; }
      if (ctl.kind === "lang") { setLanguage(ctl.lang); const nm = LANGS[ctl.lang]?.label || "that language"; speakReply(`Okay, ${nm}.`); return; }
    }
    const p = pendRef.current;
    const d = p ? voiceDecision(t) : null;
    if (d?.kind === "confirm") { const out = await apply(); speakReply(out?.message || "Done."); return; }
    if (d?.kind === "cancel") { dismiss(); speakReply("Cancelled."); return; }
    if (d?.kind === "pick") { const cand = p?.res?.candidates?.[d.index - 1]; if (cand) { const nr = await pick(cand.id); speakReply(summarizeForSpeech(nr)); } else speakReply("Which one — say the number."); return; }
    const r = await runInterpret(t);
    // Keep the conversation open THROUGH an action: in conversation mode a navigation auto-opens (no "say
    // yes" needed) and we persist the session so the page load doesn't end the conversation.
    if (r?.kind === "navigate") { persistConvo(); phaseRef.current = "speaking"; say(`Opening ${r.label}.`, () => {}); onNavigate?.(r); return; }
    speakReply(summarizeForSpeech(r));
  }

  // A recorded utterance → transcribe it (language auto-detected), then run the normal handler. The VAD in
  // startVoiceCapture already did end-of-speech detection and dropped noise, so a clip here is real speech.
  async function processClip(blob) {
    if (!convRef.current || phaseRef.current !== "listening") return;
    phaseRef.current = "processing"; setThinking(true); setInterim("");
    clearTimeout(nudgeTimerRef.current); clearTimeout(idleTimerRef.current); nudgeTimerRef.current = idleTimerRef.current = null;   // don't count down while thinking
    diag("transcribe_start", { bytes: blob?.size });
    const t = Date.now();
    const r = await transcribeClip(blob).catch(() => null);
    setThinking(false);
    const text = (r?.text || "").trim();
    diag("transcribe_done", { ms: Date.now() - t, lang: r?.language, text });
    if (!text || isNoise(text)) { diag("drop_noise", { text }); phaseRef.current = "listening"; armIdle(true); return; }   // silence / noise → keep listening
    if (r?.language && LANGS[r.language]) langRef.current = r.language;   // understand + reply in the detected language
    diag("command_submit", { text, lang: langRef.current });
    await handleUtterance(text);
  }

  // A genuine user voice during playback — detected on the echo-cancelled mic meter by startVoiceCapture.
  function bargeIn() {
    if (!bargeRef.current || phaseRef.current !== "speaking") return;
    stopSay(); setSpeaking(false); phaseRef.current = "listening"; bargeCountRef.current = 0;
  }

  // Explicit language switch ("speak Spanish"). With server transcription the language is auto-detected per
  // clip, so this just pins replies (and biases) to the chosen language until the user speaks another.
  function setLanguage(lang) { if (LANGS[lang]) langRef.current = lang; }

  // One voice capture runs for the whole conversation: it emits level bars, records real speech, endpoints on
  // a pause, transcribes, and never captures the assistant's own voice (barge-in comes from the meter).
  async function startConvoCapture() {
    if (!convRef.current) return;
    const cap = await startVoiceCapture({
      getPhase: () => phaseRef.current,
      onLevels: (lv) => setLevels(lv),
      onSpeechStart: () => { if (phaseRef.current === "listening") { armIdle(true); setInterim("…"); diag("speech_start"); } },
      onSpeechEnd: (d) => diag("speech_end", d),
      onBargeIn: () => bargeIn(),
      onUtterance: (blob) => processClip(blob),
      onDiag: (ev, d) => diag(ev, d),
      silenceMs: CONVO.endSilenceMs,
    });
    if (!cap) { sysMsg("err", "Microphone unavailable — allow mic access to use Conversation Mode."); convRef.current = false; setConvoOn(false); setListening(false); return; }
    captureRef.current = cap; setListening(true); setLevels([0, 0, 0, 0, 0]);
  }

  function startConversation() {
    if (convRef.current) return;
    if (listening) stopListening();   // a dictation mic can't run at the same time
    convRef.current = true; setConvoOn(true);
    phaseRef.current = "listening";
    bufferRef.current = ""; interimRef.current = ""; nudgedRef.current = false;
    t0Ref.current = Date.now(); diag("mic_start");
    startConvoCapture();
    armIdle(true);
  }
  function endConversation() {
    diag("close");
    convRef.current = false; setConvoOn(false);
    phaseRef.current = "idle";
    clearConvoTimers();
    stopListening();
    stopSay(); setSpeaking(false);
  }
  function toggleConversation() { if (convRef.current) endConversation(); else startConversation(); }

  // Keep the conversation alive across a navigation (the hard reload a deep-link needs): stash the thread,
  // memory and voice so the surface re-opens listening on the next page. Read back in the mount effect.
  function persistConvo() {
    try {
      const slim = turns.slice(-12).map((t) => ({ role: t.role, text: t.text, res: t.res }));
      sessionStorage.setItem("iot_ai_convo", JSON.stringify({ ts: Date.now(), mode: "chat", turns: slim, memory: memRef.current, voice: voiceRef.current }));
    } catch {}
  }

  const dictLabel = listening ? "Stop dictation" : "Dictate";
  const live = listening || thinking || speaking;
  const hasThread = turns.length > 0 || live;
  // Core/bar derivations (corebar dock): one word of status + the latest assistant line.
  const coreState = speaking ? "speaking" : thinking ? "thinking" : (listening || convoOn) ? "listening" : "idle";
  const lastMsg = [...turns].reverse().find((t) => t.role === "assistant" && t.res?.kind === "message");
  const statusLine = speaking ? "Speaking…" : thinking ? "Thinking…" : listening ? (interim && interim !== "…" ? interim : "Listening…") : (lastMsg?.res?.text || "");

  // corebar controls — reuse the existing conversation lifecycle; no second system.
  const coreTap = () => {
    if (!expanded) { setExpanded(true); if (!convRef.current && !typing) startConversation(); return; }
    if (typing) { setTyping(false); if (!convRef.current) startConversation(); return; }
    if (convRef.current) endConversation(); else startConversation();
  };
  const toType = () => { setTyping(true); if (convRef.current) endConversation(); setTimeout(() => barInRef.current?.focus(), 60); };
  const toVoice = () => { setTyping(false); if (!convRef.current) startConversation(); };
  const minimizeBar = () => setExpanded(false);                                  // keep the conversation alive
  const closeBar = () => { endConversation(); setTyping(false); setExpanded(false); };

  // The ultra-minimal floating assistant: a tiny animated AI Core that expands into a slim horizontal bar.
  // Reuses every handler above — same interpreter, voice lifecycle, memory, auth. No second system.
  function renderCorebar() {
    const pend = pending?.res;
    return (
      <div className={`aicore-dock${expanded ? " open" : ""}`} data-state={coreState}>
        <style>{COREBAR_CSS}</style>
        {/* The latest answer, shown above the bar so a TYPED question's reply is visible (voice speaks it too). */}
        {expanded && !thinking && lastMsg?.res?.text && (
          <div className={`aicore-answer ${lastMsg.res.tone || "ok"}`}>{lastMsg.res.text}</div>
        )}
        {overlayRef.current && (
          <div className="aicore-diag" role="log" aria-label="Voice diagnostics">
            <div className="aicore-diaghd"><span>voice trace · {coreState}</span><button type="button" onClick={() => { try { localStorage.setItem("iot_ai_debug", "off"); } catch {} overlayRef.current = false; setDiagLog([]); }} aria-label="Close diagnostics">×</button></div>
            {diagLog.map((e, i) => <div key={i} className="aicore-diagln"><span className="t">+{e.ms}ms</span> <b>{e.ev}</b>{e.d != null ? <span className="d"> {diagDetail(e.d)}</span> : null}</div>)}
          </div>
        )}
        <div className="aicore-shell">
          <button type="button" className="aicore-btn" onClick={coreTap}
            aria-label={expanded ? (convoOn ? "Stop listening" : "Start conversation") : "Open the assistant"} title="Assistant (⌘K)">
            <AICore state={coreState} levels={levels} active={expanded || coreState !== "idle"} size={36} />
            {convoOn && !expanded && <span className="aicore-dot" aria-hidden="true" />}
          </button>

          {expanded && (
            <div className="aicore-bar" role="region" aria-label="Assistant">
              {typing ? (
                <form className="aicore-type" onSubmit={submit}>
                  <input ref={barInRef} className="aicore-in" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Ask the assistant" disabled={busy} />
                  <button type="submit" className="aicore-ic" disabled={busy || !text.trim()} aria-label="Send"><Arrow /></button>
                </form>
              ) : (
                <div className="aicore-live">
                  {projectName && coreState === "idle" && !statusLine ? <span className="aicore-ctx">{projectName}</span> : null}
                  <span className={`aicore-status s-${coreState}`}>{statusLine || (convoOn ? "Listening…" : "Tap the core to talk")}</span>
                </div>
              )}
              <div className="aicore-ctrls">
                {typing
                  ? <button type="button" className="aicore-ic" onClick={toVoice} aria-label="Voice" title="Voice"><MicIcon /></button>
                  : <button type="button" className="aicore-ic" onClick={toType} aria-label="Type" title="Type"><Keyboard /></button>}
                <button type="button" className="aicore-ic" onClick={minimizeBar} aria-label="Minimize" title="Minimize"><Minus /></button>
                <button type="button" className="aicore-ic" onClick={closeBar} aria-label="End" title="End">×</button>
              </div>
            </div>
          )}
        </div>

        {/* Compact confirm — only when a sensitive write/disambiguation is pending. */}
        {expanded && pend && (pend.kind === "write" || pend.kind === "disambiguate") && (
          <div className="aicore-confirm">
            {pend.kind === "write" ? (
              <>
                <div className="aicore-cprev"><b>{pend.preview.title}</b>{pend.preview.before != null && pend.preview.after != null && <span> · {money(pend.preview.before)} → <b>{money(pend.preview.after)}</b></span>}</div>
                <div className="aicore-cacts"><button type="button" className="aicore-apply" onClick={apply} disabled={busy}>Apply</button><button type="button" className="aicore-cancel" onClick={dismiss} disabled={busy}>Cancel</button></div>
              </>
            ) : (
              <div className="aicore-cands">{pend.candidates.map((c, i) => <button key={c.id} type="button" className="aicore-cand" onClick={() => pick(c.id)} disabled={busy}><span>{i + 1}</span>{c.label}</button>)}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (corebar) return renderCorebar();

  return (
    <div className={`aicb${convoOn ? " aicb-convo" : ""}`}>
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
                  <span className="aicb-vslbl">{interim || (convoOn ? "Listening…" : "Listening — dictating…")}</span>
                  {convoOn && <button type="button" className="aicb-vstop" onClick={endConversation}>End</button>}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {voiceOk && (
        <div className="aicb-toprow">
          {/* One dedicated hands-free control — no mode tabs. */}
          <button type="button" className={`aicb-convobtn${convoOn ? " on" : ""}`} aria-pressed={convoOn} onClick={toggleConversation}>
            <Chat />{convoOn ? "End conversation" : "Conversation"}
          </button>
          {/* Neural voice picker — audition + choose the spoken voice. */}
          <div className="aicb-voicewrap">
            <button type="button" className="aicb-voicebtn" aria-haspopup="menu" aria-expanded={voiceOpen} title="Assistant voice" onClick={() => setVoiceOpen((o) => !o)}>
              <Speaker /><span className="aicb-voicename">{voiceLabel(voice)}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {voiceOpen && (
              <div className="aicb-voicemenu" role="menu">
                <div className="aicb-voicehead">Assistant voice</div>
                {VOICES.map((v) => (
                  <div key={v.id} className={`aicb-voiceopt${voice === v.id ? " on" : ""}`} role="menuitemradio" aria-checked={voice === v.id} onClick={() => chooseVoice(v.id)}>
                    <span className="aicb-voicedot">{voice === v.id ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> : null}</span>
                    <span className="aicb-voicetx"><b>{v.label}</b><small>{v.note}</small></span>
                    <button type="button" className="aicb-voiceplay" title={`Preview ${v.label}`} aria-label={`Preview ${v.label}`}
                      onClick={(e) => { e.stopPropagation(); previewVoice(v.id); }}>
                      {previewing === v.id
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!convoOn && (
        <form className="aicb-row" onSubmit={submit}>
          <span className="aicb-spark" aria-hidden="true"><Spark /></span>
          <input className="aicb-in" value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? "Listening…" : placeholder} aria-label="Ask the assistant" disabled={busy} />
          {voiceOk && (
            <button type="button" className={`aicb-mic${listening ? " live" : ""}`} aria-label={dictLabel} title={dictLabel} onClick={dictate} disabled={busy && !listening}><MicIcon /></button>
          )}
          <button type="submit" className="aicb-go" disabled={busy || !text.trim()} aria-label="Send"><Arrow /></button>
        </form>
      )}
    </div>
  );
}

/* icons */
const Spark = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>;
const Arrow = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11l5-5 5 5M12 6v13" /></svg>;
const MicIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const Chat = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
const Keyboard = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></svg>;
const Minus = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg>;
const Speaker = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>;

// ---- Ultra-minimal floating "AI Core" dock (bottom-left) ----
const COREBAR_CSS = `
.aicore-dock{position:fixed;left:16px;bottom:16px;z-index:60;display:flex;flex-direction:column;align-items:flex-start;gap:8px;font-family:inherit}
.aicore-shell{display:flex;align-items:center;gap:0}
.aicore-btn{position:relative;flex:none;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:#0B0F1A;box-shadow:0 6px 20px rgba(11,15,26,.45),0 0 0 1px rgba(201,169,110,.32);cursor:pointer;display:grid;place-items:center;overflow:hidden;transition:transform .16s,box-shadow .16s}
.aicore-btn:hover{transform:translateY(-1px) scale(1.04);box-shadow:0 10px 26px rgba(11,15,26,.5),0 0 0 1px rgba(201,169,110,.55)}
.aicore-btn:focus-visible{outline:2px solid #C9A96E;outline-offset:2px}
.aicore-dot{position:absolute;top:3px;right:3px;width:8px;height:8px;border-radius:50%;background:#D64545;box-shadow:0 0 0 2px #0B0F1A;animation:aicore-pulse 1.3s ease-in-out infinite}
@keyframes aicore-pulse{0%,100%{opacity:.5}50%{opacity:1}}
.aicore-bar{display:flex;align-items:center;gap:6px;margin-left:8px;min-width:220px;max-width:min(78vw,300px);height:40px;padding:0 6px 0 12px;background:#0B0F1A;color:#EDE4D3;border-radius:999px;box-shadow:0 8px 24px rgba(11,15,26,.45),0 0 0 1px rgba(201,169,110,.3);animation:aicore-grow .2s ease}
@keyframes aicore-grow{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
.aicore-live{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;line-height:1.15}
.aicore-ctx{font-size:9.5px;letter-spacing:.4px;text-transform:uppercase;color:#C9A96E;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aicore-status{font-size:12.5px;color:#EDE4D3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aicore-status.s-listening{color:#EDE4D3}.aicore-status.s-thinking,.aicore-status.s-speaking{color:#C9A96E}
.aicore-type{flex:1;min-width:0;display:flex;align-items:center;gap:4px}
.aicore-in{flex:1;min-width:0;border:0;background:transparent;outline:none;font-size:13px;color:#FAF8F4;font-family:inherit}
.aicore-in::placeholder{color:#7b8296}
.aicore-ctrls{flex:none;display:flex;align-items:center;gap:1px}
.aicore-ic{flex:none;width:28px;height:28px;border:0;background:transparent;color:#9aa6bd;border-radius:7px;display:grid;place-items:center;cursor:pointer;font-size:17px;line-height:1}
.aicore-ic:hover:not(:disabled){background:rgba(201,169,110,.16);color:#EDE4D3}
.aicore-ic:disabled{opacity:.4;cursor:default}
.aicore-answer{max-width:min(82vw,360px);margin-left:4px;margin-bottom:2px;background:#0B0F1A;color:#EDE4D3;border-radius:12px;padding:8px 12px;font-size:12.5px;line-height:1.4;box-shadow:0 8px 24px rgba(11,15,26,.45),0 0 0 1px rgba(201,169,110,.3);animation:aicore-grow .18s ease}
.aicore-answer.err{color:#f0a9a9}.aicore-answer.muted{color:#aab2c4}
.aicore-confirm{max-width:min(82vw,320px);margin-left:52px;background:#0B0F1A;color:#EDE4D3;border-radius:12px;padding:9px 11px;box-shadow:0 8px 24px rgba(11,15,26,.5),0 0 0 1px rgba(201,169,110,.3);display:flex;flex-direction:column;gap:7px}
.aicore-cprev{font-size:12px}.aicore-cprev b{color:#FAF8F4}
.aicore-cacts{display:flex;gap:6px}
.aicore-apply{border:0;border-radius:7px;background:#1d7a3a;color:#fff;font-size:12px;font-weight:600;padding:6px 14px;cursor:pointer}
.aicore-cancel{border:0;background:transparent;color:#9aa6bd;font-size:12px;padding:6px 8px;cursor:pointer}
.aicore-cands{display:flex;flex-direction:column;gap:4px}
.aicore-cand{display:flex;align-items:center;gap:7px;border:1px solid rgba(201,169,110,.25);background:transparent;color:#EDE4D3;border-radius:8px;padding:6px 9px;font-size:12px;cursor:pointer;text-align:left}
.aicore-cand span{flex:none;width:17px;height:17px;border-radius:50%;background:#C9A96E;color:#0B0F1A;font-size:10px;display:grid;place-items:center}
.aicore-cand:hover:not(:disabled){border-color:#C9A96E}
.aicore-diag{position:fixed;left:12px;bottom:70px;width:min(84vw,340px);max-height:42vh;overflow-y:auto;background:rgba(11,15,26,.95);color:#d7dce6;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 0 1px rgba(201,169,110,.3);padding:6px 8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;line-height:1.5;z-index:61}
.aicore-diaghd{display:flex;align-items:center;justify-content:space-between;color:#C9A96E;font-size:9.5px;letter-spacing:.4px;text-transform:uppercase;padding-bottom:3px;margin-bottom:3px;border-bottom:1px solid rgba(201,169,110,.2)}
.aicore-diaghd button{border:0;background:transparent;color:#9aa6bd;font-size:15px;line-height:1;cursor:pointer;padding:0 2px}
.aicore-diagln{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aicore-diagln .t{color:#7b8296}.aicore-diagln b{color:#EDE4D3;font-weight:600}.aicore-diagln .d{color:#9aecb0}
@media (max-width:560px){
  .aicore-dock{left:12px;bottom:calc(12px + env(safe-area-inset-bottom))}
  .aicore-bar{max-width:calc(100vw - 92px)}
  .aicore-diag{bottom:calc(66px + env(safe-area-inset-bottom))}
}
@media (prefers-reduced-motion: reduce){.aicore-btn,.aicore-bar,.aicore-dot{animation:none;transition:none}}
`;
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
.aicb-toprow{display:flex;align-items:center;justify-content:space-between;gap:8px}
.aicb-voicewrap{position:relative;flex:none}
.aicb-voicebtn{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-bg,#fff);color:#6a7085;border-radius:999px;font-size:11.5px;padding:4px 9px;cursor:pointer;font-family:inherit}
.aicb-voicebtn:hover{border-color:#C9A96E;color:var(--dv-ink,#1b1f2a)}
.aicb-voicebtn svg:first-child{color:#C9A96E}
.aicb-voicename{font-weight:600}
.aicb-voicemenu{position:absolute;right:0;top:calc(100% + 6px);z-index:5;width:232px;background:var(--dv-bg,#fff);border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;box-shadow:0 14px 34px rgba(14,18,30,.18);padding:6px}
.aicb-voicehead{font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:#9aa0ab;font-weight:600;padding:5px 8px 4px}
.aicb-voiceopt{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;cursor:pointer}
.aicb-voiceopt:hover{background:var(--dv-paper,#F1F1EE)}
.aicb-voiceopt.on{background:rgba(201,169,110,.12)}
.aicb-voicedot{flex:none;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;color:#C9A96E}
.aicb-voicetx{display:flex;flex-direction:column;line-height:1.25;flex:1;min-width:0}
.aicb-voicetx b{font-size:12.5px;font-weight:600;color:var(--dv-ink,#1b1f2a)}
.aicb-voicetx small{font-size:10.5px;color:#9aa0ab}
.aicb-voiceplay{flex:none;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:0;background:var(--dv-paper,#F1F1EE);color:#10204a;border-radius:7px;cursor:pointer}
.aicb-voiceplay:hover{background:#C9A96E;color:#fff}
.aicb-convobtn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-bg,#fff);color:#6a7085;border-radius:999px;font-size:11.5px;font-weight:600;padding:5px 12px;cursor:pointer;font-family:inherit}
.aicb-convobtn svg{opacity:.85}
.aicb-convobtn:hover{border-color:#C9A96E;color:var(--dv-ink,#1b1f2a)}
.aicb-convobtn.on{background:#D64545;border-color:#D64545;color:#fff}
.aicb-convobtn.on svg{opacity:1}
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
  :root:not([data-theme="light"]) .aicb-convobtn{background:#14171f;color:#e7e9ee;border-color:#2a2f3a}
  :root:not([data-theme="light"]) .aicb-voicebtn,:root:not([data-theme="light"]) .aicb-voicemenu{background:#14171f;color:#e7e9ee}
  :root:not([data-theme="light"]) .aicb-voicetx b{color:#e7e9ee}
  :root:not([data-theme="light"]) .aicb-voiceopt:hover,:root:not([data-theme="light"]) .aicb-voiceplay{background:#262a36}
}
`;

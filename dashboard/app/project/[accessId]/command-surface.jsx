"use client";
import { useEffect, useRef, useState } from "react";
import { speechSupport, createRecognizer, readRecognition, speak, speakNeural, stopSpeaking, startMeter, summarizeForSpeech, voiceDecision } from "../../../lib/voice";
import { CONVO, NUDGE, LANGS, endpointDelay, isNoise, parseVoiceControl } from "../../../lib/voice-convo";

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

export default function CommandSurface({ enabled = true, placeholder = "Ask anything…", interpret, onNavigate, onApply, onPick }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);   // interpret in flight → "Thinking…"
  const [turns, setTurns] = useState([]);             // transcript: { id, role, text?, res? }
  const [pending, setPending] = useState(null);       // { id, res } — the single actionable awaiting a decision
  const [support, setSupport] = useState({ recognition: false, synthesis: false });
  const [convoOn, setConvoOn] = useState(false);      // hands-free Conversation Mode on/off (drives the UI)
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");         // live recognized words (talk/chat)
  const [voice, setVoice] = useState(DEFAULT_VOICE);  // neural voice id (per-viewer, persisted)
  const [voiceOpen, setVoiceOpen] = useState(false);  // voice-picker popover
  const [previewing, setPreviewing] = useState(null); // voice id currently playing a sample
  const [levels, setLevels] = useState(null);         // real mic levels (array) or null when unmetered

  const recRef = useRef(null);       // active SpeechRecognition
  const meterRef = useRef(null);     // active mic meter
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
  const idc = useRef(0);
  const sayCtlRef = useRef(null);    // active neural-voice controller (for interrupt/Stop)
  const voiceRef = useRef(DEFAULT_VOICE);
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
  const onResultRef = useRef(null);       // always points at the freshest recognition handler (no stale closure)
  const rateRef = useRef(1);              // spoken-reply playback rate ("slow down" / "speak faster")
  const langRef = useRef("en");           // active language for recognition + spoken replies
  const briefRef = useRef(false);         // "keep it short" preference
  const lastReplyRef = useRef("");        // last spoken reply, for "repeat that"
  const nid = () => `t${Date.now()}_${idc.current++}`;
  // Stop any speech in flight — the neural audio AND the browser voice.
  const stopSay = () => { try { sayCtlRef.current?.stop(); } catch {} sayCtlRef.current = null; stopSpeaking(); };

  useEffect(() => {
    setSupport(speechSupport());
    try { const b = localStorage.getItem("iot_ai_bargein"); if (b === "off") bargeRef.current = false; } catch {}
    return () => { convRef.current = false; clearConvoTimers(); try { recRef.current?.stop(); } catch {} try { meterRef.current?.stop(); } catch {} stopSay(); };
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
  // Resume a conversation handed off across a navigation (persistConvo stashed it just before the reload):
  // restore the thread + memory + voice and pick listening back up, so "open a project" doesn't end the chat.
  useEffect(() => {
    if (!support.recognition) return;
    let data; try { const raw = sessionStorage.getItem("iot_ai_convo"); if (!raw) return; data = JSON.parse(raw); sessionStorage.removeItem("iot_ai_convo"); } catch { return; }
    if (!data || data.mode !== "chat" || Date.now() - (data.ts || 0) > 60000) return;   // only a fresh hand-off
    if (Array.isArray(data.turns) && data.turns.length) setTurns(data.turns.map((t) => ({ id: nid(), role: t.role, text: t.text, res: t.res })));
    if (data.memory) memRef.current = { project: null, customer: null, facts: [], turns: [], ...data.memory, pending: null };
    if (data.voice && VOICES.some((v) => v.id === data.voice)) { setVoice(data.voice); voiceRef.current = data.voice; }
    const t = setTimeout(() => startConversation(), 400);   // mic permission already granted mid-conversation
    return () => clearTimeout(t);
  }, [support.recognition]);
  // Keep the newest turn / live state in view, input stays anchored below.
  useEffect(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; }, [turns, thinking, listening, speaking, interim, levels]);
  if (!enabled) return null;

  const addTurn = (turn) => setTurns((ts) => [...ts, { id: nid(), ...turn }]);
  const sysMsg = (tone, text) => addTurn({ role: "assistant", res: { kind: "message", tone, text } });

  // Render a raw result into the thread + set/clear the actionable pending, and keep memory current.
  function present(r) {
    if (!r) return null;
    if (r.error) { sysMsg("err", r.error); setPending(null); memRef.current.pending = null; pushTurn("assistant", r.error); return r; }
    if (r.kind === "navigate" || r.kind === "write" || r.kind === "disambiguate") {
      const id = nid();
      setTurns((ts) => [...ts, { id, role: "assistant", res: r }]);
      setPending({ id, res: r });
      memRef.current.pending = r.kind === "navigate" ? null : (r.preview?.title || "a pending change");
      if (r.kind === "navigate") { const mm = String(r.href || "").match(/\/project\/([A-Za-z0-9]+)/); if (mm) { memRef.current.project = { accessId: mm[1], name: r.label || mm[1] }; memRef.current.customer = r.label || memRef.current.customer; } }
      pushTurn("assistant", r.kind === "navigate" ? `(open ${r.label})` : (r.preview?.title || "(pending change)"));
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

  // ---- recognition + metering ----
  function stopListening() {
    const r = recRef.current; recRef.current = null; if (r) { try { r.onend = null; r.stop(); } catch {} }
    try { meterRef.current?.stop(); } catch {} meterRef.current = null;
    setListening(false); setLevels(null);
  }
  function listen({ continuous = false, toField = false, lang, onFinal, onEnd }) {
    stopListening(); stopSay();
    const r = createRecognizer({ continuous, interim: true, lang: lang || "en-US" });
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

  // The in-input microphone DICTATES only — it fills the field for review + send, never auto-submits.
  // Hands-free voice is the separate Conversation Mode below. Dictation follows the active language too.
  function dictate() { if (listening) { stopListening(); return; } listen({ toField: true, lang: LANGS[langRef.current]?.bcp47 }); }
  // ---- Conversation mode: a real lifecycle (listening → processing → speaking → listening), not a
  // one-command box. One continuous recognizer runs for the whole session; WE decide when an utterance is
  // finished (a genuine pause), ignore noise/our own voice, keep the session open across actions, and close
  // only on an explicit stop or after a real idle timeout.
  const clearConvoTimers = () => {
    clearTimeout(endpointTimerRef.current); endpointTimerRef.current = null;
    clearTimeout(nudgeTimerRef.current); nudgeTimerRef.current = null;
    clearTimeout(idleTimerRef.current); idleTimerRef.current = null;
  };

  // Arm the "still there?" nudge (15s) + auto-close (30s). `reset` (after real speech or a finished reply)
  // restarts both clocks; otherwise (resuming after the nudge itself) we leave the close clock running so a
  // silent user still times out. Timers only run while we're idly LISTENING — never mid-think or mid-speech.
  const armIdle = (reset) => {
    if (!convRef.current) return;
    if (reset) { clearTimeout(nudgeTimerRef.current); clearTimeout(idleTimerRef.current); nudgeTimerRef.current = idleTimerRef.current = null; nudgedRef.current = false; }
    if (nudgeTimerRef.current || idleTimerRef.current) return;   // already counting down
    nudgeTimerRef.current = setTimeout(() => {
      if (convRef.current && phaseRef.current === "listening" && !nudgedRef.current) { nudgedRef.current = true; speakReply(NUDGE, { keepIdle: true }); }
    }, CONVO.nudgeMs);
    idleTimerRef.current = setTimeout(() => {
      if (convRef.current && phaseRef.current === "listening") { sysMsg("muted", "Conversation ended."); endConversation(); }
    }, CONVO.closeMs);
  };

  // Speak a reply, then return to listening. Pauses the idle clocks while speaking; re-arms them after.
  const speakReply = (t, opts = {}) => {
    clearTimeout(endpointTimerRef.current); endpointTimerRef.current = null;
    if (!t) { afterSpeak(opts); return; }
    phaseRef.current = "speaking";
    say(t, () => afterSpeak(opts));
  };
  const afterSpeak = (opts = {}) => {
    if (!convRef.current) return;
    phaseRef.current = "listening";
    bufferRef.current = ""; interimRef.current = ""; setInterim("");
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

  // The pause detector: once the speaker has been quiet for endpointDelay(), treat the buffer as a finished
  // thought. Ignores empty/noise so silence never triggers a response.
  async function endpointFire() {
    if (!convRef.current || phaseRef.current !== "listening") return;
    const utter = ((bufferRef.current ? bufferRef.current + " " : "") + (interimRef.current || "")).trim();
    bufferRef.current = ""; interimRef.current = "";
    if (!utter || isNoise(utter)) { setInterim(""); return; }   // nothing real was said
    phaseRef.current = "processing";
    clearTimeout(nudgeTimerRef.current); clearTimeout(idleTimerRef.current); nudgeTimerRef.current = idleTimerRef.current = null;   // don't count down while thinking
    setInterim("");
    await handleUtterance(utter);
  }

  // A real user voice during playback — detected on the echo-cancelled mic meter, NOT speech-to-text (the
  // recognizer would otherwise transcribe the assistant's own words). Interrupt and hand back to listening.
  function bargeIn() {
    if (phaseRef.current !== "speaking") return;
    stopSay(); setSpeaking(false); phaseRef.current = "listening"; bufferRef.current = ""; interimRef.current = ""; bargeCountRef.current = 0;
  }

  function onConvoResult(e) {
    // Never process speech-to-text while the assistant is talking — that's how it used to transcribe its own
    // voice and "respond to silence". Barge-in is handled separately, from the mic meter.
    if (phaseRef.current === "speaking") return;
    if (phaseRef.current === "processing") return;    // mid-interpret → hold
    const { interim: iv, final } = readRecognition(e);
    if (final) bufferRef.current = (bufferRef.current ? bufferRef.current + " " : "") + final;
    interimRef.current = iv || "";
    const shown = ((bufferRef.current ? bufferRef.current + " " : "") + (iv || "")).trim();
    setInterim(shown);
    // (Re)start the end-of-speech countdown only when there's real speech, so a brief pause mid-sentence
    // doesn't cut the user off and background noise doesn't start a response.
    if (shown && !isNoise(shown)) {
      armIdle(true);   // meaningful speech → reset the idle clocks
      clearTimeout(endpointTimerRef.current);
      endpointTimerRef.current = setTimeout(() => { endpointFire(); }, endpointDelay(shown));
    }
  }

  // One long-lived recognizer for the whole conversation. Chrome stops it periodically (silence / ~60s) —
  // we restart while the session is live so listening never silently dies.
  // Switch the conversation language on command ("speak Spanish"). Browser speech recognition LOCKS its
  // language per session, so we restart the recognizer on the new BCP-47 tag; spoken replies follow langRef.
  function setLanguage(lang) {
    if (!LANGS[lang] || langRef.current === lang) { langRef.current = LANGS[lang] ? lang : langRef.current; return; }
    langRef.current = lang;
    if (convRef.current) { try { if (recRef.current) recRef.current.onend = null; recRef.current?.stop(); } catch {} recRef.current = null; startConvoRecognizer(); }
  }

  function startConvoRecognizer() {
    if (!convRef.current) return;
    const r = createRecognizer({ continuous: true, interim: true, lang: LANGS[langRef.current]?.bcp47 || "en-US" });
    if (!r) { sysMsg("err", "Voice input isn’t available in this browser."); convRef.current = false; return; }
    recRef.current = r; setListening(true); setInterim("");
    startMeter(5).then((m) => {
      if (!recRef.current) { m?.stop(); return; }
      meterRef.current = m;
      if (m) { setLevels([0, 0, 0, 0, 0]); m.onLevels((lv) => {
        setLevels(lv);
        // Barge-in: a few consecutive loud frames while speaking = a real voice (the assistant's own audio is
        // cancelled out of this stream), so stop and listen. Below threshold decays the counter.
        if (phaseRef.current === "speaking" && bargeRef.current) {
          if (Math.max(...lv) > 0.55) { if (++bargeCountRef.current >= 4) bargeIn(); } else bargeCountRef.current = Math.max(0, bargeCountRef.current - 1);
        } else bargeCountRef.current = 0;
      }); }
    }).catch(() => {});
    r.onresult = (e) => onResultRef.current?.(e);   // call the latest handler, never a closure captured at start
    r.onerror = (e) => { if (e?.error === "not-allowed" || e?.error === "service-not-allowed") { sysMsg("err", "Microphone blocked — allow mic access to use voice."); convRef.current = false; setListening(false); } };
    r.onend = () => {
      try { meterRef.current?.stop(); } catch {} meterRef.current = null; setLevels(null);
      if (convRef.current) { setTimeout(() => { if (convRef.current && recRef.current === r) startConvoRecognizer(); }, 250); }
      else { recRef.current = null; setListening(false); }
    };
    try { r.start(); } catch { setListening(false); }
  }

  function startConversation() {
    if (convRef.current) return;
    if (listening) stopListening();   // a dictation mic can't run at the same time
    convRef.current = true; setConvoOn(true);
    phaseRef.current = "listening";
    bufferRef.current = ""; interimRef.current = ""; nudgedRef.current = false;
    startConvoRecognizer();
    armIdle(true);
  }
  function endConversation() {
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
  onResultRef.current = onConvoResult;   // bind the recognizer to this render's handlers (fresh state/refs)

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

      {support.recognition && (
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
          {support.recognition && (
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
const Speaker = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>;

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

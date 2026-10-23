// Voice layer for the AI command surface. The browser bits (SpeechRecognition for dictation,
// speechSynthesis for spoken replies) are feature-detected and fail soft — if a browser lacks them the
// surface stays text-only. The PURE helpers (what to say, is this a yes/no) are isomorphic + unit-tested.
// Nothing here interprets commands or writes data; it only turns speech↔text and formats spoken summaries.

export function speechSupport() {
  if (typeof window === "undefined") return { recognition: false, synthesis: false };
  const recognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const synthesis = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  return { recognition, synthesis };
}

// A configured SpeechRecognition instance, or null when unsupported. Caller wires onresult/onend/onerror.
export function createRecognizer({ continuous = false, interim = true, lang = "en-US" } = {}) {
  if (typeof window === "undefined") return null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  try {
    const r = new SR();
    r.continuous = continuous;
    r.interimResults = interim;
    r.lang = lang;
    r.maxAlternatives = 1;
    return r;
  } catch { return null; }
}

// Pull { interim, final } text out of a SpeechRecognition result event (pure given the event shape).
export function readRecognition(event) {
  let interim = "", final = "";
  const results = event?.results || [];
  for (let i = event?.resultIndex || 0; i < results.length; i++) {
    const r = results[i];
    const txt = r?.[0]?.transcript || "";
    if (r?.isFinal) final += txt; else interim += txt;
  }
  return { interim: interim.trim(), final: final.trim() };
}

// PURE + testable: choose the most natural FEMALE English voice from a list. The platform default is often
// a flat, robotic (usually male) voice — we score en-US + natural/neural engines + known female names up,
// and male names down, so the assistant speaks in a warmer, more human voice. Returns a voice or null.
export function pickPreferredVoice(voices = []) {
  if (!Array.isArray(voices) || !voices.length) return null;
  const score = (v) => {
    const n = String(v?.name || "").toLowerCase(), lang = String(v?.lang || "").toLowerCase();
    let s = 0;
    if (/en[-_]us/.test(lang)) s += 4; else if (/^en/.test(lang)) s += 2;
    if (/natural|neural|online/.test(n)) s += 6;                                   // high-quality, least robotic
    if (/\b(aria|jenny|michelle|emma|ava|nova|libby|sonia|jane|zira|susan|samantha|serena|karen|tessa|fiona|moira|female|woman)\b/.test(n)) s += 5;
    if (/google us english|google uk english female/.test(n)) s += 4;              // Chrome's natural female-ish voice
    else if (/google/.test(n)) s += 2;
    if (/\b(david|mark|george|james|male|man|fred|alex|daniel|rishi|guy|ryan|oliver|thomas|paul|eric)\b/.test(n)) s -= 7;   // avoid male voices
    return s;
  };
  return voices.slice().sort((a, b) => score(b) - score(a))[0] || null;
}

// Browser wrapper around pickPreferredVoice. Voices load async (Chrome fires `voiceschanged`), so cache the
// pick and refresh when the list arrives; the very first utterance may use the default, every later one the
// chosen voice (conversation mode speaks many times, so it settles immediately).
let _preferredVoice = null;
function preferredVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  try {
    if (!_preferredVoice) {
      _preferredVoice = pickPreferredVoice(window.speechSynthesis.getVoices() || []);
      if (!_preferredVoice && !preferredVoice._bound) {
        preferredVoice._bound = true;
        window.speechSynthesis.addEventListener?.("voiceschanged", () => { _preferredVoice = pickPreferredVoice(window.speechSynthesis.getVoices() || []); });
      }
    }
  } catch { /* getVoices unavailable — fall back to the default voice */ }
  return _preferredVoice;
}

// Neural voice: fetch synthesized speech from our server route (OpenAI Realtime; key stays server-side) and
// play it through one Audio element. THROWS on any failure (no key, network, autoplay blocked, empty audio)
// so the caller can fall back to the browser voice. Returns a controller with stop() for interrupt/Stop.
// onEnd fires once, when playback finishes (or stop() is called). Never calls onEnd on failure — the throw
// is the signal. `text` is the finished reply; the server caps its length.
export async function speakNeural(text, { voice, rate, lang, onEnd } = {}) {
  if (typeof window === "undefined" || !String(text || "").trim()) throw new Error("no-neural");
  const controller = new AbortController();
  const res = await fetch("/api/tts", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: String(text), ...(voice ? { voice } : {}), ...(lang ? { lang } : {}) }), signal: controller.signal,
  });
  if (!res.ok) throw new Error("tts-" + res.status);
  const blob = await res.blob();
  if (!blob || blob.size < 128) throw new Error("tts-empty");
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  if (rate && rate > 0) { try { audio.playbackRate = Math.max(0.6, Math.min(1.6, rate)); } catch {} }   // "slow down" / "speak faster"
  let done = false;
  const finish = () => { if (done) return; done = true; try { URL.revokeObjectURL(url); } catch {} onEnd?.(); };
  audio.onended = finish;
  audio.onerror = finish;
  await audio.play();   // rejects if autoplay is blocked (no user gesture) → caller falls back
  return { stop: () => { try { controller.abort(); } catch {} try { audio.pause(); } catch {} finish(); } };
}

// Slightly slower rate + a touch more pitch reads as warmer and less robotic than the default monotone.
export function speak(text, { rate = 0.97, pitch = 1.08, onEnd } = {}) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) { onEnd?.(); return; }
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(String(text || ""));
    u.rate = rate;
    u.pitch = pitch;
    const v = preferredVoice();
    if (v) { u.voice = v; if (v.lang) u.lang = v.lang; }
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
  } catch { onEnd?.(); }
}
export function stopSpeaking() { try { window.speechSynthesis?.cancel(); } catch { /* noop */ } }

// Honest mic-level metering via Web Audio. Resolves to a controller { onLevels(fn), stop() } whose levels
// are REAL (RMS folded into `bars` bands, 0..1), or null when the mic is unavailable (no API / blocked /
// denied) — callers then show a non-reactive state rather than a waveform that fakes audio detection.
export async function startMeter(bars = 5) {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  let stream, ctx, raf;
  try {
    // echoCancellation keeps the assistant's own spoken reply out of the mic levels (less false "speech").
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { stream.getTracks().forEach((t) => t.stop()); return null; }
    ctx = new AC();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.72;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const band = Math.max(1, Math.floor(buf.length / bars));
    let onLevels = () => {};
    const tick = () => {
      analyser.getByteFrequencyData(buf);
      const out = [];
      for (let b = 0; b < bars; b++) {
        let s = 0; for (let i = 0; i < band; i++) s += buf[b * band + i];
        out.push(Math.min(1, (s / band) / 170));   // 0..1, headroom so speech reaches the top
      }
      onLevels(out);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return {
      onLevels(fn) { if (typeof fn === "function") onLevels = fn; },
      stop() {
        try { cancelAnimationFrame(raf); } catch { /* noop */ }
        try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
        try { ctx.close(); } catch { /* noop */ }
      },
    };
  } catch {
    try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    try { ctx?.close(); } catch { /* noop */ }
    return null;
  }
}

// Pick a recording container the browser supports (Chrome → webm/opus, Safari → mp4). Whisper reads all of these.
function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* keep trying */ }
  }
  return "";
}

// Voice Activity Detection + segment recording for Conversation Mode and dictation. ONE mic stream (never
// restarted between turns) drives both the live level bars and the capture. To avoid clipping the first word
// (which would feed Whisper an incomplete sentence), we keep a recorder running for the WHOLE listening
// window — so the clip always includes the onset — and only finalize + send it once the speaker has gone
// quiet for `silenceMs`; the leading/ambient silence is harmless to Whisper. A clip with no real speech is
// dropped (never transcribed). The recorder never runs while the assistant speaks (no self-echo); barge-in
// comes from sustained energy on the echo-cancelled stream. `getPhase()` → "listening" records · "speaking"
// only watches for barge-in · anything else just shows levels. `onDiag(event, data)` receives lifecycle
// events for dev diagnostics (no audio, no transcript — just timings/sizes). Returns { stop() } or null.
export async function startVoiceCapture({ onLevels, onUtterance, onSpeechStart, onSpeechEnd, onBargeIn, onDiag, getPhase, silenceMs = 1900, minSpeechMs = 300, maxIdleMs = 12000, bars = 5 } = {}) {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return null;
  let stream, ctx, raf, recorder, chunks = [], recording = false, heardSpeech = false, speechStartedAt = 0, lastVoiceAt = 0, recStartedAt = 0, bargeCount = 0;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { stream.getTracks().forEach((t) => t.stop()); return null; }
    ctx = new AC();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.6;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const band = Math.max(1, Math.floor(buf.length / bars));
    const mime = pickMime();
    const START = 0.16, STOP = 0.10;   // onset / keep-alive energy thresholds (0..1); conservative = ignore noise

    // Start recording the moment we're listening — BEFORE speech — so the first word is never cut off.
    const beginRec = () => {
      if (recording) return;
      chunks = []; heardSpeech = false; speechStartedAt = 0; recStartedAt = Date.now();
      try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
      catch { try { recorder = new MediaRecorder(stream); } catch { return; } }
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        recording = false;
        const speechMs = heardSpeech ? lastVoiceAt - speechStartedAt : 0;
        const blob = new Blob(chunks, { type: mime || "audio/webm" }); chunks = [];
        if (heardSpeech && speechMs >= minSpeechMs && blob.size > 1200) { onSpeechEnd?.({ speechMs, bytes: blob.size }); onUtterance?.(blob, speechMs); }
        else onDiag?.("drop", { reason: heardSpeech ? "too-short" : "no-speech", bytes: blob.size, speechMs });
      };
      try { recorder.start(); recording = true; } catch { recording = false; }
    };
    const endRec = () => { if (recording && recorder) { try { recorder.stop(); } catch { recording = false; } } };

    const tick = () => {
      analyser.getByteFrequencyData(buf);
      const out = [];
      for (let b = 0; b < bars; b++) { let s = 0; for (let i = 0; i < band; i++) s += buf[b * band + i]; out.push(Math.min(1, (s / band) / 170)); }
      onLevels?.(out);
      const level = Math.max(...out), now = Date.now();
      const phase = (getPhase && getPhase()) || "listening";
      if (phase === "listening") {
        bargeCount = 0;
        if (!recording) beginRec();
        if (level > START) {
          lastVoiceAt = now;
          if (!heardSpeech) { heardSpeech = true; speechStartedAt = now; onSpeechStart?.(); onDiag?.("speech_start", {}); }
        }
        if (heardSpeech && level < STOP && now - lastVoiceAt > silenceMs) endRec();        // end of a real utterance
        else if (!heardSpeech && now - recStartedAt > maxIdleMs) endRec();                  // recycle a long silent clip
      } else if (phase === "speaking") {
        if (recording) endRec();
        if (level > 0.5) { if (++bargeCount >= 4) { bargeCount = 0; onDiag?.("barge_in", {}); onBargeIn?.(); } } else bargeCount = Math.max(0, bargeCount - 1);
      } else { bargeCount = 0; if (recording) endRec(); }   // processing → hold
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return { stop() {
      try { cancelAnimationFrame(raf); } catch { /* noop */ }
      try { if (recording && recorder) { recorder.onstop = null; recorder.stop(); } } catch { /* noop */ }
      try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      try { ctx.close(); } catch { /* noop */ }
    } };
  } catch {
    try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    try { ctx?.close(); } catch { /* noop */ }
    return null;
  }
}

// Send a recorded clip to our transcription route; returns { text, language } (language auto-detected) or null.
export async function transcribeClip(blob) {
  if (typeof fetch === "undefined" || !blob) return null;
  try {
    const form = new FormData();
    form.append("file", blob, "clip." + ((blob.type || "").includes("mp4") ? "mp4" : "webm"));
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    if (!res.ok) return null;
    const j = await res.json();
    return { text: String(j?.text || "").trim(), language: j?.language || "en", duration: j?.duration ?? null };
  } catch { return null; }
}

const usd = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Turn a CommandSurface result into a short line to SPEAK (push-to-talk / conversation replies).
export function summarizeForSpeech(res) {
  if (!res) return "";
  if (res.error) return res.error;
  if (res.kind === "navigate") return `Open ${res.label}? Say yes to go, or cancel.`;
  if (res.kind === "disambiguate") return `I found a few. ${res.candidates.map((c, i) => `${i + 1}: ${c.label}`).join(". ")}. Which number?`;
  if (res.kind === "write") {
    const title = res.preview?.title || "Apply this change";
    const total = res.preview && res.preview.after != null ? `. New total ${usd(res.preview.after)}` : "";
    return `${title}${total}. Say confirm to apply, or cancel.`;
  }
  return res.speak || "I didn't catch a command I can run. Try again.";
}

// Pure: classify a spoken reply while a change is pending → confirm / cancel / a candidate number / null.
export function voiceDecision(transcript) {
  const t = String(transcript || "").toLowerCase().trim();
  if (!t) return null;
  if (/\b(confirm|apply|yes|yeah|yep|yup|do it|go ahead|sure|okay|ok|correct|that's right)\b/.test(t)) return { kind: "confirm" };
  if (/\b(cancel|no|nope|nah|never ?mind|stop|forget it|dismiss|scratch that)\b/.test(t)) return { kind: "cancel" };
  const ord = t.match(/\b(first|second|third|fourth|fifth)\b/);   // "the second one" → 2 (ordinals win)
  if (ord) return { kind: "pick", index: { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 }[ord[1]] };
  const num = t.match(/\b(?:number\s+)?(one|two|three|four|five|1|2|3|4|5)\b/);
  if (num) { const map = { one: 1, two: 2, three: 3, four: 4, five: 5 }; return { kind: "pick", index: map[num[1]] || +num[1] }; }
  return null;
}

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

export function speak(text, { rate = 1.02, onEnd } = {}) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) { onEnd?.(); return; }
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(String(text || ""));
    u.rate = rate;
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
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

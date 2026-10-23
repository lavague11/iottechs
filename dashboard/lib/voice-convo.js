// Conversation-mode policy for the AI command surface — the PURE, isomorphic rules that make the assistant
// feel like a continuous conversation instead of a one-shot command box. No DOM, no timers here; the surface
// owns the state machine (listening → processing → speaking → listening) and calls these to decide WHEN to
// act. Kept separate so the endpointing / noise / barge-in logic is unit-testable without a microphone.

// Tunables (ms unless noted). Exported so the surface — and the owner, later — can adjust the feel.
export const CONVO = {
  endSilenceMs: 1900,        // ~2s of silence after a complete-sounding sentence before we process it
  unfinishedSilenceMs: 2900, // longer grace when the sentence sounds mid-thought ("...and", "what about")
  nudgeMs: 15000,            // idle this long → gently ask "Anything else?" (once)
  closeMs: 30000,            // idle this long overall → end the conversation
  bargeMinChars: 6,          // an interim must be at least this long (and not noise) to interrupt a reply
};

export const NUDGE = "Anything else?";

// A sentence that trails off on a conjunction, preposition, article or filler is probably unfinished — give
// the speaker more silence before we assume they're done. A trailing comma/dash reads the same way.
const UNFINISHED_TAIL = /(?:[,\-–—]|\b(?:and|but|so|or|the|a|an|to|of|for|with|about|at|in|on|is|are|that|this|what|how|if|when|because|then|um+|uh+|er+|like|i|we|you|my|our|their|its)\s*)$/i;

// How long to wait for more speech after the latest words, given what's been heard so far.
export function endpointDelay(text, cfg = CONVO) {
  const t = String(text || "").trim();
  if (!t) return cfg.endSilenceMs;
  return UNFINISHED_TAIL.test(t) ? cfg.unfinishedSilenceMs : cfg.endSilenceMs;
}

// Filler-only or empty/too-short transcripts are microphone noise, not a command — never act on them. This
// is what stops the assistant "responding when you haven't said anything".
const FILLER_ONLY = /^(?:\s*(?:u+m+|u+h+|h+m+|e+r+|a+h+|m+|eh|huh|hm|mhm|uhh?)\s*)+$/i;
export function isNoise(text) {
  const t = String(text || "").trim();
  if (t.length < 2) return true;          // empty or a stray character
  if (!/[a-z0-9]/i.test(t)) return true;  // punctuation only
  if (FILLER_ONLY.test(t)) return true;   // only "um/uh/hmm…"
  return false;
}

// Should an interim transcript heard WHILE the assistant is speaking interrupt it? Only genuine speech —
// long enough and not filler — so the assistant's own audio or a cough doesn't cut the reply short.
export function isBargeIn(interim, cfg = CONVO) {
  const t = String(interim || "").trim();
  return t.length >= cfg.bargeMinChars && !isNoise(t);
}

// Supported spoken languages (BCP-47 for the recognizer + a label for spoken confirmations). Extend here.
export const LANGS = {
  en: { label: "English", bcp47: "en-US" },
  es: { label: "Spanish", bcp47: "es-ES" },
  ar: { label: "Arabic",  bcp47: "ar-SA" },
};
export function langFromPhrase(text) {
  const t = String(text || "").toLowerCase();
  // \b word boundaries don't apply to Arabic script, so match the native terms as plain substrings.
  if (/english|inglés|ingles/.test(t) || t.includes("الإنجليزية") || t.includes("انجليزي")) return "en";
  if (/spanish|español|espanol|castellano/.test(t) || t.includes("الإسبانية") || t.includes("اسباني")) return "es";
  if (/arabic|árabe|arabe/.test(t) || t.includes("العربية") || t.includes("عربي")) return "ar";
  return null;
}

// Local conversation CONTROLS — meta-commands about the conversation itself, handled on the client with NO
// Claude call (spec §8/§11). Returns a control intent or null (null → treat as a normal request). Kept pure
// so it's unit-tested. Content questions ("explain that", "open that project") are intentionally NOT here —
// they still go to the interpreter.
export function parseVoiceControl(text) {
  const t = String(text || "").toLowerCase().trim().replace(/[.!?]+$/, "");
  if (!t) return null;
  if (/^(stop( talking| speaking)?|be quiet|quiet|shush|shut up|hush)$/.test(t)) return { kind: "stop" };
  if (/^(wait|hold on|hang on|one (second|sec|moment)|pause)$/.test(t)) return { kind: "wait" };
  if (/^(repeat( that)?|say (that|it) again|come again|what did you say|again)$/.test(t)) return { kind: "repeat" };
  if (/\b(slow(er)?|slow down|too fast)\b/.test(t)) return { kind: "rate", delta: -0.12 };
  if (/\b(faster|speed up|hurry( up)?|too slow)\b/.test(t)) return { kind: "rate", delta: +0.12 };
  if (/\b(keep it short|be brief|shorter|briefly|in short|tl;?dr)\b/.test(t)) return { kind: "brief", on: true };
  if (/\b(more detail|go into detail|be detailed|full detail|longer)\b/.test(t)) return { kind: "brief", on: false };
  if (/^(continue|go on|keep going|resume|carry on)$/.test(t)) return { kind: "continue" };
  if (/^(go back|back|previous page)$/.test(t)) return { kind: "back" };
  // "speak spanish", "answer in arabic", "switch to english", "in english please"
  if (/\b(speak|answer|respond|reply|switch to|change to|talk|say it|in)\b/.test(t)) { const lang = langFromPhrase(t); if (lang) return { kind: "lang", lang }; }
  return null;
}

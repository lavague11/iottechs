"use client";
import { useState, useRef, useEffect } from "react";

// Reusable dictation mic — free browser Web Speech API for live transcription, then a Claude Haiku
// polish (grammar/punctuation, drops "um/uh/like"; ~$0.0001/note, fails soft to the raw text). Drop it
// next to any text field: <MicButton value={text} onChange={setText} />. Icon-only, inherits color, so
// it fits both dark and light surfaces. Renders nothing where the browser has no speech support.
export default function MicButton({ value = "", onChange, title = "Dictate", size = 16 }) {
  const [listening, setListening] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const recRef = useRef(null);
  const valRef = useRef(value); valRef.current = value;
  const gotSpeechRef = useRef(false);
  const speechOK = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* noop */ } }, []);
  if (!speechOK) return null;

  const tidy = (s) => String(s || "").replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1")
    .replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase()).trim();

  async function polish(text) {
    const t = (text || "").trim(); if (!t) return;
    setPolishing(true);
    try {
      const r = await fetch("/api/clean-dictation", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ text: t }),
      }).then((x) => x.json()).catch(() => null);
      if (r?.ok && r.text) onChange?.(r.text);
    } catch { /* keep raw */ }
    setPolishing(false);
  }

  function toggle(e) {
    e?.preventDefault?.(); e?.stopPropagation?.();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { try { recRef.current?.stop(); } catch { /* stopped */ } return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = true; rec.continuous = true;
    let base = valRef.current ? valRef.current.replace(/\s+$/, "") + " " : "";
    rec.onresult = (ev) => {
      let finalT = "", interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalT += t + " "; else interim += t;
      }
      if (finalT) { base = tidy(base + finalT) + " "; gotSpeechRef.current = true; }
      onChange?.(tidy(base + interim));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false); recRef.current = null;
      const finalText = tidy(base); onChange?.(finalText);
      if (gotSpeechRef.current) { gotSpeechRef.current = false; polish(finalText); }
    };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  }

  return (
    <button type="button" className={`micb${listening ? " on" : ""}${polishing ? " busy" : ""}`}
      onClick={toggle} disabled={polishing} title={polishing ? "Polishing…" : listening ? "Stop dictation" : title} aria-label={title}>
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
      </svg>
      <style>{`
        .micb{display:inline-flex;align-items:center;justify-content:center;width:${size + 16}px;height:${size + 16}px;padding:0;
          border:0;background:transparent;color:inherit;cursor:pointer;border-radius:50%;opacity:.6;transition:opacity .15s}
        .micb:hover{opacity:1}
        .micb.on{opacity:1;color:#e0574a}
        .micb.on svg{animation:micbPulse 1s ease-in-out infinite}
        .micb.busy{opacity:1;color:#c9a96e}
        .micb.busy svg{animation:micbSpin 1s linear infinite}
        .micb:disabled{cursor:default}
        @keyframes micbPulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes micbSpin{to{transform:rotate(360deg)}}
      `}</style>
    </button>
  );
}

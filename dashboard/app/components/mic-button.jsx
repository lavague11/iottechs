"use client";
import { useState, useRef, useEffect } from "react";

// Reusable dictation mic — free browser Web Speech API for live transcription in ANY supported
// language, then a Claude Haiku polish (grammar/punctuation, drops filler; keeps the language + wording;
// ~$0.0001/note, fails soft to raw). Drop it next to any field: <MicButton value={text} onChange={setText} />.
// A small globe lets you pick the spoken language (Web Speech doesn't auto-detect); the choice is
// remembered across the app. Icon-only, inherits color, renders nothing where speech is unsupported.
const LANGS = [
  { code: "en-US", label: "English", short: "EN" },
  { code: "es-ES", label: "Español", short: "ES" },
  { code: "fr-FR", label: "Français", short: "FR" },
  { code: "ar-SA", label: "العربية", short: "AR" },
  { code: "zh-CN", label: "中文", short: "ZH" },
  { code: "de-DE", label: "Deutsch", short: "DE" },
  { code: "pt-BR", label: "Português", short: "PT" },
  { code: "hi-IN", label: "हिन्दी", short: "HI" },
  { code: "ru-RU", label: "Русский", short: "RU" },
  { code: "ja-JP", label: "日本語", short: "JA" },
  { code: "it-IT", label: "Italiano", short: "IT" },
  { code: "ko-KR", label: "한국어", short: "KO" },
  { code: "tr-TR", label: "Türkçe", short: "TR" },
  { code: "pl-PL", label: "Polski", short: "PL" },
];
const LS_KEY = "iot_dictation_lang";
function defaultLang() {
  try { const saved = localStorage.getItem(LS_KEY); if (saved && LANGS.some((l) => l.code === saved)) return saved; } catch { /* private mode */ }
  try { const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    const hit = LANGS.find((l) => l.code.slice(0, 2).toLowerCase() === nav); if (hit) return hit.code; } catch { /* noop */ }
  return "en-US";
}

export default function MicButton({ value = "", onChange, title = "Dictate", size = 16 }) {
  const [listening, setListening] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [lang, setLang] = useState("en-US");
  const [menu, setMenu] = useState(false);
  const recRef = useRef(null);
  const valRef = useRef(value); valRef.current = value;
  const langRef = useRef(lang); langRef.current = lang;
  const gotSpeechRef = useRef(false);
  const speechOK = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => { setLang(defaultLang()); }, []);
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* noop */ } }, []);
  if (!speechOK) return null;

  const cur = LANGS.find((l) => l.code === lang) || LANGS[0];
  const setLangSaved = (code) => { setLang(code); langRef.current = code; setMenu(false); try { localStorage.setItem(LS_KEY, code); } catch { /* noop */ } };

  // Capitalize sentence starts only for Latin scripts (harmless no-op for Arabic/Chinese/etc.).
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
    rec.lang = langRef.current; rec.interimResults = true; rec.continuous = true;
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
    <span className="micwrap">
      <button type="button" className="micb-lang" onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }}
        title={`Dictation language: ${cur.label}`} aria-label="Dictation language">{cur.short}</button>
      {menu && (
        <>
          <span className="micb-scrim" onClick={() => setMenu(false)} />
          <span className="micb-menu" role="menu">
            {LANGS.map((l) => (
              <button key={l.code} type="button" className={`micb-mi${l.code === lang ? " on" : ""}`} onClick={() => setLangSaved(l.code)}>
                <span className="micb-mi-s">{l.short}</span>{l.label}
              </button>
            ))}
          </span>
        </>
      )}
      <button type="button" className={`micb${listening ? " on" : ""}${polishing ? " busy" : ""}`}
        onClick={toggle} disabled={polishing} title={polishing ? "Polishing…" : listening ? "Stop dictation" : `${title} (${cur.label})`} aria-label={title}>
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
        </svg>
      </button>
      <style>{`
        .micwrap{position:relative;display:inline-flex;align-items:center;gap:2px}
        .micb-lang{border:0;background:transparent;color:inherit;cursor:pointer;font:700 .62rem/1 inherit;letter-spacing:.03em;
          opacity:.5;padding:3px 4px;border-radius:5px;transition:opacity .15s}
        .micb-lang:hover{opacity:.9}
        .micb{display:inline-flex;align-items:center;justify-content:center;width:${size + 16}px;height:${size + 16}px;padding:0;
          border:0;background:transparent;color:inherit;cursor:pointer;border-radius:50%;opacity:.6;transition:opacity .15s}
        .micb:hover{opacity:1}
        .micb.on{opacity:1;color:#e0574a}
        .micb.on svg{animation:micbPulse 1s ease-in-out infinite}
        .micb.busy{opacity:1;color:#c9a96e}
        .micb.busy svg{animation:micbSpin 1s linear infinite}
        .micb:disabled{cursor:default}
        .micb-scrim{position:fixed;inset:0;z-index:60}
        .micb-menu{position:absolute;bottom:calc(100% + 6px);right:0;z-index:61;display:flex;flex-direction:column;min-width:150px;max-height:240px;overflow:auto;
          background:#fff;color:#12151b;border:1px solid #e4e4df;border-radius:11px;padding:5px;box-shadow:0 18px 40px -12px rgba(0,0,0,.4)}
        .micb-mi{display:flex;align-items:center;gap:9px;border:0;background:transparent;cursor:pointer;font:600 .82rem/1 inherit;color:#12151b;
          text-align:left;padding:8px 9px;border-radius:8px;white-space:nowrap}
        .micb-mi:hover{background:#f2f2ef}
        .micb-mi.on{background:#12151b;color:#fff}
        .micb-mi-s{display:inline-flex;align-items:center;justify-content:center;width:26px;font-size:.62rem;font-weight:800;opacity:.6}
        .micb-mi.on .micb-mi-s{opacity:.9}
        @keyframes micbPulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes micbSpin{to{transform:rotate(360deg)}}
      `}</style>
    </span>
  );
}

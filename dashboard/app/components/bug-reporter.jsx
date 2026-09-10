"use client";
import { useState, useRef, useEffect } from "react";

// Site-wide "Report a bug" button — mounted once in the root layout, so it sits at the bottom of every
// page. Opens a small form: describe it + attach/paste a screenshot. Files to /api/bug-report; staff
// resolve them at /bugs. The screenshot uploads through /api/media (staff), text always submits.
export default function BugReporter() {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [img, setImg] = useState(null);        // { file, preview }
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);
  const [listening, setListening] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const gotSpeechRef = useRef(false);
  const descRef = useRef("");
  descRef.current = desc;

  // Polish the dictation with Claude Haiku — grammar/punctuation cleanup, fillers removed. Fails soft:
  // a hiccup or a missing key just leaves the raw (already-decent) transcription.
  async function polish(text) {
    const t = (text || "").trim(); if (!t) return;
    setPolishing(true);
    try {
      const r = await fetch("/api/clean-dictation", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ text: t }),
      }).then((x) => x.json()).catch(() => null);
      if (r?.ok && r.text) setDesc(r.text);
    } catch { /* keep raw */ }
    setPolishing(false);
  }

  // Dictation — the browser's built-in Web Speech API (free, no API key). It already punctuates; we
  // just tidy spacing + sentence capitalization. Chromium/Safari support it; other browsers hide the mic.
  const speechOK = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  function tidy(s) {
    return String(s || "").replace(/\s+/g, " ").replace(/\s+([,.!?;:])/g, "$1")
      .replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase()).trim();
  }
  function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setErr("Dictation isn't supported in this browser."); return; }
    if (listening) { try { recRef.current?.stop(); } catch { /* already stopped */ } return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = true; rec.continuous = true;
    let base = descRef.current ? descRef.current.replace(/\s+$/, "") + " " : "";
    rec.onresult = (e) => {
      let finalT = "", interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalT += t + " "; else interim += t;
      }
      if (finalT) { base = tidy(base + finalT) + " "; gotSpeechRef.current = true; }
      setDesc(tidy(base + interim));
    };
    rec.onerror = (e) => { if (e.error !== "no-speech") setErr("Dictation error — try again."); setListening(false); };
    rec.onend = () => {
      setListening(false); recRef.current = null;
      const finalText = tidy(base); setDesc(finalText);
      if (gotSpeechRef.current) { gotSpeechRef.current = false; polish(finalText); }   // auto clean-up with Haiku
    };
    recRef.current = rec; setErr(null);
    try { rec.start(); setListening(true); } catch { setListening(false); }
  }
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* noop */ } }, []);

  function pickImage(file) {
    if (!file || !file.type?.startsWith("image/")) return;
    setImg({ file, preview: URL.createObjectURL(file) });
  }
  // Paste a screenshot straight from the clipboard while the form is open.
  useEffect(() => {
    if (!open) return;
    function onPaste(e) {
      const it = [...(e.clipboardData?.items || [])].find((x) => x.type?.startsWith("image/"));
      if (it) { const f = it.getAsFile(); if (f) pickImage(f); }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  async function submit() {
    if (busy) return;
    const d = desc.trim();
    if (!d) { setErr("Describe the bug first."); return; }
    setBusy(true); setErr(null);
    let imageUrl = null;
    if (img?.file) {
      try {
        const fd = new FormData();
        fd.append("file", img.file, img.file.name || "bug.png");
        fd.append("kind", "bug");
        const j = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" }).then((r) => r.ok ? r.json() : null).catch(() => null);
        if (j?.ok && j.url) imageUrl = j.url;
      } catch { /* attach is best-effort; the report still files without it */ }
    }
    const r = await fetch("/api/bug-report", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ description: d, url: location.href, path: location.pathname, imageUrl }),
    }).then((x) => x.json()).catch(() => ({ error: "Network error." }));
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setDone(true);
    setTimeout(() => { setOpen(false); setDone(false); setDesc(""); setImg(null); }, 1400);
  }

  return (
    <>
      <button className="bugr-fab" onClick={() => setOpen(true)} aria-label="Report a bug" title="Report a bug">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l1.5 2.5M16 2l-1.5 2.5" /><rect x="7" y="6" width="10" height="12" rx="5" /><path d="M12 6v12M3 9h4M17 9h4M3 14h4M17 14h4M3 19l4-2M17 17l4 2" /></svg>
      </button>

      {open && (
        <div className="bugr-scrim" onClick={(e) => { if (e.target.classList.contains("bugr-scrim")) setOpen(false); }}>
          <div className="bugr-card" role="dialog" aria-label="Report a bug">
            {done ? (
              <div className="bugr-done">
                <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                <span>Thanks — filed to the bug portal.</span>
              </div>
            ) : (
              <>
                <div className="bugr-head">
                  <span className="bugr-title">Report a bug</span>
                  <button className="bugr-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
                </div>
                <textarea className="bugr-in" autoFocus rows={4} value={desc} maxLength={4000}
                  onChange={(e) => setDesc(e.target.value)} placeholder="What went wrong? What did you expect?" />
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
                <div className="bugr-tools">
                  {img ? (
                    <div className="bugr-thumb">
                      <img src={img.preview} alt="attachment" />
                      <button className="bugr-thumbx" onClick={() => setImg(null)} aria-label="Remove image">✕</button>
                    </div>
                  ) : (
                    <button className="bugr-attach" onClick={() => fileRef.current?.click()}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
                      Attach a screenshot <span className="bugr-hint">or paste</span>
                    </button>
                  )}
                  {speechOK && (
                    <button className={`bugr-mic${listening ? " on" : ""}`} onClick={toggleMic} disabled={polishing} title={listening ? "Stop dictation" : "Dictate"} aria-label="Dictate">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>
                      {listening ? "Listening…" : polishing ? "Polishing…" : "Dictate"}
                    </button>
                  )}
                </div>
                {err && <div className="bugr-err">{err}</div>}
                <div className="bugr-act">
                  <button className="bugr-ghost" onClick={() => setOpen(false)}>Cancel</button>
                  <button className="bugr-send" disabled={busy || polishing || !desc.trim()} onClick={submit}>{busy ? "Sending…" : "Send report"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.bugr-fab{position:fixed;right:14px;bottom:14px;z-index:2147483000;display:inline-flex;align-items:center;justify-content:center;
  width:34px;height:34px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.14);
  background:#12151b;color:#f0a04b;cursor:pointer;
  box-shadow:0 6px 20px -6px rgba(0,0,0,.5);opacity:.66;transition:opacity .16s,transform .16s}
.bugr-fab:hover{opacity:1;transform:translateY(-1px)}
.bugr-scrim{position:fixed;inset:0;z-index:2147483001;background:rgba(8,10,14,.5);backdrop-filter:blur(2px);
  display:flex;align-items:flex-end;justify-content:flex-end;padding:16px}
.bugr-card{width:min(420px,94vw);background:#fff;color:#12151b;border-radius:16px;padding:16px;
  box-shadow:0 24px 60px -12px rgba(0,0,0,.5);font-family:system-ui,-apple-system,Segoe UI,sans-serif;animation:bugrIn .18s ease}
@keyframes bugrIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.bugr-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.bugr-title{font-size:.98rem;font-weight:800}
.bugr-x{border:0;background:none;font-size:.9rem;color:#8a9099;cursor:pointer;padding:4px}
.bugr-in{width:100%;box-sizing:border-box;border:1px solid #e2e5ea;border-radius:10px;padding:10px 12px;font:inherit;
  font-size:.88rem;resize:vertical;outline:none;color:#12151b;background:#fbfbfc}
.bugr-in:focus{border-color:#12151b}
.bugr-tools{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}
.bugr-attach{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:9px;
  border:1px dashed #cfd4db;background:#fff;color:#4a5058;font:600 .8rem/1 inherit;cursor:pointer}
.bugr-attach:hover{border-color:#12151b;color:#12151b}
.bugr-mic{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:9px;
  border:1px solid #cfd4db;background:#fff;color:#4a5058;font:600 .8rem/1 inherit;cursor:pointer}
.bugr-mic:hover{border-color:#12151b;color:#12151b}
.bugr-mic:disabled{opacity:.6;cursor:default}
.bugr-mic.on{border-color:#c4553d;color:#c4553d;background:#fdf2f0}
.bugr-mic.on svg{animation:bugrPulse 1s ease-in-out infinite}
@keyframes bugrPulse{0%,100%{opacity:1}50%{opacity:.35}}
.bugr-hint{color:#9aa0a8;font-weight:500}
.bugr-thumb{position:relative;display:inline-block}
.bugr-thumb img{max-height:120px;max-width:100%;border-radius:10px;border:1px solid #e2e5ea;display:block}
.bugr-thumbx{position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;border:0;background:#12151b;color:#fff;cursor:pointer;font-size:.7rem}
.bugr-err{margin-top:9px;font-size:.8rem;color:#c4553d;font-weight:600}
.bugr-act{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.bugr-ghost{height:36px;padding:0 14px;border:1px solid #e2e5ea;border-radius:9px;background:#fff;color:#4a5058;font:600 .84rem/1 inherit;cursor:pointer}
.bugr-send{height:36px;padding:0 18px;border:0;border-radius:9px;background:#12151b;color:#fff;font:700 .84rem/1 inherit;cursor:pointer}
.bugr-send:disabled{opacity:.5;cursor:default}
.bugr-done{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 10px;text-align:center;color:#2e7d5b;font-weight:700}
@media (max-width:560px){ .bugr-scrim{align-items:flex-end;justify-content:center} .bugr-fab{height:32px} }
`;

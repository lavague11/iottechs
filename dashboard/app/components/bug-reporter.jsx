"use client";
import { useState, useRef, useEffect } from "react";
import MicButton from "./mic-button";
import IconButton from "./ui/icon-button";
import ScreenshotAnnotator from "./screenshot-annotator";
import { captureViewport, prewarm } from "../../lib/bug-capture";

const MAX_SHOTS = 10;

function dataURLtoFile(dataUrl, name) {
  const [head, b64] = dataUrl.split(",");
  const mime = (head.match(/:(.*?);/) || [])[1] || "image/png";
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}
const readDataURL = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
const uid = () => Math.random().toString(36).slice(2);
async function uploadMedia(file) {
  try {
    const fd = new FormData(); fd.append("file", file, file.name || "bug.png"); fd.append("kind", "bug");
    const j = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return j?.ok && j.url ? j.url : null;
  } catch { return null; }
}

// Site-wide "Report" button — mounted once in the root layout. Describe it + capture/attach/paste
// MULTIPLE screenshots (each independently marked up) + dictate. The whole draft AUTOSAVES to the
// server as you work (debounced), so a refresh/close never loses it; screenshots upload to /api/media
// in the background and the draft keeps only their URLs + vector annotations. On staff pages a
// sanitized error/route context rides along. Submit files one report; the draft is then cleared.
//
// shots: [{ id, preview, cleanShot, shapes, file, url, cleanUrl, uploading }]
//   preview  — flattened image shown in the strip (data URL, or the uploaded URL after restore)
//   cleanShot— unannotated base for re-editing (data URL, or cleanUrl after restore)
//   url/cleanUrl — media URLs once background upload finishes (what the draft/report persist)
export default function BugReporter() {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [shots, setShots] = useState([]);
  const [editor, setEditor] = useState(null);   // { id|null, shot(cleanURL), shapes }
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const fileRef = useRef(null);
  const loadedRef = useRef(false);               // draft loaded for this open? (gates autosave)
  const saveTimer = useRef(null);

  const atLimit = shots.length >= MAX_SHOTS;
  function removeShot(id) { setShots((prev) => prev.filter((s) => s.id !== id)); }

  // Add a finished shot immediately (from its data URL) and upload it in the background.
  function addFinal({ preview, cleanShot, shapes }) {
    const id = uid();
    setShots((prev) => (prev.length >= MAX_SHOTS ? prev : [...prev, { id, preview, cleanShot, shapes, file: dataURLtoFile(preview, `bug-${Date.now()}.png`), url: null, cleanUrl: null, uploading: true }]));
    uploadShot(id, preview, cleanShot);
  }
  async function uploadShot(id, preview, cleanShot) {
    const url = await uploadMedia(dataURLtoFile(preview, `bug-${Date.now()}.png`));
    const cleanUrl = cleanShot && cleanShot !== preview ? await uploadMedia(dataURLtoFile(cleanShot, `clean-${Date.now()}.png`)) : url;
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, url, cleanUrl, uploading: false } : s)));
  }

  async function pickImage(file) {           // Attach / paste — direct add
    if (!file || !file.type?.startsWith("image/") || atLimit) return;
    const url = await readDataURL(file);
    addFinal({ preview: url, cleanShot: url, shapes: [] });
  }

  // DOM capture — renders the current app viewport (cross-browser, iOS included). The Report UI and FAB
  // carry data-bug-capture-ignore so html2canvas's clone omits them; the live page is never touched, so
  // no hide/blur/flash. On real failure we surface a compact error and Attach remains.
  async function capture() {
    if (atLimit || capturing) return;
    setErr(null); setCapturing(true);
    try {
      const { dataUrl } = await captureViewport();
      setEditor({ id: null, shot: dataUrl, shapes: [] });
    } catch { setErr("Capture failed — attach or paste one instead."); }
    finally { setCapturing(false); }
  }
  function onAnnotated(dataUrl, nextShapes) {
    const ed = editor;
    if (ed?.id) {
      // re-marked an existing shot — replace its flattened image + shapes, re-upload the flattened
      setShots((prev) => prev.map((s) => (s.id === ed.id ? { ...s, preview: dataUrl, shapes: nextShapes || [], file: dataURLtoFile(dataUrl, `bug-${Date.now()}.png`), uploading: true } : s)));
      (async () => { const url = await uploadMedia(dataURLtoFile(dataUrl, `bug-${Date.now()}.png`)); setShots((prev) => prev.map((s) => (s.id === ed.id ? { ...s, url, uploading: false } : s))); })();
    } else {
      addFinal({ preview: dataUrl, cleanShot: ed?.shot || dataUrl, shapes: nextShapes || [] });
    }
    setEditor(null);
  }

  // Restore the autosaved draft when the report opens (only into an empty form), and warm the capture lib.
  useEffect(() => {
    if (!open) { loadedRef.current = false; return; }
    loadedRef.current = false;
    prewarm();
    fetch("/api/bug-draft", { credentials: "same-origin" }).then((r) => r.json()).then((j) => {
      const d = j?.draft;
      if (d && (d.description || d.shots?.length)) {
        setDesc((cur) => cur || d.description || "");
        if (d.shots?.length) setShots((cur) => (cur.length ? cur : d.shots.map((s) => ({ id: uid(), preview: s.url, cleanShot: s.cleanUrl || s.url, shapes: s.shapes || [], file: null, url: s.url, cleanUrl: s.cleanUrl || s.url, uploading: false }))));
      }
    }).catch(() => { /* offline → keep editing */ }).finally(() => { loadedRef.current = true; });
  }, [open]);

  // Debounced autosave — persists text + already-uploaded shots. Skips the initial restore render and
  // never saves an empty draft (that's what Discard/Send are for).
  useEffect(() => {
    if (!open || !loadedRef.current) return;
    const uploaded = shots.filter((s) => s.url).map((s) => ({ url: s.url, cleanUrl: s.cleanUrl, shapes: s.shapes }));
    if (!desc.trim() && uploaded.length === 0) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/bug-draft", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ description: desc, shots: uploaded }) }).catch(() => { /* retried on next change */ });
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [desc, shots, open]);

  // Paste a screenshot from the clipboard; Escape closes (the editor owns Escape while it's up).
  useEffect(() => {
    if (!open) return;
    function onPaste(e) { const it = [...(e.clipboardData?.items || [])].find((x) => x.type?.startsWith("image/")); if (it) { const f = it.getAsFile(); if (f) pickImage(f); } }
    function onKey(e) { if (e.key === "Escape" && !editor && !capturing) setOpen(false); }
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("paste", onPaste); window.removeEventListener("keydown", onKey); };
  }, [open, editor, capturing, shots.length]);

  function clearDraft() { fetch("/api/bug-draft", { method: "DELETE", credentials: "same-origin" }).catch(() => {}); }
  function discard() { clearTimeout(saveTimer.current); clearDraft(); setShots([]); setDesc(""); setErr(null); setOpen(false); }

  async function submit() {
    if (busy) return;
    const d = desc.trim();
    if (!d) { setErr("Describe the bug first."); return; }
    setBusy(true); setErr(null);
    const imageUrls = [];
    for (const s of shots) {
      if (s.url) { imageUrls.push(s.url); continue; }
      if (s.file) { const u = await uploadMedia(s.file); if (u) imageUrls.push(u); }
    }
    let context = null;
    try { if (typeof window !== "undefined" && window.__iotBugContext) context = window.__iotBugContext(); } catch { /* noop */ }
    const r = await fetch("/api/bug-report", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ description: d, url: location.href, path: location.pathname, imageUrls, context }),
    }).then((x) => x.json()).catch(() => ({ error: "Network error." }));
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    clearTimeout(saveTimer.current); clearDraft();
    setDone(true);
    setTimeout(() => { setOpen(false); setDone(false); setShots([]); setDesc(""); }, 1400);
  }

  const hasContent = !!desc.trim() || shots.length > 0;

  return (
    <>
      <button className="bugr-fab" data-bug-capture-ignore onClick={() => setOpen(true)} aria-label="Report" title="Report">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l1.5 2.5M16 2l-1.5 2.5" /><rect x="7" y="6" width="10" height="12" rx="5" /><path d="M12 6v12M3 9h4M17 9h4M3 14h4M17 14h4M3 19l4-2M17 17l4 2" /></svg>
      </button>

      {open && (
        <div className="bugr-scrim" data-bug-capture-ignore hidden={!!editor} onClick={(e) => { if (e.target.classList.contains("bugr-scrim")) setOpen(false); }}>
          <div className="bugr-card" role="dialog" aria-label="Report">
            {done ? (
              <div className="bugr-done">
                <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                <span>Filed to the portal.</span>
              </div>
            ) : (
              <>
                <div className="bugr-head">
                  <span className="bugr-title">Report</span>
                  <button className="bugr-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
                </div>
                <textarea className="bugr-in" autoFocus rows={4} value={desc} maxLength={4000}
                  onChange={(e) => setDesc(e.target.value)} placeholder="What happened?" />
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />

                {shots.length > 0 && (
                  <div className="bugr-strip">
                    {shots.map((s, i) => (
                      <div className={`bugr-chip${s.uploading ? " up" : ""}`} key={s.id}>
                        <button className="bugr-chip-img" onClick={() => setEditor({ id: s.id, shot: s.cleanShot, shapes: s.shapes })} aria-label={`Edit screenshot ${i + 1}`} title="Edit">
                          <img src={s.preview} alt={`screenshot ${i + 1}`} />
                        </button>
                        <button className="bugr-chip-x" onClick={() => removeShot(s.id)} aria-label={`Remove screenshot ${i + 1}`}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bugr-tools">
                  <div className="bugr-icons">
                    <IconButton label={atLimit ? "Limit reached" : (capturing ? "Capturing" : "Capture")} disabled={capturing || atLimit} onClick={capture}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                    </IconButton>
                    <IconButton label="Attach" disabled={atLimit} onClick={() => fileRef.current?.click()}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.5 12.5 21a4 4 0 0 1-5.66-5.66l8.49-8.49a2.5 2.5 0 0 1 3.54 3.54l-8.49 8.49a1 1 0 0 1-1.42-1.42l7.78-7.78" /></svg>
                    </IconButton>
                    <span className="bugr-mic"><MicButton value={desc} onChange={setDesc} /></span>
                    {shots.length > 0 && <span className="bugr-count">{shots.length}/{MAX_SHOTS}</span>}
                  </div>
                </div>
                {err && <div className="bugr-err">{err}</div>}
                <div className="bugr-act">
                  {hasContent && <button className="bugr-discard" onClick={discard} title="Discard draft">Discard</button>}
                  <span className="bugr-spacer" />
                  <button className="bugr-ghost" onClick={() => setOpen(false)}>Cancel</button>
                  <button className="bugr-send" disabled={busy || !desc.trim()} onClick={submit}>{busy ? "Sending…" : "Send"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {editor && <ScreenshotAnnotator shot={editor.shot} initialShapes={editor.shapes} onDone={onAnnotated} onCancel={() => setEditor(null)} />}

      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.bugr-fab{position:fixed;right:14px;bottom:14px;z-index:2147483000;display:inline-flex;align-items:center;justify-content:center;
  width:34px;height:34px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.14);
  background:#12151b;color:#f0a04b;cursor:pointer;box-shadow:0 6px 20px -6px rgba(0,0,0,.5);opacity:.66;transition:opacity .16s,transform .16s}
.bugr-fab:hover{opacity:1;transform:translateY(-1px)}
/* the modal FLOATS over the page — no dim, no blur, no filter on what's behind it. */
.bugr-scrim{position:fixed;inset:0;z-index:2147483001;background:transparent;
  display:flex;align-items:flex-end;justify-content:flex-end;padding:16px}
.bugr-card{width:min(400px,94vw);background:#fff;color:#12151b;border-radius:16px;padding:16px;
  border:1px solid rgba(0,0,0,.08);box-shadow:0 12px 34px -10px rgba(0,0,0,.28),0 2px 8px -2px rgba(0,0,0,.12);
  font-family:system-ui,-apple-system,Segoe UI,sans-serif;animation:bugrIn .18s ease}
@keyframes bugrIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.bugr-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.bugr-title{font-size:.98rem;font-weight:800}
.bugr-x{border:0;background:none;font-size:.9rem;color:#8a9099;cursor:pointer;padding:4px}
.bugr-in{width:100%;box-sizing:border-box;border:1px solid #e2e5ea;border-radius:10px;padding:10px 12px;font:inherit;
  font-size:.88rem;resize:vertical;outline:none;color:#12151b;background:#fbfbfc}
.bugr-in:focus{border-color:#12151b}
.bugr-strip{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.bugr-chip{position:relative;width:60px;height:46px}
.bugr-chip-img{width:60px;height:46px;padding:0;border:1px solid #e2e5ea;border-radius:8px;overflow:hidden;background:#fafafa;cursor:pointer;line-height:0}
.bugr-chip-img img{width:100%;height:100%;object-fit:cover;display:block}
.bugr-chip-img:hover{border-color:#12151b}
.bugr-chip.up .bugr-chip-img{opacity:.6}
.bugr-chip.up::after{content:"";position:absolute;left:50%;top:23px;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
  border:2px solid rgba(0,0,0,.2);border-top-color:#12151b;animation:bugrSpin .7s linear infinite}
@keyframes bugrSpin{to{transform:rotate(360deg)}}
.bugr-chip-x{position:absolute;top:-7px;right:-7px;width:19px;height:19px;border-radius:50%;border:0;background:#12151b;color:#fff;cursor:pointer;font-size:.62rem;line-height:1}
.bugr-tools{display:flex;align-items:center;gap:8px;margin-top:10px;min-height:36px}
.bugr-icons{display:flex;align-items:center;gap:2px;color:#4a5058}
.bugr-mic{display:inline-flex;align-items:center;color:#4a5058}
.bugr-count{margin-left:6px;font-size:.72rem;font-weight:700;color:#9aa0a8}
.bugr-err{margin-top:9px;font-size:.8rem;color:#c4553d;font-weight:600}
.bugr-act{display:flex;align-items:center;gap:8px;margin-top:14px}
.bugr-spacer{flex:1}
.bugr-discard{border:0;background:none;color:#a9836b;font:600 .8rem/1 inherit;cursor:pointer;padding:6px 2px}
.bugr-discard:hover{color:#c4553d;text-decoration:underline}
.bugr-ghost{height:36px;padding:0 14px;border:1px solid #e2e5ea;border-radius:9px;background:#fff;color:#4a5058;font:600 .84rem/1 inherit;cursor:pointer}
.bugr-send{height:36px;padding:0 20px;border:0;border-radius:9px;background:#12151b;color:#fff;font:700 .84rem/1 inherit;cursor:pointer}
.bugr-send:disabled{opacity:.5;cursor:default}
.bugr-done{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 10px;text-align:center;color:#2e7d5b;font-weight:700}
@media (max-width:560px){ .bugr-scrim{align-items:flex-end;justify-content:center} }
`;

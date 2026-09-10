"use client";
import { useState, useRef, useEffect } from "react";
import MicButton from "./mic-button";
import IconButton from "./ui/icon-button";
import ScreenshotAnnotator from "./screenshot-annotator";

function dataURLtoFile(dataUrl, name) {
  const [head, b64] = dataUrl.split(",");
  const mime = (head.match(/:(.*?);/) || [])[1] || "image/png";
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));

// Site-wide "Report" button — mounted once in the root layout, so it sits at the bottom of every page.
// Small form: describe it + capture/attach/paste a screenshot + dictate. Files to /api/bug-report;
// staff resolve at /bugs. Capture uses native tab capture (includes iframes); the bug-report UI and
// its blurred backdrop are removed from the DOM and given a real repaint BEFORE the frame is grabbed,
// so the screenshot is the clean, sharp page — never the dimmed/blurred overlay.
export default function BugReporter() {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [img, setImg] = useState(null);         // { file, preview } — flattened attachment
  const [cleanShot, setCleanShot] = useState(null); // unannotated capture (data URL), for re-editing
  const [shapes, setShapes] = useState([]);      // annotations on the current screenshot
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);
  const [shot, setShot] = useState(null);        // screenshot currently open in the editor
  const [capturing, setCapturing] = useState(false);
  const [canCapture, setCanCapture] = useState(true); // corrected on mount; false on iOS/Safari mobile
  const fileRef = useRef(null);
  const shotFileRef = useRef(null);              // picks an existing image to mark up (mobile path)

  // getDisplayMedia doesn't exist on iOS Safari — there's no way to grab the screen from the page. So
  // on those devices the camera button picks the shot the user already took and sends it to the editor.
  useEffect(() => { setCanCapture(!!navigator.mediaDevices?.getDisplayMedia); }, []);

  function pickImage(file) {
    if (!file || !file.type?.startsWith("image/")) return;
    setCleanShot(null); setShapes([]);
    setImg({ file, preview: URL.createObjectURL(file) });
  }
  // Route a chosen image straight into the annotator so mobile users still get red-pen markup.
  function pickForAnnotate(file) {
    if (!file || !file.type?.startsWith("image/")) return;
    const rd = new FileReader();
    rd.onload = () => { const url = String(rd.result); setCleanShot(url); setShapes([]); setShot(url); };
    rd.readAsDataURL(file);
  }

  // Capture the current tab (native — includes iframes). We acquire the stream first (the picker is
  // browser chrome, not captured), THEN remove every piece of bug-report UI and wait two frames + a
  // beat so the clean page is what the live stream is compositing, THEN grab a frame. No "hope the
  // blur went away" timeout — the hide → repaint → grab order is deterministic.
  async function capture() {
    if (!navigator.mediaDevices?.getDisplayMedia) { setErr("Screenshot isn't supported here — attach or paste one instead."); return; }
    setErr(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser", frameRate: 30 }, preferCurrentTab: true, audio: false });
    } catch { return; }                            // user cancelled the picker
    setCapturing(true);                            // adds .bugr-capturing → hides all bug UI + backdrop
    try {
      const video = document.createElement("video");
      video.srcObject = stream; video.muted = true; await video.play();
      await raf(); await raf();                     // let the hidden state composite into the stream
      await new Promise((r) => setTimeout(r, 90));  // one settle beat for the compositor
      const cv = document.createElement("canvas");
      cv.width = video.videoWidth; cv.height = video.videoHeight;
      cv.getContext("2d").drawImage(video, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL("image/png");
      setCleanShot(url); setShapes([]); setShot(url);
    } catch { setErr("Couldn't capture the screen — try again."); }
    finally { stream.getTracks().forEach((t) => t.stop()); setCapturing(false); }
  }
  function onAnnotated(dataUrl, nextShapes) {
    try { setImg({ file: dataURLtoFile(dataUrl, "bug-screenshot.png"), preview: dataUrl }); } catch { /* noop */ }
    setShapes(nextShapes || []); setShot(null);
  }
  function removeImg() { setImg(null); setCleanShot(null); setShapes([]); }

  // Toggle a root class while grabbing the frame so CSS removes the FAB, scrim and its blur from paint.
  useEffect(() => {
    const el = document.documentElement;
    if (capturing) el.classList.add("bugr-capturing"); else el.classList.remove("bugr-capturing");
    return () => el.classList.remove("bugr-capturing");
  }, [capturing]);

  // Paste a screenshot from the clipboard, and Escape closes — only while the form is open and no
  // screenshot editor is up (the editor owns Escape then).
  useEffect(() => {
    if (!open) return;
    function onPaste(e) {
      const it = [...(e.clipboardData?.items || [])].find((x) => x.type?.startsWith("image/"));
      if (it) { const f = it.getAsFile(); if (f) pickImage(f); }
    }
    function onKey(e) { if (e.key === "Escape" && !shot && !capturing) setOpen(false); }
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("paste", onPaste); window.removeEventListener("keydown", onKey); };
  }, [open, shot, capturing]);

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
    setTimeout(() => { setOpen(false); setDone(false); setDesc(""); removeImg(); }, 1400);
  }

  return (
    <>
      <button className="bugr-fab" onClick={() => setOpen(true)} aria-label="Report" title="Report">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l1.5 2.5M16 2l-1.5 2.5" /><rect x="7" y="6" width="10" height="12" rx="5" /><path d="M12 6v12M3 9h4M17 9h4M3 14h4M17 14h4M3 19l4-2M17 17l4 2" /></svg>
      </button>

      {open && (
        <div className="bugr-scrim" hidden={capturing || !!shot} onClick={(e) => { if (e.target.classList.contains("bugr-scrim")) setOpen(false); }}>
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
                <input ref={shotFileRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { pickForAnnotate(e.target.files?.[0]); e.target.value = ""; }} />
                <div className="bugr-tools">
                  {img ? (
                    <div className="bugr-thumb" onClick={() => cleanShot && setShot(cleanShot)} title={cleanShot ? "Edit markup" : undefined} style={{ cursor: cleanShot ? "pointer" : "default" }}>
                      <img src={img.preview} alt="attachment" />
                      <button className="bugr-thumbx" onClick={(e) => { e.stopPropagation(); removeImg(); }} aria-label="Remove">✕</button>
                    </div>
                  ) : (
                    <div className="bugr-icons">
                      <IconButton label={canCapture ? "Capture" : "Screenshot"} onClick={canCapture ? capture : () => shotFileRef.current?.click()} disabled={capturing}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                      </IconButton>
                      <IconButton label="Attach" onClick={() => fileRef.current?.click()}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.5 12.5 21a4 4 0 0 1-5.66-5.66l8.49-8.49a2.5 2.5 0 0 1 3.54 3.54l-8.49 8.49a1 1 0 0 1-1.42-1.42l7.78-7.78" /></svg>
                      </IconButton>
                      <span className="bugr-mic"><MicButton value={desc} onChange={setDesc} /></span>
                    </div>
                  )}
                </div>
                {err && <div className="bugr-err">{err}</div>}
                <div className="bugr-act">
                  <button className="bugr-ghost" onClick={() => setOpen(false)}>Cancel</button>
                  <button className="bugr-send" disabled={busy || !desc.trim()} onClick={submit}>{busy ? "Sending…" : "Send"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {shot && <ScreenshotAnnotator shot={shot} initialShapes={shapes} onDone={onAnnotated} onCancel={() => setShot(null)} />}

      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.bugr-fab{position:fixed;right:14px;bottom:14px;z-index:2147483000;display:inline-flex;align-items:center;justify-content:center;
  width:34px;height:34px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.14);
  background:#12151b;color:#f0a04b;cursor:pointer;box-shadow:0 6px 20px -6px rgba(0,0,0,.5);opacity:.66;transition:opacity .16s,transform .16s}
.bugr-fab:hover{opacity:1;transform:translateY(-1px)}
/* during a capture, keep the page pristine — no bug UI, no dim, no blur baked into the frame */
.bugr-capturing .bugr-fab,.bugr-capturing .bugr-scrim{visibility:hidden!important}
/* the modal FLOATS over the page — no dim, no blur, no filter on what's behind it. Depth comes from
   the card's own border + shadow. The transparent full-screen layer only catches click-outside. */
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
.bugr-tools{display:flex;align-items:center;gap:8px;margin-top:10px;min-height:36px}
.bugr-icons{display:flex;align-items:center;gap:2px;color:#4a5058}
.bugr-mic{display:inline-flex;align-items:center;color:#4a5058}
.bugr-thumb{position:relative;display:inline-block}
.bugr-thumb img{max-height:96px;max-width:100%;border-radius:10px;border:1px solid #e2e5ea;display:block}
.bugr-thumbx{position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;border:0;background:#12151b;color:#fff;cursor:pointer;font-size:.7rem}
.bugr-err{margin-top:9px;font-size:.8rem;color:#c4553d;font-weight:600}
.bugr-act{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.bugr-ghost{height:36px;padding:0 14px;border:1px solid #e2e5ea;border-radius:9px;background:#fff;color:#4a5058;font:600 .84rem/1 inherit;cursor:pointer}
.bugr-send{height:36px;padding:0 20px;border:0;border-radius:9px;background:#12151b;color:#fff;font:700 .84rem/1 inherit;cursor:pointer}
.bugr-send:disabled{opacity:.5;cursor:default}
.bugr-done{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 10px;text-align:center;color:#2e7d5b;font-weight:700}
@media (max-width:560px){ .bugr-scrim{align-items:flex-end;justify-content:center} }
`;

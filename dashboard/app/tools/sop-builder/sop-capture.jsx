"use client";

// Step 1 of the builder: get the photos in and get the person talking. Everything here is about
// CAPTURE — intake, decoding, upload, reordering, dictation — and it ends at the Build button, after
// which the editor takes over. Photos live in the parent (build() and the pre-build draft both need
// them); this owns the handling.
import { useState, useRef, useEffect } from "react";
import { uid, readURL, photoFrom, videoPoster, uploadMedia, uploadFileRaw, move, makeSortable } from "./sop-media";
import { Ic } from "./sop-icons";

export default function Capture({ photos, setPhotos, transcript, setTranscript, busy, status, onBuild, toast }) {
  const [upst, setUpst] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [recording, setRecording] = useState(false);
  const gridRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => {
    if (!gridRef.current) return;
    return makeSortable(gridRef.current, ".sopb-tile", ".sopb-tile", (a, b) => {
      setPhotos((p) => { const c = [...p]; move(c, a, b); return c; });
    }, 260);
  }, [photos.length, setPhotos]);

  // Shared by the file picker AND drag-and-drop. Dropped HEIC files from Windows often arrive with an
  // empty MIME type, so we don't gate on type here — photoFrom() tries to decode, and anything it
  // can't (HEIC) falls back to a raw /api/media upload that converts it server-side.
  async function addFiles(fileList) {
    const fs = [...(fileList || [])];
    if (!fs.length) return;
    let k = 0, bad = 0;
    for (const f of fs) {
      k++; setUpst(`Adding ${k} of ${fs.length}…`);
      if ((f.type || "").startsWith("video")) {
        // Video: keep it AS a video (played, not enhanced). Grab a poster still for the grid + AI
        // ordering, and upload the raw clip in parallel.
        const poster = await videoPoster(f);
        const id = uid();
        setPhotos((p) => [...p, { id, dataUrl: poster || "", isVideo: true }]);
        if (poster) uploadMedia(poster).then((url) => url && setPhotos((p) => p.map((x) => x.id === id ? { ...x, url } : x)));
        uploadFileRaw(f, "clip.mp4").then((vurl) => { if (vurl) setPhotos((p) => p.map((x) => x.id === id ? { ...x, video: vurl } : x)); else { bad++; setPhotos((p) => p.map((x) => x.id === id ? { ...x, failed: true } : x)); setUpst("Couldn't upload a video (25MB max)."); } });
      } else {
        const d = await photoFrom(f);
        if (d) { const id = uid(); setPhotos((p) => [...p, { id, dataUrl: d }]); uploadMedia(d).then((url) => url && setPhotos((p) => p.map((x) => x.id === id ? { ...x, url } : x))); }
        else {
          // The browser couldn't decode it client-side — almost always an iPhone HEIC/HEIF. Upload the
          // raw file; /api/media converts HEIC→JPEG server-side, then we fetch the converted JPEG back
          // for the grid preview + the AI build call (which needs the image bytes).
          const id = uid();
          const url = await uploadFileRaw(f, "photo.heic");
          if (url) {
            let du = "";
            try { du = await readURL(new File([await (await fetch(url, { credentials: "same-origin" })).blob()], "c.jpg", { type: "image/jpeg" })); } catch {}
            setPhotos((p) => [...p, { id, dataUrl: du, url }]);
          } else { bad++; setUpst("Couldn't read a photo (HEIC)."); }
        }
      }
    }
    setUpst(bad ? `Couldn't read ${bad} file(s).` : "");
  }
  function onFiles(e) { const fl = [...e.target.files]; e.target.value = ""; addFiles(fl); }
  function onDrop(e) { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); }
  function removePhoto(i) {
    setPhotos((p) => { const c = [...p]; const [r] = c.splice(i, 1);
      toast("Photo removed.", { label: "Undo", fn: () => setPhotos((q) => { const x = [...q]; x.splice(i, 0, r); return x; }) }); return c; });
  }

  function toggleMic(taId) {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) { toast("Tap the mic on your keyboard to talk."); document.getElementById(taId)?.focus(); return; }
    if (recording) { try { recRef.current?.stop(); } catch {} setRecording(false); return; }
    const rec = new SR(); recRef.current = rec; rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
    const base = transcript ? transcript.replace(/\s*$/, " ") : "";
    rec.onresult = (e) => { let s = ""; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; setTranscript(base + s); };
    rec.onerror = (e) => { if (e.error === "not-allowed") toast("Allow the microphone for this site."); setRecording(false); };
    rec.onend = () => setRecording(false);
    try { rec.start(); setRecording(true); } catch { toast("Couldn't start the mic."); }
  }

  return (
    <>
      <div className="sopb-sec">
        <div className="sopb-lbl"><b>1</b> Photos</div>
        <label className={`sopb-up${dragOver ? " drop" : ""}`}
               onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
               onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
               onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
               onDrop={onDrop}>
          {dragOver ? "Drop photos or videos here" : <><Ic n="upload" s={18} /> Add photos</>}<small>Pick as many as you want, or drag &amp; drop. iPhone HEIC is fine.</small>
          <input type="file" accept="image/*,.heic,.heif,video/*" multiple onChange={onFiles} /></label>
        <div className="sopb-grid" ref={gridRef}>
          {photos.map((p, i) => (
            <div className="sopb-tile" data-i={i} key={p.id}>
              {/* A tile with neither bytes nor a stored URL is still uploading — show the empty tile
                  rather than <img src="">, which makes the browser re-request the whole page. */}
              {(p.dataUrl || p.url) ? <img src={p.dataUrl || p.url} alt={`Item ${i + 1}`} /> : null}
              {p.isVideo && <span className="vid"><Ic n="play" s={22} /></span>}
              <span className="n">{i + 1}</span>
              <button className="x" aria-label="Remove" title="Remove" onClick={(e) => { e.stopPropagation(); removePhoto(i); }}><Ic n="x" s={14} /></button>
            </div>
          ))}
        </div>
        <div className="sopb-status">{upst}</div>
      </div>
      <div className="sopb-sec">
        <div className="sopb-lbl"><b>2</b> Talk through the steps</div>
        <div className="sopb-talk">
          <textarea id="sopb-say" value={transcript} onChange={(e) => setTranscript(e.target.value)}
            placeholder="Tap the mic and explain it like you're training someone: first do this, then that…" />
          <button className={`sopb-mic${recording ? " on" : ""}`} aria-label="Talk" title="Talk" onClick={() => toggleMic("sopb-say")}><Ic n={recording ? "stop" : "mic"} s={18} /></button>
        </div>
      </div>
      <button className="sopb-btn go" disabled={busy} onClick={onBuild}>Build SOP</button>
      <div className="sopb-status">{status}</div>
    </>
  );
}

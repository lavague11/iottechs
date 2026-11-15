"use client";

// SOP Builder widget — React port of the sop-builder.html prototype, adapted to this app: keys live
// server-side (calls /api/sop/build + /api/sop/enhance), photos persist to /api/media (not data-URLs in
// the DB), and drafts/library persist to node:sqlite via server actions. Look is kept from the prototype
// (black, gradient primary) scoped under .sopb. Mobile-first; drag-reorder works by touch and mouse.
import { useState, useRef, useEffect, useCallback } from "react";
import { Wordmark } from "../../components/brand";
import { saveSopDraftAction, listSopsAction, getSopAction, deleteSopAction, publishSopAction, searchStepsAction } from "./actions";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- image helpers (client-side resize, same as prototype) ---------- */
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const readURL = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
function scaled(src, w, h, max = 1600, q = 0.86) {
  const s = Math.min(1, max / Math.max(w, h)), c = document.createElement("canvas");
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  const d = c.toDataURL("image/jpeg", q); c.width = c.height = 0; return d;
}
async function photoFrom(f) {
  try { const b = await createImageBitmap(f); const d = scaled(b, b.width, b.height); b.close && b.close(); if (d.length > 100) return d; } catch {}
  try { const i = await loadImg(await readURL(f)); return scaled(i, i.naturalWidth, i.naturalHeight); } catch { return null; }
}
// Grab ONE representative still from a video (a poster), used for display + as the frame the AI orders by.
// The video itself is uploaded separately and played in the step; it is never AI-enhanced.
function videoPoster(f) {
  return new Promise((res) => {
    const u = URL.createObjectURL(f), v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto"; v.src = u;
    let done = false;
    const fin = (d) => { if (done) return; done = true; URL.revokeObjectURL(u); res(d || null); };
    setTimeout(() => fin(null), 30000); v.onerror = () => fin(null);
    v.onloadedmetadata = async () => {
      const dur = v.duration; const t = isFinite(dur) && dur > 0 ? Math.min(dur * 0.1, 1) : 0;
      try { await v.play(); v.pause(); } catch {}
      const grab = () => { try { fin(scaled(v, v.videoWidth, v.videoHeight)); } catch { fin(null); } };
      const h = () => { v.removeEventListener("seeked", h); grab(); };
      v.addEventListener("seeked", h);
      try { v.currentTime = t; } catch { grab(); }
      setTimeout(grab, 4000);
    };
  });
}
// Upload a data-URL (photo) to /api/media (staff-gated); returns the /api/media/:id URL, or null.
async function uploadMedia(dataUrl) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const fd = new FormData(); fd.append("file", blob, "photo.jpg");
    const r = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" });
    const j = await r.json().catch(() => ({}));
    return j?.ok && j.url ? j.url : null;
  } catch { return null; }
}
// Upload a raw File to /api/media; returns the /api/media/:id URL, or null. Used for videos AND for photos
// the browser can't decode client-side (iPhone HEIC on desktop Chrome): /api/media converts HEIC→JPEG
// server-side and serves it back at the returned URL.
async function uploadFileRaw(file, fallbackName = "file") {
  try {
    const fd = new FormData(); fd.append("file", file, file.name || fallbackName);
    const r = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" });
    const j = await r.json().catch(() => ({}));
    return j?.ok && j.url ? j.url : null;
  } catch { return null; }
}
const move = (arr, a, b) => { const [x] = arr.splice(a, 1); arr.splice(b, 0, x); };

/* ---------- drag-to-reorder (long-press a tile, or grab the ≡ handle) — ported from the prototype ---------- */
function makeSortable(container, itemSel, handleSel, onMove, delay) {
  let s = null;
  const down = (x, y, target, touch) => {
    if (target.closest("button:not(.h),input,textarea")) return false;
    const h = target.closest(handleSel); if (!h || !container.contains(h)) return false;
    const item = h.closest(itemSel); if (!item) return false;
    s = { item, x, y, from: +item.dataset.i, to: +item.dataset.i, active: false, ghost: null, r: item.getBoundingClientRect(), lazy: !touch };
    if (touch) { if (delay) s.timer = setTimeout(activate, delay); else activate(); }
    return true;
  };
  const activate = () => {
    if (!s || s.active) return; s.active = true;
    const g = s.item.cloneNode(true); g.className = "ghost";
    Object.assign(g.style, { left: s.r.left + "px", top: s.r.top + "px", width: s.r.width + "px", height: Math.min(s.r.height, 220) + "px" });
    document.body.appendChild(g); s.ghost = g; s.item.classList.add("drag");
    try { navigator.vibrate && navigator.vibrate(12); } catch {}
  };
  const moveTo = (x, y) => {
    if (!s) return false; const dx = x - s.x, dy = y - s.y;
    if (!s.active) { if (Math.hypot(dx, dy) > 8) { if (s.lazy) activate(); else { clearTimeout(s.timer); s = null; return false; } } else return false; }
    s.ghost.style.transform = `translate(${dx}px,${dy}px)`; s.ghost.style.visibility = "hidden";
    const el = document.elementFromPoint(x, y); s.ghost.style.visibility = "";
    const over = el && el.closest(itemSel); if (over && container.contains(over)) s.to = +over.dataset.i;
    if (y < 90) window.scrollBy(0, -14); else if (y > innerHeight - 90) window.scrollBy(0, 14);
    return true;
  };
  const end = () => { if (!s) return; clearTimeout(s.timer); const { active, from, to, ghost, item } = s; s = null; ghost && ghost.remove(); item.classList.remove("drag"); if (active && to !== from) onMove(from, to); };
  const ts = (e) => { if (e.touches.length === 1) down(e.touches[0].clientX, e.touches[0].clientY, e.target, true); };
  const tm = (e) => { if (moveTo(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault(); };
  const cm = (e) => { if (s) e.preventDefault(); };
  const md = (e) => {
    if (!down(e.clientX, e.clientY, e.target, false)) return; e.preventDefault();
    const mm = (ev) => moveTo(ev.clientX, ev.clientY), mu = () => { document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); end(); };
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
  };
  container.addEventListener("touchstart", ts, { passive: true });
  container.addEventListener("touchmove", tm, { passive: false });
  container.addEventListener("touchend", end); container.addEventListener("touchcancel", end);
  container.addEventListener("contextmenu", cm); container.addEventListener("mousedown", md);
  return () => {
    container.removeEventListener("touchstart", ts); container.removeEventListener("touchmove", tm);
    container.removeEventListener("touchend", end); container.removeEventListener("touchcancel", end);
    container.removeEventListener("contextmenu", cm); container.removeEventListener("mousedown", md);
  };
}

export default function SopBuilder({ canManage = false }) {
  const [tab, setTab] = useState("build");
  const [photos, setPhotos] = useState([]);       // [{id, dataUrl, url}]
  const [transcript, setTranscript] = useState("");
  const [sop, setSop] = useState(null);           // {id,title,business,category,steps:[...]}
  const [status, setStatus] = useState("");
  const [upst, setUpst] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [enhEdit, setEnhEdit] = useState(null);   // step id whose enhance prompt is being edited
  const [enhNote, setEnhNote] = useState("");      // the operator's tweak for that re-enhance
  const [importOpen, setImportOpen] = useState(false);
  const [importList, setImportList] = useState(null);   // other guides available to import as continuation steps
  const [libOpen, setLibOpen] = useState(false);        // step library search
  const [libQuery, setLibQuery] = useState("");
  const [libSteps, setLibSteps] = useState(null);
  const libTimer = useRef(null);
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState("");
  const [toasts, setToasts] = useState([]);
  const [recording, setRecording] = useState(false);
  const [player, setPlayer] = useState(null);     // {sop, i}
  const [lib, setLib] = useState(null);
  const [pubOpen, setPubOpen] = useState(false);

  const gridRef = useRef(null);
  const stepsRef = useRef(null);
  const recRef = useRef(null);
  const saveTimer = useRef(null);

  const toast = useCallback((msg, action, ms = 3800) => {
    const id = uid(); setToasts((t) => [...t, { id, msg, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  /* ---------- autosave the draft (once a sop exists) ---------- */
  const saveDraftSoon = useCallback((next) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const cur = next || sop; if (!cur) return;
      const r = await saveSopDraftAction({ id: cur.id, title: cur.title, business: cur.business, category: cur.category,
        transcript: cur.transcript || transcript,
        steps: cur.steps.map((s) => ({ id: s.id, title: s.title, instruction: s.instruction, target: s.target, where: s.where, img: s.img, enh: s.enh, useEnh: s.useEnh, video: s.video, tags: s.tags })) });
      if (r?.ok && cur.id !== r.id) setSop((p) => (p ? { ...p, id: r.id } : p));
    }, 600);
  }, [sop, transcript]);

  const patchSop = useCallback((updater) => {
    setSop((prev) => { const next = typeof updater === "function" ? updater(prev) : updater; if (next) saveDraftSoon(next); return next; });
  }, [saveDraftSoon]);

  /* ---------- drag wiring ---------- */
  useEffect(() => {
    if (sop || !gridRef.current) return;
    return makeSortable(gridRef.current, ".sopb-tile", ".sopb-tile", (a, b) => {
      setPhotos((p) => { const c = [...p]; move(c, a, b); return c; });
    }, 260);
  }, [sop, photos.length]);

  useEffect(() => {
    if (!sop || !stepsRef.current) return;
    return makeSortable(stepsRef.current, ".sopb-step", ".sopb-h", (a, b) => {
      patchSop((p) => { const steps = [...p.steps]; move(steps, a, b); return { ...p, steps }; });
    }, 0);
  }, [sop, patchSop]);

  /* ---------- photos in ---------- */
  // Shared by the file picker AND drag-and-drop. Dropped HEIC files from Windows often arrive with an empty
  // MIME type, so we don't gate on type here — photoFrom() tries to decode, and anything it can't (HEIC)
  // falls back to a raw /api/media upload that converts it server-side.
  async function addFiles(fileList) {
    const fs = [...(fileList || [])];
    if (!fs.length) return;
    let k = 0, bad = 0;
    for (const f of fs) {
      k++; setUpst(`Adding ${k} of ${fs.length}…`);
      if ((f.type || "").startsWith("video")) {
        // Video: keep it AS a video (played, not enhanced). Grab a poster still for the grid + AI ordering,
        // and upload the raw clip in parallel.
        const poster = await videoPoster(f);
        const id = uid();
        setPhotos((p) => [...p, { id, dataUrl: poster || "", isVideo: true }]);
        if (poster) uploadMedia(poster).then((url) => url && setPhotos((p) => p.map((x) => x.id === id ? { ...x, url } : x)));
        uploadFileRaw(f, "clip.mp4").then((vurl) => { if (vurl) setPhotos((p) => p.map((x) => x.id === id ? { ...x, video: vurl } : x)); else { bad++; setUpst("Couldn't upload a video (25MB max)."); } });
      } else {
        const d = await photoFrom(f);
        if (d) { const id = uid(); setPhotos((p) => [...p, { id, dataUrl: d }]); uploadMedia(d).then((url) => url && setPhotos((p) => p.map((x) => x.id === id ? { ...x, url } : x))); }
        else {
          // The browser couldn't decode it client-side — almost always an iPhone HEIC/HEIF. Upload the raw
          // file; /api/media converts HEIC→JPEG server-side, then we fetch the converted JPEG back for the
          // grid preview + the AI build call (which needs the image bytes).
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

  /* ---------- dictation ---------- */
  function toggleMic(taId) {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) { toast("Tap the 🎤 on your keyboard to talk."); document.getElementById(taId)?.focus(); return; }
    if (recording) { try { recRef.current?.stop(); } catch {} setRecording(false); return; }
    const rec = new SR(); recRef.current = rec; rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
    const base = transcript ? transcript.replace(/\s*$/, " ") : "";
    rec.onresult = (e) => { let s = ""; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; setTranscript(base + s); };
    rec.onerror = (e) => { if (e.error === "not-allowed") toast("Allow the microphone for this site."); setRecording(false); };
    rec.onend = () => setRecording(false);
    try { rec.start(); setRecording(true); } catch { toast("Couldn't start the mic."); }
  }

  /* ---------- build ---------- */
  async function build() {
    if (!photos.length) return toast("Add your photos first.");
    if (!transcript.trim()) return toast("Tap the mic and talk through the steps first.");
    setBusy(true); setStatus("Reading your photos and instructions…");
    try {
      const r = await fetch("/api/sop/build", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: photos.map((p) => p.dataUrl), transcript: transcript.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Build failed");
      const steps = (j.steps || []).map((s) => {
        const ph = s.photoIndex != null ? photos[s.photoIndex] : null;
        return { id: uid(), img: ph ? (ph.url || ph.dataUrl) : null, enh: null, useEnh: false, video: ph?.video || null,
          title: s.title || "", instruction: s.instruction || "", target: s.target || "", where: s.where || "", tags: s.tags || [] };
      });
      const next = { id: uid(), title: j.title || "New SOP", business: "", category: "", transcript: transcript.trim(), steps };
      setSop(next); saveDraftSoon(next); setStatus("");
      toast("Done — photos put in the order you described.");
    } catch (e) { setStatus(e.message); }
    setBusy(false);
  }

  /* ---------- enhance ---------- */
  // note = an operator tweak appended to the cleanup prompt; force = re-enhance even an already-enhanced step.
  async function runEnhance(list, note = "", force = false) {
    const todo = list.filter((s) => s.img && !s.video && (force || !s.enh));   // never enhance video steps — photos only
    if (!todo.length) { toast("Nothing to enhance (videos stay as-is)."); return; }
    setBusy(true); let n = 0, fail = 0;
    for (const s of todo) {
      n++; setEst(`Enhancing photo ${n} of ${todo.length}… (about 20–40 sec each)`);
      try {
        const srcBlob = await (await fetch(s.img)).blob();   // always enhance from the ORIGINAL photo
        const dataUrl = await readURL(new File([srcBlob], "o.jpg", { type: srcBlob.type || "image/jpeg" }));
        const r = await fetch("/api/sop/enhance", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl, title: s.title, instruction: s.instruction, target: s.target, where: s.where, note }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Enhance failed");
        const url = await uploadMedia(j.b64) || j.b64;
        patchSop((p) => ({ ...p, steps: p.steps.map((x) => x.id === s.id ? { ...x, enh: url, useEnh: true, note } : x) }));
      } catch (e) { fail++; setEst(e.message); if (/key|out of credits|internet|paused/i.test(e.message)) break; await sleep(800); }
    }
    if (!fail) setEst(`Enhanced ${todo.length} photo${todo.length > 1 ? "s" : ""} ✓ — tap Original to compare.`);
    setBusy(false);
  }
  const enhanceSteps = (list) => runEnhance(list);
  function addStep() {
    patchSop((p) => ({ ...p, steps: [...p.steps, { id: uid(), title: "", instruction: "", target: "", where: "", img: null, enh: null, useEnh: false, video: null, tags: [] }] }));
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 60);
  }
  // Continuation guides: pull another guide's steps into this one (a copy), so a procedure can branch into a
  // reusable sub-guide (e.g. a troubleshooting guide that continues into "Factory reset the camera").
  async function openImport() {
    setImportOpen(true); setImportList(null);
    const r = await listSopsAction();
    setImportList(r?.ok ? (r.sops || []).filter((s) => s.id !== sop?.id) : []);
  }
  async function importGuide(id, title) {
    setImportOpen(false);
    const r = await getSopAction(id);
    if (!r?.ok) return toast(r?.error || "Couldn't import that guide.");
    const incoming = (r.sop.steps || []).map((x) => ({ id: uid(), img: x.img, enh: x.enh, useEnh: x.useEnh, video: x.video,
      title: x.title, instruction: x.instruction, target: x.target, where: x.where, tags: x.tags || [] }));
    if (!incoming.length) return toast("That guide has no steps.");
    // A labelled divider marks where the imported guide begins; its steps follow and are fully editable here.
    const divider = { id: uid(), img: null, enh: null, useEnh: false, video: null, title: `↳ ${title || r.sop.title}`, instruction: "", target: "", where: "", tags: [] };
    patchSop((p) => ({ ...p, steps: [...p.steps, divider, ...incoming] }));
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 80);
    toast(`Imported ${incoming.length} step${incoming.length === 1 ? "" : "s"} from “${title || r.sop.title}”.`);
  }
  // Step library: search individual steps (by title / instruction / tags / guide) across every guide, add one.
  async function runLibSearch(q) { setLibSteps(null); const r = await searchStepsAction(q); setLibSteps(r?.ok ? r.steps : []); }
  function openLibrary() { setLibOpen(true); setLibQuery(""); runLibSearch(""); }
  function onLibQuery(v) { setLibQuery(v); clearTimeout(libTimer.current); libTimer.current = setTimeout(() => runLibSearch(v), 250); }
  function addLibStep(st) {
    patchSop((p) => ({ ...p, steps: [...p.steps, { id: uid(), img: st.img, enh: st.enh, useEnh: st.useEnh, video: st.video,
      title: st.title, instruction: st.instruction, target: st.target, where: st.where, tags: st.tags || [] }] }));
    toast(`Added “${st.title}”.`);
  }

  /* ---------- step edits ---------- */
  const editStep = (id, field, value) => patchSop((p) => ({ ...p, steps: p.steps.map((s) => s.id === id ? { ...s, [field]: value } : s) }));
  const setUseEnh = (id, v) => patchSop((p) => ({ ...p, steps: p.steps.map((s) => s.id === id ? { ...s, useEnh: v } : s) }));
  function delStep(i) {
    patchSop((p) => { const steps = [...p.steps]; const [r] = steps.splice(i, 1);
      toast("Step deleted.", { label: "Undo", fn: () => patchSop((q) => { const s = [...q.steps]; s.splice(i, 0, r); return { ...q, steps: s }; }) });
      return { ...p, steps }; });
  }

  /* ---------- library ---------- */
  async function openLib() { setTab("lib"); setLib(null); const r = await listSopsAction(); setLib(r?.ok ? r.sops : []); }
  async function openSop(id) {
    const r = await getSopAction(id);
    if (!r?.ok) return toast(r?.error || "Couldn't open it.");
    const s = r.sop;
    setSop({ id: s.id, title: s.title, business: s.business || "", category: s.category || "", transcript: s.transcript || "",
      steps: s.steps.map((x) => ({ id: x.id || uid(), img: x.img, enh: x.enh, useEnh: x.useEnh, video: x.video, title: x.title, instruction: x.instruction, target: x.target, where: x.where, tags: x.tags || [] })) });
    setTab("build");
  }
  async function removeSop(id) {
    if (!confirm("Delete this SOP?")) return;
    await deleteSopAction(id); setLib((l) => (l || []).filter((s) => s.id !== id));
  }

  /* ---------- publish ---------- */
  async function doPublish(visibility) {
    setPubOpen(false); if (!sop) return;
    setBusy(true); setStatus("Publishing…");
    // Make sure the latest edits are saved first.
    await saveSopDraftAction({ id: sop.id, title: sop.title, business: sop.business, category: sop.category, transcript: sop.transcript || transcript,
      steps: sop.steps.map((s) => ({ id: s.id, title: s.title, instruction: s.instruction, target: s.target, where: s.where, img: s.img, enh: s.enh, useEnh: s.useEnh, video: s.video, tags: s.tags })) });
    const r = await publishSopAction(sop.id, { visibility });
    setBusy(false); setStatus("");
    if (!r?.ok) return toast(r?.error || "Publish failed.");
    toast(`Published to Guides (${visibility}).`, { label: "Open", fn: () => window.open(`/guides/${r.slug}`, "_blank") }, 7000);
  }

  function startOver() {
    if (!confirm("Start over? Your steps will be cleared (photos + what you said stay).")) return;
    setTranscript(sop?.transcript || transcript); setSop(null);
  }
  async function newSop() { setPhotos([]); setSop(null); setTranscript(""); setTab("build"); }

  /* ================= RENDER ================= */
  const stepImg = (s) => (s.useEnh && s.enh) ? s.enh : s.img;

  return (
    <div className="sopb">
      <style>{CSS}</style>
      <div className="sopb-nav">
        <a href="/dashboard" className="sopb-nav-back" aria-label="Back to dashboard">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Dashboard
        </a>
        <a href="/dashboard" className="sopb-nav-logo" aria-label="IOT TECHS — dashboard"><Wordmark height={15} /></a>
        <span className="sopb-nav-sp" />
      </div>
      <div className="sopb-top">
        <h1>SOP Builder</h1>
      </div>
      <div className="sopb-tabs">
        <button className={tab === "build" ? "on" : ""} onClick={() => setTab("build")}>Build</button>
        <button className={tab === "lib" ? "on" : ""} onClick={openLib}>My SOPs</button>
      </div>

      {tab === "build" && !sop && (
        <>
          <div className="sopb-sec">
            <div className="sopb-lbl"><b>1</b> Photos</div>
            <label className={`sopb-up${dragOver ? " drop" : ""}`}
                   onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
                   onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
                   onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                   onDrop={onDrop}>
              {dragOver ? "Drop photos or videos here" : "⬆️ Add photos"}<small>Pick as many as you want, or drag &amp; drop. iPhone HEIC is fine.</small>
              <input type="file" accept="image/*,.heic,.heif,video/*" multiple onChange={onFiles} /></label>
            <div className="sopb-grid" ref={gridRef}>
              {photos.map((p, i) => (
                <div className="sopb-tile" data-i={i} key={p.id}>
                  <img src={p.dataUrl || p.url || ""} alt={`Item ${i + 1}`} />
                  {p.isVideo && <span className="vid">▶</span>}
                  <span className="n">{i + 1}</span>
                  <button className="x" aria-label="Remove" onClick={(e) => { e.stopPropagation(); removePhoto(i); }}>✕</button>
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
              <button className={`sopb-mic${recording ? " on" : ""}`} aria-label="Talk" onClick={() => toggleMic("sopb-say")}>{recording ? "■" : "🎙️"}</button>
            </div>
          </div>
          <button className="sopb-btn go" disabled={busy} onClick={build}>✨ Build SOP</button>
          <div className="sopb-status">{status}</div>
        </>
      )}

      {tab === "build" && sop && (
        <>
          <input className="sopb-titlein" value={sop.title} aria-label="SOP title" onChange={(e) => patchSop((p) => ({ ...p, title: e.target.value }))} />
          <div className="sopb-meta">
            <input className="sopb-metain" value={sop.business} placeholder="Business (optional)" onChange={(e) => patchSop((p) => ({ ...p, business: e.target.value }))} />
            <input className="sopb-metain" value={sop.category} placeholder="Category (optional)" onChange={(e) => patchSop((p) => ({ ...p, category: e.target.value }))} />
          </div>
          <div className="sopb-row" style={{ marginBottom: 12 }}><button className="sopb-btn go" disabled={busy} onClick={() => enhanceSteps(sop.steps)}>🪄 Enhance all photos</button></div>
          <div className="sopb-status" style={{ margin: "-4px 0 8px" }}>{est}</div>
          <div ref={stepsRef}>
            {sop.steps.map((s, i) => (
              <div className="sopb-step" data-i={i} key={s.id}>
                <div className="sopb-hd"><span className="sopb-h" aria-label="Drag to reorder">≡</span><span>Step {i + 1} — hold ≡ to move</span></div>
                {s.video ? (
                  <div className="sopb-ph">
                    <video src={s.video} poster={s.img || undefined} controls playsInline preload="metadata" />
                    <span className="tag">VIDEO</span>
                    <span className="num">{i + 1}</span>
                  </div>
                ) : s.img && (
                  <div className="sopb-ph">
                    <img src={stepImg(s)} alt={`Step ${i + 1} photo`} />
                    {s.useEnh && s.enh && <span className="tag">ENHANCED</span>}
                    <span className="num">{i + 1}</span>
                  </div>
                )}
                <div className="sopb-bd">
                  <input value={s.title} placeholder="Step title" onChange={(e) => editStep(s.id, "title", e.target.value)} />
                  <textarea rows={2} value={s.instruction} placeholder="What to do" onChange={(e) => editStep(s.id, "instruction", e.target.value)} />
                  <input className="sopb-tagin" value={(s.tags || []).join(", ")} placeholder="tags for search — e.g. camera, nvr, reset"
                    onChange={(e) => editStep(s.id, "tags", e.target.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))} />
                  <div className="sopb-acts">
                    {/* Enhance is photo-only — a video step shows no Enhance / Original-Enhanced controls. */}
                    {!s.video && s.img && (s.enh
                      ? (<><button className={s.useEnh ? "" : "on"} onClick={() => setUseEnh(s.id, false)}>Original</button>
                          <button className={s.useEnh ? "on" : ""} onClick={() => setUseEnh(s.id, true)}>Enhanced</button>
                          <button title="Edit the prompt & re-enhance" onClick={() => { setEnhEdit(enhEdit === s.id ? null : s.id); setEnhNote(s.note || ""); }}>Redo</button></>)
                      : (<button disabled={busy} onClick={() => enhanceSteps([s])}>🪄 Enhance</button>))}
                    <button aria-label="Delete step" onClick={() => delStep(i)}>🗑</button>
                  </div>
                  {!s.video && enhEdit === s.id && (
                    <div className="sopb-enhedit">
                      <input value={enhNote} autoFocus placeholder="Tweak the cleanup — e.g. blur the background more, brighten the label, remove cable clutter"
                        onChange={(e) => setEnhNote(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { runEnhance([s], enhNote.trim(), true); setEnhEdit(null); } }} />
                      <button className="go" disabled={busy} onClick={() => { runEnhance([s], enhNote.trim(), true); setEnhEdit(null); }}>Redo</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="sopb-row" style={{ marginTop: 6 }}>
            <button className="sopb-btn" onClick={addStep}>＋ Step</button>
            <button className="sopb-btn" onClick={openLibrary}>⊞ Steps</button>
            <button className="sopb-btn" onClick={openImport}>⤵ Guide</button>
          </div>
          <div className="sopb-row" style={{ marginTop: 8 }}>
            <button className="sopb-btn" onClick={startOver}>↺ Start over</button>
            <button className="sopb-btn w" onClick={() => setPlayer({ sop, i: 0 })}>▶ Play</button>
          </div>
          <div className="sopb-row" style={{ marginTop: 8 }}>
            <button className="sopb-btn go" disabled={busy} onClick={() => setPubOpen(true)}>⬆ Publish</button>
          </div>
          <div className="sopb-row" style={{ marginTop: 8 }}>
            <button className="sopb-btn" onClick={newSop}>＋ New SOP</button>
          </div>
        </>
      )}

      {tab === "lib" && (
        <div>
          {lib === null ? <div className="sopb-empty">Loading…</div>
            : lib.length === 0 ? <div className="sopb-empty">No SOPs yet.<br />Build one and tap Publish or save a draft.</div>
            : lib.map((s) => (
              <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="sopb-lib" onClick={() => openSop(s.id)}>
                  <img src={s.thumb || ""} alt="" />
                  <span><div className="t">{s.title}</div>
                    <div className="m">{s.steps} steps · {s.status}{s.status === "published" ? ` · ${s.visibility}` : ""}{s.slug && s.status === "published" ? "" : ""}</div></span>
                </button>
                <button className="sopb-ib" aria-label="Delete" onClick={() => removeSop(s.id)}>🗑</button>
              </div>
            ))}
        </div>
      )}

      {/* publish sheet */}
      {pubOpen && (
        <div className="sopb-sheet" onClick={(e) => { if (e.target.classList.contains("sopb-sheet")) setPubOpen(false); }}>
          <div className="in">
            <b style={{ fontSize: 18 }}>Publish to Support Library</b>
            <div className="sopb-hint">Internal = staff only (login required). Public = anyone with the link.</div>
            <div className="sopb-row" style={{ marginTop: 14 }}>
              <button className="sopb-btn" onClick={() => doPublish("internal")}>Internal</button>
              <button className="sopb-btn w" onClick={() => doPublish("public")}>Public</button>
            </div>
          </div>
        </div>
      )}

      {/* import a guide into this one */}
      {importOpen && (
        <div className="sopb-sheet" onClick={(e) => { if (e.target.classList.contains("sopb-sheet")) setImportOpen(false); }}>
          <div className="in">
            <b style={{ fontSize: 18 }}>Import a guide</b>
            <div className="sopb-hint">Its steps are copied in as a continuation — reorder or edit them after.</div>
            <div className="sopb-implist">
              {importList === null ? <div className="sopb-empty">Loading…</div>
                : importList.length === 0 ? <div className="sopb-empty">No other guides to import yet.</div>
                : importList.map((s) => (
                  <button key={s.id} type="button" className="sopb-lib" onClick={() => importGuide(s.id, s.title)}>
                    <img src={s.thumb || ""} alt="" />
                    <span><div className="t">{s.title}</div><div className="m">{s.steps} step{s.steps === 1 ? "" : "s"}{s.category ? ` · ${s.category}` : ""}</div></span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* step library — search any step across all guides and add it */}
      {libOpen && (
        <div className="sopb-sheet" onClick={(e) => { if (e.target.classList.contains("sopb-sheet")) setLibOpen(false); }}>
          <div className="in sopb-libsheet">
            <div className="sopb-libhead">
              <b style={{ fontSize: 18 }}>Step library</b>
              <button type="button" className="sopb-ib" aria-label="Close" onClick={() => setLibOpen(false)}>✕</button>
            </div>
            <input className="sopb-libsearch" value={libQuery} autoFocus placeholder="Search steps — e.g. camera, reset, nvr, cable"
              onChange={(e) => onLibQuery(e.target.value)} />
            <div className="sopb-libgrid">
              {libSteps === null ? <div className="sopb-empty">Searching…</div>
                : libSteps.length === 0 ? <div className="sopb-empty">{libQuery ? "No steps match." : "No steps yet."}</div>
                : libSteps.map((st, k) => (
                  <div className="sopb-libcard" key={k}>
                    <div className="sopb-libthumb">
                      {st.video ? <video src={st.video} poster={st.thumb || undefined} muted playsInline preload="metadata" /> : (st.thumb ? <img src={st.thumb} alt="" /> : <span className="sopb-libph">◻</span>)}
                    </div>
                    <div className="sopb-libmeta">
                      <div className="t">{st.title}</div>
                      <div className="m">{st.guideTitle}</div>
                      {st.tags?.length > 0 && <div className="sopb-libtags">{st.tags.slice(0, 5).map((tg, j) => <span key={j} className="sopb-tag" onClick={() => onLibQuery(tg)}>{tg}</span>)}</div>}
                    </div>
                    <button type="button" className="sopb-btn go sopb-libadd" onClick={() => addLibStep(st)}>Add</button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* player */}
      {player && <Player sop={player.sop} onClose={() => setPlayer(null)} />}

      {/* toasts */}
      {toasts.map((t) => (
        <div className="sopb-toast" key={t.id}>{t.msg}{t.action && <button onClick={() => { t.action.fn(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</button>}</div>
      ))}
    </div>
  );
}

/* ---------- full-screen player (shared shape with /support/[slug]) ---------- */
function Player({ sop, onClose }) {
  const [i, setI] = useState(0);
  const n = sop.steps.length;
  const sx = useRef(0);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "ArrowRight") setI((v) => Math.min(n - 1, v + 1)); if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1)); if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey); const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [n, onClose]);
  const st = sop.steps[i]; const img = (st.useEnh && st.enh) ? st.enh : st.img;
  return (
    <div className="sopb-play" role="dialog"
      onTouchStart={(e) => { sx.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const d = e.changedTouches[0].clientX - sx.current; if (d < -60 && i < n - 1) setI(i + 1); else if (d > 60 && i > 0) setI(i - 1); }}>
      <div className="ph"><button className="sopb-ib" aria-label="Close" onClick={onClose}>✕</button><div><b>{sop.title}</b><span>Step {i + 1} of {n}</span></div></div>
      <div className="bars">{sop.steps.map((_, k) => <i className={k <= i ? "on" : ""} key={k} />)}</div>
      <div className="mid">{st.video ? <video src={st.video} poster={st.img || undefined} controls playsInline /> : (img && <img src={img} alt="" />)}<h2>{st.title}</h2><p>{st.instruction}</p></div>
      <div className="nav">
        <button disabled={!i} onClick={() => setI(Math.max(0, i - 1))}>Back</button>
        <button className="nx" onClick={() => { if (i < n - 1) setI(i + 1); else onClose(); }}>{i === n - 1 ? "Done" : "Next"}</button>
      </div>
    </div>
  );
}

const CSS = `
.sopb{--bg:#0c0e11;--card:#16181c;--line:#2a2d33;--mut:#9aa0ab;--acc:#C9A96E;--acc-ink:#101418;--acc-soft:rgba(201,169,110,.14);
  background:var(--bg);color:#f2f3f5;font:16px/1.45 -apple-system,system-ui,sans-serif;max-width:640px;margin:auto;padding:14px 16px 60px;min-height:100dvh;border-radius:14px}
.sopb *{box-sizing:border-box}
.sopb button,.sopb input,.sopb textarea{font:inherit;color:inherit}
.sopb button{cursor:pointer;touch-action:manipulation}
.sopb-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin-bottom:12px;padding-top:2px}
.sopb-nav-back{display:inline-flex;align-items:center;gap:4px;justify-self:start;color:var(--mut);text-decoration:none;font-size:13px;font-weight:600;padding:6px 9px;border-radius:9px;white-space:nowrap}
.sopb-nav-back:hover{color:#f2f3f5;background:var(--card)}
.sopb-nav-logo{justify-self:center;color:#f2f3f5;display:inline-flex;text-decoration:none}
.sopb-nav-sp{justify-self:end}
.sopb-top{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.sopb-top h1{flex:1;font-size:24px;font-weight:800;letter-spacing:-.4px}
.sopb-ib{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--card);font-size:16px;color:#fff;display:inline-flex;align-items:center;justify-content:center}
.sopb-tabs{display:flex;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px;margin-bottom:16px}
.sopb-tabs button{flex:1;border:0;background:none;padding:10px;border-radius:10px;font-weight:700;color:var(--mut)}
.sopb-tabs button.on{background:var(--acc);color:var(--acc-ink)}
.sopb-sec{margin-bottom:18px}
.sopb-lbl{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mut);font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px}
.sopb-lbl b{background:#fff;color:#000;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px}
.sopb-up{display:block;position:relative;overflow:hidden;border:2px dashed #3a3a40;border-radius:16px;padding:18px;text-align:center;font-weight:700;transition:border-color .12s,background .12s}
.sopb-up.drop{border-color:var(--acc);background:rgba(255,214,10,.08)}
.sopb-up small{display:block;color:var(--mut);font-weight:500;font-size:12px;margin-top:3px}
.sopb-up input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}
.sopb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.sopb-tile{position:relative;border-radius:12px;overflow:hidden;background:var(--card);aspect-ratio:1;touch-action:pan-y;user-select:none;-webkit-user-select:none;cursor:grab}
.sopb-tile img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.sopb-tile .n{position:absolute;left:6px;top:6px;background:rgba(0,0,0,.75);border-radius:7px;padding:2px 8px;font-size:13px;font-weight:800}
.sopb-tile .x{position:absolute;right:4px;top:4px;width:30px;height:30px;border-radius:50%;border:0;background:rgba(0,0,0,.75);font-size:15px;color:#fff}
.sopb-tile .vid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:20px;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.85);pointer-events:none}
.sopb-tile.drag{opacity:.35}
.ghost{position:fixed;z-index:50;pointer-events:none;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.7);transform:scale(1.08);outline:3px solid var(--acc)}
.ghost img{width:100%;height:100%;object-fit:cover}
.sopb-talk{position:relative}
.sopb-talk textarea{width:100%;min-height:140px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px 52px 13px 13px;font-size:16px;resize:vertical;color:#f2f3f5}
.sopb-mic{position:absolute;right:10px;bottom:10px;width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:var(--bg);color:var(--acc);font-size:16px;display:inline-flex;align-items:center;justify-content:center;line-height:1}
.sopb-mic.on{background:#c4553d;color:#fff;border-color:#c4553d;animation:sopbp 1.2s infinite}
@keyframes sopbp{0%{box-shadow:0 0 0 0 rgba(196,85,61,.55)}70%{box-shadow:0 0 0 12px rgba(196,85,61,0)}100%{box-shadow:0 0 0 0 rgba(196,85,61,0)}}
.sopb-btn{width:100%;min-height:52px;border-radius:16px;border:1px solid var(--line);background:var(--card);font-weight:800;font-size:17px;color:#fff}
.sopb-btn.go{background:var(--acc);border:0;color:var(--acc-ink)}
.sopb-btn.w{background:var(--card);color:#f2f3f5;border:1px solid var(--line)}
.sopb-btn:disabled{opacity:.45}
.sopb-row{display:flex;gap:8px}.sopb-row .sopb-btn{flex:1}
.sopb-status{text-align:center;color:var(--mut);font-size:14px;min-height:20px;margin-top:10px}
.sopb-titlein{width:100%;background:none;border:0;border-bottom:1px solid var(--line);font-size:22px;font-weight:800;padding:6px 0;margin-bottom:10px;color:#fff}
.sopb-meta{display:flex;gap:8px;margin-bottom:12px}
.sopb-metain{flex:1;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:14px;color:#fff}
.sopb-step{background:var(--card);border:1px solid var(--line);border-radius:18px;margin-bottom:12px;overflow:hidden}
.sopb-ph{position:relative;background:#000}
.sopb-ph img,.sopb-ph video{width:100%;max-height:340px;object-fit:contain;display:block;background:#000}
.sopb-ph .tag{position:absolute;left:8px;top:8px;background:var(--acc);color:#000;font-size:11px;font-weight:800;border-radius:7px;padding:3px 8px}
.sopb-ph .num{position:absolute;right:8px;top:8px;background:rgba(0,0,0,.75);border-radius:8px;padding:3px 9px;font-weight:800;font-size:13px}
.sopb-bd{padding:12px}
.sopb-bd input,.sopb-bd textarea{width:100%;background:transparent;border:1px solid transparent;border-radius:10px;padding:6px 8px;margin-left:-8px;color:#fff}
.sopb-bd input:focus,.sopb-bd textarea:focus{border-color:var(--line);background:#0b0b0c;outline:0}
.sopb-bd input{font-size:19px;font-weight:800}
.sopb-bd textarea{font-size:16px;resize:none;min-height:48px}
.sopb-acts{display:flex;gap:6px;margin-top:8px}
.sopb-acts button{flex:1;min-height:42px;border-radius:12px;border:1px solid var(--line);background:#1c1f24;font-weight:700;font-size:14px;color:#f2f3f5}
.sopb-acts button.on{background:var(--acc);color:var(--acc-ink);border-color:var(--acc)}
.sopb-enhedit{display:flex;gap:6px;margin-top:8px}
.sopb-enhedit input{flex:1;min-width:0;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:9px 11px;font-size:13px;color:#f2f3f5}
.sopb-enhedit button{min-height:40px;padding:0 15px;border-radius:10px;border:1px solid var(--line);background:#1c1f24;color:#f2f3f5;font-weight:700;font-size:13px;white-space:nowrap}
.sopb-enhedit button.go{background:var(--acc);color:var(--acc-ink);border:0}
.sopb-hd{display:flex;align-items:center;gap:6px;padding:8px 12px 0;color:var(--mut);font-size:13px}
.sopb-hd .sopb-h{touch-action:none;font-size:20px;padding:4px 8px;cursor:grab}
.sopb-lib{display:flex;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:10px;margin-bottom:10px;flex:1;text-align:left;color:#fff}
.sopb-lib img{width:64px;height:64px;border-radius:10px;object-fit:cover;flex-shrink:0;background:#222}
.sopb-lib .t{font-weight:700}.sopb-lib .m{font-size:13px;color:var(--mut)}
.sopb-empty{text-align:center;color:var(--mut);padding:40px 0}
.sopb-sheet{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1200;display:flex;align-items:flex-end}
.sopb-sheet .in{background:#141416;width:100%;max-width:640px;margin:auto auto 0;border-radius:22px 22px 0 0;padding:18px 16px calc(20px + env(safe-area-inset-bottom))}
.sopb-hint{font-size:13px;color:var(--mut);margin-top:6px}
.sopb-implist{max-height:48vh;overflow:auto;margin-top:12px;display:flex;flex-direction:column;gap:8px}
.sopb-implist .sopb-lib{width:100%;margin-bottom:0}
.sopb-tagin{width:100%;background:transparent;border:1px solid transparent;border-radius:10px;padding:5px 8px;margin-left:-8px;margin-top:3px;font-size:12.5px;color:var(--mut)}
.sopb-tagin:focus{border-color:var(--line);background:var(--bg);outline:0;color:#f2f3f5}
.sopb-tag{display:inline-block;background:var(--acc-soft);color:var(--acc);border:1px solid rgba(201,169,110,.3);border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;margin:3px 4px 0 0;cursor:pointer}
.sopb-libsheet{max-width:640px}
.sopb-libhead{display:flex;align-items:center;justify-content:space-between}
.sopb-libsearch{width:100%;margin-top:12px;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:15px;color:#f2f3f5}
.sopb-libgrid{max-height:52vh;overflow:auto;margin-top:12px;display:flex;flex-direction:column;gap:8px}
.sopb-libcard{display:flex;gap:11px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:9px}
.sopb-libthumb{width:62px;height:62px;border-radius:10px;overflow:hidden;background:#000;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.sopb-libthumb img,.sopb-libthumb video{width:100%;height:100%;object-fit:cover}
.sopb-libph{color:#333;font-size:24px}
.sopb-libmeta{flex:1;min-width:0}
.sopb-libmeta .t{font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sopb-libmeta .m{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sopb-libadd{width:auto;min-height:38px;padding:0 16px;flex-shrink:0}
.sopb-play{position:fixed;inset:0;background:#000;z-index:1300;display:flex;flex-direction:column;color:#fff}
.sopb-play .ph{padding:max(10px,env(safe-area-inset-top)) 12px 6px;display:flex;align-items:center;gap:10px}
.sopb-play .ph div{flex:1;min-width:0}.sopb-play .ph b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sopb-play .ph span{font-size:13px;color:var(--mut);font-weight:600}
.sopb-play .bars{display:flex;gap:3px;padding:0 12px}.sopb-play .bars i{flex:1;height:3px;border-radius:2px;background:#333}.sopb-play .bars i.on{background:var(--acc)}
.sopb-play .mid{flex:1;overflow:auto;padding:12px 16px}
.sopb-play .mid img,.sopb-play .mid video{width:100%;max-height:56dvh;object-fit:contain;border-radius:16px;background:#111;display:block;margin-bottom:14px}
.sopb-play h2{font-size:24px;font-weight:800;margin-bottom:8px}.sopb-play p{font-size:19px;line-height:1.45}
.sopb-play .nav{display:flex;gap:10px;padding:10px 12px calc(12px + env(safe-area-inset-bottom))}
.sopb-play .nav button{flex:1;min-height:56px;border-radius:14px;border:1px solid var(--line);background:var(--card);font-size:18px;font-weight:800;color:#fff}
.sopb-play .nav .nx{flex:2;background:#fff;color:#000;border:0}.sopb-play .nav button:disabled{opacity:.3}
.sopb-toast{position:fixed;left:50%;top:70px;transform:translateX(-50%);background:#fff;color:#000;border-radius:14px;padding:12px 16px;font-size:14px;font-weight:600;z-index:1400;max-width:92vw;box-shadow:0 8px 30px rgba(0,0,0,.6);display:flex;gap:12px;align-items:center}
.sopb-toast button{border:0;background:none;color:#0a84ff;font-weight:800}
@media (prefers-reduced-motion:reduce){.sopb *{animation:none!important}}
`;

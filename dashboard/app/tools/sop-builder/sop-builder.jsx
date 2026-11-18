"use client";

// SOP Builder widget — React port of the sop-builder.html prototype, adapted to this app: keys live
// server-side (calls /api/sop/build + /api/sop/enhance), photos persist to /api/media (not data-URLs in
// the DB), and drafts/library persist to node:sqlite via server actions. Look is kept from the prototype
// (black, gradient primary) scoped under .sopb. Mobile-first; drag-reorder works by touch and mouse.
import { useState, useRef, useEffect, useCallback } from "react";
import { Wordmark } from "../../components/brand";
import { listSopsAction, getSopAction, getSopBySlugAction, archiveSopAction, restoreSopAction, publishSopAction, searchStepsAction } from "./actions";
import { CSS } from "./sop-builder-css";
import { uid, sleep, readURL, photoFrom, videoPoster, uploadMedia, uploadFileRaw, move, makeSortable } from "./sop-media";
import { useAutosave, usePreDraft } from "./sop-persist";
import { Ic } from "./sop-icons";
import Capture from "./sop-capture";
import StepCard from "./sop-step-card";
import SopLibrary from "./sop-library";
import { Player, PublishSheet, ImportSheet, LibrarySheet } from "./sop-sheets";

export default function SopBuilder({ canManage = false }) {
  const [tab, setTab] = useState("build");
  const [photos, setPhotos] = useState([]);       // [{id, dataUrl, url}]
  const [transcript, setTranscript] = useState("");
  const [sop, setSop] = useState(null);     // {id,title,business,category,steps:[...]}
  const [mediaBusy, setMediaBusy] = useState(null); // step id whose photo/video is uploading
  const [libUntagged, setLibUntagged] = useState(0);
  const [tagging, setTagging] = useState(false);
  const [status, setStatus] = useState("");
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
  const [player, setPlayer] = useState(null);     // {sop, i}
  const [lib, setLib] = useState(null);
  const [libArch, setLibArch] = useState(false);   // My SOPs showing the archived list
  const [askArch, setAskArch] = useState("");      // id awaiting the second tap of Delete
  const [askOver, setAskOver] = useState(false);   // Start over awaiting its second tap
  const [pubOpen, setPubOpen] = useState(false);
  const [saveState, setSaveState] = useState("");  // "" | "saving" | "saved" | an error
  const [pubDirty, setPubDirty] = useState(false); // published, and edited since

  const stepsRef = useRef(null);
  const photosRef = useRef([]);   // always the latest photos (build() awaits the AI; its closure goes stale)
  photosRef.current = photos;
  const libQRef = useRef("");     // latest library query
  const libSeq = useRef(0);        // only the newest library response is applied

  const toast = useCallback((msg, action, ms = 3800) => {
    const id = uid(); setToasts((t) => [...t, { id, msg, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  /* ---------- persistence (lib: sop-persist.js) ---------- */
  const { saveNow, saveDraftSoon, cancelPending } = useAutosave({ sop, setSop, transcript, setSaveState, setPubDirty });
  const clearPre = usePreDraft({ sop, photos, setPhotos, transcript, setTranscript });

  const patchSop = useCallback((updater) => {
    setSop((prev) => { const next = typeof updater === "function" ? updater(prev) : updater; if (next && next !== prev) saveDraftSoon(next); return next; });
  }, [saveDraftSoon]);

  /* ---------- drag wiring ---------- */
  useEffect(() => {
    if (!sop || !stepsRef.current) return;
    return makeSortable(stepsRef.current, ".sopb-step", ".sopb-h", (a, b) => {
      patchSop((p) => { const steps = [...p.steps]; move(steps, a, b); return { ...p, steps }; });
    }, 0);
  }, [sop, patchSop]);

  /* ---------- build ---------- */
  async function build() {
    if (!photos.length) return toast("Add your photos first.");
    if (!transcript.trim()) return toast("Tap the mic and talk through the steps first.");
    setBusy(true); setStatus("Reading your photos and instructions…");
    try {
      // A clip still uploading would be lost (the step would become a photo of its poster): wait, up to 2 minutes.
      const t0 = Date.now();
      while (photosRef.current.some((p) => p.isVideo && !p.video && !p.failed) && Date.now() - t0 < 120000) { setStatus("Uploading video…"); await sleep(500); }
      setStatus("Reading your photos and instructions…");
      // The AI call needs image BYTES. A photo restored from the pre-build draft has only its stored
      // URL, so fetch those back; index order is preserved (the route labels by index and skips
      // anything it can't read, so a failed fetch costs that one photo, not the alignment).
      const shots = [];
      for (const p of photos) {
        if (p.dataUrl) { shots.push(p.dataUrl); continue; }
        try {
          const b = await (await fetch(p.url, { credentials: "same-origin" })).blob();
          shots.push(await readURL(new File([b], "p.jpg", { type: b.type || "image/jpeg" })));
        } catch { shots.push(""); }
      }
      const r = await fetch("/api/sop/build", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: shots, transcript: transcript.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Build failed");
      // Only /api/media URLs (or null) go into a step: take each photo's LIVE entry, and finish its upload if needed.
      const lostIds = new Set(), urlById = new Map(); const steps = [];
      for (const s of (j.steps || [])) {
        const sent = s.photoIndex != null ? photos[s.photoIndex] : null;
        const ph = sent ? (photosRef.current.find((x) => x.id === sent.id) || sent) : null;
        let img = null;
        if (ph) {
          // Each photo is uploaded at most once per build (two steps may point at the same one).
          if (!urlById.has(ph.id)) urlById.set(ph.id, ph.url || (ph.dataUrl ? await uploadMedia(ph.dataUrl) : null));
          img = urlById.get(ph.id);
          if (ph.isVideo ? !ph.video : !img) lostIds.add(ph.id);
        }
        steps.push({ id: uid(), img, enh: null, useEnh: false, video: ph?.video || null,
          title: s.title || "", instruction: s.instruction || "", target: s.target || "", where: s.where || "",
          // How to enhance this photo, chosen at build time by the model that looked at it.
          kind: s.kind || "", tags: s.tags || [] });
      }
      const next = { id: uid(), title: j.title || "New SOP", business: "", category: "", status: "draft", slug: null,
        transcript: transcript.trim(), steps };
      setSop(next); setPubDirty(false); saveDraftSoon(next); clearPre(); setStatus("");
      const lost = lostIds.size;
      if (lost) toast(`Couldn't save ${lost} file${lost === 1 ? "" : "s"}.`);
      // Build runs straight into the enhancement it just chose for each photo — one action, not two.
      // The guide is already in state and queued to save ABOVE this line, so if enhancing fails (no key,
      // out of credits, a dead connection) the built steps survive and only the enhancement is missing;
      // every photo keeps its original either way, and Enhance all can be tapped again later.
      const toEnhance = steps.filter((s) => s.img && !s.video);
      if (!toEnhance.length) { if (!lost) toast("Done — photos put in the order you described."); }
      else await runEnhance(toEnhance);
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
          body: JSON.stringify({ image: dataUrl, title: s.title, instruction: s.instruction, target: s.target, where: s.where, note, kind: s.kind || "" }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Enhance failed");
        const url = await uploadMedia(j.b64);
        if (!url) throw new Error("Couldn't save the enhanced photo.");
        // Apply only if the step still has the same original (a replaced/removed photo must not get the old result).
        patchSop((p) => ({ ...p, steps: p.steps.map((x) => x.id === s.id && x.img === s.img && !x.video ? { ...x, enh: url, useEnh: true, note } : x) }));
      } catch (e) { fail++; setEst(e.message); if (/key|out of credits|internet|paused/i.test(e.message)) break; await sleep(800); }
    }
    if (!fail) setEst(`Enhanced ${todo.length} photo${todo.length > 1 ? "s" : ""} — tap Original to compare.`);
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
  async function runLibSearch(q) {
    const my = ++libSeq.current; setLibSteps(null); const r = await searchStepsAction(q);
    if (my !== libSeq.current) return;
    setLibSteps(r?.ok ? r.steps : []); setLibUntagged(r?.ok ? Number(r.untagged) || 0 : 0);
  }
  // Auto-tag: the server tags a batch per call; loop a few rounds (merging written tags each round), then refresh the list.
  async function autoTag() {
    if (tagging) return;
    setTagging(true);
    let total = 0, err = "";
    try {
      for (let k = 0; k < 8; k++) {
        const r = await fetch("/api/sop/tags", { method: "POST", credentials: "same-origin" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { err = j.error || "Couldn't tag."; break; }
        total += Number(j.tagged) || 0;
        // Autosave rewrites the guide from client state, so adopt the tags the server just wrote right away.
        const written = j.written || {};
        patchSop((p) => {
          if (!p) return p;
          let ch = false;
          const steps = p.steps.map((s) => { const w = written[s.id]; if (w?.length && !(s.tags || []).length) { ch = true; return { ...s, tags: w }; } return s; });
          return ch ? { ...p, steps } : p;
        });
        if (!j.remaining || !j.tagged) break;
      }
    } catch { err = "Couldn't tag."; }
    setTagging(false);
    await runLibSearch(libQRef.current);
    toast(err || (total ? `Tagged ${total} step${total === 1 ? "" : "s"}.` : "Nothing to tag."));
  }
  function openLibrary() { libQRef.current = ""; setLibOpen(true); setLibQuery(""); runLibSearch(""); }
  function onLibQuery(v) { libQRef.current = v; setLibQuery(v); clearTimeout(libTimer.current); libTimer.current = setTimeout(() => runLibSearch(v), 250); }
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

  // Per-step media. Only ever stores /api/media URLs — a data: URL must never reach a step (autosave → SQLite).
  async function setStepMedia(id, file) {
    if (mediaBusy) return;
    setMediaBusy(id);
    let img = null, video = null, ok = false;
    const isVid = (file.type || "").startsWith("video");
    try {
      if (isVid) {
        const poster = await videoPoster(file);
        img = poster ? await uploadMedia(poster) : null;
        video = await uploadFileRaw(file, "clip.mp4");
        ok = !!video;
      } else {
        const d = await photoFrom(file);
        img = d ? await uploadMedia(d) : await uploadFileRaw(file, "photo.heic");   // HEIC: server converts
        ok = !!img;
      }
    } catch { ok = false; }
    setMediaBusy(null);
    if (!ok) return toast(isVid ? "Couldn't upload that video (25MB max)." : "Couldn't add that file.");
    // A new photo invalidates the old enhanced version and its tweak note.
    patchSop((p) => ({ ...p, steps: p.steps.map((x) => x.id === id ? { ...x, img, video, enh: null, useEnh: false, note: "" } : x) }));
    if (enhEdit === id) setEnhEdit(null);
  }
  function clearStepMedia(id) {
    const cur = sop?.steps.find((x) => x.id === id); if (!cur) return;
    const prev = { img: cur.img, enh: cur.enh, useEnh: cur.useEnh, video: cur.video };
    patchSop((p) => ({ ...p, steps: p.steps.map((x) => x.id === id ? { ...x, img: null, enh: null, useEnh: false, video: null } : x) }));
    if (enhEdit === id) setEnhEdit(null);
    toast("Media removed.", { label: "Undo", fn: () => patchSop((q) => ({ ...q, steps: q.steps.map((x) => x.id === id ? { ...x, ...prev } : x) })) });
  }
  const toggleAim = (s) => { setEnhEdit(enhEdit === s.id ? null : s.id); setEnhNote(s.note || ""); };

  /* ---------- library ---------- */
  async function openLib(archived = false) {
    setTab("lib"); setLib(null); setLibArch(archived); setAskArch("");
    const r = await listSopsAction({ archived });
    setLib(r?.ok ? r.sops : []);
  }
  // One place that adopts a loaded guide into the editor, so opening from the library and opening from a
  // /guides card's Edit land in exactly the same state.
  function adoptSop(s) {
    setSop({ id: s.id, title: s.title, business: s.business || "", category: s.category || "", transcript: s.transcript || "",
      status: s.status || "draft", slug: s.slug || null,
      steps: s.steps.map((x) => ({ id: x.id || uid(), img: x.img, enh: x.enh, useEnh: x.useEnh, video: x.video, title: x.title, instruction: x.instruction, target: x.target, where: x.where, kind: x.kind || "", tags: x.tags || [] })) });
    // Published, but the draft has moved on since: say so rather than look identical to a clean one.
    setPubDirty(s.status === "published" && !!s.published_at && String(s.updated_at || "") > String(s.published_at));
    setSaveState("");
    setTab("build");
  }
  async function openSop(id) {
    const r = await getSopAction(id);
    if (!r?.ok) return toast(r?.error || "Couldn't open it.");
    adoptSop(r.sop);
  }
  // Deep link from a guide card: /tools/sop-builder?sop=<slug>. Runs once; the param is then stripped so a
  // reload after edits doesn't re-open the stored copy over unsaved work.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || typeof window === "undefined") return;
    const slug = new URLSearchParams(window.location.search).get("sop");
    if (!slug) return;
    deepLinked.current = true;
    (async () => {
      const r = await getSopBySlugAction(slug);
      if (!r?.ok) return toast(r?.error || "Couldn't open that guide.");
      adoptSop(r.sop);
      try { const u = new URL(window.location.href); u.searchParams.delete("sop"); window.history.replaceState({}, "", u); } catch { /* non-fatal */ }
    })();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // "Delete" here ARCHIVES: the guide and every published snapshot are kept, it just leaves /guides,
  // its public URL and both libraries. Two taps to fire, then an Undo that restores it.
  async function archiveGuide(s) {
    setAskArch("");
    const r = await archiveSopAction(s.id);
    if (!r?.ok) return toast(r?.error || "Couldn't remove it.");
    setLib((l) => (l || []).filter((x) => x.id !== s.id));
    // Don't let a queued autosave write the guide that was just taken down.
    if (sop?.id === s.id) { cancelPending(); setSop(null); setSaveState(""); }
    toast(`“${s.title}” removed.`, { label: "Undo", fn: async () => {
      const u = await restoreSopAction(s.id);
      if (u?.ok) openLib(false); else toast(u?.error || "Couldn't restore it.");
    } }, 7000);
  }
  async function restoreGuide(s) {
    const r = await restoreSopAction(s.id);
    if (!r?.ok) return toast(r?.error || "Couldn't restore it.");
    setLib((l) => (l || []).filter((x) => x.id !== s.id));
    toast(`“${s.title}” restored.`);
  }

  /* ---------- publish ---------- */
  async function doPublish(visibility) {
    setPubOpen(false); if (!sop) return;
    setBusy(true); setStatus("Publishing…");
    // Flush the latest edits first — the snapshot is frozen from the stored rows, not from this state.
    cancelPending();
    await saveNow(sop);
    const r = await publishSopAction(sop.id, { visibility });
    setBusy(false); setStatus("");
    if (!r?.ok) return toast(r?.error || "Publish failed.");
    setSop((p) => (p ? { ...p, status: "published", slug: r.slug } : p));
    setPubDirty(false);
    toast(`Published to Guides (${visibility}).`, { label: "Open", fn: () => window.open(`/guides/${r.slug}`, "_blank") }, 7000);
  }

  function startOver() {
    setAskOver(false);
    setTranscript(sop?.transcript || transcript); setSop(null); setPubDirty(false); setSaveState("");
  }
  async function newSop() { clearPre(); setPhotos([]); setSop(null); setTranscript(""); setPubDirty(false); setSaveState(""); setTab("build"); }

  /* ================= RENDER ================= */

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
        <button className={tab === "lib" ? "on" : ""} onClick={() => openLib(false)}>My SOPs</button>
      </div>

      {tab === "build" && !sop && (
        <Capture photos={photos} setPhotos={setPhotos} transcript={transcript} setTranscript={setTranscript}
          busy={busy} status={status} onBuild={build} toast={toast} />
      )}

      {tab === "build" && sop && (
        <>
          <input className="sopb-titlein" value={sop.title} aria-label="SOP title" onChange={(e) => patchSop((p) => ({ ...p, title: e.target.value }))} />
          <div className="sopb-meta">
            <input className="sopb-metain" value={sop.business} placeholder="Business (optional)" onChange={(e) => patchSop((p) => ({ ...p, business: e.target.value }))} />
            <input className="sopb-metain" value={sop.category} placeholder="Category (optional)" onChange={(e) => patchSop((p) => ({ ...p, category: e.target.value }))} />
          </div>
          {/* Save + publish state. Autosave is silent until it has something to report: that it is
              writing, that it failed, or — the one thing the editor can't show by itself — that a
              published guide is serving an older snapshot than what's on screen. */}
          <div className="sopb-save">
            <span className={saveState === "saving" ? "sv" : saveState === "saved" ? "ok" : saveState ? "er" : ""}>
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState}
            </span>
            {sop.status === "published" && (pubDirty
              ? <b className="dirty">Unpublished changes</b>
              : <a className="livelink" href={`/guides/${sop.slug}`} target="_blank" rel="noreferrer">Live</a>)}
          </div>
          <div className="sopb-row" style={{ marginBottom: 12 }}><button className="sopb-btn go" disabled={busy} onClick={() => enhanceSteps(sop.steps)}>Enhance all</button></div>
          <div className="sopb-status" style={{ margin: "-4px 0 8px" }}>{est}</div>
          <div ref={stepsRef}>
            {sop.steps.map((s, i) => (
              <StepCard key={s.id} s={s} i={i} busy={busy} mediaBusy={mediaBusy} aimOpen={enhEdit === s.id} enhNote={enhNote} setEnhNote={setEnhNote}
                onAim={() => toggleAim(s)} onAimClose={() => setEnhEdit(null)} onEdit={editStep} onUseEnh={setUseEnh}
                onEnhance={(st, note, force) => runEnhance([st], note, force)} onMedia={setStepMedia} onClearMedia={clearStepMedia} onDelete={() => delStep(i)} />
            ))}
          </div>
          <div className="sopb-row" style={{ marginTop: 6 }}>
            <button className="sopb-btn" onClick={addStep}><Ic n="plus" /> Step</button>
            <button className="sopb-btn" onClick={openLibrary}><Ic n="search" /> Steps</button>
            <button className="sopb-btn" onClick={openImport}><Ic n="import" /> Guide</button>
          </div>
          <div className="sopb-row" style={{ marginTop: 8 }}>
            {askOver ? (
              <>
                <button className="sopb-btn" onClick={() => setAskOver(false)}>Cancel</button>
                <button className="sopb-btn danger" onClick={startOver}>Clear steps</button>
              </>
            ) : (
              <>
                <button className="sopb-btn" onClick={() => setAskOver(true)}>Start over</button>
                <button className="sopb-btn w" onClick={() => setPlayer({ sop, i: 0 })}><Ic n="play" /> Play</button>
              </>
            )}
          </div>
          <div className="sopb-row" style={{ marginTop: 8 }}>
            <button className="sopb-btn go" disabled={busy} onClick={() => setPubOpen(true)}>
              {sop.status === "published" ? (pubDirty ? "Publish update" : "Republish") : "Publish"}
            </button>
          </div>
          <div className="sopb-row" style={{ marginTop: 8 }}>
            <button className="sopb-btn" onClick={newSop}>New SOP</button>
          </div>
        </>
      )}

      {tab === "lib" && (
        <SopLibrary list={lib} archived={libArch} ask={askArch} onTab={openLib} onOpen={openSop}
          onAsk={setAskArch} onArchive={archiveGuide} onRestore={restoreGuide} />
      )}

      {pubOpen && <PublishSheet onClose={() => setPubOpen(false)} onPublish={doPublish} />}
      {importOpen && <ImportSheet list={importList} onClose={() => setImportOpen(false)} onPick={importGuide} />}
      {libOpen && <LibrarySheet query={libQuery} onQuery={onLibQuery} steps={libSteps} untagged={libUntagged} tagging={tagging}
        onTag={autoTag} onAdd={addLibStep} onClose={() => setLibOpen(false)} />}

      {/* player */}
      {player && <Player sop={player.sop} onClose={() => setPlayer(null)} />}

      {/* toasts */}
      {toasts.map((t) => (
        <div className="sopb-toast" key={t.id}>{t.msg}{t.action && <button onClick={() => { t.action.fn(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</button>}</div>
      ))}
    </div>
  );
}


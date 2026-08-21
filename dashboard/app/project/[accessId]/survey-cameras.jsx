"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// The project's camera roster, rendered right under the Site Survey tool. Cameras come from the survey
// (getProjectCameras → /api/project-cameras) — the single source of truth — so this list is where the
// office manages each camera's VIEW PHOTO without hunting for the pin on the map: replace one, clear one,
// or run Rapid Capture to snap them back-to-back (Camera 1 → shoot → Camera 2 → shoot …). Every edit
// writes back to the same survey2 blob (server + this browser's localStorage), so the survey pins and the
// CCTV mockup reflect it too. Customers/techs get a read-only gallery.

const SURVEY_KEY = (accessId) => `iottechs_survey2_${accessId}`;

// Mirror a photo edit into this browser's survey draft so an open/next-load survey tool stays in sync
// with the server patch (same-origin localStorage; the survey tool reads this key).
function mirrorLocal(accessId, floor, di, photo, photoName) {
  try {
    const raw = localStorage.getItem(SURVEY_KEY(accessId));
    if (!raw) return;
    const d = JSON.parse(raw);
    const dev = d?.floors?.[floor]?.devices?.[di];
    if (!dev || dev.k !== "cam") return;
    dev.photo = photo || null;
    dev.photoName = photo ? (photoName || dev.photoName || dev.name || null) : null;
    localStorage.setItem(SURVEY_KEY(accessId), JSON.stringify(d));
  } catch { /* no draft here → server patch alone is enough */ }
}

export default function SurveyCameras({ accessId, view, customerView }) {
  const readOnly = !["admin", "manager", "sales"].includes(view) || customerView;
  const [cameras, setCameras] = useState(null);   // null = loading
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(-1);            // index currently uploading (-1 none)
  const [err, setErr] = useState("");
  const [lightbox, setLightbox] = useState(null);  // { url, name }
  const [capture, setCapture] = useState(-1);      // rapid-capture: camera index we're on (-1 = off)
  const fileRef = useRef(null);
  const targetRef = useRef(-1);                    // which camera the hidden picker is aiming at

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/project-cameras?accessId=${encodeURIComponent(accessId)}`);
      const j = await r.json();
      setCameras(j?.ok && Array.isArray(j.cameras) ? j.cameras : []);
    } catch { setCameras([]); }
  }, [accessId]);
  useEffect(() => { load(); }, [load]);

  const label = (c, i) => (c.name && c.name.trim()) || c.tag || `Camera ${i + 1}`;

  // Upload the file to /api/media (HEIC-safe, returns a small URL), then patch the survey camera.
  async function attach(idx, file) {
    const c = cameras[idx]; if (!c || !file) return;
    setBusy(idx); setErr("");
    try {
      const fd = new FormData(); fd.append("file", file, file.name || "photo.jpg");
      fd.append("project", accessId); fd.append("kind", "survey-view");
      const up = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" }).then((r) => r.ok ? r.json() : null);
      if (!up?.ok || !up.url) throw new Error("Upload failed — check your connection and try again.");
      await save(idx, up.url, label(c, idx));
    } catch (e) { setErr(e.message || "Upload failed."); }
    finally { setBusy(-1); }
  }

  // Persist a photo change (url or null) and reflect it locally so the whole page stays consistent.
  async function save(idx, url, photoName) {
    const c = cameras[idx]; if (!c) return;
    const r = await fetch("/api/project-cameras", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessId, floor: c.floor, di: c.di, photo: url, photoName }),
    }).then((x) => x.json());
    if (r?.error) throw new Error(r.error);
    if (Array.isArray(r?.cameras)) setCameras(r.cameras); else load();
    mirrorLocal(accessId, c.floor, c.di, url, photoName);
  }

  function onPick(e) {
    const f = e.target.files?.[0]; const idx = targetRef.current;
    e.target.value = "";
    if (!f || idx < 0) { if (capture >= 0) setCapture(-1); return; }   // cancelled → leave rapid capture
    attach(idx, f).then(() => {
      if (capture >= 0) {                                             // rapid capture → advance to the next camera
        const next = idx + 1;
        if (next < cameras.length) setCapture(next); else setCapture(-1);
      }
    });
  }

  // Open the device camera (mobile) / file picker for one camera. Each call rides a real tap so iOS
  // Safari lets the camera open — rapid capture is tap-per-shot, not an auto-reopen loop.
  function shoot(idx, useCamera) {
    if (readOnly) return;
    targetRef.current = idx;
    const inp = fileRef.current; if (!inp) return;
    if (useCamera) inp.setAttribute("capture", "environment"); else inp.removeAttribute("capture");
    inp.click();
  }

  async function clearPhoto(idx) {
    setBusy(idx); setErr("");
    try { await save(idx, null, null); } catch (e) { setErr(e.message || "Failed."); }
    finally { setBusy(-1); }
  }

  if (view === "customer" || customerView) return null;   // office/field tool; customers see cameras in the survey itself
  if (cameras === null) return null;                 // loading — nothing yet
  if (!cameras.length) return null;                  // render only when real: no cameras → no panel

  const filled = cameras.filter((c) => c.photo).length;
  const inCapture = capture >= 0 && capture < cameras.length;

  return (
    <div className="sc-wrap">
      <input ref={fileRef} type="file" accept="image/*,.heic,.heif,.HEIC,.HEIF" style={{ display: "none" }} onChange={onPick} />

      <button className="sc-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg className={`sc-chev${open ? " on" : ""}`} viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg>
        <span className="sc-title">Cameras</span>
        <span className="sc-count">{filled}/{cameras.length} photographed</span>
        {!readOnly && !inCapture && (
          <span className="sc-cap" role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setOpen(true); setCapture(0); }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            Rapid capture
          </span>
        )}
      </button>

      {inCapture && (
        <div className="sc-capbar">
          <div className="sc-capnow">
            <span className="sc-capstep">{capture + 1} of {cameras.length}</span>
            <strong>{label(cameras[capture], capture)}</strong>
            <span className="sc-capfloor">{cameras[capture].floorName}</span>
          </div>
          <div className="sc-capbtns">
            <button className="sc-btn sc-primary" disabled={busy === capture} onClick={() => shoot(capture, true)}>
              {busy === capture ? "Saving…" : (cameras[capture].photo ? "Retake" : "Take photo")}
            </button>
            <button className="sc-btn" disabled={busy === capture}
              onClick={() => { const n = capture + 1; setCapture(n < cameras.length ? n : -1); }}>Skip</button>
            <button className="sc-btn sc-ghost" onClick={() => setCapture(-1)}>Done</button>
          </div>
        </div>
      )}

      {open && (
        <div className="sc-grid">
          {cameras.map((c, i) => (
            <div key={`${c.floor}-${c.di}`} className={`sc-card${inCapture && i === capture ? " on" : ""}`}>
              <div className={`sc-thumb${c.photo ? " has" : ""}`}
                style={c.photo ? { backgroundImage: `url(${c.photo})` } : undefined}
                onClick={() => c.photo && setLightbox({ url: c.photo, name: label(c, i) })}>
                {!c.photo && (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                )}
                {c.tag && <span className="sc-tag">{c.tag}</span>}
              </div>
              <div className="sc-meta">
                <span className="sc-name">{label(c, i)}</span>
                <span className="sc-floor">{c.floorName}</span>
              </div>
              {!readOnly && (
                <div className="sc-actions">
                  <button className="sc-btn" disabled={busy === i} onClick={() => shoot(i, false)}>
                    {busy === i ? "…" : (c.photo ? "Replace" : "Add photo")}
                  </button>
                  {c.photo && <button className="sc-btn sc-ghost" disabled={busy === i} onClick={() => clearPhoto(i)}>Remove</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {err && <div className="sc-err">{err}</div>}

      {lightbox && (
        <div className="sc-lb" onClick={() => setLightbox(null)}>
          <button className="sc-lb-x" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>✕</button>
          <img src={lightbox.url} alt={lightbox.name} onClick={(e) => e.stopPropagation()} />
          <div className="sc-lb-cap">{lightbox.name}</div>
        </div>
      )}

      <style>{`
        .sc-wrap{margin-top:12px;border:1px solid var(--line,#e6e2d9);border-radius:12px;background:var(--bg-soft,#faf8f4);overflow:hidden}
        .sc-head{display:flex;align-items:center;gap:10px;width:100%;padding:11px 14px;background:none;border:0;cursor:pointer;font-family:inherit;color:var(--ink,#1a1a1a);text-align:left}
        .sc-chev{flex:none;transition:transform .15s;color:var(--muted,#6f7686)}
        .sc-chev.on{transform:rotate(90deg)}
        .sc-title{font-size:.82rem;font-weight:800;letter-spacing:.02em}
        .sc-count{font-size:.72rem;color:var(--muted,#6f7686);font-weight:600}
        .sc-cap{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:.74rem;font-weight:700;color:var(--gold-deep,#8a6d2f);border:1px solid var(--gold,#c9a96e);border-radius:8px;padding:5px 10px;cursor:pointer}
        .sc-cap:hover{background:rgba(201,169,110,.12)}
        .sc-capbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:11px 14px;border-top:1px solid var(--line,#e6e2d9);background:rgba(201,169,110,.08)}
        .sc-capnow{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
        .sc-capnow strong{font-size:.92rem;color:var(--ink,#1a1a1a)}
        .sc-capstep{font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-deep,#8a6d2f)}
        .sc-capfloor{font-size:.72rem;color:var(--muted,#6f7686)}
        .sc-capbtns{display:flex;gap:7px}
        .sc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:12px 14px}
        .sc-card{border:1px solid var(--line,#e6e2d9);border-radius:10px;overflow:hidden;background:#fff;display:flex;flex-direction:column}
        .sc-card.on{border-color:var(--gold,#c9a96e);box-shadow:0 0 0 2px rgba(201,169,110,.3)}
        .sc-thumb{position:relative;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;background:#eef0f3;color:#aab0ba;background-size:cover;background-position:center}
        .sc-thumb.has{cursor:zoom-in;color:transparent}
        .sc-tag{position:absolute;left:6px;top:6px;font-size:.64rem;font-weight:800;letter-spacing:.03em;color:#fff;background:var(--ink,#1a1a1a);border-radius:5px;padding:2px 6px}
        .sc-meta{display:flex;align-items:baseline;justify-content:space-between;gap:6px;padding:7px 9px 0}
        .sc-name{font-size:.78rem;font-weight:700;color:var(--ink,#1a1a1a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sc-floor{font-size:.66rem;color:var(--muted,#6f7686);flex:none}
        .sc-actions{display:flex;gap:6px;padding:8px 9px 9px}
        .sc-btn{flex:1;height:30px;padding:0 10px;border:1px solid var(--line,#d9d4c8);border-radius:7px;background:var(--bg-soft,#f5f2ea);color:var(--ink,#1a1a1a);font-size:.74rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
        .sc-btn:hover:not(:disabled){border-color:var(--gold,#c9a96e)}
        .sc-btn:disabled{opacity:.55;cursor:default}
        .sc-primary{background:var(--ink,#1a1a1a);color:#fff;border-color:var(--ink,#1a1a1a)}
        .sc-ghost{flex:0 0 auto;background:none}
        .sc-err{padding:8px 14px 12px;color:#c0392b;font-size:.74rem;font-weight:600}
        .sc-lb{position:fixed;inset:0;z-index:10000;background:rgba(16,17,18,.86);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px}
        .sc-lb img{max-width:100%;max-height:82vh;border-radius:10px;object-fit:contain}
        .sc-lb-x{position:absolute;top:16px;right:18px;width:38px;height:38px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:18px;cursor:pointer}
        .sc-lb-cap{color:#fff;font-size:.9rem;font-weight:700}
      `}</style>
    </div>
  );
}

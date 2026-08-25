"use client";
import { useState, useRef, useCallback } from "react";

// The survey device roster — moved OUTSIDE the tool so it never overlaps the map. It mirrors the live
// survey state (the iframe posts `iotSurveyDevices` on every change) and drives edits back over
// postMessage (`iotSurveyCmd`): rename, FOV, delete, view photo, select-on-map, and Rapid Capture. The
// current floor's devices are fully editable; other floors list read-only (tap to jump there). Photos
// upload to /api/media (HEIC-safe) then attach to the device. Customers never see this (office tool).
export default function SurveyDevices({ accessId, roster, curFloor, readOnly, cmd }) {
  const [open, setOpen] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [capture, setCapture] = useState(-1);     // rapid-capture index into the current floor's cameras
  const [lightbox, setLightbox] = useState(null);
  const [aiIds, setAiIds] = useState(() => new Set());  // cameras currently being AI-named
  const [aiAll, setAiAll] = useState(null);             // {done,total} while auto-naming every camera
  const fileRef = useRef(null);
  const targetRef = useRef(null);                  // device id the picker is aiming at

  const floors = Array.isArray(roster) ? roster : [];
  const total = floors.reduce((n, f) => n + (f.devices?.length || 0), 0);
  const curDevices = floors[curFloor]?.devices || [];
  const cams = curDevices.filter((d) => d.k === "cam");
  const label = (d, i) => (d.name && d.name.trim()) || d.tag || `${d.kind || "Device"} ${i + 1}`;

  const upload = useCallback(async (file) => {
    const fd = new FormData(); fd.append("file", file, file.name || "photo.jpg");
    fd.append("project", accessId); fd.append("kind", "survey-view");
    const j = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" }).then((r) => r.ok ? r.json() : null).catch(() => null);
    return j?.ok && j.url ? j.url : null;
  }, [accessId]);

  async function onPick(e) {
    const f = e.target.files?.[0]; const id = targetRef.current; e.target.value = "";
    if (!f || id == null) { if (capture >= 0) setCapture(-1); return; }
    setBusyId(id);
    const url = await upload(f);
    if (url) cmd({ cmd: "photo", id, photo: url });
    setBusyId(null);
    if (capture >= 0) { const next = capture + 1; setCapture(next < cams.length ? next : -1); }
  }
  function shoot(id, useCamera) {
    if (readOnly) return; targetRef.current = id;
    const inp = fileRef.current; if (!inp) return;
    if (useCamera) inp.setAttribute("capture", "environment"); else inp.removeAttribute("capture");
    inp.click();
  }

  // ---- AI auto-name ---------------------------------------------------------------------------
  // Read the camera's own photo (what it sees) and let Claude vision suggest a location label —
  // "Front Yard", "Driveway", "Garage". Saved via the same rename cmd, so it flows to the proposal.
  async function photoToBase64(url) {
    const blob = await fetch(url, { credentials: "same-origin" }).then((r) => r.blob());
    const mediaType = (blob.type && blob.type.startsWith("image/")) ? blob.type : "image/jpeg";
    const imageBase64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return { imageBase64, mediaType };
  }
  const nameOne = useCallback(async (d, existing) => {
    if (!d?.photo) return null;
    setAiIds((s) => new Set(s).add(d.id));
    try {
      const { imageBase64, mediaType } = await photoToBase64(d.photo);
      const floorName = (Array.isArray(roster) ? roster[curFloor]?.name : "") || "";
      const j = await fetch("/api/name-camera", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ imageBase64, mediaType, context: { floor: floorName, existing } }),
      }).then((r) => r.ok ? r.json() : null).catch(() => null);
      if (j?.ok && j.name) { cmd({ cmd: "rename", id: d.id, name: j.name }); return j.name; }
      return null;
    } catch { return null; }
    finally { setAiIds((s) => { const n = new Set(s); n.delete(d.id); return n; }); }
  }, [cmd, roster, curFloor]);
  async function nameAllCams() {
    if (aiAll) return;
    const targets = cams.filter((d) => d.photo);
    if (!targets.length) return;
    const existing = new Set(curDevices.map((d) => (d.name || "").trim()).filter(Boolean));
    setAiAll({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      const nm = await nameOne(targets[i], [...existing]);   // sequential so names dedupe as we go
      if (nm) existing.add(nm);
      setAiAll({ done: i + 1, total: targets.length });
    }
    setAiAll(null);
  }

  if (readOnly) return null;                        // office/field tool — customers see cameras in the survey view
  if (!total) return null;                          // render only when there's something to manage

  const inCapture = capture >= 0 && capture < cams.length;

  return (
    <div className="sd-wrap">
      <input ref={fileRef} type="file" accept="image/*,.heic,.heif,.HEIC,.HEIF" style={{ display: "none" }} onChange={onPick} />

      <button className="sd-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg className={`sd-chev${open ? " on" : ""}`} viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg>
        <span className="sd-title">Survey devices</span>
        <span className="sd-count">{total} device{total !== 1 ? "s" : ""}</span>
        {cams.some((d) => d.photo) && (
          <span className={`sd-ai-all${aiAll ? " busy" : ""}`} role="button" tabIndex={0}
            title="Name every photographed camera from its photo"
            onClick={(e) => { e.stopPropagation(); if (!aiAll) { setOpen(true); nameAllCams(); } }}>
            {aiAll
              ? <svg className="sd-spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>
              : <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" /><path d="M18.5 13l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></svg>}
            {aiAll ? `Naming… ${aiAll.done}/${aiAll.total}` : "Auto-name"}
          </span>
        )}
        {cams.length > 0 && !inCapture && (
          <span className="sd-cap" role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setOpen(true); setCapture(0); }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            Rapid capture
          </span>
        )}
      </button>

      {inCapture && (
        <div className="sd-capbar">
          <div className="sd-capnow"><span className="sd-capstep">{capture + 1} of {cams.length}</span><strong>{label(cams[capture], capture)}</strong></div>
          <div className="sd-capbtns">
            <button className="sd-btn sd-primary" disabled={busyId === cams[capture].id} onClick={() => shoot(cams[capture].id, true)}>{busyId === cams[capture].id ? "Saving…" : (cams[capture].photo ? "Retake" : "Take photo")}</button>
            <button className="sd-btn" onClick={() => { const n = capture + 1; setCapture(n < cams.length ? n : -1); }}>Skip</button>
            <button className="sd-btn sd-ghost" onClick={() => setCapture(-1)}>Done</button>
          </div>
        </div>
      )}

      {open && (
        <div className="sd-body">
          {floors.map((f, fi) => {
            const isCur = fi === curFloor;
            if (!f.devices?.length) return null;
            return (
              <div key={fi} className="sd-floor">
                {floors.length > 1 && (
                  <div className={`sd-fhead${isCur ? " cur" : ""}`} onClick={() => !isCur && cmd({ cmd: "floor", i: fi })}>
                    <span>{f.name}</span><span className="sd-fn">{f.devices.length}{!isCur && " · open"}</span>
                  </div>
                )}
                {isCur ? (
                  <div className="sd-grid">
                    {f.devices.map((d, i) => (
                      <div key={d.id ?? i} className="sd-card"
                        onMouseEnter={() => cmd({ cmd: "hover", id: d.id })}
                        onMouseLeave={() => cmd({ cmd: "hover", id: null })}>
                        <div className="sd-r1">
                          <span className="sd-chip" style={{ background: d.color }} title="Show on plan" onClick={() => cmd({ cmd: "select", id: d.id })}>{(d.tag || "").replace(/^I/, "") || (i + 1)}</span>
                          <input key={d.name} className="sd-nm" defaultValue={d.name} spellCheck={false}
                            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                            onBlur={(e) => { const v = e.target.value.trim(); if (v !== d.name) cmd({ cmd: "rename", id: d.id, name: v }); }} />
                          {d.k === "cam" && d.photo && (
                            <button className="sd-ai" title="Auto-name from photo" disabled={aiIds.has(d.id) || !!aiAll}
                              onClick={() => nameOne(d, curDevices.map((x) => (x.name || "").trim()).filter(Boolean))}>
                              {aiIds.has(d.id)
                                ? <svg className="sd-spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>
                                : <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" /><path d="M18.5 13l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></svg>}
                            </button>
                          )}
                          {confirmDel === d.id ? (
                            <span className="sd-confirm">
                              <button className="sd-del yes" onClick={() => { cmd({ cmd: "delete", id: d.id }); setConfirmDel(null); }}>Delete</button>
                              <button className="sd-del no" onClick={() => setConfirmDel(null)}>×</button>
                            </span>
                          ) : (
                            <button className="sd-x" title="Delete device" onClick={() => setConfirmDel(d.id)}>×</button>
                          )}
                        </div>
                        {d.k === "cam" && (
                          <div className="sd-pv">
                            {d.busy || busyId === d.id ? (
                              <button className="sd-btn" disabled>Adding photo…</button>
                            ) : d.photo ? (
                              <>
                                <span className="sd-thumb" style={{ backgroundImage: `url(${d.photo})` }} onClick={() => setLightbox({ url: d.photo, name: label(d, i) })} />
                                <button className="sd-btn" onClick={() => shoot(d.id, false)}>Replace</button>
                                <button className="sd-btn sd-ghost" onClick={() => cmd({ cmd: "clearPhoto", id: d.id })}>Remove</button>
                              </>
                            ) : (
                              <button className="sd-btn" onClick={() => shoot(d.id, false)}>+ View photo</button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="sd-others">
                    {f.devices.map((d, i) => (
                      <button key={i} className="sd-other" onClick={() => cmd({ cmd: "floor", i: fi })}>
                        <span className="sd-odot" style={{ background: d.color }} />{label(d, i)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {lightbox && (
        <div className="sd-lb" onClick={() => setLightbox(null)}>
          <button className="sd-lb-x" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>✕</button>
          <img src={lightbox.url} alt={lightbox.name} onClick={(e) => e.stopPropagation()} />
          <div className="sd-lb-cap">{lightbox.name}</div>
        </div>
      )}

      <style>{`
        .sd-wrap{margin-top:12px;border:1px solid var(--line,#e6e2d9);border-radius:12px;background:var(--bg-soft,#faf8f4);overflow:hidden}
        .sd-head{display:flex;align-items:center;gap:10px;width:100%;padding:11px 14px;background:none;border:0;cursor:pointer;font-family:inherit;color:var(--ink,#1a1a1a);text-align:left}
        .sd-chev{flex:none;transition:transform .15s;color:var(--muted,#6f7686)}.sd-chev.on{transform:rotate(90deg)}
        .sd-title{font-size:.82rem;font-weight:800;letter-spacing:.02em}
        .sd-count{font-size:.72rem;color:var(--muted,#6f7686);font-weight:600}
        .sd-cap{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:.74rem;font-weight:700;color:var(--gold-deep,#8a6d2f);border:1px solid var(--gold,#c9a96e);border-radius:8px;padding:5px 10px;cursor:pointer}
        .sd-cap:hover{background:rgba(201,169,110,.12)}
        .sd-ai-all{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:.74rem;font-weight:700;color:var(--gold-deep,#8a6d2f);border:1px solid var(--gold,#c9a96e);border-radius:8px;padding:5px 10px;cursor:pointer}
        .sd-ai-all:hover{background:rgba(201,169,110,.12)}
        .sd-ai-all.busy{opacity:.7;cursor:default}
        .sd-ai-all + .sd-cap{margin-left:0}
        .sd-ai{flex:none;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line,#e6e2d9);border-radius:6px;background:var(--bg-soft,#f5f2ea);color:var(--gold-deep,#8a6d2f);cursor:pointer;padding:0}
        .sd-ai:hover:not(:disabled){border-color:var(--gold,#c9a96e);background:rgba(201,169,110,.12)}
        .sd-ai:disabled{opacity:.55;cursor:default}
        .sd-spin{animation:sd-spin .7s linear infinite;transform-origin:center}
        @keyframes sd-spin{to{transform:rotate(360deg)}}
        .sd-capbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:11px 14px;border-top:1px solid var(--line,#e6e2d9);background:rgba(201,169,110,.08)}
        .sd-capnow{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.sd-capnow strong{font-size:.92rem}
        .sd-capstep{font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-deep,#8a6d2f)}
        .sd-capbtns{display:flex;gap:7px}
        .sd-body{padding:10px 14px 14px}
        .sd-floor+.sd-floor{margin-top:10px}
        .sd-fhead{display:flex;align-items:center;justify-content:space-between;font-size:.72rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#6f7686);padding:6px 2px;cursor:pointer}
        .sd-fhead.cur{color:var(--gold-deep,#8a6d2f);cursor:default}
        .sd-fn{font-weight:600}
        .sd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:9px}
        .sd-card{border:1px solid var(--line,#e6e2d9);border-radius:10px;background:#fff;padding:9px;transition:border-color .13s,box-shadow .13s,transform .13s}
        .sd-card:hover{border-color:var(--gold,#c9a96e);box-shadow:0 4px 14px rgba(201,169,110,.18);transform:translateY(-1px)}
        .sd-r1{display:flex;align-items:center;gap:7px}
        .sd-chip{flex:none;min-width:26px;height:22px;padding:0 6px;border-radius:6px;color:#fff;font-size:.68rem;font-weight:800;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:filter .12s,box-shadow .12s}
        .sd-chip:hover{filter:brightness(1.08);box-shadow:0 0 0 2px rgba(201,169,110,.4)}
        .sd-nm{flex:1;min-width:0;border:1px solid transparent;border-radius:6px;padding:5px 7px;font-size:.82rem;font-weight:600;color:var(--ink,#1a1a1a);font-family:inherit;background:var(--bg-soft,#f5f2ea)}
        .sd-nm:focus{outline:none;border-color:var(--gold,#c9a96e);background:#fff}
        .sd-x{flex:none;border:0;background:none;cursor:pointer;color:var(--muted,#6f7686);padding:4px;border-radius:6px;font-size:18px;line-height:1;width:26px;height:26px}.sd-x:hover{color:#c0392b}
        .sd-confirm{display:flex;align-items:center;gap:4px}
        .sd-del{border:1px solid var(--line,#d9d4c8);border-radius:6px;font-size:.72rem;font-weight:700;cursor:pointer;font-family:inherit;padding:4px 7px}
        .sd-del.yes{background:#c0392b;color:#fff;border-color:#c0392b}.sd-del.no{background:none;color:var(--muted,#6f7686);font-size:15px;line-height:1;padding:2px 6px}
        .sd-pv{display:flex;align-items:center;gap:7px;margin-top:8px}
        .sd-thumb{flex:none;width:42px;height:32px;border-radius:6px;background-size:cover;background-position:center;cursor:zoom-in;border:1px solid var(--line,#e6e2d9)}
        .sd-btn{height:30px;padding:0 10px;border:1px solid var(--line,#d9d4c8);border-radius:7px;background:var(--bg-soft,#f5f2ea);color:var(--ink,#1a1a1a);font-size:.74rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
        .sd-btn:hover:not(:disabled){border-color:var(--gold,#c9a96e)}.sd-btn:disabled{opacity:.55;cursor:default}
        .sd-primary{background:var(--ink,#1a1a1a);color:#fff;border-color:var(--ink,#1a1a1a)}
        .sd-ghost{background:none}
        .sd-others{display:flex;flex-wrap:wrap;gap:6px}
        .sd-other{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line,#e6e2d9);border-radius:8px;background:#fff;padding:5px 9px;font-size:.74rem;font-weight:600;color:var(--ink,#1a1a1a);cursor:pointer;font-family:inherit}
        .sd-other:hover{border-color:var(--gold,#c9a96e)}
        .sd-odot{width:8px;height:8px;border-radius:50%;flex:none}
        .sd-lb{position:fixed;inset:0;z-index:10000;background:rgba(16,17,18,.86);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px}
        .sd-lb img{max-width:100%;max-height:82vh;border-radius:10px;object-fit:contain}
        .sd-lb-x{position:absolute;top:16px;right:18px;width:38px;height:38px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:18px;cursor:pointer}
        .sd-lb-cap{color:#fff;font-size:.9rem;font-weight:700}
      `}</style>
    </div>
  );
}

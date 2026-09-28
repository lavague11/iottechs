"use client";
import { useState, useRef, useCallback } from "react";

// The survey device roster — moved OUTSIDE the tool so it never overlaps the map. It mirrors the live
// survey state (the iframe posts `iotSurveyDevices` on every change) and drives edits back over
// postMessage (`iotSurveyCmd`): rename, FOV, delete, view photo, select-on-map, and Rapid Capture. The
// current floor's devices are fully editable; other floors list read-only (tap to jump there). Photos
// upload to /api/media (HEIC-safe) then attach to the device. Customers never see this (office tool).
export default function SurveyDevices({ accessId, roster, curFloor, readOnly, locked, cmd }) {
  const [open, setOpen] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [capture, setCapture] = useState(-1);     // rapid-capture index into the current floor's cameras
  const [lightbox, setLightbox] = useState(null);
  const [editingId, setEditingId] = useState(null); // device whose name is being edited inline
  const [menuId, setMenuId] = useState(null);       // device whose ⋯ menu is open
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
        <span className="sd-title">Devices</span>
        <span className="sd-count">{total} device{total !== 1 ? "s" : ""}</span>
        {locked && <span className="sd-locked" title="Unsubmit the survey to edit"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>Submitted</span>}
        {!locked && cams.some((d) => d.photo) && (
          <span className={`sd-ai-all${aiAll ? " busy" : ""}`} role="button" tabIndex={0}
            title="Name every photographed camera from its photo"
            onClick={(e) => { e.stopPropagation(); if (!aiAll) { setOpen(true); nameAllCams(); } }}>
            {aiAll
              ? <svg className="sd-spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>
              : <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" /><path d="M18.5 13l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></svg>}
            {aiAll ? `Naming… ${aiAll.done}/${aiAll.total}` : "Auto-name"}
          </span>
        )}
        {!locked && cams.length > 0 && !inCapture && (
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
                    {f.devices.map((d, i) => {
                      const isCam = d.k === "cam";
                      const nm = label(d, i);
                      const busy = d.busy || busyId === d.id;
                      const editing = editingId === d.id;
                      const menuOpen = menuId === d.id;
                      const tapTile = () => {
                        if (isCam && d.photo) setLightbox({ url: d.photo, name: nm });
                        else if (isCam && !locked) shoot(d.id, false);
                        else cmd({ cmd: "select", id: d.id });   // non-camera or submitted → highlight on plan
                      };
                      return (
                        <div key={d.id ?? i} className="sd-card"
                          onMouseEnter={() => cmd({ cmd: "hover", id: d.id })}
                          onMouseLeave={() => cmd({ cmd: "hover", id: null })}>
                          <div className={`sd-tile${isCam && d.photo ? " has" : ""}`} onClick={tapTile}
                            title={isCam ? (d.photo ? "View photo" : "Add photo") : "Show on plan"}>
                            <span className="sd-badge" style={{ background: d.color }} title="Show on plan"
                              onClick={(e) => { e.stopPropagation(); cmd({ cmd: "select", id: d.id }); }}>{d.tag || (i + 1)}</span>
                            {busy ? (
                              <span className="sd-tile-msg"><svg className="sd-spin" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg></span>
                            ) : isCam && d.photo ? (
                              <img className="sd-img" src={d.photo} alt={nm} loading="lazy" />
                            ) : isCam ? (
                              <span className="sd-add">
                                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                                <b>{locked ? "No photo" : "Add photo"}</b>
                              </span>
                            ) : (
                              <span className="sd-dev-ph" style={{ color: d.color }}>
                                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" /><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" /></svg>
                              </span>
                            )}
                          </div>
                          <div className="sd-foot">
                            {editing && !locked ? (
                              <input className="sd-nm-in" autoFocus defaultValue={d.name} spellCheck={false}
                                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = d.name || ""; e.currentTarget.blur(); } }}
                                onBlur={(e) => { const v = e.target.value.trim(); if (v !== d.name) cmd({ cmd: "rename", id: d.id, name: v }); setEditingId(null); }} />
                            ) : (
                              <span className="sd-nm-txt" title={nm} onClick={() => { if (!locked) setEditingId(d.id); }}>{nm}</span>
                            )}
                            {!locked && (
                              <div className="sd-menuwrap">
                                <button className="sd-more" title="More" aria-label={`${nm} options`} onClick={() => { setMenuId(menuOpen ? null : d.id); setConfirmDel(null); }}>
                                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                                </button>
                                {menuOpen && (
                                  <div className="sd-menu" role="menu">
                                    <button onClick={() => { setEditingId(d.id); setMenuId(null); }}>Rename</button>
                                    {isCam && <button onClick={() => { shoot(d.id, false); setMenuId(null); }}>{d.photo ? "Replace photo" : "Add photo"}</button>}
                                    {isCam && d.photo && <button disabled={aiIds.has(d.id) || !!aiAll} onClick={() => { nameOne(d, curDevices.map((x) => (x.name || "").trim()).filter(Boolean)); setMenuId(null); }}>Auto-name</button>}
                                    {isCam && d.photo && <button onClick={() => { cmd({ cmd: "clearPhoto", id: d.id }); setMenuId(null); }}>Remove photo</button>}
                                    {confirmDel === d.id ? (
                                      <button className="danger" onClick={() => { cmd({ cmd: "delete", id: d.id }); setMenuId(null); setConfirmDel(null); }}>Confirm delete</button>
                                    ) : (
                                      <button className="danger" onClick={() => setConfirmDel(d.id)}>Delete device</button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
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

      {menuId != null && <div className="sd-scrim" onClick={() => { setMenuId(null); setConfirmDel(null); }} />}

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
        /* Photo-first device grid: 2 columns on mobile, more where there's room. The photo IS the card. */
        .sd-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        @media(min-width:560px){.sd-grid{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}}
        .sd-card{border:1px solid var(--line,#e6e2d9);border-radius:11px;background:#fff;overflow:hidden;transition:border-color .13s,box-shadow .13s,transform .13s}
        .sd-card:hover{border-color:var(--gold,#c9a96e);box-shadow:0 4px 14px rgba(201,169,110,.18);transform:translateY(-1px)}
        .sd-tile{position:relative;aspect-ratio:4/3;width:100%;background:var(--bg-soft,#f1eee7);display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden}
        .sd-img{width:100%;height:100%;object-fit:cover;display:block}
        .sd-badge{position:absolute;top:6px;left:6px;z-index:2;min-width:24px;height:20px;padding:0 6px;border-radius:6px;color:#fff;font-size:.66rem;font-weight:800;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35)}
        .sd-badge:hover{filter:brightness(1.08)}
        .sd-add{display:flex;flex-direction:column;align-items:center;gap:5px;color:var(--gold-deep,#8a6d2f)}
        .sd-add b{font-size:.74rem;font-weight:700}
        .sd-dev-ph{display:flex;align-items:center;justify-content:center;opacity:.85}
        .sd-tile-msg{color:var(--muted,#6f7686)}
        .sd-foot{display:flex;align-items:center;gap:4px;padding:7px 8px 7px 10px}
        .sd-nm-txt{flex:1;min-width:0;font-size:.8rem;font-weight:600;color:var(--ink,#1a1a1a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:text}
        .sd-nm-in{flex:1;min-width:0;border:1px solid var(--gold,#c9a96e);border-radius:6px;padding:4px 6px;font-size:.8rem;font-weight:600;color:var(--ink,#1a1a1a);font-family:inherit;background:#fff}
        .sd-nm-in:focus{outline:none}
        .sd-menuwrap{position:relative;flex:none}
        .sd-more{flex:none;border:0;background:none;cursor:pointer;color:var(--muted,#6f7686);width:28px;height:28px;border-radius:7px;display:grid;place-items:center}
        .sd-more:hover{background:var(--bg-soft,#f5f2ea);color:var(--ink,#1a1a1a)}
        .sd-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:20;background:#fff;border:1px solid var(--line,#e6e2d9);border-radius:10px;box-shadow:0 14px 34px -12px rgba(14,19,32,.4);padding:5px;min-width:150px;display:flex;flex-direction:column}
        .sd-menu button{text-align:left;background:none;border:0;font:inherit;font-size:.8rem;font-weight:600;color:var(--ink,#1a1a1a);padding:9px 11px;border-radius:7px;cursor:pointer}
        .sd-menu button:hover{background:var(--bg-soft,#f5f2ea)}
        .sd-menu button.danger{color:#c0392b}
        .sd-menu button:disabled{opacity:.5;cursor:default}
        .sd-scrim{position:fixed;inset:0;z-index:15}
        .sd-locked{display:inline-flex;align-items:center;gap:5px;font-size:.68rem;font-weight:700;letter-spacing:.02em;color:var(--muted,#6f7686);background:var(--bg-soft,#f5f2ea);border:1px solid var(--line,#e6e2d9);border-radius:100px;padding:3px 9px;margin-left:auto}
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

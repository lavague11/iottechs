"use client";
import { useEffect, useState } from "react";
import { listInstallPhotosAction, voidInstallPhotoAction } from "./actions";

// Install photos — the work order's evidence strip. Uploads go to the media table tagged kind
// "install" (the lifecycle fact `install_photos` counts exactly these). Void = archive, never delete.
const Cam = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;

export function InstallPhotosButton({ count = 0, open, onClick }) {
  return (
    <button type="button" className={`iss-flagbtn${open ? " on" : ""}`} onClick={onClick} title="Photos" aria-label={count ? `${count} install photos` : "Photos"}>
      <Cam />{count > 0 && <span className="iss-flagn">{count}</span>}
    </button>
  );
}

export function InstallPhotos({ accessId, role, canEdit, onChange }) {
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const canVoid = ["admin", "manager"].includes(role);
  const load = () => listInstallPhotosAction(accessId).then((r) => { if (r?.ok) { setPhotos(r.photos || []); onChange?.(r.photos || []); } }).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [accessId]);

  async function upload(files) {
    const list = [...(files || [])];
    if (!list.length) return;
    setBusy(true); setErr(null);
    for (const f of list) {
      try {
        const fd = new FormData(); fd.append("file", f); fd.append("project", accessId); fd.append("kind", "install");
        const r = await fetch("/api/media", { method: "POST", body: fd }).then((x) => x.json());
        if (!r?.ok) throw new Error(r?.error || "upload failed");
      } catch (e) { setErr(String(e.message || e)); }
    }
    setBusy(false);
    load();
  }
  async function voidPhoto(id) {
    setBusy(true); setErr(null);
    const r = await voidInstallPhotoAction(accessId, id);
    setBusy(false); setConfirm(null);
    if (r?.error) { setErr(r.error); return; }
    load();
  }

  return (
    <div className="iph">
      {err && <div className="iss-err" style={{ margin: "0 0 8px" }}>{err}</div>}
      <div className="iph-grid">
        {photos.map((p) => (
          <div key={p.id} className="iph-cell">
            <a href={`/api/media/${p.id}`} target="_blank" rel="noopener"><img src={`/api/media/${p.id}`} alt="" loading="lazy" /></a>
            {canVoid && (confirm === p.id
              ? <button type="button" className="iph-void confirm" disabled={busy} onClick={() => voidPhoto(p.id)} title="Void">Void?</button>
              : <button type="button" className="iph-void" disabled={busy} onClick={() => setConfirm(p.id)} title="Void" aria-label="Void photo">×</button>)}
          </div>
        ))}
        {canEdit && (
          <label className={`iph-add${busy ? " busy" : ""}`} title="Add photos">
            <Cam />
            <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
        )}
        {!photos.length && !canEdit && <div className="iss-empty" style={{ padding: 8 }}>No photos</div>}
      </div>
    </div>
  );
}

export const PHOTOS_CSS = `
.iph{margin:10px 0 4px}
.iph-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px}
.iph-cell{position:relative;aspect-ratio:1;border-radius:9px;overflow:hidden;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-paper,#F4F4F2)}
.iph-cell img{width:100%;height:100%;object-fit:cover;display:block}
.iph-void{position:absolute;top:4px;right:4px;width:24px;height:24px;border:none;border-radius:6px;background:rgba(16,20,24,.72);color:#fff;font-size:.9rem;line-height:1;cursor:pointer;display:grid;place-items:center}
.iph-void.confirm{width:auto;padding:0 8px;font-size:.7rem;font-weight:700;background:var(--dv-red,#C4553D)}
.iph-add{aspect-ratio:1;border:1.5px dashed var(--dv-line,#E4E4DF);border-radius:9px;display:grid;place-items:center;color:var(--dv-meta,#787D84);cursor:pointer;background:#fff}
.iph-add:hover{color:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418)}
.iph-add.busy{opacity:.5;pointer-events:none}
.iss-flagbtn.on{background:var(--dv-paper,#F4F4F2);color:var(--dv-ink,#101418)}
`;

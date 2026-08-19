"use client";

import { useState, useRef } from "react";

// Self-contained DB migration console. No app session required — Download works for a signed-in admin
// or with the migration secret; Restore always requires the secret (and MIGRATION_SECRET set server-side).
export default function MigrateClient({ restoreEnabled = false }) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);   // { ok:boolean, text:string }
  const fileRef = useRef(null);

  async function download() {
    setMsg(null); setBusy(true);
    try {
      const r = await fetch("/api/admin/db-export", { headers: secret ? { "x-migrate-secret": secret } : {} });
      if (!r.ok) { setMsg({ ok: false, text: r.status === 401 ? "Not authorized — sign in as admin or enter the migration secret." : `Download failed (${r.status}).` }); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url; a.download = `dashboard-${stamp}.db`; a.click();
      URL.revokeObjectURL(url);
      setMsg({ ok: true, text: "Database downloaded. Keep this file — you'll upload it on the new instance." });
    } catch (e) { setMsg({ ok: false, text: "Download error: " + (e?.message || e) }); }
    finally { setBusy(false); }
  }

  async function restore() {
    setMsg(null);
    const file = fileRef.current?.files?.[0];
    if (!secret) { setMsg({ ok: false, text: "Enter the migration secret." }); return; }
    if (!file)   { setMsg({ ok: false, text: "Choose a .db file to upload." }); return; }
    if (!window.confirm("This OVERWRITES the database on THIS instance with the uploaded file, then restarts the app. Continue?")) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("secret", secret);
      fd.append("file", file);
      const r = await fetch("/api/admin/db-restore", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setMsg({ ok: false, text: j.error || `Restore failed (${r.status}).` }); return; }
      setMsg({ ok: true, text: j.note || "Restored. The app is restarting." });
    } catch (e) { setMsg({ ok: false, text: "Restore error: " + (e?.message || e) }); }
    finally { setBusy(false); }
  }

  return (
    <div className="mg">
      <style>{CSS}</style>
      <div className="mg-card">
        <div className="mg-h">Database migration</div>
        <p className="mg-sub">Move your live data to a new host. Download it here on the old site, then upload it on the new one.</p>

        <label className="mg-lbl">Migration secret</label>
        <input className="mg-in" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="MIGRATION_SECRET" autoComplete="off" />
        <div className="mg-hint">Optional for Download if you're signed in as admin. Required for Restore (and MIGRATION_SECRET must be set on this instance).</div>

        <div className="mg-sec">
          <div className="mg-sec-h">1 · Download (on the OLD site)</div>
          <button className="mg-btn" onClick={download} disabled={busy}>{busy ? "Working…" : "Download database"}</button>
        </div>

        <div className="mg-sec">
          <div className="mg-sec-h">2 · Restore (on the NEW site)</div>
          {restoreEnabled
            ? <div className="mg-ok-badge">Restore is enabled on this instance.</div>
            : <div className="mg-off-badge">Restore is disabled — set <b>MIGRATION_SECRET</b> in this instance's environment to enable it, then remove it after.</div>}
          <input ref={fileRef} className="mg-file" type="file" accept=".db,application/octet-stream" />
          <button className="mg-btn danger" onClick={restore} disabled={busy}>{busy ? "Working…" : "Upload & restore"}</button>
        </div>

        {msg && <div className={`mg-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
        <div className="mg-foot">Remove MIGRATION_SECRET from the environment when you're done.</div>
      </div>
    </div>
  );
}

const CSS = `
.mg{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(1000px 600px at 50% -10%,#12161f,#0b0f19);color:#f4f2ee;font-family:'Inter',system-ui,sans-serif}
.mg-card{width:100%;max-width:460px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.09);border-radius:18px;padding:26px 24px}
.mg-h{font-family:'Bricolage Grotesque',sans-serif;font-size:1.35rem;font-weight:800}
.mg-sub{font-size:.88rem;color:#b4b1a8;margin:6px 0 18px;line-height:1.5}
.mg-lbl{display:block;font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8b8880;margin-bottom:6px}
.mg-in{width:100%;height:44px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.28);color:#fff;border-radius:10px;padding:0 13px;font-size:.95rem;outline:none}
.mg-in:focus{border-color:#C9A96E}
.mg-hint{font-size:.76rem;color:#8b8880;margin-top:6px;line-height:1.45}
.mg-sec{margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08)}
.mg-sec-h{font-size:.8rem;font-weight:800;color:#C9A96E;margin-bottom:10px}
.mg-file{width:100%;font-size:.84rem;color:#b4b1a8;margin-bottom:11px}
.mg-btn{width:100%;height:46px;border:none;border-radius:11px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.95rem;font-weight:800;cursor:pointer;font-family:inherit}
.mg-btn:disabled{opacity:.5;cursor:default}
.mg-btn.danger{background:linear-gradient(180deg,#e88a6a,#c0563a);color:#fff}
.mg-ok-badge{font-size:.8rem;color:#8bd3a0;margin-bottom:10px;font-weight:600}
.mg-off-badge{font-size:.8rem;color:#e0b483;background:rgba(224,180,131,.1);border:1px solid rgba(224,180,131,.28);border-radius:9px;padding:9px 11px;margin-bottom:11px;line-height:1.45}
.mg-msg{margin-top:16px;font-size:.86rem;font-weight:600;border-radius:10px;padding:10px 13px;line-height:1.45}
.mg-msg.ok{background:rgba(120,211,160,.12);border:1px solid rgba(120,211,160,.3);color:#8bd3a0}
.mg-msg.err{background:rgba(224,90,90,.12);border:1px solid rgba(224,90,90,.3);color:#f0a58f}
.mg-foot{margin-top:18px;font-size:.75rem;color:#6b6862;text-align:center}
`;
